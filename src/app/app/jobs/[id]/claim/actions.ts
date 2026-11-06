"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import { isoDate } from "@/lib/format";
import {
  auStage,
  CATASTROPHES,
  CHECK_KINDS,
  CLAIM_STAGES,
  DECIDED_STAGES,
  DOC_STATUSES,
  EVENT_TYPES,
  expectedPayments,
  followUpDate,
  MAKE_SAFE_AUTHORISERS,
  MAKE_SAFE_PAYERS,
  nextFollowUpAfter,
  PAYERS,
  POLICY_TYPES,
  SETTLEMENT_PATHS,
  SUPPLEMENT_STATUSES,
} from "@/lib/claims";
import { diffScopes, flaggedToSupplementItems, type ScopeLine } from "@/lib/claims-scope";
import { acceptedEstimateTotal } from "@/lib/estimate-totals";
import type { Claim } from "@/lib/claims-server";

/** Every claim mutation needs money access (crew leads see the claim read-only). */
async function ctx() {
  const c = await requireOrg();
  if (!c.canSeeMoney) throw new Error("Crew leads can't change insurance claims.");
  return c;
}

function refresh(jobId?: string | null) {
  if (jobId) revalidatePath(`/app/jobs/${jobId}`, "layout");
  revalidatePath("/app/claims");
  revalidatePath("/app/customers", "layout");
}

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const money = (fd: FormData, k: string) => Math.max(0, Math.round(num(fd, k) * 100) / 100);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v && ISO.test(v) ? v : null;
};

function claimFields(fd: FormData) {
  const excess = money(fd, "excess");
  const sum = num(fd, "sum_insured", NaN);
  return {
    carrier: str(fd, "carrier"),
    claim_number: str(fd, "claim_number"),
    policy_number: str(fd, "policy_number"),
    policy_type: oneOf(fd, "policy_type", POLICY_TYPES, "unknown"),
    lodged_on: day(fd, "lodged_on"),
    date_of_loss: day(fd, "date_of_loss"),
    event_type: (EVENT_TYPES as readonly string[]).includes(String(fd.get("event_type") ?? "")) ? String(fd.get("event_type")) : null,
    cause_of_loss: str(fd, "cause_of_loss"),
    catastrophe: oneOf(fd, "catastrophe", CATASTROPHES, "none"),
    catastrophe_name: str(fd, "catastrophe_name"),
    adjuster_name: str(fd, "adjuster_name"),
    adjuster_phone: str(fd, "adjuster_phone"),
    adjuster_email: str(fd, "adjuster_email"),
    adjuster_meeting_at: str(fd, "adjuster_meeting_at"),
    excess,
    // Compatibility mirror for older readers (homeowner portal RPC) until they switch to `excess`.
    deductible: excess,
    sum_insured: Number.isFinite(sum) && sum > 0 ? Math.round(sum * 100) / 100 : null,
    settlement_path: oneOf(fd, "settlement_path", SETTLEMENT_PATHS, "undecided"),
    panel_builder_name: str(fd, "panel_builder_name"),
    panel_builder_contact: str(fd, "panel_builder_contact"),
    panel_job_ref: str(fd, "panel_job_ref"),
    scope_received_on: day(fd, "scope_received_on"),
    approved_amount: money(fd, "approved_amount"),
    cash_settlement_amount: money(fd, "cash_settlement_amount"),
    cash_settlement_offered_on: day(fd, "cash_settlement_offered_on"),
    make_safe_done_on: day(fd, "make_safe_done_on"),
    make_safe_authorised_by: str(fd, "make_safe_authorised_by") ? oneOf(fd, "make_safe_authorised_by", MAKE_SAFE_AUTHORISERS, "insurer") : null,
    make_safe_payer: str(fd, "make_safe_payer") ? oneOf(fd, "make_safe_payer", MAKE_SAFE_PAYERS, "insurer") : null,
    make_safe_amount: money(fd, "make_safe_amount"),
    make_safe_notes: str(fd, "make_safe_notes"),
    info_complete_on: day(fd, "info_complete_on"),
    last_insurer_update_on: day(fd, "last_insurer_update_on"),
    decision_on: day(fd, "decision_on"),
    notes: str(fd, "notes"),
  };
}

async function claimById(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], id: string) {
  const { data } = await supabase.from("claims").select("*").eq("id", id).maybeSingle();
  return data as Claim | null;
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------
export async function createClaim(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const jobId = String(fd.get("job_id"));
  const excess = money(fd, "excess");
  const ev = String(fd.get("event_type") ?? "");
  const { error } = await supabase.from("claims").insert({
    org_id: org.id,
    job_id: jobId,
    carrier: str(fd, "carrier"),
    claim_number: str(fd, "claim_number"),
    policy_type: oneOf(fd, "policy_type", POLICY_TYPES, "unknown"),
    date_of_loss: day(fd, "date_of_loss"),
    lodged_on: day(fd, "lodged_on") ?? isoDate(new Date()),
    event_type: (EVENT_TYPES as readonly string[]).includes(ev) ? ev : null,
    excess,
    deductible: excess,
  });
  if (error) return { error: error.code === "23505" ? "This job already has a claim." : friendly(error) };
  await supabase.from("jobs").update({ is_insurance: true }).eq("id", jobId);
  refresh(jobId);
  return { ok: "Claim started." };
}

export async function markRetail(fd: FormData) {
  const { supabase } = await ctx();
  const jobId = String(fd.get("job_id"));
  const retail = fd.get("retail") !== "0";
  const { error } = await supabase.from("jobs").update({ is_insurance: !retail }).eq("id", jobId);
  if (error) throw new Error(friendly(error));
  refresh(jobId);
}

export async function updateClaim(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const id = String(fd.get("id"));
  const f = claimFields(fd);
  const today = isoDate(new Date());
  if (f.date_of_loss && f.date_of_loss > today) return { error: "The date of the event can't be in the future." };
  if (f.lodged_on && f.lodged_on > today) return { error: "The lodgement date can't be in the future." };
  if (f.date_of_loss && f.lodged_on && f.lodged_on < f.date_of_loss) return { error: "The claim can't be lodged before the event happened." };
  if (f.make_safe_amount > 0 && !f.make_safe_payer) return { error: "Say who pays for the make-safe work." };
  const { data, error } = await supabase.from("claims").update(f).eq("id", id).select("job_id").single();
  if (error) return { error: friendly(error) };
  refresh(data.job_id);
  return { ok: "Claim saved." };
}

export async function setClaimStage(fd: FormData) {
  const { supabase } = await ctx();
  const id = String(fd.get("id"));
  const stage = String(fd.get("stage"));
  if (!(CLAIM_STAGES as readonly string[]).includes(stage)) throw new Error("Unknown claim stage.");
  const claim = await claimById(supabase, id);
  if (!claim) throw new Error("Claim not found.");
  const patch: Record<string, unknown> = { stage };
  const today = isoDate(new Date());
  if (DECIDED_STAGES.includes(auStage(stage)) && !claim.decision_on && ["approved", "declined", "cash_settlement_offered"].includes(stage)) patch.decision_on = today;
  if (stage === "scope_received" && !claim.scope_received_on) patch.scope_received_on = today;
  if (stage === "cash_settlement_offered") {
    if (!claim.cash_settlement_offered_on) patch.cash_settlement_offered_on = today;
    if (claim.settlement_path === "undecided") patch.settlement_path = "cash_settlement";
  }
  const { error } = await supabase.from("claims").update(patch).eq("id", id);
  if (error) throw new Error(friendly(error));
  refresh(claim.job_id);
}

/** "The insurer gave an update today" — restarts the 20-business-day update reminder. */
export async function logInsurerUpdate(fd: FormData) {
  const { supabase } = await ctx();
  const { data, error } = await supabase.from("claims").update({ last_insurer_update_on: isoDate(new Date()) }).eq("id", String(fd.get("id"))).select("job_id").single();
  if (error) throw new Error(friendly(error));
  refresh(data.job_id);
}

export async function deleteClaim(fd: FormData) {
  const { supabase, isAdmin } = await ctx();
  if (!isAdmin) throw new Error("Only owners and admins can delete a claim.");
  const id = String(fd.get("id"));
  const { data, error } = await supabase.from("claims").delete().eq("id", id).select("job_id").single();
  if (error) throw new Error(friendly(error));
  refresh(data.job_id);
}

// ---------------------------------------------------------------------------
// Claim ledger: expected vs received by payer
// ---------------------------------------------------------------------------
const PLANNED_KINDS = ["scope", "excess", "balance", "cash_settlement", "make_safe"];

export async function generateExpectedPayments(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return { error: "Claim not found." };
  if (claim.settlement_path === "undecided") return { error: "Choose the settlement path on the Overview first (insurer-managed, own builder or cash settlement)." };
  const est = await acceptedEstimateTotal(supabase, claim.job_id);
  const planned = expectedPayments(claim, est?.total ?? null);
  if (!planned.length) return { error: claim.settlement_path === "cash_settlement" ? "Enter the cash settlement amount, or get the homeowner's quote accepted." : "Enter the insurer's approved amount and the excess on the Overview first." };
  const { data: existing } = await supabase.from("claim_checks").select("id, kind, payer, received_amount").eq("claim_id", claim.id).in("kind", PLANNED_KINDS);
  let created = 0, updated = 0;
  const used = new Set<string>();
  for (const p of planned) {
    const have = (existing ?? []).find((e) => e.kind === p.kind && e.payer === p.payer && !used.has(e.id));
    if (have) {
      used.add(have.id);
      if (Number(have.received_amount) === 0) {
        const { error } = await supabase.from("claim_checks").update({ expected_amount: p.expected_amount, label: p.label }).eq("id", have.id);
        if (error) return { error: friendly(error) };
        updated++;
      }
      continue;
    }
    const { error } = await supabase.from("claim_checks").insert({ org_id: org.id, claim_id: claim.id, endorsement: "not_required", ...p });
    if (error) return { error: friendly(error) };
    created++;
  }
  // Planned rows that no longer apply (e.g. the settlement path changed) go, unless money came in.
  const stale = (existing ?? []).filter((e) => !used.has(e.id) && Number(e.received_amount) === 0);
  if (stale.length) await supabase.from("claim_checks").delete().in("id", stale.map((e) => e.id));
  refresh(claim.job_id);
  return { ok: `Expected payments ready (${created} added${updated ? `, ${updated} updated` : ""}${stale.length ? `, ${stale.length} removed` : ""}).` };
}

export async function addCheck(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return { error: "Claim not found." };
  const expected = money(fd, "expected_amount");
  if (!(expected > 0)) return { error: "Enter the amount you expect." };
  const { error } = await supabase.from("claim_checks").insert({
    org_id: org.id,
    claim_id: claim.id,
    kind: oneOf(fd, "kind", CHECK_KINDS, "other"),
    payer: oneOf(fd, "payer", PAYERS, "carrier"),
    label: str(fd, "label"),
    expected_amount: expected,
    endorsement: "not_required",
  });
  if (error) return { error: friendly(error) };
  refresh(claim.job_id);
  return { ok: "Expected payment added." };
}

export async function recordCheck(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await ctx();
  const id = String(fd.get("id"));
  const { data: chk } = await supabase.from("claim_checks").select("*, claims(job_id)").eq("id", id).maybeSingle();
  if (!chk) return { error: "Payment not found." };
  const jobId = (chk.claims as unknown as { job_id: string }).job_id;
  const received = money(fd, "received_amount");
  const receivedOn = day(fd, "received_on") ?? (received > 0 ? isoDate(new Date()) : null);
  const ref = str(fd, "check_number");
  const invoiceId = str(fd, "invoice_id");
  const patch: Record<string, unknown> = {
    received_amount: received,
    received_on: received > 0 ? receivedOn : null,
    check_number: ref,
    notes: str(fd, "notes"),
  };

  if (invoiceId && received > 0 && !chk.payment_id) {
    const { data: inv } = await supabase.from("invoices").select("id, status, job_id").eq("id", invoiceId).maybeSingle();
    if (!inv || inv.job_id !== jobId) return { error: "Pick an invoice on this job." };
    if (inv.status === "void") return { error: "That invoice is void." };
    const { data: t } = await supabase.from("invoice_totals").select("balance").eq("invoice_id", inv.id).maybeSingle();
    const balance = Number(t?.balance ?? 0);
    if (received > balance + 0.005)
      return { error: `This payment (${aud(received)}) is more than the invoice's balance (${aud(balance)}). Pick an invoice with enough balance, or save it without applying.` };
    if (inv.status === "draft") await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id);
    const { data: pay, error: payErr } = await supabase
      .from("payments")
      .insert({
        org_id: org.id,
        invoice_id: inv.id,
        amount: received,
        method: chk.payer === "carrier" ? "insurance" : "bank_transfer",
        paid_on: receivedOn ?? isoDate(new Date()),
        reference: [chk.label ?? chk.kind, ref ? `ref ${ref}` : null].filter(Boolean).join(" · "),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (payErr) return { error: friendly(payErr) };
    patch.payment_id = pay.id;
  } else if (chk.payment_id && received > 0) {
    const { error: upErr } = await supabase.from("payments").update({ amount: received, paid_on: receivedOn ?? isoDate(new Date()) }).eq("id", chk.payment_id);
    if (upErr) return { error: friendly(upErr) };
  }
  const { error } = await supabase.from("claim_checks").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(jobId);
  return { ok: patch.payment_id ? "Payment recorded and applied to the invoice." : "Payment saved." };
}

/** One-tap "Mark received" for the full expected amount. */
export async function markCheckReceived(fd: FormData) {
  const { supabase } = await ctx();
  const { data: chk } = await supabase.from("claim_checks").select("id, expected_amount, payment_id, claims(job_id)").eq("id", String(fd.get("id"))).maybeSingle();
  if (!chk) return;
  if (chk.payment_id) throw new Error("This payment is applied to an invoice. Change it on the invoice.");
  const { error } = await supabase.from("claim_checks").update({ received_amount: chk.expected_amount, received_on: isoDate(new Date()) }).eq("id", chk.id);
  if (error) throw new Error(friendly(error));
  refresh((chk.claims as unknown as { job_id: string }).job_id);
}

export async function deleteCheck(fd: FormData) {
  const { supabase } = await ctx();
  const { data: chk } = await supabase.from("claim_checks").select("id, payment_id, claims(job_id)").eq("id", String(fd.get("id"))).maybeSingle();
  if (!chk) return;
  if (chk.payment_id) throw new Error("This payment is applied to an invoice. Delete the payment on the invoice first.");
  const { error } = await supabase.from("claim_checks").delete().eq("id", chk.id);
  if (error) throw new Error(friendly(error));
  refresh((chk.claims as unknown as { job_id: string }).job_id);
}

// ---------------------------------------------------------------------------
// Claim paperwork
// ---------------------------------------------------------------------------
export async function updateDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const status = oneOf(fd, "status", DOC_STATUSES, "missing");
  const sentOn = day(fd, "sent_on") ?? (status === "sent" || status === "accepted" ? isoDate(new Date()) : null);
  const { data, error } = await supabase
    .from("claim_documents")
    .update({ status, file_id: str(fd, "file_id"), sent_on: status === "missing" || status === "ready" ? null : sentOn, notes: str(fd, "notes") })
    .eq("id", String(fd.get("id")))
    .select("claims(job_id)")
    .single();
  if (error) return { error: friendly(error) };
  refresh((data.claims as unknown as { job_id: string }).job_id);
  return { ok: "Saved." };
}

/** Tap a paperwork tile: missing → sent → missing. */
export async function toggleDocument(fd: FormData) {
  const { supabase } = await ctx();
  const sent = fd.get("sent") === "1";
  const { data, error } = await supabase
    .from("claim_documents")
    .update({ status: sent ? "sent" : "missing", sent_on: sent ? isoDate(new Date()) : null })
    .eq("id", String(fd.get("id")))
    .select("claims(job_id)")
    .single();
  if (error) throw new Error(friendly(error));
  refresh((data.claims as unknown as { job_id: string }).job_id);
}

// ---------------------------------------------------------------------------
// Variation requests (table: supplements)
// ---------------------------------------------------------------------------
export async function createSupplement(fd: FormData) {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) throw new Error("Claim not found.");
  const { data, error } = await supabase.from("supplements").insert({ org_id: org.id, claim_id: claim.id }).select("id").single();
  if (error) throw new Error(friendly(error));
  refresh(claim.job_id);
  redirect(`/app/jobs/${claim.job_id}/claim/supplements/${data.id}`);
}

const ItemSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description.").max(500),
  xact_code: z.string().trim().max(40).nullable().transform((v) => v || null),
  quantity: z.coerce.number().finite().min(0),
  unit: z.string().trim().max(12).default("EA"),
  unit_price: z.coerce.number().finite().min(0),
  code_citation: z.string().trim().max(300).nullable().transform((v) => v || null),
  justification: z.string().trim().max(3000).nullable().transform((v) => v || null),
  file_ids: z.array(z.uuid()).max(30).default([]),
  status: z.enum(["requested", "approved", "denied"]).catch("requested"),
  approved_amount: z.coerce.number().finite().min(0).default(0),
});
const SaveSupplementSchema = z.object({ id: z.uuid(), notes: z.string().max(5000).nullable(), items: z.array(ItemSchema).max(200) });
export type SaveSupplementInput = z.input<typeof SaveSupplementSchema>;

export async function saveSupplement(input: SaveSupplementInput): Promise<ActionResult> {
  const parsed = SaveSupplementSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid variation request." };
  const { supabase, org } = await ctx();
  const v = parsed.data;
  const { data: sup } = await supabase.from("supplements").select("id, claims(job_id)").eq("id", v.id).maybeSingle();
  if (!sup) return { error: "Variation request not found." };
  const jobId = (sup.claims as unknown as { job_id: string }).job_id;
  const fileIds = [...new Set(v.items.flatMap((i) => i.file_ids))];
  if (fileIds.length) {
    const { data: files } = await supabase.from("job_files").select("id").eq("job_id", jobId).in("id", fileIds);
    if ((files ?? []).length !== fileIds.length) return { error: "One of the photos isn't on this job." };
  }
  const up = await supabase.from("supplements").update({ notes: v.notes }).eq("id", v.id);
  if (up.error) return { error: friendly(up.error) };
  const del = await supabase.from("supplement_items").delete().eq("supplement_id", v.id);
  if (del.error) return { error: friendly(del.error) };
  if (v.items.length) {
    const ins = await supabase.from("supplement_items").insert(v.items.map((it, i) => ({ ...it, org_id: org.id, supplement_id: v.id, position: i })));
    if (ins.error) return { error: friendly(ins.error) };
  }
  refresh(jobId);
  return { ok: "Saved." };
}

export async function setSupplementStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const id = String(fd.get("id"));
  const status = oneOf(fd, "status", SUPPLEMENT_STATUSES, "draft");
  const { data: sup } = await supabase.from("supplements").select("*, claims(id, job_id, stage), supplement_items(count)").eq("id", id).maybeSingle();
  if (!sup) return { error: "Variation request not found." };
  const claim = sup.claims as unknown as { id: string; job_id: string; stage: string };
  const today = isoDate(new Date());
  const patch: Record<string, unknown> = { status, carrier_response: str(fd, "carrier_response") ?? sup.carrier_response };

  if (status === "submitted") {
    if ((((sup.supplement_items as unknown as { count: number }[]) ?? [])[0]?.count ?? 0) === 0) return { error: "Add at least one line before sending it to the insurer." };
    const submitted = day(fd, "submitted_on") ?? sup.submitted_on ?? today;
    if (submitted > today) return { error: "The sent date can't be in the future." };
    patch.submitted_on = submitted;
    if (sup.status !== "submitted" || submitted !== sup.submitted_on) {
      patch.next_follow_up_on = followUpDate(submitted, 0);
      patch.follow_up_count = 0;
    }
  } else if (status === "approved" || status === "partial" || status === "denied") {
    const approved = status === "denied" ? 0 : money(fd, "approved_amount") || (status === "approved" ? Number(sup.requested_amount) : 0);
    if (status === "partial" && !(approved > 0)) return { error: "Enter the amount the insurer approved." };
    patch.approved_amount = approved;
    patch.responded_on = day(fd, "responded_on") ?? today;
    patch.next_follow_up_on = null;
    if (!sup.submitted_on) patch.submitted_on = patch.responded_on;
  } else {
    patch.next_follow_up_on = null;
  }
  const { error } = await supabase.from("supplements").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(claim.job_id);
  return {
    ok:
      status === "approved" || status === "partial"
        ? "Saved. An expected payment for the approved variation was added to the claim ledger."
        : status === "submitted"
          ? "Marked as sent. Follow-up reminders are set."
          : "Saved.",
  };
}

export async function markFollowedUp(fd: FormData) {
  const { supabase } = await ctx();
  const id = String(fd.get("id"));
  const { data: sup } = await supabase.from("supplements").select("id, status, submitted_on, follow_up_count, claims(job_id)").eq("id", id).maybeSingle();
  if (!sup || sup.status !== "submitted" || !sup.submitted_on) throw new Error("Only variation requests sent to the insurer have follow-ups.");
  const next = nextFollowUpAfter(sup.submitted_on, sup.follow_up_count ?? 0, isoDate(new Date()));
  const { error } = await supabase
    .from("supplements")
    .update({ next_follow_up_on: next.date, follow_up_count: next.count, last_followed_up_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(friendly(error));
  refresh((sup.claims as unknown as { job_id: string }).job_id);
}

export async function deleteSupplement(fd: FormData) {
  const { supabase } = await ctx();
  const { data: sup } = await supabase.from("supplements").select("id, status, claims(job_id)").eq("id", String(fd.get("id"))).maybeSingle();
  if (!sup) return;
  if (sup.status !== "draft") throw new Error("Only draft variation requests can be deleted.");
  const { error } = await supabase.from("supplements").delete().eq("id", sup.id);
  if (error) throw new Error(friendly(error));
  const jobId = (sup.claims as unknown as { job_id: string }).job_id;
  refresh(jobId);
  redirect(`/app/jobs/${jobId}/claim/supplements`);
}

// ---------------------------------------------------------------------------
// Scope compare (insurer's scope of works vs ours)
// ---------------------------------------------------------------------------
const LineSchema = z.object({
  xact_code: z.string().trim().max(40).nullable(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite(),
  unit: z.string().trim().max(12),
  unit_price: z.number().finite(),
  total: z.number().finite(),
});
const ImportSchema = z.object({ claimId: z.uuid(), source: z.enum(["carrier", "contractor"]), lines: z.array(LineSchema).min(1, "No lines found.").max(500) });
export type ImportScopeInput = z.input<typeof ImportSchema>;

export async function importScope(input: ImportScopeInput): Promise<ActionResult> {
  const parsed = ImportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid scope." };
  const { supabase, org } = await ctx();
  const { claimId, source, lines } = parsed.data;
  const claim = await claimById(supabase, claimId);
  if (!claim) return { error: "Claim not found." };
  return replaceScope(supabase, org.id, claim, source, lines);
}

async function replaceScope(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, claim: Claim, source: "carrier" | "contractor", lines: ScopeLine[]): Promise<ActionResult> {
  const del = await supabase.from("scope_items").delete().eq("claim_id", claim.id).eq("source", source);
  if (del.error) return { error: friendly(del.error) };
  const ins = await supabase.from("scope_items").insert(lines.map((l, i) => ({ ...l, org_id: orgId, claim_id: claim.id, source, position: i })));
  if (ins.error) return { error: friendly(ins.error) };
  if (source === "carrier") {
    const patch: Record<string, unknown> = {};
    if (["lodged", "assessor_booked", "assessed"].includes(auStage(claim.stage))) patch.stage = "scope_received";
    if (!claim.scope_received_on) patch.scope_received_on = isoDate(new Date());
    if (Object.keys(patch).length) await supabase.from("claims").update(patch).eq("id", claim.id);
  }
  refresh(claim.job_id);
  return { ok: `Imported ${lines.length} ${source === "carrier" ? "insurer" : "of your"} line${lines.length === 1 ? "" : "s"}.` };
}

export async function copyEstimateToScope(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return { error: "Claim not found." };
  const est = await acceptedEstimateTotal(supabase, claim.job_id);
  if (!est) return { error: "This job has no accepted quote yet." };
  if (!est.items.length) return { error: "The accepted quote has no line items." };
  return replaceScope(
    supabase,
    org.id,
    claim,
    "contractor",
    est.items.map((i) => ({
      xact_code: null,
      description: i.description,
      quantity: i.quantity,
      unit: (i.unit || "EA").toUpperCase(),
      unit_price: i.unit_price,
      total: Math.round(i.quantity * i.unit_price * 100) / 100,
    })),
  );
}

export async function clearScope(fd: FormData) {
  const { supabase } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return;
  const source = String(fd.get("source"));
  if (source !== "carrier" && source !== "contractor") throw new Error("Bad source");
  const { error } = await supabase.from("scope_items").delete().eq("claim_id", claim.id).eq("source", source);
  if (error) throw new Error(friendly(error));
  refresh(claim.job_id);
}

export async function supplementFromFlags(fd: FormData) {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) throw new Error("Claim not found.");
  const { data: rows } = await supabase.from("scope_items").select("source, xact_code, description, quantity, unit, unit_price, total, position").eq("claim_id", claim.id).order("position");
  const toLine = (r: Record<string, unknown>): ScopeLine => ({
    xact_code: (r.xact_code as string) ?? null,
    description: String(r.description),
    quantity: Number(r.quantity),
    unit: String(r.unit),
    unit_price: Number(r.unit_price),
    total: Number(r.total),
  });
  const carrier = (rows ?? []).filter((r) => r.source === "carrier").map(toLine);
  const contractor = (rows ?? []).filter((r) => r.source === "contractor").map(toLine);
  const { flags } = diffScopes(carrier, contractor);
  const items = flaggedToSupplementItems(flags);
  if (!items.length) throw new Error("No flagged items with quantities to add.");
  const { data: sup, error } = await supabase.from("supplements").insert({ org_id: org.id, claim_id: claim.id, notes: "Created from the scope compare." }).select("id").single();
  if (error) throw new Error(friendly(error));
  const ins = await supabase.from("supplement_items").insert(items.map((it, i) => ({ ...it, org_id: org.id, supplement_id: sup.id, position: i })));
  if (ins.error) throw new Error(friendly(ins.error));
  refresh(claim.job_id);
  redirect(`/app/jobs/${claim.job_id}/claim/supplements/${sup.id}`);
}
