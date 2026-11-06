// "What should happen next on this job?" (contract 3). Pure functions only: safe in client and server
// components and unit-tested. The server loader for the context lives in next-step-server.ts.
import { jobReadiness, type Readiness, type ReadinessJob } from "./production";

export type Phase = "lead" | "inspect" | "quote" | "claim" | "build" | "close" | "paid";
export const PHASES: Phase[] = ["lead", "inspect", "quote", "claim", "build", "close", "paid"];
export const PHASE_LABEL: Record<Phase, string> = { lead: "Lead", inspect: "Inspect", quote: "Quote", claim: "Claim", build: "Build", close: "Close", paid: "Paid" };

export type NextStepJob = Partial<ReadinessJob> & {
  id: string;
  stage: string;
  is_insurance: boolean;
  lead_received_at?: string | null;
  first_contacted_at?: string | null;
  stage_changed_at?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  schedule_locked?: boolean | null;
  completed_at?: string | null;
  walkthrough_signed_at?: string | null;
  warranty_registered_at?: string | null;
  review_requested_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
};

export type NextStepEstimate = { id: string; number: number; status: string; total: number; sent_at: string | null; accepted_at: string | null };
export type NextStepClaim = { id: string; stage: string; stage_changed_at: string | null; carrier: string | null; claim_number?: string | null };
/** An insurer variation request (stored as a claim supplement). */
export type NextStepVariation = { id: string; status: string; submitted_on: string | null; next_follow_up_on: string | null; requested_amount: number };
export type NextStepInvoices = { count: number; billed: number; paid: number; balance: number; overdue: number };

export type NextStepCtx = {
  /** The job's most relevant quote: the accepted one, else the newest sent/draft, else the newest declined. */
  estimate: NextStepEstimate | null;
  claim: NextStepClaim | null;
  /** Newest variation request that is still waiting on the insurer (status submitted). */
  variation: NextStepVariation | null;
  /** Readiness to lock the schedule (contract 9); null when not loaded. */
  readiness: Readiness | null;
  invoices: NextStepInvoices;
  warrantyRegistered: boolean;
  reviewRequested: boolean;
  photos?: number;
  /** "Now" for tests; defaults to the current time. */
  now?: Date;
};

export type NextStepTag = "Lead" | "Quote" | "Insurance" | "Build" | "Close-out" | "Money" | "Done";

export type NextStep = {
  key: string;
  title: string;
  /** Same task phrased for a list of many jobs ("Send the Ortiz quote"). */
  listTitle: string;
  detail: string;
  actionLabel: string;
  href: string;
  tag: NextStepTag;
  phase: Phase;
  /** True when somebody in the office has to act (shows in Today's "Waiting on you"). */
  waiting: boolean;
  /** Optional in-place form the job page can render instead of following href. */
  form?: "create_estimate" | "mark_contacted";
};

export const EMPTY_INVOICES: NextStepInvoices = { count: 0, billed: 0, paid: 0, balance: 0, overdue: 0 };

const DAY = 86400000;
const whole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
/** Whole dollars, for tiles, cards and headlines ("$18,750"). */
export const dollars = (n: number | string | null | undefined) => whole.format(Math.round(Number(n) || 0));

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Whole days from `from` to now; plain dates (YYYY-MM-DD) count calendar days in local time. */
function daysBetween(from: string | null | undefined, now: Date) {
  if (!from) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return Math.max(0, Math.round((new Date(isoOf(now) + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / DAY));
  }
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY));
}
const dayMonth = (d: string | null | undefined) => {
  if (!d) return "";
  const v = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return v.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const daysAgo = (n: number) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

export function minutesLabel(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}
export function lastName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
}

// ---------------------------------------------------------------------------
// Insurance claim stages in Australian wording. Unknown stages (if the claim model changes) fall back
// to a readable label and are treated as "still with the insurer" unless they look settled.
// ---------------------------------------------------------------------------
export const CLAIM_STAGE_AU: Record<string, string> = {
  contingency_signed: "Signed up",
  claim_filed: "Lodged",
  adjuster_scheduled: "Assessor booked",
  adjuster_met: "Assessed",
  scope_received: "Scope in",
  supplementing: "Variation sent",
  approved: "Approved",
  built: "Built",
  coc_sent: "Completion sent",
  depreciation_released: "Final payment",
  closed: "Closed",
  denied: "Declined",
};
const SETTLED = new Set(["approved", "built", "coc_sent", "depreciation_released", "closed"]);
export const claimStageLabel = (s: string) => CLAIM_STAGE_AU[s] ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export function claimSettled(s: string | null | undefined) {
  if (!s) return false;
  return SETTLED.has(s) || /approv|settl|closed|built|paid/.test(s);
}
const claimDeclined = (s: string) => s === "denied" || /declin|denied/.test(s);

/** Where the job is in Lead · Inspect · Quote · Claim · Build · Close · Paid. */
export function jobPhase(job: NextStepJob, ctx: Pick<NextStepCtx, "estimate" | "claim">): Phase {
  switch (job.stage) {
    case "lead":
      return "lead";
    case "inspection":
      return ctx.estimate ? "quote" : "inspect";
    case "estimate_sent":
      return "quote";
    case "sold":
    case "scheduled":
      if (job.is_insurance && (!ctx.claim || !claimSettled(ctx.claim.stage))) return "claim";
      return "build";
    case "in_progress":
      return "build";
    case "completed":
      return "close";
    case "paid":
      return "paid";
    default:
      return ctx.estimate ? "quote" : "lead";
  }
}

/** Whether a job shows the Claim step (insurance jobs, or any job that has a claim). */
export const hasClaimStep = (job: Pick<NextStepJob, "is_insurance">, ctx: Pick<NextStepCtx, "claim">) => job.is_insurance || Boolean(ctx.claim);

const READY_TASK: Record<string, { title: (first: string, job: NextStepJob) => string; action: string; tab: "production" | "billing" }> = {
  permit: { title: (_f, j) => (j.permit_status === "applied" ? "Chase the building permit" : "Apply for the building permit"), action: "Open production", tab: "production" },
  hoa: { title: () => "Get strata / body corporate approval", action: "Open production", tab: "production" },
  colors: { title: (f) => `Confirm colours with ${f || "the homeowner"}`, action: "Confirm colours", tab: "production" },
  materials: { title: () => "Order the materials", action: "Order materials", tab: "production" },
  dumpster: { title: () => "Order the skip bin", action: "Order skip bin", tab: "production" },
  deposit: { title: () => "Collect the deposit", action: "Open billing", tab: "billing" },
};

/**
 * The single next thing to do on a job, in plain language, with one action.
 * Branches (in order): lost · lead (call / book inspection) · quote (write / send / follow up / declined / mark sold) ·
 * variation follow-up due · claim (add / lodge / assessor / scope / declined) · build readiness (blockers / schedule / lock / starts) ·
 * on the roof · close-out (walkthrough / invoice / payment / warranty / review / mark paid) · paid (warranty / review / done).
 */
export function nextStep(job: NextStepJob, ctx: NextStepCtx): NextStep {
  const now = ctx.now ?? new Date();
  const today = isoOf(now);
  const base = `/app/jobs/${job.id}`;
  const first = firstName(job.customer_name);
  const last = lastName(job.customer_name);
  const who = first || "the homeowner";
  const the = (thing: string) => (last ? `the ${last} ${thing}` : `the ${thing}`);
  const phase = jobPhase(job, ctx);
  const est = ctx.estimate;
  const inv = ctx.invoices ?? EMPTY_INVOICES;
  const mk = (s: Omit<NextStep, "phase" | "listTitle"> & { listTitle?: string; phase?: Phase }): NextStep => ({ ...s, listTitle: s.listTitle ?? s.title, phase: s.phase ?? phase });

  if (job.stage === "lost") {
    return mk({ key: "lost", title: "Job lost", detail: "It's off the pipeline. Change the stage to bring it back.", actionLabel: "Open job", href: base, tag: "Done", waiting: false });
  }

  // Lead
  if (job.stage === "lead") {
    if (!job.first_contacted_at) {
      const waited = job.lead_received_at ? minutesLabel(now.getTime() - new Date(job.lead_received_at).getTime()) : "";
      return mk({
        key: "call_lead", title: `Call ${who}`, listTitle: `Call ${job.customer_name || "the new lead"}`,
        detail: `${waited ? `New lead, waiting ${waited}. ` : ""}The first roofer to call usually wins the job.`,
        actionLabel: job.customer_phone ? `Call ${job.customer_phone}` : "Open lead", href: job.customer_phone ? `tel:${job.customer_phone.replace(/\s+/g, "")}` : base,
        tag: "Lead", waiting: true, form: "mark_contacted",
      });
    }
    return mk({
      key: "book_inspection", title: "Book the inspection", listTitle: `Book ${the("inspection")}`,
      detail: `Contacted ${daysAgo(daysBetween(job.first_contacted_at, now))}. Get on the roof, take photos and measure.`,
      actionLabel: "Open inspection", href: `${base}/field`, tag: "Lead", waiting: true,
    });
  }

  // Quote (before the sale)
  if (job.stage === "inspection" || job.stage === "estimate_sent") {
    if (!est) {
      return mk({
        key: "write_quote", title: "Write the quote", listTitle: `Write ${the("quote")}`,
        detail: "Measure the roof and build the options the homeowner can pick from.", actionLabel: "Start quote", href: `${base}#quotes`,
        tag: "Quote", waiting: true, form: "create_estimate",
      });
    }
    const q = `/app/estimates/${est.id}`;
    if (est.status === "draft") {
      return mk({
        key: "send_quote", title: "Send the quote", listTitle: `Send ${the("quote")}`,
        detail: `Quote #${est.number} (${dollars(est.total)}) is drafted. Send it so ${who} can pick and sign.`,
        actionLabel: "Send quote", href: q, tag: "Quote", waiting: true,
      });
    }
    if (est.status === "sent") {
      const d = daysBetween(est.sent_at, now);
      if (d >= 3) {
        return mk({
          key: "follow_up_quote", title: "Follow up on the quote", listTitle: `Follow up ${the("quote")}`,
          detail: `Sent ${daysAgo(d)} · ${dollars(est.total)}. A quick call helps ${who} decide.`,
          actionLabel: "Open quote", href: q, tag: "Quote", waiting: true,
        });
      }
      return mk({
        key: "quote_out", title: `Waiting on ${who} to sign`, detail: `Quote sent ${daysAgo(d)} · ${dollars(est.total)}. It shows up here again if they go quiet for 3 days.`,
        actionLabel: "Open quote", href: q, tag: "Quote", waiting: false,
      });
    }
    if (est.status === "declined") {
      return mk({ key: "quote_declined", title: "Quote declined", listTitle: `${last || "Quote"}: quote declined`, detail: "Revise the price or options and send a new version.", actionLabel: "Open quote", href: q, tag: "Quote", waiting: true });
    }
    if (est.status === "accepted") {
      return mk({
        key: "mark_sold", title: "Mark the job sold", listTitle: `Mark ${the("job")} sold`,
        detail: `Quote signed${est.accepted_at ? ` ${dayMonth(est.accepted_at)}` : ""}. Move it to Sold to start getting it ready to build.`,
        actionLabel: "Open job", href: `${base}#stage`, tag: "Quote", waiting: true,
      });
    }
  }

  // Variation request waiting on the insurer, with a follow-up due (any stage after the sale)
  const v = ctx.variation;
  if (v && v.status === "submitted" && v.next_follow_up_on && v.next_follow_up_on <= today) {
    const insurer = ctx.claim?.carrier || "the insurer";
    return mk({
      key: "follow_up_variation", title: "Follow up the variation request", listTitle: `Follow up ${the("variation request")}`,
      detail: `Sent to ${insurer} ${daysAgo(daysBetween(v.submitted_on, now))} · ${dollars(v.requested_amount)}.`,
      actionLabel: "Log follow-up", href: `${base}/claim`, tag: "Insurance", waiting: true,
    });
  }

  // Claim (sold insurance job still with the insurer)
  if (phase === "claim") {
    const claim = ctx.claim;
    if (!claim) {
      return mk({ key: "add_claim", title: "Add the claim details", listTitle: `Add ${the("claim")} details`, detail: "Insurer, claim number and assessor, so everyone works from the same numbers.", actionLabel: "Open claim", href: `${base}/claim`, tag: "Insurance", waiting: true });
    }
    const insurer = claim.carrier || "the insurer";
    const days = daysBetween(claim.stage_changed_at, now);
    if (claimDeclined(claim.stage)) {
      return mk({ key: "claim_declined", title: "Claim declined", listTitle: `${last || "Claim"}: claim declined`, detail: `${insurer} declined it. Ask for an internal review, or offer ${who} a private price.`, actionLabel: "Open claim", href: `${base}/claim`, tag: "Insurance", waiting: true });
    }
    const stageTask: Record<string, [string, string, boolean]> = {
      contingency_signed: ["Help lodge the claim", `${who} has signed up. Help them lodge the claim with ${insurer}.`, true],
      claim_filed: ["Book the assessor", `Claim lodged with ${insurer} ${daysAgo(days)}. Get the assessor's visit booked.`, true],
      adjuster_scheduled: ["Meet the assessor on site", "Bring the photos and measurements so nothing gets missed.", true],
      adjuster_met: ["Chase the insurer's decision", `Assessed ${daysAgo(days)}. Waiting on ${insurer}'s scope of works.`, days >= 5],
      scope_received: ["Check the insurer's scope", "Compare it with your quote and request a variation for anything missing.", true],
      supplementing: ["Waiting on the variation decision", `Variation request is with ${insurer}. It shows up here when a follow-up is due.`, false],
    };
    const [title, detail, waiting] = stageTask[claim.stage] ?? ["Check the claim", `Claim is at "${claimStageLabel(claim.stage)}" with ${insurer}.`, true];
    return mk({ key: `claim_${claim.stage}`, title, listTitle: last ? `${title} (${last})` : title, detail, actionLabel: "Open claim", href: `${base}/claim`, tag: "Insurance", waiting });
  }

  // Build: getting ready, then on the roof
  if (job.stage === "sold" || job.stage === "scheduled") {
    const r = ctx.readiness ?? (job.permit_status !== undefined ? jobReadiness(job as ReadinessJob, { depositReceived: inv.paid > 0 }) : null);
    if (r && r.blockers.length) {
      const b = r.blockers[0];
      const t = READY_TASK[b.key];
      const left = r.blockers.length;
      return mk({
        key: `ready_${b.key}`, title: t.title(first, job), listTitle: last ? `${t.title(first, job)} (${last})` : t.title(first, job),
        detail: `${plural(left, "thing")} left before this job can be locked on the schedule.`,
        actionLabel: t.action, href: `${base}/${t.tab}`, tag: b.key === "deposit" ? "Money" : "Build", waiting: true, phase: "build",
      });
    }
    if (!job.scheduled_start) {
      return mk({ key: "schedule", title: "Put it on the schedule", listTitle: `Schedule ${the("job")}`, detail: "Everything is ready. Pick the days and a crew.", actionLabel: "Open schedule", href: "/app/schedule", tag: "Build", waiting: true, phase: "build" });
    }
    if (!job.schedule_locked) {
      return mk({ key: "lock", title: "Lock the schedule", listTitle: `Lock ${the("job")} on the schedule`, detail: `Everything is ready for ${dayMonth(job.scheduled_start)}. Locking tells the homeowner and the crew.`, actionLabel: "Lock schedule", href: `${base}/production`, tag: "Build", waiting: true, phase: "build" });
    }
    return mk({ key: "build_booked", title: `Build starts ${dayMonth(job.scheduled_start)}`, detail: "Locked. The crew and the homeowner have the dates.", actionLabel: "Open production", href: `${base}/production`, tag: "Build", waiting: false, phase: "build" });
  }

  if (job.stage === "in_progress") {
    if (job.scheduled_end && job.scheduled_end < today) {
      return mk({ key: "finish_build", title: "Finish the build", listTitle: `Finish ${the("build")}`, detail: `It was due to finish ${dayMonth(job.scheduled_end)}. Mark it complete when the crew is done.`, actionLabel: "Open field", href: `${base}/field`, tag: "Build", waiting: true });
    }
    return mk({ key: "on_roof", title: "Crew on the roof", detail: "Field updates text the homeowner as the crew works.", actionLabel: "Open field", href: `${base}/field`, tag: "Build", waiting: false });
  }

  // Close-out and money
  const warranty = () => mk({ key: "register_warranty", title: "Register the warranty", listTitle: `Register ${the("warranty")}`, detail: "Register the manufacturer warranty while the details are fresh.", actionLabel: "Open close-out", href: `${base}/closeout`, tag: "Close-out", waiting: true });
  const review = () => mk({ key: "ask_review", title: "Ask for a review", listTitle: `Ask ${job.customer_name || "the homeowner"} for a review`, detail: `${who} is paid up. Happy customers are your best leads.`, actionLabel: "Ask for review", href: `${base}/closeout`, tag: "Close-out", waiting: true });

  if (job.stage === "completed") {
    if (!job.walkthrough_signed_at) {
      return mk({ key: "walkthrough", title: "Do the final walkthrough", listTitle: `Final walkthrough with ${job.customer_name || "the homeowner"}`, detail: `Walk the roof with ${who} and get the job signed off.`, actionLabel: "Open close-out", href: `${base}/closeout`, tag: "Close-out", waiting: true });
    }
    if (inv.count === 0) {
      return mk({ key: "send_invoice", title: "Send the final invoice", listTitle: `Send ${the("final invoice")}`, detail: "The job is signed off. Bill the balance while it's fresh.", actionLabel: "Open billing", href: `${base}/billing`, tag: "Money", waiting: true });
    }
    if (inv.balance > 0.005) {
      return mk({
        key: "chase_payment", title: "Chase the payment", listTitle: `Chase ${the("payment")}`,
        detail: `${dollars(inv.balance)} still owed${inv.overdue > 0 ? `, ${plural(inv.overdue, "invoice")} overdue` : ""}.`,
        actionLabel: "Open billing", href: `${base}/billing`, tag: "Money", waiting: true,
      });
    }
    if (!ctx.warrantyRegistered) return warranty();
    if (!ctx.reviewRequested) return review();
    return mk({ key: "mark_paid", title: "Mark the job paid", listTitle: `Mark ${the("job")} paid`, detail: "All the money is in and the close-out is done.", actionLabel: "Open job", href: `${base}#stage`, tag: "Done", waiting: true });
  }

  if (job.stage === "paid") {
    if (inv.balance > 0.005) {
      return mk({ key: "chase_payment", title: "Chase the payment", listTitle: `Chase ${the("payment")}`, detail: `${dollars(inv.balance)} still owed.`, actionLabel: "Open billing", href: `${base}/billing`, tag: "Money", waiting: true });
    }
    if (!ctx.warrantyRegistered) return warranty();
    if (!ctx.reviewRequested) return review();
    return mk({ key: "done", title: "All done", detail: `Paid in full${inv.paid > 0 ? ` (${dollars(inv.paid)})` : ""}, warranty registered and review requested.`, actionLabel: "Open billing", href: `${base}/billing`, tag: "Done", waiting: false });
  }

  return mk({ key: "open", title: "Open the job", detail: "Check where this job is up to.", actionLabel: "Open job", href: base, tag: "Lead", waiting: false });
}

// ---------------------------------------------------------------------------
// Timeline steps for the job page
// ---------------------------------------------------------------------------
export type StepState = "done" | "current" | "todo";
export type TimelineStep = { key: Phase; label: string; status: string; href: string; state: StepState };

export function jobSteps(job: NextStepJob, ctx: NextStepCtx, opts: { crewLead?: boolean } = {}): TimelineStep[] {
  const base = `/app/jobs/${job.id}`;
  const current = jobPhase(job, ctx);
  const showClaim = hasClaimStep(job, ctx);
  const order = PHASES.filter((p) => p !== "claim" || showClaim);
  // A retail job in the build phase has no claim step to sit on; same for the index lookup.
  const ci = order.indexOf(current === "claim" && !showClaim ? "build" : current);
  const est = ctx.estimate;
  const inv = ctx.invoices ?? EMPTY_INVOICES;
  const r = ctx.readiness;
  const status: Record<Phase, string> = {
    lead: job.stage === "lead" && !job.first_contacted_at ? "Call now" : job.lead_received_at ? `In ${dayMonth(job.lead_received_at)}` : "In",
    inspect: ctx.photos ? plural(ctx.photos, "photo") : order.indexOf("inspect") < ci ? "Done" : "Not yet",
    quote: !est ? "Not started" : ({ draft: "Draft", sent: "Sent", accepted: "Signed", declined: "Declined" } as Record<string, string>)[est.status] ?? est.status,
    claim: ctx.claim ? claimStageLabel(ctx.claim.stage) : "Not started",
    build:
      job.stage === "in_progress" ? "On the roof"
      : ["completed", "paid"].includes(job.stage) ? "Done"
      : current === "build" ? (job.schedule_locked && job.scheduled_start ? `Locked ${dayMonth(job.scheduled_start)}` : r ? `Getting ready ${r.done}/${r.total}` : "Getting ready")
      : "Not yet",
    close: job.stage === "paid" || (job.stage === "completed" && job.walkthrough_signed_at) ? "Signed off" : job.stage === "completed" ? "In progress" : "Not yet",
    paid: job.stage === "paid" ? "Paid" : inv.paid > 0 ? `${dollars(inv.paid)} in` : "Nothing yet",
  };
  const href: Record<Phase, string> = {
    lead: base,
    inspect: `${base}/field`,
    quote: est ? `/app/estimates/${est.id}` : `${base}#quotes`,
    claim: `${base}/claim`,
    build: `${base}/production`,
    close: `${base}/closeout`,
    paid: `${base}/billing`,
  };
  const steps = order.map((key, i) => ({
    key,
    label: opts.crewLead && key === "inspect" ? "Field" : PHASE_LABEL[key],
    status: status[key],
    href: href[key],
    state: (i < ci ? "done" : i === ci ? "current" : "todo") as StepState,
  }));
  return opts.crewLead ? steps.filter((s) => s.key === "inspect" || s.key === "build") : steps;
}

/** Pipeline column for a job, or null when hidden (lost; paid more than 30 days ago). */
export type PipelineColumn = "new" | "quoting" | "sold" | "building" | "wrapping";
export function pipelineColumn(job: { stage: string; stage_changed_at?: string | null }, now = new Date()): PipelineColumn | null {
  switch (job.stage) {
    case "lead": return "new";
    case "inspection":
    case "estimate_sent": return "quoting";
    case "sold":
    case "scheduled": return "sold";
    case "in_progress": return "building";
    case "completed": return "wrapping";
    case "paid": return daysBetween(job.stage_changed_at, now) <= 30 ? "wrapping" : null;
    default: return null;
  }
}

/** Age chip tone: minutes for uncontacted leads (5 min / 1 h), days in stage otherwise (per column). */
export function ageTone(col: PipelineColumn, opts: { minutes?: number; days?: number }): "ok" | "amber" | "red" {
  if (opts.minutes !== undefined) return opts.minutes < 5 ? "ok" : opts.minutes < 60 ? "amber" : "red";
  const d = opts.days ?? 0;
  const [amber, red] = ({ new: [1, 3], quoting: [5, 10], sold: [7, 14], building: [5, 10], wrapping: [7, 21] } as Record<PipelineColumn, [number, number]>)[col];
  return d >= red ? "red" : d >= amber ? "amber" : "ok";
}
