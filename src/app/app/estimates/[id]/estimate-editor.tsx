"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { money } from "@/lib/format";
import { normalizeMeasurements, pitchFactor, round2, summarize, takeoff, totals, type Measurements } from "@/lib/roof";
import type { CatalogItem, Item } from "@/lib/types";
import { saveEstimate } from "../actions";

type Props = {
  id: string;
  locked: boolean;
  catalog: CatalogItem[];
  initial: {
    measurements: unknown;
    items: Item[];
    tax_rate: number;
    discount: number;
    notes: string | null;
    terms: string | null;
  };
  defaultWaste: number;
};

const n = (v: string) => (v === "" ? 0 : Number(v));

export function EstimateEditor({ id, locked, catalog, initial, defaultWaste }: Props) {
  const [m, setM] = useState<Measurements>(() => normalizeMeasurements(initial.measurements, defaultWaste));
  const [items, setItems] = useState<Item[]>(initial.items);
  const [taxRate, setTaxRate] = useState(Number(initial.tax_rate));
  const [discount, setDiscount] = useState(Number(initial.discount));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");

  const summary = useMemo(() => summarize(m), [m]);
  const t = useMemo(() => totals(items, discount, taxRate), [items, discount, taxRate]);
  const byKey = useMemo(() => new Map(catalog.filter((c) => c.calc_key).map((c) => [c.calc_key!, c])), [catalog]);
  const calcNames = useMemo(() => new Set(catalog.filter((c) => c.calc_key).map((c) => c.name)), [catalog]);

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
  const setItem = (i: number, patch: Partial<Item>) => { setItems((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it))); touch(); };

  function applyCalculator() {
    const generated: Item[] = [];
    const missing: string[] = [];
    for (const row of takeoff(m)) {
      const c = byKey.get(row.key);
      if (!c) { missing.push(row.key); continue; }
      generated.push({ description: c.name, quantity: row.quantity, unit: c.unit, unit_price: Number(c.unit_price), category: c.category });
    }
    // Keep hand-added lines, replace calculator lines.
    const custom = items.filter((it) => !calcNames.has(it.description));
    setItems([...generated, ...custom]);
    touch();
    if (missing.length) setMsg({ error: `No price-book item for: ${missing.join(", ")}. Add them in Settings → Price book.` });
  }

  function addFromCatalog(cid: string) {
    const c = catalog.find((x) => x.id === cid);
    if (!c) return;
    setItems((p) => [...p, { description: c.name, quantity: 1, unit: c.unit, unit_price: Number(c.unit_price), category: c.category }]);
    setPick("");
    touch();
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveEstimate({
        id,
        measurements: m as unknown as Record<string, unknown>,
        items: items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 })),
        tax_rate: taxRate,
        discount,
        notes: notes || null,
        terms: terms || null,
      });
      setMsg(res ?? null);
      if (res && !res.error) setDirty(false);
    });
  }

  const ro = locked;

  return (
    <div className="space-y-6">
      <Card
        title="Roof measurements"
        actions={!ro && <Button variant="secondary" onClick={applyCalculator} type="button">Fill line items from measurements</Button>}
      >
        <fieldset disabled={ro} className="space-y-5">
          <div>
            <div className="mb-2 hidden grid-cols-[1fr_7rem_5.5rem_5rem_2rem] gap-2 text-xs font-medium text-slate-500 sm:grid">
              <span>Roof section</span><span>Plan area (sq ft)</span><span>Pitch (/12)</span><span className="text-right">Squares</span><span />
            </div>
            {m.sections.map((s, i) => (
              <div key={i} className="mb-3 grid grid-cols-[1fr_1fr_4.5rem_2rem] items-center gap-2 sm:mb-2 sm:grid-cols-[1fr_7rem_5.5rem_5rem_2rem]">
                <Input className="col-span-4 sm:col-span-1" value={s.label} onChange={(e) => setSection(i, { label: e.target.value })} aria-label="Section name" />
                <Input type="number" min="0" step="1" value={s.area || ""} onChange={(e) => setSection(i, { area: n(e.target.value) })} aria-label="Plan area" placeholder="Plan sq ft" />
                <Input type="number" min="0" max="24" step="0.5" value={s.pitch} onChange={(e) => setSection(i, { pitch: n(e.target.value) })} aria-label="Pitch" placeholder="Pitch /12" />
                <span className="text-right text-sm tabular-nums text-slate-700"><span className="text-xs text-slate-400 sm:hidden">sq </span>{round2((s.area * pitchFactor(s.pitch)) / 100).toFixed(2)}</span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600 disabled:invisible"
                  disabled={m.sections.length === 1}
                  onClick={() => setMeas({ sections: m.sections.filter((_, j) => j !== i) })}
                  aria-label="Remove section"
                >✕</button>
              </div>
            ))}
            <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setMeas({ sections: [...m.sections, { label: `Section ${m.sections.length + 1}`, area: 0, pitch: m.sections.at(-1)?.pitch ?? 6 }] })}>
              + Add section
            </button>
            <p className="mt-1 text-xs text-slate-500">Plan area is the footprint from above (from aerial measurements or length × width). The pitch factor converts it to true surface area.</p>
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
            <label className="col-span-2 flex items-center gap-4 pt-5 text-sm text-slate-700 sm:col-span-3">
              <span className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-500" checked={m.ridgeVent} onChange={(e) => setMeas({ ridgeVent: e.target.checked })} />Ridge vent</span>
              <span className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-500" checked={m.includeDumpster} onChange={(e) => setMeas({ includeDumpster: e.target.checked })} />Dumpster</span>
              <span className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-500" checked={m.includePermit} onChange={(e) => setMeas({ includePermit: e.target.checked })} />Permit</span>
            </label>
          </div>
        </fieldset>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-center sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Surface area</dt><dd className="text-lg font-semibold tabular-nums">{summary.surfaceArea.toLocaleString()} ft²</dd></div>
          <div><dt className="text-xs text-slate-500">Squares</dt><dd className="text-lg font-semibold tabular-nums">{summary.squares.toFixed(2)}</dd></div>
          <div><dt className="text-xs text-slate-500">Order (w/ {m.wastePct}% waste)</dt><dd className="text-lg font-semibold tabular-nums">{summary.orderSquares.toFixed(2)} sq</dd></div>
          <div><dt className="text-xs text-slate-500">Shingle bundles</dt><dd className="text-lg font-semibold tabular-nums">{summary.bundles}</dd></div>
        </dl>
      </Card>

      <Card title="Line items">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Description</th>
                <th className="w-24 pb-2 font-medium">Qty</th>
                <th className="w-20 pb-2 font-medium">Unit</th>
                <th className="w-28 pb-2 font-medium">Unit price</th>
                <th className="w-28 pb-2 text-right font-medium">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2"><Input disabled={ro} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} aria-label="Description" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })} aria-label="Quantity" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unit" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" min="0" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value as unknown as number })} aria-label="Unit price" /></td>
                  <td className="py-3 text-right tabular-nums">{money(round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)))}</td>
                  <td className="py-2 text-center">
                    {!ro && <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => { setItems((p) => p.filter((_, j) => j !== i)); touch(); }} aria-label="Remove line">✕</button>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No line items yet. Enter measurements and click <b>Fill line items from measurements</b>, or add lines below.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!ro && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Select className="w-auto max-w-xs" value={pick} onChange={(e) => addFromCatalog(e.target.value)} aria-label="Add from price book">
              <option value="">+ Add from price book…</option>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({money(c.unit_price)}/{c.unit})</option>)}
            </Select>
            <Button type="button" variant="ghost" onClick={() => { setItems((p) => [...p, { description: "", quantity: 1, unit: "ea", unit_price: 0, category: "other" }]); touch(); }}>
              + Custom line
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-col items-end gap-1.5 text-sm">
          <div className="flex w-72 justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(t.subtotal)}</span></div>
          <div className="flex w-72 items-center justify-between gap-2">
            <span className="text-slate-500">Discount</span>
            <Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.01" value={discount} onChange={(e) => { setDiscount(n(e.target.value)); touch(); }} aria-label="Discount" />
          </div>
          <div className="flex w-72 items-center justify-between gap-2">
            <span className="whitespace-nowrap text-slate-500">Tax %</span>
            <Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.001" value={taxRate} onChange={(e) => { setTaxRate(n(e.target.value)); touch(); }} aria-label="Tax rate" />
          </div>
          <div className="flex w-72 justify-between"><span className="text-slate-500">Tax</span><span className="tabular-nums">{money(t.tax)}</span></div>
          <div className="flex w-72 justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
          {summary.squares > 0 && <div className="text-xs text-slate-500">{money(t.total / summary.squares)} per square</div>}
        </div>
      </Card>

      <Card title="Notes & terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notes to customer"><Textarea disabled={ro} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} placeholder="Scope of work, warranty, color selection…" /></Field>
          <Field label="Terms"><Textarea disabled={ro} value={terms} onChange={(e) => { setTerms(e.target.value); touch(); }} /></Field>
        </div>
      </Card>

      {!ro && (
        <div className="no-print sticky bottom-4 z-10 flex items-center justify-end gap-3">
          {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow">{msg.error}</p>}
          {msg?.ok && !dirty && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 shadow">{msg.ok}</p>}
          <Button onClick={save} disabled={pending} className={cx("shadow-lg", !dirty && "opacity-80")}>
            {pending ? "Saving…" : dirty ? "Save estimate" : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}
