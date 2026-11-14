"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { friendly, oneOf, str } from "@/lib/form";
import { CUSTOMER_SOURCES } from "@/lib/types";
import { AU_JOB_TYPES, AU_JOB_TYPE_LABEL, type AuJobType } from "@/lib/job-types";

// New lead's job cards: the picked type names the job ("Re-roof"); nothing picked keeps the old default.
const pickedType = (fd: FormData) => { const t = String(fd.get("job_type") ?? ""); return (AU_JOB_TYPES as readonly string[]).includes(t) ? (t as AuJobType) : null; };
const jobType = (fd: FormData) => { const t = pickedType(fd); return t ? { job_type: t } : {}; };
const jobTitle = (fd: FormData, insurance: boolean) => { const t = pickedType(fd); return t ? `${insurance ? "Insurance · " : ""}${AU_JOB_TYPE_LABEL[t]}` : insurance ? "Insurance roof inspection" : "Roof inspection"; };
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

export type CustomerMatch = { id: string; name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; jobs: number };

/** Contact lookup on New lead / New customer: existing customers by name, email or mobile (spaces in numbers ignored). */
export async function searchCustomers(q: string): Promise<CustomerMatch[]> {
  const { supabase } = await requireOrg();
  const term = q.trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const ors = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];
  // "0491570" also finds "0491 570 313"; +61 numbers match from their local part.
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits.replace(/^61/, "").split("").join("%")}%`);
  const { data } = await supabase.from("customers").select("id, name, phone, email, address, city, state, zip, jobs(id)").or(ors.join(",")).order("created_at", { ascending: false }).limit(6);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, state: c.state, zip: c.zip, jobs: Array.isArray(c.jobs) ? c.jobs.length : 0 }));
}

export async function createCustomer(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  // Picked an existing customer in the lookup: open the job for them instead of adding a duplicate.
  const existingId = str(fd, "customer_id");
  if (existingId) return jobForExisting(existingId, fd);
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
        title: str(fd, "job_title") ?? jobTitle(fd, insurance), ...jobType(fd),
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
  redirect("/app/contacts");
}

async function jobForExisting(customerId: string, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  const { data: c } = await supabase.from("customers").select("id, name, address, city, state, zip").eq("id", customerId).maybeSingle();
  if (!c) return { error: "That customer isn't in your list any more. Search again." };
  if (fd.get("create_job") !== "on") return { error: `${c.name} is already a customer. Tick “Also open a job” to start a new job for them.` };
  const claim = { carrier: str(fd, "insurance_company"), claim_number: str(fd, "claim_number"), adjuster_name: str(fd, "adjuster_name"), adjuster_phone: str(fd, "adjuster_phone") };
  const insurance = fd.get("job_kind") === "insurance" || Boolean(claim.carrier || claim.claim_number);
  // The site is what they entered, else the customer's own address.
  const typed = { address: str(fd, "address"), city: str(fd, "city"), state: str(fd, "state")?.toUpperCase() ?? null, zip: str(fd, "zip") };
  const site = typed.address ? typed : { address: c.address, city: c.city, state: c.state, zip: c.zip };
  const { data: job, error } = await supabase.from("jobs").insert({
    org_id: org.id, customer_id: c.id,
    title: str(fd, "job_title") ?? jobTitle(fd, insurance), ...jobType(fd),
    site_address: [site.address, site.city, site.state, site.zip].filter(Boolean).join(", ") || null,
    state: site.state, zip: site.zip, is_insurance: insurance, created_by: user.id,
    notes: str(fd, "notes"),
    ...(typed.address ? coords(fd) : {}),
  }).select("id").single();
  if (error) return { error: friendly(error) };
  if (insurance) {
    const { error: claimErr } = await supabase.from("claims").insert({ org_id: org.id, job_id: job.id, ...claim });
    if (claimErr) return { error: friendly(claimErr) };
  }
  revalidatePath("/app", "layout");
  const filter = str(fd, "filter");
  redirect(fd.get("return_to") === "board" ? `/app/jobs?${filter && /^[a-z]+$/.test(filter) ? `filter=${filter}&` : ""}job=${job.id}` : `/app/jobs/${job.id}`);
}
