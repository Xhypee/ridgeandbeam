import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date } from "@/lib/format";
import { aud, capFirstPayment, PART_TRIGGER_LABEL, presetPlan, type PartInput, type PartTrigger } from "@/lib/pay-plan";
import { effectiveMethods, loadPlanContext } from "@/lib/pay-plan-server";
import { stripeConfigured } from "@/lib/stripe";
import { issuePart, recordCash } from "./actions";
import { PlanEditor } from "./plan-editor";

export const metadata: Metadata = { title: "Payment plan" };

const STATUS: Record<string, [string, string]> = {
  draft: ["Waiting", "bg-slate-100 text-slate-600"],
  sent: ["Sent", "bg-brand-50 text-brand-700"],
  partial: ["Part paid", "bg-amber-50 text-amber-800"],
  paid: ["Paid", "bg-teal-50 text-teal-700"],
};

export default async function PaymentPlanPage({ params }: PageProps<"/app/jobs/[id]/billing/plan">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const ctx = await loadPlanContext(supabase, org, id);
  if (!ctx) notFound();
  const onlineReady = Boolean(org.stripe_account_id && org.stripe_charges_enabled) && stripeConfigured();
  const first = ctx.job.customer.name.split(" ")[0];

  if (!ctx.contract) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="font-display text-xl font-bold text-ink">Payment plan</h2>
        <p className="mt-1 text-slate-600">Once {first} signs a quote you can split the price into payments here: a small deposit, milestones, monthly or fortnightly.</p>
      </div>
    );
  }

  // Start from the unpaid parts of the current plan, else the company's usual milestones (kept under the deposit cap).
  const unpaid = ctx.invoices.filter((i) => i.paid <= 0);
  const initial: PartInput[] = unpaid.length
    ? capFirstPayment(unpaid.map((i) => ({ label: i.milestone_label ?? "Payment", trigger: (i.milestone_trigger ?? "date") as PartTrigger, amount: i.total, due_date: i.milestone_trigger === "date" ? i.due_date : null })), ctx.depositRoom).parts
    : presetPlan("milestones", ctx.remaining, { schedule: ctx.schedule, start: ctx.start, depositCap: ctx.depositRoom });
  const paid = ctx.invoices.reduce((a, i) => a + i.paid, 0);
  const methods = effectiveMethods(ctx.job.pay_methods, onlineReady);

  return (
    <div className="space-y-6" data-payment-plan>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Payment plan</h2>
          <p className="text-slate-600">Quote #{ctx.contract.number} · {aud(ctx.contract.total)} inc GST · <span className="font-semibold text-teal-700">{aud(paid)} paid</span></p>
        </div>
        <div className="flex gap-2">
          <a href={`/p/${ctx.job.public_token}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">See it as {first} ↗</a>
          <Link href={`/app/jobs/${id}/billing`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">All invoices</Link>
        </div>
      </div>

      {ctx.invoices.length > 0 && (
        <section aria-label="Payments" className="rounded-2xl bg-white ring-1 ring-slate-200">
          <h3 className="border-b border-slate-100 px-5 py-3 text-[15px] font-bold text-ink">Payments</h3>
          <ul className="divide-y divide-slate-100">
            {ctx.invoices.map((i) => {
              const [label, cls] = STATUS[i.status] ?? [i.status, "bg-slate-100 text-slate-600"];
              const when = i.milestone_trigger === "date" || i.status !== "draft" ? (i.due_date ? `Due ${date(i.due_date)}` : "") : PART_TRIGGER_LABEL[(i.milestone_trigger ?? "completed") as PartTrigger];
              return (
                <li key={i.id} data-plan-invoice={i.status} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <Link href={`/app/invoices/${i.id}`} className="font-semibold text-ink hover:text-brand-700">{i.milestone_label ?? "Payment"} <span className="font-normal text-slate-400">#{i.number}</span></Link>
                    <p className="text-xs text-slate-500">{when}{i.paid > 0 && i.balance > 0 ? ` · ${aud(i.paid)} paid, ${aud(i.balance)} to go` : ""}</p>
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums text-ink">{aud(i.total)}</span>
                  <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>{label}</span>
                  <div className="flex flex-wrap gap-2">
                    {i.status === "draft" && (
                      <ActionForm action={issuePart} className="contents">
                        <input type="hidden" name="id" value={i.id} />
                        <SubmitButton variant="secondary" className="min-h-9 px-3 text-xs">Send now</SubmitButton>
                      </ActionForm>
                    )}
                    {i.balance > 0 && i.status !== "draft" && ctx.job.pay_methods.includes("cash") && (
                      <ActionForm action={recordCash} className="flex items-center gap-1.5">
                        <input type="hidden" name="invoice_id" value={i.id} />
                        <input name="amount" aria-label="Cash amount" defaultValue={i.balance.toFixed(2)} inputMode="decimal" className="h-9 w-24 rounded-lg px-2 text-right text-sm tabular-nums ring-1 ring-inset ring-slate-300" />
                        <SubmitButton variant="secondary" className="min-h-9 px-3 text-xs">Cash received</SubmitButton>
                      </ActionForm>
                    )}
                    {i.status !== "draft" && i.balance > 0 && <Link href={`/app/invoices/${i.id}`} className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">Record payment</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Change the plan">
        <h3 className="mb-3 text-[15px] font-bold text-ink">{ctx.invoices.length ? "Change the plan" : "Set up the plan"}{ctx.locked.length ? <span className="font-normal text-slate-500"> · paid parts stay as they are, {aud(ctx.remaining)} left to plan</span> : null}</h3>
        <PlanEditor
          jobId={id} contractTotal={ctx.contract.total} remaining={ctx.remaining} lockedCount={ctx.locked.length} initial={initial}
          schedule={ctx.schedule} start={ctx.start} today={ctx.today} depositRoom={ctx.depositRoom} depositCap={ctx.depositCap} depositNote={ctx.depositNote} stateName={ctx.stateName}
          methods={ctx.job.pay_methods.length ? ctx.job.pay_methods : methods} reminders={ctx.job.pay_reminders} onlineReady={onlineReady} customerFirst={first}
        />
      </section>
    </div>
  );
}
