import { describe, expect, it } from "vitest";
import {
  addWorkingDays, budgetByCategory, computeCommission, crewPay, crewPayDescription, jobReadiness, netPaid, packLanes, planRainDay, READINESS_LABEL, weatherRisk,
} from "./production";
import { crewRoofFacts, skipBinLabel, unitLabel } from "./production-i18n";
import { pitchFactor } from "./roof";

const readyJob = {
  permit_status: "approved", hoa_status: "not_needed", colors_confirmed: true, shingle_color: "COLORBOND Monument, Trimdek",
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
    expect(r.blockers.find((b) => b.key === "permit")!.detail).toBe("Lodged");
  });
  it("uses Australian gate names and status words", () => {
    expect(READINESS_LABEL.permit).toBe("Council / building approval");
    expect(READINESS_LABEL.hoa).toBe("Strata / body corporate");
    expect(READINESS_LABEL.dumpster).toBe("Skip bin");
    const r = jobReadiness({ ...readyJob, dumpster_status: "needed", colors_confirmed: true }, { orders: [], depositReceived: true });
    expect(r.items.find((i) => i.key === "dumpster")).toMatchObject({ label: "Skip bin", ok: false, detail: "Needed" });
    expect(r.items.find((i) => i.key === "colors")!.detail).toBe("COLORBOND Monument, Trimdek");
    expect(jobReadiness({ ...readyJob, dumpster_status: "removed" }, { orders: [], depositReceived: true }).items.find((i) => i.key === "dumpster")!.detail).toBe("Collected");
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
    expect(weatherRisk({ date: "x", precipProb: 60, windKmh: 5, tempMaxC: null, code: null })).toBe("rain");
    expect(weatherRisk({ date: "x", precipProb: 10, windKmh: 40, tempMaxC: null, code: null })).toBe("wind");
    expect(weatherRisk({ date: "x", precipProb: 49, windKmh: 39, tempMaxC: 31, code: null })).toBe(null);
  });
  it("packs overlapping bars into lanes", () => {
    const l = packLanes([{ start: "2026-11-10", end: "2026-11-12" }, { start: "2026-11-11", end: "2026-11-11" }, { start: "2026-11-13", end: "2026-11-13" }]);
    expect(l.map((x) => x.lane)).toEqual([0, 1, 0]);
  });
});

describe("crewPay (metric)", () => {
  const sheet = { pay_rate_m2: 12, pay_low_slope_m2: 15, pay_steep_m2: 3, pay_high_steep_m2: 6, pay_strip_m2: 4.5, pay_gutter_lm: 9 };
  const ta = (plan: number, deg: number) => Math.round(plan * pitchFactor(deg) * 100) / 100;
  const roof = {
    units: "metric", jobType: "tile_to_metal", existingRoof: "tile", includeGutters: true, eave: 42,
    sections: [
      { label: "Verandah", area: 20, pitch: 5, system: "metal" },   // low-slope
      { label: "Main", area: 120, pitch: 22.5, system: "metal" },   // standard
      { label: "Front gable", area: 30, pitch: 30, system: "metal" }, // steep (over 25°)
      { label: "Tower", area: 10, pitch: 45, system: "metal" },     // very steep (40°+)
    ],
  };
  it("pays per m² of true (sloped) area with low-slope, steep and very-steep rates", () => {
    const r = crewPay(roof, sheet);
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(by.low_slope.qty).toBeCloseTo(ta(20, 5), 2);
    expect(by.low_slope.amount).toBeCloseTo(ta(20, 5) * 15, 1);
    expect(by.base.qty).toBeCloseTo(ta(120, 22.5) + ta(30, 30) + ta(10, 45), 1);
    expect(by.base.unit).toBe("m²");
    expect(by.steep.qty).toBeCloseTo(ta(30, 30), 2);
    expect(by.steep.label).toBe("Steep adder (over 25°)");
    expect(by.high_steep.qty).toBeCloseTo(ta(10, 45), 2);
    expect(by.high_steep.label).toBe("Very steep adder (40° and over)");
    expect(r.area).toBeCloseTo(ta(20, 5) + ta(120, 22.5) + ta(30, 30) + ta(10, 45), 1);
  });
  it("adds the strip rate on re-roofs and gutters per lineal metre", () => {
    const r = crewPay(roof, sheet);
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(by.strip.label).toBe("Strip old roof (tiles)");
    expect(by.strip.qty).toBe(r.area);
    expect(by.gutter).toMatchObject({ qty: 42, unit: "lm", amount: 378 });
    expect(r.total).toBeCloseTo(r.lines.reduce((s, l) => s + l.amount, 0), 2);
    expect(crewPayDescription(r)).toMatch(/^Crew pay: [\d.]+ m² — Install \(true roof area\)/);
  });
  it("falls back to the base rate when there is no low-slope rate, and uses the estimate's steep setting", () => {
    const r = crewPay({ ...roof, settings: { steepAboveDeg: 30 } }, { ...sheet, pay_low_slope_m2: 0 });
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(by.low_slope).toBeUndefined();
    expect(by.base.qty).toBe(r.area);
    expect(by.steep).toBeUndefined(); // the 30° gable is not over 30°
    expect(by.high_steep.qty).toBeCloseTo(ta(10, 45), 2);
  });
  it("has no strip for asbestos or restorations, and converts old imperial measurements", () => {
    const asb = crewPay({ ...roof, jobType: "asbestos" }, sheet);
    expect(asb.lines.some((l) => l.key === "strip")).toBe(false);
    expect(asb.notes[0]).toMatch(/licensed removalist/);
    const resto = crewPay({ ...roof, jobType: "restoration", includeGutters: false }, sheet);
    expect(resto.lines.map((l) => l.key)).toEqual(["base", "low_slope", "steep", "high_steep"]);
    expect(resto.lines[0].label).toBe("Restoration (true roof area)");
    // 1000 sq ft at 6/12 -> 92.9 m² plan at 26.57° -> ~103.87 m² true area, steep.
    const old = crewPay({ sections: [{ label: "Main", area: 1000, pitch: 6 }] }, sheet);
    expect(old.area).toBeCloseTo(103.87, 1);
    expect(old.lines.find((l) => l.key === "steep")).toBeTruthy();
  });
  it("is empty with an empty pay sheet", () => {
    expect(crewPay(roof, {}).total).toBe(0);
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

describe("crew work order", () => {
  it("describes the roof in metric crew terms", () => {
    const f = crewRoofFacts({ units: "metric", jobType: "tile_to_metal", existingRoof: "tile", includeSarking: true, includeSafetyMesh: true, includeEdgeProtection: true, includeSkip: true,
      sections: [{ label: "Main", area: 150, pitch: 22.5, system: "metal", profile: "trimdek" }, { label: "Porch", area: 10, pitch: 10, system: "metal", profile: "trimdek" }] });
    expect(f.jobType).toBe("Tile to metal re-roof");
    expect(f.area).toBeGreaterThan(160);
    expect(f.pitch).toBe("10–22.5°");
    expect(f.oldRoof).toBe("Tiles");
    expect(f.newRoof).toBe("Metal — Trimdek");
    expect(f.includes).toEqual(["Sarking", "Safety mesh", "Edge protection", "Skip bin"]);
    expect(crewRoofFacts({ units: "metric", jobType: "restoration", sections: [{ label: "Main", area: 100, pitch: 20, system: "concrete_tile" }] }).oldRoof).toBeNull();
  });
  it("uses plain English units and skip bin words", () => {
    expect(unitLabel("m2")).toBe("m²");
    expect(unitLabel("ea")).toBe("each");
    expect(skipBinLabel("ordered")).toBe("Booked");
  });
});
