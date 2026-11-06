"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMoneyAccess } from "@/lib/dal";
import { effectiveOptionId, estimateTotals, itemsForOption } from "@/lib/estimate-totals";
import { noticeSnapshot, requiredNotices, resolveJobState } from "@/lib/estimate-notices";
import { friendly } from "@/lib/form";
import { MEASUREMENT_SOURCES } from "@/lib/roof";
import { supplierPriceBook, type PriceRow } from "@/lib/suppliers";
import type { ActionResult } from "@/components/action-form";

const ItemSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description.").max(500),
  quantity: z.coerce.number().finite(),
  unit: z.string().trim().max(20).default("ea"),
  // Negative prices are allowed for credits.
  unit_price: z.coerce.number().finite().min(-1000000).max(10000000),
  unit_cost: z.coerce.number().finite().min(0).max(10000000).catch(0),
  category: z.enum(["material", "labor", "other"]).catch("material"),
  calc_key: z.string().max(40).nullable().catch(null),
  option_key: z.string().max(60).nullable().catch(null),
  supplier_price_item_id: z.uuid().nullable().optional().catch(null),
});

const OptionSchema = z.object({
  key: z.string().min(1).max(60),
  id: z.uuid().optional().nullable(),
  name: z.string().trim().min(1, "Every option needs a name.").max(80),
  tier: z.enum(["good", "better", "best"]).nullable().catch(null),
  description: z.string().max(2000).catch(""),
  warranty: z.string().max(500).catch(""),
  recommended: z.boolean().catch(false),
});

const SaveSchema = z.object({
  id: z.uuid(),
  measurements: z.record(z.string(), z.unknown()),
  measurement_source: z.enum(MEASUREMENT_SOURCES).nullable().catch(null),
  option_label: z.enum(["options", "alternates"]).catch("options"),
  options: z.array(OptionSchema).max(6),
  items: z.array(ItemSchema).max(400),
  tax_rate: z.coerce.number().min(0).max(100),
  gst_inclusive: z.boolean(),
  org_supplier_id: z.uuid().nullable(),
  discount: z.coerce.number().min(0),
  notes: z.string().max(5000).nullable(),
  terms: z.string().max(5000).nullable(),
});
export type SaveEstimateInput = z.input<typeof SaveSchema>;

export async function createEstimate(fd: FormData) {
  const { supabase, org, user } = await requireMoneyAccess();
  const jobId = String(fd.get("job_id"));
  const { data, error } = await supabase
    .from("estimates")
    .insert({
      org_id: org.id,
      job_id: jobId,
      tax_rate: org.gst_registered ? 10 : 0,
      gst_inclusive: org.prices_include_gst !== false,
      org_supplier_id: org.default_supplier_id ?? null,
      terms: org.estimate_terms,
      measurements: { units: "metric", wastePct: Number(org.default_waste_pct) },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(`/app/estimates/${data.id}`);
}

export async function saveEstimate(input: SaveEstimateInput): Promise<ActionResult & { optionIds?: Record<string, string> }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid estimate." };
  const { supabase } = await requireMoneyAccess();
  const e = parsed.data;

  const keys = new Set(e.options.map((o) => o.key));
  if (keys.size !== e.options.length) return { error: "Two options share the same key. Reload and try again." };
  const orphan = e.items.find((i) => i.option_key && !keys.has(i.option_key));
  if (orphan) return { error: `"${orphan.description}" belongs to an option that was removed.` };
  if (e.options.length === 1) return { error: "Offer at least two options, or turn options off." };

  const { data: est } = await supabase.from("estimates").select("id, status").eq("id", e.id).maybeSingle();
  if (!est) return { error: "Estimate not found." };
  if (est.status === "accepted") return { error: "This estimate was accepted by the customer and is locked. Duplicate it to make changes." };

  // Exactly one recommended option (default: the middle one).
  const options = e.options.map((o) => ({ ...o, id: o.id ?? null }));
  if (options.length && !options.some((o) => o.recommended)) options[Math.floor((options.length - 1) / 2)].recommended = true;
  let seen = false;
  for (const o of options) { if (o.recommended && !seen) seen = true; else o.recommended = false; }

  const { data, error } = await supabase.rpc("save_estimate_content", {
    p_id: e.id,
    p_estimate: {
      measurements: e.measurements,
      measurement_source: e.measurement_source,
      option_label: e.option_label,
      tax_rate: e.tax_rate,
      gst_inclusive: e.gst_inclusive,
      org_supplier_id: e.org_supplier_id ?? "",
      discount: e.discount,
      notes: e.notes,
      terms: e.terms,
    },
    p_options: options,
    p_items: e.items,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/estimates/${e.id}`);
  revalidatePath("/app/estimates");
  return { ok: "Saved.", optionIds: (data ?? {}) as Record<string, string> };
}

/**
 * "Price from: [supplier]" — the supplier's active price sheet as price rows (null = no active sheet).
 * Also asks for each tiered sheet's profile/finish so Good/Better/Best each get their own sheet price.
 */
export async function loadSupplierPrices(orgSupplierId: string, sheets: { profile: string | null; finish: string | null }[] = []): Promise<{ rows: PriceRow[] | null; error?: string }> {
  const { supabase, org } = await requireMoneyAccess();
  if (!z.uuid().safeParse(orgSupplierId).success) return { rows: null, error: "Pick a supplier." };
  try {
    const base = await supplierPriceBook(supabase, org.id, orgSupplierId);
    if (!base) return { rows: null };
    const rows = [...base];
    for (const s of sheets.slice(0, 6)) {
      if (!s.profile && !s.finish) continue;
      const more = await supplierPriceBook(supabase, org.id, orgSupplierId, { profile: s.profile, finish: s.finish });
      for (const r of more ?? []) {
        if (r.calc_key === "metal_sheet" && !rows.some((x) => x.supplier_price_item_id === r.supplier_price_item_id)) rows.push(r);
      }
    }
    return { rows };
  } catch (err) {
    return { rows: null, error: (err as Error).message };
  }
}

export async function setEstimateStatus(fd: FormData) {
  const { supabase, org } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!["draft", "sent", "accepted", "declined"].includes(status)) throw new Error("Bad status");

  const { data: est, error: getErr } = await supabase
    .from("estimates")
    .select("id, job_id, status, discount, tax_rate, gst_inclusive, selected_option_id, estimate_items(quantity, unit_price, option_id), estimate_options!estimate_options_estimate_id_fkey(id, position, recommended), jobs(state, is_insurance, customers(state))")
    .eq("id", id)
    .single();
  if (getErr || !est) throw new Error("Estimate not found.");
  const items = (est.estimate_items ?? []) as { quantity: number; unit_price: number; option_id: string | null }[];
  const options = (est.estimate_options ?? []) as { id: string; position: number; recommended: boolean }[];
  if (status === "sent" && items.length === 0) throw new Error("Add at least one line item before sending.");

  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  if (status === "accepted") {
    const wanted = String(fd.get("option_id") ?? "") || null;
    const optionId = options.length ? effectiveOptionId(options, wanted ?? est.selected_option_id) : null;
    const job = est.jobs as unknown as { state: string | null; is_insurance: boolean; customers: { state: string | null } | null } | null;
    const resolved = resolveJobState(job?.state, job?.customers?.state, org.state);
    const t = estimateTotals(itemsForOption(items, optionId), Number(est.discount), Number(est.tax_rate), Boolean(est.gst_inclusive));
    patch.accepted_at = new Date().toISOString();
    patch.accepted_name = "Marked accepted by office";
    patch.selected_option_id = optionId;
    patch.legal_notices = noticeSnapshot(resolved.state, requiredNotices(resolved.state, { isInsurance: Boolean(job?.is_insurance), total: t.total }));
  }
  if (status === "draft") {
    Object.assign(patch, { accepted_at: null, accepted_name: null, selected_option_id: null, signature_data: null, accepted_ip: null, accepted_user_agent: null, legal_notices: [] });
  }
  const { error } = await supabase.from("estimates").update(patch).eq("id", id);
  if (error) throw new Error(friendly(error));

  // Move the job along the pipeline.
  const { data: job } = await supabase.from("jobs").select("stage").eq("id", est.job_id).single();
  if (job) {
    if (status === "sent" && ["lead", "inspection"].includes(job.stage)) await supabase.from("jobs").update({ stage: "estimate_sent" }).eq("id", est.job_id);
    if (status === "accepted" && ["lead", "inspection", "estimate_sent"].includes(job.stage)) await supabase.from("jobs").update({ stage: "sold" }).eq("id", est.job_id);
    if (status === "declined" && job.stage === "estimate_sent") await supabase.from("jobs").update({ stage: "lost" }).eq("id", est.job_id);
  }
  revalidatePath("/app", "layout");
}

type SrcItem = { description: string; quantity: number; unit: string; unit_price: number; unit_cost: number; category: string; position: number; calc_key: string | null; option_id: string | null; supplier_price_item_id: string | null };
type SrcOption = { id: string; position: number; name: string; tier: string | null; description: string | null; warranty: string | null; recommended: boolean };

export async function duplicateEstimate(fd: FormData) {
  const { supabase, org, user } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const { data: src } = await supabase.from("estimates").select("*, estimate_items(*), estimate_options!estimate_options_estimate_id_fkey(*)").eq("id", id).single();
  if (!src) throw new Error("Estimate not found.");
  const { data: copy, error } = await supabase
    .from("estimates")
    .insert({
      org_id: org.id,
      job_id: src.job_id,
      measurements: src.measurements,
      measurement_source: src.measurement_source,
      option_label: src.option_label,
      tax_rate: src.tax_rate,
      gst_inclusive: src.gst_inclusive,
      org_supplier_id: src.org_supplier_id,
      discount: src.discount,
      notes: src.notes,
      terms: src.terms,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  const options = ((src.estimate_options ?? []) as SrcOption[]).sort((a, b) => a.position - b.position);
  const items = ((src.estimate_items ?? []) as SrcItem[]).sort((a, b) => a.position - b.position);
  const { error: saveErr } = await supabase.rpc("save_estimate_content", {
    p_id: copy.id,
    p_estimate: { notes: src.notes, terms: src.terms },
    p_options: options.map((o) => ({ key: o.id, name: o.name, tier: o.tier, description: o.description, warranty: o.warranty, recommended: o.recommended })),
    p_items: items.map((i) => ({ ...i, option_key: i.option_id })),
  });
  if (saveErr) throw new Error(friendly(saveErr));
  revalidatePath("/app", "layout");
  redirect(`/app/estimates/${copy.id}`);
}

export async function deleteEstimate(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const { data: est } = await supabase.from("estimates").select("job_id").eq("id", id).single();
  const { error } = await supabase.from("estimates").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(est ? `/app/jobs/${est.job_id}` : "/app/estimates");
}
