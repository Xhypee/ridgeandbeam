"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { polygonAreaSqM } from "@/lib/geo";
import { normalizeMeasurements, round2, type RoofSection } from "@/lib/roof";
import type { ActionResult } from "@/components/action-form";

const pt = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const Payload = z.object({
  estimateId: z.string().uuid(),
  center: pt.optional(),
  zoom: z.number().min(1).max(22).optional(),
  facets: z
    .array(z.object({ label: z.string().trim().min(1).max(60), pitch: z.number().min(0).max(60), points: z.array(pt).min(3).max(200) }))
    .min(1, "Trace at least one roof facet first.")
    .max(60),
});

/**
 * Satellite self-measure -> estimate: write estimates.measurements.sections = [{label, area (plan m²), pitch (degrees)}]
 * and measurement_source = 'satellite', keeping every other measurements key. A traced facet keeps the roof type,
 * sheet profile and run/width of the existing section with the same name.
 */
export async function saveSatelliteMeasure(payload: unknown): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the facets." };
  const { estimateId, facets, center, zoom } = parsed.data;
  const { data: est } = await supabase.from("estimates").select("id, status, measurements").eq("id", estimateId).maybeSingle();
  if (!est) return { error: "Estimate not found." };
  if (est.status === "accepted") return { error: "This estimate is already accepted, so its measurements are locked." };

  // Area is recomputed on the server from the coordinates; the client's numbers are display only.
  const current = normalizeMeasurements(est.measurements);
  const fallback = current.sections[0];
  const sections: RoofSection[] = facets.map((f) => {
    const same = current.sections.find((s) => s.label === f.label);
    return {
      label: f.label,
      area: round2(polygonAreaSqM(f.points)),
      pitch: f.pitch,
      waste: same?.waste ?? null,
      system: same?.system ?? fallback?.system ?? "metal",
      ...(same?.profile ?? fallback?.profile ? { profile: same?.profile ?? fallback?.profile } : {}),
      ...(same?.runLength ? { runLength: same.runLength } : {}),
      ...(same?.width ? { width: same.width } : {}),
    };
  });
  if (sections.some((s) => s.area < 0.5)) return { error: "One of the facets has no area. Redraw it." };
  // Store the whole normalised (metric) measurements so older imperial keys can't be misread later.
  const measurements = {
    ...((est.measurements ?? {}) as Record<string, unknown>),
    ...current,
    sections,
    satellite: { units: "metric", facets, center, zoom, measured_at: new Date().toISOString() },
  };
  for (const k of ["eaves", "rakes", "ridges", "hips", "valleys", "layers"]) delete (measurements as Record<string, unknown>)[k];
  const { error } = await supabase.from("estimates").update({ measurements, measurement_source: "satellite" }).eq("id", estimateId);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/estimates/${estimateId}`);
  revalidatePath(`/app/measure/${estimateId}`);
  const total = sections.reduce((s, x) => s + x.area, 0);
  return { ok: `Saved ${sections.length} section${sections.length === 1 ? "" : "s"} (${round2(total).toLocaleString("en-AU")} m² plan area) to the quote.` };
}
