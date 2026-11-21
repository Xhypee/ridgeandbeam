import { describe, expect, it } from "vitest";
import { applyMargin, marginBasis, marginForTarget, moneyAtMargin, quoteMarginFor, quoteMoney, repriceToTarget, withQuoteMargin } from "./quote-pricing";

// Priya's valley repair: four costed lines plus labour, prices inc GST, an offered extra that doesn't count.
const lines = [
  { quantity: 6.2, unit_price: 110.36, unit_cost: 80.26 },
  { quantity: 8, unit_price: 33, unit_cost: 24 },
  { quantity: 12, unit_price: 16.5, unit_cost: 12 },
  { quantity: 1, unit_price: 385, unit_cost: 280 },
  { quantity: 1, unit_price: 137.5, unit_cost: 100 },
  { quantity: 1, unit_price: 385, unit_cost: 0, extra_status: "offered" },
];
const b = marginBasis(lines, 0, 10, true);

const land = (marginPct: number) => quoteMoney(applyMargin(lines, marginPct, 10, true), 10, true);

describe("changing the margin from the sidebar", () => {
  it("boils the quote down (offered extras left out)", () => {
    expect(b.costed).toBeCloseTo(1213.61, 2);
    expect(b.uncosted).toBe(0);
  });
  it("margin % lands on that margin", () => {
    const r = marginForTarget(b, { mode: "pct", value: 30 });
    expect("marginPct" in r && land(r.marginPct).marginPct).toBeCloseTo(30, 0);
  });
  it("margin $ lands on that profit (to within rounding)", () => {
    const r = marginForTarget(b, { mode: "profit", value: 500 });
    expect("marginPct" in r && Math.abs(land(r.marginPct).profit - 500)).toBeLessThan(2);
  });
  it("a total lands on that total (to within rounding)", () => {
    const r = marginForTarget(b, { mode: "total", value: 2000 });
    expect("marginPct" in r && Math.abs(land(r.marginPct).total - 2000)).toBeLessThan(2);
    if ("marginPct" in r) expect(moneyAtMargin(b, r.marginPct / 100).total).toBeCloseTo(2000, 0);
  });
  it("won't go to or below cost", () => {
    const r = marginForTarget(b, { mode: "total", value: 1300 });
    expect("error" in r && r.error).toMatch(/below what it costs/);
  });
  it("keeps uncosted lines and the discount in the sum", () => {
    const b2 = marginBasis([...lines, { quantity: 1, unit_price: 220, unit_cost: 0 }], 50, 10, true);
    const r = marginForTarget(b2, { mode: "total", value: 2500 });
    expect("marginPct" in r && moneyAtMargin(b2, r.marginPct / 100).total).toBeCloseTo(2500, 0);
  });
  it("works for ex-GST quotes too", () => {
    const b3 = marginBasis(lines, 0, 10, false);
    const r = marginForTarget(b3, { mode: "total", value: 2200 });
    expect("marginPct" in r && moneyAtMargin(b3, r.marginPct / 100).total).toBeCloseTo(2200, 0);
  });
  it("needs costs", () => {
    expect("error" in marginForTarget(marginBasis([{ quantity: 1, unit_price: 100, unit_cost: 0 }], 0, 10, true), { mode: "pct", value: 20 })).toBe(true);
  });
  it("lands a typed total exactly (leftover cents go on one line)", () => {
    const t = { mode: "total" as const, value: 2000 };
    const r = marginForTarget(b, t);
    if (!("marginPct" in r)) throw new Error("no margin");
    const out = repriceToTarget(lines, lines.map(() => true), b, t, r.marginPct);
    expect(quoteMoney(out, 10, true).total).toBe(2000);
  });
  it("lands a typed margin $ to the cent on ex-GST quotes too", () => {
    const b3 = marginBasis(lines, 0, 10, false);
    const t = { mode: "profit" as const, value: 600 };
    const r = marginForTarget(b3, t);
    if (!("marginPct" in r)) throw new Error("no margin");
    expect(Math.abs(quoteMoney(repriceToTarget(lines, lines.map(() => true), b3, t, r.marginPct), 10, false).profit - 600)).toBeLessThanOrEqual(0.01);
  });
});

describe("the margin sticks for new quotes", () => {
  it("uses the quote's own margin first, then the one last set", () => {
    expect(quoteMarginFor(28, 31.6)).toBe(28);
    expect(quoteMarginFor(null, 31.6)).toBe(31.6);
    expect(quoteMarginFor(null, "31.60")).toBe(31.6);
    expect(quoteMarginFor(undefined, null)).toBeNull();
  });
  it("prices costed lines at it and leaves the rest", () => {
    const lines = [{ quantity: 2, unit_price: 50, unit_cost: 40 }, { quantity: 1, unit_price: 99, unit_cost: 0 }];
    const out = withQuoteMargin(lines, 20, { inclusive: true, gstRatePct: 10 });
    expect(out[0].unit_price).toBe(55);
    expect(out[1].unit_price).toBe(99);
    expect(withQuoteMargin(lines, null, { inclusive: true, gstRatePct: 10 })).toBe(lines);
  });
});
