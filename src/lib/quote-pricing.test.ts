import { describe, expect, it } from "vitest";
import { applyMargin, normaliseStages, planSchedule, priceFromCost, quoteMoney, stageAmounts, stagesProblem } from "./quote-pricing";

describe("quote margin", () => {
  it("prices from cost at a true margin, GST inclusive", () => {
    expect(priceFromCost(100, 20, 10, true)).toBe(137.5); // 125 ex GST + 10%
    expect(priceFromCost(100, 20, 10, false)).toBe(125);
    expect(priceFromCost(100, 0, 10, true)).toBe(110);
  });
  it("reprices costed lines only; uncosted lines keep their price", () => {
    const lines = applyMargin([{ quantity: 2, unit_price: 0, unit_cost: 50 }, { quantity: 1, unit_price: 300, unit_cost: 0 }], 25, 10, true);
    expect(lines[0].unit_price).toBe(73.33);
    expect(lines[1].unit_price).toBe(300);
  });
  it("totals: cost, profit and margin; offered extras excluded", () => {
    const m = quoteMoney([
      { quantity: 1, unit_price: 137.5, unit_cost: 100 },
      { quantity: 1, unit_price: 55, unit_cost: 0, extra_status: "offered" },
    ], 10, true);
    expect(m).toMatchObject({ total: 137.5, gst: 12.5, exGst: 125, cost: 100, profit: 25, marginPct: 20, uncosted: 0 });
  });
  it("matches the approved mockup: $1,113.62 cost at 20% → $1,531.23", () => {
    const lines = applyMargin([
      { quantity: 1, unit_price: 0, unit_cost: 497.62 }, { quantity: 1, unit_price: 0, unit_cost: 192 },
      { quantity: 1, unit_price: 0, unit_cost: 144 }, { quantity: 1, unit_price: 0, unit_cost: 280 },
    ], 20, 10, true);
    const m = quoteMoney(lines, 10, true);
    expect(m.cost).toBe(1113.62);
    expect(m.total).toBeCloseTo(1531.23, 1);
  });
});

describe("payment plan", () => {
  it("full is one step", () => {
    expect(planSchedule({ mode: "full", when: "completed", stages: [] })).toEqual([{ label: "Paid in full", pct: 100, trigger: "completed" }]);
  });
  it("instalments keep Deposit first and Upon completion last", () => {
    const st = normaliseStages([{ label: "Deposit", pct: 10, trigger: "completed" }, { label: "Materials", pct: 40, trigger: "delivered" }, { label: "Upon completion", pct: 50, trigger: "signed" }]);
    expect(st[0].trigger).toBe("signed");
    expect(st.at(-1)!.trigger).toBe("completed");
    expect(stagesProblem(st)).toBeNull();
    expect(normaliseStages([])).toHaveLength(2);
  });
  it("flags stages that don't add to 100%", () => {
    expect(stagesProblem([{ label: "a", pct: 10, trigger: "signed" }, { label: "b", pct: 80, trigger: "completed" }])).toMatch(/90%/);
    expect(planSchedule({ mode: "instalments", when: "completed", stages: [{ label: "a", pct: 10, trigger: "signed" }, { label: "b", pct: 80, trigger: "completed" }] })).toBeNull();
  });
  it("splits dollars exactly", () => {
    const a = stageAmounts(1531.23, [{ label: "D", pct: 10, trigger: "signed" }, { label: "M", pct: 40, trigger: "delivered" }, { label: "C", pct: 50, trigger: "completed" }]);
    expect(a).toEqual([153.12, 612.49, 765.62]);
  });
});
