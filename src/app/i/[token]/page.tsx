import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/document-view";
import { PrintButton } from "@/components/print-button";
import { money } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { cardFee, stripeConfigured } from "@/lib/stripe";
import type { PublicDocument } from "@/lib/types";
import { monthlyPayment } from "@/app/app/settings/payments/finance-math";
import { payInvoice } from "./actions";
import { PayButtons } from "./pay-buttons";
import type { PayInfo } from "./pay-info";

export const metadata: Metadata = { title: "Your invoice", robots: { index: false } };

export default async function PublicInvoice({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const db = anonClient();
  const [{ data }, { data: payData }] = await Promise.all([
    db.rpc("get_public_document", { p_kind: "invoice", p_token: token }),
    db.rpc("get_public_invoice_pay", { p_token: token }),
  ]);
  if (!data) notFound();
  const doc = data as PublicDocument;
  const pay = payData as PayInfo | null;
  const balance = Number(pay?.balance ?? 0);
  const online = Boolean(pay?.online_ready) && stripeConfigured() && balance > 0;
  const fin = pay?.financing;
  const lenders = fin?.enabled ? (fin.lenders ?? []).filter((l) => l.url?.startsWith("https://")) : [];

  let card = { total: money(balance), note: "" };
  let ach: { total: string; note: string } | null = null;
  if (pay && online) {
    const fee = cardFee(balance, Number(pay.card_fee_pct));
    card = pay.pass_card_fee
      ? { total: money(balance + fee), note: `Includes a ${Number(pay.card_fee_pct)}% card processing fee of ${money(fee)}` }
      : { total: money(balance), note: "No card fee for you" };
    if (pay.ach_enabled) ach = { total: money(balance), note: `No fee for you · usually clears in 3–5 business days` };
  }

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4 sm:px-0"><PrintButton /></div>
      <DocumentView doc={doc} />
      <section className="no-print mx-auto mt-6 max-w-3xl space-y-4 px-4 sm:px-0" data-pay-section>
        {doc.status === "paid" || balance <= 0 ? (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Paid in full. Thank you for your business!</p>
        ) : (
          <>
            {sp.paid === "1" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800" role="status">Thank you! Your payment is processing. This page updates once it clears (bank transfers take a few days).</p>}
            {online ? (
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
                <h2 className="text-base font-semibold text-slate-900">Pay online</h2>
                <p className="mb-3 text-sm text-slate-600">Balance due: <b>{money(balance)}</b>. You&apos;ll finish on Stripe&apos;s secure checkout page.</p>
                <PayButtons token={token} action={payInvoice} card={card} ach={ach} />
              </div>
            ) : (
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-pay-instructions>
                <h2 className="text-base font-semibold text-slate-900">How to pay</h2>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  <li><b>By check:</b> make it payable to <b>{doc.org.name}</b>{doc.org.address ? <> and mail it to {doc.org.address}</> : null}. Write invoice #{doc.number} on the memo line.</li>
                  <li><b>By bank transfer (ACH):</b> contact {doc.org.name}{doc.org.phone ? ` at ${doc.org.phone}` : ""}{doc.org.email ? ` or ${doc.org.email}` : ""} for transfer details. Always confirm bank details by phone before sending money.</li>
                </ul>
              </div>
            )}
            {lenders.length > 0 && (
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
                <h2 className="text-base font-semibold text-slate-900">Prefer monthly payments?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  About <b>{money(monthlyPayment(balance, Number(fin!.apr), Number(fin!.term_months)))}/month</b> for {fin!.term_months} months at {Number(fin!.apr)}% APR — an example only; your rate depends on credit approval.
                  Checking your rate won&apos;t affect your credit score with most lenders.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lenders.map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Check my rate with {l.name} ↗</a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
