// Server-only: price a fresh draft quote straight from its measurements, the same lines "Fill line items from
// measurements" and the docket make (main roof, extras added and offered), from the company's price book and the
// quote's supplier sheet. Used when Claude measures the roof from dropped plans, so the quote has items and a
// total before anyone opens it. Only touches a draft with no lines yet.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fillQuoteLines, sectionsProfile } from "./docket";
import { quotePriceBook, usableCatalog } from "./docket-server";
import type { CatalogRow } from "./estimating";
import { normalizeMeasurements } from "./roof";

type Org = { id: string; prices_include_gst?: boolean | null; certifications?: string[] | null; default_waste_pct?: number | string | null; calc_defaults?: unknown };

export async function priceQuoteFromMeasurements(supabase: SupabaseClient, org: Org, estimateId: string): Promise<boolean> {
  const { data: est } = await supabase
    .from("estimates")
    .select("id, status, measurements, notes, terms, gst_inclusive, tax_rate, org_supplier_id, roof_profile, roof_colour, estimate_items(id), estimate_options!estimate_options_estimate_id_fkey(id, position, name, tier, description, warranty, recommended)")
    .eq("id", estimateId)
    .maybeSingle();
  if (!est || est.status !== "draft" || (est.estimate_items ?? []).length) return false;

  const m = normalizeMeasurements(est.measurements, Number(org.default_waste_pct ?? 10), org.calc_defaults);
  const { data: rows } = await supabase.from("catalog_items").select("*").order("category").order("calc_key").order("name");
  const catalog = usableCatalog((rows ?? []) as CatalogRow[], org);
  const { book } = await quotePriceBook(supabase, org, catalog, (est.org_supplier_id as string | null) ?? null);
  type O = { id: string; position: number; name: string; tier: "good" | "better" | "best" | null; description: string | null; warranty: string | null; recommended: boolean };
  const options = ((est.estimate_options ?? []) as O[]).sort((a, b) => a.position - b.position)
    .map((o) => ({ key: o.id, id: o.id, name: o.name, tier: o.tier, description: o.description ?? "", warranty: o.warranty ?? "", recommended: o.recommended }));
  const mode = { inclusive: Boolean(est.gst_inclusive), gstRatePct: Number(est.tax_rate) || 0 };
  const profile = (est.roof_profile as string | null) ?? sectionsProfile(m);
  const { items } = fillQuoteLines({ m, book, options, mode, colour: (est.roof_colour as string | null) ?? null });
  if (!items.length) return false;

  const { error } = await supabase.rpc("save_estimate_content", {
    p_id: est.id,
    p_estimate: { notes: est.notes, terms: est.terms, ...(profile ? { roof_profile: profile } : {}) },
    p_options: options,
    p_items: items,
  });
  return !error;
}
