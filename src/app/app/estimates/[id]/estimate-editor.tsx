"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Badge, Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { estimateTotals, itemsForOption, marginExGst } from "@/lib/estimate-totals";
import {
  buildLines, defaultOptions, isCalculatorLine, newKey, priceIn, resolvePriceBook, rowProfile, TIER_LABEL, TIERS,
  type CatalogRow, type DraftItem, type DraftOption, type PriceMode, type Tier,
} from "@/lib/estimating";
import { money } from "@/lib/format";
import {
  calcKeyLabel, coverWidthMm, cutList, EXISTING_ROOF_LABEL, EXISTING_ROOFS, JOB_TYPE_LABEL, JOB_TYPES, MEASUREMENT_SOURCE_LABEL, mergeMeasurements,
  METAL_PROFILE_INFO, METAL_PROFILES, monthlyPayment, normalizeMeasurements, pitchFromRiseRun, round2, ROOF_SYSTEM_LABEL, ROOF_SYSTEM_SHORT, ROOF_SYSTEMS, sectionSystem,
  summarize, takeoff, takeoffWarnings, trueArea, type CalcSettings, type ExistingRoof, type JobType, type Measurements, type MetalProfile, type RoofSection, type RoofSystem,
} from "@/lib/roof";
import { loadSupplierPrices, saveEstimate } from "../actions";
import { ImportPanel, type ImportResult } from "./import-panel";

type Props = {
  id: string;
  locked: boolean;
  catalog: CatalogRow[];
  suppliers: { id: string; name: string; hasSheet: boolean }[];
  initial: {
    measurements: unknown;
    measurement_source: string | null;
    option_label: "options" | "alternates";
    options: DraftOption[];
    items: DraftItem[];
    tax_rate: number;
    gst_inclusive: boolean;
    org_supplier_id: string | null;
    discount: number;
    notes: string | null;
    terms: string | null;
  };
  defaultWaste: number;
  calcDefaults: unknown;
  minMarginPct: number;
  gstRegistered: boolean;
  financing: { enabled: boolean; apr: number; term_months: number };
  aiEnabled: boolean;
};

const n = (v: string) => (v === "" ? 0 : Number(v));
const UNIT: Record<string, string> = { m2: "m²" };
const unitLabel = (u: string) => UNIT[u] ?? u;
/** Words a supplier sheet uses for each profile (for "prefer this profile" lookups). */
const PROFILE_SEARCH: Record<MetalProfile, string> = { custom_orb: "Custom Orb", trimdek: "Trimdek", klip_lok: "Klip-Lok", spandek: "Spandek" };
const fmt = (v: number, d = 2) => v.toLocaleString("en-AU", { maximumFractionDigits: d });

/** Label shown above an input on phones/tablets; desktop uses the column header. */
function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-0.5 block text-[11px] font-medium text-slate-500 lg:hidden">{label}</span>
      {children}
    </label>
  );
}

const SETTING_FIELDS: { key: Exclude<keyof CalcSettings, "coverWidthMm">; label: string; step?: string }[] = [
  { key: "steepAboveDeg", label: "Steep allowance above (°)", step: "0.5" },
  { key: "overhangMm", label: "Sheet overhang into gutter (mm)" },
  { key: "supportSpacingMm", label: "Batten / purlin spacing (mm)" },
  { key: "screwsPerSheetPerSupport", label: "Screws per sheet per support" },
  { key: "screwsPerBox", label: "Screws per box" },
  { key: "sarkingRollM2", label: "Sarking roll coverage (m²)", step: "0.1" },
  { key: "safetyMeshRollM2", label: "Safety mesh roll coverage (m²)", step: "0.1" },
  { key: "tilesPerM2", label: "Tiles per m²", step: "0.1" },
  { key: "ridgeTilesPerLm", label: "Ridge tiles per lm", step: "0.1" },
  { key: "battenGaugeMm", label: "Tile batten gauge (mm)" },
  { key: "pointingLmPerBag", label: "Pointing: lm per bag", step: "0.5" },
  { key: "skipBinM3", label: "Skip bin size (m³)", step: "0.5" },
  { key: "lapPct", label: "Laps on capping & flashings (%)", step: "0.5" },
];

export function EstimateEditor({ id, locked, catalog, suppliers, initial, defaultWaste, calcDefaults, minMarginPct, gstRegistered, financing, aiEnabled }: Props) {
  const [m, setM] = useState<Measurements>(() => normalizeMeasurements(initial.measurements, defaultWaste, calcDefaults));
  const [source, setSource] = useState<string | null>(initial.measurement_source);
  const [options, setOptions] = useState<DraftOption[]>(initial.options);
  const [optionLabel, setOptionLabel] = useState<"options" | "alternates">(initial.option_label);
  const [items, setItems] = useState<DraftItem[]>(initial.items);
  const [taxRate, setTaxRate] = useState(gstRegistered ? Number(initial.tax_rate) : 0);
  const [inclusive, setInclusive] = useState(initial.gst_inclusive);
  const [supplierId, setSupplierId] = useState<string>(initial.org_supplier_id ?? "");
  const [discount, setDiscount] = useState(Number(initial.discount));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const [filling, setFilling] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [riseRun, setRiseRun] = useState<{ idx: number; rise: string; run: string } | null>(null);

  const summary = useMemo(() => summarize(m), [m]);
  const cuts = useMemo(() => cutList(m), [m]);
  const warnings = useMemo(() => takeoffWarnings(m), [m]);
  const calcNames = useMemo(() => new Set(catalog.filter((c) => c.calc_key).map((c) => c.name)), [catalog]);
  const mode: PriceMode = { inclusive, gstRatePct: taxRate };
  const hasOptions = options.length > 0;
  const word = optionLabel === "alternates" ? "Alternate" : "Option";
  const priceHead = taxRate > 0 ? (inclusive ? "Price (inc GST)" : "Price (ex GST)") : "Price";
  const isRoofJob = m.jobType !== "gutters";

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const setMeas = (patch: Partial<Measurements>) => { setM((p) => ({ ...p, ...patch })); touch(); };
  const setSettings = (patch: Partial<CalcSettings>) => setMeas({ settings: { ...m.settings, ...patch } });
  const setSection = (i: number, patch: Partial<RoofSection>) => setMeas({ sections: m.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setItemAt = (idx: number, patch: Partial<DraftItem>) => { setItems((p) => p.map((it, j) => (j === idx ? { ...it, ...patch } : it))); touch(); };
  const setOpt = (key: string, patch: Partial<DraftOption>) => { setOptions((p) => p.map((o) => (o.key === key ? { ...o, ...patch } : o))); touch(); };

  // ----- GST -----
  function toggleInclusive(on: boolean) {
    const from: PriceMode = { inclusive, gstRatePct: taxRate };
    const to: PriceMode = { inclusive: on, gstRatePct: taxRate };
    setItems((p) => p.map((it) => ({ ...it, unit_price: priceIn({ unit_price: Number(it.unit_price) || 0, price_inc_gst: from.inclusive }, to) })));
    setDiscount((d) => priceIn({ unit_price: d, price_inc_gst: from.inclusive }, to));
    setInclusive(on);
    touch();
    setMsg({ ok: on ? "Prices now include GST (line prices converted)." : "Prices now exclude GST; GST is added on top (line prices converted)." });
  }

  // ----- options -----
  function toggleOptions(on: boolean) {
    if (on) {
      setOptions(defaultOptions(optionLabel));
      touch();
      return;
    }
    if (!window.confirm(`Turn off ${optionLabel}? Lines of the recommended ${word.toLowerCase()} are kept; other ${word.toLowerCase()} lines are removed.`)) return;
    const keep = options.find((o) => o.recommended)?.key ?? options[0]?.key;
    setItems((p) => p.filter((it) => !it.option_key || it.option_key === keep).map((it) => ({ ...it, option_key: null })));
    setOptions([]);
    touch();
  }
  function move(key: string, dir: -1 | 1) {
    setOptions((p) => {
      const i = p.findIndex((o) => o.key === key);
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    touch();
  }
  function removeOption(key: string) {
    if (options.length <= 2) { setMsg({ error: `Keep at least two ${optionLabel}, or turn ${optionLabel} off.` }); return; }
    const o = options.find((x) => x.key === key);
    if (!window.confirm(`Remove ${o?.name ?? word} and its lines?`)) return;
    const rest = options.filter((x) => x.key !== key);
    if (o?.recommended) rest[Math.floor((rest.length - 1) / 2)].recommended = true;
    setOptions(rest);
    setItems((p) => p.filter((it) => it.option_key !== key));
    touch();
  }
  function addOption() {
    const used = new Set(options.map((o) => o.tier));
    const tier = TIERS.find((t) => !used.has(t)) ?? null;
    setOptions((p) => [...p, { key: newKey(), name: optionLabel === "alternates" ? `Alternate ${p.length}` : tier ? TIER_LABEL[tier] : `Option ${p.length + 1}`, tier, description: "", warranty: "", recommended: false }]);
    touch();
  }

  // ----- calculator -----
  async function applyCalculator() {
    setFilling(true);
    setMsg(null);
    try {
      let book = catalog;
      let note = "";
      if (supplierId) {
        const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "the supplier";
        const sheets = catalog.filter((c) => c.calc_key === "metal_sheet" && c.tier).map((c) => { const p = rowProfile(c); return { profile: p ? PROFILE_SEARCH[p] : c.profile ?? null, finish: c.finish ?? null }; });
        const res = await loadSupplierPrices(supplierId, sheets);
        if (res.rows?.length) book = resolvePriceBook(catalog, res.rows);
        else note = res.error ? ` (${supplierName}: ${res.error}; used your price book)` : ` (${supplierName} has no active price sheet; used your price book)`;
      }
      const { items: generated, missing, warranties } = buildLines(takeoff(m), book, options, { mode, rowsFor: (o) => takeoff(m, { profileOverride: o }) });
      const custom = items.filter((it) => !isCalculatorLine(it, calcNames));
      setItems([...generated, ...custom]);
      if (Object.keys(warranties).length) setOptions((p) => p.map((o) => (o.warranty || !warranties[o.key] ? o : { ...o, warranty: warranties[o.key] })));
      touch();
      const zero = generated.filter((i) => !(Number(i.unit_price) > 0)).length;
      const problems = [
        missing.length ? `No price-book item for: ${missing.map(calcKeyLabel).join(", ")}. Add them in Settings → Price book.` : "",
        zero ? `${zero} line${zero === 1 ? " is" : "s are"} $0 — set your prices in Settings → Price book or import a supplier price sheet.` : "",
      ].filter(Boolean);
      if (problems.length) setMsg({ error: problems.join(" ") + note });
      else setMsg({ ok: `Filled ${generated.length} lines from the measurements${note}.` });
    } finally {
      setFilling(false);
    }
  }

  function applyImport(r: ImportResult) {
    setM((p) => ({ ...p, sections: r.sections, ...r.edges, ...(r.wastePct != null ? { wastePct: r.wastePct } : {}) }));
    setSource(r.source);
    setImporting(false);
    touch();
    setMsg({ ok: `Imported ${r.sections.length} facets from ${MEASUREMENT_SOURCE_LABEL[r.source] ?? r.source}. Click “Fill line items from measurements”.` });
  }

  function addFromCatalog(cid: string, optionKey: string | null) {
    const c = catalog.find((x) => x.id === cid);
    if (!c) return;
    setItems((p) => [...p, { description: c.name, quantity: 1, unit: c.unit, unit_price: priceIn(c, mode), unit_cost: Number(c.unit_cost), category: c.category, calc_key: null, option_key: optionKey, supplier_price_item_id: c.supplier_price_item_id ?? null }]);
    touch();
  }
  const addCustom = (optionKey: string | null) => {
    setItems((p) => [...p, { description: "", quantity: 1, unit: "ea", unit_price: 0, unit_cost: 0, category: "other", calc_key: null, option_key: optionKey, supplier_price_item_id: null }]);
    touch();
  };

  // ----- money -----
  const asLines = (list: DraftItem[]) => list.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0, unit_cost: Number(i.unit_cost) || 0 }));
  const linesFor = (key: string | null) => asLines(itemsForOption(items.map((i) => ({ ...i, option_id: i.option_key })), key));
  const calc = (lines: ReturnType<typeof asLines>) => {
    const t = estimateTotals(lines, discount, taxRate, inclusive);
    return { t, mg: marginExGst(lines, discount, taxRate, inclusive), monthly: financing.enabled ? monthlyPayment(t.total, financing.apr, financing.term_months) : 0 };
  };
  const perOption = options.map((o) => ({ o, ...calc(linesFor(o.key)) }));
  const single = calc(asLines(items));
  const lowMargin = hasOptions ? perOption.filter((p) => p.mg.sell > 0 && p.mg.pct < minMarginPct) : single.mg.sell > 0 && single.mg.pct < minMarginPct ? [{ o: null }] : [];

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveEstimate({
        id,
        measurements: mergeMeasurements(initial.measurements, m),
        measurement_source: (source as never) ?? null,
        option_label: optionLabel,
        options: options.map((o) => ({ ...o, id: o.id ?? null })),
        items: items.map((it) => ({
          ...it,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          unit_cost: Number(it.unit_cost) || 0,
          supplier_price_item_id: it.supplier_price_item_id ?? null,
        })),
        tax_rate: taxRate,
        gst_inclusive: inclusive,
        org_supplier_id: supplierId || null,
        discount,
        notes: notes || null,
        terms: terms || null,
      });
      if (res?.optionIds) setOptions((p) => p.map((o) => (res.optionIds![o.key] ? { ...o, id: res.optionIds![o.key] } : o)));
      setMsg(res ? { error: res.error, ok: res.ok } : null);
      if (res && !res.error) setDirty(false);
    });
  }

  async function aiDraft() {
    if (dirty && !window.confirm("The AI drafts from the saved quote. Draft anyway? (Save first to include your latest changes.)")) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/proposal-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ estimateId: id }) });
      const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!r.ok || !j.text) { setMsg({ error: j.error ?? "AI draft is not available right now." }); return; }
      setNotes((p) => (p.trim() ? `${p.trim()}\n\n${j.text}` : j.text!));
      touch();
    } finally {
      setAiBusy(false);
    }
  }

  const ro = locked;
  const removeSection = (i: number) => setMeas({ sections: m.sections.filter((_, j) => j !== i) });
  const supplier = suppliers.find((s) => s.id === supplierId);

  return (
    <div className="space-y-6">
      <Card
        title={<span className="flex flex-wrap items-center gap-2">Roof measurements {source && <Badge tone="violet">{MEASUREMENT_SOURCE_LABEL[source] ?? source}</Badge>}</span>}
      >
        {!ro && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setImporting((v) => !v)} aria-expanded={importing}>Import measurement report</Button>
            <Link
              href={`/app/measure/${id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
              onClick={(e) => { if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault(); }}
            >
              Measure on satellite map
            </Link>
          </div>
        )}
        {importing && !ro && <div className="mb-5"><ImportPanel onApply={applyImport} onCancel={() => setImporting(false)} /></div>}

        <fieldset disabled={ro} className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Job type">
              <Select value={m.jobType} onChange={(e) => {
                const jobType = e.target.value as JobType;
                setMeas({ jobType, ...(jobType === "asbestos" ? { asbestosSuspected: true, existingRoof: "fibro" as ExistingRoof } : {}), ...(jobType === "tile_to_metal" ? { existingRoof: "tile" as ExistingRoof } : {}) });
              }} aria-label="Job type">
                {JOB_TYPES.map((j) => <option key={j} value={j}>{JOB_TYPE_LABEL[j]}</option>)}
              </Select>
            </Field>
            <Field label="Roof on the house now">
              <Select value={m.existingRoof} onChange={(e) => setMeas({ existingRoof: e.target.value as ExistingRoof })} aria-label="Existing roof">
                {EXISTING_ROOFS.map((r) => <option key={r} value={r}>{EXISTING_ROOF_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Waste %"><Input type="number" min="0" max="50" value={m.wastePct} onChange={(e) => setMeas({ wastePct: n(e.target.value) })} aria-label="Waste %" /></Field>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-lg px-3 text-sm text-slate-800 ring-1 ring-slate-200 has-[:checked]:bg-amber-50 has-[:checked]:ring-amber-400">
              <input type="checkbox" className="h-5 w-5 accent-amber-600" checked={m.asbestosSuspected} onChange={(e) => setMeas({ asbestosSuspected: e.target.checked })} aria-label="Pre-1990 or asbestos suspected" />
              Pre-1990 / asbestos suspected
            </label>
          </div>
          {warnings.filter((w) => w.code === "asbestos").map((w) => (
            <p key={w.code} role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="asbestos-warning">⚠ {w.text}</p>
          ))}

          {isRoofJob && (
            <div>
              <div className="mb-2 hidden grid-cols-[minmax(7rem,1fr)_5.5rem_5rem_9.5rem_9rem_4.5rem_4.5rem_4.5rem_5rem_2rem] gap-2 text-xs font-medium text-slate-500 lg:grid">
                <span>Roof section</span><span>Plan area m²</span><span>Pitch °</span><span>Roof type</span><span>Sheet profile</span><span>Run m</span><span>Width m</span><span>Waste %</span><span className="text-right">True m²</span><span />
              </div>
              {m.sections.map((s, i) => {
                const sys = sectionSystem(s);
                const isMetal = sys === "metal";
                return (
                  <div key={i} className="mb-3 border-b border-slate-100 pb-3 lg:mb-2 lg:border-0 lg:pb-0" data-testid="section-row">
                    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4 lg:grid-cols-[minmax(7rem,1fr)_5.5rem_5rem_9.5rem_9rem_4.5rem_4.5rem_4.5rem_5rem_2rem]">
                      <Cell label="Roof section" className="col-span-2 sm:col-span-4 lg:col-span-1"><Input value={s.label} onChange={(e) => setSection(i, { label: e.target.value })} aria-label="Section name" /></Cell>
                      <Cell label="Plan area m²"><Input type="number" min="0" step="0.1" inputMode="decimal" value={s.area || ""} onChange={(e) => setSection(i, { area: n(e.target.value) })} aria-label="Plan area m²" placeholder="m²" /></Cell>
                      <Cell label="Pitch °">
                        <div className="flex gap-1">
                          <Input type="number" min="0" max="75" step="0.5" inputMode="decimal" value={s.pitch} onChange={(e) => setSection(i, { pitch: n(e.target.value) })} aria-label="Pitch degrees" />
                        </div>
                      </Cell>
                      <Cell label="Roof type">
                        <Select value={sys} onChange={(e) => setSection(i, { system: e.target.value as RoofSystem })} aria-label="Roof type">
                          {ROOF_SYSTEMS.map((r) => <option key={r} value={r} title={ROOF_SYSTEM_LABEL[r]}>{ROOF_SYSTEM_SHORT[r]}</option>)}
                        </Select>
                      </Cell>
                      <Cell label="Sheet profile">
                        <Select value={s.profile ?? "custom_orb"} disabled={!isMetal} onChange={(e) => setSection(i, { profile: e.target.value as MetalProfile })} aria-label="Sheet profile" className={cx(!isMetal && "opacity-40")}>
                          {METAL_PROFILES.map((p) => <option key={p} value={p}>{METAL_PROFILE_INFO[p].label} · {coverWidthMm(p, m.settings)}</option>)}
                        </Select>
                      </Cell>
                      <Cell label="Run m (eave→ridge)"><Input type="number" min="0" step="0.01" inputMode="decimal" disabled={!isMetal} value={s.runLength ?? ""} onChange={(e) => setSection(i, { runLength: e.target.value === "" ? null : n(e.target.value) })} aria-label="Sheet run m" placeholder="—" /></Cell>
                      <Cell label="Width m (along eave)"><Input type="number" min="0" step="0.01" inputMode="decimal" disabled={!isMetal} value={s.width ?? ""} onChange={(e) => setSection(i, { width: e.target.value === "" ? null : n(e.target.value) })} aria-label="Section width m" placeholder="—" /></Cell>
                      <Cell label="Waste %"><Input type="number" min="0" max="50" value={s.waste ?? ""} placeholder={String(m.wastePct)} onChange={(e) => setSection(i, { waste: e.target.value === "" ? null : n(e.target.value) })} aria-label="Section waste" /></Cell>
                      <span className="self-center text-right text-sm tabular-nums text-slate-700"><span className="text-xs text-slate-400 lg:hidden">true </span>{fmt(round2(trueArea(s)))}<span className="text-xs text-slate-400 lg:hidden"> m²</span></span>
                      <button type="button" className="h-10 text-slate-400 hover:text-red-600 disabled:invisible" disabled={m.sections.length === 1} onClick={() => removeSection(i)} aria-label="Remove section">✕</button>
                    </div>
                    {!ro && (
                      riseRun?.idx === i ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-xs text-slate-500">Pitch from rise / run (same units):</span>
                          <Input className="w-24" inputMode="decimal" value={riseRun.rise} onChange={(e) => setRiseRun({ ...riseRun, rise: e.target.value })} aria-label="Rise" placeholder="Rise" />
                          <span className="text-slate-400">/</span>
                          <Input className="w-24" inputMode="decimal" value={riseRun.run} onChange={(e) => setRiseRun({ ...riseRun, run: e.target.value })} aria-label="Run" placeholder="Run" />
                          <Button type="button" variant="secondary" onClick={() => { const d = pitchFromRiseRun(n(riseRun.rise), n(riseRun.run)); if (d > 0) setSection(i, { pitch: d }); setRiseRun(null); }}>
                            Use {pitchFromRiseRun(n(riseRun.rise), n(riseRun.run)) || "—"}°
                          </Button>
                          <button type="button" className="text-xs text-slate-500 underline" onClick={() => setRiseRun(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="mt-1 text-xs text-brand-700 hover:underline" onClick={() => setRiseRun({ idx: i, rise: "", run: "" })}>Enter pitch as rise / run</button>
                      )
                    )}
                  </div>
                );
              })}
              <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => {
                const last = m.sections.at(-1);
                setMeas({ sections: [...m.sections, { label: `Section ${m.sections.length + 1}`, area: 0, pitch: last?.pitch ?? 22.5, system: last?.system ?? "metal", profile: last?.profile, waste: null }] });
              }}>
                + Add section
              </button>
              <p className="mt-1 text-xs text-slate-500">
                Plan area is the footprint seen from above; true area = plan ÷ cos(pitch). For metal, enter the sheet run (eave to ridge, along the slope) and the width along the eave to get an exact cut list; leave them blank to estimate from area + waste.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {isRoofJob && <Field label="Ridge (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.ridge || ""} onChange={(e) => setMeas({ ridge: n(e.target.value) })} aria-label="Ridge lm" /></Field>}
            {isRoofJob && <Field label="Hip (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.hip || ""} onChange={(e) => setMeas({ hip: n(e.target.value) })} aria-label="Hip lm" /></Field>}
            {isRoofJob && <Field label="Valley (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.valley || ""} onChange={(e) => setMeas({ valley: n(e.target.value) })} aria-label="Valley lm" /></Field>}
            {isRoofJob && <Field label="Barge (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.barge || ""} onChange={(e) => setMeas({ barge: n(e.target.value) })} aria-label="Barge lm" /></Field>}
            <Field label="Eave / gutter (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.eave || ""} onChange={(e) => setMeas({ eave: n(e.target.value) })} aria-label="Eave lm" /></Field>
            {isRoofJob && <Field label="Apron / wall flashing (lm)"><Input type="number" min="0" step="0.1" inputMode="decimal" value={m.apron || ""} onChange={(e) => setMeas({ apron: n(e.target.value) })} aria-label="Apron lm" /></Field>}
            <Field label="Downpipes"><Input type="number" min="0" step="1" value={m.downpipes || ""} onChange={(e) => setMeas({ downpipes: n(e.target.value) })} aria-label="Downpipes" /></Field>
            {isRoofJob && <Field label="Whirlybirds"><Input type="number" min="0" step="1" value={m.whirlybirds || ""} onChange={(e) => setMeas({ whirlybirds: n(e.target.value) })} aria-label="Whirlybirds" /></Field>}
            {isRoofJob && <Field label="Broken tiles to replace"><Input type="number" min="0" step="1" value={m.replaceTiles || ""} onChange={(e) => setMeas({ replaceTiles: n(e.target.value) })} aria-label="Broken tiles" /></Field>}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-700">
            {([
              ["includeSarking", "Sarking"],
              ["includeSafetyMesh", "Safety mesh (metal)"],
              ["includeGutters", "Gutters & downpipes"],
              ["includeEdgeProtection", "Edge protection"],
              ["includeSkip", "Skip bins"],
            ] as const).map(([k, l]) => (
              <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg px-3 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500">
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={m[k]} onChange={(e) => setMeas({ [k]: e.target.checked } as Partial<Measurements>)} />{l}
              </label>
            ))}
          </div>

          <details className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200" data-testid="calc-assumptions">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Calculator assumptions for this quote</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {SETTING_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input type="number" min="0" step={f.step ?? "1"} value={m.settings[f.key]} onChange={(e) => setSettings({ [f.key]: n(e.target.value) } as Partial<CalcSettings>)} aria-label={f.label} />
                </Field>
              ))}
              {METAL_PROFILES.map((p) => (
                <Field key={p} label={`${METAL_PROFILE_INFO[p].label} cover (mm)`} hint={METAL_PROFILE_INFO[p].verified ? undefined : "Check the manufacturer's spec"}>
                  <Input type="number" min="100" max="2000" value={coverWidthMm(p, m.settings)} onChange={(e) => setSettings({ coverWidthMm: { ...m.settings.coverWidthMm, [p]: n(e.target.value) } })} aria-label={`${METAL_PROFILE_INFO[p].label} cover width`} />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Screws follow Lysaght&apos;s method: screws per sheet per support × sheets × supports (run ÷ spacing + 1). Company defaults live in Settings → Price book.</p>
          </details>
        </fieldset>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-center sm:grid-cols-4" data-testid="roof-summary">
          <div><dt className="text-xs text-slate-500">Plan area</dt><dd className="text-lg font-semibold tabular-nums">{fmt(summary.planArea)} m²</dd></div>
          <div><dt className="text-xs text-slate-500">True roof area</dt><dd className="text-lg font-semibold tabular-nums" data-testid="true-area">{fmt(summary.trueArea)} m²</dd></div>
          <div><dt className="text-xs text-slate-500">Steep (over {m.settings.steepAboveDeg}°)</dt><dd className="text-lg font-semibold tabular-nums">{fmt(summary.steepArea)} m²</dd></div>
          <div><dt className="text-xs text-slate-500">Ridge + hip</dt><dd className="text-lg font-semibold tabular-nums">{fmt(summary.ridgeHip)} lm</dd></div>
        </dl>

        {cuts.length > 0 && (
          <div className="mt-4 overflow-x-auto" data-testid="cut-list">
            <p className="mb-1 text-sm font-semibold text-slate-800">Sheet cut list</p>
            <table className="w-full min-w-[30rem] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">Section</th><th className="py-1 font-medium">Profile</th><th className="py-1 font-medium">Cut</th><th className="py-1 text-right font-medium">Lineal m</th><th className="py-1 text-right font-medium">Screws</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cuts.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{c.section}</td>
                    <td className="py-1.5">{METAL_PROFILE_INFO[c.profile].label} <span className="text-xs text-slate-400">{c.coverMm} mm</span></td>
                    <td className="py-1.5 tabular-nums">{c.exact ? <b>{c.sheets} × {c.lengthMm.toLocaleString("en-AU")} mm</b> : <span className="text-slate-500">from area + waste</span>}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(c.lm)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">≈{Math.round(c.screws)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!ro && (
          <div className="mt-5 flex flex-col gap-3 rounded-lg bg-ink p-4 text-white sm:flex-row sm:items-end" data-testid="fill-bar">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-white/70">Price from</span>
              <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); touch(); }} aria-label="Price from supplier" className="text-slate-900">
                <option value="">My price book</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasSheet ? "" : " (no price sheet yet)"}</option>)}
              </Select>
              <span className="mt-1 block text-xs text-white/60">
                {suppliers.length === 0
                  ? <>No suppliers yet. <Link href="/app/settings/suppliers" className="underline">Add a supplier and import a price sheet</Link>.</>
                  : supplier && !supplier.hasSheet ? "No active price sheet for this supplier: your price book is used." : "Keys the supplier doesn't price come from your price book."}
              </span>
            </label>
            <Button type="button" onClick={applyCalculator} disabled={filling} className="min-h-12 px-5 text-base">{filling ? "Filling…" : "Fill line items from measurements"}</Button>
          </div>
        )}
      </Card>

      <Card
        title={hasOptions ? (optionLabel === "alternates" ? "Alternates" : "Good / better / best options") : "Options"}
        actions={!ro && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={hasOptions} onChange={(e) => toggleOptions(e.target.checked)} aria-label="Offer options" />
            Offer options
          </label>
        )}
      >
        {!hasOptions ? (
          <p className="text-sm text-slate-500">
            One price. Turn on <b>Offer options</b> to show the homeowner Good / Better / Best side by side from the same measurements — for example ZINCALUME Custom Orb, COLORBOND Trimdek and COLORBOND Klip-Lok (the middle one is recommended).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Call them</span>
              {(["options", "alternates"] as const).map((l) => (
                <button key={l} type="button" disabled={ro} onClick={() => { setOptionLabel(l); touch(); }}
                  className={cx("rounded-full px-3 py-1.5", optionLabel === l ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200")}>
                  {l === "options" ? "Options (homeowner)" : "Alternates (builder / commercial)"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {options.map((o, i) => (
                <fieldset key={o.key} disabled={ro} className={cx("space-y-2 rounded-lg p-3 ring-1", o.recommended ? "bg-brand-50 ring-brand-500" : "ring-slate-200")} data-testid="option-card">
                  <div className="flex items-center gap-2">
                    <Input value={o.name} onChange={(e) => setOpt(o.key, { name: e.target.value })} aria-label={`${word} name`} className="font-medium" />
                    <button type="button" className="h-9 w-9 shrink-0 rounded text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => move(o.key, -1)} aria-label="Move left">←</button>
                    <button type="button" className="h-9 w-9 shrink-0 rounded text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === options.length - 1} onClick={() => move(o.key, 1)} aria-label="Move right">→</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`rec-${id}`} className="h-4 w-4 accent-brand-500" checked={o.recommended} onChange={() => { setOptions((p) => p.map((x) => ({ ...x, recommended: x.key === o.key }))); touch(); }} />
                      Recommended
                    </label>
                    <Select className="w-auto" value={o.tier ?? ""} onChange={(e) => setOpt(o.key, { tier: (e.target.value || null) as Tier | null })} aria-label="Price-book tier">
                      <option value="">No tier (standard items)</option>
                      {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]} tier items</option>)}
                    </Select>
                    <button type="button" className="ml-auto text-xs text-slate-400 hover:text-red-600" onClick={() => removeOption(o.key)}>Remove</button>
                  </div>
                  <Textarea value={o.description} onChange={(e) => setOpt(o.key, { description: e.target.value })} aria-label={`${word} description`} placeholder="What the homeowner gets with this choice" className="min-h-16" />
                  <Input value={o.warranty} onChange={(e) => setOpt(o.key, { warranty: e.target.value })} aria-label={`${word} warranty`} placeholder="Warranty (e.g. 10-year workmanship warranty)" />
                </fieldset>
              ))}
            </div>
            {!ro && options.length < 4 && <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={addOption}>+ Add {word.toLowerCase()}</button>}
          </div>
        )}
      </Card>

      <Card title="Line items">
        <LineGroup title={hasOptions ? `Included in every ${word.toLowerCase()}` : null} groupKey={null} items={items} options={options} word={word} ro={ro} catalog={catalog} priceHead={priceHead}
          setItemAt={setItemAt} remove={(idx) => { setItems((p) => p.filter((_, j) => j !== idx)); touch(); }} addFromCatalog={addFromCatalog} addCustom={addCustom} mode={mode} />
        {options.map((o) => (
          <LineGroup key={o.key} title={`${o.name} only`} groupKey={o.key} items={items} options={options} word={word} ro={ro} catalog={catalog} priceHead={priceHead}
            setItemAt={setItemAt} remove={(idx) => { setItems((p) => p.filter((_, j) => j !== idx)); touch(); }} addFromCatalog={addFromCatalog} addCustom={addCustom} mode={mode} />
        ))}

        <div className="mt-6 flex flex-col items-end gap-1.5 text-sm">
          {!hasOptions && <div className="flex w-80 max-w-full justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(single.t.subtotal)}</span></div>}
          <div className="flex w-80 max-w-full items-center justify-between gap-2">
            <span className="text-slate-500">Discount</span>
            <Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.01" value={discount} onChange={(e) => { setDiscount(n(e.target.value)); touch(); }} aria-label="Discount" />
          </div>
          {!hasOptions && (
            <>
              <div className="flex w-80 max-w-full justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <span>Total{taxRate > 0 ? " (inc GST)" : ""}</span><span className="tabular-nums" data-testid="estimate-total">{money(single.t.total)}</span>
              </div>
              {taxRate > 0 && (inclusive
                ? <div className="text-xs text-slate-600" data-testid="gst-note">Includes GST of {money(single.t.gst)}</div>
                : <div className="text-xs text-slate-600" data-testid="gst-note">{money(single.t.exGst)} + GST {money(single.t.gst)}</div>)}
              {summary.trueArea > 0 && single.t.total > 0 && <div className="text-xs text-slate-500">{money(single.t.total / summary.trueArea)} per m² of roof</div>}
              {single.monthly > 0 && <div className="text-xs text-slate-500">About {money(single.monthly)} per month with finance</div>}
            </>
          )}
          <div className="mt-2 flex w-80 max-w-full flex-col gap-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
            {gstRegistered ? (
              <>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={ro} className="h-4 w-4 accent-brand-500" checked={taxRate > 0} onChange={(e) => { setTaxRate(e.target.checked ? 10 : 0); touch(); }} aria-label="Charge GST" />Charge GST (10%)</label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={ro || taxRate === 0} className="h-4 w-4 accent-brand-500" checked={inclusive} onChange={(e) => toggleInclusive(e.target.checked)} aria-label="Prices include GST" />Prices include GST (homeowner quotes)</label>
              </>
            ) : (
              <span>Your company is set as not registered for GST, so no GST is charged.</span>
            )}
          </div>
        </div>

        {hasOptions ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">{word}</th><th className="py-1 text-right font-medium">Total{taxRate > 0 ? " inc GST" : ""}</th>{taxRate > 0 && <th className="py-1 text-right font-medium">GST</th>}{financing.enabled && <th className="py-1 text-right font-medium">Monthly</th>}<th className="py-1 text-right font-medium">Cost ex GST</th><th className="py-1 text-right font-medium">Gross profit</th><th className="py-1 text-right font-medium">Margin</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {perOption.map(({ o, t, mg, monthly }) => (
                  <tr key={o.key} data-testid="option-total">
                    <td className="py-2 font-medium">{o.name} {o.recommended && <Badge tone="teal">Recommended</Badge>}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(t.total)}</td>
                    {taxRate > 0 && <td className="py-2 text-right tabular-nums text-slate-600">{money(t.gst)}</td>}
                    {financing.enabled && <td className="py-2 text-right tabular-nums text-slate-600">{money(monthly)}/mo</td>}
                    <td className="py-2 text-right tabular-nums text-slate-600">{money(mg.cost)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{money(mg.profit)}</td>
                    <td className={cx("py-2 text-right tabular-nums font-medium", mg.sell > 0 && mg.pct < minMarginPct ? "text-red-700" : "text-green-700")}>{mg.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {taxRate > 0 && inclusive && <p className="mt-1 text-xs text-slate-500">Totals include GST. Margin is worked out ex GST.</p>}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>Cost ex GST <b className="tabular-nums text-slate-800">{money(single.mg.cost)}</b></span>
            <span>Gross profit <b className="tabular-nums text-slate-800">{money(single.mg.profit)}</b></span>
            <span>Margin <b className={cx("tabular-nums", single.mg.sell > 0 && single.mg.pct < minMarginPct ? "text-red-700" : "text-green-700")} data-testid="margin-pct">{single.mg.pct.toFixed(1)}%</b></span>
          </div>
        )}
        {lowMargin.length > 0 && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="margin-warning">
            ⚠ Margin is below your {minMarginPct}% minimum{hasOptions ? ` on ${perOption.filter((p) => p.mg.sell > 0 && p.mg.pct < minMarginPct).map((p) => p.o.name).join(", ")}` : ""}. Check prices, the discount, or costs in the price book.
          </p>
        )}
      </Card>

      <Card title="Notes & terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Notes to customer</span>
              {aiEnabled && !ro && (
                <button type="button" onClick={aiDraft} disabled={aiBusy} className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50 disabled:opacity-50">
                  {aiBusy ? "Drafting…" : "✨ AI draft"}
                </button>
              )}
            </div>
            <Textarea disabled={ro} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} placeholder="Scope of work, COLORBOND colour, what to expect on the day…" aria-label="Notes to customer" className="min-h-28" />
            {aiEnabled && <p className="mt-1 text-xs text-slate-500">AI drafts are a starting point. Review before sending.</p>}
          </div>
          <Field label="Terms"><Textarea disabled={ro} value={terms} onChange={(e) => { setTerms(e.target.value); touch(); }} className="min-h-28" /></Field>
        </div>
      </Card>

      {!ro && (
        <div className="no-print sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3">
          {msg?.error && <p role="alert" className="max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow">{msg.error}</p>}
          {msg?.ok && <p className="max-w-xl rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 shadow">{msg.ok}</p>}
          <Button onClick={save} disabled={pending} className={cx("min-h-11 shadow-lg", !dirty && "opacity-80")}>
            {pending ? "Saving…" : dirty ? "Save quote" : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LineGroup({ title, groupKey, items, options, word, ro, catalog, priceHead, setItemAt, remove, addFromCatalog, addCustom, mode }: {
  title: string | null;
  groupKey: string | null;
  items: DraftItem[];
  options: DraftOption[];
  word: string;
  ro: boolean;
  catalog: CatalogRow[];
  priceHead: string;
  setItemAt: (idx: number, patch: Partial<DraftItem>) => void;
  remove: (idx: number) => void;
  addFromCatalog: (cid: string, optionKey: string | null) => void;
  addCustom: (optionKey: string | null) => void;
  mode: PriceMode;
}) {
  const rows = items.map((it, idx) => ({ it, idx })).filter(({ it }) => (it.option_key ?? null) === groupKey);
  const sub = round2(rows.reduce((s, { it }) => s + round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0));
  return (
    <section className={cx(title && "mb-6")} data-testid={groupKey ? "option-lines" : "shared-lines"}>
      {title && (
        <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-slate-800">
          <span>{title}</span><span className="text-xs font-normal tabular-nums text-slate-500">{money(sub)}</span>
        </h3>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Description</th>
              <th className="w-24 pb-2 font-medium">Qty</th>
              <th className="w-20 pb-2 font-medium">Unit</th>
              <th className="w-28 pb-2 font-medium">{priceHead}</th>
              <th className="w-28 pb-2 font-medium">Cost (ex GST)</th>
              {options.length > 0 && <th className="w-40 pb-2 font-medium">Applies to</th>}
              <th className="w-24 pb-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, idx }) => (
              <tr key={idx} className="align-top" data-testid="line-row">
                <td className="py-1 pr-2">
                  <Input disabled={ro} value={it.description} onChange={(e) => setItemAt(idx, { description: e.target.value })} aria-label="Description" />
                  {it.supplier_price_item_id && <span className="mt-0.5 inline-block text-[11px] font-medium text-teal-700" data-testid="supplier-priced">Supplier price sheet</span>}
                </td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.quantity} onChange={(e) => setItemAt(idx, { quantity: e.target.value as unknown as number })} aria-label="Quantity" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} value={unitLabel(it.unit)} onChange={(e) => setItemAt(idx, { unit: e.target.value === "m²" ? "m2" : e.target.value })} aria-label="Unit" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.unit_price} onChange={(e) => setItemAt(idx, { unit_price: e.target.value as unknown as number })} aria-label="Unit price" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" min="0" value={it.unit_cost} onChange={(e) => setItemAt(idx, { unit_cost: e.target.value as unknown as number, supplier_price_item_id: null })} aria-label="Unit cost" className="text-slate-500" /></td>
                {options.length > 0 && (
                  <td className="py-1 pr-2">
                    <Select disabled={ro} value={it.option_key ?? ""} onChange={(e) => setItemAt(idx, { option_key: e.target.value || null })} aria-label="Applies to">
                      <option value="">Every {word.toLowerCase()}</option>
                      {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                    </Select>
                  </td>
                )}
                <td className="py-3 text-right tabular-nums">{money(round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)))}</td>
                <td className="py-2 text-center">
                  {!ro && <button type="button" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => remove(idx)} aria-label="Remove line">✕</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-4 text-center text-slate-500">
                {groupKey ? "No lines only for this choice yet." : "No line items yet. Enter measurements and click "}{!groupKey && <b>Fill line items from measurements</b>}{!groupKey && ", or add lines below."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!ro && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Select className="w-auto max-w-xs" value="" onChange={(e) => addFromCatalog(e.target.value, groupKey)} aria-label="Add from price book">
            <option value="">+ Add from price book…</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({money(priceIn(c, mode))}/{unitLabel(c.unit)})</option>)}
          </Select>
          <Button type="button" variant="ghost" onClick={() => addCustom(groupKey)}>+ Custom line</Button>
        </div>
      )}
    </section>
  );
}
