"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { friendly, oneOf, str } from "@/lib/form";
import { CUSTOMER_SOURCES } from "@/lib/types";
import type { ActionResult } from "@/components/action-form";

// Insurance details now live on the job's claim (claims table). The legacy customer columns
// (insurance_company, claim_number, adjuster_*) are kept in the DB for history but no longer edited here.
function fields(fd: FormData) {
  return {
    name: str(fd, "name") ?? "",
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    address: str(fd, "address"),
    city: str(fd, "city"),
    state: str(fd, "state")?.toUpperCase() ?? null,
    zip: str(fd, "zip"),
    source: oneOf(fd, "source", CUSTOMER_SOURCES, "other"),
    notes: str(fd, "notes"),
    follow_up_on: str(fd, "follow_up_on"),
  };
}

/** lat/lng from the address lookup, only when both are real Australian-ish coordinates. */
function coords(fd: FormData): { lat?: number; lng?: number } {
  const lat = Number(fd.get("lat")), lng = Number(fd.get("lng"));
  if (!fd.get("lat") || !fd.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  return lat >= -45 && lat <= -9 && lng >= 112 && lng <= 155 ? { lat, lng } : {};
}

export async function createCustomer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  const f = fields(fd);
  if (!f.name) return { error: "Name is required." };
  const claim = {
    carrier: str(fd, "insurance_company"),
    claim_number: str(fd, "claim_number"),
    adjuster_name: str(fd, "adjuster_name"),
    adjuster_phone: str(fd, "adjuster_phone"),
  };
  const insurance = fd.get("job_kind") === "insurance" || Boolean(claim.carrier || claim.claim_number);
  const createJob = fd.get("create_job") === "on";
  if (insurance && !createJob) return { error: "An insurance claim belongs to a job. Tick “Also open a job” or choose Retail." };

  const { data, error } = await supabase.from("customers").insert({ ...f, org_id: org.id, created_by: user.id }).select("id").single();
  if (error) return { error: friendly(error) };

  // Optionally open a job right away (the common "new lead" flow).
  if (createJob) {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        org_id: org.id,
        customer_id: data.id,
        title: str(fd, "job_title") ?? (insurance ? "Insurance roof inspection" : "Roof inspection"),
        site_address: [f.address, f.city, f.state, f.zip].filter(Boolean).join(", ") || null,
        state: f.state,
        zip: f.zip,
        // From the Google Maps address lookup, when they picked a result.
        ...coords(fd),
        is_insurance: insurance,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (jobErr) return { error: friendly(jobErr) };
    if (insurance) {
      const { error: claimErr } = await supabase.from("claims").insert({ org_id: org.id, job_id: job.id, ...claim });
      if (claimErr) return { error: friendly(claimErr) };
    }
    revalidatePath("/app", "layout");
    // From the Jobs board's New lead sidebar: open the new job's docket on the board.
    if (fd.get("return_to") === "board") {
      const filter = str(fd, "filter");
      redirect(`/app/jobs?${filter && /^[a-z]+$/.test(filter) ? `filter=${filter}&` : ""}job=${job.id}`);
    }
    redirect(`/app/jobs/${job.id}`);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/customers/${data.id}`);
}

export async function updateCustomer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const f = fields(fd);
  if (!f.name) return { error: "Name is required." };
  const { error } = await supabase.from("customers").update(f).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

export async function deleteCustomer(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("customers").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect("/app/customers");
}
