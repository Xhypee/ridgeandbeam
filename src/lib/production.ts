// Production & operations: readiness gating, working-day math, rain-day planning,
// crew pay (metric), job-cost budgets and commissions. Pure functions (no I/O) so they are unit-tested.
import { EXISTING_ROOF_LABEL, normalizeMeasurements, round2, trueArea, type JobType } from "./roof";

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
  permit: "Council / building approval",
  hoa: "Strata / body corporate",
  colors: "Colour & profile confirmed",
  materials: "Materials",
  dumpster: "Skip bin",
  deposit: "Deposit",
};

/** Plain Australian wording for the readiness status values (DB values stay as they are). */
export const READINESS_STATUS_LABEL: Record<"permit" | "hoa" | "materials" | "dumpster", Record<string, string>> = {
  permit: { needed: "Needed", applied: "Lodged", approved: "Approved", not_needed: "Not needed" },
  hoa: { needed: "Needed", submitted: "Submitted", approved: "Approved", not_needed: "Not needed" },
  materials: { not_ordered: "Not ordered", ordered: "Ordered", delivered: "Delivered" },
  dumpster: { needed: "Needed", ordered: "Booked", delivered: "On site", removed: "Collected", not_needed: "Not needed" },
};
export const statusLabel = (gate: keyof typeof READINESS_STATUS_LABEL, value: string) =>
  READINESS_STATUS_LABEL[gate][value] ?? value.replace(/_/g, " ");

/**
 * A job is "ready to lock" when council / building approval (approved or not needed), strata / body corporate
 * approval (approved or not needed), colour & profile confirmed, materials delivered (or ordered with a delivery
 * date on/before the start), skip bin booked/on site (or not needed) and a deposit is received.
 * Whether a council or building approval is needed is state law: the compliance rules decide that, not this check.
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
    { key: "permit", label: READINESS_LABEL.permit, ok: ["approved", "not_needed"].includes(job.permit_status), detail: statusLabel("permit", job.permit_status) },
    { key: "hoa", label: READINESS_LABEL.hoa, ok: ["approved", "not_needed"].includes(job.hoa_status), detail: statusLabel("hoa", job.hoa_status) },
    { key: "colors", label: READINESS_LABEL.colors, ok: Boolean(job.colors_confirmed), detail: job.colors_confirmed ? job.shingle_color || "Confirmed" : "Not confirmed with the homeowner" },
    { key: "materials", label: READINESS_LABEL.materials, ok: materialsOk, detail: materialsDetail },
    { key: "dumpster", label: READINESS_LABEL.dumpster, ok: ["ordered", "delivered", "not_needed", "removed"].includes(job.dumpster_status), detail: statusLabel("dumpster", job.dumpster_status) },
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
/** One day of forecast: rain chance %, max wind km/h, max temperature °C. */
export type DayForecast = { date: string; precipProb: number | null; windKmh: number | null; tempMaxC: number | null; code: number | null };
export const RAIN_RISK_PCT = 50;
/** Max wind at or above this (km/h) flags the day: sheets and sarking get hard to handle on the roof. */
export const WIND_RISK_KMH = 40;
export function weatherRisk(f: DayForecast | undefined | null): "rain" | "wind" | null {
  if (!f) return null;
  if ((f.precipProb ?? 0) >= RAIN_RISK_PCT) return "rain";
  if ((f.windKmh ?? 0) >= WIND_RISK_KMH) return "wind";
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
// Crew pay from the accepted estimate's measurements (metric)
// ---------------------------------------------------------------------------
/** A crew's pay sheet (crews.pay_* columns): dollars per m² of true (sloped) roof area, gutters per lineal metre. */
export type CrewPaySheet = {
  pay_rate_m2: number;       // base rate per m²
  pay_low_slope_m2: number;  // replaces the base rate on sections under LOW_SLOPE_BELOW_DEG (0 = use the base rate)
  pay_steep_m2: number;      // adder per m² on sections pitched above the estimate's steep setting (default 25°)
  pay_high_steep_m2: number; // adder per m² from HIGH_STEEP_FROM_DEG (replaces the steep adder)
  pay_strip_m2: number;      // strip and remove the old roof, per m²
  pay_gutter_lm: number;     // new gutter, per lineal metre of eave
};
export const PAY_SHEET_KEYS = ["pay_rate_m2", "pay_low_slope_m2", "pay_steep_m2", "pay_high_steep_m2", "pay_strip_m2", "pay_gutter_lm"] as const satisfies readonly (keyof CrewPaySheet)[];

export const LOW_SLOPE_BELOW_DEG = 10;
export const HIGH_STEEP_FROM_DEG = 40;

export type CrewPayLine = { key: string; label: string; qty: number; unit: "m²" | "lm"; rate: number; amount: number };
export type CrewPay = { lines: CrewPayLine[]; total: number; area: number; steepAboveDeg: number; notes: string[] };

/** Job types where the crew strips the old roof before installing. Asbestos is removed by a licensed removalist. */
const STRIP_JOBS: JobType[] = ["reroof", "tile_to_metal"];

/**
 * Crew pay on true (sloped) roof area, no waste, section by section:
 * base $/m² (or the low-slope rate under 10°), plus a steep adder above the estimate's steep setting
 * (the same threshold as the "Steep roof allowance" line, 25° by default) or a very-steep adder from 40°.
 * Re-roofs add a strip rate per m² when there is an old roof; new gutters are paid per lineal metre of eave.
 * Old imperial measurements are converted by normalizeMeasurements first.
 */
export function crewPay(rawMeasurements: unknown, sheet: Partial<CrewPaySheet>): CrewPay {
  const m = normalizeMeasurements(rawMeasurements);
  const r = (n: unknown) => Math.max(0, Number(n) || 0);
  const steepAbove = r(m.settings.steepAboveDeg);
  const highFrom = Math.max(HIGH_STEEP_FROM_DEG, steepAbove);
  let base = 0, low = 0, steep = 0, high = 0;
  for (const s of m.sections) {
    const a = trueArea(s);
    if (a <= 0) continue;
    const p = Number(s.pitch) || 0;
    if (p < LOW_SLOPE_BELOW_DEG && r(sheet.pay_low_slope_m2) > 0) low += a; else base += a;
    if (p >= highFrom) high += a; else if (p > steepAbove) steep += a;
  }
  const area = base + low;
  const lines: CrewPayLine[] = [];
  const add = (key: string, label: string, qty: number, unit: CrewPayLine["unit"], rate: number) => {
    if (qty > 0 && rate > 0) lines.push({ key, label, qty: round2(qty), unit, rate, amount: round2(round2(qty) * rate) });
  };
  const work = m.jobType === "restoration" ? "Restoration" : m.jobType === "repair" ? "Repairs" : "Install";
  add("base", `${work} (true roof area)`, base, "m²", r(sheet.pay_rate_m2));
  add("low_slope", `Low-slope (under ${LOW_SLOPE_BELOW_DEG}°)`, low, "m²", r(sheet.pay_low_slope_m2));
  add("steep", `Steep adder (over ${steepAbove}°)`, steep, "m²", r(sheet.pay_steep_m2));
  add("high_steep", `Very steep adder (${highFrom}° and over)`, high, "m²", r(sheet.pay_high_steep_m2));
  const notes: string[] = [];
  if (STRIP_JOBS.includes(m.jobType) && m.existingRoof !== "none" && !m.asbestosSuspected) {
    add("strip", `Strip old roof (${EXISTING_ROOF_LABEL[m.existingRoof].toLowerCase()})`, area, "m²", r(sheet.pay_strip_m2));
  }
  if (m.jobType === "asbestos" || m.asbestosSuspected) notes.push("Asbestos removal is done by a licensed removalist, so there is no strip rate in crew pay.");
  if ((m.includeGutters || m.jobType === "gutters") && m.eave > 0) add("gutter", "New gutter", m.eave, "lm", r(sheet.pay_gutter_lm));
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), area: round2(area), steepAboveDeg: steepAbove, notes };
}

/** One-line summary for the job cost row. */
export function crewPayDescription(pay: CrewPay) {
  return `Crew pay: ${pay.area} m² — ${pay.lines.map((l) => l.label).join(", ")}`;
}

// ---------------------------------------------------------------------------
// Job cost budget vs actual
// ---------------------------------------------------------------------------
export const COST_CATEGORIES = ["materials", "labor", "dumpster", "permit", "dealer_fee", "equipment", "supplement_fee", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
/** Australian labels for the job_costs categories (DB values stay). */
export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  materials: "Materials", labor: "Labour", dumpster: "Skip bin", permit: "Council / approval fees", dealer_fee: "Finance fee",
  equipment: "Equipment & scaffold hire", supplement_fee: "Claim variation fee", other: "Other",
};

export type BudgetItem = { quantity: number; unit_cost: number; category: string; calc_key?: string | null };

export function costCategoryFor(item: { category: string; calc_key?: string | null }): CostCategory {
  if (item.calc_key === "dumpster" || item.calc_key === "skip_bin") return "dumpster";
  if (item.calc_key === "permit") return "permit";
  if (item.calc_key === "edge_protection") return "equipment";
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
