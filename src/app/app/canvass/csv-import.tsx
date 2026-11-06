"use client";

import { useState, useTransition } from "react";
import { Button, Field, Select, Table, td, th } from "@/components/ui";
import { importKnocks } from "./actions";
import { guessMapping, KNOCK_META, mapImportedStatus, parseCsv } from "./statuses";

const FIELDS = [
  { key: "lat", label: "Latitude", required: true },
  { key: "lng", label: "Longitude", required: true },
  { key: "address", label: "Address" },
  { key: "status", label: "Status / result" },
  { key: "notes", label: "Notes" },
] as const;
type Mapping = Record<(typeof FIELDS)[number]["key"], number>;

/** SPOTIO / SalesRabbit export -> door knocks, with a column-mapping step. */
export function CsvImport({ onDone }: { onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setErr("That file is over 10 MB."); return; }
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) { setErr("That file has no data rows."); return; }
    setRows(parsed);
    setMap(guessMapping(parsed[0]));
  };

  const headers = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const records = map
    ? body.map((r) => ({
        lat: Number(r[map.lat]), lng: Number(r[map.lng]),
        address: map.address >= 0 ? r[map.address] : undefined,
        status: map.status >= 0 ? r[map.status] : undefined,
        notes: map.notes >= 0 ? r[map.notes] : undefined,
      }))
    : [];
  const valid = records.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180 && !(r.lat === 0 && r.lng === 0));

  return (
    <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200" data-csv-import>
      <div>
        <h2 className="text-sm font-semibold">Import from SPOTIO or SalesRabbit</h2>
        <p className="text-sm text-slate-600">Export your pins as CSV (with latitude and longitude columns), then choose which column is which.</p>
      </div>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" aria-label="CSV file" />
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {rows && map && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label + ("required" in f ? " *" : "")}>
                <Select aria-label={`Column for ${f.label}`} value={map[f.key]} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>— none —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <p className="text-sm text-slate-600" data-import-count>{valid.length} of {records.length} rows have a usable location{records.length - valid.length ? ` (${records.length - valid.length} will be skipped)` : ""}.</p>
          <Table>
            <thead><tr><th className={th}>Lat, lng</th><th className={th}>Address</th><th className={th}>Status → ours</th><th className={th}>Notes</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {valid.slice(0, 5).map((r, i) => (
                <tr key={i}>
                  <td className={`${td} tabular-nums`}>{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</td>
                  <td className={td}>{r.address}</td>
                  <td className={td}>{r.status || "—"} → {KNOCK_META[mapImportedStatus(r.status)].label}</td>
                  <td className={td}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button
            type="button"
            disabled={pending || map.lat < 0 || map.lng < 0 || !valid.length || valid.length > 5000}
            onClick={() => start(async () => {
              const r = await importKnocks(valid);
              if (r.error) setErr(r.error);
              else { setRows(null); setMap(null); onDone(r.ok ?? "Imported."); }
            })}
          >
            {pending ? "Importing…" : `Import ${valid.length} doors`}
          </Button>
          {valid.length > 5000 && <p className="text-xs text-red-700">Split files over 5,000 rows.</p>}
        </>
      )}
    </div>
  );
}
