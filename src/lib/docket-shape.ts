// The roof drawing in the docket's header, honest to how the roof was measured:
//   plans     – the panels read off the architect's plans (measurements.plans);
//   satellite – the facets traced on the satellite map (measurements.satellite, lat/lng projected to metres, north up);
//   tiles     – sections typed in or imported: one rounded tile per section, sized by its area and labelled.
// Pure; computed on the server for both the roofer's and the customer's docket.

import { analyzeRoof, type PlanLine } from "./plans/roof-model";

type Pt = [number, number];
export type RoofTile = { label: string; area: number; x: number; y: number; size: number };
export type RoofShape =
  | { kind: "plans" | "satellite"; faces: Pt[][]; lines: [Pt, Pt][] }
  | { kind: "tiles"; tiles: RoofTile[] };

const r = (p: Pt): Pt => [Math.round(p[0]), Math.round(p[1])];

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
      kind: "plans",
      faces: a.faces.map((f) => f.pts.map(r)),
      lines: a.edges.filter((e) => e.type === "ridge" || e.type === "hip" || e.type === "valley").map((e) => [r(e.a), r(e.b)]),
    };
  } catch {
    return null;
  }
}

/**
 * Facets traced on the satellite map ([lat, lng] points) as plan shapes in millimetres, north up
 * (equirectangular about the roof's centre: plenty for a house).
 */
export function roofShapeFromSatellite(facets: unknown): RoofShape | null {
  if (!Array.isArray(facets)) return null;
  const polys = facets
    .map((f) => (Array.isArray((f as { points?: unknown })?.points) ? ((f as { points: unknown[] }).points as unknown[]) : []))
    .map((pts) => pts.filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))).map((p) => [Number(p[0]), Number(p[1])] as Pt))
    .filter((pts) => pts.length >= 3)
    .slice(0, 200);
  if (!polys.length) return null;
  const all = polys.flat();
  const lat0 = all.reduce((s, p) => s + p[0], 0) / all.length;
  const lng0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180) * 1000;
  const ky = 110574 * 1000;
  return { kind: "satellite", faces: polys.map((pts) => pts.map(([lat, lng]) => r([(lng - lng0) * kx, -(lat - lat0) * ky]))), lines: [] };
}

/** One rounded tile per section with an area, sized by that area (√m² a side), packed in rows. */
export function roofShapeFromSections(sections: unknown): RoofShape {
  const list = (Array.isArray(sections) ? sections : [])
    .map((s, i) => ({ label: String((s as { label?: unknown })?.label ?? `Section ${i + 1}`) || `Section ${i + 1}`, area: Number((s as { area?: unknown })?.area) || 0 }))
    .filter((s) => s.area > 0)
    .slice(0, 40);
  if (!list.length) return { kind: "tiles", tiles: [] };
  const sides = list.map((s) => Math.sqrt(s.area) * 1000);
  const gap = Math.max(...sides) * 0.08;
  const rowWidth = Math.max(Math.max(...sides), Math.sqrt(sides.reduce((s, x) => s + x * x, 0)) * 1.15);
  const tiles: RoofTile[] = [];
  let x = 0, y = 0, rowH = 0;
  list.forEach((s, i) => {
    const size = sides[i];
    if (x > 0 && x + size > rowWidth) { x = 0; y += rowH + gap; rowH = 0; }
    tiles.push({ label: s.label, area: s.area, x: Math.round(x), y: Math.round(y), size: Math.round(size) });
    x += size + gap;
    rowH = Math.max(rowH, size);
  });
  return { kind: "tiles", tiles };
}

/**
 * The drawing for a quote's measurements (estimates.measurements, or the public payload's roof object:
 * { plan | plans, satellite: facets | { facets }, sections }), plus the panel count when drawn from the plans.
 */
export function roofShape(measurements: unknown): { shape: RoofShape; panels: number | null } {
  const m = (measurements ?? {}) as { plans?: unknown; plan?: unknown; satellite?: unknown; sections?: unknown };
  const plan = roofShapeFromPlan(m.plan ?? m.plans);
  if (plan && plan.kind !== "tiles") return { shape: plan, panels: plan.faces.length };
  const sat = roofShapeFromSatellite(Array.isArray(m.satellite) ? m.satellite : (m.satellite as { facets?: unknown } | undefined)?.facets);
  if (sat) return { shape: sat, panels: null };
  return { shape: roofShapeFromSections(m.sections), panels: null };
}
