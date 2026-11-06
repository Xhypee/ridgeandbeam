"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyAccess, requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import { notifyUser } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";

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
