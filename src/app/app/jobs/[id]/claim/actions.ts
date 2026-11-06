"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import { isoDate } from "@/lib/format";
import {
  CHECK_KINDS,
  CLAIM_STAGES,
  DOC_STATUSES,
  ENDORSEMENTS,
  PAYERS,
  POLICY_TYPES,
  SUPPLEMENT_STATUSES,
  expectedChecks,
  followUpDate,
  nextFollowUpAfter,
  type ClaimMoneyInput,
} from "@/lib/claims";
import { diffScopes, flaggedToSupplementItems, type ScopeLine } from "@/lib/claims-scope";
import { acceptedEstimateTotal } from "@/lib/claims-estimate";
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

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const money = (fd: FormData, k: string) => Math.max(0, Math.round(num(fd, k) * 100) / 100);

function claimFields(fd: FormData) {
  return {
    carrier: str(fd, "carrier"),
    claim_number: str(fd, "claim_number"),
    policy_number: str(fd, "policy_number"),
    policy_type: oneOf(fd, "policy_type", POLICY_TYPES, "unknown"),
    date_of_loss: str(fd, "date_of_loss"),
    cause_of_loss: str(fd, "cause_of_loss"),
    adjuster_name: str(fd, "adjuster_name"),
    adjuster_phone: str(fd, "adjuster_phone"),
    adjuster_email: str(fd, "adjuster_email"),
    adjuster_meeting_at: str(fd, "adjuster_meeting_at"),
    rcv_amount: money(fd, "rcv_amount"),
    depreciation_amount: money(fd, "depreciation_amount"),
    deductible: money(fd, "deductible"),
    o_and_p_included: fd.get("o_and_p_included") === "on",
    mortgagee_name: str(fd, "mortgagee_name"),
    mortgage_loan_number: str(fd, "mortgage_loan_number"),
    loss_draft_contact: str(fd, "loss_draft_contact"),
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
  const { error } = await supabase.from("claims").insert({
    org_id: org.id,
    job_id: jobId,
    carrier: str(fd, "carrier"),
    claim_number: str(fd, "claim_number"),
    adjuster_name: str(fd, "adjuster_name"),
    adjuster_phone: str(fd, "adjuster_phone"),
    policy_type: oneOf(fd, "policy_type", POLICY_TYPES, "unknown"),
    date_of_loss: str(fd, "date_of_loss"),
  });
  if (error) return { error: error.code === "23505" ? "This job already has a claim." : friendly(error) };
  await supabase.from("jobs").update({ is_insurance: true }).eq("id", jobId);
  refresh(jobId);
  return { ok: "Claim created." };
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
  if (f.date_of_loss && f.date_of_loss > isoDate(new Date())) return { error: "Date of loss can't be in the future." };
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
  const { data, error } = await supabase.from("claims").update({ stage }).eq("id", id).select("job_id").single();
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
// Insurance ledger
// ---------------------------------------------------------------------------
export async function generateExpectedChecks(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return { error: "Claim not found." };
  const planned = expectedChecks(claim as ClaimMoneyInput & { mortgagee_name: string | null });
  if (!planned.length) return { error: "Enter the RCV, depreciation and deductible from the carrier's scope first." };
  const { data: existing } = await supabase.from("claim_checks").select("id, kind, received_amount").eq("claim_id", claim.id).in("kind", ["acv", "depreciation", "deductible"]);
  let created = 0, updated = 0;
  for (const p of planned) {
    const have = (existing ?? []).find((e) => e.kind === p.kind);
    if (have) {
      if (Number(have.received_amount) === 0) {
        const { error } = await supabase.from("claim_checks").update({ expected_amount: p.expected_amount, label: p.label }).eq("id", have.id);
        if (error) return { error: friendly(error) };
        updated++;
      }
      continue;
    }
    const { error } = await supabase.from("claim_checks").insert({ org_id: org.id, claim_id: claim.id, ...p });
    if (error) return { error: friendly(error) };
    created++;
  }
  refresh(claim.job_id);
  return { ok: `Expected checks ready (${created} added${updated ? `, ${updated} updated` : ""}).` };
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
    endorsement: oneOf(fd, "endorsement", ENDORSEMENTS, claim.mortgagee_name ? "needed" : "not_required"),
  });
  if (error) return { error: friendly(error) };
  refresh(claim.job_id);
  return { ok: "Expected check added." };
}

export async function recordCheck(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await ctx();
  const id = String(fd.get("id"));
  const { data: chk } = await supabase.from("claim_checks").select("*, claims(job_id)").eq("id", id).maybeSingle();
  if (!chk) return { error: "Check not found." };
  const jobId = (chk.claims as unknown as { job_id: string }).job_id;
  const received = money(fd, "received_amount");
  const receivedOn = str(fd, "received_on") ?? (received > 0 ? isoDate(new Date()) : null);
  const checkNumber = str(fd, "check_number");
  const invoiceId = str(fd, "invoice_id");
  const patch: Record<string, unknown> = {
    received_amount: received,
    received_on: received > 0 ? receivedOn : null,
    check_number: checkNumber,
    endorsement: oneOf(fd, "endorsement", ENDORSEMENTS, chk.endorsement),
    notes: str(fd, "notes"),
  };

  if (invoiceId && received > 0 && !chk.payment_id) {
    const { data: inv } = await supabase.from("invoices").select("id, status, job_id").eq("id", invoiceId).maybeSingle();
    if (!inv || inv.job_id !== jobId) return { error: "Pick an invoice on this job." };
    if (inv.status === "void") return { error: "That invoice is void." };
    const { data: t } = await supabase.from("invoice_totals").select("balance").eq("invoice_id", inv.id).maybeSingle();
    const balance = Number(t?.balance ?? 0);
    if (received > balance + 0.005)
      return { error: `This check (${usd(received)}) is more than the invoice's balance (${usd(balance)}). Pick an invoice with enough balance, or save the check without applying it.` };
    if (inv.status === "draft") await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id);
    const { data: pay, error: payErr } = await supabase
      .from("payments")
      .insert({
        org_id: org.id,
        invoice_id: inv.id,
        amount: received,
        method: chk.payer === "homeowner" ? "check" : "insurance",
        paid_on: receivedOn ?? isoDate(new Date()),
        reference: [chk.label ?? chk.kind, checkNumber ? `check #${checkNumber}` : null].filter(Boolean).join(" · "),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (payErr) return { error: friendly(payErr) };
    patch.payment_id = pay.id;
  } else if (chk.payment_id && received > 0) {
    // Keep the linked invoice payment in step with the check.
    const { error: upErr } = await supabase.from("payments").update({ amount: received, paid_on: receivedOn ?? isoDate(new Date()) }).eq("id", chk.payment_id);
    if (upErr) return { error: friendly(upErr) };
  }
  const { error } = await supabase.from("claim_checks").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh(jobId);
  return { ok: patch.payment_id ? "Check recorded and applied to the invoice." : "Check saved." };
}

export async function setEndorsement(fd: FormData) {
  const { supabase } = await ctx();
  const { data, error } = await supabase
    .from("claim_checks")
    .update({ endorsement: oneOf(fd, "endorsement", ENDORSEMENTS, "needed") })
    .eq("id", String(fd.get("id")))
    .select("claims(job_id)")
    .single();
  if (error) throw new Error(friendly(error));
  refresh((data.claims as unknown as { job_id: string }).job_id);
}

export async function deleteCheck(fd: FormData) {
  const { supabase } = await ctx();
  const { data: chk } = await supabase.from("claim_checks").select("id, payment_id, claims(job_id)").eq("id", String(fd.get("id"))).maybeSingle();
  if (!chk) return;
  if (chk.payment_id) throw new Error("This check is applied to an invoice payment. Delete the payment on the invoice first.");
  const { error } = await supabase.from("claim_checks").delete().eq("id", chk.id);
  if (error) throw new Error(friendly(error));
  refresh((chk.claims as unknown as { job_id: string }).job_id);
}

// ---------------------------------------------------------------------------
// Loss-draft paperwork
// ---------------------------------------------------------------------------
export async function updateDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const status = oneOf(fd, "status", DOC_STATUSES, "missing");
  const sentOn = str(fd, "sent_on") ?? (status === "sent" || status === "accepted" ? isoDate(new Date()) : null);
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

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------
export async function createSupplement(fd: FormData) {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) throw new Error("Claim not found.");
  const { data, error } = await supabase.from("supplements").insert({ org_id: org.id, claim_id: claim.id }).select("id").single();
  if (error) throw new Error(friendly(error));
  if (claim.stage === "scope_received" || claim.stage === "adjuster_met") await supabase.from("claims").update({ stage: "supplementing" }).eq("id", claim.id);
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid supplement." };
  const { supabase, org } = await ctx();
  const v = parsed.data;
  const { data: sup } = await supabase.from("supplements").select("id, claims(job_id)").eq("id", v.id).maybeSingle();
  if (!sup) return { error: "Supplement not found." };
  const jobId = (sup.claims as unknown as { job_id: string }).job_id;
  // Photos must belong to this job.
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
  if (!sup) return { error: "Supplement not found." };
  const claim = sup.claims as unknown as { id: string; job_id: string; stage: string };
  const today = isoDate(new Date());
  const patch: Record<string, unknown> = { status, carrier_response: str(fd, "carrier_response") ?? sup.carrier_response };

  if (status === "submitted") {
    if ((((sup.supplement_items as unknown as { count: number }[]) ?? [])[0]?.count ?? 0) === 0) return { error: "Add at least one line item before submitting." };
    const submitted = str(fd, "submitted_on") ?? sup.submitted_on ?? today;
    if (submitted > today) return { error: "Submitted date can't be in the future." };
    patch.submitted_on = submitted;
    // Fresh submission (or a re-submission date change) restarts the 5/10/14-day reminders.
    if (sup.status !== "submitted" || submitted !== sup.submitted_on) {
      // A past first reminder (late data entry) simply shows as due now.
      patch.next_follow_up_on = followUpDate(submitted, 0);
      patch.follow_up_count = 0;
    }
  } else if (status === "approved" || status === "partial" || status === "denied") {
    const approved = status === "denied" ? 0 : money(fd, "approved_amount") || (status === "approved" ? Number(sup.requested_amount) : 0);
    if (status === "partial" && !(approved > 0)) return { error: "Enter the amount the carrier approved." };
    patch.approved_amount = approved;
    patch.responded_on = str(fd, "responded_on") ?? today;
    patch.next_follow_up_on = null;
    if (!sup.submitted_on) patch.submitted_on = patch.responded_on;
  } else {
    patch.next_follow_up_on = null;
  }
  const { error } = await supabase.from("supplements").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  if (status === "submitted" && ["scope_received", "adjuster_met"].includes(claim.stage)) {
    await supabase.from("claims").update({ stage: "supplementing" }).eq("id", claim.id);
  }
  refresh(claim.job_id);
  return {
    ok:
      status === "approved" || status === "partial"
        ? "Saved. An expected supplement check was added to the insurance ledger."
        : status === "submitted"
          ? "Marked submitted. Follow-up reminders are set."
          : "Saved.",
  };
}

export async function markFollowedUp(fd: FormData) {
  const { supabase } = await ctx();
  const id = String(fd.get("id"));
  const { data: sup } = await supabase.from("supplements").select("id, status, submitted_on, follow_up_count, claims(job_id)").eq("id", id).maybeSingle();
  if (!sup || sup.status !== "submitted" || !sup.submitted_on) throw new Error("Only submitted supplements have follow-ups.");
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
  if (sup.status !== "draft") throw new Error("Only draft supplements can be deleted.");
  const { error } = await supabase.from("supplements").delete().eq("id", sup.id);
  if (error) throw new Error(friendly(error));
  const jobId = (sup.claims as unknown as { job_id: string }).job_id;
  refresh(jobId);
  redirect(`/app/jobs/${jobId}/claim/supplements`);
}

// ---------------------------------------------------------------------------
// Scope comparison
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
  if (source === "carrier" && ["contingency_signed", "claim_filed", "adjuster_scheduled", "adjuster_met"].includes(claim.stage)) {
    await supabase.from("claims").update({ stage: "scope_received" }).eq("id", claim.id);
  }
  refresh(claim.job_id);
  return { ok: `Imported ${lines.length} ${source} line${lines.length === 1 ? "" : "s"}.` };
}

export async function copyEstimateToScope(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await ctx();
  const claim = await claimById(supabase, String(fd.get("claim_id")));
  if (!claim) return { error: "Claim not found." };
  const est = await acceptedEstimateTotal(supabase, claim.job_id);
  if (!est) return { error: "This job has no accepted estimate yet." };
  if (!est.items.length) return { error: "The accepted estimate has no line items." };
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
  const { data: sup, error } = await supabase.from("supplements").insert({ org_id: org.id, claim_id: claim.id, notes: "Created from scope comparison." }).select("id").single();
  if (error) throw new Error(friendly(error));
  const ins = await supabase.from("supplement_items").insert(items.map((it, i) => ({ ...it, org_id: org.id, supplement_id: sup.id, position: i })));
  if (ins.error) throw new Error(friendly(ins.error));
  if (["scope_received", "adjuster_met"].includes(claim.stage)) await supabase.from("claims").update({ stage: "supplementing" }).eq("id", claim.id);
  refresh(claim.job_id);
  redirect(`/app/jobs/${claim.job_id}/claim/supplements/${sup.id}`);
}
