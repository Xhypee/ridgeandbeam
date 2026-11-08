"use server";
// Building stage: request the next payment from the quote's plan; tick a supplier's delivery; file the supplier's
// invoice and record when it was paid (and by whom).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { readSupplierInvoice } from "@/lib/ai";
import { stageKind } from "@/lib/build-stage";
import { loadBuild, paymentRequestPreview } from "@/lib/build-stage-server";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { addDays, aud, round2 } from "@/lib/pay-plan";
import { sendPartMessage } from "@/lib/pay-plan-notify";
import { loadPlanContext } from "@/lib/pay-plan-server";
import { markDelivered } from "../orders/actions";

const touch = (jobId: string) => { revalidatePath("/app/jobs"); revalidatePath(`/app/jobs/${jobId}`, "layout"); };
/** Close the pop-up after it's done its job (only ever back to the Jobs board). */
const back = (fd: FormData) => { const b = String(fd.get("back") ?? ""); if (/^\/app\/jobs(\?[\w=&%-]*)?$/.test(b)) redirect(b); };
type Ctx = Awaited<ReturnType<typeof requireMoneyAccess>>;
const who = (ctx: Ctx) => ctx.memberships.find((m) => m.org_id === ctx.org.id)?.full_name || ctx.user.fullName || ctx.user.email || "Someone";
async function note(ctx: Ctx, jobId: string, body: string) {
  await ctx.supabase.from("job_notes").insert({ org_id: ctx.org.id, job_id: jobId, body, author_id: ctx.user.id, author_name: who(ctx) });
}

/** Ask the customer for the next payment on the quote (or remind them if it's already been asked for). */
export async function requestPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const jobId = String(fd.get("job_id") ?? "");
  const plan = await loadPlanContext(supabase, org, jobId);
  if (!plan?.contract) return { error: "This job needs a signed quote first." };
  const { data: job } = await supabase.from("jobs").select("state, scheduled_end, completed_at, stage, customer_id").eq("id", jobId).single();
  if (!job) return { error: "Job not found." };
  const build = await loadBuild(supabase, org, jobId, job, plan.contract.total);
  if (!build.rows.some((r) => r.state === "next" || r.state === "asked")) return { error: "Everything on the quote has been paid." };

  if (build.otherPlan.count > 0) return { error: "This job has a different payment plan in Billing. Send it from Billing → Payment plan, or change that plan to match the quote." };
  // Every stage on the quote gets its invoice (as a draft until it's asked for), so signed extra work lands on the final one.
  const missing = build.rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.invoice && r.state !== "paid");
  for (const { r, i } of missing) {
    const pct = r.pct;
    const { data: inv, error } = await supabase.from("invoices").insert({
      org_id: org.id, job_id: jobId, estimate_id: plan.contract.estimateId || null,
      kind: stageKind(i, build.rows.length, r.trigger), milestone_label: r.label, milestone_trigger: r.trigger,
      status: "draft", issue_date: plan.today, due_date: null,
      tax_rate: org.gst_registered === false ? 0 : 10, amounts_include_gst: true, terms: org.invoice_terms,
      notes: `${r.label} · payment ${i + 1} of ${build.rows.length} on quote #${plan.contract.number ?? ""} (${aud(plan.contract.total)} inc GST).`,
      created_by: user.id,
    }).select("id").single();
    if (error) return { error: friendly(error) };
    const item = await supabase.from("invoice_items").insert({
      org_id: org.id, invoice_id: inv.id, position: 0, description: `${r.label} (${pct}% of the ${aud(plan.contract.total)} contract price)`,
      quantity: 1, unit: "ea", unit_price: r.quoted, category: "other",
    });
    if (item.error) return { error: friendly(item.error) };
  }

  const p = await paymentRequestPreview(supabase, org, jobId);
  if (!p?.row.invoice) return { error: "Couldn't find the invoice for that payment. Try again." };
  const inv = p.row.invoice;
  const first = plan.job.customer.name.split(" ")[0] || plan.job.customer.name;
  if (inv.status === "draft") {
    const due = addDays(plan.today, 7);
    const { error } = await supabase.from("invoices").update({ status: "sent", issue_date: plan.today, due_date: due, last_reminder_on: plan.today }).eq("id", inv.id);
    if (error) return { error: friendly(error) };
    const again = await paymentRequestPreview(supabase, org, jobId);
    await sendPartMessage(supabase, { ...again!.msg.input, customerId: job.customer_id, dueDate: due });
    await note(ctx, jobId, `Requested ${p.row.label} · ${aud(p.row.amount)} from ${first} (email${plan.job.customer.phone ? " and text" : ""}).`);
    touch(jobId);
    back(fd);
    return { ok: `${p.row.label} · ${aud(p.row.amount)} requested from ${first}.` };
  }
  await sendPartMessage(supabase, { ...p.msg.input, customerId: job.customer_id, dueDate: inv.due_date });
  await supabase.from("invoices").update({ last_reminder_on: plan.today }).eq("id", inv.id);
  await note(ctx, jobId, `Reminded ${first} about ${p.row.label} · ${aud(p.row.amount)}.`);
  touch(jobId);
  back(fd);
  return { ok: `Reminder sent to ${first}.` };
}

/** Tick a supplier's delivery (posts the order to job cost, as on the orders page). */
export async function tickDelivered(prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await markDelivered(prev, fd);
  const { supabase } = await requireMoneyAccess();
  const { data: o } = await supabase.from("material_orders").select("job_id").eq("id", String(fd.get("id"))).maybeSingle();
  if (o) touch(o.job_id);
  return r;
}

const AttachSchema = z.object({ orderId: z.uuid(), path: z.string().min(10).max(400), name: z.string().max(200), mime: z.string().max(120).nullable(), size: z.number().int().min(0).max(50 * 1024 * 1024) });

/** File a supplier's invoice (uploaded straight to job storage) against its order, and read it if AI is on. */
export async function attachSupplierInvoice(input: z.input<typeof AttachSchema>): Promise<ActionResult & { read?: boolean }> {
  const p = AttachSchema.safeParse(input);
  if (!p.success) return { error: "That upload didn't look right. Try again." };
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const { data: o } = await supabase.from("material_orders").select("id, job_id, supplier, org_supplier_id, invoice_file_id").eq("id", p.data.orderId).maybeSingle();
  if (!o) return { error: "Order not found." };
  if (!p.data.path.startsWith(`${org.id}/${o.job_id}/files/`) || p.data.path.includes("..")) return { error: "Upload path doesn't match this job." };
  const ext = /\.[a-z0-9]{2,5}$/i.exec(p.data.name)?.[0]?.toLowerCase() ?? ".pdf";
  const { data: file, error } = await supabase.from("job_files").insert({
    org_id: org.id, job_id: o.job_id, kind: "document", category: "supplier_invoice", storage_path: p.data.path,
    mime_type: p.data.mime, size_bytes: p.data.size, caption: `${o.supplier.split(" (")[0]} invoice${ext}`, uploaded_by: user.id,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  const patch: Record<string, unknown> = { invoice_file_id: file.id, invoice_source: "upload" };
  // Read it (when Claude is set up): only what's clearly printed; the person checks it before paying.
  let read = false;
  if (p.data.mime === "application/pdf" || (p.data.mime ?? "").startsWith("image/")) {
    const { data: blob } = await supabase.storage.from("job-files").download(p.data.path);
    const r = blob ? await readSupplierInvoice(Buffer.from(await blob.arrayBuffer()), p.data.mime ?? "application/pdf") : null;
    if (r) {
      read = true;
      Object.assign(patch, {
        invoice_no: r.invoice_no, invoice_date: r.invoice_date, invoice_due: r.due_date, invoice_abn: r.abn,
        invoice_ex: r.ex_gst ?? (r.total !== null && r.gst !== null ? round2(r.total - r.gst) : null), invoice_gst: r.gst,
        bank_name: r.bank_name, bank_bsb: r.bsb, bank_account: r.account,
      });
    }
  }
  const up = await supabase.from("material_orders").update(patch).eq("id", o.id);
  if (up.error) return { error: friendly(up.error) };
  touch(o.job_id);
  return { ok: read ? "Invoice read. Check the details and pay." : "Invoice saved. Check the details and pay.", read };
}

const money = z.preprocess((v) => (typeof v === "string" ? v.replace(/[$,\s]/g, "") : v), z.coerce.number().finite().min(0).max(10_000_000));
const PaySchema = z.object({
  order_id: z.uuid(),
  invoice_no: z.string().trim().max(60).optional().default(""),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  invoice_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  invoice_ex: money,
  invoice_gst: money,
  invoice_abn: z.string().trim().max(20).optional().default(""),
  bank_name: z.string().trim().max(120).optional().default(""),
  bank_bsb: z.string().trim().max(10).optional().default(""),
  bank_account: z.string().trim().max(20).optional().default(""),
});

/** "I've paid it": keep the invoice details, remember the supplier's bank details, note who paid and when. */
export async function paySupplierInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const p = PaySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Check the amounts." };
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const v = p.data;
  const { data: o } = await supabase.from("material_orders").select("id, job_id, supplier, org_supplier_id, paid_at, po_number").eq("id", v.order_id).maybeSingle();
  if (!o) return { error: "Order not found." };
  if (o.paid_at) return { ok: "Already marked paid." };
  const total = round2(v.invoice_ex + v.invoice_gst);
  if (!(total > 0)) return { error: "Enter the invoice amount." };
  const nul = (s: string) => s || null;
  const now = new Date().toISOString();
  const { error } = await supabase.from("material_orders").update({
    invoice_no: nul(v.invoice_no), invoice_date: nul(v.invoice_date), invoice_due: nul(v.invoice_due), invoice_ex: v.invoice_ex, invoice_gst: v.invoice_gst,
    invoice_abn: nul(v.invoice_abn), bank_name: nul(v.bank_name), bank_bsb: nul(v.bank_bsb), bank_account: nul(v.bank_account),
    paid_at: now, paid_by: user.id, paid_by_name: who(ctx),
  }).eq("id", o.id);
  if (error) return { error: friendly(error) };
  if (o.org_supplier_id && (v.bank_bsb || v.bank_account || v.invoice_abn)) {
    await supabase.from("org_suppliers").update({ bank_name: nul(v.bank_name), bank_bsb: nul(v.bank_bsb), bank_account: nul(v.bank_account), abn: nul(v.invoice_abn) }).eq("id", o.org_supplier_id);
  }
  // Job cost follows the real invoice (ex GST), not the order estimate.
  const { data: cost } = await supabase.from("job_costs").select("id").eq("source", "order").eq("source_id", o.id).maybeSingle();
  const desc = `${o.supplier} invoice${v.invoice_no ? ` ${v.invoice_no}` : ""}`;
  if (cost) await supabase.from("job_costs").update({ amount: v.invoice_ex, description: desc }).eq("id", cost.id);
  else await supabase.from("job_costs").insert({ org_id: org.id, job_id: o.job_id, category: "materials", vendor: o.supplier, amount: v.invoice_ex, source: "order", source_id: o.id, description: desc, created_by: user.id });
  await note(ctx, o.job_id, `Paid ${o.supplier} invoice${v.invoice_no ? ` ${v.invoice_no}` : ""} · ${aud(total)} by bank transfer.`);
  touch(o.job_id);
  back(fd);
  return { ok: `${o.supplier} marked paid.` };
}
