import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { money } from "@/lib/format";
import { COMMISSION_KIND_LABEL, type CommissionKind } from "@/lib/production";
import { deleteCommissionPlan, saveCommissionPlan } from "../actions";

export const metadata: Metadata = { title: "Commissions" };

type Plan = { id: string; name: string; kind: CommissionKind; rate: number; draw_amount: number };

function PlanFields({ p }: { p?: Plan }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Plan name" className="sm:col-span-2"><Input name="name" defaultValue={p?.name ?? ""} placeholder="Retail reps — 10% of contract" required /></Field>
      <Field label="Type">
        <Select name="kind" defaultValue={p?.kind ?? "pct_contract"}>
          {(Object.keys(COMMISSION_KIND_LABEL) as CommissionKind[]).map((k) => <option key={k} value={k}>{COMMISSION_KIND_LABEL[k]}</option>)}
        </Select>
      </Field>
      <Field label="Rate %"><Input name="rate" type="number" step="0.01" min="0" max="100" defaultValue={p?.rate ?? 10} /></Field>
      <Field label="Draw per period $" hint="Advanced against commission"><Input name="draw_amount" type="number" step="0.01" min="0" defaultValue={p?.draw_amount ?? 0} /></Field>
    </div>
  );
}

export default async function Page() {
  const { supabase, isAdmin } = await requireOrg();
  if (!isAdmin) redirect("/app/reports/commissions");
  const [{ data: plans }, { data: members }] = await Promise.all([
    supabase.from("commission_plans").select("*").order("name"),
    supabase.from("memberships").select("commission_plan_id"),
  ]);
  const used = (id: string) => (members ?? []).filter((m) => m.commission_plan_id === id).length;
  return (
    <div className="space-y-6">
      <Card title="How commissions are calculated">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li><b>Contract value</b> = the accepted estimate&apos;s pre-tax price + approved change orders + approved insurance supplements. Pending (submitted) supplements are shown but not paid on.</li>
          <li><b>Gross profit</b> = contract value − every cost line on the job (materials net of return credits, crew pay, skip bins, council fees, finance fees…). Until any cost is posted, the estimate&apos;s budgeted cost is used.</li>
          <li><b>% of contract</b>: rate × contract value, earned when the job is marked completed.</li>
          <li><b>% of gross profit</b>: rate × gross profit, earned at completion.</li>
          <li><b>10/50/50 split</b>: total commission = rate × gross profit, paid in three parts — <b>10%</b> of it as an advance when the contract is signed, <b>50% of the remaining 90%</b> when the job is completed, and the last <b>50%</b> when the customer has paid in full.</li>
          <li><b>Draws</b> are recorded as payouts and netted against earned commission; <b>chargebacks</b> reduce what has been paid (e.g. a cancelled job after an advance).</li>
          <li>A job counts toward a rep only when it has a sales rep assigned.</li>
        </ul>
      </Card>
      {((plans ?? []) as Plan[]).map((p) => (
        <Card key={p.id} title={`${p.name} · ${COMMISSION_KIND_LABEL[p.kind]} ${p.rate}%${Number(p.draw_amount) ? ` · draw ${money(p.draw_amount)}` : ""}`} actions={<span className="text-xs text-slate-500">{used(p.id)} member{used(p.id) === 1 ? "" : "s"}</span>}>
          <ActionForm action={saveCommissionPlan} className="space-y-3">
            <PlanFields p={p} />
            <SubmitButton variant="secondary">Save plan</SubmitButton>
          </ActionForm>
          <form action={deleteCommissionPlan} className="mt-2 text-right">
            <input type="hidden" name="id" value={p.id} />
            <SubmitButton variant="ghost" confirm="Delete this plan? Members on it will have no plan.">Delete</SubmitButton>
          </form>
        </Card>
      ))}
      <Card title="Add a plan">
        <ActionForm action={saveCommissionPlan} className="space-y-3">
          <PlanFields />
          <SubmitButton>Add plan</SubmitButton>
        </ActionForm>
        <p className="mt-3 text-xs text-slate-500">Assign plans to people in Settings → Team.</p>
      </Card>
    </div>
  );
}
