// Building jobs in the Jobs sidebar: the quote's payments (request the next one) and each supplier's delivery
// (tick it, then pay their invoice). No day counts and no stage-by-stage tracking of the build.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket } from "@/lib/job-docket-server";
import { tickDelivered } from "./build-actions";
import { setStage } from "./actions";
import { Icon } from "./job-sections";

const SEND = "M4 12l16-8-6 16-2.5-6.5z";
const CHECK = "M5 12l5 5 9-10";
const DOLLAR = "M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3";
const TRUCK = "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4";
const aud = (n: number, cents = false) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents || n % 1 ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
const day = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
const wkday = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
const dayTime = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });
const label = "text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400";

function GmailMark() {
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M3 6.5V18h3.5V9.8L12 13.8l5.5-4V18H21V6.5l-2-1.3-7 5.1-7-5.1z" fill="#ea4335" /><path d="M3 6.5V18h3.5V9.8z" fill="#4285f4" /><path d="M17.5 9.8V18H21V6.5z" fill="#34a853" /><path d="M21 6.5l-2-1.3-1.5 1.1v3.5z" fill="#fbbc04" /></svg>;
}

export function BuildPanel({ d, askHref, payHref }: { d: Docket; askHref: string; payHref: (orderId: string) => string }) {
  const b = d.build!;
  const j = d.job;
  const first = d.customer.name.split(" ")[0] || d.customer.name;
  const tel = d.customer.phone?.replace(/\s+/g, "");
  const next = b.rows.find((r) => r.state === "next" || r.state === "asked");
  const deliveredOn = b.deliveries.map((o) => o.deliveredAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  return (
    <div data-build-panel>
      {b.lastDay && (
        <div className="flex gap-2 px-5 pb-4" data-last-day>
          {tel && <a href={`sms:${tel}?&body=${encodeURIComponent(`Hi ${first}, the new roof's done. Thanks for having us!`)}`} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"><Icon d="M4 5h16v11H9l-5 4z" />Text {first}: the roof&apos;s done</a>}
          <form action={setStage}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="stage" value="completed" />
            <button className="flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50">Finish build</button></form>
        </div>
      )}

      {/* Payments: exactly as on the quote. */}
      {b.rows.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4" data-payments>
          <div className="flex items-center gap-2"><p className={cx(label, "flex-1")}>Payments · as on quote{b.quoteNo ? ` #${b.quoteNo}` : ""}</p><span className="text-xs text-slate-500">{aud(b.paid)} of {aud(b.contract)} paid</span></div>
          <ol className="mt-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
            {b.rows.map((r, k) => {
              const live = r.state === "next" || r.state === "asked";
              const sub = r.state === "paid" ? "Paid"
                : r.state === "asked" ? `Requested ${r.invoice?.issue_date ? wkday(r.invoice.issue_date) : ""}${r.invoice?.due_date ? ` · due ${day(r.invoice.due_date)}` : ""}`
                : live && r.due ? `Due now${r.trigger === "delivered" && deliveredOn ? ` · delivered ${wkday(deliveredOn)}` : r.trigger === "completed" ? " · job done" : ""}`
                : r.when;
              return (
                <li key={r.label + k} className={cx("flex items-center gap-3 px-3.5 py-2.5", k > 0 && "border-t border-slate-100", live && "bg-brand-50")} data-pay-row={r.state}>
                  <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full", r.state === "paid" ? "bg-brand-500 text-white" : live ? "bg-ink text-white" : "bg-white text-slate-400 ring-1 ring-slate-200")}><Icon d={r.state === "paid" ? CHECK : DOLLAR} className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm font-semibold", r.state === "later" ? "text-slate-500" : "text-ink")}>{r.label}{r.pct < 100 ? ` · ${r.pct}%` : ""}</span>
                    <span className="block truncate text-xs text-slate-500">{sub}{r.extra > 0 ? ` · incl. ${aud(r.extra)} extra work` : ""}</span>
                  </span>
                  <span className={cx("font-display text-[15px] font-bold tabular-nums", r.state === "paid" ? "text-teal-700" : r.state === "later" ? "text-slate-400" : "text-ink")}>{aud(r.amount)}</span>
                </li>
              );
            })}
          </ol>
          {b.otherPlan.count > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200" data-other-plan>
              This job&apos;s payment plan was changed in Billing ({b.otherPlan.count} payment{b.otherPlan.count === 1 ? "" : "s"} that aren&apos;t on the quote). <Link href={`/app/jobs/${j.id}/billing/plan`} className="font-semibold underline">Open the payment plan</Link>
            </p>
          )}
          {next?.state === "next" && b.otherPlan.count === 0 && (
            <Link href={askHref} scroll={false} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600" data-request-payment><Icon d={SEND} />Request {aud(next.amount)} from {first}</Link>
          )}
          {next?.state === "asked" && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50/60 px-3.5 py-2.5 ring-1 ring-amber-200" data-requested>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Requested {next.invoice?.issue_date ? wkday(next.invoice.issue_date) : ""} · not paid yet</span><span className="block text-xs text-slate-500">{next.invoice?.last_reminder_on && next.invoice.last_reminder_on !== next.invoice.issue_date ? `Last reminder ${wkday(next.invoice.last_reminder_on)}` : `Emailed${d.customer.phone ? " and texted" : ""} to ${first} with a pay link`}</span></span>
              <Link href={askHref} scroll={false} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50">Remind</Link>
            </div>
          )}
        </div>
      )}

      {/* Deliveries: tick each supplier when it turns up, then pay their invoice. */}
      {b.deliveries.length > 0 && (
        <div className="border-t border-slate-100 pb-2" data-deliveries>
          <p className={cx(label, "px-5 pb-1 pt-4")}>Deliveries</p>
          <ul className="divide-y divide-slate-100">
            {b.deliveries.map((o) => {
              const delivered = o.status === "delivered";
              const when = delivered && o.deliveredAt ? `Delivered ${wkday(o.deliveredAt)}` : o.supplierDate ? `Confirmed for ${wkday(o.supplierDate)}` : o.deliveryDate ? `Due ${wkday(o.deliveryDate)}` : o.status === "sent" ? "Ordered" : o.status === "confirmed" ? "Confirmed" : "Not ordered yet";
              return (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3" data-delivery={o.supplier} data-state={o.paidAt ? "paid" : delivered ? "delivered" : "coming"}>
                  <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", delivered ? "bg-brand-500 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200")}><Icon d={delivered ? CHECK : TRUCK} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{o.supplier}{o.branch ? ` ${o.branch}` : ""}</span>
                    <span className="block truncate text-xs text-slate-500">{o.what} · {when}</span>
                    {delivered && (o.paidAt
                      ? <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-600">{o.invoice?.source === "gmail" && <GmailMark />}{o.invoice?.total ? `${aud(o.invoice.total, true)} · ` : ""}paid {dayTime(o.paidAt)}</span>
                      : o.invoice
                        ? <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-600">{o.invoice.source === "gmail" && <GmailMark />}Invoice{o.invoice.total ? ` ${aud(o.invoice.total, true)}` : " in"}{o.invoice.due ? ` · due ${day(o.invoice.due)}` : ""}</span>
                        : <span className="mt-0.5 block text-xs text-slate-400">Invoice not in yet</span>)}
                  </span>
                  {!delivered ? (
                    <span className="shrink-0" data-tick><ActionForm action={tickDelivered}>
                      <input type="hidden" name="id" value={o.id} />
                      <SubmitButton variant="secondary" className="min-h-9 gap-1.5 px-3 text-xs"><span className="h-3.5 w-3.5 rounded border-[1.5px] border-slate-400" />Delivered</SubmitButton>
                    </ActionForm></span>
                  ) : o.paidAt ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"><Icon d={CHECK} className="h-3.5 w-3.5" />Paid</span>
                  ) : (
                    <Link href={payHref(o.id)} scroll={false} className={cx("shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold", o.invoice ? "bg-brand-500 text-white hover:bg-brand-600" : "text-ink ring-1 ring-slate-300 hover:bg-slate-50")} data-pay-invoice>{o.invoice ? "Pay invoice" : "Add invoice"}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
