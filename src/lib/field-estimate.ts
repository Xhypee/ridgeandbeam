import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fallback reader for the accepted estimate's items (contract 5) until B's
 * `acceptedEstimateTotal` in src/lib/estimate-totals.ts lands; the coordinator can swap it in.
 * Items = shared items (option_id null) + the selected option's items.
 */
export async function acceptedEstimateItems(db: SupabaseClient, jobId: string) {
  const { data: est } = await db.from("estimates").select("id, selected_option_id").eq("job_id", jobId).eq("status", "accepted")
    .order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (!est) return null;
  const { data: items } = await db.from("estimate_items").select("description, quantity, unit, unit_price, unit_cost, calc_key, category, option_id").eq("estimate_id", est.id).order("position");
  const list = (items ?? []).filter((i) => i.option_id === null || i.option_id === est.selected_option_id);
  return { estimateId: est.id as string, optionId: est.selected_option_id as string | null, items: list };
}

/** Product names worth lodging a manufacturer warranty for: roof sheeting, tiles, membrane, coatings and warranty lines from the accepted estimate. */
export async function warrantyProducts(db: SupabaseClient, jobId: string) {
  const est = await acceptedEstimateItems(db, jobId);
  if (!est) return [];
  const names = est.items
    .filter((i) => ["metal_sheet", "roof_tile", "membrane_roof", "roof_coating", "warranty"].includes(i.calc_key ?? "") || /colorbond|zincalume|warranty|system/i.test(i.description))
    .map((i) => i.description as string);
  return [...new Set(names)];
}
