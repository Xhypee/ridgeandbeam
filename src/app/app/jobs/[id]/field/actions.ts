"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { STATUS_ACTIONS, statusSms, FILE_CATEGORIES, SLOPES } from "@/lib/field";
import { friendly } from "@/lib/form";
import { siteUrl } from "@/lib/format";
import { sendSms } from "@/lib/notify";

type Result = { ok?: string; error?: string; notified?: string | null };

const KINDS = ["note", ...STATUS_ACTIONS.map((a) => a.kind as string)] as [string, ...string[]];

const EventSchema = z.object({
  jobId: z.uuid(),
  clientId: z.string().min(8).max(80),
  kind: z.enum(KINDS),
  note: z.string().trim().max(1000).nullable().optional(),
  fileClientId: z.string().max(80).nullable().optional(),
  fileId: z.uuid().nullable().optional(),
  visible: z.boolean().optional(),
});

const EARLY = ["lead", "inspection", "estimate_sent", "sold", "scheduled"];

/**
 * One-tap status action (X3). Idempotent by clientId so the offline queue can retry safely.
 * Creates a job_events row, advances the job where it makes sense, and texts the homeowner
 * (unless the job has "Don't notify homeowner" on).
 */
export async function postStatusEvent(input: z.input<typeof EventSchema>): Promise<Result> {
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  const p = parsed.data;
  const { supabase, org, user, memberships } = await requireOrg();
  const me = memberships.find((m) => m.org_id === org.id);

  const { data: existing } = await supabase.from("job_events").select("id").eq("org_id", org.id).eq("client_id", p.clientId).maybeSingle();
  if (existing) return { ok: "Already posted." };

  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, stage, notify_homeowner, public_token, materials_status, customer_id, customers(phone)")
    .eq("id", p.jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found." };
  if (p.kind === "note" && !p.note) return { error: "Type a note first." };

  let fileId = p.fileId ?? null;
  if (!fileId && p.fileClientId) {
    const { data: f } = await supabase.from("job_files").select("id").eq("org_id", org.id).eq("client_id", p.fileClientId).maybeSingle();
    fileId = f?.id ?? null;
  }

  const { data: ev, error } = await supabase
    .from("job_events")
    .insert({
      org_id: job.org_id, job_id: job.id, client_id: p.clientId, kind: p.kind, note: p.note || null, file_id: fileId,
      visible_to_homeowner: p.visible ?? true, created_by: user.id, created_by_name: me?.full_name || user.fullName || user.email,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: "Already posted." };
    return { error: friendly(error) };
  }

  const upd: Record<string, unknown> = {};
  if (p.kind === "tear_off_started" && EARLY.includes(job.stage)) upd.stage = "in_progress";
  if (p.kind === "completed" && !["completed", "paid"].includes(job.stage)) upd.stage = "completed";
  if (p.kind === "materials_delivered" && job.materials_status !== "delivered") upd.materials_status = "delivered";
  if (fileId && p.kind !== "note") {
    const cat = p.kind === "materials_delivered" ? "delivery" : p.kind === "completed" || p.kind === "cleanup_verified" ? "completion" : "progress";
    await supabase.from("job_files").update({ category: cat }).eq("id", fileId).eq("category", "other");
  }
  if (Object.keys(upd).length) await supabase.from("jobs").update(upd).eq("id", job.id);

  let notified: string | null = null;
  const phone = (job.customers as unknown as { phone: string | null } | null)?.phone;
  if (job.notify_homeowner && (p.visible ?? true)) {
    if (phone) {
      const r = await sendSms(supabase, {
        orgId: job.org_id, jobId: job.id, customerId: job.customer_id, to: phone,
        body: statusSms(p.kind, org.name, `${siteUrl()}/p/${job.public_token}`, p.note),
      });
      await supabase.from("job_events").update({ notified: r.status === "sent" || r.status === "not_configured" }).eq("id", ev.id);
      notified = r.status === "sent" ? "Homeowner texted." : r.status === "not_configured" ? "Homeowner text logged (SMS provider not set up)." : `Text failed: ${r.error}`;
    } else notified = "No homeowner phone on file — not texted.";
  }
  revalidatePath(`/app/jobs/${job.id}`, "layout");
  return { ok: "Posted.", notified };
}

export async function setNotifyHomeowner(jobId: string, notify: boolean): Promise<Result> {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("jobs").update({ notify_homeowner: notify }).eq("id", z.uuid().parse(jobId));
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${jobId}/field`);
  return { ok: notify ? "Homeowner will get texts." : "Homeowner texts paused for this job." };
}

const FileSchema = z.object({
  id: z.uuid(),
  caption: z.string().trim().max(500).nullable().optional(),
  slope: z.enum(SLOPES).nullable().optional(),
  category: z.enum(FILE_CATEGORIES).optional(),
  test_square_hits: z.number().int().min(0).max(999).nullable().optional(),
  shared_with_homeowner: z.boolean().optional(),
});

export async function updateFile(input: z.input<typeof FileSchema>): Promise<Result> {
  const parsed = FileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid." };
  const { id, ...patch } = parsed.data;
  const { supabase } = await requireOrg();
  const { data, error } = await supabase.from("job_files").update(patch).eq("id", id).select("job_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (data) revalidatePath(`/app/jobs/${data.job_id}`, "layout");
  return { ok: "Saved." };
}

export async function deleteFile(id: string): Promise<Result> {
  const { supabase } = await requireOrg();
  const { data: f } = await supabase.from("job_files").select("id, job_id, storage_path, annotations").eq("id", z.uuid().parse(id)).maybeSingle();
  if (!f) return { error: "Already deleted." };
  const paths = [f.storage_path, (f.annotations as { original_path?: string } | null)?.original_path].filter(Boolean) as string[];
  const { error } = await supabase.from("job_files").delete().eq("id", f.id);
  if (error) return { error: friendly(error) };
  await supabase.storage.from("job-files").remove(paths);
  revalidatePath(`/app/jobs/${f.job_id}`, "layout");
  return { ok: "Deleted." };
}

/** Texts the homeowner portal link. */
export async function textPortalLink(jobId: string): Promise<Result> {
  const { supabase, org } = await requireOrg();
  const { data: job } = await supabase.from("jobs").select("id, public_token, customer_id, customers(name, phone)").eq("id", z.uuid().parse(jobId)).maybeSingle();
  if (!job) return { error: "Job not found." };
  const c = job.customers as unknown as { name: string; phone: string | null } | null;
  if (!c?.phone) return { error: "Add a phone number to the customer first." };
  const first = c.name.split(" ")[0];
  const r = await sendSms(supabase, {
    orgId: org.id, jobId: job.id, customerId: job.customer_id, to: c.phone,
    body: `Hi ${first}, this is ${org.name}. Follow your roof project — photos, schedule and documents — here: ${siteUrl()}/p/${job.public_token}`,
  });
  if (r.status === "failed") return { error: `Text failed: ${r.error}` };
  return { ok: r.status === "sent" ? "Link texted to the homeowner." : "Text logged (SMS provider not set up yet)." };
}
