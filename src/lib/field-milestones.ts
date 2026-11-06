/** Homeowner portal data (shape returned by the get_public_job RPC) and derived milestones / claim explainer. */

export type PublicJob = {
  id: string;
  org_id: string;
  title: string;
  site_address: string | null;
  stage: string;
  job_type: string;
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
  claim: null | {
    carrier: string | null; claim_number: string | null; stage: string; policy_type: string;
    rcv_amount: number; depreciation_amount: number; deductible: number; mortgagee_name: string | null;
    checks: { kind: string; payer: string; label: string | null; expected_amount: number; received_amount: number; received_on: string | null; endorsement: string }[];
  };
  accepted_estimate: boolean;
};

export type MilestoneStatus = "done" | "current" | "upcoming";
export type Milestone = { key: string; label: string; status: MilestoneStatus; date?: string | null; detail?: string };

const STAGE_ORDER = ["lead", "inspection", "estimate_sent", "sold", "scheduled", "in_progress", "completed", "paid"];
const atLeast = (stage: string, min: string) => stage !== "lost" && STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(min);

const CLAIM_DONE = ["approved", "built", "coc_sent", "depreciation_released", "closed"];
export const CLAIM_STAGE_PLAIN: Record<string, string> = {
  contingency_signed: "Getting ready to file your claim",
  claim_filed: "Claim filed with your insurance company",
  adjuster_scheduled: "Adjuster inspection scheduled",
  adjuster_met: "Adjuster has inspected the roof",
  scope_received: "Insurance estimate received — we're reviewing it",
  supplementing: "Asking your insurer to cover missed items",
  approved: "Claim approved",
  built: "Roof built — final paperwork with your insurer",
  coc_sent: "Completion paperwork sent to your insurer",
  depreciation_released: "Insurer released the held-back money",
  closed: "Claim closed",
  denied: "Claim denied",
};

/** Auto-derive the homeowner milestone tracker from stage, readiness columns, events and close-out columns. */
export function deriveMilestones(j: PublicJob): Milestone[] {
  const ev = (k: string) => j.events.filter((e) => e.kind === k).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const s = j.stage;
  const m: (Omit<Milestone, "status"> & { done: boolean })[] = [];
  const push = (key: string, label: string, done: boolean, date?: string | null, detail?: string) => m.push({ key, label, done, date, detail });

  push("inspection", "Roof inspection", atLeast(s, "estimate_sent") || j.file_count > 0 || j.accepted_estimate, null);
  if (j.claim) {
    push("claim", "Insurance claim", CLAIM_DONE.includes(j.claim.stage), null, CLAIM_STAGE_PLAIN[j.claim.stage]);
  }
  const accepted = j.estimates.find((e) => e.status === "accepted");
  push("contract", "Contract signed", Boolean(accepted) || atLeast(s, "sold"), accepted?.accepted_at);
  push("materials_ordered", "Materials ordered", ["ordered", "delivered"].includes(j.materials_status) || Boolean(ev("materials_delivered")));
  push("permit", "Permit", ["approved", "not_needed"].includes(j.permit_status), ev("permit_approved")?.created_at,
    j.permit_status === "not_needed" ? "No permit needed" : j.permit_status === "applied" ? "Applied — waiting on the city" : undefined);
  const delivered = ev("materials_delivered");
  push("delivered", "Materials delivered", j.materials_status === "delivered" || Boolean(delivered), delivered?.created_at);
  const tear = ev("tear_off_started");
  push("tear_off", "Tear-off", Boolean(tear) || atLeast(s, "completed"), tear?.created_at,
    !tear && j.scheduled_start && !atLeast(s, "in_progress") ? `Scheduled to start ${j.scheduled_start}` : undefined);
  const dry = ev("dry_in");
  push("dry_in", "Dry-in", Boolean(dry) || atLeast(s, "completed"), dry?.created_at, "Underlayment on — your home is protected from the weather");
  const done = ev("completed");
  push("complete", "Roof complete", Boolean(j.completed_at) || Boolean(done) || atLeast(s, "completed"), j.completed_at ?? done?.created_at);
  const clean = ev("cleanup_verified");
  push("cleanup", "Cleanup + magnet sweep", Boolean(clean), clean?.created_at);
  const finals = j.invoices.filter((v) => v.kind === "final" || v.kind === "standard");
  const allPaid = j.invoices.length > 0 && j.invoices.every((v) => Number(v.balance) <= 0);
  push("final_invoice", "Final invoice", s === "paid" || (finals.length > 0 && allPaid), null,
    finals.length && !allPaid ? "Sent — see Documents below" : undefined);
  push("warranty", "Warranty registered", Boolean(j.warranty_registered_at), j.warranty_registered_at, j.warranty_product ?? undefined);

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

export type ClaimExplainer = {
  deductible: number;
  rcv: number;
  heldBack: number;
  receivedFromInsurer: number;
  nextCheck: { label: string; amount: number; payer: string; when: string } | null;
  lines: string[];
};

const CHECK_LABEL: Record<string, string> = {
  acv: "First insurance check (actual cash value)",
  depreciation: "Held-back depreciation check",
  supplement: "Supplement check (items added to the claim)",
  deductible: "Your deductible",
  other: "Check",
};

/** Plain-language claim money summary from claims + claim_checks. */
export function claimExplainer(claim: NonNullable<PublicJob["claim"]>, carrierFallback = "your insurance company"): ClaimExplainer {
  const carrier = claim.carrier || carrierFallback;
  const checks = claim.checks ?? [];
  const deductible = Number(claim.deductible) || 0;
  const rcv = Number(claim.rcv_amount) || 0;
  const depReceived = checks.filter((c) => c.kind === "depreciation").reduce((s, c) => s + Number(c.received_amount || 0), 0);
  const heldBack = Math.max(0, (Number(claim.depreciation_amount) || 0) - depReceived);
  const receivedFromInsurer = checks.filter((c) => c.payer !== "homeowner").reduce((s, c) => s + Number(c.received_amount || 0), 0);
  const pending = checks.filter((c) => c.payer !== "homeowner" && Number(c.received_amount) < Number(c.expected_amount));
  const order = ["acv", "supplement", "depreciation", "other"];
  pending.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const p = pending[0];
  const when = (k: string) =>
    k === "depreciation" ? `after we finish and send ${carrier} the certificate of completion and final invoice`
      : k === "acv" ? `from ${carrier} after the claim is approved`
        : k === "supplement" ? `once ${carrier} approves the added items`
          : `from ${carrier}`;
  const nextCheck = p
    ? { label: p.label || CHECK_LABEL[p.kind] || "Check", amount: Number(p.expected_amount) - Number(p.received_amount), payer: p.payer, when: when(p.kind) }
    : heldBack > 0
      ? { label: CHECK_LABEL.depreciation, amount: heldBack, payer: "carrier", when: when("depreciation") }
      : null;
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const lines = [
    `Your deductible: ${usd(deductible)} — this is your share, and you pay it to us. We can't waive or cover it.`,
    rcv > 0 ? `${carrier} approved ${usd(rcv)} for the full replacement cost.` : `${carrier} hasn't sent its final number yet.`,
    heldBack > 0
      ? `Held back by your insurer until we finish: ${usd(heldBack)}. This "depreciation" is released after the work is done.`
      : `Nothing is being held back by your insurer right now.`,
    nextCheck ? `Next check expected: ${nextCheck.label}, about ${usd(nextCheck.amount)}, ${nextCheck.when}.` : `No more insurance checks are expected.`,
  ];
  if (claim.mortgagee_name) lines.push(`Checks may be made out to you and ${claim.mortgagee_name}; your mortgage company may need to endorse them before they can be deposited.`);
  return { deductible, rcv, heldBack, receivedFromInsurer, nextCheck, lines };
}
