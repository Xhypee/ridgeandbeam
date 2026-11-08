import { describe, expect, it } from "vitest";
import { addDays, addMonths, capFirstPayment, checkPlan, depositLimit, partKinds, presetPlan, splitByWeights, type PartInput } from "./pay-plan";

const sum = (ps: { amount: number }[]) => Math.round(ps.reduce((a, p) => a + p.amount * 100, 0)) / 100;
const SCHEDULE = [{ label: "Deposit", pct: 30, trigger: "signed" }, { label: "Materials delivered", pct: 40, trigger: "delivered" }, { label: "Completion", pct: 30, trigger: "completed" }];

describe("dates", () => {
  it("adds days and months (clamped to month end)", () => {
    expect(addDays("2026-11-20", 14)).toBe("2026-12-04");
    expect(addMonths("2026-11-20", 1)).toBe("2026-12-20");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-20", 3)).toBe("2027-02-20");
  });
});

describe("splitByWeights", () => {
  it("adds up to the cent", () => {
    const s = splitByWeights(25342.32, [5, 35, 30, 10, 10, 10]);
    expect(sum(s.map((amount) => ({ amount })))).toBe(25342.32);
    expect(s[0]).toBe(1267.12);
  });
});

describe("deposit cap", () => {
  it("depositLimit only for legal limits", () => {
    expect(depositLimit({ maxAud: 1267.116, isLegalLimit: true })).toBe(1267.12);
    expect(depositLimit({ maxAud: null, isLegalLimit: false })).toBeNull();
    expect(depositLimit(null)).toBeNull();
  });
  it("moves the excess to the next non-signing part", () => {
    const parts: PartInput[] = [
      { label: "Deposit", trigger: "signed", amount: 7602.7, due_date: null },
      { label: "Materials", trigger: "delivered", amount: 10136.93, due_date: null },
      { label: "Done", trigger: "completed", amount: 7602.69, due_date: null },
    ];
    const { parts: out, moved } = capFirstPayment(parts, 1267.12);
    expect(out[0].amount).toBe(1267.12);
    expect(out[1].amount).toBe(16472.51);
    expect(moved).toBe(6335.58);
    expect(sum(out)).toBe(sum(parts));
  });
  it("presets respect the cap and add up", () => {
    for (const p of ["milestones", "milestones_monthly", "fortnightly"] as const) {
      const plan = presetPlan(p, 25342.32, { schedule: SCHEDULE, start: "2026-11-20", depositCap: 1267.12 });
      expect(sum(plan)).toBe(25342.32);
      expect(plan.filter((x) => x.trigger === "signed").reduce((a, x) => a + x.amount, 0)).toBeLessThanOrEqual(1267.12);
    }
    const monthly = presetPlan("milestones_monthly", 25342.32, { schedule: SCHEDULE, start: "2026-11-20", depositCap: null });
    expect(monthly.map((x) => x.due_date).slice(3)).toEqual(["2026-12-20", "2027-01-20", "2027-02-20"]);
    expect(monthly[0].amount).toBe(1267.12);
  });
});

describe("partKinds", () => {
  it("deposit first, final = last milestone, instalments by date", () => {
    const plan = presetPlan("milestones_monthly", 10000, { schedule: SCHEDULE, start: "2026-11-20", depositCap: null });
    expect(partKinds(plan).map((p) => p.kind)).toEqual(["deposit", "progress", "final", "instalment", "instalment", "instalment"]);
    const ms = presetPlan("milestones", 10000, { schedule: SCHEDULE, start: "2026-11-20", depositCap: null });
    expect(partKinds(ms).map((p) => p.kind)).toEqual(["deposit", "progress", "final"]);
  });
});

describe("checkPlan", () => {
  const ok: PartInput[] = [
    { label: "Deposit", trigger: "signed", amount: 500, due_date: null },
    { label: "Instalment 1", trigger: "date", amount: 500, due_date: "2026-12-01" },
  ];
  it("accepts a plan that adds up", () => {
    expect(checkPlan(ok, 1000, 500, "2026-11-08").ok).toBe(true);
  });
  it("refuses wrong totals, past dates, missing dates and deposits over the cap", () => {
    expect(checkPlan(ok, 1200, null, "2026-11-08")).toMatchObject({ ok: false, error: expect.stringMatching(/\$200\.00 short/) });
    expect(checkPlan([ok[0], { ...ok[1], due_date: "2026-11-01" }], 1000, null, "2026-11-08")).toMatchObject({ ok: false, error: expect.stringMatching(/past/) });
    expect(checkPlan([ok[0], { ...ok[1], due_date: null }], 1000, null, "2026-11-08")).toMatchObject({ ok: false, error: expect.stringMatching(/pick the date/) });
    expect(checkPlan(ok, 1000, 400, "2026-11-08")).toMatchObject({ ok: false, error: expect.stringMatching(/deposit limit/) });
    expect(checkPlan([], 1000, null, "2026-11-08").ok).toBe(false);
    expect(checkPlan([{ ...ok[0], amount: 0 }, ok[1]], 500, null, "2026-11-08").ok).toBe(false);
  });
});
