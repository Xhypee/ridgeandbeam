// From a roof model read off the plans to everything the quote needs: measurements for the calculator (sections,
// lineal metres, downpipes) plus the exact sheet cut lists and flashing orders (measurements.planQty), and the
// snapshot kept in measurements.plans so the roof can be viewed again from the quote. Pure.

import { METAL_PROFILES, pitchFactor, round2, type Measurements, type MetalProfile, type PlanQty, type RoofSection } from "../roof";
import type { Found } from "./details";
import { analyzeRoof, type PlanLine, type PlanModel, type RoofAnalysis, type RoofTotals } from "./roof-model";
import { planFlashings, planSheets, SHEET_PROFILES, type CutRow, type FlashingLine, type Flashings, type SheetPlan, type SheetProfile } from "./sheets";

export type PlanTakeoff = { analysis: RoofAnalysis; sheets: Record<SheetProfile, SheetPlan>; flashings: Flashings };

export function computeTakeoff(model: PlanModel, opts: { overhangMm?: number; downpipes?: number } = {}): PlanTakeoff {
  const analysis = analyzeRoof(model);
  const sheets = Object.fromEntries(
    (Object.keys(SHEET_PROFILES) as SheetProfile[]).map((p) => [p, planSheets(analysis, model.pitch, { coverMm: SHEET_PROFILES[p].coverMm, rotatable: SHEET_PROFILES[p].rotatable, overhangMm: opts.overhangMm ?? 55 })]),
  ) as Record<SheetProfile, SheetPlan>;
  const flashings = planFlashings(analysis, model.pitch, opts.downpipes ?? 0);
  return { analysis, sheets, flashings };
}

const lmOf = (f: Flashings, key: FlashingLine["key"]) => f.lines.find((l) => l.key === key)?.lm ?? 0;

/** The calculator's quantities from the plans. */
export function planQtyOf(t: PlanTakeoff, pitch: number): PlanQty {
  const tot = t.analysis.totals;
  const sheets: PlanQty["sheets"] = {};
  for (const p of METAL_PROFILES) {
    const s = t.sheets[p as SheetProfile];
    if (s) sheets[p] = { coverMm: s.coverMm, sheets: s.count, lm: s.lm, rows: s.cutList };
  }
  return {
    // the same way the calculator will add up the sections (plan area to 2 dp × pitch factor)
    trueArea: round2(t.analysis.faces.reduce((s, f) => s + round2(f.plan) * pitchFactor(pitch), 0)),
    sheets,
    flashings: {
      ridge_capping: round2(lmOf(t.flashings, "ridge") + lmOf(t.flashings, "hip")),
      barge_capping: lmOf(t.flashings, "barge"),
      valley_iron: lmOf(t.flashings, "valley"),
      flashing: lmOf(t.flashings, "apron"),
      gutter: lmOf(t.flashings, "gutter"),
      fascia: lmOf(t.flashings, "fascia"),
    },
    basis: { ridgeHip: round2(tot.ridge + tot.hip), barge: tot.barge, valley: tot.valley, apron: tot.apron, eave: tot.eave },
    battensLm: t.flashings.battens.lm,
  };
}

/** Measurements for the quote from the plans (keeps the quote's other choices: job type, waste, settings…). */
export function plansMeasurements(current: Measurements, t: PlanTakeoff, opts: { pitch: number; profile: MetalProfile; newBuild: boolean; downpipes: number }): Measurements {
  const tot = t.analysis.totals;
  const sections: RoofSection[] = t.analysis.faces
    .map((f) => ({ label: f.name, area: round2(f.plan), pitch: opts.pitch, system: "metal" as const, profile: opts.profile, waste: null }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    ...current,
    sections,
    ridge: tot.ridge,
    hip: tot.hip,
    valley: tot.valley,
    barge: tot.barge,
    eave: tot.eave,
    apron: tot.apron,
    downpipes: opts.downpipes,
    includeGutters: true,
    existingRoof: opts.newBuild ? "none" : current.existingRoof,
    jobType: opts.newBuild && current.jobType !== "reroof" && current.jobType !== "tile_to_metal" && current.jobType !== "asbestos" ? "reroof" : current.jobType,
    planQty: planQtyOf(t, opts.pitch),
  };
}

/** What measurements.plans keeps: enough to redraw and re-edit the roof, and the numbers it gave. */
export type SavedPlans = {
  v: 1;
  page: number;
  pageCount: number;
  pageSize: { w: number; h: number }; // paper mm
  scale: number;
  scaleSource: string;
  pitch: number;
  lines: PlanLine[];
  profile: MetalProfile;
  colour: string;
  overhangMm: number;
  downpipes: number;
  file: { id: string | null; path: string | null; name: string; imagePath: string | null };
  details: Found[];
  totals: RoofTotals;
  sheets: { count: number; lm: number; m2: number; wastePct: number; cutList: CutRow[] };
  flashings: FlashingLine[];
  battens: Flashings["battens"];
  saved_at: string;
};

export function savedPlans(input: Omit<SavedPlans, "v" | "totals" | "sheets" | "flashings" | "battens" | "saved_at">, t: PlanTakeoff, now = new Date()): SavedPlans {
  const s = t.sheets[input.profile as SheetProfile];
  return {
    v: 1,
    ...input,
    totals: t.analysis.totals,
    sheets: { count: s.count, lm: s.lm, m2: s.m2, wastePct: s.wastePct, cutList: s.cutList },
    flashings: t.flashings.lines,
    battens: t.flashings.battens,
    saved_at: now.toISOString(),
  };
}
