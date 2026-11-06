import { describe, expect, it } from "vitest";
import { effectiveOptionId, itemsForOption } from "./estimate-totals";
import { allowedCatalog, buildLines, type CatalogRow } from "./estimating";

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  id: Math.random().toString(36), calc_key: null, name: "x", unit: "ea", unit_price: 10, unit_cost: 5, category: "material",
  tier: null, warranty: null, requires_certification: null, ...over,
});

const catalog: CatalogRow[] = [
  row({ id: "lab", calc_key: "labor", name: "Labor", unit: "sq", unit_price: 95 }),
  row({ id: "sh", calc_key: "shingles", name: "Architectural shingles", unit: "bundle", unit_price: 42 }),
  row({ id: "shb", calc_key: "shingles", tier: "better", name: "Designer shingles", unit: "bundle", unit_price: 58 }),
  row({ id: "shc", calc_key: "shingles", tier: "best", name: "Class 4 shingles", unit: "bundle", unit_price: 72 }),
  row({ id: "wg", calc_key: "warranty", tier: "good", name: "Standard warranty", unit_price: 0, warranty: "Standard limited" }),
  row({ id: "wb", calc_key: "warranty", tier: "better", name: "Enhanced warranty", unit_price: 395, warranty: "Enhanced system" }),
  row({ id: "wc", calc_key: "warranty", tier: "best", name: "Premium warranty", unit_price: 795, warranty: "Premium", requires_certification: "GAF Master Elite" }),
];
const opts = [{ key: "g", tier: "good" as const }, { key: "b", tier: "better" as const }, { key: "c", tier: "best" as const }];
const rows = [{ key: "labor" as const, quantity: 20 }, { key: "shingles" as const, quantity: 66 }, { key: "permit" as const, quantity: 1 }];

describe("buildLines", () => {
  it("shares identical lines and splits tiered ones per option", () => {
    const r = buildLines(rows, allowedCatalog(catalog, ["GAF Master Elite"]), opts);
    const labor = r.items.filter((i) => i.calc_key === "labor");
    expect(labor).toHaveLength(1);
    expect(labor[0].option_key).toBeNull();
    const sh = r.items.filter((i) => i.calc_key === "shingles");
    expect(sh.map((i) => [i.option_key, i.description])).toEqual([["g", "Architectural shingles"], ["b", "Designer shingles"], ["c", "Class 4 shingles"]]);
    expect(r.items.filter((i) => i.calc_key === "warranty").map((i) => i.option_key)).toEqual(["g", "b", "c"]);
    expect(r.warranties).toEqual({ g: "Standard limited", b: "Enhanced system", c: "Premium" });
    expect(r.missing).toEqual(["permit"]);
  });

  it("only offers certified warranties; falls back to untiered items", () => {
    const r = buildLines(rows, allowedCatalog(catalog, []), opts);
    expect(r.items.filter((i) => i.calc_key === "warranty").map((i) => i.option_key)).toEqual(["g", "b"]);
    expect(r.items.some((i) => i.description === "Premium warranty")).toBe(false);
  });

  it("without options uses untiered items only", () => {
    const r = buildLines(rows, catalog, []);
    expect(r.items.map((i) => i.description)).toEqual(["Labor", "Architectural shingles"]);
    expect(r.items.every((i) => i.option_key === null)).toBe(true);
    expect(r.items[0].unit_cost).toBe(5);
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
