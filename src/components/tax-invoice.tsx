import { formatAbn } from "@/lib/au";
import { date, money } from "@/lib/format";
import { invoiceGstTotals, TAX_INVOICE_BUYER_THRESHOLD } from "@/lib/invoice-gst";

export type TaxInvoiceDoc = {
  number: number;
  status: string;
  issue_date: string;
  due_date: string | null;
  milestone_label?: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate: number;
  discount: number;
  amounts_include_gst: boolean;
  seller: { name: string; abn: string | null; gst_registered: boolean; phone: string | null; email: string | null; address: string | null };
  buyer: { name: string | null; abn: string | null; address: string | null; email?: string | null; phone?: string | null };
  job: { title: string; site_address: string | null };
  items: { description: string; quantity: number; unit: string; unit_price: number }[];
  paid: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ATO-compliant tax invoice (or plain "Invoice" when the seller isn't registered for GST):
 * "Tax invoice" title, seller name + ABN, issue date, description/quantity/price of each line, GST amount,
 * total including GST, and the buyer's identity/ABN (always shown; required from $1,000).
 */
export function TaxInvoice({ doc }: { doc: TaxInvoiceDoc }) {
  const gst = doc.seller.gst_registered && Number(doc.tax_rate) > 0;
  const t = invoiceGstTotals(doc.items, doc.discount, gst ? doc.tax_rate : 0, doc.amounts_include_gst);
  const title = doc.seller.gst_registered ? "Tax invoice" : "Invoice";
  const balance = r2(t.total - Number(doc.paid || 0));
  return (
    <article className="mx-auto max-w-3xl bg-white p-5 ring-1 ring-slate-200 sm:rounded-2xl sm:p-10 print:p-0 print:ring-0" data-testid="tax-invoice">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold text-ink">{doc.seller.name}</p>
          <div className="mt-1 space-y-0.5 text-sm text-slate-600">
            {doc.seller.abn && <p data-testid="seller-abn">ABN {formatAbn(doc.seller.abn)}</p>}
            {doc.seller.address && <p>{doc.seller.address}</p>}
            <p className="break-words">{[doc.seller.phone, doc.seller.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-brand-600" data-testid="invoice-title">{title}</h1>
          <p className="text-sm text-slate-700">No. {doc.number}{doc.milestone_label ? ` · ${doc.milestone_label}` : ""}</p>
          <p className="text-sm text-slate-600">Issued {date(doc.issue_date, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
          {doc.due_date && <p className="text-sm text-slate-600">Due {date(doc.due_date, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>}
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Bill to</p>
          <p className="mt-1 font-medium text-slate-900" data-testid="buyer-name">{doc.buyer.name ?? "—"}</p>
          {doc.buyer.abn && <p className="text-sm text-slate-600">ABN {formatAbn(doc.buyer.abn)}</p>}
          {doc.buyer.address && <p className="text-sm text-slate-600">{doc.buyer.address}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Job</p>
          <p className="mt-1 font-medium text-slate-900">{doc.job.title}</p>
          {doc.job.site_address && <p className="text-sm text-slate-600">{doc.job.site_address}</p>}
        </div>
      </section>

      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="w-1/2 py-2 font-medium sm:w-auto">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">{doc.amounts_include_gst && gst ? "Price inc GST" : "Price"}</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {doc.items.map((it, i) => (
            <tr key={i}>
              <td className="break-words py-2.5 pr-3 text-slate-800">{it.description}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-600">{Number(it.quantity)} {it.unit}</td>
              <td className="hidden py-2.5 text-right tabular-nums text-slate-600 sm:table-cell">{money(it.unit_price)}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-900">{money(r2(Number(it.quantity) * Number(it.unit_price)))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-col items-end gap-1 text-sm" data-testid="invoice-totals">
        {t.discount > 0 && <div className="flex w-full max-w-72 justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">−{money(t.discount)}</span></div>}
        {gst && !doc.amounts_include_gst && (
          <>
            <div className="flex w-full max-w-72 justify-between"><span className="text-slate-500">Subtotal (ex GST)</span><span className="tabular-nums">{money(t.exGst)}</span></div>
            <div className="flex w-full max-w-72 justify-between"><span className="text-slate-500">GST</span><span className="tabular-nums">{money(t.gst)}</span></div>
          </>
        )}
        <div className="flex w-full max-w-72 justify-between border-t border-slate-200 pt-2 text-base font-semibold">
          <span>{gst ? "Total inc GST" : "Total"}</span><span className="tabular-nums">{money(t.total)}</span>
        </div>
        {gst && doc.amounts_include_gst && <p className="text-slate-600" data-testid="gst-line">Includes GST of {money(t.gst)}</p>}
        {!doc.seller.gst_registered && <p className="text-slate-600">No GST has been charged.</p>}
        {Number(doc.paid) > 0 && <div className="flex w-full max-w-72 justify-between text-slate-500"><span>Paid</span><span className="tabular-nums">−{money(doc.paid)}</span></div>}
        <div className="flex w-full max-w-72 justify-between text-base font-semibold text-brand-700"><span>Balance due</span><span className="tabular-nums">{money(balance)}</span></div>
      </div>

      {gst && t.total >= TAX_INVOICE_BUYER_THRESHOLD && !doc.buyer.name && !doc.buyer.abn && (
        <p className="no-print mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Tax invoices of $1,000 or more must show the buyer&apos;s name or ABN.</p>
      )}

      {(doc.notes || doc.terms) && (
        <section className="mt-8 grid gap-6 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
          {doc.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p><p className="whitespace-pre-wrap text-slate-700">{doc.notes}</p></div>}
          {doc.terms && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Terms</p><p className="whitespace-pre-wrap text-slate-700">{doc.terms}</p></div>}
        </section>
      )}
    </article>
  );
}
