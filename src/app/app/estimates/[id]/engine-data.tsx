import "server-only";
// Server pieces for the quoting engine: the supplier list sorted by distance, the roof report panel and the
// one-line state rules check.
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ColourRoof } from "@/components/docket";
import { asAuState, AU_STATE_NAME } from "@/lib/au";
import { auJobTypeFrom, roofSystemFrom, rulesFor } from "@/lib/au-rules";
import { roofShape } from "@/lib/docket-shape";
import { normalizeMeasurements, summarize } from "@/lib/roof";
import { listOrgSuppliers } from "@/lib/suppliers";
import type { Organization } from "@/lib/types";
import type { SupplierChoice } from "./quote-engine";

const km = (a: [number, number], b: [number, number]) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Every directory supplier with its nearest branch to the business, plus where this quote's prices come from. */
export async function loadSupplierChoices(supabase: SupabaseClient, org: Organization, orgSupplierId: string | null) {
  const [{ data: sups }, { data: branches }, orgSuppliers] = await Promise.all([
    supabase.from("suppliers").select("id, name, category, states").order("name"),
    supabase.from("supplier_branches").select("id, supplier_id, name, suburb, state, lat, lng").limit(5000),
    listOrgSuppliers(supabase, org.id).catch(() => []),
  ]);
  const here: [number, number] | null = org.lat != null && org.lng != null ? [Number(org.lat), Number(org.lng)] : null;
  type B = { id: string; supplier_id: string; name: string; suburb: string; state: string; lat: number | null; lng: number | null };
  const bySupplier = new Map<string, B[]>();
  for (const b of (branches ?? []) as B[]) bySupplier.set(b.supplier_id, [...(bySupplier.get(b.supplier_id) ?? []), b]);
  const linked = new Map(orgSuppliers.filter((o) => o.supplier_id).map((o) => [o.supplier_id!, o]));
  const choices: SupplierChoice[] = ((sups ?? []) as { id: string; name: string; category: string; states: string[] }[]).map((s) => {
    const list = bySupplier.get(s.id) ?? [];
    let best: { b: B; d: number } | null = null;
    if (here) for (const b of list) if (b.lat != null && b.lng != null) { const d = km(here, [b.lat, b.lng]); if (!best || d < best.d) best = { b, d }; }
    const fallback = best?.b ?? list[0] ?? null;
    const o = linked.get(s.id);
    return {
      supplierId: s.id, name: s.name, category: s.category, branchId: fallback?.id ?? null, branch: fallback?.name ?? null,
      place: fallback ? `${fallback.suburb} ${fallback.state}` : null, km: best ? Math.round(best.d * 10) / 10 : null,
      branches: list.length, states: [...new Set(list.length ? list.map((b) => b.state) : s.states ?? [])].sort(),
      orgSupplierId: o?.id ?? null, hasGuide: Boolean(o?.active_list),
    };
  }).sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.name.localeCompare(b.name));
  const cur = orgSuppliers.find((o) => o.id === orgSupplierId) ?? null;
  const tail = (org.address ?? "").split(",").pop()?.trim();
  return {
    choices,
    nearLabel: here ? `Nearest to ${tail || "your business"}` : "Add your business address in Settings to see distances",
    current: { orgSupplierId: cur?.id ?? null, supplierId: cur?.supplier_id ?? null, name: cur?.name ?? null, branch: (cur?.branch_name ?? "").split(/\s[–-]\s/).pop()?.trim() || null, hasGuide: Boolean(cur?.active_list), isDefault: Boolean(cur && org.default_supplier_id === cur.id) },
  };
}

const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-AU");
const SOURCE: Record<string, string> = { plans: "measured from the plans", satellite: "measured on the satellite map", manual: "measured by hand", import: "imported" };

/** 03 Roof plan: the drawing and numbers from our own roof report (plans, satellite or by hand). */
export function RoofPlanPanel({ estimateId, measurements, source }: { estimateId: string; measurements: unknown; source: string | null }) {
  const m = normalizeMeasurements(measurements);
  const s = summarize(m);
  const { shape, panels } = roofShape(measurements);
  const hasPlans = Boolean((measurements as { plans?: { v?: number } } | null)?.plans?.v);
  const faces = panels ?? m.sections.filter((x) => x.area > 0).length;
  const measured = s.trueArea > 0;
  const lens: [string, number, string][] = [["Ridges", m.ridge, "m"], ["Hips", m.hip, "m"], ["Valleys", m.valley, "m"], ["Gutter", m.eave, "m"], ["Barge", m.barge, "m"], ["Downpipes", m.downpipes, ""]];
  const chip = (href: string, label: string, on: boolean) => <Link href={href} className={on ? "rounded-full bg-ink px-2.5 py-1 font-semibold text-white" : "rounded-full px-2.5 py-1 font-semibold text-ink ring-1 ring-slate-300 hover:bg-white"}>{label}</Link>;
  return (
    <div data-roof-plan>
      {measured ? (
        <div className="grid overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 sm:grid-cols-[minmax(0,1fr)_250px]">
          <div className="grid place-items-center border-b border-slate-100 bg-[#f4f7f4] p-4 sm:border-b-0 sm:border-r">
            <ColourRoof shape={shape} hex="#e3e6df" className="h-56 w-full" />
          </div>
          <div className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Roof area</p>
            <p className="font-display text-4xl font-bold leading-none tracking-tight text-ink">{fmt(s.trueArea)} m²</p>
            <p className="mt-1 text-xs text-slate-500">{fmt(s.planArea)} m² on plan · {fmt(s.maxPitch)}° pitch{faces ? ` · ${faces} face${faces === 1 ? "" : "s"}` : ""}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              {lens.map(([k, v, u]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold tabular-nums text-ink">{v > 0 ? `${fmt(v)}${u ? ` ${u}` : ""}` : "–"}</dd></div>)}
            </dl>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-6 text-center">
          <p className="font-semibold text-ink">Not measured yet</p>
          <p className="mt-1 text-sm text-slate-500">Start here. Measure from the plans, on the satellite map, or type it in by hand.</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="flex-1">{measured ? <>Roof report · {SOURCE[source ?? ""] ?? "measured"} · <Link href={hasPlans ? `/app/measure/${estimateId}/plans` : `/app/measure/${estimateId}`} className="font-semibold text-brand-700">Open roof report</Link></> : "No roof report yet"}</span>
        <span className="flex flex-wrap items-center gap-1.5">{measured ? "Measure again:" : "Measure from:"}
          {chip(`/app/measure/${estimateId}/plans`, "Plans", source === "plans")}
          {chip(`/app/measure/${estimateId}`, "Satellite", source === "satellite")}
          {chip(`/app/estimates/${estimateId}?view=editor`, "By hand", source === "manual")}
        </span>
      </div>
    </div>
  );
}

/** 06 Terms: one line on what the job's state requires at this price. */
export function RulesLine({ state, total, roofMaterial, jobType }: { state: string | null; total: number; roofMaterial: string | null; jobType: string | null }) {
  const st = asAuState(state);
  if (!st) return <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-amber-100">Add the site&apos;s state to check the rules for this job.</p>;
  const r = rulesFor(st, { contractValueIncGst: total, contractDate: new Date(), roofSystem: roofSystemFrom(roofMaterial), jobType: auJobTypeFrom(jobType), existingHouse: true });
  const bits = [
    r.writtenContract.required ? `Written contract needed${r.writtenContract.tier ? ` (${r.writtenContract.tier.split(" (")[0]})` : ""}` : "No written contract needed",
    r.coolingOff.applies ? `${r.coolingOff.length} business day cooling-off` : "No cooling-off",
    r.deposit.isLegalLimit && r.deposit.maxPct !== null ? `Deposit up to ${r.deposit.maxPct}%` : null,
    r.insurance.required ? "Home warranty insurance before work" : null,
    r.licence.required ? "Licence number on the quote" : null,
  ].filter(Boolean);
  const big = r.writtenContract.required;
  return (
    <div className={big ? "flex items-center gap-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm ring-1 ring-amber-100" : "flex items-center gap-3 rounded-xl bg-brand-50 px-3.5 py-3 text-sm ring-1 ring-brand-100"} data-rules-line>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-brand-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
      <span className="flex-1 text-ink"><b>{AU_STATE_NAME[st]}, {total.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })}.</b> {bits.join(" · ")}. The quote email adds the notices it needs.</span>
      <Link href={`/app/settings/state-rules?state=${st}&value=${Math.round(total)}`} className="text-xs font-semibold text-brand-700">Rules</Link>
    </div>
  );
}
