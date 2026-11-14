"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyAccess, requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import { notifyUser, sendSms } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";
import { asAuState, AU_STATE_TZ } from "@/lib/au";
import { inspectionLabel, inspectionSms, localToUtc, LOST_REASON_LABEL, LOST_REASONS } from "@/lib/lead-steps";

const FIN_STATUSES = ["link_sent", "prequalified", "approved", "declined", "funded", "cancelled"] as const;

/** Assignment, setter attribution, lead source and (commercial) bid due date. */
export async function saveLeadInfo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Crew leads can't reassign jobs." };
  const id = String(fd.get("id") ?? "");
  const { data: members } = await supabase.from("memberships").select("user_id").eq("org_id", org.id);
  const ids = new Set((members ?? []).map((m) => m.user_id));
  const person = (k: string) => {
    const v = str(fd, k);
    return v && ids.has(v) ? v : null;
  };
  const bid = str(fd, "bid_due_on");
  if (bid && !/^\d{4}-\d{2}-\d{2}$/.test(bid)) return { error: "Bid due date isn't a valid date." };
  const { data: before } = await supabase.from("jobs").select("assigned_to, title").eq("id", id).maybeSingle();
  if (!before) return { error: "Job not found." };
  const assigned = person("assigned_to");
  const { error } = await supabase
    .from("jobs")
    .update({ assigned_to: assigned, sales_rep_id: person("sales_rep_id"), setter_id: person("setter_id"), lead_source: str(fd, "lead_source")?.slice(0, 100) ?? null, bid_due_on: bid })
    .eq("id", id);
  if (error) return { error: friendly(error) };
  if (assigned && assigned !== before.assigned_to && assigned !== user.id) {
    await notifyUser(supabase, { orgId: org.id, userId: assigned, kind: "job_assigned", title: `Assigned to you: ${before.title}`, url: `/app/jobs/${id}` });
  }
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

/** Records the first contact (speed-to-lead). Idempotent: keeps the earliest time. */
export async function markContacted(fd: FormData) {
  const { supabase, org, user, memberships } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  const { data: job } = await supabase.from("jobs").select("first_contacted_at, assigned_to").eq("id", id).maybeSingle();
  if (!job) throw new Error("Job not found.");
  if (!job.first_contacted_at) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("jobs").update({ first_contacted_at: now, assigned_to: job.assigned_to ?? user.id }).eq("id", id);
    if (error) throw new Error(friendly(error));
    const me = memberships.find((m) => m.org_id === org.id);
    await supabase.from("job_notes").insert({ org_id: org.id, job_id: id, body: "First contact made with the homeowner.", author_id: user.id, author_name: me?.full_name || user.fullName || user.email });
  }
  revalidatePath("/app", "layout");
}

export async function undoContacted(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("jobs").update({ first_contacted_at: null }).eq("id", String(fd.get("id") ?? ""));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
}

export async function addFinancingApplication(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireMoneyAccess();
  const lender = str(fd, "lender");
  const amount = num(fd, "amount", NaN);
  const fee = num(fd, "dealer_fee_pct", 0);
  if (!lender) return { error: "Which lender?" };
  if (!(amount > 0)) return { error: "Enter the financed amount." };
  if (fee < 0 || fee > 40) return { error: "Dealer fee should be between 0% and 40%." };
  const { error } = await supabase.from("financing_applications").insert({
    org_id: org.id, job_id: String(fd.get("job_id")), lender: lender.slice(0, 100), amount, dealer_fee_pct: fee,
    status: oneOf(fd, "status", FIN_STATUSES, "link_sent"), notes: str(fd, "notes"), created_by: user.id,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${fd.get("job_id")}`);
  return { ok: "Financing recorded." };
}

export async function setFinancingStatus(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const status = oneOf(fd, "status", FIN_STATUSES, "link_sent");
  const { data, error } = await supabase.from("financing_applications").update({ status }).eq("id", String(fd.get("id"))).select("job_id").single();
  if (error) throw new Error(friendly(error));
  revalidatePath(`/app/jobs/${data.job_id}`);
}

// ---------------------------------------------------------------------------------------------
// New-lead sidebar on the Jobs board: first call, owner, book the inspection, not going ahead.
// ---------------------------------------------------------------------------------------------

type Ctx = Awaited<ReturnType<typeof requireOrg>>;
const authorName = (ctx: Ctx) => ctx.memberships.find((m) => m.org_id === ctx.org.id)?.full_name || ctx.user.fullName || ctx.user.email;
function touch(jobId: string) {
  revalidatePath("/app/jobs");
  revalidatePath(`/app/jobs/${jobId}`, "layout");
  revalidatePath("/app");
}
async function note(ctx: Ctx, jobId: string, body: string) {
  await ctx.supabase.from("job_notes").insert({ org_id: ctx.org.id, job_id: jobId, body, author_id: ctx.user.id, author_name: authorName(ctx) });
}

/** After calling a new lead: "Spoke to them" records first contact; "No answer" logs a try and keeps the clock running. */
export async function logLeadCall(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Crew leads can't work leads." };
  const id = String(fd.get("job_id") ?? "");
  const outcome = fd.get("outcome") === "no_answer" ? "no_answer" : "spoke";
  const { data: job } = await ctx.supabase.from("jobs").select("id, stage, first_contacted_at, assigned_to").eq("id", id).maybeSingle();
  if (!job) return { error: "Job not found." };
  if (outcome === "no_answer") {
    const { error } = await ctx.supabase.from("job_events").insert({ org_id: ctx.org.id, job_id: id, kind: "call_no_answer", visible_to_homeowner: false, created_by: ctx.user.id, created_by_name: authorName(ctx) });
    if (error) return { error: friendly(error) };
    await note(ctx, id, "Called, no answer.");
    touch(id);
    return { ok: "Logged. Try again soon, or send a text." };
  }
  if (!job.first_contacted_at) {
    const { error } = await ctx.supabase.from("jobs").update({ first_contacted_at: new Date().toISOString(), assigned_to: job.assigned_to ?? ctx.user.id }).eq("id", id);
    if (error) return { error: friendly(error) };
    await note(ctx, id, "First contact made with the homeowner.");
  }
  touch(id);
  return { ok: "Contact recorded." };
}

/** Who's looking after the lead (jobs.assigned_to). Tells them when it's someone else. */
export async function setLeadOwner(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Crew leads can't reassign jobs." };
  const id = String(fd.get("job_id") ?? "");
  const want = str(fd, "assigned_to");
  const { data: members } = await ctx.supabase.from("memberships").select("user_id, full_name, email").eq("org_id", ctx.org.id);
  const person = (members ?? []).find((m) => m.user_id === want);
  if (!person) return { error: "Pick someone on your team." };
  const { data: job } = await ctx.supabase.from("jobs").select("assigned_to, title").eq("id", id).maybeSingle();
  if (!job) return { error: "Job not found." };
  if (job.assigned_to === person.user_id) return { ok: "No change." };
  const { error } = await ctx.supabase.from("jobs").update({ assigned_to: person.user_id }).eq("id", id);
  if (error) return { error: friendly(error) };
  await note(ctx, id, `${person.full_name || person.email} is looking after this lead.`);
  if (person.user_id !== ctx.user.id) {
    await notifyUser(ctx.supabase, { orgId: ctx.org.id, userId: person.user_id, kind: "job_assigned", title: `New lead for you: ${job.title}`, url: `/app/jobs?job=${id}` });
  }
  touch(id);
  return { ok: `${(person.full_name || person.email || "").split(" ")[0]} has it.` };
}

/** Book the roof inspection: saves the time, moves the job to Quoting, optionally texts the homeowner. */
export async function bookInspection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Crew leads can't book inspections." };
  const id = String(fd.get("job_id") ?? "");
  const { data: job } = await ctx.supabase.from("jobs").select("id, stage, state, first_contacted_at, assigned_to, customer_id, customers(name, phone)").eq("id", id).maybeSingle();
  if (!job) return { error: "Job not found." };
  const tz = AU_STATE_TZ[asAuState(job.state) ?? asAuState(ctx.org.state) ?? "NSW"];
  const at = localToUtc(String(fd.get("date") ?? ""), String(fd.get("time") ?? ""), tz);
  if (!at) return { error: "Pick a day and a time." };
  if (at.getTime() < Date.now() - 60 * 60000) return { error: "That time has already passed." };
  const update: Record<string, unknown> = { inspection_at: at.toISOString(), first_contacted_at: job.first_contacted_at ?? new Date().toISOString(), assigned_to: job.assigned_to ?? ctx.user.id };
  if (job.stage === "lead") update.stage = "inspection";
  const { error } = await ctx.supabase.from("jobs").update(update).eq("id", id);
  if (error) return { error: friendly(error) };
  const when = inspectionLabel(at.toISOString(), tz);
  const c = (Array.isArray(job.customers) ? job.customers[0] : job.customers) as { name: string; phone: string | null } | null;
  const first = c?.name.split(" ")[0] || "them";
  let texted = "";
  if (fd.get("text_customer") === "on" && c?.phone) {
    const me = authorName(ctx)?.split(" ")[0];
    const r = await sendSms(ctx.supabase, { orgId: ctx.org.id, jobId: id, customerId: job.customer_id, to: c.phone, body: inspectionSms({ first, when, business: ctx.org.name, who: me }) });
    texted = r?.status === "sent" ? ` Texted ${first}.` : r?.status === "failed" ? ` The text to ${first} didn't send.` : r?.status === "paused" ? " Test mode, so no text went out." : " Texts aren't set up yet, so no text went out.";
  }
  await note(ctx, id, `Inspection booked for ${when}.${texted}`);
  touch(id);
  return { ok: `Booked for ${when}.${texted}` };
}

/** Not going ahead: stage lost + the reason. Reopen puts it back where it was (lead, or quoting if inspected). */
export async function markLeadLost(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Crew leads can't close leads." };
  const id = String(fd.get("job_id") ?? "");
  const reason = oneOf(fd, "reason", LOST_REASONS.map((r) => r.key), "other");
  const why = str(fd, "detail")?.slice(0, 500);
  const { error } = await ctx.supabase.from("jobs").update({ stage: "lost", lost_reason: reason }).eq("id", id);
  if (error) return { error: friendly(error) };
  await note(ctx, id, `Not going ahead: ${LOST_REASON_LABEL[reason]}${why ? `. ${why}` : "."}`);
  touch(id);
  return { ok: "Marked as not going ahead." };
}

export async function reopenLead(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Crew leads can't reopen leads." };
  const id = String(fd.get("job_id") ?? "");
  const { data: job } = await ctx.supabase.from("jobs").select("stage, inspection_at").eq("id", id).maybeSingle();
  if (!job) return { error: "Job not found." };
  if (job.stage !== "lost") return { ok: "It's already open." };
  const { count } = await ctx.supabase.from("estimates").select("id", { count: "exact", head: true }).eq("job_id", id).eq("status", "sent");
  const stage = count ? "estimate_sent" : job.inspection_at ? "inspection" : "lead";
  const { error } = await ctx.supabase.from("jobs").update({ stage, lost_reason: null }).eq("id", id);
  if (error) return { error: friendly(error) };
  await note(ctx, id, "Reopened.");
  touch(id);
  return { ok: "Reopened." };
}
