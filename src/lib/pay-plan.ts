// Payment plans: split the contract price into parts the customer pays by card, bank/PayID or cash.
// Parts are milestones (on signing, materials delivered, roof finished) or instalments due on a date.
// Each part becomes its own tax invoice. Pure functions (client-safe).

export const PAY_METHODS = ["bank", "card", "cash"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { bank: "Bank transfer / PayID", card: "Card online", cash: "Cash" };
export const PAY_METHOD_HINT: Record<PayMethod, string> = {
  bank: "Free for you and them. Your BSB, account and PayID are on every invoice.",
  card: "Visa, Mastercard, Apple Pay. No surcharge (banned from 1 Oct 2026); the card fee comes out of your side.",
  cash: "Handed to you or the crew. Record it on the job and they get a receipt.",
};

export const PART_TRIGGERS = ["signed", "delivered", "completed", "date"] as const;
export type PartTrigger = (typeof PART_TRIGGERS)[number];
export const PART_TRIGGER_LABEL: Record<PartTrigger, string> = { signed: "On signing", delivered: "Materials delivered", completed: "Roof finished", date: "On a date" };

export type PlanKind = "deposit" | "progress" | "final" | "instalment";
export type PartInput = { label: string; trigger: PartTrigger; amount: number; due_date: string | null };
export type PlannedPart = PartInput & { kind: PlanKind };

export const PRESETS = ["milestones", "milestones_monthly", "fortnightly", "custom"] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<Preset, { title: string; hint: string }> = {
  milestones: { title: "Milestones", hint: "Your usual payment schedule" },
  milestones_monthly: { title: "Milestones + monthly", hint: "Small deposit, then 3 monthly payments after the roof's finished" },
  fortnightly: { title: "Fortnightly", hint: "Deposit, then even payments every 2 weeks" },
  custom: { title: "Custom", hint: "Set your own parts" },
};

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
export const round2 = (n: number) => fromCents(cents(n));

/** Add days to an ISO date (yyyy-mm-dd). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Same day next month(s), clamped to the month's last day. */
export function addMonths(iso: string, months: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** Split `total` by weights; the last share absorbs rounding so the parts add up to the cent. */
export function splitByWeights(total: number, weights: number[]): number[] {
  const t = cents(total);
  const sum = weights.reduce((a, w) => a + w, 0) || 1;
  let used = 0;
  return weights.map((w, i) => {
    const c = i === weights.length - 1 ? t - used : Math.round((t * w) / sum);
    used += c;
    return fromCents(c);
  });
}

/**
 * The most the first "on signing" payment may be: the state's legal deposit cap (if any) and, without one,
 * the company's own schedule. Returns null when there's no limit.
 */
export function depositLimit(cap: { maxAud: number | null; isLegalLimit: boolean } | null | undefined): number | null {
  return cap && cap.isLegalLimit && cap.maxAud !== null ? round2(cap.maxAud) : null;
}

type ScheduleStep = { label: string; pct: number; trigger: string };

/**
 * Build a preset plan for `total` (inc GST). `schedule` is the company's usual milestones; `start` is the
 * expected finish date (instalments follow it); `depositCap` keeps the first payment within the state limit.
 */
export function presetPlan(preset: Preset, total: number, opts: { schedule: ScheduleStep[]; start: string; depositCap: number | null; count?: number }): PartInput[] {
  const { start, depositCap } = opts;
  let parts: PartInput[];
  if (preset === "milestones" || preset === "custom") {
    const steps = opts.schedule.length ? opts.schedule : [{ label: "Deposit", pct: 10, trigger: "signed" }, { label: "Materials delivered", pct: 40, trigger: "delivered" }, { label: "Roof finished", pct: 50, trigger: "completed" }];
    const amounts = splitByWeights(total, steps.map((s) => s.pct));
    parts = steps.map((s, i) => ({ label: s.label, trigger: (PART_TRIGGERS as readonly string[]).includes(s.trigger) ? (s.trigger as PartTrigger) : "completed", amount: amounts[i], due_date: null }));
  } else if (preset === "milestones_monthly") {
    const n = opts.count ?? 3;
    const amounts = splitByWeights(total, [5, 35, 30, ...Array(n).fill(30 / n)]);
    parts = [
      { label: "Deposit", trigger: "signed", amount: amounts[0], due_date: null },
      { label: "Materials delivered", trigger: "delivered", amount: amounts[1], due_date: null },
      { label: "Roof finished", trigger: "completed", amount: amounts[2], due_date: null },
      ...Array.from({ length: n }, (_, i): PartInput => ({ label: `Instalment ${i + 1} of ${n}`, trigger: "date", amount: amounts[3 + i], due_date: addMonths(start, i + 1) })),
    ];
  } else {
    const n = opts.count ?? 6;
    const amounts = splitByWeights(total, [10, ...Array(n).fill(90 / n)]);
    parts = [
      { label: "Deposit", trigger: "signed", amount: amounts[0], due_date: null },
      ...Array.from({ length: n }, (_, i): PartInput => ({ label: `Payment ${i + 1} of ${n}`, trigger: "date", amount: amounts[1 + i], due_date: addDays(start, 14 * (i + 1)) })),
    ];
  }
  return capFirstPayment(parts, depositCap).parts;
}

/** Keep "on signing" payments within the deposit cap; the excess moves to the next part. */
export function capFirstPayment(parts: PartInput[], cap: number | null): { parts: PartInput[]; moved: number } {
  if (cap === null) return { parts, moved: 0 };
  const out = parts.map((p) => ({ ...p }));
  let upfront = 0;
  let moved = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i].trigger !== "signed") continue;
    const room = Math.max(0, cents(cap) - upfront);
    const c = cents(out[i].amount);
    if (c > room) {
      const extra = c - room;
      out[i].amount = fromCents(room);
      const next = out.findIndex((p, j) => j > i && p.trigger !== "signed");
      if (next >= 0) out[next].amount = fromCents(cents(out[next].amount) + extra);
      moved += extra;
    }
    upfront += cents(out[i].amount);
  }
  return { parts: out, moved: fromCents(moved) };
}

/** Invoice kind for each part (first "on signing" part is the deposit; the last milestone is the final). */
export function partKinds(parts: PartInput[]): PlannedPart[] {
  const lastMilestone = parts.map((p) => p.trigger).lastIndexOf("completed");
  return parts.map((p, i) => ({
    ...p,
    kind: p.trigger === "date" ? "instalment" : i === 0 && p.trigger === "signed" ? "deposit" : i === lastMilestone && !parts.slice(i + 1).some((q) => q.trigger !== "date") ? "final" : "progress",
  }));
}

export type PlanCheck = { ok: true; parts: PlannedPart[] } | { ok: false; error: string };

/**
 * Check a plan before saving. `remaining` = contract total minus parts already paid (they stay as they are);
 * `depositRoom` = how much may still be taken on signing (cap minus anything already paid up front), null = no cap.
 */
export function checkPlan(parts: PartInput[], remaining: number, depositRoom: number | null, today: string): PlanCheck {
  if (!parts.length) return { ok: false, error: "Add at least one payment." };
  if (parts.length > 24) return { ok: false, error: "Keep it to 24 payments or fewer." };
  for (const [i, p] of parts.entries()) {
    const n = `Payment ${i + 1}`;
    if (!p.label.trim()) return { ok: false, error: `${n} needs a name.` };
    if (!(PART_TRIGGERS as readonly string[]).includes(p.trigger)) return { ok: false, error: `${n}: choose when it's due.` };
    if (!(p.amount > 0)) return { ok: false, error: `${p.label}: the amount must be more than $0.` };
    if (p.trigger === "date") {
      if (!p.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(p.due_date)) return { ok: false, error: `${p.label}: pick the date it's due.` };
      if (p.due_date < today) return { ok: false, error: `${p.label}: the date is in the past.` };
    }
  }
  const sum = parts.reduce((a, p) => a + cents(p.amount), 0);
  const want = cents(remaining);
  if (sum !== want) {
    const diff = fromCents(want - sum);
    return { ok: false, error: `The payments add up to ${aud(fromCents(sum))}, ${diff > 0 ? `${aud(diff)} short of` : `${aud(-diff)} over`} the ${aud(remaining)} to plan.` };
  }
  if (depositRoom !== null) {
    const upfront = parts.filter((p) => p.trigger === "signed").reduce((a, p) => a + cents(p.amount), 0);
    if (upfront > cents(depositRoom)) return { ok: false, error: `Payments on signing come to ${aud(fromCents(upfront))}. The deposit limit for this job is ${aud(depositRoom)}. Move the rest to a later payment.` };
  }
  return { ok: true, parts: partKinds(parts) };
}

export function aud(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}
