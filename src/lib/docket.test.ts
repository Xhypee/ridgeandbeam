import { describe, expect, it } from "vitest";
import { ICON_FOR_KEY, ICONS, iconFor } from "@/components/item-icons";
import { CALC_KEYS } from "./calc-keys";
import {
  COLOURS, DEFAULT_EXTRA_KEYS, docketTakeoff, docketTotals, docketView, extraKeySet, extraStatusFor, fillQuoteLines, isExtraItem, pickSheet, qtyText,
  roofFacts, roofTitle, sectionsProfile, setExtra, sheetDescription, switchColour, switchProfile,
} from "./docket";
import { GENERIC_ROOF, roofShape, roofShapeFromPlan } from "./docket-shape";
import { estimateTotals, itemsForOption } from "./estimate-totals";
import type { CatalogRow, DraftItem } from "./estimating";
import { DEFAULT_MEASUREMENTS, type Measurements } from "./roof";

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  id: Math.random().toString(36), calc_key: null, name: "x", unit: "ea", unit_price: 10, unit_cost: 5, category: "material",
  tier: null, warranty: null, price_inc_gst: true, ...over,
});
const book: CatalogRow[] = [
  row({ calc_key: "metal_sheet", tier: "good", name: "ZINCALUME Custom Orb 0.42 BMT", unit: "lm", profile: "custom_orb", finish: "ZINCALUME", cover_width_mm: 762, unit_price: 22 }),
  row({ calc_key: "metal_sheet", tier: "better", name: "COLORBOND Trimdek 0.42 BMT", unit: "lm", profile: "trimdek", finish: "COLORBOND", cover_width_mm: 762, unit_price: 27.5 }),
  row({ calc_key: "metal_sheet", tier: "best", name: "COLORBOND Klip-Lok 700 0.48 BMT", unit: "lm", profile: "klip_lok", finish: "COLORBOND", cover_width_mm: 700, unit_price: 38.5 }),
  row({ calc_key: "labour_install", name: "Installation labour", unit: "m2", unit_price: 33, category: "labor" }),
  row({ calc_key: "labour_strip", name: "Strip & dispose of old roof", unit: "m2", unit_price: 22, category: "labor" }),
  row({ calc_key: "roof_screws", name: "Roofing screws (box)", unit: "box", unit_price: 110 }),
  row({ calc_key: "ridge_capping", name: "Ridge & hip capping", unit: "lm", unit_price: 25 }),
  row({ calc_key: "sarking", name: "Sarking (roll)", unit: "roll", unit_price: 165 }),
  row({ calc_key: "safety_mesh", name: "Safety mesh (roll)", unit: "roll", unit_price: 220 }),
  row({ calc_key: "gutter", name: "Gutter", unit: "lm", unit_price: 35 }),
  row({ calc_key: "downpipe", name: "Downpipe", unit: "ea", unit_price: 88 }),
  row({ calc_key: "fascia", name: "Fascia", unit: "lm", unit_price: 22 }),
  row({ calc_key: "edge_protection", name: "Edge protection / scaffold", unit: "job", unit_price: 880, category: "other" }),
  row({ calc_key: "whirlybird", name: "Whirlybird roof vent", unit: "ea", unit_price: 165 }),
  row({ calc_key: "skip_bin", name: "Skip bin", unit: "ea", unit_price: 550, category: "other" }),
];
const job: Measurements = {
  ...DEFAULT_MEASUREMENTS, jobType: "reroof", existingRoof: "tile", ridge: 10, eave: 20, downpipes: 4,
  includeSarking: true, includeSafetyMesh: false, includeGutters: false, includeEdgeProtection: true, includeSkip: true,
  sections: [
    { label: "Front", area: 60, pitch: 22.5, system: "metal", profile: "custom_orb", runLength: 6.5, width: 10 },
    { label: "Back", area: 60, pitch: 22.5, system: "metal", profile: "custom_orb", runLength: 6.5, width: 10 },
  ],
};
const mode = { inclusive: true, gstRatePct: 10 };

describe("which items are extras", () => {
  it("defaults by calc key, overridden by the price book", () => {
    expect([...DEFAULT_EXTRA_KEYS].sort()).toEqual(["downpipe", "edge_protection", "fascia", "gutter", "safety_mesh", "sarking", "skip_bin", "whirlybird"]);
    expect(isExtraItem({ calc_key: "sarking", is_extra: null })).toBe(true);
    expect(isExtraItem({ calc_key: "sarking", is_extra: false })).toBe(false);
    expect(isExtraItem({ calc_key: "labour_install" })).toBe(false);
    expect(isExtraItem({ calc_key: null, is_extra: true })).toBe(true);
    const keys = extraKeySet([{ calc_key: "sarking", is_extra: false }, { calc_key: "labour_steep", is_extra: true }]);
    expect(keys.has("sarking")).toBe(false);
    expect(keys.has("labour_steep")).toBe(true);
    expect(keys.has("gutter")).toBe(true);
  });
  it("status follows the include switch, else what it was", () => {
    expect(extraStatusFor("sarking", job, [])).toBe("added");
    expect(extraStatusFor("safety_mesh", job, [])).toBe("offered");
    expect(extraStatusFor("whirlybird", job, [])).toBe("offered");
    expect(extraStatusFor("whirlybird", job, [{ calc_key: "whirlybird", extra_status: "added" }])).toBe("added");
    expect(extraStatusFor("whirlybird", job, [{ calc_key: "whirlybird", extra_status: null }])).toBe("added");
  });
});

describe("filling the docket from the measurements", () => {
  const r = fillQuoteLines({ m: job, book, mode, colour: "Surfmist" });
  const by = (k: string) => r.items.find((i) => i.calc_key === k)!;
  it("main lines, added extras and offered extras", () => {
    expect(by("metal_sheet").extra_status).toBeNull();
    expect(by("metal_sheet").description).toBe("ZINCALUME Custom Orb 0.42 BMT · Surfmist");
    expect(by("labour_install").extra_status).toBeNull();
    expect(by("sarking").extra_status).toBe("added");
    expect(by("edge_protection").extra_status).toBe("added");
    expect(by("skip_bin").extra_status).toBe("added");
    expect(by("safety_mesh").extra_status).toBe("offered");
    expect(by("gutter").extra_status).toBe("offered");
    expect(by("gutter").quantity).toBe(20);
    expect(by("downpipe").quantity).toBe(4);
    expect(by("fascia").extra_status).toBe("offered");
    expect(by("whirlybird").quantity).toBe(2);
    expect(by("sarking").blurb).toBe("Keeps heat out and stops condensation");
  });
  it("keeps the roofer's choices when refilled", () => {
    const toggled = r.items.map((i) => (i.calc_key === "whirlybird" ? { ...i, extra_status: "added" as const } : i));
    const again = fillQuoteLines({ m: job, book, mode, previous: toggled, colour: "Surfmist" });
    expect(again.items.find((i) => i.calc_key === "whirlybird")!.extra_status).toBe("added");
  });
  it("offers price-book items marked extra that the calculator doesn't measure", () => {
    const more = fillQuoteLines({ m: job, book: [...book, row({ name: "Gutter guard", is_extra: true, unit_price: 900, blurb: "Keeps leaves out" })], mode });
    const g = more.items.find((i) => i.description === "Gutter guard")!;
    expect([g.extra_status, g.quantity, g.blurb]).toEqual(["offered", 1, "Keeps leaves out"]);
  });
  it("adds a skip bin and whirlybirds on a new build", () => {
    const rows = docketTakeoff({ ...job, jobType: "new_build", existingRoof: "none" }, extraKeySet(book));
    expect(rows.find((x) => x.key === "skip_bin")?.quantity).toBe(1);
    expect(rows.some((x) => x.key === "labour_strip")).toBe(false);
  });
});

describe("totals with added and offered extras", () => {
  const items: DraftItem[] = [
    { description: "Roof", quantity: 1, unit: "job", unit_price: 20000, unit_cost: 0, category: "material", calc_key: null, option_key: null },
    { description: "Sarking", quantity: 2, unit: "roll", unit_price: 150, unit_cost: 0, category: "material", calc_key: "sarking", option_key: null, extra_status: "added" },
    { description: "Gutter", quantity: 10, unit: "lm", unit_price: 30, unit_cost: 0, category: "material", calc_key: "gutter", option_key: null, extra_status: "offered" },
  ];
  it("offered extras are left out until added", () => {
    expect(docketTotals(items, 0, 10, true).total).toBe(20300);
    expect(docketTotals(items, 0, 10, true).gst).toBe(1845.45);
    expect(itemsForOption(items.map((i) => ({ ...i, option_id: null })), null)).toHaveLength(2);
    const added = setExtra(items, [2], "added").items;
    expect(docketTotals(added, 0, 10, true).total).toBe(20600);
    expect(docketTotals(setExtra(added, [1], "offered").items, 100, 10, true).total).toBe(20200);
  });
  it("ex-GST quotes add GST on top of the counted lines only", () => {
    expect(docketTotals(items, 0, 10, false).total).toBe(22330);
    expect(estimateTotals([{ quantity: 1, unit_price: 100 }], 0, 10, false).total).toBe(110);
  });
  it("toggling a switchable extra updates the calculator switch", () => {
    const m = setExtra(items, [2], "added", job).m!;
    expect(m.includeGutters).toBe(true);
    expect(setExtra(items, [1], "offered", job).m!.includeSarking).toBe(false);
  });
});

describe("the docket view", () => {
  const r = fillQuoteLines({ m: job, book, mode });
  const v = docketView(r.items);
  it("groups gutter and downpipes into one extra", () => {
    const g = v.offered.find((x) => x.id === "gutters")!;
    expect(g.name).toBe("Gutters & downpipes");
    expect(g.qty).toBe("20 m + 4");
    expect(g.amount).toBe(20 * 35 + 4 * 88);
    expect(g.idx).toHaveLength(2);
  });
  it("main total is the roof without extras", () => {
    expect(v.main.every((l) => !l.extra_status)).toBe(true);
    expect(v.mainTotal).toBeGreaterThan(0);
    expect(v.added.map((x) => x.id).sort()).toEqual(["edge_protection", "sarking", "skip_bin"]);
  });
  it("formats quantities like a receipt", () => {
    expect(qtyText(361.2, "lm")).toBe("361.2 m");
    expect(qtyText(253.69, "m2")).toBe("253.7 m²");
    expect(qtyText(5, "box")).toBe("5 boxes");
    expect(qtyText(1, "roll")).toBe("1 roll");
    expect(qtyText(2, "ea")).toBe("2");
  });
});

describe("profile and colour", () => {
  const r = fillQuoteLines({ m: job, book, mode, colour: "ZINCALUME" });
  it("switching profile re-cuts and re-prices the sheet, leaves other lines", () => {
    const edited = r.items.map((i) => (i.calc_key === "labour_install" ? { ...i, unit_price: 40 } : i));
    const s = switchProfile({ items: edited, m: job, profile: "klip_lok", colour: "Surfmist", book, mode });
    const sheet = s.items.find((i) => i.calc_key === "metal_sheet")!;
    expect([sheet.description, sheet.quantity, sheet.unit_price]).toEqual(["COLORBOND Klip-Lok 700 0.48 BMT · Surfmist", 196.5, 38.5]);
    expect(s.items.find((i) => i.calc_key === "labour_install")!.unit_price).toBe(40);
    expect(sectionsProfile(s.m)).toBe("klip_lok");
    expect(s.items.length).toBe(edited.length);
    expect(s.priced).toBe(true);
  });
  it("prefers the finish that matches the colour", () => {
    const extra = [...book, row({ calc_key: "metal_sheet", name: "COLORBOND Custom Orb 0.42 BMT", unit: "lm", profile: "custom_orb", finish: "COLORBOND", unit_price: 26 })];
    expect(pickSheet(extra, "custom_orb", "Monument")?.name).toBe("COLORBOND Custom Orb 0.42 BMT");
    expect(pickSheet(extra, "custom_orb", "ZINCALUME")?.name).toBe("ZINCALUME Custom Orb 0.42 BMT");
    const next = switchColour({ items: r.items, m: job, profile: "custom_orb", from: "ZINCALUME", to: "Monument", book: extra, mode });
    expect(next.find((i) => i.calc_key === "metal_sheet")!.description).toBe("COLORBOND Custom Orb 0.42 BMT · Monument");
  });
  it("renames the sheet line between COLORBOND colours", () => {
    expect(sheetDescription("COLORBOND Trimdek 0.42 BMT · Monument", "Surfmist")).toBe("COLORBOND Trimdek 0.42 BMT · Surfmist");
    expect(sheetDescription("COLORBOND Trimdek 0.42 BMT · Woodland Grey", null)).toBe("COLORBOND Trimdek 0.42 BMT");
    expect(COLOURS.map((c) => c.name)).toEqual(expect.arrayContaining(["Monument", "Surfmist", "Basalt", "Woodland Grey", "Shale Grey", "Dune", "Jasper", "Manor Red", "Windspray", "Paperbark", "Classic Cream", "Night Sky", "ZINCALUME"]));
  });
  it("titles and facts", () => {
    expect(roofTitle(job, "trimdek")).toBe("New Trimdek roof");
    expect(roofTitle({ ...job, jobType: "restoration" }, null)).toBe("Roof restoration");
    expect(roofTitle({ ...job, sections: [{ label: "A", area: 100, pitch: 22, system: "concrete_tile" }] }, null)).toBe("New tiled roof");
    expect(roofFacts(job)).toBe("129.9 m² · 2 sections at 22.5°");
    expect(roofFacts(job, 8)).toBe("129.9 m² · 8 panels at 22.5°");
  });
});

describe("roof drawing", () => {
  it("draws the panels from the plans, else a generic hip roof", () => {
    // A 10 m × 6 m gable at 1:100: outline + ridge.
    const lines = [[[0, 0], [100, 0]], [[100, 0], [100, 30]], [[100, 30], [100, 60]], [[100, 60], [0, 60]], [[0, 60], [0, 30]], [[0, 30], [0, 0]], [[0, 30], [100, 30]]].map(([a, b]) => ({ a, b }));
    const s = roofShapeFromPlan({ lines, scale: 100, pitch: 22.5 })!;
    expect(s.faces).toHaveLength(2);
    expect(s.fromPlans).toBe(true);
    expect(roofShape({ plans: { lines, scale: 100, pitch: 22.5 } }).panels).toBe(2);
    expect(roofShape({}).shape).toBe(GENERIC_ROOF);
    expect(roofShapeFromPlan({ lines: [] })).toBeNull();
  });
});

describe("item icons", () => {
  it("every calculator key has a drawn icon", () => {
    for (const k of CALC_KEYS) {
      expect(ICON_FOR_KEY[k.key], k.key).toBeTruthy();
      expect(ICONS[ICON_FOR_KEY[k.key]], k.key).toBeTruthy();
    }
  });
  it("custom lines get the parcel", () => {
    expect(iconFor(null)).toBe("item");
    expect(iconFor("something_else")).toBe("item");
    expect(iconFor("gutters")).toBe("gutters");
  });
});
