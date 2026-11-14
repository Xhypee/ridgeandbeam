"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { aiEnabled, readJobDocument } from "@/lib/ai";
import { intakeNote, planDocUpdates, roofMeasurementsFromDoc, DOC_TYPE_LABEL, type Current } from "@/lib/doc-intake";
import { normalizeMeasurements, summarize } from "@/lib/roof";

const Schema = z.object({
  jobId: z.uuid(),
  path: z.string().min(10).max(400),
  name: z.string().max(200),
  mime: z.string().max(120).nullable(),
  size: z.number().int().min(0).max(100 * 1024 * 1024),
  category: z.enum(["plans", "document"]),
});

/** Where a new upload for this job goes in storage (the org folder comes from the server, not the browser). */
export async function prepareJobUpload(jobId: string, name: string): Promise<{ path?: string; error?: string }> {
  if (!z.uuid().safeParse(jobId).success) return { error: "Job not found." };
  const { supabase, org, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Ask the office to add files to this job." };
  const { data: job } = await supabase.from("jobs").select("id, org_id").eq("id", jobId).maybeSingle();
  if (!job || job.org_id !== org.id) return { error: "Job not found." };
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
  return { path: `${org.id}/${job.id}/files/${crypto.randomUUID()}-${safe}` };
}

/** Record a file uploaded straight to job storage (plans, contracts, reports…). */
export async function attachJobFile(input: z.input<typeof Schema>): Promise<{ error?: string; ok?: string; id?: string }> {
  const p = Schema.safeParse(input);
  if (!p.success) return { error: "That upload didn't look right. Try again." };
  const { supabase, org, user, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Ask the office to add files to this job." };
  const { data: job } = await supabase.from("jobs").select("id, org_id").eq("id", p.data.jobId).maybeSingle();
  if (!job || job.org_id !== org.id) return { error: "Job not found." };
  if (!p.data.path.startsWith(`${org.id}/${job.id}/files/`) || p.data.path.includes("..")) return { error: "Upload path doesn't match this job." };
  const isImage = (p.data.mime ?? "").startsWith("image/");
  const { data: row, error } = await supabase.from("job_files").insert({
    org_id: org.id, job_id: job.id, kind: isImage && p.data.category !== "plans" ? "photo" : "document", category: p.data.category,
    storage_path: p.data.path, mime_type: p.data.mime, size_bytes: p.data.size, caption: p.data.name.slice(0, 500), uploaded_by: user.id,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${job.id}/files`);
  revalidatePath("/app/jobs");
  return { ok: "Uploaded.", id: row.id as string };
}

/** Remove a plan or document from the job (and from storage). */
export async function deleteJobFile(fd: FormData) {
  const { supabase, isCrewLead } = await requireOrg();
  if (isCrewLead) return;
  const id = String(fd.get("id"));
  const { data: f } = await supabase.from("job_files").select("id, job_id, storage_path, kind").eq("id", id).maybeSingle();
  if (!f || f.kind === "photo") return;
  const { error } = await supabase.from("job_files").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
  await supabase.storage.from("job-files").remove([f.storage_path]);
  revalidatePath(`/app/jobs/${f.job_id}/files`);
  revalidatePath("/app/jobs");
}

export type DocIntakeResult = { name: string; status: "read" | "skipped" | "off" | "failed"; type?: string; summary?: string | null; filled?: string[]; differs?: string[]; hints?: string[]; measured?: string | null };

/**
 * After a file lands in a job's Documents: Claude reads it and fills empty fields on the customer, job and
 * insurance claim (never overwriting), files plans as plans, and leaves a note on the job saying what it did.
 */
/** `estimateId`: dropped on that quote's roof plan, so roof measurements Claude finds fill it in (draft, not yet measured). */
export async function readUploadedDocument(fileId: string, estimateId?: string): Promise<DocIntakeResult> {
  const { supabase, org, user, memberships, isCrewLead } = await requireOrg();
  const { data: f } = await supabase.from("job_files").select("id, job_id, storage_path, mime_type, size_bytes, caption").eq("id", fileId).maybeSingle();
  const name = (f?.caption as string | null) ?? "file";
  if (!f || isCrewLead) return { name, status: "failed" };
  if (!aiEnabled()) return { name, status: "off" };
  const mime = (f.mime_type as string | null) ?? "";
  const readable = mime === "application/pdf" || /^image\/(jpeg|png|gif|webp)$/.test(mime) || /^text\//.test(mime) || /\.(txt|csv|eml)$/i.test(name);
  if (!readable || Number(f.size_bytes ?? 0) > 20 * 1024 * 1024) return { name, status: "skipped" };

  const [{ data: blob }, { data: job }, { data: claim }] = await Promise.all([
    supabase.storage.from("job-files").download(f.storage_path as string),
    supabase.from("jobs").select("id, customer_id, site_address, state, zip, roof_material, is_insurance, customers(phone, email, address, city, state, zip)").eq("id", f.job_id).maybeSingle(),
    supabase.from("claims").select("id, carrier, claim_number, policy_number, adjuster_name, adjuster_phone, adjuster_email, excess, date_of_loss").eq("job_id", f.job_id).maybeSingle(),
  ]);
  if (!blob || !job) return { name, status: "failed" };
  const read = await readJobDocument(Buffer.from(await blob.arrayBuffer()), mime, name);
  if (!read) return { name, status: "failed" };

  const c = (Array.isArray(job.customers) ? job.customers[0] : job.customers) as Current["customer"] | null;
  const cur: Current = {
    customer: c ?? { phone: null, email: null, address: null, city: null, state: null, zip: null },
    job: { site_address: job.site_address, state: job.state, zip: job.zip, roof_material: job.roof_material, is_insurance: job.is_insurance },
    claim: claim ? { ...claim, excess: claim.excess === null ? null : Number(claim.excess) } as Current["claim"] : null,
  };
  const plan = planDocUpdates(read, cur);

  // Apply: only the empty fields the plan picked. Each write is separate so one failure doesn't block the rest.
  if (Object.keys(plan.customer).length && job.customer_id) await supabase.from("customers").update(plan.customer).eq("id", job.customer_id);
  if (Object.keys(plan.job).length) await supabase.from("jobs").update(plan.job).eq("id", job.id);
  if (plan.createClaim) await supabase.from("claims").insert({ org_id: org.id, job_id: job.id, ...(plan.claim ?? {}) });
  else if (plan.claim && claim) await supabase.from("claims").update(plan.claim).eq("id", claim.id);
  if (plan.category !== "document") await supabase.from("job_files").update({ category: plan.category }).eq("id", f.id);

  // Dropped on a quote's empty roof plan: measurements from plans or a roof report fill it in. Only a draft that
  // isn't measured yet, and only the first file that has them (the others are noted, not applied).
  let measured: string | null = null;
  if (estimateId && /^[0-9a-f-]{36}$/i.test(estimateId)) {
    const { data: est } = await supabase.from("estimates").select("id, job_id, status, measurements, measurement_source").eq("id", estimateId).maybeSingle();
    if (est && est.job_id === job.id && est.status === "draft" && est.measurement_source !== "documents" && summarize(normalizeMeasurements(est.measurements)).trueArea === 0) {
      const m = roofMeasurementsFromDoc(read.roof, read.job.roof_material ?? job.roof_material, est.measurements);
      if (m) {
        const { data: saved } = await supabase.from("estimates").update({ measurements: m.measurements, measurement_source: "documents" })
          .eq("id", est.id).or("measurement_source.is.null,measurement_source.neq.documents").select("id");
        if (saved?.length) {
          measured = m.label;
          plan.filled.push(`${m.label} on the quote`);
          plan.hints = plan.hints.filter((h) => !h.startsWith("Roof area on the plans"));
          revalidatePath(`/app/estimates/${est.id}`);
        }
      }
    }
  }

  const me = memberships.find((m) => m.org_id === org.id);
  await supabase.from("job_notes").insert({ org_id: org.id, job_id: job.id, body: intakeNote(name, read, plan), author_id: user.id, author_name: `Claude (for ${me?.full_name || user.fullName || user.email})` });
  revalidatePath("/app/jobs");
  revalidatePath(`/app/jobs/${job.id}`, "layout");
  return { name, status: "read", type: DOC_TYPE_LABEL[read.doc_type], summary: read.summary, filled: plan.filled, differs: plan.differs, hints: plan.hints, measured };
}
