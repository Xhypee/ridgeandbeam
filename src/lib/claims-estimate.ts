import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fallback for contract 5 (`acceptedEstimateTotal` in src/lib/estimate-totals.ts, owned by estimating).
// Same signature/shape so the coordinator can swap the import at merge.

export type AcceptedEstimate = {
  estimateId: string;
  estimateNumber: number;
  optionId: string | null;
  subtotal: number;
  tax: number;
  total: number;
  items: { description: string; quantity: number; unit: string; unit_price: number; unit_cost: number; calc_key: string | null }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The job's accepted estimate: shared items (option_id null) + items of the selected option. */
export async function acceptedEstimateTotal(supabase: SupabaseClient, jobId: string): Promise<AcceptedEstimate | null> {
  const { data: est } = await supabase
    .from("estimates")
    .select("id, number, tax_rate, discount, selected_option_id, accepted_at, estimate_items(description, quantity, unit, unit_price, unit_cost, calc_key, option_id, position)")
    .eq("job_id", jobId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!est) return null;
  type Row = { description: string; quantity: number; unit: string; unit_price: number; unit_cost: number; calc_key: string | null; option_id: string | null; position: number };
  const rows = ((est.estimate_items ?? []) as Row[])
    .filter((i) => i.option_id === null || i.option_id === est.selected_option_id)
    .sort((a, b) => a.position - b.position);
  const subtotal = r2(rows.reduce((s, i) => s + r2(Number(i.quantity) * Number(i.unit_price)), 0));
  const taxable = Math.max(subtotal - Number(est.discount ?? 0), 0);
  const tax = r2((taxable * Number(est.tax_rate ?? 0)) / 100);
  return {
    estimateId: est.id,
    estimateNumber: est.number,
    optionId: est.selected_option_id ?? null,
    subtotal,
    tax,
    total: r2(taxable + tax),
    items: rows.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
      unit_price: Number(i.unit_price),
      unit_cost: Number(i.unit_cost ?? 0),
      calc_key: i.calc_key ?? null,
    })),
  };
}
