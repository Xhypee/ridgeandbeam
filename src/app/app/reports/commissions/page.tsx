import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess, ROLE_LABEL } from "@/lib/dal";
import { date, isoDate, label, money, STAGE_LABEL } from "@/lib/format";
import { COMMISSION_KIND_LABEL } from "@/lib/production";
import { buildStatements, type Statement } from "@/lib/production-commissions";
import { deletePayout, recordPayout } from "../actions";

export const metadata: Metadata = { title: "Commissions" };

function StatementView({ s, isAdmin }: { s: Statement; isAdmin: boolean }) {
  return (
    <div className="space-y-4" data-testid="statement">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Contract value", s.totals.contract],
          ["Commission earned", s.totals.earned],
          ["Paid to date", s.totals.paid],
          ["Payable now", s.totals.payable],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">{k}</p>
            <p className={cx("mt-1 text-xl font-semibold", k === "Payable now" && Number(v) < 0 ? "text-red-700" : "text-slate-900")} data-testid={`stmt-${String(k).toLowerCase().replace(/ /g, "-")}`}>{money(v as number)}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        Plan: {s.plan ? <b>{s.plan.name} — {COMMISSION_KIND_LABEL[s.plan.kind]} {s.plan.rate}%{s.plan.draw_amount ? `, draw ${money(s.plan.draw_amount)}` : ""}</b> : <span className="text-amber-700">no commission plan assigned{isAdmin && <> — set one in <Link className="underline" href="/app/settings/team">Settings → Team</Link></>}</span>}
        {s.totals.pendingSupplements > 0 && <> · <span className="text-violet-700">{money(s.totals.pendingSupplements)} in variation requests waiting on insurers</span></>}
      </p>
      {s.jobs.length === 0 && <p className="text-sm text-slate-500">No signed jobs with this rep assigned yet.</p>}
      {s.jobs.map((j) => (
        <Card key={j.id} title={<span><Link href={`/app/jobs/${j.id}`} className="hover:text-brand-600">{j.customer} · {j.title}</Link> <Badge tone="slate">{STAGE_LABEL[j.stage]}</Badge></span>} actions={<span className={cx("text-sm font-semibold", j.payable < 0 ? "text-red-700" : "text-slate-900")} data-testid="job-payable">{money(j.payable)} payable</span>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-1">Contract value{j.fin.estimate ? ` (estimate #${j.fin.estimate.number}${j.fin.changeOrders ? " + change orders" : ""}${j.fin.approvedSupplements ? " + variations" : ""})` : ""}</td><td className="py-1 text-right font-medium" data-testid="job-contract">{money(j.fin.contractValue)}</td></tr>
                {j.fin.costs.map((c) => (
                  <tr key={c.id} className="text-slate-600"><td className="py-1 pl-3">− {label(c.category)}{c.vendor ? ` · ${c.vendor}` : ""}{c.description ? ` · ${c.description}` : ""} <span className="text-xs text-slate-400">{date(c.incurred_on, { month: "short", day: "numeric" })}</span></td><td className={cx("py-1 text-right", c.amount < 0 && "text-green-700")}>{money(-c.amount)}</td></tr>
                ))}
                {j.fin.costs.length === 0 && <tr className="text-slate-500"><td className="py-1 pl-3">− Budgeted cost (no costs posted yet)</td><td className="py-1 text-right">{money(-j.fin.budgetCost)}</td></tr>}
                <tr className="font-semibold"><td className="py-1">Gross profit · {j.marginPct}%</td><td className="py-1 text-right" data-testid="job-gp">{money(j.gp)}</td></tr>
                {j.fin.pendingSupplements > 0 && <tr className="text-violet-700"><td className="py-1">Pending variation requests (not yet counted)</td><td className="py-1 text-right">{money(j.fin.pendingSupplements)}</td></tr>}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {j.commission ? (
                  <>
                    <tr><td className="py-1">Commission ({s.plan!.rate}% of {s.plan!.kind === "pct_contract" ? "contract" : "gross profit"} {money(j.commission.base)})</td><td className="py-1 text-right font-medium">{money(j.commission.total)}</td></tr>
                    {j.commission.stages.map((st) => (
                      <tr key={st.label} className={st.reached ? "" : "text-slate-400"}><td className="py-1 pl-3">{st.reached ? "✓" : "○"} {st.label}</td><td className="py-1 text-right">{money(st.amount)}</td></tr>
                    ))}
                    <tr className="font-semibold"><td className="py-1">Earned</td><td className="py-1 text-right" data-testid="job-earned">{money(j.commission.earned)}</td></tr>
                  </>
                ) : <tr><td className="py-1 text-slate-500">No plan — no commission computed.</td><td /></tr>}
                {j.payouts.map((p) => (
                  <tr key={p.id} className="text-slate-600"><td className="py-1 pl-3">{p.kind === "chargeback" ? "+" : "−"} {label(p.kind)} paid {date(p.paid_on, { month: "short", day: "numeric" })}{p.notes ? ` · ${p.notes}` : ""}</td><td className="py-1 text-right">{money(p.kind === "chargeback" ? p.amount : -p.amount)}</td></tr>
                ))}
                <tr><td className="py-1">Paid to date</td><td className="py-1 text-right" data-testid="job-paid">{money(j.paid)}</td></tr>
                <tr className="font-semibold"><td className="py-1">Payable now</td><td className={cx("py-1 text-right", j.payable < 0 && "text-red-700")}>{money(j.payable)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      {s.unassignedPayouts.length > 0 && (
        <Card title="Draws & other payouts">
          <ul className="divide-y divide-slate-100 text-sm">
            {s.unassignedPayouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{label(p.kind)} · {date(p.paid_on)}{p.notes ? ` · ${p.notes}` : ""}</span>
                <span className="flex items-center gap-2">{money(p.kind === "chargeback" ? -p.amount : p.amount)}
                  {isAdmin && <form action={deletePayout}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" confirm="Delete this payout?">✕</SubmitButton></form>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default async function CommissionsPage({ searchParams }: PageProps<"/app/reports/commissions">) {
  const { supabase, org, user, isAdmin } = await requireMoneyAccess();
  const sp = await searchParams;
  const statements = await buildStatements(supabase, org.id, isAdmin ? null : [user.id]);
  const selected = isAdmin ? (typeof sp.rep === "string" ? statements.find((s) => s.rep.user_id === sp.rep) : statements.length === 1 ? statements[0] : undefined) : statements[0];

  return (
    <>
      <PageHeader title={isAdmin ? "Commissions" : "My commission statement"} subtitle={isAdmin ? "Every cost line, earned, paid and payable per rep." : "How your commission on each job is calculated."} actions={<LinkButton variant="secondary" href="/app/reports">All reports</LinkButton>} />
      {isAdmin && (
        <>
          <Table>
            <thead><tr><th className={th}>Rep</th><th className={th}>Plan</th><th className={cx(th, "text-right")}>Jobs</th><th className={cx(th, "text-right")}>Earned</th><th className={cx(th, "text-right")}>Paid</th><th className={cx(th, "text-right")}>Payable</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {statements.map((s) => (
                <tr key={s.rep.user_id} className={cx(selected?.rep.user_id === s.rep.user_id && "bg-brand-50")}>
                  <td className={td}><Link className="font-medium text-brand-700 hover:underline" href={`/app/reports/commissions?rep=${s.rep.user_id}`}>{s.rep.name}</Link><span className="block text-xs text-slate-500">{ROLE_LABEL[s.rep.role]}</span></td>
                  <td className={td}>{s.plan?.name ?? <span className="text-slate-400">—</span>}</td>
                  <td className={cx(td, "text-right")}>{s.jobs.length}</td>
                  <td className={cx(td, "text-right")}>{money(s.totals.earned)}</td>
                  <td className={cx(td, "text-right")}>{money(s.totals.paid)}</td>
                  <td className={cx(td, "text-right font-semibold", s.totals.payable < 0 && "text-red-700")}>{money(s.totals.payable)}</td>
                </tr>
              ))}
              {statements.length === 0 && <tr><td className={td} colSpan={6}>No reps yet. Assign a sales rep on each job and a commission plan in Settings → Team.</td></tr>}
            </tbody>
          </Table>
          {statements.length > 0 && (
            <Card className="mt-6" title="Record a payout, draw or chargeback">
              <ActionForm action={recordPayout} className="grid gap-3 sm:grid-cols-6">
                <Field label="Rep">
                  <Select name="user_id" defaultValue={selected?.rep.user_id ?? ""} required>
                    <option value="" disabled>Choose…</option>
                    {statements.map((s) => <option key={s.rep.user_id} value={s.rep.user_id}>{s.rep.name}</option>)}
                  </Select>
                </Field>
                <Field label="Job" className="sm:col-span-2">
                  <Select name="job_id" defaultValue="">
                    <option value="">No job (draw)</option>
                    {(selected ?? statements[0]).jobs.map((j) => <option key={j.id} value={j.id}>{j.customer} · {j.title}</option>)}
                  </Select>
                </Field>
                <Field label="Type">
                  <Select name="kind" defaultValue="final">
                    {["advance", "final", "draw", "chargeback", "adjustment"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" required /></Field>
                <Field label="Paid on"><Input name="paid_on" type="date" defaultValue={isoDate(new Date())} /></Field>
                <Field label="Notes" className="sm:col-span-5"><Input name="notes" placeholder="Check #, period…" /></Field>
                <div className="flex items-end"><SubmitButton>Record</SubmitButton></div>
              </ActionForm>
              <p className="mt-2 text-xs text-slate-500">Chargebacks are entered as positive amounts and reduce what&apos;s been paid. Draws without a job are netted against total earned.</p>
            </Card>
          )}
        </>
      )}
      <div className="mt-6">
        {selected ? <StatementView s={selected} isAdmin={isAdmin} /> : isAdmin ? <p className="text-sm text-slate-500">Pick a rep above to see their statement.</p> : <p className="text-sm text-slate-500">No commission activity yet.</p>}
      </div>
    </>
  );
}
