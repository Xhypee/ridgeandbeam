import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money, siteUrl, STATUS_TONE } from "@/lib/format";
import { PAYMENT_METHODS, type CatalogItem, type Item } from "@/lib/types";
import { BILL_TO, BILL_TO_LABEL, INVOICE_KIND_LABEL, INVOICE_KIND_TONE, INVOICE_KINDS, TRIGGER_LABEL, type BillTo, type InvoiceKind } from "@/lib/claims-billing";
import { addPayment, deleteInvoice, deletePayment, setInvoiceStatus, updateInvoiceBilling } from "../actions";
import { InvoiceEditor } from "./invoice-editor";

export default async function InvoicePage({ params }: PageProps<"/app/invoices/[id]">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const [{ data: v }, { data: catalog }, { data: tot }] = await Promise.all([
    supabase.from("invoices").select("*, invoice_items(*), payments(*), jobs(id, title, customers(name, email))").eq("id", id).maybeSingle(),
    supabase.from("catalog_items").select("*").order("category").order("name"),
    supabase.from("invoice_totals").select("*").eq("invoice_id", id).maybeSingle(),
  ]);
  if (!v) notFound();
  const status = v.status as string;
  const items = ((v.invoice_items ?? []) as (Item & { position: number })[]).sort((a, b) => a.position - b.position);
  const payments = ((v.payments ?? []) as { id: string; amount: number; method: string; paid_on: string; reference: string | null }[]).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  const job = v.jobs as { id: string; title: string; customers: { name: string; email: string | null } };
  const publicUrl = `${siteUrl()}/i/${v.public_token}`;
  const balance = Number(tot?.balance ?? 0);
  const kind = (v.kind ?? "standard") as InvoiceKind;
  const billTo = (v.bill_to ?? "homeowner") as BillTo;
  const overdue = v.due_date && v.due_date < isoDate(new Date()) && ["sent", "partial"].includes(status);

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
          <span className="flex items-center gap-3">
            Invoice #{v.number} <Badge tone={STATUS_TONE[status]}>{label(status)}</Badge>
            {overdue && <Badge tone="red">Overdue</Badge>}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/app/jobs/${job.id}`} className="font-medium text-slate-700 hover:text-brand-600">{job.title}</Link> · {job.customers.name}
            <Badge tone={INVOICE_KIND_TONE[kind]}>{v.milestone_label || INVOICE_KIND_LABEL[kind]}</Badge>
            <span>Bill to {BILL_TO_LABEL[billTo]}</span>
          </span>
        }
        actions={
          <>
            {status === "draft" && statusBtn("sent", "Mark as sent", "primary")}
            {status !== "draft" && status !== "void" && <CopyLink url={publicUrl} />}
            {status !== "draft" && status !== "void" && <LinkButton variant="secondary" href={`/i/${v.public_token}`} target="_blank">Customer view</LinkButton>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceEditor
            id={v.id}
            locked={status === "void"}
            catalog={(catalog ?? []) as CatalogItem[]}
            paid={Number(tot?.paid ?? 0)}
            initial={{ items, issue_date: v.issue_date, due_date: v.due_date, tax_rate: v.tax_rate, discount: v.discount, notes: v.notes, terms: v.terms }}
          />
        </div>
        <div className="space-y-6">
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
                      <p className="font-medium tabular-nums">{money(p.amount)} <span className="font-normal text-slate-500">· {label(p.method)}</span></p>
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
                  <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" defaultValue={balance.toFixed(2)} required /></Field>
                  <Field label="Date"><Input name="paid_on" type="date" defaultValue={isoDate(new Date())} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Method">
                    <Select name="method" defaultValue="check">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select>
                  </Field>
                  <Field label="Reference"><Input name="reference" placeholder="Check #" /></Field>
                </div>
                <SubmitButton variant="secondary" className="w-full">Record payment</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card title="Billing details">
            <ActionForm action={updateInvoiceBilling} className="space-y-3">
              <input type="hidden" name="id" value={v.id} />
              <Field label="Bill to">
                <Select name="bill_to" defaultValue={billTo}>{BILL_TO.map((b) => <option key={b} value={b}>{BILL_TO_LABEL[b]}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kind">
                  <Select name="kind" defaultValue={kind}>{INVOICE_KINDS.map((k) => <option key={k} value={k}>{INVOICE_KIND_LABEL[k]}</option>)}</Select>
                </Field>
                <Field label="Milestone"><Input name="milestone_label" defaultValue={v.milestone_label ?? ""} placeholder="e.g. Deposit" /></Field>
              </div>
              {v.milestone_trigger && <p className="text-xs text-slate-500">{TRIGGER_LABEL[v.milestone_trigger] ?? v.milestone_trigger}</p>}
              <SubmitButton variant="secondary" className="w-full">Save billing details</SubmitButton>
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
