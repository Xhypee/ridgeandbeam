import Link from "next/link";
import type { Metadata } from "next";
import { Field, Input, LinkButton, PageHeader, Select, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, money, STAGE_LABEL } from "@/lib/format";
import { margin } from "@/lib/production";
import { jobFinancials } from "@/lib/production-data";

export const metadata: Metadata = { title: "Job profitability" };

const SORTS = ["date", "contract", "cost", "gp", "margin"] as const;
type Sort = (typeof SORTS)[number];
const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function ProfitabilityPage({ searchParams }: PageProps<"/app/reports/profitability">) {
  const { supabase, org, user, isAdmin, isSalesRep } = await requireMoneyAccess();
  const sp = await searchParams;
  const from = iso(sp.from);
  const to = iso(sp.to);
  const rep = isSalesRep ? user.id : typeof sp.rep === "string" && /^[0-9a-f-]{36}$/.test(sp.rep) ? sp.rep : null;
  const sort: Sort = (SORTS as readonly string[]).includes(String(sp.sort)) ? (sp.sort as Sort) : "date";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  let eq = supabase.from("estimates").select("job_id, accepted_at").eq("org_id", org.id).eq("status", "accepted");
  if (from) eq = eq.gte("accepted_at", from);
  if (to) eq = eq.lte("accepted_at", to + "T23:59:59");
  const [{ data: est }, { data: members }] = await Promise.all([eq, supabase.from("memberships").select("user_id, full_name, email").eq("org_id", org.id)]);
  const jobIds = [...new Set((est ?? []).map((e) => e.job_id))];
  let jq = supabase.from("jobs").select("id, title, stage, sales_rep_id, customers(name)").in("id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"]);
  if (rep) jq = jq.eq("sales_rep_id", rep);
  const { data: jobs } = await jq;
  const list = (jobs ?? []) as unknown as { id: string; title: string; stage: string; sales_rep_id: string | null; customers: { name: string } | null }[];
  const fin = await jobFinancials(supabase, list.map((j) => j.id));
  const name = new Map((members ?? []).map((m) => [m.user_id, m.full_name || m.email]));
  const rows = list.map((j) => {
    const f = fin.get(j.id)!;
    const m = margin(f.contractValue, f.actualCost);
    return { ...j, f, gp: m.gp, pct: m.pct, date: f.estimate?.acceptedAt ?? "" };
  });
  const key = (r: (typeof rows)[number]) => ({ date: r.date, contract: r.f.contractValue, cost: r.f.actualCost, gp: r.gp, margin: r.pct })[sort];
  rows.sort((a, b) => { const x = key(a), y = key(b); const c = x < y ? -1 : x > y ? 1 : 0; return dir === "asc" ? c : -c; });
  const tot = rows.reduce((s, r) => ({ contract: s.contract + r.f.contractValue, cost: s.cost + r.f.actualCost }), { contract: 0, cost: 0 });
  const tm = margin(tot.contract, tot.cost);
  const min = Number(org.min_margin_pct);
  const qs = (p: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const all = { from, to, rep: isSalesRep ? null : rep, sort, dir, ...p };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/app/reports/profitability?${u}`;
  };
  const sortTh = (k: Sort, children: string, right?: boolean) => (
    <th key={k} className={cx(th, right && "text-right")}>
      <Link href={qs({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" })} className="hover:text-slate-900">{children}{sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}</Link>
    </th>
  );

  return (
    <>
      <PageHeader title="Job profitability" subtitle={`${rows.length} sold job${rows.length === 1 ? "" : "s"} · ${money(tot.contract)} contract · ${money(tm.gp)} GP · ${tm.pct}% margin`} actions={<LinkButton variant="secondary" href="/app/reports">All reports</LinkButton>} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Sold from"><Input type="date" name="from" defaultValue={from ?? ""} /></Field>
        <Field label="to"><Input type="date" name="to" defaultValue={to ?? ""} /></Field>
        {!isSalesRep && (
          <Field label="Rep">
            <Select name="rep" defaultValue={rep ?? ""} className="w-auto">
              <option value="">All reps</option>
              {(members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
            </Select>
          </Field>
        )}
        <input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={dir} />
        <button className="min-h-9 rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-slate-300">Filter</button>
      </form>
      {rows.length === 0 ? <p className="text-sm text-slate-500">No sold jobs match.</p> : (
        <Table>
          <thead><tr>{sortTh("date", "Sold")}<th className={th}>Job</th>{isAdmin && <th className={th}>Rep</th>}{sortTh("contract", "Contract", true)}{sortTh("cost", "Costs", true)}{sortTh("gp", "GP", true)}{sortTh("margin", "Margin", true)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={cx(td, "whitespace-nowrap")}>{date(r.date, { month: "short", day: "numeric", year: "2-digit" })}</td>
                <td className={td}><Link className="font-medium hover:text-brand-600" href={`/app/jobs/${r.id}/costs`}>{r.customers?.name}</Link><span className="block text-xs text-slate-500">{r.title} · {STAGE_LABEL[r.stage]}</span></td>
                {isAdmin && <td className={td}>{r.sales_rep_id ? name.get(r.sales_rep_id) : <span className="text-slate-400">—</span>}</td>}
                <td className={cx(td, "text-right")}>{money(r.f.contractValue)}</td>
                <td className={cx(td, "text-right")}>{money(r.f.actualCost)}{r.f.actualCost === 0 && <span className="block text-xs text-slate-400">budget {money(r.f.budgetCost)}</span>}</td>
                <td className={cx(td, "text-right font-medium")}>{money(r.gp)}</td>
                <td className={cx(td, "text-right font-medium", r.f.actualCost !== 0 && r.pct < min ? "text-red-700" : "text-slate-900")}>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">Contract = accepted quote (as priced by the estimating module) + approved change orders + approved variation requests. Costs = posted job cost lines (net of credits). Red margin is below your {min}% minimum.</p>
    </>
  );
}
