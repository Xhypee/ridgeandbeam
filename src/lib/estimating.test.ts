import { describe, expect, it } from "vitest";
import { effectiveOptionId, estimateTotals, itemsForOption, marginExGst } from "./estimate-totals";
import { allowedCatalog, buildLines, isLegacyItem, pick, priceIn, resolvePriceBook, type CatalogRow } from "./estimating";
import { DEFAULT_MEASUREMENTS, takeoff, type Measurements, type ProfileOverride } from "./roof";
import type { PriceRow } from "./suppliers";

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  id: Math.random().toString(36), calc_key: null, name: "x", unit: "ea", unit_price: 10, unit_cost: 5, category: "material",
  tier: null, warranty: null, requires_certification: null, price_inc_gst: true, ...over,
});

const catalog: CatalogRow[] = [
  row({ id: "good", calc_key: "metal_sheet", tier: "good", name: "ZINCALUME Custom Orb 0.42", unit: "lm", profile: "custom_orb", finish: "ZINCALUME", cover_width_mm: 762, unit_price: 22, unit_cost: 14 }),
  row({ id: "better", calc_key: "metal_sheet", tier: "better", name: "COLORBOND Trimdek 0.42", unit: "lm", profile: "trimdek", finish: "COLORBOND", cover_width_mm: 762, unit_price: 27.5, unit_cost: 17 }),
  row({ id: "best", calc_key: "metal_sheet", tier: "best", name: "COLORBOND Klip-Lok 700 0.48", unit: "lm", profile: "klip_lok", finish: "COLORBOND", cover_width_mm: 700, unit_price: 38.5, unit_cost: 24, warranty: "Ask about BlueScope's warranty for your site" }),
  row({ id: "inst", calc_key: "labour_install", name: "Installation labour", unit: "m2", unit_price: 33, unit_cost: 20, category: "labor" }),
  row({ id: "screw", calc_key: "roof_screws", name: "Roofing screws", unit: "box", unit_price: 110, unit_cost: 70 }),
];
const job: Measurements = {
  ...DEFAULT_MEASUREMENTS, jobType: "reroof", existingRoof: "none", includeSarking: false, includeSafetyMesh: false, includeEdgeProtection: false,
  sections: [
    { label: "Front", area: 60, pitch: 22.5, system: "metal", profile: "custom_orb", runLength: 6.5, width: 10 },
    { label: "Back", area: 60, pitch: 22.5, system: "metal", profile: "custom_orb", runLength: 6.5, width: 10 },
  ],
};
const rows = takeoff(job);
const rowsFor = (o: ProfileOverride) => takeoff(job, { profileOverride: o });
const opts = [{ key: "g", tier: "good" as const }, { key: "b", tier: "better" as const }, { key: "c", tier: "best" as const }];

describe("buildLines (good / better / best)", () => {
  const r = buildLines(rows, catalog, opts, { rowsFor });
  it("one sheet line per option, re-cut for Klip-Lok's 700 mm cover", () => {
    const sheets = r.items.filter((i) => i.calc_key === "metal_sheet").map((i) => [i.option_key, i.description, i.quantity, i.unit_price]);
    expect(sheets).toEqual([
      ["g", "ZINCALUME Custom Orb 0.42", 183.4, 22], // 2 × 14 sheets × 6.55 m
      ["b", "COLORBOND Trimdek 0.42", 183.4, 27.5],
      ["c", "COLORBOND Klip-Lok 700 0.48", 196.5, 38.5], // 2 × 15 sheets × 6.55 m
    ]);
  });
  it("identical lines are shared", () => {
    // screws: Good/Better 1260, Best 1350 -> all 3 boxes of 500 -> one shared line
    expect(r.items.filter((i) => i.calc_key === "roof_screws").map((i) => [i.option_key, i.quantity])).toEqual([[null, 3]]);
    expect(r.items.filter((i) => i.calc_key === "labour_install").map((i) => i.option_key)).toEqual([null]);
  });
  it("reports keys with no price-book item and passes warranty text", () => {
    expect(r.missing).toEqual([]);
    const withSarking = { ...job, includeSarking: true };
    expect(buildLines(takeoff(withSarking), catalog, opts, { rowsFor: (o) => takeoff(withSarking, { profileOverride: o }) }).missing).toEqual(["sarking"]);
    expect(r.warranties).toEqual({ c: "Ask about BlueScope's warranty for your site" });
  });
  it("without options picks the sheet matching the section profile", () => {
    const one = buildLines(rows, catalog, []);
    expect(one.items.find((i) => i.calc_key === "metal_sheet")?.description).toBe("ZINCALUME Custom Orb 0.42");
    const tri = buildLines(takeoff({ ...job, sections: job.sections.map((s) => ({ ...s, profile: "trimdek" as const })) }), catalog, []);
    expect(tri.items.find((i) => i.calc_key === "metal_sheet")?.description).toBe("COLORBOND Trimdek 0.42");
    expect(one.items.every((i) => i.option_key === null)).toBe(true);
  });
  it("converts prices to the estimate's GST convention", () => {
    const ex = buildLines(rows, [row({ id: "i", calc_key: "labour_install", unit_price: 30, price_inc_gst: false })], [], { mode: { inclusive: true, gstRatePct: 10 } });
    expect(ex.items[0].unit_price).toBe(33);
    expect(ex.missing).toContain("metal_sheet");
  });
});

describe("pick", () => {
  it("tier first, then untiered", () => {
    const c = [row({ id: "u", tier: null }), row({ id: "b", tier: "better" })];
    expect(pick(c, "better")?.id).toBe("b");
    expect(pick(c, "best")?.id).toBe("u");
    expect(pick([row({ id: "b", tier: "better" })], "good")).toBeUndefined();
    expect(pick([row({ id: "a", tier: "good" }), row({ id: "b", tier: "better" })], null)?.id).toBe("b");
  });
});

describe("prices, suppliers and legacy items", () => {
  it("priceIn converts between inc and ex GST", () => {
    expect(priceIn({ unit_price: 100, price_inc_gst: false }, { inclusive: true, gstRatePct: 10 })).toBe(110);
    expect(priceIn({ unit_price: 110, price_inc_gst: true }, { inclusive: false, gstRatePct: 10 })).toBe(100);
    expect(priceIn({ unit_price: 110, price_inc_gst: true }, { inclusive: true, gstRatePct: 10 })).toBe(110);
  });
  const sp = (over: Partial<PriceRow>): PriceRow => ({ calc_key: "metal_sheet", name: "x", unit: "lm", unit_cost_ex_gst: 20, unit_price_inc_gst: 29.7, supplier_price_item_id: Math.random().toString(36), product_code: null, pack_qty: null, ...over });
  it("supplier rows replace matching price-book prices (same profile + finish) and fill gaps", () => {
    const supplier = [
      sp({ name: "Trimdek 0.42 COLORBOND Monument", profile: "Trimdek", finish: "COLORBOND Monument", supplier_price_item_id: "t1", product_code: "TD42M" }),
      sp({ name: "Custom Orb 0.42 COLORBOND Surfmist", profile: "Custom Orb", finish: "COLORBOND Surfmist", supplier_price_item_id: "c1" }),
      sp({ calc_key: "sarking", name: "Thermoseal sarking roll", unit: "roll", unit_cost_ex_gst: 100, unit_price_inc_gst: 148.5, supplier_price_item_id: "s1" }),
      sp({ calc_key: "labour_install", name: "Install", unit: "m2", unit_cost_ex_gst: 25, unit_price_inc_gst: 27.5, supplier_price_item_id: "l1" }),
    ];
    const r = resolvePriceBook(catalog, supplier);
    const by = (id: string) => r.find((x) => x.id === id)!;
    expect(by("better")).toMatchObject({ name: "Trimdek 0.42 COLORBOND Monument", unit_price: 29.7, unit_cost: 20, supplier_price_item_id: "t1", product_code: "TD42M", tier: "better" });
    expect(by("good").supplier_price_item_id ?? null).toBeNull(); // ZINCALUME Custom Orb: the COLORBOND Custom Orb row is a different finish
    expect(by("inst")).toMatchObject({ unit_price: 27.5, supplier_price_item_id: "l1" });
    expect(r.find((x) => x.calc_key === "sarking")).toMatchObject({ id: "spi:s1", unit_price: 148.5, tier: null });
    expect(resolvePriceBook(catalog, [])).toBe(catalog);
  });
  it("legacy (US) keys are flagged, AU and custom items are not", () => {
    expect(isLegacyItem({ calc_key: "shingles" })).toBe(true);
    expect(isLegacyItem({ calc_key: "metal_sheet" })).toBe(false);
    expect(isLegacyItem({ calc_key: "membrane_roof" })).toBe(false);
    expect(isLegacyItem({ calc_key: null })).toBe(false);
  });
  it("certification-gated legacy items stay hidden without the certification", () => {
    expect(allowedCatalog([row({ requires_certification: "GAF Master Elite" }), row({})], [])).toHaveLength(1);
  });
});

describe("GST totals", () => {
  it("GST-inclusive: GST is 1/11 of the total", () => {
    expect(estimateTotals([{ quantity: 10, unit_price: 110 }], 0, 10, true)).toEqual({ subtotal: 1100, discount: 0, gst: 100, exGst: 1000, total: 1100 });
    expect(estimateTotals([{ quantity: 10, unit_price: 110 }], 110, 10, true)).toEqual({ subtotal: 1100, discount: 110, gst: 90, exGst: 900, total: 990 });
  });
  it("ex-GST estimates add GST on top; not registered = no GST", () => {
    expect(estimateTotals([{ quantity: 10, unit_price: 100 }], 0, 10, false)).toEqual({ subtotal: 1000, discount: 0, gst: 100, exGst: 1000, total: 1100 });
    expect(estimateTotals([{ quantity: 1, unit_price: 500 }], 0, 0, true)).toMatchObject({ gst: 0, total: 500 });
  });
  it("margin is on the ex-GST sell price", () => {
    // sell $1,100 inc GST = $1,000 ex; cost $600 ex -> $400 profit, 40%
    expect(marginExGst([{ quantity: 1, unit_price: 1100, unit_cost: 600 }], 0, 10, true)).toEqual({ sell: 1000, cost: 600, profit: 400, pct: 40 });
    expect(marginExGst([{ quantity: 1, unit_price: 1000, unit_cost: 600 }], 0, 10, false).pct).toBe(40);
  });
});

describe("option totals helpers", () => {
  const options = [{ id: "a", position: 0, recommended: false }, { id: "b", position: 1, recommended: true }, { id: "c", position: 2 }];
  it("picks selected, then recommended, then first", () => {
    expect(effectiveOptionId(options, "c")).toBe("c");
    expect(effectiveOptionId(options, null)).toBe("b");
    expect(effectiveOptionId([{ id: "x", position: 1 }, { id: "y", position: 0 }], null)).toBe("y");
    expect(effectiveOptionId([], "c")).toBeNull();
  });
  it("includes shared lines plus the option's lines", () => {
    const items = [{ option_id: null, n: 1 }, { option_id: "a", n: 2 }, { option_id: "b", n: 3 }];
    expect(itemsForOption(items, "b").map((i) => i.n)).toEqual([1, 3]);
    expect(itemsForOption(items, null)).toHaveLength(3);
  });
});
