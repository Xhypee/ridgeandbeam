import "server-only";
import type { requireOrg } from "./dal";

type Ctx = Awaited<ReturnType<typeof requireOrg>>;

/** A new draft quote for a job with the org's defaults (GST, supplier, terms, waste). */
export async function insertDraftEstimate({ supabase, org, user }: Ctx, jobId: string) {
  return supabase
    .from("estimates")
    .insert({
      org_id: org.id,
      job_id: jobId,
      tax_rate: org.gst_registered ? 10 : 0,
      gst_inclusive: org.prices_include_gst !== false,
      org_supplier_id: org.default_supplier_id ?? null,
      terms: org.estimate_terms,
      measurements: { units: "metric", wastePct: Number(org.default_waste_pct) },
      created_by: user.id,
    })
    .select("id")
    .single();
}
