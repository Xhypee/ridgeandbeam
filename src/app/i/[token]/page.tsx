import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClaimExplainer } from "@/components/claim-explainer";
import { PrintButton } from "@/components/print-button";
import { TaxInvoice } from "@/components/tax-invoice";
import { formatAbn } from "@/lib/au";
import { money } from "@/lib/format";
import { bankReference, FINANCE_HOMEOWNER_NOTE, formatBsb } from "@/lib/payments-au";
import { anonClient } from "@/lib/public";
import { stripeConfigured } from "@/lib/stripe";
import { payInvoice } from "./actions";
import { CopyValue, PayButtons } from "./pay-buttons";
import type { PublicTaxInvoice } from "./pay-info";
import { PublicPayPlan, type PublicPlan } from "@/components/pay-plan-public";

export const metadata: Metadata = { title: "Your invoice", robots: { index: false } };

export default async function PublicInvoice({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const [{ data }, { data: planData }] = await Promise.all([
    anonClient().rpc("get_public_tax_invoice", { p_token: token }),
    anonClient().rpc("get_public_payment_plan", { p_token: token }),
  ]);
  if (!data) notFound();
  const plan = planData as PublicPlan | null;
  const allowed = plan?.methods ?? ["bank", "card", "cash"];
  const inv = data as PublicTaxInvoice;
  const pay = inv.pay;
  const balance = Number(inv.totals.balance);
  const online = allowed.includes("card") && pay.online_ready && stripeConfigured() && balance > 0;
  const bankOk = allowed.includes("bank");
  const bank = bankOk && Boolean(pay.bank_bsb && pay.bank_account_number);
  const cash = allowed.includes("cash");
  const ref = bankReference(inv.number);
  const lenders = pay.financing.enabled ? (pay.financing.lenders ?? []).filter((l) => l.url?.startsWith("https://")) : [];
  const payIdText = bankOk && pay.payid ? (pay.payid_type === "abn" ? formatAbn(pay.payid) : pay.payid) : null;

  return (
    <main className="min-h-screen bg-cream py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4 sm:px-0"><PrintButton /></div>
      <TaxInvoice
        doc={{
          number: inv.number, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, milestone_label: inv.milestone_label,
          notes: inv.notes, terms: inv.terms, tax_rate: inv.tax_rate, discount: inv.discount, amounts_include_gst: inv.amounts_include_gst,
          seller: inv.seller, buyer: inv.buyer, job: inv.job, items: inv.items, paid: inv.totals.paid,
        }}
      />
      <section className="no-print mx-auto mt-6 max-w-3xl space-y-4 px-4 sm:px-0" data-pay-section>
        {inv.status === "paid" || balance <= 0 ? (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Paid in full. Thank you!</p>
        ) : (
          <>
            {sp.paid === "1" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800" role="status">Thank you! Your payment is processing. This page updates once it clears (direct debits take a few business days).</p>}
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Pay {money(balance)}</h2>
              <p className="text-sm text-slate-600">{bank || payIdText ? "Bank transfer or PayID is quickest and free for you." : online ? "Pay securely online." : "How to pay this invoice."}</p>

              {(bank || payIdText) && (
                <div className="mt-4 space-y-2" data-pay-instructions>
                  {payIdText && <CopyValue label="PayID" value={payIdText} testId="payid" />}
                  {bank && (
                    <>
                      {pay.bank_account_name && <CopyValue label="Account name" value={pay.bank_account_name} />}
                      <CopyValue label="BSB" value={formatBsb(pay.bank_bsb)} testId="bsb" />
                      <CopyValue label="Account number" value={pay.bank_account_number!} testId="account-number" />
                    </>
                  )}
                  <CopyValue label="Reference (please include)" value={ref} testId="pay-reference" />
                  <p className="text-xs text-slate-500">Scammers sometimes fake invoices. Before your first transfer, call {inv.seller.name}{inv.seller.phone ? ` on ${inv.seller.phone}` : ""} to check these details.</p>
                </div>
              )}

              {online && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Or pay online</h3>
                  <p className="mb-3 text-xs text-slate-500">You&apos;ll finish on Stripe&apos;s secure checkout page. No card surcharge.</p>
                  <PayButtons token={token} action={payInvoice} total={money(balance)} becs={pay.becs_enabled} />
                </div>
              )}

              {cash && (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700" data-pay-cash>
                  <b>Paying cash?</b> Hand it to {inv.seller.name} or the crew and you&apos;ll get a receipt. Quote reference <b>{ref}</b>.
                </p>
              )}

              {!bank && !payIdText && !online && !cash && (
                <p className="mt-3 text-sm text-slate-700" data-pay-instructions>
                  Contact {inv.seller.name}{inv.seller.phone ? ` on ${inv.seller.phone}` : ""}{inv.seller.email ? ` or ${inv.seller.email}` : ""} for payment details, quoting reference <b>{ref}</b>.
                </p>
              )}
            </div>

            {lenders.length > 0 && (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-finance>
                <h2 className="font-display text-base font-semibold text-ink">Prefer to pay over time?</h2>
                <p className="mt-1 text-sm text-slate-600">{inv.seller.name} can refer you to these finance providers.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lenders.map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">{l.name} ↗</a>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">{FINANCE_HOMEOWNER_NOTE}</p>
              </div>
            )}
          </>
        )}
        {plan && plan.parts.length > 1 && <PublicPayPlan plan={plan} current={token} cardOnline={stripeConfigured() && pay.online_ready} />}
        {inv.claim && <ClaimExplainer excess={inv.claim.excess} settlementPath={inv.claim.settlement_path} insurer={inv.claim.insurer} orgName={inv.seller.name} />}
      </section>
    </main>
  );
}
