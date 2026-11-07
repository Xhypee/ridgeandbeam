import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, LinkButton, PageHeader, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { label, money } from "@/lib/format";
import { durationLabel } from "../../jobs/people";
import { deleteLeadSpend, saveLeadSpend } from "./actions";
import { acceptedTotal, buildRows, type LeadJob } from "./report";

export const metadata: Metadata = { title: "Lead sources" };

const SOURCES = ["website", "instant_quote", "google_ads", "facebook", "hipages", "oneflare", "serviceseeking", "referral", "door_knock", "storm", "site_sign"];

export default async function LeadSourcesReport({ searchParams }: PageProps<"/app/reports/leads">) {
  const { supabase, org, isAdmin } = await requireMoneyAccess();
  const sp = await searchParams;
  const months = Math.min(24, Math.max(1, Number(sp.months) || 6));
  const byMonth = sp.group !== "source";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startIso = start.toISOString();
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const [{ data: jobs }, { data: spend }] = await Promise.all([
    supabase.from("jobs").select("id, lead_source, lead_received_at, first_contacted_at, stage").eq("org_id", org.id).gte("lead_received_at", startIso).limit(5000),
    supabase.from("lead_spend").select("id, source, month, amount").eq("org_id", org.id).gte("month", startDate).order("month", { ascending: false }),
  ]);
  const jobList = (jobs ?? []) as LeadJob[];
  const ids = jobList.map((j) => j.id);
  const revenue = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: est } = await supabase
      .from("estimates")
      .select("job_id, discount, tax_rate, selected_option_id, estimate_items(quantity, unit_price, option_id, extra_status)")
      .eq("status", "accepted")
      .in("job_id", ids.slice(i, i + 200));
    for (const e of est ?? []) revenue.set(e.job_id, (revenue.get(e.job_id) ?? 0) + acceptedTotal(e as Parameters<typeof acceptedTotal>[0]));
  }
  const rows = buildRows(jobList, revenue, spend ?? [], byMonth);
  const total = buildRows(jobList.map((j) => ({ ...j, lead_source: "all" })), revenue, (spend ?? []).map((s) => ({ ...s, source: "all" })), false)[0];
  const monthLabel = (m: string) => (m === "all" ? `Last ${months} mo` : new Date(`${m}-15`).toLocaleDateString("en-AU", { month: "short", year: "numeric" }));
  const q = (o: Record<string, string>) => `/app/reports/leads?${new URLSearchParams({ months: String(months), group: byMonth ? "month" : "source", ...o })}`;
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title="Lead sources"
        subtitle="What each channel costs per lead and per sold job, and how fast you call back."
        actions={<LinkButton variant="secondary" href="/app/reports">All reports</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[3, 6, 12].map((m) => (
          <Link key={m} href={q({ months: String(m) })} className={cx("rounded-full px-3 py-1.5 ring-1", m === months ? "bg-brand-500 text-white ring-brand-500" : "bg-white ring-slate-200")}>Last {m} months</Link>
        ))}
        <span className="mx-1 self-center text-slate-300">|</span>
        <Link href={q({ group: "month" })} className={cx("rounded-full px-3 py-1.5 ring-1", byMonth ? "bg-slate-800 text-white ring-slate-800" : "bg-white ring-slate-200")}>By month</Link>
        <Link href={q({ group: "source" })} className={cx("rounded-full px-3 py-1.5 ring-1", !byMonth ? "bg-slate-800 text-white ring-slate-800" : "bg-white ring-slate-200")}>Totals by source</Link>
      </div>

      {total && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Leads", String(total.leads)],
            ["Called within 1 hour", total.contactedPct === null ? "—" : `${total.contactedPct}%`],
            ["Median response", durationLabel(total.medianResponseMin)],
            ["Cost per sold job", total.costPerSold === null ? "—" : money(total.costPerSold)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <th className={th}>Source</th><th className={th}>{byMonth ? "Month" : "Period"}</th><th className={`${th} text-right`}>Leads</th>
            <th className={`${th} text-right`}>Called &lt; 1h</th><th className={`${th} text-right`}>Median response</th>
            <th className={`${th} text-right`}>Inspections</th><th className={`${th} text-right`}>Sold</th><th className={`${th} text-right`}>Revenue</th>
            <th className={`${th} text-right`}>Spend</th><th className={`${th} text-right`}>Cost / lead</th><th className={`${th} text-right`}>Cost / sold job</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100" data-lead-report>
          {rows.length === 0 && <tr><td className={td} colSpan={11}>No leads in this period yet.</td></tr>}
          {rows.map((r) => (
            <tr key={`${r.source}-${r.month}`} data-source={r.source}>
              <td className={`${td} font-medium`}>{label(r.source)}</td>
              <td className={td}>{monthLabel(r.month)}</td>
              <td className={`${td} text-right tabular-nums`} data-col="leads">{r.leads}</td>
              <td className={cx(td, "text-right tabular-nums", r.contactedPct !== null && r.contactedPct < 50 && "text-red-700")}>{r.contactedPct === null ? "—" : `${r.contactedPct}%`}</td>
              <td className={`${td} text-right tabular-nums`}>{durationLabel(r.medianResponseMin)}</td>
              <td className={`${td} text-right tabular-nums`} data-col="booked">{r.booked}</td>
              <td className={`${td} text-right tabular-nums`} data-col="sold">{r.sold}</td>
              <td className={`${td} text-right tabular-nums`} data-col="revenue">{money(r.revenue)}</td>
              <td className={`${td} text-right tabular-nums`} data-col="spend">{r.spend ? money(r.spend) : "—"}</td>
              <td className={`${td} text-right tabular-nums`} data-col="cpl">{r.costPerLead === null ? "—" : money(r.costPerLead)}</td>
              <td className={`${td} text-right tabular-nums`} data-col="cps">{r.costPerSold === null ? "—" : money(r.costPerSold)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-slate-500">Inspections = leads that reached the Inspection stage or later. Revenue = accepted estimate totals. Cost per sold job = spend ÷ sold — the number that matters more than cost per lead.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {isAdmin && (
          <Card title="Enter marketing spend">
            <ActionForm action={saveLeadSpend} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Source">
                  <Input name="source" list="spend-sources" required placeholder="hipages" />
                  <datalist id="spend-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
                </Field>
                <Field label="Month"><Input name="month" type="month" defaultValue={thisMonth} required /></Field>
                <Field label="Amount ($)"><Input name="amount" type="number" min={0} step="0.01" required /></Field>
              </div>
              <SubmitButton variant="secondary">Save spend</SubmitButton>
              <p className="text-xs text-slate-500">Use the same source name your leads arrive with (see the Lead intake settings). Saving again for the same month replaces it.</p>
            </ActionForm>
          </Card>
        )}
        <Card title="Spend entered">
          {(spend ?? []).length === 0 ? <p className="text-sm text-slate-500">No spend entered for this period.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {(spend ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{label(s.source)} · {monthLabel(s.month.slice(0, 7))}</span>
                  <span className="flex items-center gap-2"><span className="tabular-nums">{money(s.amount)}</span>
                    {isAdmin && <form action={deleteLeadSpend}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost">Remove</SubmitButton></form>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
