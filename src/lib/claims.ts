// Australian home insurance claims: stages, cover types, settlement paths, expected payments,
// General Insurance Code of Practice timeframe guide, homeowner explainer, variation-request follow-ups.
// Pure functions only (safe in client and server components).
//
// Australia has no ACV/RCV depreciation split, no mortgagee-endorsed cheques and no deductible waivers:
// the homeowner pays an EXCESS, and the insurer either manages the repair (often through its own
// panel builder), approves the homeowner's own builder, or pays a cash settlement to the homeowner.
import type { Tone } from "./format";

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
/** Every value of the claim_stage enum (legacy US values are kept in the DB type only). */
export const CLAIM_STAGE_VALUES = [
  "lodged", "assessor_booked", "assessed", "scope_received", "approved", "declined", "cash_settlement_offered",
  "work_authorised", "built", "invoiced", "paid", "closed",
  // legacy (US) — mapped to AU stages by the 20261110000301 migration; never offered in the UI
  "contingency_signed", "claim_filed", "adjuster_scheduled", "adjuster_met", "supplementing", "coc_sent", "depreciation_released", "denied",
] as const;
export type ClaimStage = (typeof CLAIM_STAGE_VALUES)[number];

/** Australian stages, in the order the office works them. */
export const CLAIM_STAGES = [
  "lodged", "assessor_booked", "assessed", "scope_received", "approved", "declined", "cash_settlement_offered",
  "work_authorised", "built", "invoiced", "paid", "closed",
] as const satisfies readonly ClaimStage[];
export type AuClaimStage = (typeof CLAIM_STAGES)[number];

/** The normal path (declined / cash settlement offered are decision outcomes; closed is the end). */
export const CLAIM_FLOW: AuClaimStage[] = ["lodged", "assessor_booked", "assessed", "scope_received", "approved", "work_authorised", "built", "invoiced", "paid"];
/** Stages where the insurer has made its decision. */
export const DECIDED_STAGES: AuClaimStage[] = ["approved", "declined", "cash_settlement_offered", "work_authorised", "built", "invoiced", "paid", "closed"];

const LEGACY: Partial<Record<ClaimStage, AuClaimStage>> = {
  contingency_signed: "lodged",
  claim_filed: "lodged",
  adjuster_scheduled: "assessor_booked",
  adjuster_met: "assessed",
  supplementing: "scope_received",
  coc_sent: "invoiced",
  depreciation_released: "paid",
  denied: "declined",
};
export function auStage(s: ClaimStage | string): AuClaimStage {
  return (LEGACY[s as ClaimStage] ?? ((CLAIM_STAGES as readonly string[]).includes(s) ? s : "lodged")) as AuClaimStage;
}

const AU_LABEL: Record<AuClaimStage, string> = {
  lodged: "Claim lodged",
  assessor_booked: "Assessor booked",
  assessed: "Assessed",
  scope_received: "Scope received",
  approved: "Approved",
  declined: "Declined",
  cash_settlement_offered: "Cash settlement offered",
  work_authorised: "Work authorised",
  built: "Built",
  invoiced: "Invoiced",
  paid: "Paid",
  closed: "Closed",
};
/** Label for any stage value (legacy values show their AU equivalent). */
export const CLAIM_STAGE_LABEL = Object.fromEntries(CLAIM_STAGE_VALUES.map((s) => [s, AU_LABEL[auStage(s)]])) as Record<ClaimStage, string>;

/** Plain-language stage text for the homeowner portal. */
export const CLAIM_STAGE_PLAIN: Record<AuClaimStage, string> = {
  lodged: "Your claim is lodged with your insurer",
  assessor_booked: "The insurer's assessor is booked to inspect",
  assessed: "The assessor has inspected the roof",
  scope_received: "The insurer has sent its scope of works",
  approved: "Your insurer has approved the claim",
  declined: "Your insurer has declined the claim",
  cash_settlement_offered: "Your insurer has offered a cash settlement",
  work_authorised: "The work is authorised",
  built: "The work is finished",
  invoiced: "Final invoice sent",
  paid: "All payments are in",
  closed: "Claim closed",
};

/** What the office should be doing in each stage (one line, plain language). */
export const CLAIM_STAGE_HINT: Record<AuClaimStage, string> = {
  lodged: "Claim is lodged. Next: find out when the insurer's assessor or loss adjuster will inspect.",
  assessor_booked: "Meet the assessor on site if you can. Bring dated photos, measurements and the storm details.",
  assessed: "Waiting for the insurer's scope of works. Check the make-safe is holding.",
  scope_received: "Compare the insurer's scope with yours and send a variation request for anything missing.",
  approved: "Approved. Confirm the settlement path and get the work authorised in writing.",
  declined: "The insurer declined. The homeowner can ask the insurer to review it through its complaints process.",
  cash_settlement_offered: "Cash settlement offered. If the homeowner engages you, they pay you directly — quote and contract with them.",
  work_authorised: "Work is authorised. Order materials and book the crew.",
  built: "Roof is done. Send the completion photos, completion certificate and tax invoice.",
  invoiced: "Tax invoice sent. Chase the insurer, panel builder or homeowner for payment.",
  paid: "All expected money is in. Close the claim.",
  closed: "Nothing left to do.",
};

export function nextClaimStage(s: ClaimStage | string): AuClaimStage | null {
  const a = auStage(s);
  if (a === "closed" || a === "declined") return null;
  if (a === "cash_settlement_offered") return "work_authorised";
  const i = CLAIM_FLOW.indexOf(a);
  return i >= 0 && i < CLAIM_FLOW.length - 1 ? CLAIM_FLOW[i + 1] : "closed";
}

// ---------------------------------------------------------------------------
// Policy cover, event, catastrophe, settlement path, make-safe
// ---------------------------------------------------------------------------
export const POLICY_TYPES = ["replacement", "indemnity", "unknown"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];
export const POLICY_LABEL: Record<string, string> = {
  replacement: "New for old / replacement (sum insured)",
  indemnity: "Indemnity (allows for wear and age)",
  unknown: "Not sure yet",
  rcv: "New for old / replacement (sum insured)",
  acv: "Indemnity (allows for wear and age)",
  roof_schedule: "Not sure yet",
};
export const POLICY_HINT: Record<PolicyType, string> = {
  replacement: "Most home policies. The insurer pays to repair or replace with new materials, up to the sum insured on the policy.",
  indemnity: "Pays the value of what was damaged, allowing for its age and condition — the homeowner may need to top up the cost of new work.",
  unknown: "Ask the homeowner for their policy schedule or certificate of insurance. It shows the cover type and sum insured.",
};
export const asPolicyType = (p: string | null | undefined): PolicyType => (p === "replacement" || p === "rcv" ? "replacement" : p === "indemnity" || p === "acv" ? "indemnity" : "unknown");

export const EVENT_TYPES = ["hail", "storm", "cyclone", "flood", "fire", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABEL: Record<EventType, string> = { hail: "Hail", storm: "Storm / wind", cyclone: "Cyclone", flood: "Flood", fire: "Bushfire / fire", other: "Other" };

export const CATASTROPHES = ["none", "declared", "extraordinary"] as const;
export type Catastrophe = (typeof CATASTROPHES)[number];
export const CATASTROPHE_LABEL: Record<Catastrophe, string> = {
  none: "No catastrophe declared",
  declared: "ICA catastrophe declared",
  extraordinary: "ICA extraordinary catastrophe declared",
};

export const SETTLEMENT_PATHS = ["undecided", "insurer_managed", "own_builder", "cash_settlement"] as const;
export type SettlementPath = (typeof SETTLEMENT_PATHS)[number];
export const SETTLEMENT_LABEL: Record<SettlementPath, string> = {
  undecided: "Not decided yet",
  insurer_managed: "Insurer-managed repair (insurer's builder network)",
  own_builder: "Homeowner's own builder (us), approved by the insurer",
  cash_settlement: "Cash settlement paid to the homeowner",
};
export const SETTLEMENT_SHORT: Record<SettlementPath, string> = {
  undecided: "Settlement not decided",
  insurer_managed: "Insurer-managed repair",
  own_builder: "Own builder (approved)",
  cash_settlement: "Cash settlement",
};
export const SETTLEMENT_HINT: Record<SettlementPath, string> = {
  undecided: "The insurer decides how to settle after assessing the claim.",
  insurer_managed: "The insurer arranges the repair through its builder or repair network. If you work for the insurer's panel builder, they pay you on their terms and usually collect the homeowner's excess.",
  own_builder: "The insurer approves you to do the work, usually paying you its approved amount less the excess. The homeowner pays the excess and anything outside the insurer's scope.",
  cash_settlement: "The insurer pays the homeowner. You quote, contract with and are paid by the homeowner like a normal job.",
};

export const MAKE_SAFE_AUTHORISERS = ["insurer", "homeowner", "panel_builder", "roofer"] as const;
export const MAKE_SAFE_PAYERS = ["insurer", "homeowner", "panel_builder"] as const;
export type MakeSafePayer = (typeof MAKE_SAFE_PAYERS)[number];
export const PARTY_LABEL: Record<string, string> = { insurer: "Insurer", homeowner: "Homeowner", panel_builder: "Panel builder", roofer: "Us (emergency)" };

// ---------------------------------------------------------------------------
// Ledger: expected vs received by payer
// ---------------------------------------------------------------------------
export const CHECK_KINDS = ["scope", "excess", "variation", "make_safe", "balance", "cash_settlement", "other"] as const;
export type AuCheckKind = (typeof CHECK_KINDS)[number];
export type CheckKind = AuCheckKind | "acv" | "depreciation" | "supplement" | "deductible";
export const CHECK_KIND_LABEL: Record<CheckKind, string> = {
  scope: "Approved scope of works",
  excess: "Excess",
  variation: "Variation request",
  make_safe: "Make-safe / temporary repairs",
  balance: "Homeowner balance",
  cash_settlement: "Cash settlement work",
  other: "Other",
  acv: "Insurer payment",
  depreciation: "Insurer payment",
  supplement: "Variation request",
  deductible: "Excess",
};
export const PAYERS = ["carrier", "homeowner", "panel_builder"] as const;
export type AuPayer = (typeof PAYERS)[number];
export type Payer = AuPayer | "mortgagee";
export const PAYER_LABEL: Record<Payer, string> = { carrier: "Insurer", homeowner: "Homeowner", panel_builder: "Panel builder", mortgagee: "Insurer" };

export const PAYER_GROUPS = ["insurer", "homeowner_excess", "panel_builder", "homeowner_balance"] as const;
export type PayerGroup = (typeof PAYER_GROUPS)[number];
export const PAYER_GROUP_LABEL: Record<PayerGroup, string> = {
  insurer: "Insurer",
  homeowner_excess: "Homeowner excess",
  panel_builder: "Panel builder",
  homeowner_balance: "Homeowner balance",
};
export const PAYER_GROUP_TONE: Record<PayerGroup, Tone> = { insurer: "violet", homeowner_excess: "blue", panel_builder: "cyan", homeowner_balance: "amber" };

export function payerGroup(c: { kind: string; payer: string }): PayerGroup {
  if (c.payer === "panel_builder") return "panel_builder";
  if (c.payer === "homeowner") return c.kind === "excess" || c.kind === "deductible" ? "homeowner_excess" : "homeowner_balance";
  return "insurer";
}

export type ClaimMoneyInput = {
  settlement_path: SettlementPath | string;
  excess: number | string | null;
  approved_amount: number | string | null;
  cash_settlement_amount?: number | string | null;
  panel_builder_name?: string | null;
  make_safe_payer?: string | null;
  make_safe_amount?: number | string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const n0 = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type ExpectedPayment = { kind: AuCheckKind; payer: AuPayer; label: string; expected_amount: number };

/**
 * The payments a claim should produce for us, from its settlement path.
 * contractTotal = our accepted price to the homeowner (GST-inclusive), when there is one.
 */
export function expectedPayments(c: ClaimMoneyInput, contractTotal: number | null = null): ExpectedPayment[] {
  const excess = r2(Math.max(0, n0(c.excess)));
  const approved = r2(Math.max(0, n0(c.approved_amount)));
  const out: ExpectedPayment[] = [];
  const add = (p: ExpectedPayment) => { if (p.expected_amount > 0.004) out.push({ ...p, expected_amount: r2(p.expected_amount) }); };
  const panel = c.panel_builder_name?.trim();
  switch (c.settlement_path) {
    case "insurer_managed":
      if (panel) add({ kind: "scope", payer: "panel_builder", label: `Panel builder (${panel}): approved scope`, expected_amount: approved });
      else {
        add({ kind: "scope", payer: "carrier", label: "Insurer: approved scope less excess", expected_amount: Math.max(0, approved - excess) });
        add({ kind: "excess", payer: "homeowner", label: "Homeowner excess", expected_amount: approved > 0 ? excess : 0 });
      }
      break;
    case "own_builder":
      add({ kind: "scope", payer: "carrier", label: "Insurer: approved scope less excess", expected_amount: Math.max(0, approved - excess) });
      add({ kind: "excess", payer: "homeowner", label: "Homeowner excess", expected_amount: approved > 0 ? excess : 0 });
      if (contractTotal != null && approved > 0) add({ kind: "balance", payer: "homeowner", label: "Homeowner: work outside the insurer's scope", expected_amount: contractTotal - approved });
      break;
    case "cash_settlement":
      add({ kind: "cash_settlement", payer: "homeowner", label: "Homeowner (paid from their cash settlement)", expected_amount: contractTotal ?? n0(c.cash_settlement_amount) });
      break;
  }
  const ms = n0(c.make_safe_amount);
  if (ms > 0 && c.make_safe_payer) {
    const payer: AuPayer = c.make_safe_payer === "insurer" ? "carrier" : c.make_safe_payer === "panel_builder" ? "panel_builder" : "homeowner";
    add({ kind: "make_safe", payer, label: "Make-safe / temporary repairs", expected_amount: ms });
  }
  return out;
}

export type ClaimMoney = {
  approved: number;
  excess: number;
  /** What each party is expected to pay us. */
  byGroup: Record<PayerGroup, number>;
  total: number;
  /** Our price minus the insurer's approved amount (positive = insurer scope is short). */
  scopeGap: number | null;
  warnings: string[];
};

export function claimMoney(c: ClaimMoneyInput, contractTotal: number | null = null): ClaimMoney {
  const plan = expectedPayments(c, contractTotal);
  const byGroup: Record<PayerGroup, number> = { insurer: 0, homeowner_excess: 0, panel_builder: 0, homeowner_balance: 0 };
  for (const p of plan) byGroup[payerGroup(p)] = r2(byGroup[payerGroup(p)] + p.expected_amount);
  const approved = r2(n0(c.approved_amount));
  const excess = r2(n0(c.excess));
  const warnings: string[] = [];
  if (c.settlement_path === "undecided") warnings.push("Settlement path not decided yet. Ask the insurer whether it will manage the repair, approve you as the builder, or cash settle.");
  if (approved > 0 && excess > approved) warnings.push("The excess is more than the insurer's approved amount. Double-check both figures.");
  if (c.settlement_path === "insurer_managed" && c.panel_builder_name?.trim()) warnings.push("The panel builder usually collects the homeowner's excess, not you.");
  const scopeGap = contractTotal != null && approved > 0 && c.settlement_path !== "cash_settlement" ? r2(contractTotal - approved) : null;
  if (scopeGap != null && scopeGap > 0 && c.settlement_path === "insurer_managed")
    warnings.push(`Your price is ${aud(scopeGap)} more than the insurer's approved amount. Send a variation request or agree the gap before starting.`);
  return { approved, excess, byGroup, total: r2(plan.reduce((s, p) => s + p.expected_amount, 0)), scopeGap, warnings };
}

const audFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const aud = (n: number) => audFmt.format(n);

// ---------------------------------------------------------------------------
// General Insurance Code of Practice timeframe guide
// Source: research_notes/Australian roofing law by state/insurance_payments_warranties.md §1 (ICA Code page;
// Feb 2025 Code as reported):
//  - claim decision within 4 months of lodgement (12 months under an extraordinary catastrophe declaration)
//  - decision within 10 business days once all information is received and enquiries are complete
//  - progress updates at least every 20 business days (older summary; indicative)
// Reminders only — always labelled "Code of Practice guide — check current Code" in the UI.
// ---------------------------------------------------------------------------
export const CODE_GUIDE_LABEL = "Code of Practice guide — check current Code";

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
/** Mon–Fri business days (public holidays are not counted). */
export function addBusinessDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(toIso + "T12:00:00Z").getTime() - new Date(fromIso + "T12:00:00Z").getTime()) / 86400000);
}

export type CodeReminder = { key: "decision" | "decision_after_info" | "update"; label: string; due: string; daysLeft: number; status: "overdue" | "soon" | "ok"; detail: string };

export function codeTimeframes(
  c: { stage: string; lodged_on: string | null; info_complete_on?: string | null; last_insurer_update_on?: string | null; decision_on?: string | null; catastrophe?: string | null },
  today: string,
): CodeReminder[] {
  if (!c.lodged_on || c.decision_on || DECIDED_STAGES.includes(auStage(c.stage))) return [];
  const mk = (key: CodeReminder["key"], label: string, due: string, detail: string): CodeReminder => {
    const daysLeft = daysBetween(today, due);
    return { key, label, due, daysLeft, status: daysLeft < 0 ? "overdue" : daysLeft <= 5 ? "soon" : "ok", detail };
  };
  const extraordinary = c.catastrophe === "extraordinary";
  const out: CodeReminder[] = [
    mk("decision", "Insurer's claim decision", addMonthsIso(c.lodged_on, extraordinary ? 12 : 4),
      extraordinary
        ? "About 12 months from lodgement under an extraordinary catastrophe declaration."
        : "About 4 months from lodgement (longer in some circumstances). If the insurer can't decide in time it should tell the homeowner about its complaints process."),
  ];
  if (c.info_complete_on) out.push(mk("decision_after_info", "Decision once information is complete", addBusinessDaysIso(c.info_complete_on, 10), "About 10 business days after the insurer has everything it asked for."));
  out.push(mk("update", "Next progress update from the insurer", addBusinessDaysIso(c.last_insurer_update_on ?? c.lodged_on, 20), "Updates at least every 20 business days (indicative)."));
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// ---------------------------------------------------------------------------
// Homeowner explainer: excess, cash settlement, complaints (general information only)
// ---------------------------------------------------------------------------
export type ExplainerSection = { title: string; body: string[] };

export function homeownerExplainer(c: { excess?: number | string | null; settlement_path?: string | null; insurer?: string | null; orgName: string }): ExplainerSection[] {
  const insurer = c.insurer?.trim() || "your insurer";
  const excess = n0(c.excess);
  const excessLine =
    excess > 0
      ? c.settlement_path === "cash_settlement"
        ? `Your excess on this claim is ${aud(excess)}. With a cash settlement, ${insurer} usually takes the excess off the amount it pays you.`
        : c.settlement_path === "insurer_managed"
          ? `Your excess on this claim is ${aud(excess)}. You pay it to whoever ${insurer} tells you — often the insurer's builder.`
          : `Your excess on this claim is ${aud(excess)}. ${insurer === "your insurer" ? "Your insurer" : insurer} will confirm who you pay it to.`
      : "Your policy schedule shows your excess. Your insurer will confirm the amount for this claim.";
  return [
    {
      title: "What is the excess?",
      body: ["The excess is the amount you agreed to pay towards each claim when you took out your policy. It is set by your policy, not by us.", excessLine],
    },
    {
      title: "Repair or cash settlement",
      body: [
        `After the assessment, ${insurer} decides how to settle: it can arrange the repair through its own builders, approve a builder you choose, or offer you a cash settlement instead.`,
        "With a cash settlement you arrange and pay for the repair yourself, and the insurer no longer manages or stands behind that work. You can ask the insurer how it worked out the amount, and whether it can be reviewed, before you accept.",
      ],
    },
    {
      title: "If you're unhappy with a decision",
      body: [
        `Contact ${insurer} first and say you want to make a complaint. Every insurer has an internal complaints process.`,
        "If it isn't sorted out, you can take it to the Australian Financial Complaints Authority (AFCA), a free, independent service — afca.org.au or 1800 931 678.",
      ],
    },
    {
      title: `How ${c.orgName} fits in`,
      body: [
        "We inspect the roof, take dated photos and give you and your insurer a quote for the work. We can talk to the insurer's assessor about the roof.",
        "We don't decide your claim and we can't negotiate it for you — that is between you and your insurer.",
      ],
    },
  ];
}
export const EXPLAINER_FOOTNOTE = "General information only. Your policy wording (PDS) and your insurer have the final say on your claim.";

// ---------------------------------------------------------------------------
// Claim paperwork (Australian checklist)
// ---------------------------------------------------------------------------
export const AU_DOC_TYPES = ["insurer_scope", "work_order", "make_safe_report", "storm_evidence", "photos", "licence_insurance", "hwi_certificate", "completion_certificate", "tax_invoice"] as const;
export const DOC_LABEL: Record<string, string> = {
  insurer_scope: "Insurer's scope of works",
  work_order: "Work order / authority to proceed",
  contract: "Signed contract",
  make_safe_report: "Make-safe report & photos",
  storm_evidence: "Storm evidence (dated photos, BOM event)",
  photos: "Completion photos",
  licence_insurance: "Licence & public liability certificate",
  hwi_certificate: "Home warranty insurance certificate (where required)",
  completion_certificate: "Completion certificate / sign-off",
  tax_invoice: "Tax invoice",
  other: "Other",
};
export const DOC_STATUSES = ["missing", "ready", "sent", "accepted"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_TONE: Record<DocStatus, Tone> = { missing: "red", ready: "amber", sent: "blue", accepted: "green" };

// ---------------------------------------------------------------------------
// Variation requests (DB table: supplements) — rounds, follow-ups
// ---------------------------------------------------------------------------
export const SUPPLEMENT_STATUSES = ["draft", "submitted", "approved", "partial", "denied"] as const;
export type SupplementStatus = (typeof SUPPLEMENT_STATUSES)[number];
export const SUPPLEMENT_STATUS_TONE: Record<SupplementStatus, Tone> = { draft: "slate", submitted: "amber", approved: "green", partial: "blue", denied: "red" };
export const SUPPLEMENT_STATUS_LABEL: Record<SupplementStatus, string> = {
  draft: "Draft",
  submitted: "Sent to insurer",
  approved: "Approved",
  partial: "Partly approved",
  denied: "Not approved",
};

/** Follow-up reminders after sending: day 5, 10 and 14, then weekly. */
export const FOLLOW_UP_DAYS = [5, 10, 14] as const;

export function followUpDate(submittedOn: string, count: number): string {
  if (count < FOLLOW_UP_DAYS.length) return addDays(submittedOn, FOLLOW_UP_DAYS[count]);
  return addDays(submittedOn, FOLLOW_UP_DAYS[FOLLOW_UP_DAYS.length - 1] + 7 * (count - FOLLOW_UP_DAYS.length + 1));
}

/** After a follow-up on `today`, the next reminder is the first scheduled date after today. */
export function nextFollowUpAfter(submittedOn: string, followUpCount: number, today: string): { date: string; count: number } {
  let count = followUpCount + 1;
  let d = followUpDate(submittedOn, count);
  while (d <= today) {
    count++;
    d = followUpDate(submittedOn, count);
  }
  return { date: d, count };
}

/** Technical references for variation lines (Australian Standards / NCC — check the current edition). */
export const STANDARD_REFS: Record<string, string> = {
  sheet_roof: "AS 1562.1 — metal sheet roof cladding (fixing, laps, flashings)",
  tiles: "AS 2050 — installation of roof tiles (bedding, pointing, fixing)",
  sarking: "AS 4200.2 — installation of pliable membranes (sarking)",
  gutters: "AS/NZS 3500.3 — stormwater drainage (gutters, downpipes)",
  ncc: "NCC Housing Provisions — roof cladding",
  manufacturer: "Manufacturer's installation guide",
  edge_protection: "WHS: edge protection / fall prevention for roof work",
  asbestos: "Licensed asbestos removal",
};

/** Aging tone for days in a stage: amber after a week, red after two. */
export function agingTone(days: number): Tone {
  return days > 14 ? "red" : days > 7 ? "amber" : "slate";
}
