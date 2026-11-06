// Estimate totals with good/better/best options (contract 5), GST-aware (AU).
// An estimate with options totals its shared lines (option_id null) + the lines of ONE option:
// the selected option, else the recommended one, else the first. No options -> every line.
// Prices on an estimate with gst_inclusive = true already include GST (consumer quotes, ACL single price):
// total = lines − discount and "tax" is the GST included in it. Otherwise GST is added on top.
// Mirrors the SQL views public.estimate_totals / estimate_option_totals. Pure helpers are client-safe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2, type CostedItem, type LineItem } from "./roof";

export type EstimateOptionLite = { id: string; position?: number | null; recommended?: boolean | null };
export type OptionLine = { option_id?: string | null };

/** The option whose price counts: selected, else recommended, else first by position. */
export function effectiveOptionId(options: EstimateOptionLite[], selectedOptionId?: string | null): string | null {
  if (!options.length) return null;
  if (selectedOptionId && options.some((o) => o.id === selectedOptionId)) return selectedOptionId;
  const sorted = [...options].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || (a.position ?? 0) - (b.position ?? 0));
  return sorted[0].id;
}

/** Shared lines + the given option's lines (all lines when optionId is null). */
export function itemsForOption<T extends OptionLine>(items: T[], optionId: string | null): T[] {
  if (!optionId) return items;
  return items.filter((i) => !i.option_id || i.option_id === optionId);
}

export type EstimateTotals = {
  /** Sum of lines (in the estimate's convention). */
  subtotal: number;
  discount: number;
  /** GST in the total (included, or added on top when the estimate is ex GST). */
  gst: number;
  /** Total excluding GST. */
  exGst: number;
  /** What the customer pays. */
  total: number;
};

/** GST-aware totals. gstRatePct is the estimate's tax_rate (10, or 0 when the company isn't GST registered). */
export function estimateTotals(items: LineItem[], discount: number, gstRatePct: number, inclusive: boolean): EstimateTotals {
  const subtotal = round2(items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0));
  const d = round2(Math.max(0, Number(discount) || 0));
  const taxable = Math.max(0, round2(subtotal - d));
  const r = Math.max(0, Number(gstRatePct) || 0);
  if (inclusive) {
    const gst = round2((taxable * r) / (100 + r));
    return { subtotal, discount: d, gst, exGst: round2(taxable - gst), total: taxable };
  }
  const gst = round2((taxable * r) / 100);
  return { subtotal, discount: d, gst, exGst: taxable, total: round2(taxable + gst) };
}

/** Margin on the ex-GST sell price against ex-GST cost. A discount comes straight out of profit. */
export function marginExGst(items: CostedItem[], discount: number, gstRatePct: number, inclusive: boolean) {
  const t = estimateTotals(items, discount, gstRatePct, inclusive);
  const cost = round2(items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)), 0));
  const profit = round2(t.exGst - cost);
  return { sell: t.exGst, cost, profit, pct: t.exGst > 0 ? round2((profit / t.exGst) * 100) : 0 };
}

export type AcceptedEstimateItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  unit_cost: number;
  calc_key: string | null;
  supplier_price_item_id: string | null;
};

export type AcceptedEstimateTotal = {
  estimateId: string;
  optionId: string | null;
  /** Sum of the accepted lines (GST-inclusive when gstInclusive). */
  subtotal: number;
  /** GST included in (or added to) the total. */
  tax: number;
  total: number;
  /** true: unit_price values include GST. */
  gstInclusive: boolean;
  orgSupplierId: string | null;
  items: AcceptedEstimateItem[];
};

/**
 * The job's accepted estimate (most recently accepted) priced at the homeowner's selected option.
 * Used by payment schedules, warranty/closeout, material orders and job budgets.
 * Respects RLS: pass the request's supabase client.
 */
export async function acceptedEstimateTotal(supabase: SupabaseClient, jobId: string): Promise<AcceptedEstimateTotal | null> {
  const { data: est } = await supabase
    .from("estimates")
    .select("id, discount, tax_rate, gst_inclusive, org_supplier_id, selected_option_id, estimate_options!estimate_options_estimate_id_fkey(id, position, recommended), estimate_items(description, quantity, unit, unit_price, unit_cost, calc_key, supplier_price_item_id, option_id, position)")
    .eq("job_id", jobId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!est) return null;
  const options = (est.estimate_options ?? []) as EstimateOptionLite[];
  const optionId = effectiveOptionId(options, est.selected_option_id as string | null);
  const rows = ((est.estimate_items ?? []) as (AcceptedEstimateItem & { option_id: string | null; position: number })[])
    .sort((a, b) => a.position - b.position);
  const items = itemsForOption(rows, optionId).map((i) => ({
    description: i.description,
    quantity: Number(i.quantity),
    unit: i.unit,
    unit_price: Number(i.unit_price),
    unit_cost: Number(i.unit_cost ?? 0),
    calc_key: i.calc_key ?? null,
    supplier_price_item_id: i.supplier_price_item_id ?? null,
  }));
  const inclusive = Boolean(est.gst_inclusive);
  const t = estimateTotals(items, Number(est.discount), Number(est.tax_rate), inclusive);
  return { estimateId: est.id as string, optionId, subtotal: t.subtotal, tax: t.gst, total: t.total, gstInclusive: inclusive, orgSupplierId: (est.org_supplier_id as string | null) ?? null, items };
}
