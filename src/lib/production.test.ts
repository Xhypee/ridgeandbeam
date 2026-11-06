import { describe, expect, it } from "vitest";
import {
  addWorkingDays, budgetByCategory, computeCommission, crewPay, jobReadiness, netPaid, packLanes, planRainDay, weatherRisk,
} from "./production";
import { materialLabel } from "./production-i18n";

const readyJob = {
  permit_status: "approved", hoa_status: "not_needed", colors_confirmed: true, shingle_color: "Charcoal",
  materials_status: "ordered", dumpster_status: "ordered", scheduled_start: "2026-11-16",
};

describe("jobReadiness", () => {
  it("is ready when every gate is green", () => {
    const r = jobReadiness(readyJob, { orders: [{ status: "confirmed", delivery_date: "2026-11-13" }], depositReceived: true });
    expect(r.ready).toBe(true);
    expect(r.done).toBe(6);
  });
  it("blocks on late delivery, missing deposit and permit", () => {
    const r = jobReadiness({ ...readyJob, permit_status: "applied" }, { orders: [{ status: "sent", delivery_date: "2026-11-17" }], depositReceived: false });
    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.key).sort()).toEqual(["deposit", "materials", "permit"]);
  });
  it("draft orders don't count, delivered status does", () => {
    expect(jobReadiness(readyJob, { orders: [{ status: "draft", delivery_date: "2026-11-10" }], depositReceived: true }).ready).toBe(false);
    expect(jobReadiness({ ...readyJob, materials_status: "delivered" }, { orders: [], depositReceived: true }).ready).toBe(true);
  });
});

describe("working days & rain day", () => {
  it("skips weekends", () => {
    expect(addWorkingDays("2026-11-06", 1)).toBe("2026-11-09"); // Fri -> Mon
    expect(addWorkingDays("2026-11-09", 3)).toBe("2026-11-12");
    expect(addWorkingDays("2026-11-07", 0)).toBe("2026-11-09"); // Sat rolls to Mon
  });
  it("shifts the rained-out job and the crew's later jobs", () => {
    const jobs = [
      { id: "a", crew_id: "c1", scheduled_start: "2026-11-10", scheduled_end: "2026-11-11" },
      { id: "b", crew_id: "c1", scheduled_start: "2026-11-12", scheduled_end: "2026-11-13" },
      { id: "c", crew_id: "c2", scheduled_start: "2026-11-10", scheduled_end: "2026-11-10" },
      { id: "d", crew_id: "c1", scheduled_start: "2026-11-03", scheduled_end: "2026-11-04" },
    ];
    const s = planRainDay(jobs, { date: "2026-11-10", crewId: "c1", days: 1 });
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s[0].to).toEqual(["2026-11-11", "2026-11-12"]);
    expect(s[1].to).toEqual(["2026-11-13", "2026-11-16"]);
    expect(s[1].reason).toBe("cascade");
    expect(planRainDay(jobs, { date: "2026-11-10", crewId: "all", days: 1 }).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("keeps the start of a job already under way", () => {
    const s = planRainDay([{ id: "a", crew_id: null, scheduled_start: "2026-11-09", scheduled_end: "2026-11-11" }], { date: "2026-11-10", crewId: "all", days: 2 });
    expect(s[0].to).toEqual(["2026-11-09", "2026-11-13"]);
  });
  it("flags risky weather", () => {
    expect(weatherRisk({ date: "x", precipProb: 60, windMph: 5, tempMaxF: null, code: null })).toBe("rain");
    expect(weatherRisk({ date: "x", precipProb: 10, windMph: 30, tempMaxF: null, code: null })).toBe("wind");
    expect(weatherRisk({ date: "x", precipProb: 49, windMph: 24, tempMaxF: null, code: null })).toBe(null);
  });
  it("packs overlapping bars into lanes", () => {
    const l = packLanes([{ start: "2026-11-10", end: "2026-11-12" }, { start: "2026-11-11", end: "2026-11-11" }, { start: "2026-11-13", end: "2026-11-13" }]);
    expect(l.map((x) => x.lane)).toEqual([0, 1, 0]);
  });
});

describe("crewPay", () => {
  const sheet = { rate_per_square: 100, steep_adder: 20, high_steep_adder: 40, layer_adder: 15, low_slope_rate: 150 };
  it("prices by section pitch and extra layers", () => {
    // 1200 sf @ 0/12 = 12 sq low slope; 1000 sf @ 9/12 = 12.5 sq steep; 800 sf @ 12/12 = 11.31 sq high steep
    const r = crewPay({ sections: [{ label: "porch", area: 1200, pitch: 0 }, { label: "main", area: 1000, pitch: 9 }, { label: "tower", area: 800, pitch: 12 }], layers: 2 }, sheet);
    const by = Object.fromEntries(r.lines.map((l) => [l.label, l.amount]));
    expect(by["Low-slope (under 3/12)"]).toBe(1800);
    expect(by["Install (per square)"]).toBeCloseTo(2381.37, 1);
    expect(by["Steep adder (8–9/12)"]).toBe(250);
    expect(by["High-steep adder (10/12+)"]).toBeCloseTo(452.55, 1);
    expect(r.squares).toBeCloseTo(35.81, 1);
    expect(by["Extra layer tear-off ×1"]).toBeCloseTo(537.21, 1);
  });
});

describe("budget & commissions", () => {
  it("maps estimate lines to cost categories", () => {
    const b = budgetByCategory([
      { quantity: 10, unit_cost: 30, category: "material" },
      { quantity: 20, unit_cost: 60, category: "labor" },
      { quantity: 1, unit_cost: 400, category: "other", calc_key: "dumpster" },
    ]);
    expect(b.materials).toBe(300);
    expect(b.labor).toBe(1200);
    expect(b.dumpster).toBe(400);
  });
  it("computes 10/50/50 milestones", () => {
    const r = computeCommission({ kind: "split_10_50_50", rate: 40 }, { contractValue: 20000, actualCost: 12000, budgetCost: 11000, signed: true, completed: true, paidInFull: false });
    expect(r.total).toBe(3200);
    expect(r.stages.map((s) => s.amount)).toEqual([320, 1440, 1440]);
    expect(r.earned).toBe(1760);
  });
  it("uses budget until costs post; pct of contract earned at completion", () => {
    expect(computeCommission({ kind: "pct_gross_profit", rate: 30 }, { contractValue: 10000, actualCost: 0, budgetCost: 6000, signed: true, completed: true, paidInFull: true }).earned).toBe(1200);
    expect(computeCommission({ kind: "pct_contract", rate: 10 }, { contractValue: 10000, actualCost: 7000, budgetCost: 0, signed: true, completed: false, paidInFull: false }).earned).toBe(0);
  });
  it("nets chargebacks", () => {
    expect(netPaid([{ kind: "advance", amount: 300 }, { kind: "chargeback", amount: 100 }])).toBe(200);
  });
});

describe("i18n", () => {
  it("translates common materials", () => {
    expect(materialLabel("Architectural shingles", "es")).toBe("Tejas arquitectónicas");
    expect(materialLabel("Synthetic underlayment (10 sq roll)", "es")).toMatch(/Membrana/);
    expect(materialLabel("Custom thing", "es")).toBe("Custom thing");
  });
});
