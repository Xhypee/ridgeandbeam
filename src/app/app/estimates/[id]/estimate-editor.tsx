"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { itemsForOption } from "@/lib/estimate-totals";
import {
  allowedCatalog, buildLines, defaultOptions, isCalculatorLine, newKey, TIER_LABEL, TIERS,
  type CatalogRow, type DraftItem, type DraftOption, type Tier,
} from "@/lib/estimating";
import { money } from "@/lib/format";
import {
  CALC_KEY_LABEL, LOW_SLOPE_BELOW, MEASUREMENT_SOURCE_LABEL, margin, mergeMeasurements, monthlyPayment, normalizeMeasurements,
  pitchFactor, round2, ROOF_SYSTEM_LABEL, sectionSystem, summarize, takeoff, totals, type Measurements, type RoofSystem,
} from "@/lib/roof";
import { saveEstimate } from "../actions";
import { ImportPanel, type ImportResult } from "./import-panel";

type Props = {
  id: string;
  locked: boolean;
  catalog: CatalogRow[];
  certifications: string[];
  initial: {
    measurements: unknown;
    measurement_source: string | null;
    option_label: "options" | "alternates";
    options: DraftOption[];
    items: DraftItem[];
    tax_rate: number;
    discount: number;
    notes: string | null;
    terms: string | null;
  };
  defaultWaste: number;
  bundlesPerSquare: number;
  minMarginPct: number;
  financing: { enabled: boolean; apr: number; term_months: number };
  aiEnabled: boolean;
};

const n = (v: string) => (v === "" ? 0 : Number(v));

export function EstimateEditor({ id, locked, catalog, certifications, initial, defaultWaste, bundlesPerSquare, minMarginPct, financing, aiEnabled }: Props) {
  const [m, setM] = useState<Measurements>(() => normalizeMeasurements(initial.measurements, defaultWaste));
  const [source, setSource] = useState<string | null>(initial.measurement_source);
  const [options, setOptions] = useState<DraftOption[]>(initial.options);
  const [optionLabel, setOptionLabel] = useState<"options" | "alternates">(initial.option_label);
  const [items, setItems] = useState<DraftItem[]>(initial.items);
  const [taxRate, setTaxRate] = useState(Number(initial.tax_rate));
  const [discount, setDiscount] = useState(Number(initial.discount));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const [importing, setImporting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const calcOpts = useMemo(() => ({ bundlesPerSquare }), [bundlesPerSquare]);
  const summary = useMemo(() => summarize(m, calcOpts), [m, calcOpts]);
  const offered = useMemo(() => allowedCatalog(catalog, certifications), [catalog, certifications]);
  const calcNames = useMemo(() => new Set(catalog.filter((c) => c.calc_key).map((c) => c.name)), [catalog]);
  const hasOptions = options.length > 0;
  const word = optionLabel === "alternates" ? "Alternate" : "Option";

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const setMeas = (patch: Partial<Measurements>) => { setM((p) => ({ ...p, ...patch })); touch(); };
  const setSection = (i: number, patch: Partial<Measurements["sections"][number]>) =>
    setMeas({ sections: m.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setItemAt = (idx: number, patch: Partial<DraftItem>) => { setItems((p) => p.map((it, j) => (j === idx ? { ...it, ...patch } : it))); touch(); };
  const setOpt = (key: string, patch: Partial<DraftOption>) => { setOptions((p) => p.map((o) => (o.key === key ? { ...o, ...patch } : o))); touch(); };

  // ----- options -----
  function toggleOptions(on: boolean) {
    if (on) {
      const opts = defaultOptions(optionLabel);
      setOptions(opts);
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
  function applyCalculator() {
    const { items: generated, missing, warranties } = buildLines(takeoff(m, calcOpts), offered, options);
    const custom = items.filter((it) => !isCalculatorLine(it, calcNames));
    setItems([...generated, ...custom]);
    if (Object.keys(warranties).length) setOptions((p) => p.map((o) => (o.warranty || !warranties[o.key] ? o : { ...o, warranty: warranties[o.key] })));
    touch();
    if (missing.length) setMsg({ error: `No price-book item for: ${missing.map((k) => CALC_KEY_LABEL[k] ?? k).join(", ")}. Add them in Settings → Price book.` });
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
    setItems((p) => [...p, { description: c.name, quantity: 1, unit: c.unit, unit_price: Number(c.unit_price), unit_cost: Number(c.unit_cost), category: c.category, calc_key: null, option_key: optionKey }]);
    touch();
  }
  const addCustom = (optionKey: string | null) => {
    setItems((p) => [...p, { description: "", quantity: 1, unit: "ea", unit_price: 0, unit_cost: 0, category: "other", calc_key: null, option_key: optionKey }]);
    touch();
  };

  // ----- money -----
  const asLines = (list: DraftItem[]) => list.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0, unit_cost: Number(i.unit_cost) || 0 }));
  const linesFor = (key: string | null) => asLines(itemsForOption(items.map((i) => ({ ...i, option_id: i.option_key })), key));
  const perOption = options.map((o) => {
    const lines = linesFor(o.key);
    const t = totals(lines, discount, taxRate);
    return { o, t, mg: margin(lines, discount), monthly: financing.enabled ? monthlyPayment(t.total, financing.apr, financing.term_months) : 0 };
  });
  const single = (() => {
    const lines = asLines(items);
    const t = totals(lines, discount, taxRate);
    return { t, mg: margin(lines, discount), monthly: financing.enabled ? monthlyPayment(t.total, financing.apr, financing.term_months) : 0 };
  })();

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
        })),
        tax_rate: taxRate,
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
    if (dirty && !window.confirm("The AI drafts from the saved estimate. Draft anyway? (Save first to include your latest changes.)")) return;
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
  const lowSlopeCount = m.sections.filter((s) => sectionSystem(s) === "low_slope").length;

  return (
    <div className="space-y-6">
      <Card
        title={<span className="flex flex-wrap items-center gap-2">Roof measurements {source && <Badge tone="violet">{MEASUREMENT_SOURCE_LABEL[source] ?? source}</Badge>}</span>}
        actions={!ro && <Button variant="secondary" onClick={applyCalculator} type="button">Fill line items from measurements</Button>}
      >
        {!ro && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setImporting((v) => !v)} aria-expanded={importing}>Import measurement report</Button>
            <Link
              href={`/app/measure/${id}`}
              className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
              onClick={(e) => { if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault(); }}
            >
              Measure on satellite map
            </Link>
          </div>
        )}
        {importing && !ro && <div className="mb-5"><ImportPanel onApply={applyImport} onCancel={() => setImporting(false)} /></div>}

        <fieldset disabled={ro} className="space-y-5">
          <div>
            <div className="mb-2 hidden grid-cols-[1fr_7rem_5rem_7.5rem_5rem_4.5rem_2rem] gap-2 text-xs font-medium text-slate-500 md:grid">
              <span>Roof section / facet</span><span>Plan area (sq ft)</span><span>Pitch (/12)</span><span>System</span><span>Waste %</span><span className="text-right">Squares</span><span />
            </div>
            {m.sections.map((s, i) => {
              const sys = sectionSystem(s);
              return (
                <div key={i} className="mb-3 grid grid-cols-[1fr_1fr_4.5rem_2rem] items-center gap-2 border-b border-slate-100 pb-3 md:mb-2 md:grid-cols-[1fr_7rem_5rem_7.5rem_5rem_4.5rem_2rem] md:border-0 md:pb-0" data-testid="section-row">
                  <Input className="col-span-4 md:col-span-1" value={s.label} onChange={(e) => setSection(i, { label: e.target.value })} aria-label="Section name" />
                  <Input type="number" min="0" step="1" value={s.area || ""} onChange={(e) => setSection(i, { area: n(e.target.value) })} aria-label="Plan area" placeholder="Plan sq ft" />
                  <Input type="number" min="0" max="24" step="0.5" value={s.pitch} onChange={(e) => setSection(i, { pitch: n(e.target.value) })} aria-label="Pitch" placeholder="Pitch /12" />
                  <span className="text-right text-sm tabular-nums text-slate-700 md:hidden"><span className="text-xs text-slate-400">sq </span>{round2((s.area * pitchFactor(s.pitch)) / 100).toFixed(2)}</span>
                  <button type="button" className="text-slate-400 hover:text-red-600 disabled:invisible md:hidden" disabled={m.sections.length === 1} onClick={() => setMeas({ sections: m.sections.filter((_, j) => j !== i) })} aria-label="Remove section">✕</button>
                  <Select className="col-span-2 md:col-span-1" value={s.system ?? ""} onChange={(e) => setSection(i, { system: (e.target.value || undefined) as RoofSystem | undefined })} aria-label="Roof system">
                    <option value="">Auto ({ROOF_SYSTEM_LABEL[(Number(s.pitch) || 0) < LOW_SLOPE_BELOW ? "low_slope" : "shingle"]})</option>
                    <option value="shingle">Shingle</option>
                    <option value="low_slope">Low-slope</option>
                    <option value="metal">Metal</option>
                  </Select>
                  <Input className="col-span-2 md:col-span-1" type="number" min="0" max="50" value={s.waste ?? ""} placeholder={sys === "low_slope" ? "0" : String(m.wastePct)} onChange={(e) => setSection(i, { waste: e.target.value === "" ? null : n(e.target.value) })} aria-label="Section waste" />
                  <span className="hidden text-right text-sm tabular-nums text-slate-700 md:block">{round2((s.area * pitchFactor(s.pitch)) / 100).toFixed(2)}</span>
                  <button type="button" className="hidden text-slate-400 hover:text-red-600 disabled:invisible md:block" disabled={m.sections.length === 1} onClick={() => setMeas({ sections: m.sections.filter((_, j) => j !== i) })} aria-label="Remove section">✕</button>
                </div>
              );
            })}
            <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setMeas({ sections: [...m.sections, { label: `Section ${m.sections.length + 1}`, area: 0, pitch: m.sections.at(-1)?.pitch ?? 6, waste: null }] })}>
              + Add section
            </button>
            <p className="mt-1 text-xs text-slate-500">
              Plan area is the footprint from above. Sections under {LOW_SLOPE_BELOW}/12 default to low-slope: no shingle waste, priced per square as a low-slope system. Leave waste blank to use the estimate&apos;s waste %.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Field label="Eaves (LF)"><Input type="number" min="0" value={m.eaves || ""} onChange={(e) => setMeas({ eaves: n(e.target.value) })} /></Field>
            <Field label="Rakes (LF)"><Input type="number" min="0" value={m.rakes || ""} onChange={(e) => setMeas({ rakes: n(e.target.value) })} /></Field>
            <Field label="Ridges (LF)"><Input type="number" min="0" value={m.ridges || ""} onChange={(e) => setMeas({ ridges: n(e.target.value) })} /></Field>
            <Field label="Hips (LF)"><Input type="number" min="0" value={m.hips || ""} onChange={(e) => setMeas({ hips: n(e.target.value) })} /></Field>
            <Field label="Valleys (LF)"><Input type="number" min="0" value={m.valleys || ""} onChange={(e) => setMeas({ valleys: n(e.target.value) })} /></Field>
            <Field label="Pipe boots"><Input type="number" min="0" value={m.pipeBoots || ""} onChange={(e) => setMeas({ pipeBoots: n(e.target.value) })} /></Field>
            <Field label="Waste %"><Input type="number" min="0" max="50" value={m.wastePct} onChange={(e) => setMeas({ wastePct: n(e.target.value) })} /></Field>
            <Field label="Layers to tear off">
              <Select value={m.layers} onChange={(e) => setMeas({ layers: n(e.target.value) })}>
                <option value={0}>0 (overlay / new)</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </Select>
            </Field>
            <Field label="Ice & water rows">
              <Select value={m.iceWaterRows} onChange={(e) => setMeas({ iceWaterRows: n(e.target.value) })}>
                <option value={0}>None</option><option value={1}>1 row (3 ft)</option><option value={2}>2 rows (6 ft)</option>
              </Select>
            </Field>
            <Field label="Decking allowance (sheets)"><Input type="number" min="0" step="1" value={m.deckingSheets || ""} onChange={(e) => setMeas({ deckingSheets: n(e.target.value) })} aria-label="Decking sheets" /></Field>
            <label className="col-span-2 flex flex-wrap items-center gap-4 pt-5 text-sm text-slate-700 sm:col-span-2">
              <span className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={m.ridgeVent} onChange={(e) => setMeas({ ridgeVent: e.target.checked })} />Ridge vent</span>
              <span className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={m.includeDumpster} onChange={(e) => setMeas({ includeDumpster: e.target.checked })} />Dumpster</span>
              <span className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={m.includePermit} onChange={(e) => setMeas({ includePermit: e.target.checked })} />Permit</span>
            </label>
          </div>
        </fieldset>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-center sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Surface area</dt><dd className="text-lg font-semibold tabular-nums">{summary.surfaceArea.toLocaleString()} ft²</dd></div>
          <div><dt className="text-xs text-slate-500">Squares</dt><dd className="text-lg font-semibold tabular-nums">{summary.squares.toFixed(2)}</dd></div>
          <div><dt className="text-xs text-slate-500">Shingle order (w/ waste)</dt><dd className="text-lg font-semibold tabular-nums">{summary.orderSquares.toFixed(2)} sq</dd></div>
          <div><dt className="text-xs text-slate-500">Shingle bundles ({bundlesPerSquare}/sq)</dt><dd className="text-lg font-semibold tabular-nums">{summary.bundles}</dd></div>
        </dl>
        {(lowSlopeCount > 0 || summary.metalSquares > 0 || summary.steepSquares > 0) && (
          <p className="mt-2 text-xs text-slate-600" data-testid="system-summary">
            {summary.lowSlopeSquares > 0 && <>Low-slope: <b>{summary.lowSlopeSquares.toFixed(2)} sq</b> (excluded from shingle waste). </>}
            {summary.metalSquares > 0 && <>Metal: <b>{summary.metalSquares.toFixed(2)} sq</b>. </>}
            {summary.steepSquares > 0 && <>Steep 8/12+: <b>{summary.steepSquares.toFixed(2)} sq</b>{summary.steepHighSquares > 0 && <> (10/12+: {summary.steepHighSquares.toFixed(2)} sq)</>}.</>}
          </p>
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
            One price. Turn on <b>Offer options</b> to show the homeowner Good / Better / Best side by side from the same measurements (the middle one is recommended).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Call them</span>
              {(["options", "alternates"] as const).map((l) => (
                <button key={l} type="button" disabled={ro} onClick={() => { setOptionLabel(l); touch(); }}
                  className={cx("rounded-full px-3 py-1.5", optionLabel === l ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200")}>
                  {l === "options" ? "Options (residential)" : "Alternates (commercial bid)"}
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
                  <Input value={o.warranty} onChange={(e) => setOpt(o.key, { warranty: e.target.value })} aria-label={`${word} warranty`} placeholder="Warranty (e.g. 50-yr non-prorated materials)" />
                </fieldset>
              ))}
            </div>
            {!ro && options.length < 4 && <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={addOption}>+ Add {word.toLowerCase()}</button>}
            {certifications.length === 0 && catalog.some((c) => c.requires_certification) && (
              <p className="text-xs text-slate-500">Some warranty tiers need a manufacturer certification. Add yours in Settings → Company to offer them.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Line items">
        <LineGroup
          title={hasOptions ? `Included in every ${word.toLowerCase()}` : null}
          groupKey={null}
          items={items}
          options={options}
          word={word}
          ro={ro}
          catalog={offered}
          setItemAt={setItemAt}
          remove={(idx) => { setItems((p) => p.filter((_, j) => j !== idx)); touch(); }}
          addFromCatalog={addFromCatalog}
          addCustom={addCustom}
        />
        {options.map((o) => (
          <LineGroup
            key={o.key}
            title={`${o.name} only`}
            groupKey={o.key}
            items={items}
            options={options}
            word={word}
            ro={ro}
            catalog={offered}
            setItemAt={setItemAt}
            remove={(idx) => { setItems((p) => p.filter((_, j) => j !== idx)); touch(); }}
            addFromCatalog={addFromCatalog}
            addCustom={addCustom}
          />
        ))}

        <div className="mt-6 flex flex-col items-end gap-1.5 text-sm">
          {!hasOptions && <div className="flex w-72 max-w-full justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(single.t.subtotal)}</span></div>}
          <div className="flex w-72 max-w-full items-center justify-between gap-2">
            <span className="text-slate-500">Discount</span>
            <Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.01" value={discount} onChange={(e) => { setDiscount(n(e.target.value)); touch(); }} aria-label="Discount" />
          </div>
          <div className="flex w-72 max-w-full items-center justify-between gap-2">
            <span className="whitespace-nowrap text-slate-500">Tax %</span>
            <Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.001" value={taxRate} onChange={(e) => { setTaxRate(n(e.target.value)); touch(); }} aria-label="Tax rate" />
          </div>
          {!hasOptions && (
            <>
              <div className="flex w-72 max-w-full justify-between"><span className="text-slate-500">Tax</span><span className="tabular-nums">{money(single.t.tax)}</span></div>
              <div className="flex w-72 max-w-full justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="estimate-total">{money(single.t.total)}</span></div>
              {summary.squares > 0 && <div className="text-xs text-slate-500">{money(single.t.total / summary.squares)} per square</div>}
              {single.monthly > 0 && <div className="text-xs text-slate-500">As low as {money(single.monthly)}/mo</div>}
            </>
          )}
        </div>

        {hasOptions ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">{word}</th><th className="py-1 text-right font-medium">Total</th>{financing.enabled && <th className="py-1 text-right font-medium">Monthly</th>}<th className="py-1 text-right font-medium">Cost</th><th className="py-1 text-right font-medium">Gross profit</th><th className="py-1 text-right font-medium">Margin</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {perOption.map(({ o, t, mg, monthly }) => (
                  <tr key={o.key} data-testid="option-total">
                    <td className="py-2 font-medium">{o.name} {o.recommended && <Badge tone="orange">Recommended</Badge>}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(t.total)}</td>
                    {financing.enabled && <td className="py-2 text-right tabular-nums text-slate-600">{money(monthly)}/mo</td>}
                    <td className="py-2 text-right tabular-nums text-slate-600">{money(mg.cost)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{money(mg.profit)}</td>
                    <td className={cx("py-2 text-right tabular-nums font-medium", mg.sell > 0 && mg.pct < minMarginPct ? "text-red-700" : "text-green-700")}>{mg.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>Cost <b className="tabular-nums text-slate-800">{money(single.mg.cost)}</b></span>
            <span>Gross profit <b className="tabular-nums text-slate-800">{money(single.mg.profit)}</b></span>
            <span>Margin <b className={cx("tabular-nums", single.mg.sell > 0 && single.mg.pct < minMarginPct ? "text-red-700" : "text-green-700")} data-testid="margin-pct">{single.mg.pct.toFixed(1)}%</b></span>
          </div>
        )}
        {(hasOptions ? perOption.some((p) => p.mg.sell > 0 && p.mg.pct < minMarginPct) : single.mg.sell > 0 && single.mg.pct < minMarginPct) && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="margin-warning">
            ⚠ Margin is below your {minMarginPct}% floor{hasOptions ? ` on ${perOption.filter((p) => p.mg.sell > 0 && p.mg.pct < minMarginPct).map((p) => p.o.name).join(", ")}` : ""}. Check prices, the discount, or costs in the price book.
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
            <Textarea disabled={ro} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} placeholder="Scope of work, color selection, what to expect on install day…" aria-label="Notes to customer" className="min-h-28" />
            {aiEnabled && <p className="mt-1 text-xs text-slate-500">AI drafts are a starting point. Review before sending.</p>}
          </div>
          <Field label="Terms"><Textarea disabled={ro} value={terms} onChange={(e) => { setTerms(e.target.value); touch(); }} className="min-h-28" /></Field>
        </div>
      </Card>

      {!ro && (
        <div className="no-print sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3">
          {msg?.error && <p role="alert" className="max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow">{msg.error}</p>}
          {msg?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 shadow">{msg.ok}</p>}
          <Button onClick={save} disabled={pending} className={cx("min-h-11 shadow-lg", !dirty && "opacity-80")}>
            {pending ? "Saving…" : dirty ? "Save estimate" : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LineGroup({ title, groupKey, items, options, word, ro, catalog, setItemAt, remove, addFromCatalog, addCustom }: {
  title: string | null;
  groupKey: string | null;
  items: DraftItem[];
  options: DraftOption[];
  word: string;
  ro: boolean;
  catalog: CatalogRow[];
  setItemAt: (idx: number, patch: Partial<DraftItem>) => void;
  remove: (idx: number) => void;
  addFromCatalog: (cid: string, optionKey: string | null) => void;
  addCustom: (optionKey: string | null) => void;
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
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Description</th>
              <th className="w-24 pb-2 font-medium">Qty</th>
              <th className="w-20 pb-2 font-medium">Unit</th>
              <th className="w-24 pb-2 font-medium">Unit price</th>
              <th className="w-24 pb-2 font-medium">Unit cost</th>
              {options.length > 0 && <th className="w-40 pb-2 font-medium">Applies to</th>}
              <th className="w-24 pb-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, idx }) => (
              <tr key={idx} className="align-top">
                <td className="py-1 pr-2"><Input disabled={ro} value={it.description} onChange={(e) => setItemAt(idx, { description: e.target.value })} aria-label="Description" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.quantity} onChange={(e) => setItemAt(idx, { quantity: e.target.value as unknown as number })} aria-label="Quantity" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} value={it.unit} onChange={(e) => setItemAt(idx, { unit: e.target.value })} aria-label="Unit" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.unit_price} onChange={(e) => setItemAt(idx, { unit_price: e.target.value as unknown as number })} aria-label="Unit price" /></td>
                <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" min="0" value={it.unit_cost} onChange={(e) => setItemAt(idx, { unit_cost: e.target.value as unknown as number })} aria-label="Unit cost" className="text-slate-500" /></td>
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
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({money(c.unit_price)}/{c.unit})</option>)}
          </Select>
          <Button type="button" variant="ghost" onClick={() => addCustom(groupKey)}>+ Custom line</Button>
        </div>
      )}
    </section>
  );
}
