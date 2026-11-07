import { describe, expect, it } from "vitest";
import { cutList, DEFAULT_MEASUREMENTS, normalizeMeasurements, takeoff } from "../roof";
import type { Pt } from "./geometry";
import { normalizeLines, type PlanLine } from "./roof-model";
import { computeTakeoff, planQtyOf, plansMeasurements } from "./takeoff";

const P = (x: number, y: number): Pt => [x / 100, y / 100];
const L = (a: Pt, b: Pt): PlanLine => ({ a: P(...a), b: P(...b) });
const lines = normalizeLines([
  L([0, 0], [10000, 0]), L([10000, 0], [10000, 6000]), L([10000, 6000], [0, 6000]), L([0, 6000], [0, 0]),
  L([0, 0], [3000, 3000]), L([0, 6000], [3000, 3000]), L([10000, 0], [7000, 3000]), L([10000, 6000], [7000, 3000]), L([3000, 3000], [7000, 3000]),
], 100);
const model = { scale: 100, pitch: 25, lines };

describe("plans → quote quantities", () => {
  const t = computeTakeoff(model, { overhangMm: 55, downpipes: 4 });
  const m = plansMeasurements({ ...DEFAULT_MEASUREMENTS }, t, { pitch: 25, profile: "custom_orb", newBuild: true, downpipes: 4 });

  it("sections per panel, lineal metres and downpipes from the plans", () => {
    expect(m.sections).toHaveLength(4);
    expect(m.sections.reduce((s, x) => s + x.area, 0)).toBeCloseTo(60, 1);
    expect(m.ridge).toBeCloseTo(4, 2);
    expect(m.eave).toBeCloseTo(32, 2);
    expect(m.downpipes).toBe(4);
    expect(m.existingRoof).toBe("none");
    expect(m.includeGutters).toBe(true);
  });

  it("metal_sheet uses the optimised cut list, for each profile an option asks for", () => {
    const rows = takeoff(m);
    const sheet = rows.find((r) => r.key === "metal_sheet")!;
    expect(sheet.quantity).toBeCloseTo(t.sheets.custom_orb.lm, 2);
    expect(sheet.basis).toContain("cut from the plans");
    const kl = takeoff(m, { profileOverride: { profile: "klip_lok", coverMm: 700 } }).find((r) => r.key === "metal_sheet")!;
    expect(kl.quantity).toBeCloseTo(t.sheets.klip_lok.lm, 2);
    expect(cutList(m)[0].rows?.length).toBeGreaterThan(0);
  });

  it("flashings come in ordered lengths; battens and fascia for a new build", () => {
    const rows = takeoff(m);
    const q = planQtyOf(t, 25);
    expect(rows.find((r) => r.key === "ridge_capping")!.quantity).toBeCloseTo(q.flashings.ridge_capping!, 2);
    expect(rows.find((r) => r.key === "gutter")!.quantity).toBeCloseTo(q.flashings.gutter!, 2);
    expect(rows.find((r) => r.key === "roof_battens")!.quantity).toBeCloseTo(t.flashings.battens.lm, 2);
    expect(rows.find((r) => r.key === "fascia")).toBeTruthy();
    expect(rows.find((r) => r.key === "downpipe")!.quantity).toBe(4);
    expect(rows.find((r) => r.key === "labour_strip")).toBeUndefined();
  });

  it("survives a save/load round trip, and falls back once the roof is edited by hand", () => {
    const loaded = normalizeMeasurements(JSON.parse(JSON.stringify(m)));
    expect(loaded.planQty?.sheets.custom_orb?.lm).toBeCloseTo(t.sheets.custom_orb.lm, 2);
    const edited = { ...loaded, sections: loaded.sections.map((s, i) => (i === 0 ? { ...s, area: s.area + 10 } : s)), ridge: 9 };
    expect(cutList(edited)[0].rows).toBeUndefined();
    const ridge = takeoff(edited).find((r) => r.key === "ridge_capping")!;
    expect(ridge.basis).toContain("% laps");
  });
});
