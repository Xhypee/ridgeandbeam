import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/roof";
import type { DayForecast, ReadinessCtx } from "@/lib/production";

// ---------------------------------------------------------------------------
// Accepted estimate (fallback for contract 5 until B's estimate-totals.ts lands):
// shared items (option_id null) + items of the selected option.
// ---------------------------------------------------------------------------
export type AcceptedItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  unit_cost: number;
  calc_key: string | null;
  category: string;
};
export type AcceptedEstimate = {
  estimateId: string;
  number: number;
  optionId: string | null;
  acceptedAt: string | null;
  measurements: unknown;
  subtotal: number;
  discount: number;
  /** Pre-tax contract price (subtotal − discount). */
  preTax: number;
  tax: number;
  total: number;
  items: AcceptedItem[];
};

type EstRow = {
  id: string; job_id: string; number: number; selected_option_id: string | null; accepted_at: string | null; created_at: string;
  measurements: unknown; discount: number; tax_rate: number;
  estimate_items: (AcceptedItem & { option_id: string | null; position: number })[];
};

export async function acceptedEstimates(supabase: SupabaseClient, jobIds: string[]): Promise<Map<string, AcceptedEstimate>> {
  const out = new Map<string, AcceptedEstimate>();
  if (jobIds.length === 0) return out;
  const { data } = await supabase
    .from("estimates")
    .select("id, job_id, number, selected_option_id, accepted_at, created_at, measurements, discount, tax_rate, estimate_items(description, quantity, unit, unit_price, unit_cost, calc_key, category, option_id, position)")
    .in("job_id", jobIds)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  for (const e of (data ?? []) as EstRow[]) {
    if (out.has(e.job_id)) continue;
    const items = (e.estimate_items ?? [])
      .filter((i) => i.option_id === null || i.option_id === e.selected_option_id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price),
        unit_cost: Number(i.unit_cost ?? 0), calc_key: i.calc_key ?? null, category: i.category,
      }));
    const subtotal = round2(items.reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
    const discount = Number(e.discount) || 0;
    const preTax = Math.max(0, round2(subtotal - discount));
    const tax = round2((preTax * (Number(e.tax_rate) || 0)) / 100);
    out.set(e.job_id, {
      estimateId: e.id, number: e.number, optionId: e.selected_option_id, acceptedAt: e.accepted_at, measurements: e.measurements,
      subtotal, discount, preTax, tax, total: round2(preTax + tax), items,
    });
  }
  return out;
}

export async function acceptedEstimate(supabase: SupabaseClient, jobId: string) {
  return (await acceptedEstimates(supabase, [jobId])).get(jobId) ?? null;
}

// ---------------------------------------------------------------------------
// Readiness context for many jobs at once (orders + deposit)
// ---------------------------------------------------------------------------
type InvRow = { id: string; job_id: string; kind: string; status: string };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function invoiceSummary(supabase: SupabaseClient, jobIds: string[]) {
  const map = new Map<string, { depositReceived: boolean; paid: number; billed: number; balance: number; paidInFull: boolean; count: number }>();
  if (jobIds.length === 0) return map;
  // Totals come from the invoice_totals view, read separately (no PostgREST embed: view relationships
  // aren't always in the schema cache).
  const { data } = await supabase.from("invoices").select("id, job_id, kind, status").in("job_id", jobIds);
  const invIds = (data ?? []).map((v) => v.id);
  const { data: totals } = invIds.length ? await supabase.from("invoice_totals").select("invoice_id, total, paid, balance").in("invoice_id", invIds) : { data: [] };
  const byInv = new Map((totals ?? []).map((t) => [t.invoice_id, t]));
  for (const id of jobIds) map.set(id, { depositReceived: false, paid: 0, billed: 0, balance: 0, paidInFull: false, count: 0 });
  for (const v of (data ?? []) as InvRow[]) {
    const t = byInv.get(v.id);
    const s = map.get(v.job_id)!;
    const paid = Number(t?.paid ?? 0);
    if ((v.kind === "deposit" && ["paid", "partial"].includes(v.status)) || paid > 0) s.depositReceived = true;
    if (v.status === "void") continue;
    s.count++;
    s.paid = round2(s.paid + paid);
    s.billed = round2(s.billed + Number(t?.total ?? 0));
    s.balance = round2(s.balance + Number(t?.balance ?? 0));
  }
  for (const s of map.values()) s.paidInFull = s.count > 0 && s.billed > 0 && s.balance <= 0;
  return map;
}

export async function readinessContexts(supabase: SupabaseClient, jobIds: string[]): Promise<Map<string, ReadinessCtx>> {
  const out = new Map<string, ReadinessCtx>();
  if (jobIds.length === 0) return out;
  const [{ data: orders }, inv] = await Promise.all([
    supabase.from("material_orders").select("job_id, status, delivery_date").in("job_id", jobIds),
    invoiceSummary(supabase, jobIds),
  ]);
  for (const id of jobIds) out.set(id, { orders: [], depositReceived: inv.get(id)?.depositReceived ?? false });
  for (const o of orders ?? []) out.get(o.job_id)?.orders?.push({ status: o.status, delivery_date: o.delivery_date });
  return out;
}

// ---------------------------------------------------------------------------
// Job financials: contract value, budget, actual cost, supplements
// ---------------------------------------------------------------------------
export type JobFinancials = {
  estimate: AcceptedEstimate | null;
  contractValue: number;
  changeOrders: number;
  approvedSupplements: number;
  pendingSupplements: number;
  budgetCost: number;
  actualCost: number;
  costs: { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; source: string }[];
  paid: number;
  paidInFull: boolean;
};

export async function jobFinancials(supabase: SupabaseClient, jobIds: string[]): Promise<Map<string, JobFinancials>> {
  const out = new Map<string, JobFinancials>();
  if (jobIds.length === 0) return out;
  const [est, inv, { data: costs }, { data: cos }, { data: sups }] = await Promise.all([
    acceptedEstimates(supabase, jobIds),
    invoiceSummary(supabase, jobIds),
    supabase.from("job_costs").select("id, job_id, category, vendor, description, amount, incurred_on, source").in("job_id", jobIds).order("incurred_on"),
    supabase.from("change_orders").select("job_id, status, change_order_items(quantity, unit_price, unit_cost)").in("job_id", jobIds).eq("status", "approved"),
    supabase.from("supplements").select("status, requested_amount, approved_amount, claims!inner(job_id)").in("claims.job_id", jobIds),
  ]);
  for (const id of jobIds) {
    const e = est.get(id) ?? null;
    out.set(id, {
      estimate: e, contractValue: e?.preTax ?? 0, changeOrders: 0, approvedSupplements: 0, pendingSupplements: 0,
      budgetCost: e ? round2(e.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)) : 0,
      actualCost: 0, costs: [], paid: inv.get(id)?.paid ?? 0, paidInFull: inv.get(id)?.paidInFull ?? false,
    });
  }
  for (const c of (costs ?? []) as (JobFinancials["costs"][number] & { job_id: string })[]) {
    const f = out.get(c.job_id)!;
    f.costs.push({ ...c, amount: Number(c.amount) });
    f.actualCost = round2(f.actualCost + Number(c.amount));
  }
  for (const co of (cos ?? []) as { job_id: string; change_order_items: { quantity: number; unit_price: number; unit_cost: number }[] }[]) {
    const f = out.get(co.job_id)!;
    for (const i of co.change_order_items ?? []) {
      f.changeOrders = round2(f.changeOrders + Number(i.quantity) * Number(i.unit_price));
      f.budgetCost = round2(f.budgetCost + Number(i.quantity) * Number(i.unit_cost));
    }
  }
  for (const s of (sups ?? []) as unknown as { status: string; requested_amount: number; approved_amount: number; claims: { job_id: string } | { job_id: string }[] }[]) {
    const jobId = one(s.claims)?.job_id;
    const f = jobId ? out.get(jobId) : undefined;
    if (!f) continue;
    if (["approved", "partial"].includes(s.status)) f.approvedSupplements = round2(f.approvedSupplements + Number(s.approved_amount));
    if (s.status === "submitted") f.pendingSupplements = round2(f.pendingSupplements + Number(s.requested_amount));
  }
  for (const f of out.values()) f.contractValue = round2(f.contractValue + f.changeOrders + f.approvedSupplements);
  return out;
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo, free, no key). Cached 1h by Next's fetch cache.
// Any failure (network blocked, bad zip) returns null and the UI shows "forecast unavailable".
// ---------------------------------------------------------------------------
export async function getForecast(place: { zip: string | null; lat: number | null; lng: number | null }): Promise<DayForecast[] | null> {
  try {
    let lat = place.lat, lng = place.lng;
    if ((lat == null || lng == null) && place.zip) {
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place.zip)}&count=1&countryCode=US&language=en&format=json`, {
        next: { revalidate: 86400 }, signal: AbortSignal.timeout(2500),
      });
      if (!g.ok) return null;
      const gj = (await g.json()) as { results?: { latitude: number; longitude: number }[] };
      lat = gj.results?.[0]?.latitude ?? null;
      lng = gj.results?.[0]?.longitude ?? null;
    }
    if (lat == null || lng == null) return null;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_probability_max,wind_speed_10m_max,temperature_2m_max,weather_code&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`;
    const r = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = (await r.json()) as { daily?: { time: string[]; precipitation_probability_max?: (number | null)[]; wind_speed_10m_max?: (number | null)[]; temperature_2m_max?: (number | null)[]; weather_code?: (number | null)[] } };
    const d = j.daily;
    if (!d?.time) return null;
    return d.time.map((date, i) => ({
      date,
      precipProb: d.precipitation_probability_max?.[i] ?? null,
      windMph: d.wind_speed_10m_max?.[i] ?? null,
      tempMaxF: d.temperature_2m_max?.[i] ?? null,
      code: d.weather_code?.[i] ?? null,
    }));
  } catch {
    return null;
  }
}
