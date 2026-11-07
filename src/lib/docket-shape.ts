// The roof drawing in the docket's header: the panels read off the plans (measurements.plans), or a simple hip roof
// when the roof was measured another way (satellite, report, by hand). Pure; computed on the server.

import { analyzeRoof, type PlanLine } from "./plans/roof-model";

type Pt = [number, number];
export type RoofShape = {
  /** Panel outlines in plan (real mm, y down). */
  faces: Pt[][];
  /** Ridges, hips and valleys. */
  lines: [Pt, Pt][];
  /** True when drawn from the plans; false = the generic outline. */
  fromPlans: boolean;
};

const r = (p: Pt): Pt => [Math.round(p[0]), Math.round(p[1])];

/** A plain hip roof (12 m × 8 m) for quotes without a drawn roof. */
export const GENERIC_ROOF: RoofShape = {
  faces: [
    [[0, 8000], [12000, 8000], [8000, 4000], [4000, 4000]],
    [[0, 0], [4000, 4000], [8000, 4000], [12000, 0]],
    [[0, 0], [0, 8000], [4000, 4000]],
    [[12000, 0], [12000, 8000], [8000, 4000]],
  ],
  lines: [[[4000, 4000], [8000, 4000]], [[0, 0], [4000, 4000]], [[0, 8000], [4000, 4000]], [[12000, 0], [8000, 4000]], [[12000, 8000], [8000, 4000]]],
  fromPlans: false,
};

/** The shape from a saved plans snapshot ({ lines, scale, pitch }), or null when it doesn't make a roof. */
export function roofShapeFromPlan(plan: unknown): RoofShape | null {
  if (!plan || typeof plan !== "object") return null;
  const p = plan as { lines?: unknown; scale?: unknown; pitch?: unknown };
  if (!Array.isArray(p.lines) || p.lines.length < 3) return null;
  const lines = (p.lines as PlanLine[]).filter((l) => Array.isArray(l?.a) && Array.isArray(l?.b)).slice(0, 4000);
  try {
    const a = analyzeRoof({ scale: Number(p.scale) || 100, pitch: Number(p.pitch) || 22.5, lines });
    if (!a.faces.length) return null;
    return {
      faces: a.faces.map((f) => f.pts.map(r)),
      lines: a.edges.filter((e) => e.type === "ridge" || e.type === "hip" || e.type === "valley").map((e) => [r(e.a), r(e.b)]),
      fromPlans: true,
    };
  } catch {
    return null;
  }
}

/** Shape + panel count for the docket header. */
export function roofShape(measurements: unknown): { shape: RoofShape; panels: number | null } {
  const plan = (measurements as { plans?: unknown } | null)?.plans;
  const s = roofShapeFromPlan(plan);
  return s ? { shape: s, panels: s.faces.length } : { shape: GENERIC_ROOF, panels: null };
}
