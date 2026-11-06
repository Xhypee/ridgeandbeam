// Insurance claim domain: stages, policy types, money math, supplement follow-ups.
// Pure functions only (safe in client and server components).
import type { Tone } from "./format";

export const CLAIM_STAGES = [
  "contingency_signed",
  "claim_filed",
  "adjuster_scheduled",
  "adjuster_met",
  "scope_received",
  "supplementing",
  "approved",
  "built",
  "coc_sent",
  "depreciation_released",
  "closed",
  "denied",
] as const;
export type ClaimStage = (typeof CLAIM_STAGES)[number];

/** The normal path, in order (closed/denied are end states, not steps). */
export const CLAIM_FLOW: ClaimStage[] = CLAIM_STAGES.filter((s) => s !== "denied" && s !== "closed");

export const CLAIM_STAGE_LABEL: Record<ClaimStage, string> = {
  contingency_signed: "Contingency signed",
  claim_filed: "Claim filed",
  adjuster_scheduled: "Adjuster scheduled",
  adjuster_met: "Adjuster met",
  scope_received: "Carrier scope in",
  supplementing: "Supplementing",
  approved: "Approved",
  built: "Built",
  coc_sent: "COC sent",
  depreciation_released: "Depreciation paid",
  closed: "Closed",
  denied: "Denied",
};

/** What the office should be doing in each stage (one line, plain language). */
export const CLAIM_STAGE_HINT: Record<ClaimStage, string> = {
  contingency_signed: "Homeowner signed. Next: help them file the claim with their insurance company.",
  claim_filed: "Claim is filed. Next: get the adjuster inspection on the calendar.",
  adjuster_scheduled: "Be on the roof with the adjuster. Bring photos and measurements.",
  adjuster_met: "Waiting for the carrier's written estimate (the scope).",
  scope_received: "Compare the carrier scope with yours and supplement anything missing.",
  supplementing: "Supplement sent. Follow up every few days until the carrier answers.",
  approved: "Money is approved. Schedule the build and collect the deductible.",
  built: "Roof is done. Send the certificate of completion and final invoice.",
  coc_sent: "Waiting for the carrier to release the held-back depreciation.",
  depreciation_released: "Final carrier check released. Deposit it and close out.",
  closed: "All money in. Nothing left to do.",
  denied: "Carrier denied the claim. Consider a re-inspection or move to a retail price.",
};

export function nextClaimStage(s: ClaimStage): ClaimStage | null {
  if (s === "closed" || s === "denied") return null;
  const i = CLAIM_FLOW.indexOf(s);
  return i >= 0 && i < CLAIM_FLOW.length - 1 ? CLAIM_FLOW[i + 1] : "closed";
}

export const POLICY_TYPES = ["rcv", "acv", "roof_schedule", "unknown"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_LABEL: Record<PolicyType, string> = {
  rcv: "Replacement cost (RCV)",
  acv: "Actual cash value (ACV)",
  roof_schedule: "Roof payment schedule",
  unknown: "Not sure yet",
};
export const POLICY_HINT: Record<PolicyType, string> = {
  rcv: "Pays to replace the roof. First check is ACV; the held-back depreciation is paid after the work is done.",
  acv: "Pays only the roof's depreciated value. Held-back depreciation is NOT paid later.",
  roof_schedule: "Pays a percentage based on the roof's age. Depreciation is usually NOT paid later.",
  unknown: "Ask the homeowner for the declarations page. Until then, assume depreciation may not come back.",
};

export type ClaimMoneyInput = {
  policy_type: PolicyType;
  rcv_amount: number | string | null;
  depreciation_amount: number | string | null;
  deductible: number | string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const n0 = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type ClaimMoney = {
  rcv: number;
  depreciation: number;
  deductible: number;
  /** First carrier check: RCV - depreciation - deductible (never below zero). */
  acvPayable: number;
  /** "yes" = paid after the work is done; "no" = lost; "maybe" = policy type unknown. */
  recoverable: "yes" | "no" | "maybe";
  /** Depreciation the carrier is expected to release later (0 unless recoverable). */
  depreciationRecoverable: number;
  /** Depreciation the carrier will keep (non-recoverable). */
  depreciationLost: number;
  /** Total the carrier is expected to pay (ACV + recoverable depreciation). */
  carrierTotal: number;
  /** Homeowner always owes the deductible. */
  homeownerDeductible: number;
  warnings: string[];
};

export function claimMoney(c: ClaimMoneyInput): ClaimMoney {
  const rcv = r2(n0(c.rcv_amount));
  const depreciation = r2(n0(c.depreciation_amount));
  const deductible = r2(n0(c.deductible));
  const acvPayable = r2(Math.max(0, rcv - depreciation - deductible));
  const recoverable = c.policy_type === "rcv" ? "yes" : c.policy_type === "unknown" ? "maybe" : "no";
  const depreciationRecoverable = recoverable === "yes" ? depreciation : 0;
  const depreciationLost = recoverable === "no" ? depreciation : 0;
  const warnings: string[] = [];
  if (rcv > 0 && depreciation + deductible > rcv) warnings.push("Depreciation plus deductible is more than the RCV. Double-check the carrier numbers.");
  if (recoverable === "no" && depreciation > 0)
    warnings.push(`This policy does not pay back depreciation. ${money(depreciation)} will not come from the carrier — the homeowner must cover it or it must be recovered by supplements.`);
  if (recoverable === "maybe" && depreciation > 0)
    warnings.push(`Policy type is unknown. ${money(depreciation)} of depreciation may not be paid back. Get the declarations page.`);
  return {
    rcv,
    depreciation,
    deductible,
    acvPayable,
    recoverable,
    depreciationRecoverable,
    depreciationLost,
    carrierTotal: r2(acvPayable + depreciationRecoverable),
    homeownerDeductible: deductible,
    warnings,
  };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function money(n: number) {
  return usd.format(n);
}

/** States where waiving/rebating the insurance deductible is prohibited or restricted. */
export const DEDUCTIBLE_WAIVER_STATES: Record<string, string> = {
  TX: "Texas law prohibits waiving or rebating the deductible.",
  CO: "Colorado law prohibits waiving or rebating the deductible.",
  FL: "Florida law prohibits waiving or rebating the deductible (can be a felony).",
  KS: "Kansas restricts waiving or rebating the deductible.",
  MN: "Minnesota restricts waiving or rebating the deductible.",
};

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------
export const CHECK_KINDS = ["acv", "depreciation", "supplement", "deductible", "other"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
export const CHECK_KIND_LABEL: Record<CheckKind, string> = {
  acv: "ACV check",
  depreciation: "Depreciation check",
  supplement: "Supplement check",
  deductible: "Deductible",
  other: "Other",
};
export const PAYERS = ["carrier", "homeowner", "mortgagee"] as const;
export type Payer = (typeof PAYERS)[number];
export const PAYER_LABEL: Record<Payer, string> = { carrier: "Insurance company", homeowner: "Homeowner", mortgagee: "Mortgage company" };

export const ENDORSEMENTS = ["not_required", "needed", "sent_to_lender", "endorsed"] as const;
export type Endorsement = (typeof ENDORSEMENTS)[number];
export const ENDORSEMENT_LABEL: Record<Endorsement, string> = {
  not_required: "No endorsement needed",
  needed: "Needs endorsement",
  sent_to_lender: "Sent to lender",
  endorsed: "Endorsed",
};
export const ENDORSEMENT_TONE: Record<Endorsement, Tone> = { not_required: "slate", needed: "amber", sent_to_lender: "blue", endorsed: "green" };

export type ExpectedCheck = { kind: CheckKind; payer: Payer; label: string; expected_amount: number; endorsement: Endorsement };

/** The checks a claim should produce, from its numbers. */
export function expectedChecks(c: ClaimMoneyInput & { mortgagee_name?: string | null }): ExpectedCheck[] {
  const m = claimMoney(c);
  const endorsement: Endorsement = c.mortgagee_name?.trim() ? "needed" : "not_required";
  const out: ExpectedCheck[] = [];
  if (m.acvPayable > 0) out.push({ kind: "acv", payer: "carrier", label: "First check (ACV)", expected_amount: m.acvPayable, endorsement });
  if (m.depreciation > 0 && m.recoverable !== "no")
    out.push({
      kind: "depreciation",
      payer: "carrier",
      label: m.recoverable === "yes" ? "Recoverable depreciation" : "Depreciation (confirm it is recoverable)",
      expected_amount: m.depreciation,
      endorsement,
    });
  if (m.deductible > 0) out.push({ kind: "deductible", payer: "homeowner", label: "Homeowner deductible", expected_amount: m.deductible, endorsement: "not_required" });
  return out;
}

// ---------------------------------------------------------------------------
// Loss-draft paperwork
// ---------------------------------------------------------------------------
export const DOC_LABEL: Record<string, string> = {
  w9: "W-9 (your company)",
  contract: "Signed contract",
  scope: "Carrier scope / estimate",
  coc: "Certificate of completion",
  final_invoice: "Final invoice",
  lien_waiver: "Lien waiver",
  license_coi: "License & insurance certificate",
  photos: "Completion photos",
  endorsed_check: "Endorsed check copy",
  other: "Other",
};
export const DOC_STATUSES = ["missing", "ready", "sent", "accepted"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_TONE: Record<DocStatus, Tone> = { missing: "red", ready: "amber", sent: "blue", accepted: "green" };

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------
export const SUPPLEMENT_STATUSES = ["draft", "submitted", "approved", "partial", "denied"] as const;
export type SupplementStatus = (typeof SUPPLEMENT_STATUSES)[number];
export const SUPPLEMENT_STATUS_TONE: Record<SupplementStatus, Tone> = { draft: "slate", submitted: "amber", approved: "green", partial: "blue", denied: "red" };
export const SUPPLEMENT_STATUS_LABEL: Record<SupplementStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  partial: "Partly approved",
  denied: "Denied",
};

/** Follow-up reminders after submission: day 5, 10 and 14, then weekly. */
export const FOLLOW_UP_DAYS = [5, 10, 14] as const;

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Follow-up date number `count` (0-based) after a submission date. */
export function followUpDate(submittedOn: string, count: number): string {
  if (count < FOLLOW_UP_DAYS.length) return addDays(submittedOn, FOLLOW_UP_DAYS[count]);
  return addDays(submittedOn, FOLLOW_UP_DAYS[FOLLOW_UP_DAYS.length - 1] + 7 * (count - FOLLOW_UP_DAYS.length + 1));
}

/**
 * After the office follows up on `today`, the next reminder is the first scheduled
 * date that is after today (so a late follow-up doesn't leave a reminder in the past).
 */
export function nextFollowUpAfter(submittedOn: string, followUpCount: number, today: string): { date: string; count: number } {
  let count = followUpCount + 1;
  let d = followUpDate(submittedOn, count);
  while (d <= today) {
    count++;
    d = followUpDate(submittedOn, count);
  }
  return { date: d, count };
}

/** Common code citations for supplement lines (verify against the locally adopted code edition). */
export const CODE_CITATIONS: Record<string, string> = {
  drip_edge: "IRC R905.2.8.5 (drip edge at eaves and rakes)",
  ice_water: "IRC R905.1.2 (ice barrier at eaves)",
  step_flashing: "IRC R905.2.8.3 (sidewall step flashing)",
  counter_flashing: "IRC R905.2.8.1 (base and cap flashing)",
  valley: "IRC R905.2.8.2 (valley lining)",
  starter: "IRC R905.1 / manufacturer installation instructions (starter course)",
  ridge_cap: "IRC R905.1 / manufacturer installation instructions (hip & ridge)",
  decking: "IRC R905.2.1 (solid sheathing required)",
  underlayment: "IRC R905.2.3 (underlayment)",
  permit: "Local building department permit requirement",
};

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(toIso + "T12:00:00Z").getTime() - new Date(fromIso + "T12:00:00Z").getTime()) / 86400000);
}

/** Aging tone for days in a stage: amber after a week, red after two. */
export function agingTone(days: number): Tone {
  return days > 14 ? "red" : days > 7 ? "amber" : "slate";
}
