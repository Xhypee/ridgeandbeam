"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import { CHECKLIST_KEYS, ITEM_STATUSES } from "@/lib/job-compliance";

const ROOF = ["metal", "concrete_tile", "terracotta_tile", "membrane"] as const;
const JOBT = ["re_roof", "restoration", "repair", "gutters", "asbestos_replacement", "new_build", "other"] as const;

const triBool = (v: FormDataEntryValue | null) => (v === "yes" ? true : v === "no" ? false : null);
const isOn = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

async function jobInOrg(jobId: string) {
  const ctx = await requireMoneyAccess();
  const { data: job } = await ctx.supabase.from("jobs").select("id, org_id").eq("id", jobId).eq("org_id", ctx.org.id).maybeSingle();
  return { ...ctx, job };
}

function by(ctx: { user: { id: string; email: string; fullName: string }; org: { id: string }; memberships: { org_id: string; full_name?: string | null }[] }) {
  const me = ctx.memberships.find((m) => m.org_id === ctx.org.id);
  return { updated_by: ctx.user.id, updated_by_name: me?.full_name || ctx.user.fullName || ctx.user.email };
}

/** Job facts that change which state rules apply. */
export async function saveComplianceProfile(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = z.uuid().safeParse(fd.get("job_id"));
  if (!jobId.success) return { error: "Job not found." };
  const ctx = await jobInOrg(jobId.data);
  if (!ctx.job) return { error: "Job not found." };
  const roof = str(fd, "roof_system");
  const jt = str(fd, "au_job_type");
  const copy = str(fd, "contract_copy_given_on");
  if (copy && !/^\d{4}-\d{2}-\d{2}$/.test(copy)) return { error: "Enter the date the owner got the signed copy." };
  const row = {
    job_id: ctx.job.id, org_id: ctx.job.org_id,
    roof_system: roof && (ROOF as readonly string[]).includes(roof) ? roof : null,
    au_job_type: jt && (JOBT as readonly string[]).includes(jt) ? jt : null,
    owner_occupier: fd.get("owner_occupier") !== "no",
    existing_house: fd.get("existing_house") !== "no",
    building_approval_required: triBool(fd.get("building_approval_required")),
    built_before_1990: triBool(fd.get("built_before_1990")),
    door_knock_sale: triBool(fd.get("door_knock_sale")),
    urgent_work: isOn(fd, "urgent_work"),
    paint_or_coat_only: isOn(fd, "paint_or_coat_only"),
    mixed_work: isOn(fd, "mixed_work"),
    subcontract: isOn(fd, "subcontract"),
    disaster_emergency_repair: isOn(fd, "disaster_emergency_repair"),
    contract_copy_given_on: copy,
    updated_by: ctx.user.id,
  };
  const { error } = await ctx.supabase.from("job_compliance_profiles").upsert(row, { onConflict: "job_id" });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${ctx.job.id}`, "layout");
  return { ok: "Job details saved — the checklist has been updated." };
}

const ItemSchema = z.object({
  job_id: z.uuid(),
  item_key: z.enum(CHECKLIST_KEYS),
  status: z.enum(ITEM_STATUSES as [string, ...string[]]),
  note: z.string().trim().max(1000).nullable(),
  reference: z.string().trim().max(200).nullable(),
  file_id: z.uuid().nullable(),
});

/** Tick an item (done / to do / not needed), with an optional note, reference number and evidence file. */
export async function setComplianceItem(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const p = ItemSchema.safeParse({
    job_id: fd.get("job_id"), item_key: fd.get("item_key"), status: fd.get("status"),
    note: str(fd, "note"), reference: str(fd, "reference"), file_id: str(fd, "file_id"),
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid checklist update." };
  const ctx = await jobInOrg(p.data.job_id);
  if (!ctx.job) return { error: "Job not found." };
  if (p.data.file_id) {
    const { data: f } = await ctx.supabase.from("job_files").select("id").eq("id", p.data.file_id).eq("job_id", ctx.job.id).maybeSingle();
    if (!f) return { error: "That file isn't on this job." };
  }
  const { error } = await ctx.supabase.from("job_compliance_items").upsert({
    org_id: ctx.job.org_id, job_id: ctx.job.id, item_key: p.data.item_key, status: p.data.status,
    note: p.data.note, reference: p.data.reference, file_id: p.data.file_id, ...by(ctx),
  }, { onConflict: "job_id,item_key" });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${ctx.job.id}`, "layout");
  return { ok: p.data.status === "done" ? "Marked done." : p.data.status === "not_needed" ? "Marked not needed." : "Saved." };
}

/** Forget the manual tick so the item goes back to the automatic status. */
export async function resetComplianceItem(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = z.uuid().safeParse(fd.get("job_id"));
  const key = z.enum(CHECKLIST_KEYS).safeParse(fd.get("item_key"));
  if (!jobId.success || !key.success) return { error: "Invalid item." };
  const ctx = await jobInOrg(jobId.data);
  if (!ctx.job) return { error: "Job not found." };
  const { error } = await ctx.supabase.from("job_compliance_items").delete().eq("job_id", ctx.job.id).eq("item_key", key.data);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${ctx.job.id}`, "layout");
  return { ok: "Back to automatic." };
}

const UploadSchema = z.object({
  jobId: z.uuid(),
  itemKey: z.enum(CHECKLIST_KEYS),
  path: z.string().min(10).max(500),
  name: z.string().trim().min(1).max(200),
  mime: z.string().max(120).nullable(),
  size: z.number().int().min(1).max(50 * 1024 * 1024),
  title: z.string().trim().max(200),
});

/**
 * After the browser uploads evidence straight to storage (bucket job-files, path <org>/<job>/compliance/...),
 * record it as a job file and link it to the checklist item (which is then marked done).
 */
export async function attachUploadedEvidence(input: z.input<typeof UploadSchema>): Promise<ActionResult & { fileId?: string }> {
  const p = UploadSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid upload." };
  const ctx = await jobInOrg(p.data.jobId);
  if (!ctx.job) return { error: "Job not found." };
  if (!p.data.path.startsWith(`${ctx.job.org_id}/${ctx.job.id}/compliance/`) || p.data.path.includes("..")) return { error: "Upload path doesn't match this job." };
  const isImage = (p.data.mime ?? "").startsWith("image/");
  const { data: file, error } = await ctx.supabase.from("job_files").insert({
    org_id: ctx.job.org_id, job_id: ctx.job.id, kind: isImage ? "photo" : "document", category: "document", storage_path: p.data.path,
    mime_type: p.data.mime, size_bytes: p.data.size, caption: `${p.data.title}: ${p.data.name}`.slice(0, 500), uploaded_by: ctx.user.id,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  const { data: existing } = await ctx.supabase.from("job_compliance_items").select("status, note, reference").eq("job_id", ctx.job.id).eq("item_key", p.data.itemKey).maybeSingle();
  const { error: e2 } = await ctx.supabase.from("job_compliance_items").upsert({
    org_id: ctx.job.org_id, job_id: ctx.job.id, item_key: p.data.itemKey, status: existing?.status === "not_needed" ? "not_needed" : "done",
    note: existing?.note ?? null, reference: existing?.reference ?? null, file_id: file.id, ...by(ctx),
  }, { onConflict: "job_id,item_key" });
  if (e2) return { error: friendly(e2) };
  revalidatePath(`/app/jobs/${ctx.job.id}`, "layout");
  return { ok: "Evidence uploaded and linked.", fileId: file.id };
}
