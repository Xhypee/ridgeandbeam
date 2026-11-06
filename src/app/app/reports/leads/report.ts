/** Lead-source report math (pure). */

export const normSource = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") || "unknown";
export const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM

const BOOKED = new Set(["inspection", "estimate_sent", "sold", "scheduled", "in_progress", "completed", "paid"]);
const SOLD = new Set(["sold", "scheduled", "in_progress", "completed", "paid"]);

export type LeadJob = { id: string; lead_source: string | null; lead_received_at: string; first_contacted_at: string | null; stage: string };
export type Row = {
  source: string; month: string; leads: number; contacted1h: number; contactedPct: number | null; medianResponseMin: number | null;
  booked: number; sold: number; revenue: number; spend: number; costPerLead: number | null; costPerSold: number | null;
};

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function buildRows(jobs: LeadJob[], revenueByJob: Map<string, number>, spend: { source: string; month: string; amount: number }[], byMonth = true): Row[] {
  const groups = new Map<string, { source: string; month: string; jobs: LeadJob[]; spend: number }>();
  const key = (source: string, month: string) => `${source}|${byMonth ? month : "all"}`;
  const get = (source: string, month: string) => {
    const k = key(source, month);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { source, month: byMonth ? month : "all", jobs: [], spend: 0 }));
    return g;
  };
  for (const j of jobs) get(normSource(j.lead_source), monthKey(j.lead_received_at)).jobs.push(j);
  for (const s of spend) get(normSource(s.source), monthKey(s.month)).spend += Number(s.amount);

  return [...groups.values()]
    .map((g) => {
      const resp = g.jobs.filter((j) => j.first_contacted_at).map((j) => Math.max(0, (new Date(j.first_contacted_at!).getTime() - new Date(j.lead_received_at).getTime()) / 60000));
      const contacted1h = resp.filter((m) => m <= 60).length;
      const sold = g.jobs.filter((j) => SOLD.has(j.stage) || revenueByJob.has(j.id)).length;
      const leads = g.jobs.length;
      return {
        source: g.source, month: g.month, leads, contacted1h,
        contactedPct: leads ? Math.round((contacted1h / leads) * 100) : null,
        medianResponseMin: median(resp) === null ? null : Math.round(median(resp)!),
        booked: g.jobs.filter((j) => BOOKED.has(j.stage)).length,
        sold,
        revenue: Math.round(g.jobs.reduce((s, j) => s + (revenueByJob.get(j.id) ?? 0), 0) * 100) / 100,
        spend: Math.round(g.spend * 100) / 100,
        costPerLead: leads && g.spend ? Math.round((g.spend / leads) * 100) / 100 : null,
        costPerSold: sold && g.spend ? Math.round((g.spend / sold) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || b.leads - a.leads || a.source.localeCompare(b.source));
}

/** Accepted estimate total honoring good/better/best: shared items + the selected option's items. */
export function acceptedTotal(e: { discount: number; tax_rate: number; selected_option_id: string | null; estimate_items: { quantity: number; unit_price: number; option_id: string | null }[] }) {
  const sub = e.estimate_items
    .filter((i) => !i.option_id || i.option_id === e.selected_option_id)
    .reduce((s, i) => s + Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100, 0);
  const taxable = Math.max(0, sub - Number(e.discount));
  return Math.round(taxable * (1 + Number(e.tax_rate) / 100) * 100) / 100;
}
