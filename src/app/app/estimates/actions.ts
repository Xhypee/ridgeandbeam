"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

const ItemSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description."),
  quantity: z.coerce.number().finite(),
  unit: z.string().trim().max(20).default("ea"),
  unit_price: z.coerce.number().finite().min(0),
  category: z.enum(["material", "labor", "other"]).catch("material"),
});

const SaveSchema = z.object({
  id: z.uuid(),
  measurements: z.record(z.string(), z.unknown()),
  items: z.array(ItemSchema).max(300),
  tax_rate: z.coerce.number().min(0).max(100),
  discount: z.coerce.number().min(0),
  notes: z.string().max(5000).nullable(),
  terms: z.string().max(5000).nullable(),
});
export type SaveEstimateInput = z.input<typeof SaveSchema>;

export async function createEstimate(fd: FormData) {
  const { supabase, org, user } = await requireOrg();
  const jobId = String(fd.get("job_id"));
  const { data, error } = await supabase
    .from("estimates")
    .insert({
      org_id: org.id,
      job_id: jobId,
      tax_rate: org.tax_rate,
      terms: org.estimate_terms,
      measurements: { wastePct: Number(org.default_waste_pct) },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(`/app/estimates/${data.id}`);
}

export async function saveEstimate(input: SaveEstimateInput): Promise<ActionResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid estimate." };
  const { supabase, org } = await requireOrg();
  const e = parsed.data;

  const { data: existing } = await supabase.from("estimates").select("status").eq("id", e.id).single();
  if (!existing) return { error: "Estimate not found." };
  if (existing.status === "accepted") return { error: "This estimate was accepted by the customer and is locked. Duplicate it to make changes." };

  const { error } = await supabase
    .from("estimates")
    .update({ measurements: e.measurements, tax_rate: e.tax_rate, discount: e.discount, notes: e.notes, terms: e.terms })
    .eq("id", e.id);
  if (error) return { error: friendly(error) };

  // Replace line items wholesale; estimates are small.
  const del = await supabase.from("estimate_items").delete().eq("estimate_id", e.id);
  if (del.error) return { error: friendly(del.error) };
  if (e.items.length) {
    const ins = await supabase
      .from("estimate_items")
      .insert(e.items.map((it, i) => ({ ...it, org_id: org.id, estimate_id: e.id, position: i })));
    if (ins.error) return { error: friendly(ins.error) };
  }
  revalidatePath(`/app/estimates/${e.id}`);
  revalidatePath("/app/estimates");
  return { ok: "Saved." };
}

export async function setEstimateStatus(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!["draft", "sent", "accepted", "declined"].includes(status)) throw new Error("Bad status");

  const { data: est, error: getErr } = await supabase.from("estimates").select("id, job_id, status, estimate_items(count)").eq("id", id).single();
  if (getErr || !est) throw new Error("Estimate not found.");
  const itemCount = (est.estimate_items as unknown as { count: number }[])[0]?.count ?? 0;
  if (status === "sent" && itemCount === 0) throw new Error("Add at least one line item before sending.");

  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  if (status === "accepted") {
    patch.accepted_at = new Date().toISOString();
    patch.accepted_name = "Marked accepted by office";
  }
  if (status === "draft") {
    patch.accepted_at = null;
    patch.accepted_name = null;
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

export async function duplicateEstimate(fd: FormData) {
  const { supabase, org, user } = await requireOrg();
  const id = String(fd.get("id"));
  const { data: src } = await supabase.from("estimates").select("*, estimate_items(*)").eq("id", id).single();
  if (!src) throw new Error("Estimate not found.");
  const { data: copy, error } = await supabase
    .from("estimates")
    .insert({
      org_id: org.id,
      job_id: src.job_id,
      measurements: src.measurements,
      tax_rate: src.tax_rate,
      discount: src.discount,
      notes: src.notes,
      terms: src.terms,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  const items = (src.estimate_items as { description: string; quantity: number; unit: string; unit_price: number; category: string; position: number }[]) ?? [];
  if (items.length) {
    await supabase.from("estimate_items").insert(
      items.map(({ description, quantity, unit, unit_price, category, position }) => ({ org_id: org.id, estimate_id: copy.id, description, quantity, unit, unit_price, category, position })),
    );
  }
  revalidatePath("/app", "layout");
  redirect(`/app/estimates/${copy.id}`);
}

export async function deleteEstimate(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const { data: est } = await supabase.from("estimates").select("job_id").eq("id", id).single();
  const { error } = await supabase.from("estimates").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(est ? `/app/jobs/${est.job_id}` : "/app/estimates");
}
