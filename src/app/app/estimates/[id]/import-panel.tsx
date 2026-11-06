"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { facetsToSections, parseFacetCsv, parsePitch, round2, type FacetRow, type Measurements } from "@/lib/roof";

export type ImportResult = {
  source: string;
  sections: Measurements["sections"];
  edges: Pick<Measurements, "eaves" | "rakes" | "ridges" | "hips" | "valleys">;
  wastePct: number | null;
};

const SOURCES = [
  ["eagleview", "EagleView"],
  ["hover", "Hover"],
  ["roofr", "Roofr"],
  ["gaf_quickmeasure", "GAF QuickMeasure"],
  ["other", "Other report"],
] as const;

type Row = { label: string; area: string; pitch: string };

/**
 * Enter an aerial measurement report's summary (facets with area + pitch, edge lengths, suggested waste)
 * or paste its facet table. Report areas are sloped (true) areas; we convert to plan area for the calculator.
 */
export function ImportPanel({ onApply, onCancel }: { onApply: (r: ImportResult) => void; onCancel: () => void }) {
  const [source, setSource] = useState<string>("eagleview");
  const [mode, setMode] = useState<"rows" | "csv">("rows");
  const [rows, setRows] = useState<Row[]>([{ label: "Facet 1", area: "", pitch: "6/12" }]);
  const [csv, setCsv] = useState("");
  const [areasAre, setAreasAre] = useState<"sloped" | "plan">("sloped");
  const [edges, setEdges] = useState({ eaves: "", rakes: "", ridges: "", hips: "", valleys: "" });
  const [waste, setWaste] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function facets(): { rows: FacetRow[]; errors: string[] } {
    if (mode === "csv") return parseFacetCsv(csv);
    const out: FacetRow[] = [];
    const errs: string[] = [];
    rows.forEach((r, i) => {
      if (!r.area.trim() && !r.label.trim()) return;
      const area = Number(r.area.replace(/,/g, ""));
      const pitch = parsePitch(r.pitch);
      if (!(area > 0)) errs.push(`Facet ${i + 1}: enter an area`);
      else if (pitch == null) errs.push(`Facet ${i + 1}: pitch "${r.pitch}" not understood`);
      else out.push({ label: r.label.trim() || `Facet ${i + 1}`, area, pitch });
    });
    return { rows: out, errors: errs };
  }

  function apply() {
    const f = facets();
    if (!f.rows.length) {
      setErrors(f.errors.length ? f.errors : ["Add at least one facet with an area and pitch."]);
      return;
    }
    if (f.errors.length) {
      setErrors(f.errors);
      return;
    }
    const lf = (v: string) => Math.max(0, Number(v.replace(/,/g, "")) || 0);
    const w = waste.trim() === "" ? null : Math.max(0, Math.min(50, Number(waste) || 0));
    onApply({
      source,
      sections: facetsToSections(f.rows, areasAre),
      edges: { eaves: lf(edges.eaves), rakes: lf(edges.rakes), ridges: lf(edges.ridges), hips: lf(edges.hips), valleys: lf(edges.valleys) },
      wastePct: w,
    });
  }

  const preview = facets();
  const totalSloped = preview.rows.reduce((s, r) => s + r.area, 0);

  return (
    <div className="space-y-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200" data-testid="import-panel">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Report from">
          <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Report source">
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Facet areas are">
          <Select value={areasAre} onChange={(e) => setAreasAre(e.target.value as "sloped" | "plan")}>
            <option value="sloped">Sloped / true area (as on the report)</option>
            <option value="plan">Plan / footprint area</option>
          </Select>
        </Field>
        <Field label="Suggested waste %" hint="From the report's waste table (shingles, 3/12+)">
          <Input type="number" min="0" max="50" value={waste} onChange={(e) => setWaste(e.target.value)} aria-label="Suggested waste" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex gap-1.5 text-sm">
          <button type="button" onClick={() => setMode("rows")} className={`rounded-full px-3 py-1.5 ${mode === "rows" ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>Enter facets</button>
          <button type="button" onClick={() => setMode("csv")} className={`rounded-full px-3 py-1.5 ${mode === "csv" ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>Paste CSV</button>
        </div>
        {mode === "rows" ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_5rem_2rem] gap-2">
                <Input value={r.label} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Facet name" />
                <Input inputMode="decimal" value={r.area} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)))} aria-label="Facet area" placeholder="Area sq ft" />
                <Input value={r.pitch} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, pitch: e.target.value } : x)))} aria-label="Facet pitch" placeholder="6/12" />
                <button type="button" className="text-slate-400 hover:text-red-600 disabled:invisible" disabled={rows.length === 1} onClick={() => setRows((p) => p.filter((_, j) => j !== i))} aria-label="Remove facet">✕</button>
              </div>
            ))}
            <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setRows((p) => [...p, { label: `Facet ${p.length + 1}`, area: "", pitch: p.at(-1)?.pitch ?? "6/12" }])}>+ Add facet</button>
          </div>
        ) : (
          <Field label="One facet per line: name, area, pitch" hint="Copy the facet table from the report. A header row is fine. Example: Front, 1200, 6/12">
            <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} aria-label="Facet CSV" placeholder={"Facet, Area, Pitch\nA, 1200, 6/12\nB, 850, 6/12\nPorch, 180, 2/12"} className="font-mono text-xs" />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["eaves", "rakes", "ridges", "hips", "valleys"] as const).map((k) => (
          <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} (LF)`}>
            <Input inputMode="decimal" value={edges[k]} onChange={(e) => setEdges((p) => ({ ...p, [k]: e.target.value }))} aria-label={`Report ${k}`} />
          </Field>
        ))}
      </div>

      {preview.rows.length > 0 && (
        <p className="text-xs text-slate-600">
          {preview.rows.length} facet{preview.rows.length === 1 ? "" : "s"} · {round2(totalSloped).toLocaleString()} sq ft {areasAre === "sloped" ? "sloped" : "plan"}
          {areasAre === "sloped" ? ` · ${round2(totalSloped / 100).toFixed(2)} squares` : ""}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="list-disc rounded-lg bg-red-50 px-6 py-2 text-sm text-red-700">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={apply}>Use these measurements</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-xs text-slate-500">This replaces the roof sections and edge lengths below. Sections under 3/12 are priced as low-slope automatically.</p>
    </div>
  );
}
