// Production & operations: readiness gating, working-day math, rain-day planning,
// crew pay, job-cost budgets and commissions. Pure functions (no I/O) so they are unit-tested.
import { normalizeMeasurements, pitchFactor, round2 } from "./roof";

// ---------------------------------------------------------------------------
// Readiness (contract 9)
// ---------------------------------------------------------------------------
export const PERMIT_STATUSES = ["needed", "applied", "approved", "not_needed"] as const;
export const HOA_STATUSES = ["needed", "submitted", "approved", "not_needed"] as const;
export const MATERIALS_STATUSES = ["not_ordered", "ordered", "delivered"] as const;
export const DUMPSTER_STATUSES = ["needed", "ordered", "delivered", "removed", "not_needed"] as const;
export const DELIVERY_TYPES = ["roof_load", "ground_drop"] as const;

export type ReadinessJob = {
  permit_status: string;
  hoa_status: string;
  colors_confirmed: boolean;
  shingle_color?: string | null;
  materials_status: string;
  dumpster_status: string;
  scheduled_start: string | null;
};

export type ReadinessCtx = {
  /** Material orders on the job (any status). */
  orders?: { status: string; delivery_date: string | null }[];
  /** A deposit invoice that is paid/partial, or any payment recorded on the job. */
  depositReceived: boolean;
};

export type ReadinessKey = "permit" | "hoa" | "colors" | "materials" | "dumpster" | "deposit";
export type ReadinessItem = { key: ReadinessKey; label: string; ok: boolean; detail: string };
export type Readiness = { ready: boolean; items: ReadinessItem[]; blockers: ReadinessItem[]; done: number; total: number };

export const READINESS_LABEL: Record<ReadinessKey, string> = {
  permit: "Permit",
  hoa: "HOA",
  colors: "Colors confirmed",
  materials: "Materials",
  dumpster: "Dumpster",
  deposit: "Deposit",
};

const human = (s: string) => s.replace(/_/g, " ");

/**
 * A job is "ready to lock" when permit (approved or not needed), HOA (approved or not needed),
 * colors confirmed, materials delivered (or ordered with a delivery date on/before the start),
 * dumpster ordered/delivered (or not needed) and a deposit is received.
 */
export function jobReadiness(job: ReadinessJob, ctx: ReadinessCtx): Readiness {
  const orders = (ctx.orders ?? []).filter((o) => o.status !== "cancelled");
  const start = job.scheduled_start;
  const anyDelivered = orders.some((o) => o.status === "delivered");
  const orderedInTime = orders.some(
    (o) => ["sent", "confirmed", "delivered"].includes(o.status) && o.delivery_date && start && o.delivery_date <= start,
  );
  const materialsOk = job.materials_status === "delivered" || anyDelivered || Boolean(orderedInTime);
  let materialsDetail = "Not ordered";
  if (job.materials_status === "delivered" || anyDelivered) materialsDetail = "Delivered";
  else if (orderedInTime) materialsDetail = "Ordered, arrives before start";
  else if (job.materials_status === "ordered" || orders.some((o) => o.status !== "draft")) materialsDetail = start ? "Ordered — delivery date missing or after start" : "Ordered — set a start date";
  else if (orders.length) materialsDetail = "Order drafted, not sent";

  const items: ReadinessItem[] = [
    { key: "permit", label: READINESS_LABEL.permit, ok: ["approved", "not_needed"].includes(job.permit_status), detail: human(job.permit_status) },
    { key: "hoa", label: READINESS_LABEL.hoa, ok: ["approved", "not_needed"].includes(job.hoa_status), detail: human(job.hoa_status) },
    { key: "colors", label: READINESS_LABEL.colors, ok: Boolean(job.colors_confirmed), detail: job.colors_confirmed ? job.shingle_color || "Confirmed" : "Not confirmed with homeowner" },
    { key: "materials", label: READINESS_LABEL.materials, ok: materialsOk, detail: materialsDetail },
    { key: "dumpster", label: READINESS_LABEL.dumpster, ok: ["ordered", "delivered", "not_needed", "removed"].includes(job.dumpster_status), detail: human(job.dumpster_status) },
    { key: "deposit", label: READINESS_LABEL.deposit, ok: ctx.depositReceived, detail: ctx.depositReceived ? "Received" : "Not received" },
  ];
  const blockers = items.filter((i) => !i.ok);
  return { ready: blockers.length === 0, items, blockers, done: items.length - blockers.length, total: items.length };
}

// ---------------------------------------------------------------------------
// Calendar math on plain ISO dates (YYYY-MM-DD), timezone-proof (UTC noon).
// ---------------------------------------------------------------------------
const toDate = (iso: string) => new Date(iso + "T12:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysIso(iso: string, n: number) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
export const dayOfWeek = (iso: string) => toDate(iso).getUTCDay();
export const isWeekend = (iso: string) => [0, 6].includes(dayOfWeek(iso));

/** Move a date forward by N working days (Mon–Fri). A weekend date first rolls to Monday. */
export function addWorkingDays(iso: string, n: number) {
  let d = iso;
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    d = addDaysIso(d, 1);
    if (!isWeekend(d)) left--;
  }
  while (isWeekend(d)) d = addDaysIso(d, 1);
  return d;
}

export function diffDays(a: string, b: string) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

export function mondayOfIso(iso: string) {
  return addDaysIso(iso, -((dayOfWeek(iso) + 6) % 7));
}

export function dateRange(from: string, days: number) {
  return Array.from({ length: days }, (_, i) => addDaysIso(from, i));
}

// ---------------------------------------------------------------------------
// Rain day: shift every job running on the day (for one crew or all) plus that
// crew's later jobs inside the window, by N working days, and unlock them.
// ---------------------------------------------------------------------------
export type ShiftableJob = { id: string; crew_id: string | null; scheduled_start: string | null; scheduled_end: string | null };
export type Shift = { id: string; crew_id: string | null; from: [string, string]; to: [string, string]; reason: "rain_day" | "cascade" };

export function planRainDay(
  jobs: ShiftableJob[],
  opts: { date: string; crewId: string | "all"; days: number; windowDays?: number },
): Shift[] {
  const windowEnd = addDaysIso(opts.date, (opts.windowDays ?? 14) - 1);
  const n = Math.max(1, Math.min(10, Math.round(opts.days)));
  const inCrew = (j: ShiftableJob) => opts.crewId === "all" || j.crew_id === opts.crewId;
  const out: Shift[] = [];
  for (const j of jobs) {
    if (!j.scheduled_start || !inCrew(j)) continue;
    const start = j.scheduled_start;
    const end = j.scheduled_end ?? start;
    const onDay = start <= opts.date && end >= opts.date;
    const later = start > opts.date && start <= windowEnd;
    if (!onDay && !later) continue;
    // A job already under way keeps its start; the rest of it slides.
    const newStart = start < opts.date ? start : addWorkingDays(start, n);
    const newEnd = addWorkingDays(end, n);
    out.push({ id: j.id, crew_id: j.crew_id, from: [start, end], to: [newStart, newEnd < newStart ? newStart : newEnd], reason: onDay ? "rain_day" : "cascade" });
  }
  return out.sort((a, b) => a.from[0].localeCompare(b.from[0]));
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export type DayForecast = { date: string; precipProb: number | null; windMph: number | null; tempMaxF: number | null; code: number | null };
export const RAIN_RISK_PCT = 50;
export const WIND_RISK_MPH = 25;
export function weatherRisk(f: DayForecast | undefined | null): "rain" | "wind" | null {
  if (!f) return null;
  if ((f.precipProb ?? 0) >= RAIN_RISK_PCT) return "rain";
  if ((f.windMph ?? 0) >= WIND_RISK_MPH) return "wind";
  return null;
}

/** Greedy lane packing so overlapping jobs in one crew row stack instead of colliding. */
export function packLanes<T extends { start: string; end: string }>(items: T[]): (T & { lane: number })[] {
  const lanes: string[] = [];
  return [...items]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((it) => {
      let lane = lanes.findIndex((lastEnd) => lastEnd < it.start);
      if (lane === -1) { lane = lanes.length; lanes.push(it.end); } else lanes[lane] = it.end;
      return { ...it, lane };
    });
}

// ---------------------------------------------------------------------------
// Crew pay from the accepted estimate's measurements
// ---------------------------------------------------------------------------
export type CrewPaySheet = {
  rate_per_square: number;
  steep_adder: number;      // per square on 8/12 – 9/12 sections
  high_steep_adder: number; // per square on 10/12 and steeper
  layer_adder: number;      // per square per extra layer beyond the first
  low_slope_rate: number;   // per square on sections under 3/12 (replaces the base rate)
};
export type CrewPayLine = { label: string; squares: number; rate: number; amount: number };

export const LOW_SLOPE_BELOW = 3;

/**
 * Sub pay is computed on installed squares (sloped area, no waste), section by section:
 * base rate (or low-slope rate under 3/12) + steep adder (8–9/12) or high-steep adder (≥10/12),
 * plus an extra-layer adder per square for each tear-off layer beyond the first.
 */
export function crewPay(rawMeasurements: unknown, sheet: CrewPaySheet): { lines: CrewPayLine[]; total: number; squares: number } {
  const m = normalizeMeasurements(rawMeasurements);
  const r = (n: unknown) => Number(n) || 0;
  let base = 0, low = 0, steep = 0, high = 0;
  for (const s of m.sections) {
    const sq = (Math.max(0, r(s.area)) * pitchFactor(r(s.pitch))) / 100;
    const p = r(s.pitch);
    if (p < LOW_SLOPE_BELOW) low += sq; else base += sq;
    if (p >= 10) high += sq; else if (p >= 8) steep += sq;
  }
  const total = base + low;
  const extraLayers = Math.max(0, Math.round(m.layers) - 1);
  const lines: CrewPayLine[] = [];
  const add = (label: string, squares: number, rate: number) => {
    if (squares > 0 && rate > 0) lines.push({ label, squares: round2(squares), rate, amount: round2(squares * rate) });
  };
  add("Install (per square)", base, r(sheet.rate_per_square));
  add("Low-slope (under 3/12)", low, r(sheet.low_slope_rate));
  add("Steep adder (8–9/12)", steep, r(sheet.steep_adder));
  add("High-steep adder (10/12+)", high, r(sheet.high_steep_adder));
  if (extraLayers > 0) add(`Extra layer tear-off ×${extraLayers}`, total * extraLayers, r(sheet.layer_adder));
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), squares: round2(total) };
}

// ---------------------------------------------------------------------------
// Job cost budget vs actual
// ---------------------------------------------------------------------------
export const COST_CATEGORIES = ["materials", "labor", "dumpster", "permit", "dealer_fee", "equipment", "supplement_fee", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export type BudgetItem = { quantity: number; unit_cost: number; category: string; calc_key?: string | null };

export function costCategoryFor(item: { category: string; calc_key?: string | null }): CostCategory {
  if (item.calc_key === "dumpster") return "dumpster";
  if (item.calc_key === "permit") return "permit";
  if (item.category === "material") return "materials";
  if (item.category === "labor") return "labor";
  return "other";
}

export function budgetByCategory(items: BudgetItem[]): Record<CostCategory, number> {
  const out = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;
  for (const i of items) out[costCategoryFor(i)] += round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0));
  for (const c of COST_CATEGORIES) out[c] = round2(out[c]);
  return out;
}

export function actualByCategory(costs: { category: string; amount: number }[]): Record<CostCategory, number> {
  const out = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;
  for (const c of costs) {
    const k = (COST_CATEGORIES as readonly string[]).includes(c.category) ? (c.category as CostCategory) : "other";
    out[k] = round2(out[k] + (Number(c.amount) || 0));
  }
  return out;
}

export function margin(contract: number, cost: number) {
  const gp = round2(contract - cost);
  return { gp, pct: contract > 0 ? round2((gp / contract) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------
export type CommissionKind = "pct_contract" | "pct_gross_profit" | "split_10_50_50";
export const COMMISSION_KIND_LABEL: Record<CommissionKind, string> = {
  pct_contract: "% of contract",
  pct_gross_profit: "% of gross profit",
  split_10_50_50: "10/50/50 split (on gross profit)",
};

export type CommissionInput = {
  contractValue: number;
  /** Actual job costs posted (net of credits). */
  actualCost: number;
  /** Budgeted cost from the accepted estimate (used until actual costs are posted). */
  budgetCost: number;
  signed: boolean;
  completed: boolean;
  paidInFull: boolean;
};

export type CommissionResult = {
  base: number;             // amount the rate applies to
  costBasis: number;
  costBasisSource: "actual" | "budget";
  total: number;            // full commission at the current numbers
  earned: number;           // portion earned so far (milestones reached)
  stages: { label: string; amount: number; reached: boolean }[];
};

/**
 * - pct_contract: rate% × contract value, earned when the job is completed.
 * - pct_gross_profit: rate% × gross profit (contract − costs, floored at 0), earned at completion.
 * - split_10_50_50: total = rate% × gross profit, paid in three milestones:
 *   10% of that commission as an advance once the contract is signed, then 50% of the
 *   remaining 90% at completion and the last 50% of it when the customer has paid in full.
 * Gross profit uses actual posted costs; until any cost is posted it uses the estimate budget.
 */
export function computeCommission(plan: { kind: CommissionKind; rate: number }, x: CommissionInput): CommissionResult {
  const useActual = x.actualCost !== 0;
  const costBasis = round2(useActual ? x.actualCost : x.budgetCost);
  const gp = Math.max(0, round2(x.contractValue - costBasis));
  const rate = (Number(plan.rate) || 0) / 100;
  const base = plan.kind === "pct_contract" ? round2(x.contractValue) : gp;
  const total = round2(base * rate);
  let stages: CommissionResult["stages"];
  if (plan.kind === "split_10_50_50") {
    const adv = round2(total * 0.1);
    const atCompletion = round2((total - adv) / 2);
    const atFinal = round2(total - adv - atCompletion);
    stages = [
      { label: "Advance at signing (10%)", amount: adv, reached: x.signed },
      { label: "At completion (50% of remainder)", amount: atCompletion, reached: x.completed },
      { label: "At final payment (50% of remainder)", amount: atFinal, reached: x.paidInFull },
    ];
  } else {
    stages = [{ label: "At completion", amount: total, reached: x.completed }];
  }
  const earned = round2(stages.filter((s) => s.reached).reduce((s, st) => s + st.amount, 0));
  return { base, costBasis, costBasisSource: useActual ? "actual" : "budget", total, earned, stages };
}

/** Net paid to a rep: chargebacks reduce what has been paid. */
export function netPaid(payouts: { kind: string; amount: number }[]) {
  return round2(payouts.reduce((s, p) => s + (p.kind === "chargeback" ? -1 : 1) * (Number(p.amount) || 0), 0));
}

/** Days until a date (negative when past). */
export function daysUntil(iso: string | null | undefined, today: string) {
  if (!iso) return null;
  return diffDays(today, iso);
}
