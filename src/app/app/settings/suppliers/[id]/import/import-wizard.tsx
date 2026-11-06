"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { CALC_KEY_MAP, CALC_KEYS } from "@/lib/calc-keys";
import { money } from "@/lib/format";
import {
  autoMapColumns, buildRows, bulkMap, cellsToStrings, costPerCalcUnit, detectHeaderRow, guessGst, IMPORT_FIELDS, parseDelimited, rowIssues,
  UNIT_SHORT, type ColumnMapping, type ImportField, type ParsedRow,
} from "@/lib/price-sheet";
import { appendImportRows, beginImport, cancelImport, finishImport, type ImportRow } from "../../actions";

type Saved = { columns?: Record<string, string>; prices_include_gst?: boolean } | null;
const STEPS = ["Sheet", "Columns", "Check rows", "Save"] as const;
const PAGE = 50;
const CHUNK = 400;
const nh = (s: string) => s.trim().toLowerCase();

export function ImportWizard({ orgSupplierId, supplierName, today, saved, previousKeys = {} }: { orgSupplierId: string; supplierName: string; today: string; saved: Saved; previousKeys?: Record<string, string> }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [gst, setGst] = useState<"inc" | "ex" | null>(saved?.prices_include_gst === undefined ? null : saved.prices_include_gst ? "inc" : "ex");
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});
  const [filter, setFilter] = useState<"all" | "errors" | "unmapped">("all");
  const [page, setPage] = useState(1);
  const [needle, setNeedle] = useState("");
  const [bulkKey, setBulkKey] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [name, setName] = useState(`${supplierName} price list`);
  const [effective, setEffective] = useState(today);
  const [authorised, setAuthorised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (step === 0 || busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step, busy]);

  const header = useMemo(() => grid[headerIdx] ?? [], [grid, headerIdx]);
  const colName = (i: number) => header[i] || `Column ${i + 1}`;
  const width = useMemo(() => grid.reduce((w, r) => Math.max(w, r.length), 0), [grid]);

  function loadGrid(rows: string[][], fname: string | null) {
    if (rows.length < 2) { setError("That sheet has no data rows. Check you picked the right file or copied the header row and the prices."); return; }
    const h = detectHeaderRow(rows);
    const head = rows[h] ?? [];
    let m = autoMapColumns(head);
    if (saved?.columns) {
      const fromSaved: ColumnMapping = {};
      for (const [field, text] of Object.entries(saved.columns)) {
        const i = head.findIndex((c) => nh(c) === nh(text));
        if (i >= 0) fromSaved[field as ImportField] = i;
      }
      if (fromSaved.description !== undefined && fromSaved.price !== undefined) m = fromSaved;
    }
    setGrid(rows);
    setHeaderIdx(h);
    setMapping(m);
    if (gst === null) setGst(guessGst(head, m));
    setOverrides({});
    setFilename(fname);
    setError(null);
    setStep(1);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setBusy("Reading file…");
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/universal");
        loadGrid(cellsToStrings((await readSheet(await f.arrayBuffer())) as unknown[][]), f.name);
      } else if (/\.xls$/i.test(f.name)) {
        setError("Old .xls files can't be read. Save it as .xlsx or CSV in Excel, or copy the rows and use “Paste from Excel”.");
      } else {
        loadGrid(parseDelimited(await f.text()), f.name);
      }
    } catch {
      setError("Couldn't read that file. Try saving it as CSV, or copy the rows and paste them.");
    } finally {
      setBusy(null);
    }
  }

  const rows: ParsedRow[] = useMemo(() => {
    if (!grid.length || mapping.description === undefined || mapping.price === undefined || gst === null) return [];
    return buildRows(grid, headerIdx, mapping, { pricesIncludeGst: gst === "inc" }).map((r) =>
      r.line in overrides ? { ...r, calc_key: overrides[r.line] } : r.product_code && previousKeys[r.product_code] ? { ...r, calc_key: previousKeys[r.product_code] } : r);
  }, [grid, headerIdx, mapping, gst, overrides, previousKeys]);
  const issues = useMemo(() => new Map(rows.map((r) => [r.line, rowIssues(r)])), [rows]);
  const good = rows.filter((r) => r.errors.length === 0);
  const errorCount = rows.length - good.length;
  const unmapped = good.filter((r) => !r.calc_key).length;
  const shown = rows.filter((r) => filter === "all" || (filter === "errors" ? (issues.get(r.line)?.length ?? 0) > 0 : r.errors.length === 0 && !r.calc_key));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageRows = shown.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);

  function applyBulk() {
    const key = bulkKey || null;
    const { rows: next, changed } = bulkMap(rows, needle, key);
    const o = { ...overrides };
    next.forEach((r, i) => { if (r.calc_key !== rows[i].calc_key) o[r.line] = r.calc_key; });
    setOverrides(o);
    setBulkMsg(needle.trim() ? `${changed} row${changed === 1 ? "" : "s"} containing “${needle.trim()}” mapped to ${key ? CALC_KEY_MAP[key].label : "not mapped"}.` : "Type the words to match.");
  }

  async function save() {
    setError(null);
    if (!authorised) { setError("Tick the box to confirm you're authorised to use this price list."); return; }
    if (!good.length) { setError("There are no valid rows to save."); return; }
    setBusy("Saving…");
    const savedColumns: Record<string, string> = {};
    for (const [f, i] of Object.entries(mapping)) if (i !== undefined && header[i]) savedColumns[f] = header[i];
    const b = await beginImport({ orgSupplierId, name, effectiveDate: effective, pricesIncludeGst: gst === "inc", filename: filename ?? (source === "paste" ? "Pasted from Excel" : null), authorised: authorised as true, mapping: savedColumns });
    if (b.error || !b.listId) { setBusy(null); setError(b.error ?? "Couldn't start the import."); return; }
    const payload: ImportRow[] = good.map((r) => ({
      product_code: r.product_code, description: r.description.slice(0, 400), profile: r.profile, finish: r.finish, thickness_mm: r.thickness_mm,
      cover_width_mm: r.cover_width_mm, girth_mm: r.girth_mm, length_mm: r.length_mm, unit: r.unit!, pack_qty: r.pack_qty, cost_ex_gst: r.cost_ex_gst!,
      calc_key: r.calc_key, raw: Object.fromEntries(Object.entries(r.raw).slice(0, 30).map(([k, v]) => [k.slice(0, 80), v.slice(0, 500)])),
    }));
    for (let i = 0; i < payload.length; i += CHUNK) {
      setBusy(`Saving rows ${i + 1}–${Math.min(i + CHUNK, payload.length)} of ${payload.length}…`);
      const r = await appendImportRows(b.listId, payload.slice(i, i + CHUNK));
      if (r.error) { await cancelImport(b.listId); setBusy(null); setError(r.error); return; }
    }
    const f = await finishImport(b.listId);
    setBusy(null);
    if (f.error) { setError(f.error); return; }
    setStep(4);
    router.push(`/app/settings/suppliers/${orgSupplierId}?imported=1`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-1 text-xs" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("rounded-full px-3 py-1.5 font-medium", i === step ? "bg-ink text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500")}>{i + 1}. {s}</li>
        ))}
      </ol>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {busy && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" aria-live="polite">{busy}</p>}

      {step === 0 && (
        <Card>
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(["file", "paste"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSource(s)} className={cx("min-h-11 flex-1 rounded-md px-3 font-medium", source === s ? "bg-white shadow-sm" : "text-slate-600")}>
                {s === "file" ? "Upload CSV / Excel" : "Paste from Excel"}
              </button>
            ))}
          </div>
          {source === "file" ? (
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-brand-400">
              <span className="font-medium text-slate-800">Choose your price sheet</span>
              <span className="text-xs text-slate-500">.csv, .txt (tab separated) or .xlsx</span>
              <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv" className="sr-only" data-testid="sheet-file" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="space-y-3">
              <Field label="Paste rows (include the header row)" hint="In Excel: select the cells, copy, then paste here.">
                <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} className="font-mono text-xs" data-testid="sheet-paste" />
              </Field>
              <Button type="button" className="min-h-11" disabled={!paste.trim()} onClick={() => loadGrid(parseDelimited(paste), null)}>Read pasted rows</Button>
            </div>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card title={`Match columns${filename ? ` — ${filename}` : ""}`}>
          <div className="space-y-4">
            <Field label="Header row" hint={`We found ${grid.length} rows. The header row holds the column names.`} className="max-w-xs">
              <Select value={headerIdx} onChange={(e) => { const h = Number(e.target.value); setHeaderIdx(h); setMapping(autoMapColumns(grid[h] ?? [])); }}>
                {grid.slice(0, 15).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.slice(0, 4).join(" | ").slice(0, 60)}</option>)}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <Field key={f.field} label={`${f.label}${"required" in f && f.required ? " *" : ""}`} hint={"hint" in f ? f.hint : undefined}>
                  <Select
                    aria-label={f.label}
                    data-field={f.field}
                    value={mapping[f.field] ?? ""}
                    onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.field]; else n[f.field] = Number(e.target.value); return n; })}
                  >
                    <option value="">— not in this sheet —</option>
                    {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <fieldset className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <legend className="px-1 text-sm font-medium text-slate-800">Are the prices in this sheet ex GST or inc GST?</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["ex", "inc"] as const).map((g) => (
                  <label key={g} className={cx("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 ring-1", gst === g ? "bg-white ring-brand-500" : "ring-slate-300")}>
                    <input type="radio" name="gst" value={g} checked={gst === g} onChange={() => setGst(g)} className="h-5 w-5 accent-brand-500" />
                    {g === "ex" ? "Ex GST (trade prices)" : "Inc GST"}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Prices are stored ex GST. Inc-GST prices are divided by 1.1.</p>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setStep(0)}>Back</Button>
              <Button type="button" className="min-h-11" disabled={mapping.description === undefined || mapping.price === undefined || gst === null} onClick={() => { setPage(1); setStep(2); }}>Check rows</Button>
              {(mapping.description === undefined || mapping.price === undefined) && <span className="self-center text-xs text-amber-700">Choose the description and price columns.</span>}
              {gst === null && mapping.price !== undefined && <span className="self-center text-xs text-amber-700">Say whether prices include GST.</span>}
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Check rows">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-green-50 p-2"><p className="text-xl font-semibold text-green-800" data-testid="ready-count">{good.length}</p><p className="text-xs text-green-800">rows ready</p></div>
              <div className="rounded-lg bg-red-50 p-2"><p className="text-xl font-semibold text-red-700" data-testid="error-count">{errorCount}</p><p className="text-xs text-red-700">with errors (skipped)</p></div>
              <div className="rounded-lg bg-amber-50 p-2"><p className="text-xl font-semibold text-amber-800" data-testid="unmapped-count">{unmapped}</p><p className="text-xs text-amber-800">not mapped</p></div>
            </div>
            <p className="text-xs text-slate-500">
              Map each row to what the roof calculator measures so estimates can price from it. Unmapped rows are still saved (for orders) and you can map them later.
              {Object.keys(previousKeys).length > 0 && " Product codes you mapped in the current price list keep that mapping."}
            </p>

            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <Field label="Map all rows containing" className="min-w-40 flex-1"><Input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="e.g. quad gutter" aria-label="Rows containing" /></Field>
              <Field label="to" className="min-w-48 flex-1">
                <Select value={bulkKey} onChange={(e) => setBulkKey(e.target.value)} aria-label="Map to">
                  <option value="">Not mapped</option>
                  {CALC_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label} ({k.unit})</option>)}
                </Select>
              </Field>
              <Button type="button" variant="secondary" className="min-h-10" onClick={applyBulk}>Map rows</Button>
              {bulkMsg && <p className="w-full text-xs text-slate-600" data-testid="bulk-msg">{bulkMsg}</p>}
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {([["all", `All ${rows.length}`], ["errors", "Problems"], ["unmapped", `Unmapped ${unmapped}`]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => { setFilter(k); setPage(1); }} className={cx("min-h-10 rounded-full px-3 ring-1", filter === k ? "bg-ink text-white ring-ink" : "bg-white text-slate-600 ring-slate-300")}>{l}</button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-[760px] w-full text-sm" data-testid="preview">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Code / description</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">Cost ex GST</th><th className="px-2 py-2">Estimating item</th><th className="px-2 py-2 text-right">Priced at</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => {
                    const iss = issues.get(r.line) ?? [];
                    const def = r.calc_key ? CALC_KEY_MAP[r.calc_key] : null;
                    const per = def && r.unit && r.cost_ex_gst !== null ? costPerCalcUnit({ unit: r.unit, cost_ex_gst: r.cost_ex_gst, length_mm: r.length_mm, cover_width_mm: r.cover_width_mm, pack_qty: r.pack_qty }, def.unit) : null;
                    return (
                      <tr key={r.line} className={cx(r.errors.length ? "bg-red-50/70" : !r.calc_key && "bg-amber-50/60")} data-testid="preview-row">
                        <td className="px-2 py-2 text-xs text-slate-500">{r.line}</td>
                        <td className="px-2 py-2">
                          <span className="block text-xs text-slate-500">{r.product_code}</span>
                          {r.description || <i className="text-slate-400">no description</i>}
                          <span className="block text-xs text-slate-500">{[r.profile, r.finish, r.length_mm && `${r.length_mm / 1000} m`, r.pack_qty && `pack ${r.pack_qty}`].filter(Boolean).join(" · ")}</span>
                          {iss.map((m) => <span key={m} className="block text-xs text-red-700">{m}</span>)}
                          {r.warnings.map((m) => <span key={m} className="block text-xs text-amber-700">{m}</span>)}
                        </td>
                        <td className="px-2 py-2">{r.unit ? UNIT_SHORT[r.unit] : r.unit_raw}</td>
                        <td className="px-2 py-2 text-right">{r.cost_ex_gst !== null ? money(r.cost_ex_gst) : "—"}</td>
                        <td className="px-2 py-2">
                          <Select aria-label={`Estimating item for row ${r.line}`} value={r.calc_key ?? ""} disabled={r.errors.length > 0} className="min-h-10 min-w-44"
                            onChange={(e) => setOverrides((o) => ({ ...o, [r.line]: e.target.value || null }))}>
                            <option value="">Not mapped</option>
                            {CALC_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label} ({k.unit})</option>)}
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-right text-xs">{per !== null && def ? <span className="font-medium text-slate-800">{money(per)}/{UNIT_SHORT[def.unit] ?? def.unit}</span> : <span className="text-slate-400">—</span>}</td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nothing here.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</Button>
                <span className="text-slate-500">Page {Math.min(page, pages)} of {pages}</span>
                <Button type="button" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setStep(1)}>Back</Button>
              <Button type="button" className="min-h-11" disabled={!good.length} onClick={() => setStep(3)}>Continue with {good.length} rows</Button>
            </div>
          </div>
        </Card>
      )}

      {step >= 3 && (
        <Card title="Save price list">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
              <Field label="Prices effective from"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
            </div>
            <p className="text-sm text-slate-600">
              <Badge tone="green">{good.length} rows</Badge> will become the active <b>{supplierName}</b> price list{errorCount > 0 && <> ({errorCount} rows with errors skipped)</>}.
              {unmapped > 0 && <> {unmapped} rows aren&apos;t mapped to an estimating item yet.</>} Your current price list is kept as an inactive version.
            </p>
            <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" data-testid="authorised" />
              <span>
                <b>I&apos;m authorised to use this price list for my business.</b>
                <span className="block text-xs text-slate-500">These are your account prices. They stay private to your business and are never shown to homeowners or crew leads.</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="min-h-11" disabled={Boolean(busy)} onClick={() => setStep(2)}>Back</Button>
              <Button type="button" className="min-h-11" disabled={Boolean(busy) || step === 4} onClick={save}>{busy ? "Saving…" : "Save price list"}</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
