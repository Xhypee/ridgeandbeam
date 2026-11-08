// The quoting engine's money maths. One margin for the whole quote: every line with a cost is priced at
// cost / (1 - margin), plus GST when the quote's prices include it. Lines without a cost keep the price typed in.
// Payment is either in full (one invoice) or instalments: Deposit first, Upon completion last, any stages between.
import { round2 } from "./roof";

export type PricedLine = { quantity: number; unit_price: number; unit_cost: number; extra_status?: string | null; customer_removed?: boolean | null };

/** A line's sell price per unit from its cost (ex GST) and the quote margin. */
export function priceFromCost(unitCostEx: number, marginPct: number, gstRatePct: number, inclusive: boolean): number {
  const m = Math.min(94, Math.max(0, Number(marginPct) || 0)) / 100;
  const ex = (Number(unitCostEx) || 0) / (1 - m);
  return round2(inclusive ? ex * (1 + (Number(gstRatePct) || 0) / 100) : ex);
}

/** Reprice every costed line at the quote margin; uncosted lines keep their price. */
export function applyMargin<T extends PricedLine>(lines: T[], marginPct: number, gstRatePct: number, inclusive: boolean): T[] {
  return lines.map((l) => (Number(l.unit_cost) > 0 ? { ...l, unit_price: priceFromCost(l.unit_cost, marginPct, gstRatePct, inclusive) } : l));
}

export type QuoteMoney = { cost: number; exGst: number; gst: number; total: number; profit: number; marginPct: number; uncosted: number };

/** Totals for the lines in the price (offered extras and lines the customer removed are left out). */
export function quoteMoney(lines: PricedLine[], gstRatePct: number, inclusive: boolean, discount = 0): QuoteMoney {
  const live = lines.filter((l) => l.extra_status !== "offered" && !l.customer_removed);
  const r = Math.max(0, Number(gstRatePct) || 0);
  const subtotal = round2(live.reduce((s, l) => s + round2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)), 0));
  const taxable = Math.max(0, round2(subtotal - Math.max(0, Number(discount) || 0)));
  const gst = inclusive ? round2((taxable * r) / (100 + r)) : round2((taxable * r) / 100);
  const exGst = inclusive ? round2(taxable - gst) : taxable;
  const total = inclusive ? taxable : round2(taxable + gst);
  const cost = round2(live.reduce((s, l) => s + round2((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0)), 0));
  const profit = round2(exGst - cost);
  return { cost, exGst, gst, total, profit, marginPct: exGst > 0 ? round2((profit / exGst) * 100) : 0, uncosted: live.filter((l) => !(Number(l.unit_cost) > 0)).length };
}

// ---------------------------------------------------------------------------------------------------------
export const STAGE_TRIGGERS = ["signed", "delivered", "completed", "date"] as const;
export type StageTrigger = (typeof STAGE_TRIGGERS)[number];
export const STAGE_TRIGGER_LABEL: Record<StageTrigger, string> = { signed: "When they accept", delivered: "Materials delivered", completed: "When the job's done", date: "On a date" };
export type Stage = { label: string; pct: number; trigger: StageTrigger };
export type PaymentPlan = { mode: "full" | "instalments"; when: "signed" | "delivered" | "completed"; stages: Stage[] };

export const DEFAULT_INSTALMENTS: Stage[] = [
  { label: "Deposit", pct: 10, trigger: "signed" },
  { label: "Upon completion", pct: 90, trigger: "completed" },
];

/** Instalments always start with Deposit (on acceptance) and end with Upon completion; percentages add to 100. */
export function normaliseStages(stages: Stage[] | null | undefined): Stage[] {
  const list = (stages ?? []).filter((s) => s && typeof s.label === "string").map((s) => ({
    label: s.label.trim().slice(0, 60) || "Stage", pct: Math.max(0, Math.min(100, Math.round((Number(s.pct) || 0) * 100) / 100)),
    trigger: (STAGE_TRIGGERS as readonly string[]).includes(s.trigger) ? s.trigger : "completed",
  }));
  if (list.length < 2) return DEFAULT_INSTALMENTS.map((s) => ({ ...s }));
  list[0] = { ...list[0], trigger: "signed" };
  list[list.length - 1] = { ...list[list.length - 1], trigger: "completed" };
  return list;
}

export function stagesProblem(stages: Stage[]): string | null {
  const sum = Math.round(stages.reduce((a, s) => a + s.pct, 0) * 100) / 100;
  if (Math.abs(sum - 100) > 0.001) return `The stages add up to ${sum}%, not 100%.`;
  if (stages.some((s) => s.pct <= 0)) return "Every stage needs a percentage above 0.";
  return null;
}

/** The plan as payment steps for the quote email and invoices. */
export function planSchedule(plan: PaymentPlan | null | undefined): { label: string; pct: number; trigger: string }[] | null {
  if (!plan) return null;
  if (plan.mode === "full") return [{ label: "Paid in full", pct: 100, trigger: plan.when }];
  const st = normaliseStages(plan.stages);
  return stagesProblem(st) ? null : st;
}

/** Dollar amount per stage (cents add up exactly to the total; the last stage takes the rounding). */
export function stageAmounts(total: number, stages: Stage[]): number[] {
  const cents = Math.round(total * 100);
  const out = stages.map((s) => Math.floor((cents * s.pct) / 100));
  const diff = cents - out.reduce((a, b) => a + b, 0);
  if (out.length) out[out.length - 1] += diff;
  return out.map((c) => c / 100);
}
