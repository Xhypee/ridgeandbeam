import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money, siteUrl, STATUS_TONE } from "@/lib/format";
import type { CatalogItem, Item } from "@/lib/types";
import { BILL_TO, BILL_TO_LABEL, INVOICE_KIND_LABEL, INVOICE_KIND_TONE, INVOICE_KINDS, TRIGGER_LABEL, type BillTo, type InvoiceKind } from "@/lib/claims-billing";
import { invoiceGstTotals, taxInvoiceCheck } from "@/lib/invoice-gst";
import { AU_PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payments-au";
import { addPayment, deleteInvoice, deletePayment, sendInvoice, setInvoiceStatus, updateInvoiceBilling } from "../actions";
import { InvoiceEditor } from "./invoice-editor";

export default async function InvoicePage({ params }: PageProps<"/app/invoices/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const [{ data: v }, { data: catalog }, { data: tot }] = await Promise.all([
    supabase.from("invoices").select("*, invoice_items(*), payments(*), jobs(id, title, customers(name, email, address, city, state, zip))").eq("id", id).maybeSingle(),
    supabase.from("catalog_items").select("*").order("category").order("name"),
    supabase.from("invoice_totals").select("*").eq("invoice_id", id).maybeSingle(),
  ]);
  if (!v) notFound();
  const status = v.status as string;
  const items = ((v.invoice_items ?? []) as (Item & { position: number })[]).sort((a, b) => a.position - b.position);
  const payments = ((v.payments ?? []) as { id: string; amount: number; method: string; paid_on: string; reference: string | null }[]).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  type Cust = { name: string; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
  const job = v.jobs as { id: string; title: string; customers: Cust };
  const c = job.customers;
  const customerAddress = [c.address, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const publicUrl = `${siteUrl()}/i/${v.public_token}`;
  const balance = Number(tot?.balance ?? 0);
  const kind = (v.kind ?? "standard") as InvoiceKind;
  const billTo = (v.bill_to ?? "homeowner") as BillTo;
  const overdue = v.due_date && v.due_date < isoDate(new Date()) && ["sent", "partial"].includes(status);
  const gstRegistered = org.gst_registered !== false;
  const t = invoiceGstTotals(items, v.discount, v.tax_rate, v.amounts_include_gst);
  const check = taxInvoiceCheck({ gstRegistered, sellerName: org.name, sellerAbn: org.abn, total: t.total, buyerName: v.buyer_name ?? c.name, buyerAbn: v.buyer_abn, itemCount: items.length });

  const statusBtn = (s: string, text: string, variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", confirm?: string) => (
    <form action={setInvoiceStatus}>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton variant={variant} confirm={confirm}>{text}</SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {check.title} #{v.number} <Badge tone={STATUS_TONE[status]}>{label(status)}</Badge>
            {overdue && <Badge tone="red">Overdue</Badge>}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/app/jobs/${job.id}`} className="font-medium text-slate-700 hover:text-brand-600">{job.title}</Link> · {c.name}
            <Badge tone={INVOICE_KIND_TONE[kind]}>{v.milestone_label || INVOICE_KIND_LABEL[kind]}</Badge>
            <span>Bill to {BILL_TO_LABEL[billTo]}</span>
          </span>
        }
        actions={
          <>
            {status === "draft" && (
              <ActionForm action={sendInvoice}>
                <input type="hidden" name="id" value={v.id} />
                <SubmitButton className="min-h-11">Issue {check.title.toLowerCase()}</SubmitButton>
              </ActionForm>
            )}
            {status !== "draft" && status !== "void" && <CopyLink url={publicUrl} />}
            {status !== "draft" && status !== "void" && <LinkButton variant="secondary" href={`/i/${v.public_token}`} target="_blank">Customer view</LinkButton>}
          </>
        }
      />

      {status === "draft" && check.problems.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="tax-invoice-problems">
          <p className="font-semibold">Before you issue this {check.title.toLowerCase()}:</p>
          <ul className="mt-1 list-disc pl-5">{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <InvoiceEditor
            id={v.id}
            locked={status === "void"}
            catalog={(catalog ?? []) as CatalogItem[]}
            paid={Number(tot?.paid ?? 0)}
            gstRegistered={gstRegistered}
            customerName={c.name}
            customerAddress={customerAddress}
            initial={{
              items, issue_date: v.issue_date, due_date: v.due_date, tax_rate: v.tax_rate, discount: v.discount, amounts_include_gst: v.amounts_include_gst,
              notes: v.notes, terms: v.terms, buyer_name: v.buyer_name, buyer_abn: v.buyer_abn, buyer_address: v.buyer_address,
            }}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <Card title="Payments">
            <dl className="mb-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Paid</dt><dd className="font-semibold tabular-nums">{money(tot?.paid)}</dd></div>
              <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Balance</dt><dd className="font-semibold tabular-nums">{money(balance)}</dd></div>
            </dl>
            {payments.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium tabular-nums">{money(p.amount)} <span className="font-normal text-slate-500">· {PAYMENT_METHOD_LABEL[p.method] ?? label(p.method)}</span></p>
                      <p className="text-xs text-slate-500">{date(p.paid_on)}{p.reference ? ` · ${p.reference}` : ""}</p>
                    </div>
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton variant="ghost" confirm="Delete this payment?">✕</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {status !== "void" && balance > 0 && (
              <ActionForm action={addPayment} className="space-y-3">
                <input type="hidden" name="invoice_id" value={v.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" defaultValue={balance.toFixed(2)} required /></Field>
                  <Field label="Date"><Input name="paid_on" type="date" defaultValue={isoDate(new Date())} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Method">
                    <Select name="method" defaultValue="bank_transfer">{AU_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select>
                  </Field>
                  <Field label="Reference"><Input name="reference" placeholder="Bank ref / receipt no." /></Field>
                </div>
                <SubmitButton variant="secondary" className="min-h-11 w-full">Record payment</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card title="Billing details">
            <ActionForm action={updateInvoiceBilling} className="space-y-3">
              <input type="hidden" name="id" value={v.id} />
              <Field label="Bill to">
                <Select name="bill_to" defaultValue={billTo === "mortgagee" ? "other" : billTo}>{BILL_TO.map((b) => <option key={b} value={b}>{BILL_TO_LABEL[b]}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kind">
                  <Select name="kind" defaultValue={kind}>{INVOICE_KINDS.map((k) => <option key={k} value={k}>{INVOICE_KIND_LABEL[k]}</option>)}</Select>
                </Field>
                <Field label="Milestone"><Input name="milestone_label" defaultValue={v.milestone_label ?? ""} placeholder="e.g. Deposit" /></Field>
              </div>
              {v.milestone_trigger && <p className="text-xs text-slate-500">{TRIGGER_LABEL[v.milestone_trigger] ?? v.milestone_trigger}</p>}
              <SubmitButton variant="secondary" className="min-h-11 w-full">Save billing details</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="More">
            <div className="flex flex-wrap gap-2">
              {status === "sent" && statusBtn("draft", "Revert to draft", "ghost")}
              {status !== "void" && statusBtn("void", "Void invoice", "danger", "Void this invoice? It will be hidden from the customer link.")}
              {status === "void" && statusBtn("draft", "Un-void (back to draft)", "ghost")}
              {payments.length === 0 && (
                <form action={deleteInvoice}>
                  <input type="hidden" name="id" value={v.id} />
                  <SubmitButton variant="danger" confirm="Delete this invoice?">Delete</SubmitButton>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
