"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import { PAYMENT_METHODS } from "@/lib/types";
import type { ActionResult } from "@/components/action-form";
import { BILL_TO, INVOICE_KINDS, INVOICE_KIND_LABEL, planSchedule, TRIGGER_LABEL, validateSchedule } from "@/lib/claims-billing";
// Fallback until estimating's src/lib/estimate-totals.ts lands (same signature, contract 5).
import { acceptedEstimateTotal } from "@/lib/claims-estimate";

function dueIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createInvoice(fd: FormData) {
  const { supabase, org, user } = await requireOrg();
  const { data, error } = await supabase
    .from("invoices")
    .insert({ org_id: org.id, job_id: String(fd.get("job_id")), tax_rate: org.tax_rate, terms: org.invoice_terms, due_date: dueIn(15), created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(`/app/invoices/${data.id}`);
}

export async function createInvoiceFromEstimate(fd: FormData) {
  const { supabase, org, user } = await requireOrg();
  const estimateId = String(fd.get("estimate_id"));
  const { data: est } = await supabase.from("estimates").select("*, estimate_items(*)").eq("id", estimateId).single();
  if (!est) throw new Error("Estimate not found.");
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      org_id: org.id,
      job_id: est.job_id,
      estimate_id: est.id,
      tax_rate: est.tax_rate,
      discount: est.discount,
      notes: `Per accepted estimate #${est.number}.`,
      terms: org.invoice_terms,
      due_date: dueIn(15),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error));
  const items = (est.estimate_items as { description: string; quantity: number; unit: string; unit_price: number; category: string; position: number }[]) ?? [];
  if (items.length) {
    const ins = await supabase.from("invoice_items").insert(
      items.map(({ description, quantity, unit, unit_price, category, position }) => ({ org_id: org.id, invoice_id: inv.id, description, quantity, unit, unit_price, category, position })),
    );
    if (ins.error) throw new Error(friendly(ins.error));
  }
  revalidatePath("/app", "layout");
  redirect(`/app/invoices/${inv.id}`);
}

const SaveSchema = z.object({
  id: z.uuid(),
  issue_date: z.iso.date(),
  due_date: z.iso.date().nullable(),
  tax_rate: z.coerce.number().min(0).max(100),
  discount: z.coerce.number().min(0),
  notes: z.string().max(5000).nullable(),
  terms: z.string().max(5000).nullable(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Every line needs a description."),
        quantity: z.coerce.number().finite(),
        unit: z.string().trim().max(20).default("ea"),
        unit_price: z.coerce.number().finite().min(0),
        category: z.enum(["material", "labor", "other"]).catch("other"),
      }),
    )
    .max(300),
});
export type SaveInvoiceInput = z.input<typeof SaveSchema>;

export async function saveInvoice(input: SaveInvoiceInput): Promise<ActionResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid invoice." };
  const { supabase, org } = await requireOrg();
  const v = parsed.data;
  const { data: existing } = await supabase.from("invoices").select("status").eq("id", v.id).single();
  if (!existing) return { error: "Invoice not found." };
  if (existing.status === "void") return { error: "This invoice is void." };

  const { error } = await supabase
    .from("invoices")
    .update({ issue_date: v.issue_date, due_date: v.due_date, tax_rate: v.tax_rate, discount: v.discount, notes: v.notes, terms: v.terms })
    .eq("id", v.id);
  if (error) return { error: friendly(error) };
  const del = await supabase.from("invoice_items").delete().eq("invoice_id", v.id);
  if (del.error) return { error: friendly(del.error) };
  if (v.items.length) {
    const ins = await supabase.from("invoice_items").insert(v.items.map((it, i) => ({ ...it, org_id: org.id, invoice_id: v.id, position: i })));
    if (ins.error) return { error: friendly(ins.error) };
  }
  revalidatePath(`/app/invoices/${v.id}`);
  revalidatePath("/app/invoices");
  return { ok: "Saved." };
}

export async function setInvoiceStatus(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!["draft", "sent", "void"].includes(status)) throw new Error("Bad status");
  if (status === "sent") {
    const { data } = await supabase.from("invoices").select("invoice_items(count)").eq("id", id).single();
    if (((data?.invoice_items as unknown as { count: number }[]) ?? [])[0]?.count === 0) throw new Error("Add at least one line item before sending.");
  }
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
}

export async function addPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireOrg();
  const invoiceId = String(fd.get("invoice_id"));
  const amount = num(fd, "amount");
  if (!(amount > 0)) return { error: "Enter a payment amount." };
  const { data: inv } = await supabase.from("invoices").select("status, job_id").eq("id", invoiceId).single();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status === "void") return { error: "Can't record a payment on a void invoice." };
  // Recording a payment on a draft implies it was sent.
  if (inv.status === "draft") await supabase.from("invoices").update({ status: "sent" }).eq("id", invoiceId);

  const { error } = await supabase.from("payments").insert({
    org_id: org.id,
    invoice_id: invoiceId,
    amount,
    method: oneOf(fd, "method", PAYMENT_METHODS, "check"),
    paid_on: str(fd, "paid_on") ?? new Date().toISOString().slice(0, 10),
    reference: str(fd, "reference"),
    created_by: user.id,
  });
  if (error) return { error: friendly(error) };

  // When every non-void invoice on the job is paid, mark the job paid.
  const { data: siblings } = await supabase.from("invoices").select("status").eq("job_id", inv.job_id).neq("status", "void");
  if (siblings?.length && siblings.every((s) => s.status === "paid")) {
    await supabase.from("jobs").update({ stage: "paid" }).eq("id", inv.job_id);
  }
  revalidatePath("/app", "layout");
  return { ok: "Payment recorded." };
}

export async function deletePayment(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("payments").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
}

export async function deleteInvoice(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const { data: inv } = await supabase.from("invoices").select("job_id, payments(count)").eq("id", id).single();
  if ((((inv?.payments as unknown as { count: number }[]) ?? [])[0]?.count ?? 0) > 0) throw new Error("This invoice has payments. Void it instead of deleting.");
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
  redirect(inv ? `/app/jobs/${inv.job_id}` : "/app/invoices");
}

// ---------------------------------------------------------------------------
// Milestone invoices (contract 4): deposit / progress / final from organizations.payment_schedule
// ---------------------------------------------------------------------------
export async function createPaymentSchedule(jobId: string): Promise<{ error?: string; ok?: string; invoiceIds?: string[] }> {
  const { supabase, org, user, canSeeMoney } = await requireOrg();
  if (!canSeeMoney) return { error: "You don't have access to invoices." };
  if (!z.uuid().safeParse(jobId).success) return { error: "Unknown job." };
  const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };

  const { data: orgRow } = await supabase.from("organizations").select("payment_schedule, invoice_terms").eq("id", org.id).single();
  const sched = validateSchedule(orgRow?.payment_schedule);
  if (!sched.ok) return { error: sched.error };

  const { data: existing } = await supabase.from("invoices").select("id").eq("job_id", jobId).in("kind", ["deposit", "progress", "final"]).neq("status", "void").limit(1);
  if (existing?.length) return { error: "This job already has milestone invoices. Void them first to start over." };

  const est = await acceptedEstimateTotal(supabase, jobId);
  if (!est) return { error: "This job needs an accepted estimate before a payment schedule can be created." };
  if (!(est.total > 0)) return { error: "The accepted estimate total is $0." };

  const plan = planSchedule(est.total, sched.steps);
  const ids: string[] = [];
  for (const [i, p] of plan.entries()) {
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        org_id: org.id,
        job_id: jobId,
        estimate_id: est.estimateId,
        kind: p.kind,
        milestone_label: p.label,
        milestone_trigger: p.trigger,
        tax_rate: 0, // the accepted estimate total already includes tax
        terms: orgRow?.invoice_terms ?? org.invoice_terms,
        due_date: i === 0 && p.trigger === "signed" ? dueIn(0) : null,
        notes: `${p.label}: ${p.pct}% of the contract total per accepted estimate #${est.estimateNumber}. ${TRIGGER_LABEL[p.trigger] ?? ""}`.trim(),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return { error: friendly(error) };
    const item = await supabase.from("invoice_items").insert({
      org_id: org.id,
      invoice_id: inv.id,
      position: 0,
      description: `${p.label} (${p.pct}% of ${est.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} contract)`,
      quantity: 1,
      unit: "ea",
      unit_price: p.amount,
      category: "other",
    });
    if (item.error) return { error: friendly(item.error) };
    ids.push(inv.id);
  }
  revalidatePath("/app", "layout");
  return { ok: `Created ${plan.length} milestone invoices: ${plan.map((p) => `${INVOICE_KIND_LABEL[p.kind]} ${p.pct}%`).join(", ")}.`, invoiceIds: ids };
}

/** Form wrapper for createPaymentSchedule (job Billing tab). */
export async function createPaymentScheduleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await createPaymentSchedule(String(fd.get("job_id")));
  return { error: r.error, ok: r.ok };
}

export async function updateInvoiceBilling(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, canSeeMoney } = await requireOrg();
  if (!canSeeMoney) return { error: "You don't have access to invoices." };
  const id = String(fd.get("id"));
  const { error } = await supabase
    .from("invoices")
    .update({
      bill_to: oneOf(fd, "bill_to", BILL_TO, "homeowner"),
      kind: oneOf(fd, "kind", INVOICE_KINDS, "standard"),
      milestone_label: str(fd, "milestone_label"),
    })
    .eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}
