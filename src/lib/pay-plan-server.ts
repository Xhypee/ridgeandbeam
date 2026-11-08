import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAuState, AU_STATE_TZ } from "./au";
import { calendarDate } from "./au-business-days";
import { validateSchedule } from "./claims-billing";
import { loadJobCompliance } from "./job-compliance-server";
import { depositLimit, PAY_METHODS, round2, type PayMethod } from "./pay-plan";
import { stripeConfigured } from "./stripe";
import type { Organization } from "./types";

export const PLAN_KINDS = ["deposit", "progress", "final", "instalment"] as const;

export type PlanInvoice = {
  id: string; number: number; status: string; kind: string; milestone_label: string | null; milestone_trigger: string | null;
  due_date: string | null; issue_date: string; public_token: string; total: number; paid: number; balance: number;
};

export type PlanContext = {
  job: { id: string; title: string; state: string | null; scheduled_end: string | null; scheduled_start: string | null; pay_methods: PayMethod[]; pay_reminders: boolean; public_token: string; customer: { name: string; phone: string | null; email: string | null } };
  contract: { estimateId: string; total: number; number: number | null } | null;
  invoices: PlanInvoice[];
  /** Parts that already have money against them: kept as they are. */
  locked: PlanInvoice[];
  /** What's left to plan (contract total minus locked parts). */
  remaining: number;
  /** State deposit cap for this contract (null = no legal cap) and what may still be taken up front. */
  depositCap: number | null;
  depositRoom: number | null;
  depositNote: string | null;
  stateName: string | null;
  schedule: { label: string; pct: number; trigger: string }[];
  today: string;
  /** Where instalments start from: the planned finish, else today. */
  start: string;
};

export async function loadPlanContext(supabase: SupabaseClient, org: Organization, jobId: string): Promise<PlanContext | null> {
  const [{ data: job }, { data: invRows }, comp, { data: orgRow }] = await Promise.all([
    supabase.from("jobs").select("id, title, state, scheduled_start, scheduled_end, pay_methods, pay_reminders, public_token, customers(name, phone, email, state)").eq("id", jobId).maybeSingle(),
    supabase.from("invoices").select("id, number, status, kind, milestone_label, milestone_trigger, due_date, issue_date, public_token, invoice_totals(total, paid, balance)").eq("job_id", jobId).in("kind", PLAN_KINDS as unknown as string[]).neq("status", "void").order("number"),
    loadJobCompliance(supabase, org, jobId),
    supabase.from("organizations").select("payment_schedule").eq("id", org.id).single(),
  ]);
  if (!job) return null;
  const customer = (job.customers ?? {}) as unknown as { name: string; phone: string | null; email: string | null; state: string | null };
  const invoices: PlanInvoice[] = (invRows ?? []).map((r) => {
    const t = (Array.isArray(r.invoice_totals) ? r.invoice_totals[0] : r.invoice_totals) as { total: number; paid: number; balance: number } | null;
    return { ...(r as unknown as PlanInvoice), total: Number(t?.total ?? 0), paid: Number(t?.paid ?? 0), balance: Number(t?.balance ?? 0) };
  });
  const locked = invoices.filter((i) => i.paid > 0);
  const contractTotal = comp?.valueSource === "accepted" ? comp.value : null;
  let contract: PlanContext["contract"] = null;
  if (contractTotal !== null) {
    const { data: est } = await supabase.from("estimates").select("id, number").eq("job_id", jobId).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
    contract = { estimateId: est?.id ?? "", total: round2(contractTotal), number: est?.number ?? null };
  }
  const lockedTotal = round2(locked.reduce((a, i) => a + i.total, 0));
  const depositCap = depositLimit(comp?.rules?.deposit);
  const paidUpFront = round2(locked.filter((i) => i.milestone_trigger === "signed").reduce((a, i) => a + i.total, 0));
  const state = asAuState(job.state) ?? asAuState(customer.state) ?? asAuState(org.state);
  const today = calendarDate(new Date(), AU_STATE_TZ[state ?? "NSW"]);
  const sched = validateSchedule(orgRow?.payment_schedule);
  const methods = ((job.pay_methods ?? []) as string[]).filter((m): m is PayMethod => (PAY_METHODS as readonly string[]).includes(m));
  return {
    job: { id: job.id, title: job.title, state, scheduled_start: job.scheduled_start, scheduled_end: job.scheduled_end, pay_methods: methods, pay_reminders: job.pay_reminders !== false, public_token: job.public_token, customer: { name: customer.name, phone: customer.phone, email: customer.email } },
    contract,
    invoices,
    locked,
    remaining: contract ? round2(contract.total - lockedTotal) : 0,
    depositCap,
    depositRoom: depositCap === null ? null : round2(Math.max(0, depositCap - paidUpFront)),
    depositNote: comp?.rules?.deposit.isLegalLimit ? comp.rules.deposit.note : null,
    stateName: comp?.rules?.stateName ?? null,
    schedule: sched.ok ? sched.steps : [],
    today,
    start: job.scheduled_end && job.scheduled_end > today ? job.scheduled_end : today,
  };
}

/** The ways this customer can really pay: card only once the company can take cards online. */
export function effectiveMethods(methods: string[], onlineReady: boolean): PayMethod[] {
  return methods.filter((m): m is PayMethod => (PAY_METHODS as readonly string[]).includes(m) && (m !== "card" || (onlineReady && stripeConfigured())));
}
