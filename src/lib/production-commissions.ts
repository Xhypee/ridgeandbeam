import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/roof";
import { computeCommission, margin, netPaid, type CommissionKind, type CommissionResult } from "@/lib/production";
import { jobFinancials, type JobFinancials } from "@/lib/production-data";

export type Payout = { id: string; user_id: string; job_id: string | null; kind: string; amount: number; paid_on: string; notes: string | null };
export type StatementJob = {
  id: string; title: string; customer: string; stage: string; acceptedAt: string | null;
  fin: JobFinancials; gp: number; marginPct: number; commission: CommissionResult | null;
  paid: number; payable: number; payouts: Payout[];
};
export type Statement = {
  rep: { user_id: string; name: string; role: string };
  plan: { id: string; name: string; kind: CommissionKind; rate: number; draw_amount: number } | null;
  jobs: StatementJob[];
  unassignedPayouts: Payout[];
  totals: { contract: number; earned: number; paid: number; payable: number; pendingSupplements: number };
};

/** Commission statements for the given reps (or every member with a plan or a rep'd job when `repIds` is null). */
export async function buildStatements(supabase: SupabaseClient, orgId: string, repIds: string[] | null): Promise<Statement[]> {
  let mq = supabase.from("memberships").select("user_id, role, full_name, email, commission_plan_id").eq("org_id", orgId);
  if (repIds) mq = mq.in("user_id", repIds);
  let jq = supabase.from("jobs").select("id, title, stage, sales_rep_id, completed_at, customers(name)").eq("org_id", orgId).not("sales_rep_id", "is", null);
  if (repIds) jq = jq.in("sales_rep_id", repIds);
  let pq = supabase.from("commission_payouts").select("id, user_id, job_id, kind, amount, paid_on, notes").eq("org_id", orgId).order("paid_on");
  if (repIds) pq = pq.in("user_id", repIds);
  const [{ data: members }, { data: plans }, { data: jobs }, { data: payouts }] = await Promise.all([
    mq, supabase.from("commission_plans").select("id, name, kind, rate, draw_amount").eq("org_id", orgId), jq, pq,
  ]);
  const jobList = (jobs ?? []) as unknown as { id: string; title: string; stage: string; sales_rep_id: string; completed_at: string | null; customers: { name: string } | null }[];
  const fin = await jobFinancials(supabase, jobList.map((j) => j.id));
  const planById = new Map((plans ?? []).map((p) => [p.id, { ...p, rate: Number(p.rate), draw_amount: Number(p.draw_amount) }]));
  const pays = ((payouts ?? []) as Payout[]).map((p) => ({ ...p, amount: Number(p.amount) }));

  const out: Statement[] = [];
  for (const m of members ?? []) {
    const myJobs = jobList.filter((j) => j.sales_rep_id === m.user_id);
    const myPays = pays.filter((p) => p.user_id === m.user_id);
    if (!repIds && !m.commission_plan_id && myJobs.length === 0 && myPays.length === 0) continue;
    const plan = m.commission_plan_id ? planById.get(m.commission_plan_id) ?? null : null;
    const sj: StatementJob[] = [];
    for (const j of myJobs) {
      const f = fin.get(j.id)!;
      const jobPays = myPays.filter((p) => p.job_id === j.id);
      if (!f.estimate && jobPays.length === 0) continue; // nothing sold yet
      const signed = Boolean(f.estimate) && j.stage !== "lost";
      const completed = ["completed", "paid"].includes(j.stage) || (Boolean(j.completed_at) && j.stage !== "lost");
      const paidInFull = j.stage === "paid" || f.paidInFull;
      const commission = plan ? computeCommission(plan, { contractValue: f.contractValue, actualCost: f.actualCost, budgetCost: f.budgetCost, signed, completed, paidInFull }) : null;
      const mg = margin(f.contractValue, commission?.costBasis ?? f.actualCost);
      const paid = netPaid(jobPays);
      sj.push({
        id: j.id, title: j.title, customer: j.customers?.name ?? "", stage: j.stage, acceptedAt: f.estimate?.acceptedAt ?? null,
        fin: f, gp: mg.gp, marginPct: mg.pct, commission, paid, payable: round2((commission?.earned ?? 0) - paid), payouts: jobPays,
      });
    }
    const unassigned = myPays.filter((p) => !p.job_id || !sj.some((j) => j.id === p.job_id));
    const earned = round2(sj.reduce((s, j) => s + (j.commission?.earned ?? 0), 0));
    const paid = round2(sj.reduce((s, j) => s + j.paid, 0) + netPaid(unassigned));
    out.push({
      rep: { user_id: m.user_id, name: m.full_name || m.email || "Member", role: m.role },
      plan,
      jobs: sj,
      unassignedPayouts: unassigned,
      totals: {
        contract: round2(sj.reduce((s, j) => s + j.fin.contractValue, 0)),
        earned, paid, payable: round2(earned - paid),
        pendingSupplements: round2(sj.reduce((s, j) => s + j.fin.pendingSupplements, 0)),
      },
    });
  }
  return out;
}
