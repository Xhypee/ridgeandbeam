// Estimate totals with good/better/best options (contract 5).
// An estimate with options totals its shared lines (option_id null) + the lines of ONE option:
// the selected option, else the recommended one, else the first. No options -> every line.
// Mirrors the SQL view public.estimate_totals. Pure helpers are safe to import in client components.

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2, totals } from "./roof";

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

export type AcceptedEstimateItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  unit_cost: number;
  calc_key: string | null;
};

export type AcceptedEstimateTotal = {
  estimateId: string;
  optionId: string | null;
  subtotal: number;
  tax: number;
  total: number;
  items: AcceptedEstimateItem[];
};

/**
 * The job's accepted estimate (most recently accepted) priced at the homeowner's selected option.
 * Used by payment schedules (A), warranty/closeout (C), material orders and job budgets (D).
 * Respects RLS: pass the request's supabase client.
 */
export async function acceptedEstimateTotal(supabase: SupabaseClient, jobId: string): Promise<AcceptedEstimateTotal | null> {
  const { data: est } = await supabase
    .from("estimates")
    .select("id, discount, tax_rate, selected_option_id, estimate_options!estimate_options_estimate_id_fkey(id, position, recommended), estimate_items(description, quantity, unit, unit_price, unit_cost, calc_key, option_id, position)")
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
  }));
  const t = totals(items, Number(est.discount), Number(est.tax_rate));
  return { estimateId: est.id as string, optionId, subtotal: round2(t.subtotal), tax: t.tax, total: t.total, items };
}
