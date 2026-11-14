"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";

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
export async function attachJobFile(input: z.input<typeof Schema>): Promise<ActionResult> {
  const p = Schema.safeParse(input);
  if (!p.success) return { error: "That upload didn't look right. Try again." };
  const { supabase, org, user, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Ask the office to add files to this job." };
  const { data: job } = await supabase.from("jobs").select("id, org_id").eq("id", p.data.jobId).maybeSingle();
  if (!job || job.org_id !== org.id) return { error: "Job not found." };
  if (!p.data.path.startsWith(`${org.id}/${job.id}/files/`) || p.data.path.includes("..")) return { error: "Upload path doesn't match this job." };
  const isImage = (p.data.mime ?? "").startsWith("image/");
  const { error } = await supabase.from("job_files").insert({
    org_id: org.id, job_id: job.id, kind: isImage && p.data.category !== "plans" ? "photo" : "document", category: p.data.category,
    storage_path: p.data.path, mime_type: p.data.mime, size_bytes: p.data.size, caption: p.data.name.slice(0, 500), uploaded_by: user.id,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${job.id}/files`);
  revalidatePath("/app/jobs");
  return { ok: "Uploaded." };
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
