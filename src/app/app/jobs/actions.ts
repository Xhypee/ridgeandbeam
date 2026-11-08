"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { friendly, oneOf, str } from "@/lib/form";
import { loadReadiness } from "@/lib/production-server";
import { AU_JOB_TYPES } from "@/lib/job-types";
import { JOB_STAGES } from "@/lib/types";
import type { ActionResult } from "@/components/action-form";

export async function createJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  const customerId = str(fd, "customer_id");
  const title = str(fd, "title");
  if (!customerId) return { error: "Choose a customer." };
  if (!title) return { error: "Give the job a title." };
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      org_id: org.id,
      customer_id: customerId,
      title,
      job_type: oneOf(fd, "job_type", AU_JOB_TYPES, "replacement"),
      site_address: str(fd, "site_address"),
      roof_material: str(fd, "roof_material"),
      is_insurance: fd.get("is_insurance") === "on",
      notes: str(fd, "notes"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/jobs/${data.id}`);
}

export async function updateJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const title = str(fd, "title");
  if (!title) return { error: "Title is required." };
  const { error } = await supabase
    .from("jobs")
    .update({
      title,
      job_type: oneOf(fd, "job_type", AU_JOB_TYPES, "replacement"),
      site_address: str(fd, "site_address"),
      roof_material: str(fd, "roof_material"),
      is_insurance: fd.get("is_insurance") === "on",
      notes: str(fd, "notes"),
    })
    .eq("id", String(fd.get("id")));
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

export async function setStage(fd: FormData) {
  const { supabase } = await requireOrg();
  const stage = oneOf(fd, "stage", JOB_STAGES, "lead");
  const { error } = await supabase.from("jobs").update({ stage }).eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
}

/**
 * Save dates + crew. Jobs are "tentative" until locked; changing the dates or crew of a locked job
 * unlocks it again. With `lock=1` the job is also locked, but only when readiness is all green
 * (see jobReadiness in src/lib/production.ts).
 */
export async function scheduleJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Ask the office to change the schedule." };
  const start = str(fd, "scheduled_start");
  const end = str(fd, "scheduled_end") ?? start;
  if (start && end && end < start) return { error: "End date can't be before the start date." };
  const crewId = str(fd, "crew_id");
  const wantLock = fd.get("lock") === "1";
  const id = String(fd.get("id"));
  const { data: job } = await supabase.from("jobs").select("stage, scheduled_start, scheduled_end, crew_id, schedule_locked").eq("id", id).single();
  if (!job) return { error: "Job not found." };
  const update: Record<string, unknown> = { scheduled_start: start, scheduled_end: start ? end : null, crew_id: crewId };
  // Scheduling a sold job moves it forward in the pipeline.
  if (start && ["lead", "inspection", "estimate_sent", "sold"].includes(job.stage)) update.stage = "scheduled";
  const changed = job.scheduled_start !== start || (job.scheduled_end ?? null) !== (start ? end : null) || (job.crew_id ?? null) !== crewId;
  let note = "";
  if (!start) update.schedule_locked = false;
  else if (changed && job.schedule_locked) { update.schedule_locked = false; note = " Dates changed, so the lock was removed."; }
  if (wantLock) {
    if (!start || !crewId) return { error: "Pick start date and crew before locking the schedule." };
    const r = await loadReadiness(supabase, id, { scheduled_start: start });
    if (!r?.ready) return { error: `Not ready to lock: ${r?.blockers.map((b) => b.label).join(", ") ?? "unknown job"}.` };
    update.schedule_locked = true;
    note = "";
  }
  const { error } = await supabase.from("jobs").update(update).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  if (!start) return { ok: "Removed from the schedule." };
  return { ok: (update.schedule_locked === true ? "Schedule locked." : "Scheduled. Tentative until you lock it on the Production tab.") + note };
}

export async function addNote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, memberships } = await requireOrg();
  const body = str(fd, "body");
  if (!body) return { error: "Write something first." };
  const me = memberships.find((m) => m.org_id === org.id);
  const { error } = await supabase.from("job_notes").insert({
    org_id: org.id,
    job_id: String(fd.get("job_id")),
    body,
    author_id: user.id,
    author_name: me?.full_name || user.fullName || user.email,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${fd.get("job_id")}`);
  revalidatePath("/app/jobs");
}

export async function deleteJob(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("jobs").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect("/app/jobs");
}
