import { describe, expect, it } from "vitest";
import { dueReason, matchInvoices, paymentRows, quoteStages, stageKind, type PlanInv } from "./build-stage";
import type { PaymentPlan } from "./quote-pricing";

const plan: Pick<PaymentPlan, "mode" | "when" | "stages"> = {
  mode: "instalments", when: "completed",
  stages: [{ label: "Deposit", pct: 10, trigger: "signed" }, { label: "Materials delivered", pct: 30, trigger: "delivered" }, { label: "Upon completion", pct: 60, trigger: "completed" }],
};
const inv = (p: Partial<PlanInv>): PlanInv => ({ id: Math.random().toString(36), kind: "progress", label: null, trigger: null, status: "draft", total: 0, paid: 0, balance: 0, issue_date: null, due_date: null, last_reminder_on: null, ...p });

describe("quote stages", () => {
  it("uses the quote's own stages, names and percentages", () => {
    expect(quoteStages(plan).map((s) => `${s.label} ${s.pct}`)).toEqual(["Deposit 10", "Materials delivered 30", "Upon completion 60"]);
  });
  it("Full payment is one stage, due when the quote says", () => {
    expect(quoteStages({ mode: "full", when: "delivered", stages: [] })).toEqual([{ label: "Full payment", pct: 100, trigger: "delivered" }]);
  });
});

describe("payment rows", () => {
  it("splits the contract by the quote's percentages before any invoice exists", () => {
    const rows = paymentRows(plan, 36172, [], { delivered: false, completed: false });
    expect(rows.map((r) => r.amount)).toEqual([3617.2, 10851.6, 21703.2]);
    expect(rows.map((r) => r.state)).toEqual(["next", "later", "later"]);
  });
  it("a paid deposit invoice (any label) ticks the first stage; the next one is up", () => {
    const rows = paymentRows(plan, 36172, [inv({ kind: "deposit", label: null, status: "paid", total: 3617.2, paid: 3617.2, balance: 0 })], { delivered: true, completed: false });
    expect(rows.map((r) => r.state)).toEqual(["paid", "next", "later"]);
    expect(rows[1].due).toBe(true);
    expect(rows[2].due).toBe(false);
  });
  it("an issued, unpaid stage shows as asked (remind), not next", () => {
    const rows = paymentRows(plan, 36172, [
      inv({ kind: "deposit", status: "paid", total: 3617.2, paid: 3617.2 }),
      inv({ label: "Materials delivered", status: "sent", total: 10851.6, balance: 10851.6 }),
    ], { delivered: true, completed: false });
    expect(rows[1].state).toBe("asked");
  });
  it("signed extra work on the final invoice shows as extra on top of the quote's share", () => {
    const rows = paymentRows(plan, 36172, [inv({ kind: "final", label: "Upon completion", total: 22343.2, balance: 22343.2 })], { delivered: true, completed: true });
    expect(rows[2].extra).toBe(640);
    expect(rows[2].quoted).toBe(21703.2);
  });
  it("never invents stages from build progress", () => {
    const rows = paymentRows(plan, 1000, [inv({ label: "Roof sheeted", status: "sent", total: 100, balance: 100 })], { delivered: true, completed: true });
    expect(rows.map((r) => r.label)).toEqual(["Deposit", "Materials delivered", "Upon completion"]);
  });
});

describe("helpers", () => {
  it("matches by name before falling back to deposit / final", () => {
    const a = inv({ kind: "final", label: "Upon completion" });
    const b = inv({ kind: "deposit", label: "Deposit 10%" });
    const m = matchInvoices(quoteStages(plan), [a, b]);
    expect(m[0]).toBe(b);
    expect(m[1]).toBeNull();
    expect(m[2]).toBe(a);
  });
  it("invoice kinds follow the stage's place in the plan", () => {
    expect([stageKind(0, 3, "signed"), stageKind(1, 3, "delivered"), stageKind(2, 3, "completed"), stageKind(0, 1, "completed")]).toEqual(["deposit", "progress", "final", "final"]);
  });
  it("says why it's due in the quote's terms", () => {
    expect(dueReason("delivered", "Materials delivered", { deliveredOn: "2026-11-09" })).toContain("delivered on Monday 9 November");
  });
});
