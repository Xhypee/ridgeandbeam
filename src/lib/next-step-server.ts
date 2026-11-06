import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobReadiness, type ReadinessJob } from "./production";
import { isoDate } from "./format";
import { EMPTY_INVOICES, type NextStepCtx, type NextStepEstimate, type NextStepJob } from "./next-step";

/** Columns a job row needs for nextStep/jobSteps (select these plus customers(name, phone)). */
export const NEXT_STEP_JOB_COLS =
  "id, stage, is_insurance, lead_received_at, first_contacted_at, stage_changed_at, scheduled_start, scheduled_end, schedule_locked, completed_at, walkthrough_signed_at, warranty_registered_at, review_requested_at, permit_status, hoa_status, colors_confirmed, shingle_color, materials_status, dumpster_status";

type JobRow = NextStepJob & { customers?: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Flattens the embedded customer into customer_name/customer_phone. */
export function asNextStepJob(j: JobRow): NextStepJob {
  const c = one(j.customers);
  return { ...j, customer_name: j.customer_name ?? c?.name ?? null, customer_phone: j.customer_phone ?? c?.phone ?? null };
}

// Keep `in (...)` lists short so request URLs stay well under proxy limits.
async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await run(ids.slice(i, i + 120));
    out.push(...(data ?? []));
  }
  return out;
}

const RANK: Record<string, number> = { accepted: 4, sent: 3, draft: 2, declined: 1 };

/**
 * Loads everything nextStep needs for many jobs at once: the most relevant quote (+ total), claim, open
 * variation request, readiness (material orders + deposit), invoice balances, warranty and review flags.
 * Pass `photos: true` to also count photos (one job page; it's a count per job).
 */
export async function loadNextStepCtx(supabase: SupabaseClient, jobs: NextStepJob[], opts: { photos?: boolean; now?: Date } = {}): Promise<Map<string, NextStepCtx>> {
  const out = new Map<string, NextStepCtx>();
  const ids = jobs.map((j) => j.id);
  if (ids.length === 0) return out;
  const today = isoDate(opts.now ?? new Date());

  const [estimates, claims, orders, invoices] = await Promise.all([
    inChunks<{ id: string; job_id: string; number: number; status: string; sent_at: string | null; accepted_at: string | null; created_at: string }>(ids, (c) =>
      supabase.from("estimates").select("id, job_id, number, status, sent_at, accepted_at, created_at").in("job_id", c).order("created_at", { ascending: false })),
    inChunks<{ id: string; job_id: string; stage: string; stage_changed_at: string | null; carrier: string | null; claim_number: string | null }>(ids, (c) =>
      supabase.from("claims").select("id, job_id, stage, stage_changed_at, carrier, claim_number").in("job_id", c)),
    inChunks<{ job_id: string; status: string; delivery_date: string | null }>(ids, (c) => supabase.from("material_orders").select("job_id, status, delivery_date").in("job_id", c)),
    inChunks<{ id: string; job_id: string; kind: string; status: string; due_date: string | null }>(ids, (c) =>
      supabase.from("invoices").select("id, job_id, kind, status, due_date").in("job_id", c)),
  ]);

  // Pick one quote per job: accepted > sent > draft > declined, newest first within a rank.
  const best = new Map<string, (typeof estimates)[number]>();
  for (const e of estimates) {
    const cur = best.get(e.job_id);
    if (!cur || (RANK[e.status] ?? 0) > (RANK[cur.status] ?? 0)) best.set(e.job_id, e);
  }
  const estIds = [...best.values()].map((e) => e.id);
  const claimIds = claims.map((c) => c.id);
  const invIds = invoices.map((v) => v.id);
  const [estTotals, variations, invTotals, photos] = await Promise.all([
    inChunks<{ estimate_id: string; total: number }>(estIds, (c) => supabase.from("estimate_totals").select("estimate_id, total").in("estimate_id", c)),
    inChunks<{ id: string; claim_id: string; status: string; submitted_on: string | null; next_follow_up_on: string | null; requested_amount: number; round: number }>(claimIds, (c) =>
      supabase.from("supplements").select("id, claim_id, status, submitted_on, next_follow_up_on, requested_amount, round").in("claim_id", c).eq("status", "submitted")),
    inChunks<{ invoice_id: string; total: number; paid: number; balance: number }>(invIds, (c) => supabase.from("invoice_totals").select("invoice_id, total, paid, balance").in("invoice_id", c)),
    opts.photos
      ? Promise.all(ids.map(async (id) => [id, (await supabase.from("job_files").select("id", { count: "exact", head: true }).eq("job_id", id).eq("kind", "photo")).count ?? 0] as const))
      : Promise.resolve([] as (readonly [string, number])[]),
  ]);

  const estTotal = new Map(estTotals.map((t) => [t.estimate_id, Number(t.total)]));
  const claimByJob = new Map(claims.map((c) => [c.job_id, c]));
  const varByClaim = new Map<string, (typeof variations)[number]>();
  for (const v of variations) {
    const cur = varByClaim.get(v.claim_id);
    if (!cur || v.round > cur.round) varByClaim.set(v.claim_id, v);
  }
  const invTotal = new Map(invTotals.map((t) => [t.invoice_id, t]));
  const photoCount = new Map(photos);
  const group = <T extends { job_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.job_id, [...(m.get(r.job_id) ?? []), r]);
    return m;
  };
  const invByJob = group(invoices);
  const ordersByJob = group(orders);

  for (const j of jobs) {
    const e = best.get(j.id);
    const estimate: NextStepEstimate | null = e ? { id: e.id, number: e.number, status: e.status, total: estTotal.get(e.id) ?? 0, sent_at: e.sent_at, accepted_at: e.accepted_at } : null;
    const claim = claimByJob.get(j.id) ?? null;
    const v = claim ? varByClaim.get(claim.id) ?? null : null;
    const inv = { ...EMPTY_INVOICES };
    let depositReceived = false;
    for (const x of invByJob.get(j.id) ?? []) {
      const t = invTotal.get(x.id);
      const paid = Number(t?.paid ?? 0);
      if ((x.kind === "deposit" && ["paid", "partial"].includes(x.status)) || paid > 0) depositReceived = true;
      if (x.status === "void" || x.status === "draft") continue;
      inv.count++;
      inv.billed += Number(t?.total ?? 0);
      inv.paid += paid;
      const bal = Math.max(0, Number(t?.balance ?? 0));
      inv.balance += bal;
      if (bal > 0 && x.due_date && x.due_date < today) inv.overdue++;
    }
    const readiness = j.permit_status !== undefined
      ? jobReadiness(j as ReadinessJob, { orders: ordersByJob.get(j.id) ?? [], depositReceived })
      : null;
    out.set(j.id, {
      estimate,
      claim: claim ? { id: claim.id, stage: claim.stage, stage_changed_at: claim.stage_changed_at, carrier: claim.carrier, claim_number: claim.claim_number } : null,
      variation: v ? { id: v.id, status: v.status, submitted_on: v.submitted_on, next_follow_up_on: v.next_follow_up_on, requested_amount: Number(v.requested_amount) } : null,
      readiness,
      invoices: inv,
      warrantyRegistered: Boolean(j.warranty_registered_at),
      reviewRequested: Boolean(j.review_requested_at),
      photos: photoCount.get(j.id),
      now: opts.now,
    });
  }
  return out;
}
