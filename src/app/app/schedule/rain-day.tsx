"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { applyRainDay, previewRainDay, type RainDayInput, type RainDayPreviewRow } from "./actions";

const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const span = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);

export function RainDay({ crews, defaultDate, riskyDates }: { crews: { id: string; name: string }[]; defaultDate: string; riskyDates: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<RainDayInput>({ date: defaultDate, crewId: "all", days: 1, notifyHomeowners: true, notifyCrews: true });
  const [rows, setRows] = useState<RainDayPreviewRow[] | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<RainDayInput>) => { setInput((i) => ({ ...i, ...patch })); setRows(null); };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {msg?.ok && <span role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg.ok}</span>}
        <Button variant="secondary" onClick={() => { setOpen(true); setMsg(null); }}>🌧 Rain day</Button>
      </div>
    );
  }
  return (
    <div className="w-full rounded-xl bg-white p-4 ring-1 ring-slate-200" data-testid="rain-day">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Rain day — bulk reschedule</h2>
        <button className="text-sm text-slate-500" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Rained-out day">
          <Input type="date" name="rain_date" value={input.date} onChange={(e) => set({ date: e.target.value })} list="risky-days" />
          <datalist id="risky-days">{riskyDates.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Crew">
          <Select name="rain_crew" value={input.crewId} onChange={(e) => set({ crewId: e.target.value })}>
            <option value="all">All crews</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Push by (working days)">
          <Input type="number" name="rain_days" min={1} max={10} value={Number(input.days)} onChange={(e) => set({ days: Number(e.target.value) || 1 })} />
        </Field>
        <div className="space-y-1 text-sm">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={input.notifyHomeowners} onChange={(e) => set({ notifyHomeowners: e.target.checked })} className="h-4 w-4 accent-brand-500" />Text homeowners</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={input.notifyCrews} onChange={(e) => set({ notifyCrews: e.target.checked })} className="h-4 w-4 accent-brand-500" />Text crews</label>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Moves every job on that day plus the same crew&apos;s later jobs in the next two weeks, skipping weekends. Moved jobs become tentative. Assigned reps and crew leads get an in-app notice.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await previewRainDay(input); if (r.error) setMsg({ error: r.error }); setRows(r.rows ?? null); })}>
          Preview
        </Button>
        {rows && rows.length > 0 && (
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await applyRainDay(input);
            setMsg(r);
            if (r.ok) { setRows(null); setOpen(false); router.refresh(); }
          })}>
            Move {rows.length} job{rows.length === 1 ? "" : "s"} & notify
          </Button>
        )}
      </div>
      {rows && (rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nothing scheduled on that day for this crew.</p> : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm" aria-label="Preview">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0"><b>{r.customer}</b> · {r.title} <span className="text-slate-500">({r.crew ?? "No crew"}{r.reason === "cascade" ? ", knock-on" : ""}{r.locked ? ", will unlock" : ""})</span></span>
              <span className="shrink-0"><s className="text-slate-400">{span(r.from[0], r.from[1])}</s> → <b>{span(r.to[0], r.to[1])}</b></span>
            </li>
          ))}
        </ul>
      ))}
      {msg?.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
    </div>
  );
}
