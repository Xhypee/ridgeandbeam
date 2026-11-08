// Wrapping up jobs in the Jobs sidebar: one to-do list to close the job out (the final payment, each supplier's
// invoice on its own line, the warranty & handover pack, a Google review), then Close the job; and what you made.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket } from "@/lib/job-docket-server";
import { requestReview } from "./[id]/closeout/actions";
import { Icon } from "./job-sections";
import { closeJob, sendHandover } from "./wrap-actions";

const CHECK = "M5 12l5 5 9-10";
const DOLLAR = "M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3";
const TRUCK = "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4";
const SHIELD = "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z";
const STAR = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";
const aud = (n: number, cents = false) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents || n % 1 ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
const tz = "Australia/Brisbane";
const wkday = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
const dayTime = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
const METHOD: Record<string, string> = { bank_transfer: "bank transfer", payid: "PayID", card: "card", cash: "cash", cheque: "cheque", check: "cheque", bpay: "BPAY", stripe: "card" };
const COST: Record<string, string> = { materials: "Materials (supplier invoices)", labor: "Crew", dumpster: "Skip", equipment: "Scaffold & equipment", permit: "Permits", other: "Other" };

type State = "done" | "now" | "wait" | "todo";
type Step = { key: string; icon: string; label: string; detail: string; state: State; action?: React.ReactNode; href?: string; actionLabel?: string };

export function WrapPanel({ d, askHref, payHref }: { d: Docket; askHref: string; payHref: (orderId: string) => string }) {
  const b = d.build!;
  const w = d.wrap!;
  const j = d.job;
  const first = d.customer.name.split(" ")[0] || d.customer.name;
  const steps: Step[] = [];

  // 1. The money: the next unpaid stage on the quote, or paid in full.
  const allPaid = b.rows.length > 0 && b.rows.every((r) => r.state === "paid");
  const next = b.rows.find((r) => r.state === "next" || r.state === "asked");
  if (allPaid) {
    const last = d.payments.at(-1);
    steps.push({ key: "pay", icon: DOLLAR, label: `Paid in full · ${aud(b.contract)}`, detail: last ? `${b.rows.at(-1)!.label} paid ${wkday(last.paid_on)}${METHOD[last.method] ? ` by ${METHOD[last.method]}` : ""}` : "All payments on the quote are in", state: "done" });
  } else if (b.otherPlan.count > 0) {
    steps.push({ key: "pay", icon: DOLLAR, label: `Final payment · ${aud(Math.max(0, d.money.owing))} owing`, detail: "The payment plan was changed in Billing", state: "todo", href: `/app/jobs/${j.id}/billing/plan`, actionLabel: "Open" });
  } else if (next) {
    steps.push({
      key: "pay", icon: DOLLAR, label: `${next.label} · ${aud(next.amount)}`,
      detail: next.state === "asked" ? `Requested ${next.invoice?.issue_date ? wkday(next.invoice.issue_date) : ""}${next.invoice?.due_date ? ` · due ${wkday(next.invoice.due_date)}` : ""} · not paid yet` : `${next.when} · not asked for yet`,
      state: "todo", href: askHref, actionLabel: next.state === "asked" ? "Remind" : "Request",
    });
  }

  // 2. Each supplier's invoice, one line each.
  for (const o of b.deliveries) {
    const name = `${o.supplier.split(" (")[0]} invoice${o.invoice?.total ? ` · ${aud(o.invoice.total, true)}` : ""}`;
    if (o.paidAt) steps.push({ key: o.id, icon: TRUCK, label: name, detail: `Paid ${dayTime(o.paidAt)}`, state: "done" });
    else if (o.invoice) steps.push({ key: o.id, icon: TRUCK, label: name, detail: `${o.what}${o.invoice.due ? ` · due ${wkday(o.invoice.due)}` : ""}`, state: "todo", href: payHref(o.id), actionLabel: "Pay" });
    else steps.push({ key: o.id, icon: TRUCK, label: name, detail: `${o.what} · invoice not in yet`, state: "todo", href: payHref(o.id), actionLabel: "Add invoice" });
  }

  // 3. Warranty & handover pack.
  steps.push(w.handoverSentAt
    ? { key: "handover", icon: SHIELD, label: "Warranty & handover pack", detail: `Sent to ${first} ${wkday(w.handoverSentAt)}${w.warrantyRegisteredAt ? " · warranty registered" : ""}`, state: "done" }
    : {
      key: "handover", icon: SHIELD, label: "Warranty & handover pack",
      detail: [w.warrantyProduct ? `${w.warrantyProduct} warranty` : null, w.workmanshipYears > 0 ? `your ${w.workmanshipYears}-year workmanship warranty` : null, d.files.photos ? `${d.files.photos} photos` : null].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase()),
      state: "todo",
      action: d.customer.email ? <ActionForm action={sendHandover}><input type="hidden" name="job_id" value={j.id} /><SubmitButton variant="secondary" className="min-h-8 px-3 text-xs">Send</SubmitButton></ActionForm> : undefined,
      href: d.customer.email ? undefined : `/app/customers/${d.customer.id}`, actionLabel: d.customer.email ? undefined : "Add email",
    });

  // 4. Google review, once they've paid.
  steps.push(w.reviewRequestedAt
    ? { key: "review", icon: STAR, label: "Ask for a Google review", detail: `Sent ${wkday(w.reviewRequestedAt)}`, state: "done" }
    : !allPaid ? { key: "review", icon: STAR, label: "Ask for a Google review", detail: "Sent once they've paid", state: "wait" }
    : !w.reviewUrl ? { key: "review", icon: STAR, label: "Ask for a Google review", detail: "Add your Google review link first", state: "todo", href: "/app/settings", actionLabel: "Settings" }
    : { key: "review", icon: STAR, label: "Ask for a Google review", detail: `Text ${first} the link to your Google reviews`, state: "todo", action: <ActionForm action={requestReview}><input type="hidden" name="job_id" value={j.id} /><SubmitButton className="min-h-8 px-3 text-xs">Send</SubmitButton></ActionForm> });

  const nowIx = steps.findIndex((s) => s.state === "todo");
  if (nowIx >= 0) steps[nowIx] = { ...steps[nowIx], state: "now" };
  const done = steps.filter((s) => s.state === "done").length;
  const canClose = allPaid && b.deliveries.every((o) => o.paidAt) && Boolean(w.handoverSentAt);

  // What you made: the job price ex GST less what it really cost.
  const exGst = d.quote && d.quote.status === "accepted" ? d.quote.total - d.quote.gst : null;
  const costs = [...d.costs.byCategory].filter((c) => c.amount > 0).sort((a, b2) => b2.amount - a.amount);

  return (
    <div data-wrap-panel>
      <div className="px-5 pb-4" data-close-out>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{canClose ? "Ready to close" : "Closing it out"}</p>
            <p className="font-display text-[26px] font-bold leading-tight text-ink">{canClose ? "Paid in full" : `${done} of ${steps.length} done`}</p>
          </div>
          <span className="mb-1.5 flex gap-1" aria-hidden>{steps.map((s) => <span key={s.key} className="h-2 w-5 rounded-full" style={{ background: s.state === "done" ? "#1f5f3f" : s.state === "now" ? "#13221a" : s.state === "wait" ? "#f4c66b" : "#e2e8f0" }} />)}</span>
        </div>
        <ol className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {steps.map((s, k) => (
            <li key={s.key} className={cx("flex items-center gap-3 px-3.5 py-3", k > 0 && "border-t border-slate-100", s.state === "now" && "bg-brand-50")} data-wrap-step={s.key} data-state={s.state}>
              <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", s.state === "done" ? "bg-brand-500 text-white" : s.state === "now" ? "bg-ink text-white" : s.state === "wait" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-white text-slate-500 ring-1 ring-slate-200")}>
                <Icon d={s.state === "done" ? CHECK : s.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-semibold", s.state === "todo" ? "text-slate-600" : "text-ink")}>{s.label}</span>
                <span className="block text-xs leading-snug text-slate-500">{s.detail}</span>
              </span>
              {s.action ?? (s.href && s.actionLabel && <Link href={s.href} scroll={false} className={cx("shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold", s.state === "now" ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}>{s.actionLabel}</Link>)}
            </li>
          ))}
        </ol>
        {canClose && (
          <ActionForm action={closeJob} className="mt-3"><input type="hidden" name="job_id" value={j.id} />
            <SubmitButton className="min-h-11 w-full gap-2"><Icon d={CHECK} />Close the job</SubmitButton></ActionForm>
        )}
      </div>

      {exGst !== null && (
        <div className="border-t border-slate-100 px-5 py-4" data-profit>
          <div className="flex items-center gap-2"><p className="flex-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">What you made · only you</p><span className="text-xs text-slate-500">{aud(d.money.paid)} of {aud(b.contract || d.money.contract || 0)} paid</span></div>
          <div className="mt-2 rounded-2xl bg-ink p-4 text-white">
            <div className="flex flex-wrap items-end gap-x-3">
              <p className="font-display text-[34px] font-bold leading-none" style={{ color: (d.money.profit ?? 0) >= 0 ? "#8fd0a8" : "#f4c66b" }}>{aud(Math.round(d.money.profit ?? 0))}</p>
              <p className="pb-1 text-sm text-white/70">{d.money.margin !== null ? `${d.money.margin}% margin` : ""}{w.quotedMargin !== null ? ` · ${Math.round(w.quotedMargin)}% quoted` : ""}</p>
            </div>
            <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
              <li className="flex text-white/80"><span className="flex-1">Job price ex GST</span><span className="tabular-nums">{aud(Math.round(exGst))}</span></li>
              {costs.length ? costs.map((c) => <li key={c.category} className="flex text-white/60"><span className="flex-1">− {COST[c.category] ?? c.category}</span><span className="tabular-nums">{aud(Math.round(c.amount))}</span></li>)
                : <li className="text-white/50">No costs recorded yet. Pay the supplier invoices and add crew costs to see what you made.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
