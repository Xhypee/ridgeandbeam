// The Building sidebar's payments: exactly the stages on the signed quote (name, %, when it falls due), each
// matched to the invoice that bills it. Nothing here is worked out from build progress.
import { normaliseStages, stageAmounts, STAGE_TRIGGER_LABEL, type PaymentPlan, type Stage, type StageTrigger } from "./quote-pricing";

export type PlanInv = {
  id: string; kind: string; label: string | null; trigger: string | null; status: string;
  total: number; paid: number; balance: number; issue_date: string | null; due_date: string | null; last_reminder_on: string | null;
};
export type PayRow = {
  label: string; pct: number; trigger: StageTrigger; when: string;
  /** What this stage bills: the invoice total once it exists (signed extra work lands on the final one), else its share of the contract. */
  amount: number; quoted: number; extra: number;
  invoice: PlanInv | null;
  state: "paid" | "asked" | "next" | "later";
  /** Its due point has been reached (accepted, materials delivered, job done). */
  due: boolean;
};
export type Reached = { delivered: boolean; completed: boolean };

/** The quote's plan as stages: Full is one stage; Instalments are the quote's own stages. */
export function quoteStages(plan: Pick<PaymentPlan, "mode" | "when" | "stages"> | null | undefined): Stage[] {
  if (!plan) return [];
  if (plan.mode !== "instalments") return [{ label: "Full payment", pct: 100, trigger: plan.when ?? "completed" }];
  return normaliseStages(plan.stages);
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Pair each stage with its invoice: same name first, then the deposit for the first stage and the final for the last. */
export function matchInvoices(stages: Stage[], invs: PlanInv[]): (PlanInv | null)[] {
  const used = new Set<string>();
  const take = (v: PlanInv | undefined) => { if (v) used.add(v.id); return v ?? null; };
  const byName = stages.map((s) => take(invs.find((v) => !used.has(v.id) && norm(v.label) === norm(s.label))));
  return stages.map((s, i) => {
    if (byName[i]) return byName[i];
    if (i === 0 && s.trigger === "signed") return take(invs.find((v) => !used.has(v.id) && v.kind === "deposit"));
    if (i === stages.length - 1 && stages.length > 1) return take(invs.find((v) => !used.has(v.id) && v.kind === "final"));
    if (stages.length === 1) return take(invs.find((v) => !used.has(v.id) && (v.kind === "final" || v.kind === "standard")));
    return null;
  });
}

/** Invoices from a different plan (set up in Billing after the quote) that don't bill any of the quote's stages. */
export function otherPlanInvoices(plan: Pick<PaymentPlan, "mode" | "when" | "stages"> | null | undefined, invs: PlanInv[]): PlanInv[] {
  const matched = new Set(matchInvoices(quoteStages(plan), invs).filter(Boolean).map((v) => v!.id));
  return invs.filter((v) => !matched.has(v.id));
}

/** One row per quote stage, in order. The first one not paid is the next to request. */
export function paymentRows(plan: Pick<PaymentPlan, "mode" | "when" | "stages"> | null | undefined, contractTotal: number, invs: PlanInv[], reached: Reached): PayRow[] {
  const stages = quoteStages(plan);
  const amounts = stageAmounts(contractTotal, stages);
  const matched = matchInvoices(stages, invs);
  let nextTaken = false;
  return stages.map((s, i) => {
    const inv = matched[i];
    const paid = Boolean(inv && inv.total > 0 && inv.balance <= 0.004);
    let state: PayRow["state"] = "later";
    if (paid) state = "paid";
    else if (!nextTaken) { nextTaken = true; state = inv && inv.status !== "draft" ? "asked" : "next"; }
    const amount = inv ? inv.total : amounts[i];
    return {
      label: s.label, pct: s.pct, trigger: s.trigger, when: STAGE_TRIGGER_LABEL[s.trigger],
      amount, quoted: amounts[i], extra: amount - amounts[i] >= 1 ? Math.round((amount - amounts[i]) * 100) / 100 : 0,
      invoice: inv, state,
      due: s.trigger === "signed" || (s.trigger === "delivered" && reached.delivered) || (s.trigger === "completed" && reached.completed) || (s.trigger === "date" && false),
    };
  });
}

/** Invoice kind for each quote stage (first on acceptance = deposit, last = final, the rest progress). */
export function stageKind(i: number, count: number, trigger: StageTrigger): "deposit" | "progress" | "final" | "instalment" {
  if (trigger === "date") return "instalment";
  if (i === 0 && trigger === "signed" && count > 1) return "deposit";
  if (i === count - 1) return "final";
  return "progress";
}

/** Why the payment is due, in the customer's words. */
export function dueReason(trigger: StageTrigger, label: string, opts: { deliveredOn?: string | null; finishedOn?: string | null }): string {
  const day = (iso: string | null | undefined) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) : null);
  if (trigger === "delivered") return `Your materials were delivered${day(opts.deliveredOn) ? ` on ${day(opts.deliveredOn)}` : ""}, so the next payment in your quote is now due.`;
  if (trigger === "completed") return `Your roof is finished${day(opts.finishedOn) ? ` (${day(opts.finishedOn)})` : ""}, so the ${label.toLowerCase() === "full payment" ? "payment" : "final payment"} in your quote is now due.`;
  if (trigger === "signed") return `Thanks for going ahead. The ${label.toLowerCase()} in your quote is now due.`;
  return `The next payment in your quote is now due.`;
}
