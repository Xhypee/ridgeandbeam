import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { QuoteBusiness } from "@/components/quote-business";
import { date, money } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { round2 } from "@/lib/roof";
import { AcceptForm, OptionCards } from "./accept-form";
import { DownloadPdfButton } from "./download-button";
import { auAddress, buildProposal, type PublicEstimate } from "./model";

export const metadata: Metadata = { title: "Your quote", robots: { index: false } };

const UNIT: Record<string, string> = { m2: "m²" };
const unit = (u: string) => UNIT[u] ?? u;

export default async function PublicEstimatePage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_estimate", { p_token: token });
  if (!data) notFound();
  const doc = data as PublicEstimate;
  const p = buildProposal(doc);
  const word = doc.option_label === "alternates" ? "alternate" : "option";
  const hasOptions = p.options.length > 0;
  const accepted = doc.status === "accepted";
  const chosen = p.options.find((o) => o.id === doc.selected_option_id) ?? null;
  const financingNote = doc.financing?.enabled
    ? `Estimated monthly repayment at ${Number(doc.financing.apr)}% p.a. over ${doc.financing.term_months} months, subject to the lender's approval. Not a loan offer.`
    : null;
  const total = chosen ? chosen.total : p.totals.total;
  const gstCharged = Number(doc.tax_rate) > 0;
  const customerAddress = auAddress(doc.customer);
  const orgAddress = [doc.org.address, [doc.org.state, doc.org.postcode].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const licences = p.state && doc.org.licence ? { [p.state]: doc.org.licence } : {};

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-4xl justify-end"><PrintButton /></div>

      <article className="mx-auto max-w-4xl space-y-8 bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:rounded-2xl sm:p-10 print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <QuoteBusiness name={doc.org.name} abn={doc.org.abn} licences={licences} state={p.state} gstRegistered={doc.org.gst_registered} />
            <div className="mt-0.5 space-y-0.5 text-sm text-slate-500">
              {orgAddress && <p>{orgAddress}</p>}
              <p>{[doc.org.phone, doc.org.email, doc.org.website].filter(Boolean).join(" · ")}</p>
              {doc.org.insurance_certificate_url && <p><a className="text-brand-600 underline" href={doc.org.insurance_certificate_url} target="_blank" rel="noreferrer">Certificate of insurance</a></p>}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold uppercase tracking-wide text-brand-600">{hasOptions && !accepted ? "Proposal" : "Quote"}</p>
            <p className="text-sm text-slate-600">#{doc.number}</p>
            <p className="text-sm text-slate-500">{date(doc.sent_at ?? doc.created_at)}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prepared for</p>
            <p className="mt-1 font-medium text-slate-900">{doc.customer.name}</p>
            {customerAddress && <p className="text-sm text-slate-600">{customerAddress}</p>}
            <p className="text-sm text-slate-600">{[doc.customer.phone, doc.customer.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Job</p>
            <p className="mt-1 font-medium text-slate-900">{doc.job.title}</p>
            {doc.job.site_address && <p className="text-sm text-slate-600">{doc.job.site_address}</p>}
          </div>
        </section>

        {hasOptions ? (
          <>
            {p.shared.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Included with every {word}</h2>
                <ul className="grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
                  {p.shared.map((i, k) => (
                    <li key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                      <span>{i.description}</span><span className="shrink-0 tabular-nums text-slate-500">{Number(i.quantity)} {unit(i.unit)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {accepted ? (
              chosen && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your choice</h2>
                  <OptionCards options={[chosen]} selected={chosen.id} word={word} financingNote={financingNote} gstCharged={gstCharged} />
                </section>
              )
            ) : doc.status !== "sent" ? (
              <OptionCards options={p.options} selected={null} word={word} financingNote={financingNote} gstCharged={gstCharged} />
            ) : null}
            <p className="text-xs text-slate-500" data-testid="price-basis">
              All prices are in Australian dollars{gstCharged ? " and include GST" : ""}{doc.discount > 0 ? `, after a ${money(doc.discount)} discount` : ""}.
            </p>
          </>
        ) : (
          <section>
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
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{Number(it.quantity)} {unit(it.unit)}</td>
                    <td className="hidden py-2.5 text-right tabular-nums text-slate-600 sm:table-cell">{money(it.unit_price)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-900">{money(round2(Number(it.quantity) * Number(it.unit_price)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              {p.totals.discount > 0 && <div className="flex w-64 justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(p.totals.subtotal)}</span></div>}
              {p.totals.discount > 0 && <div className="flex w-64 justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">−{money(p.totals.discount)}</span></div>}
              {gstCharged && !doc.gst_inclusive && <div className="flex w-64 justify-between"><span className="text-slate-500">GST</span><span className="tabular-nums">{money(p.totals.gst)}</span></div>}
              <div className="flex w-64 justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total{gstCharged ? " (inc GST)" : ""}</span><span className="tabular-nums" data-testid="public-total">{money(p.totals.total)}</span></div>
              {gstCharged && <div className="text-xs text-slate-600" data-testid="public-gst">Includes GST of {money(p.totals.gst)}</div>}
              {p.monthly > 0 && <div className="text-sm font-medium text-brand-700">about {money(p.monthly)} per month*</div>}
              {p.monthly > 0 && financingNote && <p className="max-w-xs text-right text-xs text-slate-500">* {financingNote}</p>}
            </div>
          </section>
        )}

        {(doc.notes || doc.terms) && (
          <section className="grid gap-6 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
            {doc.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Scope & notes</p><p className="whitespace-pre-wrap text-slate-700">{doc.notes}</p></div>}
            {doc.terms && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Terms</p><p className="whitespace-pre-wrap text-slate-700">{doc.terms}</p></div>}
          </section>
        )}

        {p.notices.length > 0 && (
          <section className="space-y-3 border-t border-slate-200 pt-6" data-testid="legal-notices">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Important notices</p>
            {p.notices.map((n) => (
              <div key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm print:bg-white print:ring-1 print:ring-slate-300">
                <p className="font-semibold text-slate-900">{n.title}</p>
                <p className={n.conspicuous ? "mt-1 font-bold text-slate-900" : "mt-1 text-slate-700"}>{n.text}</p>
                {n.citation && <p className="mt-1 text-xs text-slate-500">{n.citation}</p>}
              </div>
            ))}
          </section>
        )}

        {accepted && (
          <section className="rounded-xl bg-green-50 p-5 ring-1 ring-green-200 print:bg-white" data-testid="receipt">
            <h2 className="text-lg font-semibold text-green-900">Signed and accepted</h2>
            <p className="mt-1 text-sm text-green-900">
              {chosen ? <><b>{chosen.name}</b> · </> : null}<b>{money(total)}</b>{gstCharged ? " inc GST" : ""} · accepted by <b>{doc.accepted_name}</b>{doc.accepted_at ? ` on ${date(doc.accepted_at, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}.
            </p>
            {doc.signature_data && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.signature_data} alt={`Signature of ${doc.accepted_name ?? "customer"}`} className="mt-3 h-24 max-w-full rounded-lg bg-white p-2 ring-1 ring-green-200" />
            )}
          </section>
        )}
      </article>

      {doc.status === "sent" && (
        <div className="mx-auto mt-6 max-w-4xl">
          <AcceptForm token={token} orgName={doc.org.name} options={p.options} word={word} total={p.totals.total} financingNote={financingNote} gstCharged={gstCharged} />
        </div>
      )}
      {accepted && (
        <section className="no-print mx-auto mt-6 max-w-4xl rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Thank you{doc.accepted_name ? `, ${doc.accepted_name.split(" ")[0]}` : ""}!</h2>
          <p className="mt-1 text-sm text-slate-600">Your acceptance has been recorded. {doc.org.name} will be in touch to book your job. Keep a copy for your records.</p>
          <div className="mt-4"><DownloadPdfButton /></div>
        </section>
      )}
      {doc.status === "declined" && (
        <p className="no-print mx-auto mt-6 max-w-4xl rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">This quote was declined. Contact {doc.org.name} if you&apos;d like a revised quote.</p>
      )}
    </main>
  );
}
