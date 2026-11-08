import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, Empty, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, label, money, STATUS_TONE } from "@/lib/format";
import { CHECK_KIND_LABEL, PAYER_GROUP_LABEL, PAYER_GROUP_TONE, PAYER_GROUPS, payerGroup, type PayerGroup } from "@/lib/claims";
import { BILL_TO_LABEL, INVOICE_KIND_LABEL, INVOICE_KIND_TONE, planSchedule, TRIGGER_LABEL, validateSchedule, type BillTo, type InvoiceKind } from "@/lib/claims-billing";
import { acceptedEstimateTotal } from "@/lib/estimate-totals";
import { invoiceTotalsFor, type ClaimCheck } from "@/lib/claims-server";

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
};

const KIND_ORDER: InvoiceKind[] = ["deposit", "progress", "final", "standard", "supplement", "change_order"];
const billToGroup = (b: BillTo): PayerGroup => (b === "carrier" ? "insurer" : b === "panel_builder" ? "panel_builder" : "homeowner_balance");

export default async function BillingPage({ params }: PageProps<"/app/jobs/[id]/billing">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const [{ data: invRows }, { data: claim }, est, { data: orgRow }] = await Promise.all([
    supabase.from("invoices").select("id, number, status, kind, milestone_label, milestone_trigger, bill_to, issue_date, due_date").eq("job_id", id).order("number"),
    supabase.from("claims").select("id, carrier, claim_checks(*)").eq("job_id", id).maybeSingle(),
    acceptedEstimateTotal(supabase, id),
    supabase.from("organizations").select("payment_schedule").eq("id", org.id).single(),
  ]);
  const invoices = ((invRows ?? []) as unknown as Inv[]).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.number - b.number);
  const totalsById = await invoiceTotalsFor(supabase, invoices.map((i) => i.id));
  const tot = (i: Inv) => totalsById.get(i.id) ?? { total: 0, paid: 0, balance: 0 };
  const live = invoices.filter((i) => i.status !== "void");
  const checks = ((claim?.claim_checks ?? []) as ClaimCheck[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const hasSchedule = live.some((i) => ["deposit", "progress", "final"].includes(i.kind));
  const sched = validateSchedule(orgRow?.payment_schedule);
  const preview = sched.ok && est ? planSchedule(est.total, sched.steps) : null;
  const gstName = org.gst_registered !== false ? "tax invoice" : "invoice";

  // Combined ledger by payer. Claim payments applied to an invoice are counted once, in the invoice.
  type Line = { key: string; group: PayerGroup; source: string; href: string; detail: string; expected: number; received: number; counted: boolean };
  const lines: Line[] = [
    ...live.map((i) => ({
      key: i.id,
      group: billToGroup(i.bill_to),
      source: `Invoice #${i.number}`,
      href: `/app/invoices/${i.id}`,
      detail: [i.milestone_label || INVOICE_KIND_LABEL[i.kind], label(i.status), `to ${BILL_TO_LABEL[i.bill_to]}`].join(" · "),
      expected: Number(tot(i).total),
      received: Number(tot(i).paid),
      counted: true,
    })),
    ...checks.map((c) => ({
      key: c.id,
      group: payerGroup(c),
      source: c.label || CHECK_KIND_LABEL[c.kind],
      href: `/app/jobs/${id}/claim/money`,
      detail: [CHECK_KIND_LABEL[c.kind], c.payment_id ? "applied to an invoice" : "claim ledger"].join(" · "),
      expected: Number(c.expected_amount),
      received: Number(c.received_amount),
      counted: !c.payment_id,
    })),
  ];
  const groups = PAYER_GROUPS.map((g) => {
    const ls = lines.filter((l) => l.group === g);
    const counted = ls.filter((l) => l.counted);
    return { g, ls, expected: counted.reduce((s, l) => s + l.expected, 0), received: counted.reduce((s, l) => s + l.received, 0) };
  }).filter((x) => x.ls.length > 0);
  const invTotals = live.reduce((t, i) => ({ total: t.total + Number(tot(i).total), paid: t.paid + Number(tot(i).paid), balance: t.balance + Number(tot(i).balance) }), { total: 0, paid: 0, balance: 0 });

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Contract (accepted quote, inc GST)</dt><dd className="text-lg font-semibold tabular-nums">{est ? money(est.total) : "—"}</dd></div>
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

      <Card title="Payment plan" actions={<Link href={`/app/jobs/${id}/billing/plan`} data-plan-link className="inline-flex min-h-10 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">{hasSchedule ? "Open payment plan" : "Set up a payment plan"}</Link>}>
        {!est ? (
          <p className="text-sm text-slate-600">Once the homeowner accepts a quote, split the price into {gstName}s here: a deposit within your state&apos;s limit, milestones, and monthly or fortnightly payments by card, PayID, bank transfer or cash.</p>
        ) : hasSchedule ? (
          <p className="text-sm text-slate-600">Change dates and amounts, send the next payment, or record cash on the payment plan page.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">Your usual schedule for the {money(est.total)} contract price (inc GST). Open the plan to keep the deposit within your state&apos;s limit, add monthly payments and choose how the customer pays:</p>
            {sched.ok && (
              <ul className="space-y-1 text-sm">
                {preview!.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span><b>{p.label}</b> <span className="text-slate-500">· {p.pct}% · {TRIGGER_LABEL[p.trigger]}</span></span>
                    <span className="tabular-nums font-medium">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">Expected vs received, by who pays</h2>
        {groups.length === 0 ? (
          <Empty title="Nothing expected yet">Invoices and insurance claim payments show up here together.</Empty>
        ) : (
          <div className="space-y-3" data-testid="expected-vs-received">
            {groups.map(({ g, ls, expected, received }) => (
              <div key={g} className="rounded-2xl bg-white ring-1 ring-slate-200" data-group={g}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <Badge tone={PAYER_GROUP_TONE[g]}>{PAYER_GROUP_LABEL[g]}</Badge>
                  <p className="text-sm tabular-nums"><b>{money(received)}</b> <span className="text-slate-500">received of {money(expected)}</span>{expected - received > 0.004 && <span className="ml-2 font-medium text-amber-700">{money(expected - received)} still coming</span>}</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {ls.map((l) => {
                    const owed = Math.max(0, l.expected - l.received);
                    return (
                      <li key={l.key} className={cx("flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm", !l.counted && "text-slate-400")}>
                        <span className="min-w-0"><Link href={l.href} className="font-medium hover:text-brand-600">{l.source}</Link><span className="block text-xs text-slate-500">{l.detail}</span></span>
                        <span className="text-right tabular-nums">{money(l.expected)}<span className="block text-xs">{owed > 0 ? <span className="text-amber-700">owed {money(owed)}</span> : <span className="text-green-700">received</span>}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        {claim && <p className="mt-2 text-xs text-slate-500">A claim payment recorded on an invoice is counted once, in the invoice (greyed out in the claim list).</p>}
      </section>
    </div>
  );
}
