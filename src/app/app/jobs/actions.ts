"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { friendly, oneOf, str } from "@/lib/form";
import { JOB_STAGES, JOB_TYPES } from "@/lib/types";
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
      job_type: oneOf(fd, "job_type", JOB_TYPES, "replacement"),
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
      job_type: oneOf(fd, "job_type", JOB_TYPES, "replacement"),
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

export async function scheduleJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const start = str(fd, "scheduled_start");
  const end = str(fd, "scheduled_end") ?? start;
  if (start && end && end < start) return { error: "End date can't be before the start date." };
  const update: Record<string, unknown> = { scheduled_start: start, scheduled_end: start ? end : null, crew_id: str(fd, "crew_id") };
  // Scheduling a sold job moves it forward in the pipeline.
  const id = String(fd.get("id"));
  const { data: job } = await supabase.from("jobs").select("stage").eq("id", id).single();
  if (start && job && ["lead", "inspection", "estimate_sent", "sold"].includes(job.stage)) update.stage = "scheduled";
  const { error } = await supabase.from("jobs").update(update).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: start ? "Scheduled." : "Removed from the schedule." };
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
}

export async function deleteJob(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("jobs").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect("/app/jobs");
}
