import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAuState, AU_STATE_TZ } from "./au";
import { calendarDate } from "./au-business-days";
import { dueReason, otherPlanInvoices, paymentRows, type PayRow, type PlanInv } from "./build-stage";
import { aud, round2 } from "./pay-plan";
import { partMessage, type PartMessage } from "./pay-plan-notify";
import { effectiveMethods, loadPlanContext, PLAN_KINDS } from "./pay-plan-server";
import { orderTotal } from "./production-orders";
import type { PaymentPlan } from "./quote-pricing";
import type { Organization } from "./types";

export type BuildDelivery = {
  id: string; supplier: string; branch: string | null; what: string; status: string;
  deliveredAt: string | null; deliveryDate: string | null; supplierDate: string | null; cost: number;
  invoice: { fileId: string | null; no: string | null; total: number | null; due: string | null; source: string | null } | null;
  paidAt: string | null; paidBy: string | null;
};
export type BuildData = {
  rows: PayRow[]; contract: number; paid: number; quoteNo: number | null;
  /** Payments set up in Billing that differ from the quote (requests here won't add more on top of them). */
  otherPlan: { count: number; paid: number };
  deliveries: BuildDelivery[];
  /** On or after the last booked day (or no end booked and the job's done). */
  lastDay: boolean;
  /** Supplier invoices filed with the job's documents: what to show under each one. */
  invoiceDocs: Record<string, { meta: string; paid: boolean }>;
};

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const dayTime = (iso: string, tz: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

type EstPlan = { id: string; number: number; payment_mode: string | null; payment_when: string | null; payment_stages: unknown };
export function estimatePlan(e: EstPlan | null): Pick<PaymentPlan, "mode" | "when" | "stages"> | null {
  if (!e) return null;
  const when = (["signed", "delivered", "completed"].includes(e.payment_when ?? "") ? e.payment_when : "completed") as PaymentPlan["when"];
  return { mode: e.payment_mode === "instalments" ? "instalments" : "full", when, stages: Array.isArray(e.payment_stages) ? (e.payment_stages as PaymentPlan["stages"]) : [] };
}

/** "Sheets, capping, flashings": the order's headings, else its first items. */
function whatText(items: { description: string; group_label: string | null }[]) {
  const groups = [...new Set(items.map((i) => i.group_label).filter((g): g is string => Boolean(g) && !g!.startsWith("Extras")))];
  const words = (groups.length ? groups : items.map((i) => i.description)).map((g) => g.replace(/^COLORBOND\s+/i, "").split(/[,(·&]/)[0].trim());
  const list = [...new Set(words)].slice(0, 3).join(", ");
  return list || `${items.length} item${items.length === 1 ? "" : "s"}`;
}

export async function loadBuild(supabase: SupabaseClient, org: Organization, jobId: string, job: { state: string | null; scheduled_end: string | null; completed_at: string | null; stage: string }, contract: number | null): Promise<BuildData> {
  const tz = AU_STATE_TZ[asAuState(job.state) ?? asAuState(org.state) ?? "NSW"];
  const today = calendarDate(new Date(), tz);
  const [{ data: est }, { data: invRows }, { data: orders }] = await Promise.all([
    supabase.from("estimates").select("id, number, payment_mode, payment_when, payment_stages").eq("job_id", jobId).eq("status", "accepted").order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("invoices").select("id, kind, milestone_label, milestone_trigger, status, issue_date, due_date, last_reminder_on, invoice_totals(total, paid, balance)").eq("job_id", jobId).in("kind", PLAN_KINDS as unknown as string[]).neq("status", "void").order("number"),
    supabase.from("material_orders").select("id, supplier, branch, status, delivered_at, delivery_date, supplier_delivery_date, invoice_no, invoice_ex, invoice_gst, invoice_due, invoice_file_id, invoice_source, paid_at, paid_by_name, material_order_items(description, group_label, quantity, unit, unit_cost, length_m)").eq("job_id", jobId).neq("status", "cancelled").order("created_at"),
  ]);
  type R = { id: string; kind: string; milestone_label: string | null; milestone_trigger: string | null; status: string; issue_date: string | null; due_date: string | null; last_reminder_on: string | null; invoice_totals: unknown };
  const invs: PlanInv[] = ((invRows ?? []) as R[]).map((r) => {
    const t = one(r.invoice_totals as { total: number; paid: number; balance: number });
    return { id: r.id, kind: r.kind, label: r.milestone_label, trigger: r.milestone_trigger, status: r.status, total: Number(t?.total ?? 0), paid: Number(t?.paid ?? 0), balance: Number(t?.balance ?? 0), issue_date: r.issue_date, due_date: r.due_date, last_reminder_on: r.last_reminder_on };
  });
  type O = { id: string; supplier: string; branch: string | null; status: string; delivered_at: string | null; delivery_date: string | null; supplier_delivery_date: string | null; invoice_no: string | null; invoice_ex: number | null; invoice_gst: number | null; invoice_due: string | null; invoice_file_id: string | null; invoice_source: string | null; paid_at: string | null; paid_by_name: string | null; material_order_items: { description: string; group_label: string | null; quantity: number; unit: string; unit_cost: number; length_m: number | null }[] };
  const os = ((orders ?? []) as unknown as O[]).filter((o) => o.material_order_items?.length);
  const delivered = os.some((o) => o.status === "delivered");
  const lastDay = job.scheduled_end ? today >= job.scheduled_end : Boolean(job.completed_at);
  const total = contract ?? 0;
  const qplan = estimatePlan(est as EstPlan | null);
  const rows = total > 0 ? paymentRows(qplan, total, invs, { delivered, completed: lastDay || job.stage === "completed" }) : [];
  const other = otherPlanInvoices(qplan, invs);

  const invoiceDocs: BuildData["invoiceDocs"] = {};
  const deliveries: BuildDelivery[] = os.map((o) => {
    const invTotal = o.invoice_ex !== null ? round2(Number(o.invoice_ex) + Number(o.invoice_gst ?? 0)) : null;
    if (o.invoice_file_id) {
      invoiceDocs[o.invoice_file_id] = o.paid_at
        ? { meta: `${invTotal !== null ? `${aud(invTotal)} · ` : ""}paid ${dayTime(o.paid_at, tz)}`, paid: true }
        : { meta: `${invTotal !== null ? `${aud(invTotal)} · ` : ""}${o.invoice_source === "gmail" ? "from Gmail · " : ""}${o.invoice_due ? `due ${shortDay(o.invoice_due)} · ` : ""}not paid`, paid: false };
    }
    return {
      id: o.id, supplier: o.supplier, branch: o.branch, what: whatText(o.material_order_items), status: o.status,
      deliveredAt: o.delivered_at, deliveryDate: o.delivery_date, supplierDate: o.supplier_delivery_date, cost: orderTotal(o.material_order_items),
      invoice: o.invoice_file_id || o.invoice_no ? { fileId: o.invoice_file_id, no: o.invoice_no, total: invTotal, due: o.invoice_due, source: o.invoice_source } : null,
      paidAt: o.paid_at, paidBy: o.paid_by_name,
    };
  });
  return { rows, otherPlan: { count: other.length, paid: round2(other.reduce((a, i) => a + i.paid, 0)) }, contract: total, paid: round2(invs.reduce((a, i) => a + i.paid, 0)), quoteNo: (est as EstPlan | null)?.number ?? null, deliveries, lastDay, invoiceDocs };
}

/** The email (and text) the customer gets for the next payment, exactly as it will go (preview, and the real send). */
export async function paymentRequestPreview(supabase: SupabaseClient, org: Organization, jobId: string) {
  const ctx = await loadPlanContext(supabase, org, jobId);
  if (!ctx?.contract) return null;
  const { data: job } = await supabase.from("jobs").select("state, scheduled_end, completed_at, stage").eq("id", jobId).single();
  const build = await loadBuild(supabase, org, jobId, job as never, ctx.contract.total);
  const row = build.rows.find((r) => r.state === "next" || r.state === "asked");
  if (!row) return null;
  const deliveredOn = build.deliveries.map((d) => d.deliveredAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  const paidSoFar = build.paid;
  const after = build.rows.slice(build.rows.indexOf(row) + 1).reduce((a, r) => a + r.amount, 0);
  const input = {
    orgId: org.id, orgName: org.name, orgPhone: org.phone, jobId, customerId: null,
    customerName: ctx.job.customer.name, email: ctx.job.customer.email, phone: ctx.job.customer.phone,
    label: row.label, amount: row.amount, dueDate: row.invoice?.due_date && row.state === "asked" ? row.invoice.due_date : null,
    invoiceToken: row.invoice ? (await supabase.from("invoices").select("public_token").eq("id", row.invoice.id).single()).data?.public_token ?? "your-invoice" : "your-invoice", jobToken: ctx.job.public_token,
    methods: effectiveMethods(ctx.job.pay_methods, Boolean(org.stripe_account_id && org.stripe_charges_enabled)), when: "due",
    reason: row.state === "asked" ? `A reminder that the ${row.label.toLowerCase()} payment in your quote is due.` : dueReason(row.trigger, row.label, { deliveredOn, finishedOn: job?.scheduled_end ?? null }),
    detail: `${row.label}${row.pct < 100 ? ` · ${row.pct}% of ${aud(build.contract)}` : ""}${row.extra > 0 ? ` + ${aud(row.extra)} extra work` : ""}`,
    footnote: [paidSoFar > 0 ? `${aud(paidSoFar)} already paid` : null, after > 0 ? `${aud(after)} still to come` : null].filter(Boolean).join(" · ") || undefined,
  } satisfies PartMessage;
  const msg = { ...partMessage(input), input };
  return { row, msg, ctx, to: ctx.job.customer, asked: row.state === "asked", today: ctx.today, build };
}

/** One supplier's order for the Pay panel: its invoice (as read or added), the order to check it against, saved bank details. */
export async function loadSupplierPay(supabase: SupabaseClient, orderId: string) {
  const { data: o } = await supabase.from("material_orders")
    .select("id, supplier, branch, po_number, paid_at, invoice_no, invoice_date, invoice_due, invoice_ex, invoice_gst, invoice_abn, invoice_source, invoice_file_id, bank_name, bank_bsb, bank_account, org_suppliers(abn, bank_name, bank_bsb, bank_account, branch_email), material_order_items(quantity, unit, unit_cost, length_m), job_files!material_orders_invoice_file_id_fkey(caption, storage_path)")
    .eq("id", orderId).maybeSingle();
  if (!o) return null;
  const os = one(o.org_suppliers as unknown as { abn: string | null; bank_name: string | null; bank_bsb: string | null; bank_account: string | null; branch_email: string | null });
  const f = one(o.job_files as unknown as { caption: string | null; storage_path: string });
  const url = f ? (await supabase.storage.from("job-files").createSignedUrl(f.storage_path, 3600)).data?.signedUrl ?? null : null;
  const items = (o.material_order_items ?? []) as { quantity: number; unit: string; unit_cost: number; length_m: number | null }[];
  return {
    id: o.id, supplier: o.supplier, branch: o.branch, code: o.po_number, paid: Boolean(o.paid_at), items: items.length, cost: orderTotal(items),
    read: o.invoice_ex !== null && o.invoice_source !== null,
    inv: {
      fileName: f?.caption ?? null, fileUrl: url, source: o.invoice_source, from: os?.branch_email ?? null,
      no: o.invoice_no, date: o.invoice_date, due: o.invoice_due, ex: o.invoice_ex === null ? null : Number(o.invoice_ex), gst: o.invoice_gst === null ? null : Number(o.invoice_gst),
      abn: o.invoice_abn ?? os?.abn ?? null, bankName: o.bank_name ?? os?.bank_name ?? null, bsb: o.bank_bsb ?? os?.bank_bsb ?? null, account: o.bank_account ?? os?.bank_account ?? null,
    },
  };
}
