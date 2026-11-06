import type { Metadata } from "next";
import Link from "next/link";
import { StateCompliancePanel } from "@/components/state-compliance-panel";
import { Badge, Card, Field, Input, Select, cx } from "@/components/ui";
import { AU_STATE_NAME, AU_STATES, asAuState, type AuState } from "@/lib/au";
import { isIsoDate } from "@/lib/au-business-days";
import { AU_JOB_TYPES, formatAuDate, ROOF_SYSTEMS, stateReference } from "@/lib/au-rules";
import { requireOrg } from "@/lib/dal";
import { orgToday } from "@/lib/format";

export const metadata: Metadata = { title: "State rules" };

/** Where "Report a change" emails go (set NEXT_PUBLIC_RULES_REPORT_EMAIL to override). */
const REPORT_EMAIL = process.env.NEXT_PUBLIC_RULES_REPORT_EMAIL || "rules@ridgeandbeam.com.au";

export default async function StateRulesPage({ searchParams }: PageProps<"/app/settings/state-rules">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const { org } = await requireOrg();
  const served = (org.service_states ?? []).map(asAuState).filter(Boolean) as AuState[];
  if (!served.length && asAuState(org.state)) served.push(asAuState(org.state)!);
  const tabs: AuState[] = served.length ? served : [...AU_STATES];
  const state = asAuState(one("state")) ?? tabs[0];
  const today = orgToday(org.state);
  const asOf = isIsoDate(one("date")) ? one("date")! : today;
  const ref = stateReference(state, asOf);

  // "Try a job" scenario
  const value = Number(one("value"));
  const scenario = Number.isFinite(value) && value > 0
    ? { value, roof: one("roof") ?? "concrete_tile", job: one("job") ?? "re_roof", doorKnock: one("door") === "on", approval: one("approval") }
    : null;

  const href = (s: AuState) => `/app/settings/state-rules?state=${s}${asOf !== today ? `&date=${asOf}` : ""}`;
  const mail = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`State rules change: ${state}`)}&body=${encodeURIComponent(`Which rule (topic):\n\nWhat changed / what's wrong:\n\nSource (link to the regulator or legislation):\n\nRules shown were verified ${formatAuDate(ref.verifiedOn)}.`)}`;

  return (
    <div className="space-y-6" data-state-rules-page={state}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-ink">State rules</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            The licence, contract, deposit, cooling-off, insurance and safety rules Ridge &amp; Beam applies for each state you work in.
            {!served.length && " Add your service states in Settings → Company to show only those."}
          </p>
        </div>
        <a href={mail} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50" data-report-change>Report a change</a>
      </div>

      <nav aria-label="States" className="flex flex-wrap gap-2">
        {tabs.map((s) => (
          <Link key={s} href={href(s)} aria-current={s === state ? "page" : undefined}
            className={cx("inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ring-1 ring-inset", s === state ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-slate-300 hover:bg-slate-50")}>
            {s}
          </Link>
        ))}
      </nav>

      <Card
        title={<span>{AU_STATE_NAME[state]} <span className="font-normal text-slate-500">as at {formatAuDate(ref.asOf)}</span></span>}
        actions={<a href={ref.regulator.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">{ref.regulator.name} ↗</a>}
      >
        {ref.changes.map((c) => <p key={c} className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Coming change — {c}</p>)}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" data-testid="state-rules-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Topic</th>
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {ref.rows.map((r) => (
                <tr key={r.topic}>
                  <th scope="row" className="py-3 pr-4 text-left font-semibold text-ink sm:w-44">{r.topic}</th>
                  <td className="py-3 pr-4 text-slate-700">{r.text}</td>
                  <td className="py-3 text-xs sm:w-64">
                    {r.src.slice(0, 2).map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block break-words text-brand-700 underline underline-offset-2">{s.label}</a>)}
                    <span className="mt-0.5 block text-slate-500">Verified {formatAuDate(ref.verifiedOn)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ref.unverified.length > 0 && (
          <div className="mt-4 rounded-xl bg-violet-50 p-4">
            <p className="text-sm font-bold text-violet-800">Not verified — check with your regulator</p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {ref.unverified.map((u) => (
                <li key={u.topic}><span className="font-semibold">{u.topic}:</span> {u.note} <a href={u.regulator.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">{u.regulator.name} ↗</a></li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">Last verified {formatAuDate(ref.verifiedOn)} against legislation and regulator pages. {ref.disclaimer} Safety: {ref.whsRegulator.name} — <a href={ref.whsRegulator.url} className="underline" target="_blank" rel="noreferrer">{ref.whsRegulator.url.replace(/^https:\/\//, "")}</a>.</p>
      </Card>

      <Card title="Try a job" actions={<Badge>Uses the same rules as quotes</Badge>}>
        <form method="get" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="scenario-form">
          <input type="hidden" name="state" value={state} />
          <Field label="Price incl. GST ($)"><Input name="value" type="number" min={0} step={100} inputMode="numeric" defaultValue={scenario?.value ?? 25000} /></Field>
          <Field label="Roof"><Select name="roof" defaultValue={scenario?.roof ?? "concrete_tile"}>{ROOF_SYSTEMS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
          <Field label="Job"><Select name="job" defaultValue={scenario?.job ?? "re_roof"}>{AU_JOB_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
          <Field label="Permit needed?"><Select name="approval" defaultValue={scenario?.approval ?? ""}><option value="">Not decided</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
          <Field label="Contract date"><Input name="date" type="date" defaultValue={asOf} /></Field>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="door" defaultChecked={scenario?.doorKnock} className="h-5 w-5 accent-brand-600" /> Door-knock sale</label>
          </div>
          <div className="sm:col-span-3 lg:col-span-6"><button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">Show what applies</button></div>
        </form>
        {scenario && (
          <StateCompliancePanel
            className="mt-5" state={state} contractValueIncGst={scenario.value} contractDate={asOf} roofSystem={scenario.roof} jobType={scenario.job}
            doorKnockSale={scenario.doorKnock} buildingApprovalRequired={scenario.approval === "yes" ? true : scenario.approval === "no" ? false : undefined}
            licenceNumber={org.licences?.[state]?.number ?? null}
          />
        )}
      </Card>
    </div>
  );
}
