"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess, requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { addDays, aud, checkPlan, PART_TRIGGERS, PAY_METHODS, round2 } from "@/lib/pay-plan";
import { sendPartMessage } from "@/lib/pay-plan-notify";
import { effectiveMethods, loadPlanContext } from "@/lib/pay-plan-server";

const PartSchema = z.object({
  label: z.string().trim().min(1).max(80),
  trigger: z.enum(PART_TRIGGERS),
  amount: z.coerce.number().finite(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
});
const SaveSchema = z.object({
  jobId: z.uuid(),
  parts: z.array(PartSchema).max(24),
  methods: z.array(z.enum(PAY_METHODS)).min(1, "Pick at least one way to pay."),
  reminders: z.boolean(),
});
export type SavePlanInput = z.input<typeof SaveSchema>;

/**
 * Save the payment plan: parts with money already paid stay as they are; unpaid plan invoices are replaced
 * (drafts deleted, issued ones voided). Parts due now are issued straight away; the rest wait as drafts until
 * their milestone or date (the daily job issues dated ones 3 days early).
 */
export async function savePaymentPlan(input: SavePlanInput): Promise<ActionResult & { sent?: number }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the plan." };
  const { supabase, org, user } = await requireMoneyAccess();
  const p = parsed.data;
  const ctx = await loadPlanContext(supabase, org, p.jobId);
  if (!ctx) return { error: "Job not found." };
  if (!ctx.contract) return { error: "This job needs a signed quote before you can set up a payment plan." };
  const parts = p.parts.map((x) => ({ ...x, amount: round2(x.amount), due_date: x.trigger === "date" ? x.due_date : null }));
  const check = checkPlan(parts, ctx.remaining, ctx.depositRoom, ctx.today);
  if (!check.ok) return { error: check.error };

  // Replace the unpaid parts of any earlier plan.
  const unpaid = ctx.invoices.filter((i) => i.paid <= 0);
  const drafts = unpaid.filter((i) => i.status === "draft").map((i) => i.id);
  const issued = unpaid.filter((i) => i.status !== "draft").map((i) => i.id);
  if (drafts.length) {
    const { error } = await supabase.from("invoices").delete().in("id", drafts);
    if (error) return { error: friendly(error) };
  }
  if (issued.length) {
    const { error } = await supabase.from("invoices").update({ status: "void" }).in("id", issued);
    if (error) return { error: friendly(error) };
  }

  const total = ctx.contract.total;
  const soon = addDays(ctx.today, 3);
  const count = check.parts.length + ctx.locked.length;
  const created: { id: string; status: string; label: string; amount: number; due: string | null; token: string }[] = [];
  for (const [i, part] of check.parts.entries()) {
    const issueNow = part.trigger === "signed" || (part.trigger === "date" && part.due_date! <= soon);
    const due = part.trigger === "signed" ? ctx.today : part.due_date;
    const pct = total > 0 ? Math.round((part.amount / total) * 1000) / 10 : 0;
    const { data: inv, error } = await supabase.from("invoices").insert({
      org_id: org.id, job_id: p.jobId, estimate_id: ctx.contract.estimateId || null,
      kind: part.kind, milestone_label: part.label, milestone_trigger: part.trigger,
      status: issueNow ? "sent" : "draft", issue_date: ctx.today, due_date: due,
      tax_rate: org.gst_registered === false ? 0 : 10, amounts_include_gst: true, terms: org.invoice_terms,
      notes: `Payment ${ctx.locked.length + i + 1} of ${count} on your payment plan for quote #${ctx.contract.number ?? ""} (${aud(total)} inc GST).`,
      created_by: user.id,
    }).select("id, public_token").single();
    if (error) return { error: friendly(error) };
    const item = await supabase.from("invoice_items").insert({
      org_id: org.id, invoice_id: inv.id, position: 0, description: `${part.label} (${pct}% of the ${aud(total)} contract price)`,
      quantity: 1, unit: "ea", unit_price: part.amount, category: "other",
    });
    if (item.error) return { error: friendly(item.error) };
    created.push({ id: inv.id, status: issueNow ? "sent" : "draft", label: part.label, amount: part.amount, due, token: inv.public_token });
  }

  const { error: jobErr } = await supabase.from("jobs").update({ pay_methods: p.methods, pay_reminders: p.reminders }).eq("id", p.jobId);
  if (jobErr) return { error: friendly(jobErr) };

  // Tell the customer about anything that's due now.
  const methods = effectiveMethods(p.methods, Boolean(org.stripe_account_id && org.stripe_charges_enabled));
  const { data: job } = await supabase.from("jobs").select("customer_id").eq("id", p.jobId).single();
  let sent = 0;
  for (const c of created.filter((x) => x.status === "sent")) {
    await sendPartMessage(supabase, {
      orgId: org.id, orgName: org.name, orgPhone: org.phone, jobId: p.jobId, customerId: job?.customer_id ?? null,
      customerName: ctx.job.customer.name, email: ctx.job.customer.email, phone: ctx.job.customer.phone,
      label: c.label, amount: c.amount, dueDate: c.due, invoiceToken: c.token, jobToken: ctx.job.public_token, methods, when: "due",
    });
    await supabase.from("invoices").update({ last_reminder_on: ctx.today }).eq("id", c.id);
    sent++;
  }
  revalidatePath("/app", "layout");
  return { ok: `Payment plan saved: ${created.length} payment${created.length === 1 ? "" : "s"}${sent ? `, ${sent} sent to ${ctx.job.customer.name.split(" ")[0]}` : ""}.`, sent };
}

/** Issue a waiting part now (milestone reached) and let the customer know. */
export async function issuePart(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const { data: inv } = await supabase.from("invoices").select("id, status, job_id, milestone_label, due_date, public_token, invoice_totals(total)").eq("id", id).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  if (inv.status !== "draft") return { error: "Already sent." };
  const ctx = await loadPlanContext(supabase, org, inv.job_id);
  if (!ctx) return { error: "Job not found." };
  const due = inv.due_date && inv.due_date > ctx.today ? inv.due_date : addDays(ctx.today, 7);
  const { error } = await supabase.from("invoices").update({ status: "sent", issue_date: ctx.today, due_date: due, last_reminder_on: ctx.today }).eq("id", id);
  if (error) return { error: friendly(error) };
  const t = (Array.isArray(inv.invoice_totals) ? inv.invoice_totals[0] : inv.invoice_totals) as { total: number } | null;
  const { data: job } = await supabase.from("jobs").select("customer_id").eq("id", inv.job_id).single();
  await sendPartMessage(supabase, {
    orgId: org.id, orgName: org.name, orgPhone: org.phone, jobId: inv.job_id, customerId: job?.customer_id ?? null,
    customerName: ctx.job.customer.name, email: ctx.job.customer.email, phone: ctx.job.customer.phone,
    label: inv.milestone_label ?? "Payment", amount: Number(t?.total ?? 0), dueDate: due, invoiceToken: inv.public_token, jobToken: ctx.job.public_token,
    methods: effectiveMethods(ctx.job.pay_methods, Boolean(org.stripe_account_id && org.stripe_charges_enabled)), when: "due",
  });
  revalidatePath("/app", "layout");
  return { ok: `${inv.milestone_label ?? "Payment"} sent to ${ctx.job.customer.name.split(" ")[0]}.` };
}

/** Cash handed over on site (crew leads too, on their own jobs; checked in the database). */
export async function recordCash(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const amount = Math.round(Number(fd.get("amount")) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter the cash amount." };
  const { error } = await supabase.rpc("record_cash_payment", { p_invoice: String(fd.get("invoice_id")), p_amount: amount, p_note: String(fd.get("note") ?? "") || null });
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: `${aud(amount)} cash recorded.` };
}
