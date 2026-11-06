import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, label, money, STATUS_TONE } from "@/lib/format";
import { CHECK_KIND_LABEL, ENDORSEMENT_LABEL, PAYER_LABEL } from "@/lib/claims";
import { BILL_TO_LABEL, INVOICE_KIND_LABEL, INVOICE_KIND_TONE, planSchedule, TRIGGER_LABEL, validateSchedule, type BillTo, type InvoiceKind } from "@/lib/claims-billing";
import { acceptedEstimateTotal } from "@/lib/claims-estimate";
import type { ClaimCheck } from "@/lib/claims-server";
import { createPaymentScheduleAction } from "../../../invoices/actions";

export const metadata: Metadata = { title: "Billing" };

type Inv = {
  id: string;
  number: number;
  status: string;
  kind: InvoiceKind;
  milestone_label: string | null;
  milestone_trigger: string | null;
  bill_to: BillTo;
  issue_date: string;
  due_date: string | null;
  invoice_totals: { total: number; paid: number; balance: number } | { total: number; paid: number; balance: number }[] | null;
};

const KIND_ORDER: InvoiceKind[] = ["deposit", "progress", "final", "standard", "supplement", "change_order"];

export default async function BillingPage({ params }: PageProps<"/app/jobs/[id]/billing">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const [{ data: invRows }, { data: claim }, est, { data: orgRow }] = await Promise.all([
    supabase.from("invoices").select("id, number, status, kind, milestone_label, milestone_trigger, bill_to, issue_date, due_date, invoice_totals(total, paid, balance)").eq("job_id", id).order("number"),
    supabase.from("claims").select("id, carrier, claim_checks(*)").eq("job_id", id).maybeSingle(),
    acceptedEstimateTotal(supabase, id),
    supabase.from("organizations").select("payment_schedule").eq("id", org.id).single(),
  ]);
  const invoices = ((invRows ?? []) as unknown as Inv[]).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.number - b.number);
  const tot = (i: Inv) => (Array.isArray(i.invoice_totals) ? i.invoice_totals[0] : i.invoice_totals) ?? { total: 0, paid: 0, balance: 0 };
  const live = invoices.filter((i) => i.status !== "void");
  const checks = ((claim?.claim_checks ?? []) as ClaimCheck[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const hasSchedule = live.some((i) => ["deposit", "progress", "final"].includes(i.kind));
  const sched = validateSchedule(orgRow?.payment_schedule);
  const preview = sched.ok && est ? planSchedule(est.total, sched.steps) : null;

  // Combined ledger. Checks applied to an invoice payment are already counted in that invoice's "received".
  type Line = { key: string; source: string; href?: string; who: string; detail: string; expected: number; received: number; counted: boolean };
  const lines: Line[] = [
    ...live.map((i) => ({
      key: i.id,
      source: `Invoice #${i.number}`,
      href: `/app/invoices/${i.id}`,
      who: BILL_TO_LABEL[i.bill_to] ?? label(i.bill_to),
      detail: [i.milestone_label || INVOICE_KIND_LABEL[i.kind], label(i.status)].join(" · "),
      expected: Number(tot(i).total),
      received: Number(tot(i).paid),
      counted: true,
    })),
    ...checks.map((c) => ({
      key: c.id,
      source: c.label || CHECK_KIND_LABEL[c.kind],
      href: `/app/jobs/${id}/claim/money`,
      who: PAYER_LABEL[c.payer],
      detail: [CHECK_KIND_LABEL[c.kind], c.endorsement !== "not_required" ? ENDORSEMENT_LABEL[c.endorsement] : null, c.payment_id ? "applied to invoice" : null].filter(Boolean).join(" · "),
      expected: Number(c.expected_amount),
      received: Number(c.received_amount),
      counted: !c.payment_id,
    })),
  ];
  const invTotals = live.reduce((t, i) => ({ total: t.total + Number(tot(i).total), paid: t.paid + Number(tot(i).paid), balance: t.balance + Number(tot(i).balance) }), { total: 0, paid: 0, balance: 0 });
  const chkTotals = checks.reduce((t, c) => ({ expected: t.expected + Number(c.expected_amount), received: t.received + Number(c.received_amount) }), { expected: 0, received: 0 });
  const unappliedReceived = checks.filter((c) => !c.payment_id).reduce((s, c) => s + Number(c.received_amount), 0);

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Contract (accepted estimate)</dt><dd className="text-lg font-semibold tabular-nums">{est ? money(est.total) : "—"}</dd></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Invoiced</dt><dd className="text-lg font-semibold tabular-nums">{money(invTotals.total)}</dd></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Paid on invoices</dt><dd className="text-lg font-semibold tabular-nums text-green-800">{money(invTotals.paid)}</dd></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Balance due</dt><dd className={cx("text-lg font-semibold tabular-nums", invTotals.balance > 0 && "text-amber-700")}>{money(invTotals.balance)}</dd></div>
      </dl>

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <Empty title="No invoices yet">Create a payment schedule below, or use &ldquo;New invoice&rdquo; above.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="job-invoices">
            {invoices.map((i) => {
              const t = tot(i);
              return (
                <li key={i.id} className={cx("flex flex-wrap items-center justify-between gap-2 py-3", i.status === "void" && "opacity-50")}>
                  <div className="min-w-0">
                    <Link href={`/app/invoices/${i.id}`} className="font-medium text-slate-900 hover:text-brand-600">#{i.number} {i.milestone_label && <span className="font-normal">· {i.milestone_label}</span>}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <Badge tone={INVOICE_KIND_TONE[i.kind]}>{INVOICE_KIND_LABEL[i.kind]}</Badge>
                      <Badge tone={STATUS_TONE[i.status]}>{label(i.status)}</Badge>
                      <span>Bill to {BILL_TO_LABEL[i.bill_to]}</span>
                      {i.milestone_trigger && <span>· {TRIGGER_LABEL[i.milestone_trigger] ?? i.milestone_trigger}</span>}
                      {i.due_date && <span>· due {date(i.due_date)}</span>}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div>{money(t.total)}</div>
                    <div className="text-xs text-slate-500">paid {money(t.paid)} · balance <b className="text-slate-800">{i.status === "void" ? "—" : money(t.balance)}</b></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!hasSchedule && (
        <Card title="Payment schedule">
          {!est ? (
            <p className="text-sm text-slate-600">Once the homeowner accepts an estimate, create milestone invoices here (deposit, materials delivered, completion).</p>
          ) : !sched.ok ? (
            <p className="text-sm text-amber-800">{sched.error}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">Split the {money(est.total)} contract (estimate #{est.estimateNumber}) into milestone invoices using your company&apos;s payment schedule:</p>
              <ul className="mb-4 space-y-1 text-sm">
                {preview!.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span><b>{p.label}</b> <span className="text-slate-500">· {p.pct}% · {TRIGGER_LABEL[p.trigger]}</span></span>
                    <span className="tabular-nums font-medium">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <ActionForm action={createPaymentScheduleAction}>
                <input type="hidden" name="job_id" value={id} />
                <SubmitButton className="min-h-11">Create payment schedule</SubmitButton>
              </ActionForm>
            </>
          )}
        </Card>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Expected vs received</h2>
          {claim && (
            <p className="text-xs text-slate-500">
              Insurance checks: {money(chkTotals.received)} of {money(chkTotals.expected)} received{unappliedReceived > 0 ? ` · ${money(unappliedReceived)} not yet applied to an invoice` : ""}
            </p>
          )}
        </div>
        {lines.length === 0 ? (
          <Empty title="Nothing expected yet">Invoices and insurance checks show up here together.</Empty>
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr><th className={th}>What</th><th className={th}>From</th><th className={`${th} text-right`}>Expected</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Still owed</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100" data-testid="expected-vs-received">
              {lines.map((l) => {
                const owed = Math.max(0, l.expected - l.received);
                return (
                  <tr key={l.key} className={l.counted ? undefined : "text-slate-400"}>
                    <td className={td}>
                      {l.href ? <Link href={l.href} className="font-medium text-slate-900 hover:text-brand-600">{l.source}</Link> : l.source}
                      <div className="text-xs text-slate-500">{l.detail}</div>
                    </td>
                    <td className={td}>{l.who}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(l.expected)}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(l.received)}</td>
                    <td className={cx(td, "text-right tabular-nums", owed > 0 && "font-medium text-amber-700")}>{money(owed)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {claim && (
          <p className="mt-2 text-xs text-slate-500">
            Insurance checks are what the carrier, lender or homeowner is expected to pay toward the job; invoices are what you bill. A check recorded as a payment on an invoice is counted once, in the invoice.
          </p>
        )}
      </div>
    </div>
  );
}
