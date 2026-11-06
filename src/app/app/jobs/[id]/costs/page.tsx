import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money } from "@/lib/format";
import { actualByCategory, budgetByCategory, COST_CATEGORIES, margin } from "@/lib/production";
import { jobFinancials } from "@/lib/production-data";
import { deleteCost, saveCost } from "./actions";

export const metadata: Metadata = { title: "Job cost" };

type Cost = { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; source: string };

function CostFields({ c, jobId }: { c?: Cost; jobId: string }) {
  return (
    <>
      <input type="hidden" name="job_id" value={jobId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Category">
          <Select name="category" defaultValue={c?.category ?? "materials"}>
            {COST_CATEGORIES.map((k) => <option key={k} value={k}>{label(k)}</option>)}
          </Select>
        </Field>
        <Field label="Vendor"><Input name="vendor" defaultValue={c?.vendor ?? ""} placeholder="ABC Supply" /></Field>
        <Field label="Description" className="sm:col-span-1"><Input name="description" defaultValue={c?.description ?? ""} /></Field>
        <Field label="Amount" hint="Negative = credit"><Input name="amount" type="number" step="0.01" defaultValue={c?.amount ?? ""} required /></Field>
        <Field label="Date"><Input name="incurred_on" type="date" defaultValue={c?.incurred_on ?? isoDate(new Date())} /></Field>
      </div>
    </>
  );
}

export default async function CostsPage({ params }: PageProps<"/app/jobs/[id]/costs">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const { data: job } = await supabase.from("jobs").select("id").eq("id", id).maybeSingle();
  if (!job) notFound();
  const f = (await jobFinancials(supabase, [id])).get(id)!;
  const budget = budgetByCategory(f.estimate?.items ?? []);
  const actual = actualByCategory(f.costs);
  const totalBudget = f.budgetCost;
  const { gp, pct } = margin(f.contractValue, f.actualCost);
  const budgetMargin = margin(f.contractValue, totalBudget);
  const min = Number(org.min_margin_pct);
  const below = f.contractValue > 0 && f.actualCost !== 0 && pct < min;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "Contract value", v: money(f.contractValue), sub: f.estimate ? `Estimate #${f.estimate.number} pre-tax${f.changeOrders ? ` + ${money(f.changeOrders)} change orders` : ""}${f.approvedSupplements ? ` + ${money(f.approvedSupplements)} supplements` : ""}` : "No accepted estimate" },
          { k: "Budgeted cost", v: money(totalBudget), sub: `Budget margin ${budgetMargin.pct}%` },
          { k: "Actual cost", v: money(f.actualCost), sub: `${f.costs.length} line${f.costs.length === 1 ? "" : "s"}` },
          { k: "Gross profit", v: money(gp), sub: `${pct}% margin · target ${min}%`, tone: below ? "red" : "green" },
        ].map((x) => (
          <div key={x.k} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">{x.k}</p>
            <p className={cx("mt-1 text-xl font-semibold", x.tone === "red" ? "text-red-700" : "text-slate-900")} data-testid={`kpi-${x.k.toLowerCase().replace(/ /g, "-")}`}>{x.v}</p>
            <p className="truncate text-xs text-slate-500">{x.sub}</p>
          </div>
        ))}
      </div>
      {below && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Margin is below the company minimum of {min}%.</p>}
      {f.pendingSupplements > 0 && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">{money(f.pendingSupplements)} in submitted supplements is pending with the carrier and not counted yet.</p>}

      <Card title="Budget vs actual">
        <div className="-m-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Category</th><th className={cx(th, "text-right")}>Budget</th><th className={cx(th, "text-right")}>Actual</th><th className={cx(th, "text-right")}>Variance</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {COST_CATEGORIES.filter((c) => budget[c] || actual[c]).map((c) => {
                const v = Math.round((actual[c] - budget[c]) * 100) / 100;
                return (
                  <tr key={c}>
                    <td className={td}>{label(c)}</td>
                    <td className={cx(td, "text-right")}>{money(budget[c])}</td>
                    <td className={cx(td, "text-right")}>{money(actual[c])}</td>
                    <td className={cx(td, "text-right", v > 0 ? "text-red-700" : "text-green-700")}>{v > 0 ? "+" : ""}{money(v)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold"><td className={td}>Total</td><td className={cx(td, "text-right")}>{money(totalBudget)}</td><td className={cx(td, "text-right")}>{money(f.actualCost)}</td><td className={cx(td, "text-right")}>{money(f.actualCost - totalBudget)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-slate-500">Budget = accepted estimate unit cost × quantity (plus approved change-order costs). Actual = every cost line below, including negative credits from returns.</p>
      </Card>

      <Card title="Add a cost">
        <ActionForm action={saveCost} className="space-y-3">
          <CostFields jobId={id} />
          <SubmitButton>Add cost</SubmitButton>
        </ActionForm>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Cost lines</h2>
        {f.costs.length === 0 ? <p className="text-sm text-slate-500">No costs yet. Delivered material orders, crew pay and credited returns post here automatically.</p> : (
          <Table>
            <thead><tr><th className={th}>Date</th><th className={th}>Category</th><th className={th}>Vendor / description</th><th className={cx(th, "text-right")}>Amount</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {f.costs.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className={cx(td, "whitespace-nowrap")}>{date(c.incurred_on, { month: "short", day: "numeric" })}</td>
                  <td className={td}>{label(c.category)}{c.source !== "manual" && <span className="ml-1"><Badge tone="blue">{label(c.source)}</Badge></span>}</td>
                  <td className={td}><span className="font-medium">{c.vendor}</span> <span className="text-slate-500">{c.description}</span>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand-600">Edit</summary>
                      <ActionForm action={saveCost} className="mt-2 space-y-2">
                        <CostFields c={c} jobId={id} />
                        <SubmitButton variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    </details>
                  </td>
                  <td className={cx(td, "whitespace-nowrap text-right font-medium", c.amount < 0 && "text-green-700")}>{money(c.amount)}</td>
                  <td className={td}>
                    <form action={deleteCost}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="job_id" value={id} />
                      <SubmitButton variant="ghost" confirm="Delete this cost line?">✕</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
