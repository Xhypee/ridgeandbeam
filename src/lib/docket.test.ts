import { describe, expect, it } from "vitest";
import { ICON_FOR_KEY, ICONS, iconFor } from "@/components/item-icons";
import { CALC_KEYS } from "./calc-keys";
import {
  applyChoices, COLOURS, DEFAULT_EXTRA_KEYS, docketTakeoff, docketTotals, docketView, extraKeySet, extraStatusFor, fillQuoteLines, finishOf, isExtraItem, matchChoices,
  pickableColours, pickSheet, qtyText, roofFacts, roofTitle, rowFinish, sectionsProfile, setExtra, setRequired, sheetDescription, sheetProblem, sheetVariants,
  switchColour, switchProfile, withIds,
} from "./docket";
import { readFileSync } from "node:fs";
import path from "node:path";
import { roofShape, roofShapeFromPlan, roofShapeFromSatellite, roofShapeFromSections } from "./docket-shape";
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
    // Surfmist is COLORBOND and this book only has ZINCALUME Custom Orb: never borrow the other finish's price.
    expect([by("metal_sheet").description, by("metal_sheet").unit_price]).toEqual(["COLORBOND Custom Orb · Surfmist", 0]);
    expect(sheetProblem(book, "custom_orb", "Surfmist")).toBe("No price for COLORBOND Custom Orb — set it in the price book");
    expect(fillQuoteLines({ m: job, book, mode, colour: "ZINCALUME" }).items.find((i) => i.calc_key === "metal_sheet")!.unit_price).toBe(22);
    expect(r.items.every((i) => /^[0-9a-f-]{36}$/.test(i.id!))).toBe(true);
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
  it("keeps the roofer's choices and the line ids when refilled", () => {
    const toggled = setRequired(r.items.map((i) => (i.calc_key === "whirlybird" ? { ...i, extra_status: "added" as const } : i)), [r.items.findIndex((i) => i.calc_key === "sarking")], true);
    const again = fillQuoteLines({ m: job, book, mode, previous: toggled, colour: "Surfmist" });
    expect(again.items.find((i) => i.calc_key === "whirlybird")!.extra_status).toBe("added");
    expect(again.items.find((i) => i.calc_key === "sarking")!.required).toBe(true);
    for (const k of ["metal_sheet", "labour_install", "sarking", "gutter"]) expect(again.items.find((i) => i.calc_key === k)!.id).toBe(r.items.find((i) => i.calc_key === k)!.id);
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
    expect(sheet.id).toBe(edited.find((i) => i.calc_key === "metal_sheet")!.id);
    expect(sheet.variants).toEqual({ colorbond: { name: "COLORBOND Klip-Lok 700 0.48 BMT", unit_price: 38.5, unit_cost: 5, supplier_price_item_id: null } });
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
  it("only the exact profile and finish is priced", () => {
    expect(rowFinish({ finish: null, name: "ZINCALUME Trimdek" })).toBe("zincalume");
    expect(rowFinish({ finish: null, name: "Trimdek" })).toBeNull();
    expect(finishOf(null)).toBe("colorbond");
    expect(pickSheet(book, "trimdek", "ZINCALUME")).toBeUndefined();
    const s = switchProfile({ items: r.items, m: job, profile: "trimdek", colour: "ZINCALUME", book, mode });
    expect(s.priced).toBe(false);
    expect(s.items.find((i) => i.calc_key === "metal_sheet")!.unit_price).toBe(0);
    expect(sheetVariants(book, "custom_orb", mode)).toEqual({ zincalume: { name: "ZINCALUME Custom Orb 0.42 BMT", unit_price: 22, unit_cost: 5, supplier_price_item_id: null } });
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
  it("draws the panels from the plans", () => {
    // A 10 m × 6 m gable at 1:100: outline + ridge.
    const lines = [[[0, 0], [100, 0]], [[100, 0], [100, 30]], [[100, 30], [100, 60]], [[100, 60], [0, 60]], [[0, 60], [0, 30]], [[0, 30], [0, 0]], [[0, 30], [100, 30]]].map(([a, b]) => ({ a, b }));
    const s = roofShapeFromPlan({ lines, scale: 100, pitch: 22.5 })!;
    expect(s.kind).toBe("plans");
    expect(s.kind !== "tiles" && s.faces).toHaveLength(2);
    expect(roofShape({ plans: { lines, scale: 100, pitch: 22.5 } }).panels).toBe(2);
    expect(roofShape({ plan: { lines, scale: 100, pitch: 22.5 } }).panels).toBe(2);
    expect(roofShapeFromPlan({ lines: [] })).toBeNull();
  });
  it("projects satellite facets to metres, north up", () => {
    // ~10 m east-west × ~5 m north-south near Brisbane.
    const lat = -27.47, lng = 153.02, dLat = 5 / 110574, dLng = 10 / (111320 * Math.cos((lat * Math.PI) / 180));
    const facet = { label: "A", points: [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]] };
    const s = roofShapeFromSatellite([facet])!;
    expect(s.kind).toBe("satellite");
    const f = s.kind === "satellite" ? s.faces[0] : [];
    const xs = f.map((p) => p[0]), ys = f.map((p) => p[1]);
    expect(Math.round((Math.max(...xs) - Math.min(...xs)) / 100) / 10).toBe(10);
    expect(Math.round((Math.max(...ys) - Math.min(...ys)) / 100) / 10).toBe(5);
    // north (higher latitude) is up: smaller y
    expect(f[2][1]).toBeLessThan(f[0][1]);
    expect(roofShape({ satellite: { facets: [facet] }, sections: [{ area: 50 }] }).shape.kind).toBe("satellite");
    expect(roofShapeFromSatellite([{ points: [[1, 2]] }])).toBeNull();
  });
  it("draws one tile per section, sized by its area", () => {
    const s = roofShapeFromSections([{ label: "Front", area: 100 }, { label: "Back", area: 25 }, { label: "Empty", area: 0 }]);
    expect(s.kind).toBe("tiles");
    const t = s.kind === "tiles" ? s.tiles : [];
    expect(t.map((x) => [x.label, x.area, x.size])).toEqual([["Front", 100, 10000], ["Back", 25, 5000]]);
    expect(t[1].x >= t[0].size || t[1].y >= t[0].size).toBe(true);
    expect(roofShape({ sections: [] }).shape).toEqual({ kind: "tiles", tiles: [] });
  });
});

describe("the customer's choices", () => {
  const items: DraftItem[] = withIds([
    { description: "COLORBOND Trimdek 0.42 BMT · Surfmist", quantity: 100, unit: "lm", unit_price: 30, unit_cost: 0, category: "material", calc_key: "metal_sheet", option_key: null,
      variants: { colorbond: { name: "COLORBOND Trimdek 0.42 BMT", unit_price: 30 }, zincalume: { name: "ZINCALUME Trimdek 0.42 BMT", unit_price: 25 } } },
    { description: "Sarking", quantity: 2, unit: "roll", unit_price: 150, unit_cost: 0, category: "material", calc_key: "sarking", option_key: null, extra_status: "added" },
    { description: "Edge protection", quantity: 1, unit: "job", unit_price: 1000, unit_cost: 0, category: "other", calc_key: "edge_protection", option_key: null, extra_status: "added", required: true },
    { description: "Gutter", quantity: 10, unit: "lm", unit_price: 30, unit_cost: 0, category: "material", calc_key: "gutter", option_key: null, extra_status: "offered" },
  ]);
  const [sheet, sark, edge, gutter] = items;
  it("adds offered, removes optional (never required), re-prices the colour by finish", () => {
    const c = applyChoices(items, { added: [gutter.id!], removed: [sark.id!, edge.id!], colour: "ZINCALUME", roofColour: "Surfmist" });
    expect(c[3].extra_status).toBe("added");
    expect([c[1].extra_status, c[1].customer_removed]).toEqual(["offered", true]);
    expect(c[2].extra_status).toBe("added");
    expect([c[0].description, c[0].unit_price]).toEqual(["ZINCALUME Trimdek 0.42 BMT", 25]);
    expect(docketTotals(c, 0, 10, true).total).toBe(2500 + 1000 + 300);
    expect(docketView(c).removed.map((r) => r.id)).toEqual(["sarking"]); // offered + customer_removed: "Removed by customer"
    expect(applyChoices(items, { added: [], removed: [], colour: "Monument", roofColour: "Surfmist" })[0].description).toBe("COLORBOND Trimdek 0.42 BMT · Monument");
  });
  it("matches earlier choices to a changed quote by id, then calc key", () => {
    const changed = items.map((i) => (i.calc_key === "gutter" ? { ...i, id: "11111111-1111-4111-8111-111111111111" } : i));
    expect(matchChoices(changed, [{ id: gutter.id!, calc_key: "gutter" }], "offered")).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(matchChoices(changed, [{ id: edge.id!, calc_key: "edge_protection" }], "added")).toEqual([]);
    expect(matchChoices(changed, [{ id: sark.id!, calc_key: "sarking" }], "added")).toEqual([sark.id]);
  });
  it("only offers colours in a finish the roofer has priced", () => {
    expect(pickableColours(items, "Surfmist").map((c) => c.name)).toContain("ZINCALUME");
    const noZinc = items.map((i) => (i.calc_key === "metal_sheet" ? { ...i, variants: { colorbond: i.variants!.colorbond! } } : i));
    expect(pickableColours(noZinc, "Surfmist").map((c) => c.name)).not.toContain("ZINCALUME");
    expect(pickableColours(noZinc, "Surfmist")).toHaveLength(12);
    expect(sheet.id).toBeTruthy();
  });
  it("the colour list matches the database's docket_colours()", () => {
    const sqlText = readFileSync(path.join(__dirname, "../../supabase/migrations/20261112000200_docket_choices.sql"), "utf8");
    const arr = sqlText.match(/select array\[([^\]]+)\]::text\[\]/)![1];
    expect(arr.split(",").map((x) => x.trim().replace(/^'|'$/g, ""))).toEqual(COLOURS.map((c) => c.name));
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
