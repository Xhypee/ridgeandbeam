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

/** The margin a quote is priced at: its own, else the one last set on a quote (null: the price book's markups). */
export function quoteMarginFor(own: number | string | null | undefined, saved: number | string | null | undefined): number | null {
  for (const v of [own, saved]) if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Lines priced at the quote margin, or left at the price book's markups when there isn't one. */
export function withQuoteMargin<T extends PricedLine>(lines: T[], marginPct: number | null, mode: { inclusive: boolean; gstRatePct: number }): T[] {
  return marginPct === null ? lines : applyMargin(lines, marginPct, mode.gstRatePct, mode.inclusive);
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

/**
 * Does this quote's payment plan take money when the customer signs (a deposit, or payment in full on
 * acceptance)? Instalments always start with a deposit on acceptance. No plan saved (older quotes) counts as yes.
 */
export function dueOnSigning(mode: string | null | undefined, when: string | null | undefined): boolean {
  if (mode === "full") return when === "signed";
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// Changing the margin from the job sidebar: by margin %, margin $ or the total. All three come down to a target
// price ex GST; the quote margin that gets there is found and every costed line is repriced at it (applyMargin),
// so lines without a cost keep their price, same as the quote editor.

/** The counted lines boiled down: cost of costed lines, price of uncosted lines (in the lines' own GST convention). */
export type MarginBasis = { costed: number; uncosted: number; discount: number; rate: number; inclusive: boolean };
export type MarginTarget = { mode: "pct" | "profit" | "total"; value: number };

export function marginBasis(lines: PricedLine[], discount: number, gstRatePct: number, inclusive: boolean): MarginBasis {
  const live = lines.filter((l) => l.extra_status !== "offered" && !l.customer_removed);
  let costed = 0, uncosted = 0;
  for (const l of live) {
    const q = Number(l.quantity) || 0;
    if (Number(l.unit_cost) > 0) costed += q * Number(l.unit_cost);
    else uncosted += q * (Number(l.unit_price) || 0);
  }
  return { costed: round2(costed), uncosted: round2(uncosted), discount: Math.max(0, Number(discount) || 0), rate: Math.max(0, Number(gstRatePct) || 0), inclusive };
}

/** What the quote comes to at quote margin m (0–1): ex GST, total, profit and margin %. */
export function moneyAtMargin(b: MarginBasis, m: number) {
  const k = b.inclusive ? 1 + b.rate / 100 : 1;
  const exGst = Math.max(0, (b.costed * k / (1 - m) + b.uncosted - b.discount) / k);
  const total = exGst * (1 + b.rate / 100);
  const profit = exGst - b.costed;
  return { exGst: round2(exGst), total: round2(total), profit: round2(profit), pct: exGst > 0 ? round2((profit / exGst) * 100) : 0 };
}

/** The quote margin (as a %, for applyMargin) that lands on the target, or why it can't. */
export function marginForTarget(b: MarginBasis, t: MarginTarget): { marginPct: number } | { error: string } {
  if (!(b.costed > 0)) return { error: "None of the lines have a cost yet, so there's no margin to change. Add costs in the price book." };
  const v = Number(t.value);
  if (!Number.isFinite(v)) return { error: "Type a number." };
  const r = 1 + b.rate / 100;
  const exGst = t.mode === "total" ? v / r : t.mode === "profit" ? b.costed + v : v >= 100 ? NaN : b.costed / (1 - v / 100);
  if (!Number.isFinite(exGst) || exGst <= 0) return { error: "That margin isn't possible." };
  const k = b.inclusive ? r : 1;
  const sellCosted = exGst * k - b.uncosted + b.discount; // what the costed lines must add up to
  if (sellCosted <= b.costed * k) return { error: `That's at or below what it costs you. The lowest is ${(moneyAtMargin(b, 0).total).toLocaleString("en-AU", { style: "currency", currency: "AUD" })}.` };
  const m = 1 - (b.costed * k) / sellCosted;
  if (m > 0.9) return { error: "That's over a 90% markup on the costs. Check the number." };
  return { marginPct: m * 100 };
}

/** The price ex GST the target asks for. */
export function targetExGst(b: MarginBasis, t: MarginTarget): number {
  const v = Number(t.value);
  return t.mode === "total" ? v / (1 + b.rate / 100) : t.mode === "profit" ? b.costed + v : b.costed / (1 - v / 100);
}

/** Reprice at the margin, then put the leftover cents from rounding on one line (the biggest costed line sold
 *  as a quantity of 1, if there is one) so a typed total or margin lands exactly. `counts` marks the lines in the price. */
export function repriceToTarget<T extends PricedLine>(lines: T[], counts: boolean[], b: MarginBasis, t: MarginTarget, marginPct: number): T[] {
  const out = applyMargin(lines, marginPct, b.rate, b.inclusive);
  const money = quoteMoney(out.filter((_, i) => counts[i]), b.rate, b.inclusive, b.discount);
  const r = b.rate / 100;
  const want = t.mode === "total" ? Number(t.value) : round2(targetExGst(b, t) * (1 + r));
  const diffTotal = round2(want - money.total);
  if (Math.abs(diffTotal) < 0.01 || Math.abs(diffTotal) > 5) return out;
  let at = -1;
  out.forEach((l, i) => {
    if (counts[i] && Number(l.unit_cost) > 0 && Number(l.quantity) === 1 && l.extra_status !== "offered" && (at < 0 || l.unit_price > out[at].unit_price)) at = i;
  });
  if (at < 0) return out;
  const step = b.inclusive ? diffTotal : round2(diffTotal / (1 + r));
  return out.map((l, i) => (i === at ? { ...l, unit_price: round2(l.unit_price + step) } : l));
}
