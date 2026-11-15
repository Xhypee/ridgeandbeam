// The numbers on the New lead plan sheet (the "dimensioned drawing"): roof area, pitch, ridge / hips / eave, and
// the roof's rough length × width. Claude measures lengths, not the outline, so length × width is worked out from
// the plan area and the eave length (a rectangle with that area and perimeter) and always shown as approximate.
import type { Measurements, RoofSummary } from "./roof";

export type RoofSheet = {
  area: string;
  pitch: string | null;
  /** About how long and wide the roof is, with the ratio the drawing is drawn at. Null when it can't be worked out. */
  dims: { long: string; short: string; ratio: number } | null;
  foot: string | null;
};

const n = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-AU");

/** Length and width of a rectangle with this area and perimeter (null when there isn't one, or it's a sliver). */
export function rectFromAreaPerimeter(area: number, perimeter: number): { long: number; short: number } | null {
  if (!(area > 0) || !(perimeter > 0)) return null;
  const half = perimeter / 2;
  const disc = half * half - 4 * area;
  if (disc < 0) return null;
  const long = (half + Math.sqrt(disc)) / 2, short = (half - Math.sqrt(disc)) / 2;
  return short >= 2 && long / short <= 8 ? { long, short } : null;
}

export function roofSheet(summary: RoofSummary, m: Pick<Measurements, "ridge" | "hip"> & { eave?: number | null }): RoofSheet {
  const ridge = Number(m.ridge) || 0, hip = Number(m.hip) || 0, eave = Number(m.eave) || 0;
  const rect = rectFromAreaPerimeter(summary.planArea, eave);
  return {
    area: `${Math.round(summary.trueArea).toLocaleString("en-AU")} m²`,
    pitch: summary.maxPitch > 0 ? `${n(summary.maxPitch)}° pitch` : null,
    dims: rect ? { long: `${n(rect.long)} m`, short: `${n(rect.short)} m`, ratio: rect.long / rect.short } : null,
    foot: [ridge > 0 ? `ridge ${n(ridge)}` : null, hip > 0 ? `hips ${n(hip)}` : null, eave > 0 ? `eave ${n(eave)} m` : null].filter(Boolean).join(" · ") || null,
  };
}
