"use server";
// The quoting engine's saves that aren't line items (those go through saveEstimate): who it's for, the quote
// margin and payment plan, the supplier the prices come from, and searching that supplier's price guide.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { activePriceListId, priceListItems } from "@/lib/suppliers";
import { normaliseStages, stagesProblem, STAGE_TRIGGERS } from "@/lib/quote-pricing";

const friendly = (e: { message?: string } | null) => (e?.message ?? "Couldn't save.").replace(/^.*violates.*$/, "Couldn't save that.");

async function editableEstimate(id: string) {
  const ctx = await requireMoneyAccess();
  const { data: est } = await ctx.supabase.from("estimates").select("id, status, job_id, org_id, jobs(customer_id)").eq("id", id).maybeSingle();
  if (!est) return { ctx, est: null, error: "Quote not found." } as const;
  if (est.status === "accepted") return { ctx, est: null, error: "This quote is signed and locked. Duplicate it to make changes." } as const;
  return { ctx, est, error: null } as const;
}

const Party = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Add the customer's name.").max(200),
  email: z.string().trim().max(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "That email doesn't look right."),
  site: z.string().trim().max(300),
  title: z.string().trim().min(1, "Give the job a title.").max(200),
});

/** 01 Who it's for + 02 the job title (the customer and job records). */
export async function saveQuoteParty(input: z.input<typeof Party>): Promise<ActionResult> {
  const p = Party.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the details." };
  const { ctx, est, error } = await editableEstimate(p.data.id);
  if (!est) return { error };
  const customerId = (Array.isArray(est.jobs) ? est.jobs[0] : est.jobs as { customer_id: string } | null)?.customer_id;
  const [c, j] = await Promise.all([
    customerId ? ctx.supabase.from("customers").update({ name: p.data.name, email: p.data.email || null }).eq("id", customerId) : Promise.resolve({ error: null }),
    ctx.supabase.from("jobs").update({ site_address: p.data.site || null, title: p.data.title }).eq("id", est.job_id),
  ]);
  if (c.error || j.error) return { error: friendly(c.error ?? j.error) };
  revalidatePath(`/app/estimates/${p.data.id}`);
  revalidatePath("/app/jobs");
  return { ok: "Saved." };
}

const Money = z.object({
  id: z.uuid(),
  margin_pct: z.coerce.number().min(0).max(90).nullable(),
  payment_mode: z.enum(["full", "instalments"]),
  payment_when: z.enum(["signed", "delivered", "completed"]),
  payment_stages: z.array(z.object({ label: z.string().max(60), pct: z.coerce.number().min(0).max(100), trigger: z.enum(STAGE_TRIGGERS) })).max(12),
});

/** 04 the quote margin and 05 how they pay. */
export async function saveQuoteMoney(input: z.input<typeof Money>): Promise<ActionResult> {
  const p = Money.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the margin and payment." };
  const stages = normaliseStages(p.data.payment_stages);
  if (p.data.payment_mode === "instalments") {
    const problem = stagesProblem(stages);
    if (problem) return { error: problem };
  }
  const { ctx, est, error } = await editableEstimate(p.data.id);
  if (!est) return { error };
  const { error: e } = await ctx.supabase.from("estimates").update({
    margin_pct: p.data.margin_pct, payment_mode: p.data.payment_mode, payment_when: p.data.payment_when, payment_stages: stages,
  }).eq("id", p.data.id);
  if (e) return { error: friendly(e) };
  return { ok: "Saved." };
}

/**
 * "Prices from": use a directory supplier (and branch) for this quote, adding it to the business's suppliers if needed.
 * `makeDefault` also makes it the default for new quotes (owners and admins).
 */
export async function chooseQuoteSupplier(input: { id: string; supplierId: string; branchId: string | null; makeDefault: boolean }): Promise<ActionResult & { orgSupplierId?: string }> {
  const { ctx, est, error } = await editableEstimate(input.id);
  if (!est) return { error };
  const { supabase, org } = ctx;
  const { data: branch } = input.branchId
    ? await supabase.from("supplier_branches").select("id, name, suburb, phone, supplier_id").eq("id", input.branchId).maybeSingle()
    : { data: null };
  if (branch && branch.supplier_id !== input.supplierId) return { error: "That branch belongs to another supplier." };
  const { data: existing } = await supabase.from("org_suppliers").select("id").eq("org_id", org.id).eq("supplier_id", input.supplierId).maybeSingle();
  let orgSupplierId = existing?.id as string | undefined;
  const branchPatch = branch ? { branch_id: branch.id, branch_name: branch.suburb, branch_phone: branch.phone } : {};
  if (orgSupplierId) {
    if (branch) await supabase.from("org_suppliers").update(branchPatch).eq("id", orgSupplierId);
  } else {
    const { data: row, error: e } = await supabase.from("org_suppliers").insert({ org_id: org.id, supplier_id: input.supplierId, ...branchPatch }).select("id").single();
    if (e || !row) return { error: friendly(e) };
    orgSupplierId = row.id;
  }
  const { error: e2 } = await supabase.from("estimates").update({ org_supplier_id: orgSupplierId }).eq("id", input.id);
  if (e2) return { error: friendly(e2) };
  let note = "";
  if (input.makeDefault) {
    const { error: e3 } = await supabase.rpc("set_default_supplier", { p_org: org.id, p_org_supplier: orgSupplierId });
    if (e3) note = " Only owners and admins can change the default for every quote.";
  }
  revalidatePath(`/app/estimates/${input.id}`);
  return { ok: `Prices from ${branch?.name ?? "that supplier"}.${note}`, orgSupplierId };
}

export type GuideItem = { id: string; description: string; unit: string; cost: number; code: string | null; calc_key: string | null };

/** Search the supplier's active price guide (cost ex GST) to add a line. */
export async function searchPriceGuide(orgSupplierId: string, q: string): Promise<{ items: GuideItem[]; error?: string }> {
  const { supabase, org } = await requireMoneyAccess();
  const listId = await activePriceListId(supabase, org.id, orgSupplierId);
  if (!listId) return { items: [], error: "No price guide loaded for this supplier yet." };
  const all = await priceListItems(supabase, listId, false);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = all.filter((i) => words.every((w) => `${i.description} ${i.product_code ?? ""} ${i.profile ?? ""} ${i.finish ?? ""}`.toLowerCase().includes(w)));
  return { items: hit.slice(0, 40).map((i) => ({ id: i.id, description: i.description, unit: i.unit, cost: Number(i.cost_ex_gst), code: i.product_code, calc_key: i.calc_key })) };
}
