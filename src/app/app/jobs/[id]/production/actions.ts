"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";
import { crewPay, DELIVERY_TYPES, DUMPSTER_STATUSES, HOA_STATUSES, MATERIALS_STATUSES, PERMIT_STATUSES } from "@/lib/production";
import { acceptedEstimate } from "@/lib/production-data";
import { loadReadiness } from "@/lib/production-server";

const isoRe = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (ctx.isCrewLead) throw new Error("Only the office can change production settings.");
  return ctx;
}

const FIELDS = {
  permit_status: PERMIT_STATUSES,
  hoa_status: HOA_STATUSES,
  materials_status: MATERIALS_STATUSES,
  dumpster_status: DUMPSTER_STATUSES,
  colors_confirmed: ["true", "false"],
} as const;

/** One-tap readiness status change. Unlocks a locked job when it stops being ready. */
export async function setReadiness(fd: FormData) {
  const { supabase } = await office();
  const id = String(fd.get("job_id"));
  const field = String(fd.get("field")) as keyof typeof FIELDS;
  const value = String(fd.get("value"));
  if (!(field in FIELDS) || !(FIELDS[field] as readonly string[]).includes(value)) throw new Error("Invalid status.");
  const update: Record<string, unknown> = { [field]: field === "colors_confirmed" ? value === "true" : value };
  const { error } = await supabase.from("jobs").update(update).eq("id", id);
  if (error) throw new Error(friendly(error));
  const r = await loadReadiness(supabase, id);
  if (r && !r.ready) await supabase.from("jobs").update({ schedule_locked: false }).eq("id", id).eq("schedule_locked", true);
  revalidatePath(`/app/jobs/${id}`, "layout");
  revalidatePath("/app/schedule");
}

export async function saveReadinessDetails(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await office(); } catch (e) { return { error: (e as Error).message }; }
  const id = String(fd.get("job_id"));
  const { error } = await ctx.supabase.from("jobs").update({
    permit_number: str(fd, "permit_number"),
    shingle_color: str(fd, "shingle_color"),
  }).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${id}`, "layout");
  return { ok: "Saved." };
}

export async function saveDelivery(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await office(); } catch (e) { return { error: (e as Error).message }; }
  const id = String(fd.get("job_id"));
  const t = String(fd.get("delivery_type"));
  const { error } = await ctx.supabase.from("jobs").update({
    delivery_type: (DELIVERY_TYPES as readonly string[]).includes(t) ? t : "roof_load",
    delivery_notes: str(fd, "delivery_notes"),
    gate_code: str(fd, "gate_code"),
    site_hazards: str(fd, "site_hazards"),
  }).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${id}`, "layout");
  return { ok: "Delivery details saved." };
}

export async function unlockSchedule(fd: FormData) {
  const { supabase } = await office();
  const id = String(fd.get("job_id"));
  await supabase.from("jobs").update({ schedule_locked: false }).eq("id", id);
  revalidatePath(`/app/jobs/${id}`, "layout");
  revalidatePath("/app/schedule");
}

export async function saveLien(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await office(); } catch (e) { return { error: (e as Error).message }; }
  const id = String(fd.get("job_id"));
  const last = str(fd, "last_furnished_on");
  const bid = str(fd, "bid_due_on");
  const state = str(fd, "state")?.toUpperCase() ?? null;
  if ((last && !isoRe.test(last)) || (bid && !isoRe.test(bid))) return { error: "Use a valid date." };
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: "Use a 2-letter state code." };
  const update: Record<string, unknown> = { last_furnished_on: last };
  if (fd.has("bid_due_on")) update.bid_due_on = bid;
  if (fd.has("state")) update.state = state;
  const { error } = await ctx.supabase.from("jobs").update(update).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${id}`, "layout");
  return { ok: "Saved." };
}

export async function saveBidDue(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await office(); } catch (e) { return { error: (e as Error).message }; }
  const id = String(fd.get("job_id"));
  const bid = str(fd, "bid_due_on");
  if (bid && !isoRe.test(bid)) return { error: "Use a valid date." };
  const { error } = await ctx.supabase.from("jobs").update({ bid_due_on: bid }).eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${id}`, "layout");
  return { ok: "Saved." };
}

/** Post (or update) the crew-pay labor cost computed from the accepted estimate's measurements. */
export async function postCrewPay(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, canSeeMoney } = await requireOrg();
  if (!canSeeMoney) return { error: "You don't have permission to do that." };
  const id = String(fd.get("job_id"));
  const { data: job } = await supabase.from("jobs").select("id, crew_id, crews(*)").eq("id", id).maybeSingle();
  const crew = job?.crews as unknown as { id: string; name: string; rate_per_square: number; steep_adder: number; high_steep_adder: number; layer_adder: number; low_slope_rate: number } | null;
  if (!job || !crew) return { error: "Assign a crew first." };
  const est = await acceptedEstimate(supabase, id);
  if (!est) return { error: "Crew pay comes from the accepted estimate's measurements — no accepted estimate yet." };
  const pay = crewPay(est.measurements, crew);
  if (pay.total <= 0) return { error: "Crew pay is $0 — fill in the crew's pay sheet in Settings → Crews & pay." };
  const row = {
    org_id: org.id, job_id: id, category: "labor", vendor: crew.name, amount: pay.total, source: "crew_pay", source_id: crew.id,
    description: `Crew pay: ${pay.squares} sq — ${pay.lines.map((l) => l.label).join(", ")}`, created_by: user.id,
  };
  const { data: existing } = await supabase.from("job_costs").select("id").eq("job_id", id).eq("source", "crew_pay").maybeSingle();
  const { error } = existing
    ? await supabase.from("job_costs").update(row).eq("id", existing.id)
    : await supabase.from("job_costs").insert(row);
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${id}`, "layout");
  return { ok: existing ? "Crew pay updated on job cost." : "Crew pay posted to job cost." };
}
