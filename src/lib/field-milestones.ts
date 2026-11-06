/** Homeowner portal data (shape returned by the get_public_job RPC) and derived milestones / claim progress. */
import { auStage, CLAIM_FLOW, CLAIM_STAGE_PLAIN, DECIDED_STAGES, type AuClaimStage } from "./claims";
import { date } from "./format";

export type PublicJob = {
  id: string;
  org_id: string;
  title: string;
  site_address: string | null;
  stage: string;
  job_type: string;
  /** The job's (or customer's) Australian state code. */
  state?: string | null;
  is_insurance: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  permit_status: string;
  materials_status: string;
  colors_confirmed: boolean;
  shingle_color: string | null;
  completed_at: string | null;
  walkthrough_signed_at: string | null;
  warranty_product: string | null;
  warranty_registered_at: string | null;
  created_at: string;
  org: {
    name: string; phone: string | null; email: string | null; website: string | null; address: string | null;
    license_number: string | null; insurance_certificate_url: string | null; certifications: string[] | null; google_review_url: string | null;
    abn?: string | null; licences?: Record<string, { number?: string; classes?: string[] }> | null;
  };
  customer: { first_name: string };
  crew: { name: string } | null;
  rep: { name: string | null; phone: string | null } | null;
  file_count: number;
  events: { kind: string; note: string | null; created_at: string; photo: string | null }[];
  photos: { storage_path: string; caption: string | null; category: string; slope: string | null; taken_at: string }[];
  estimates: { number: number; status: string; public_token: string; accepted_at: string | null; total: number }[];
  invoices: { number: number; status: string; kind: string; public_token: string; milestone_label: string | null; due_date: string | null; total: number; paid: number; balance: number }[];
  change_orders: { title: string; status: string; public_token: string; total: number }[];
  claim: null | PublicClaim;
  accepted_estimate: boolean;
};

/** Australian claim fields on the portal (claims + claim_checks). */
export type PublicClaim = {
  insurer: string | null; claim_number: string | null; stage: string; lodged_on?: string | null; event_type?: string | null;
  excess: number; settlement_path: string | null; approved_amount: number; cash_settlement_amount?: number;
  payments: { kind: string; payer: string; label: string | null; expected_amount: number; received_amount: number; received_on: string | null }[];
};

export type MilestoneStatus = "done" | "current" | "upcoming";
export type Milestone = { key: string; label: string; status: MilestoneStatus; date?: string | null; detail?: string };

const STAGE_ORDER = ["lead", "inspection", "estimate_sent", "sold", "scheduled", "in_progress", "completed", "paid"];
const atLeast = (stage: string, min: string) => stage !== "lost" && STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(min);

/** The claim step is done once the insurer has decided in the homeowner's favour (approved, authorised, built…). */
const claimDone = (stage: string) => {
  const a = auStage(stage);
  return DECIDED_STAGES.includes(a) && a !== "declined";
};

/** Auto-derive the homeowner milestone tracker from stage, readiness columns, events and close-out columns. */
export function deriveMilestones(j: PublicJob): Milestone[] {
  const ev = (k: string) => j.events.filter((e) => e.kind === k).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const s = j.stage;
  const m: (Omit<Milestone, "status"> & { done: boolean })[] = [];
  const push = (key: string, label: string, done: boolean, date?: string | null, detail?: string) => m.push({ key, label, done, date, detail });

  push("inspection", "Roof inspection", atLeast(s, "estimate_sent") || j.file_count > 0 || j.accepted_estimate, null);
  if (j.claim) {
    push("claim", "Insurance claim", claimDone(j.claim.stage), null, CLAIM_STAGE_PLAIN[auStage(j.claim.stage)]);
  }
  const accepted = j.estimates.find((e) => e.status === "accepted");
  push("contract", "Contract signed", Boolean(accepted) || atLeast(s, "sold"), accepted?.accepted_at);
  push("materials_ordered", "Materials ordered", ["ordered", "delivered"].includes(j.materials_status) || Boolean(ev("materials_delivered")));
  push("permit", "Council / building approval", ["approved", "not_needed"].includes(j.permit_status), ev("permit_approved")?.created_at,
    j.permit_status === "not_needed" ? "No approval needed for this work" : j.permit_status === "applied" ? "Lodged — waiting on the approval" : undefined);
  const delivered = ev("materials_delivered");
  push("delivered", "Materials delivered", j.materials_status === "delivered" || Boolean(delivered), delivered?.created_at);
  const tear = ev("tear_off_started");
  push("tear_off", "Strip old roof", Boolean(tear) || atLeast(s, "completed"), tear?.created_at,
    !tear && j.scheduled_start && !atLeast(s, "in_progress") ? `Booked to start ${date(j.scheduled_start, { day: "numeric", month: "short" })}` : undefined);
  const dry = ev("dry_in");
  push("dry_in", "Watertight", Boolean(dry) || atLeast(s, "completed"), dry?.created_at, "Sarking and new roof on — your home is protected from the weather");
  const done = ev("completed");
  push("complete", "Roof complete", Boolean(j.completed_at) || Boolean(done) || atLeast(s, "completed"), j.completed_at ?? done?.created_at);
  const clean = ev("cleanup_verified");
  push("cleanup", "Site clean-up", Boolean(clean), clean?.created_at);
  const finals = j.invoices.filter((v) => v.kind === "final" || v.kind === "standard");
  const allPaid = j.invoices.length > 0 && j.invoices.every((v) => Number(v.balance) <= 0);
  push("final_invoice", "Final invoice", s === "paid" || (finals.length > 0 && allPaid), null,
    finals.length && !allPaid ? "Sent — see Documents below" : undefined);
  push("warranty", "Warranty lodged", Boolean(j.warranty_registered_at), j.warranty_registered_at, j.warranty_product ?? undefined);

  // Field taps auto-advance the tracker: once a later step is done, earlier build steps are implied
  // (the crew can't tear off before materials arrive). The claim step keeps its own status.
  let lastDone = -1;
  m.forEach((x, i) => { if (x.done && x.key !== "claim") lastDone = i; });
  m.forEach((x, i) => { if (i < lastDone && x.key !== "claim") x.done = true; });

  // "current" = the first open step after the last finished one; an open claim behind it is also in progress.
  let currentSet = false;
  return m.map(({ done: d, ...rest }, i) => {
    let status: MilestoneStatus = d ? "done" : "upcoming";
    if (!d && i < lastDone) status = "current";
    else if (!d && !currentSet) {
      status = "current";
      currentSet = true;
    }
    return { ...rest, status };
  });
}

/** The step to headline ("Now: …"): the furthest step in progress. */
export function headlineMilestone(ms: Milestone[]) {
  return ms.filter((m) => m.status === "current").pop() ?? null;
}

export type ClaimProgress = {
  stage: AuClaimStage;
  stageText: string;
  /** Position on the normal path (lodged → paid), for a simple progress bar; -1 for declined / closed. */
  step: number;
  steps: number;
  excess: number;
  approved: number;
  /** Money received from the insurer (or its panel builder). */
  receivedFromInsurer: number;
  /** Still expected from the insurer / panel builder. */
  stillExpected: number;
  isCashSettlement: boolean;
};

/** Plain-language claim progress for the homeowner portal: Australian stages, excess, approved amount, insurer money expected vs received. */
export function claimProgress(claim: PublicClaim): ClaimProgress {
  const stage = auStage(claim.stage);
  const pays = claim.payments ?? [];
  const fromInsurer = pays.filter((p) => p.payer !== "homeowner");
  const r = (n: number) => Math.round(n * 100) / 100;
  const received = r(fromInsurer.reduce((t, p) => t + (Number(p.received_amount) || 0), 0));
  const expected = r(fromInsurer.reduce((t, p) => t + Math.max(0, (Number(p.expected_amount) || 0) - (Number(p.received_amount) || 0)), 0));
  return {
    stage,
    stageText: CLAIM_STAGE_PLAIN[stage],
    step: CLAIM_FLOW.indexOf(stage),
    steps: CLAIM_FLOW.length,
    excess: Number(claim.excess) || 0,
    approved: Number(claim.approved_amount) || 0,
    receivedFromInsurer: received,
    stillExpected: expected,
    isCashSettlement: claim.settlement_path === "cash_settlement" || stage === "cash_settlement_offered",
  };
}
