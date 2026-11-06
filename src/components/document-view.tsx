import { money, date } from "@/lib/format";
import { round2, totals } from "@/lib/roof";
import type { PublicDocument } from "@/lib/types";

/** Printable customer-facing estimate / invoice. */
export function DocumentView({ doc }: { doc: PublicDocument }) {
  const t = totals(doc.items, doc.discount, doc.tax_rate);
  const isInvoice = doc.kind === "invoice";
  const paid = Number(doc.paid ?? 0);
  return (
    <article className="mx-auto max-w-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:rounded-2xl sm:p-10 print:p-0 print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xl font-semibold text-slate-900">{doc.org.name}</p>
          <div className="mt-1 space-y-0.5 text-sm text-slate-500">
            {doc.org.address && <p>{doc.org.address}</p>}
            <p>{[doc.org.phone, doc.org.email].filter(Boolean).join(" · ")}</p>
            {doc.org.license_number && <p>License #{doc.org.license_number}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold uppercase tracking-wide text-brand-600">{isInvoice ? "Invoice" : "Estimate"}</p>
          <p className="text-sm text-slate-600">#{doc.number}</p>
          <p className="text-sm text-slate-500">{date(isInvoice ? doc.issue_date : doc.created_at)}</p>
          {isInvoice && doc.due_date && <p className="text-sm text-slate-500">Due {date(doc.due_date)}</p>}
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prepared for</p>
          <p className="mt-1 font-medium text-slate-900">{doc.customer.name}</p>
          {doc.customer.address && <p className="text-sm text-slate-600">{doc.customer.address}</p>}
          <p className="text-sm text-slate-600">{[doc.customer.phone, doc.customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Project</p>
          <p className="mt-1 font-medium text-slate-900">{doc.job.title}</p>
          {doc.job.site_address && <p className="text-sm text-slate-600">{doc.job.site_address}</p>}
        </div>
      </section>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Rate</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {doc.items.map((it, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3 text-slate-800">{it.description}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-600">{Number(it.quantity)} {it.unit}</td>
              <td className="hidden py-2.5 text-right tabular-nums text-slate-600 sm:table-cell">{money(it.unit_price)}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-900">{money(round2(Number(it.quantity) * Number(it.unit_price)))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-col items-end gap-1 text-sm">
        <div className="flex w-60 justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(t.subtotal)}</span></div>
        {t.discount > 0 && <div className="flex w-60 justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">−{money(t.discount)}</span></div>}
        {t.tax > 0 && <div className="flex w-60 justify-between"><span className="text-slate-500">Tax ({Number(doc.tax_rate)}%)</span><span className="tabular-nums">{money(t.tax)}</span></div>}
        <div className="flex w-60 justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
        {isInvoice && paid > 0 && <div className="flex w-60 justify-between text-slate-500"><span>Paid</span><span className="tabular-nums">−{money(paid)}</span></div>}
        {isInvoice && <div className="flex w-60 justify-between text-base font-semibold text-brand-700"><span>Balance due</span><span className="tabular-nums">{money(round2(t.total - paid))}</span></div>}
      </div>

      {(doc.notes || doc.terms) && (
        <section className="mt-8 grid gap-6 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
          {doc.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p><p className="whitespace-pre-wrap text-slate-700">{doc.notes}</p></div>}
          {doc.terms && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Terms</p><p className="whitespace-pre-wrap text-slate-700">{doc.terms}</p></div>}
        </section>
      )}

      {doc.kind === "estimate" && doc.status === "accepted" && (
        <p className="mt-8 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          Accepted{doc.accepted_name ? ` by ${doc.accepted_name}` : ""}{doc.accepted_at ? ` on ${date(doc.accepted_at)}` : ""}.
        </p>
      )}
    </article>
  );
}
