"use server";
// Change a draft quote's margin from the job sidebar: by margin %, margin $ or the total. Finds the quote margin
// that lands there, reprices every costed line at it (lines without a cost keep their price) and saves it as the
// quote's margin, same as the quote editor's margin box.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { effectiveOptionId, itemsForOption, type EstimateOptionLite } from "@/lib/estimate-totals";
import { marginBasis, marginForTarget, repriceToTarget } from "@/lib/quote-pricing";

const Input = z.object({ estimateId: z.uuid(), mode: z.enum(["pct", "profit", "total"]), value: z.coerce.number() });

export async function setQuoteMargin(input: z.input<typeof Input>): Promise<ActionResult> {
  const p = Input.safeParse(input);
  if (!p.success) return { error: "Type a number." };
  const { supabase } = await requireMoneyAccess();
  const { data: est } = await supabase.from("estimates")
    .select("id, status, discount, tax_rate, gst_inclusive, selected_option_id, estimate_options!estimate_options_estimate_id_fkey(id, position, recommended), estimate_items(id, quantity, unit_price, unit_cost, option_id, extra_status)")
    .eq("id", p.data.estimateId).maybeSingle();
  if (!est) return { error: "Quote not found." };
  if (est.status !== "draft") return { error: "This quote has already gone out. Open it to change the price." };

  type Item = { id: string; quantity: number; unit_price: number; unit_cost: number | null; option_id: string | null; extra_status: string | null };
  const items = ((est.estimate_items ?? []) as Item[]).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), unit_cost: Number(i.unit_cost) || 0 }));
  const rate = Number(est.tax_rate ?? 10), inclusive = est.gst_inclusive !== false;
  const counted = itemsForOption(items, effectiveOptionId((est.estimate_options ?? []) as EstimateOptionLite[], est.selected_option_id));
  const basis = marginBasis(counted, Number(est.discount) || 0, rate, inclusive);
  const target = { mode: p.data.mode, value: p.data.value };
  const r = marginForTarget(basis, target);
  if ("error" in r) return { error: r.error };

  const inPrice = new Set(counted.map((i) => i.id));
  const repriced = repriceToTarget(items, items.map((i) => inPrice.has(i.id)), basis, target, r.marginPct);
  const changed = repriced.filter((x, i) => x.unit_price !== items[i].unit_price);
  const results = await Promise.all([
    ...changed.map((x) => supabase.from("estimate_items").update({ unit_price: x.unit_price }).eq("id", x.id)),
    supabase.from("estimates").update({ margin_pct: Math.round(r.marginPct * 100) / 100 }).eq("id", est.id),
  ]);
  const failed = results.find((x) => x.error);
  if (failed?.error) return { error: "Couldn't save the new price. Try again." };
  revalidatePath("/app/jobs");
  revalidatePath(`/app/estimates/${est.id}`);
  return { ok: "Price updated." };
}
