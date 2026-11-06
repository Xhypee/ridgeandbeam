"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import type { ActionResult } from "@/components/action-form";
import { saveFinancing, savePaymentSchedule } from "./actions";
import { monthlyPayment } from "./finance-math";

type Milestone = { label: string; pct: number; trigger: string };
const TRIGGERS = [
  { v: "signed", l: "When the contract is signed" },
  { v: "delivered", l: "When materials are delivered" },
  { v: "completed", l: "When the job is completed" },
];

function Result({ r }: { r: ActionResult }) {
  if (!r) return null;
  if (r.error) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.error}</p>;
  if (r.ok) return <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{r.ok}</p>;
  return null;
}

export function ScheduleEditor({ initial, disabled }: { initial: Milestone[]; disabled?: boolean }) {
  const [rows, setRows] = useState<Milestone[]>(initial.length ? initial : [{ label: "Deposit", pct: 100, trigger: "signed" }]);
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const sum = Math.round(rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) * 100) / 100;
  const set = (i: number, patch: Partial<Milestone>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_6rem_14rem_auto]" data-milestone>
            <Input aria-label="Milestone name" value={r.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled} />
            <Input aria-label="Percent" type="number" min={1} max={100} step="0.5" value={r.pct} onChange={(e) => set(i, { pct: Number(e.target.value) })} disabled={disabled} />
            <Select aria-label="When it's due" value={r.trigger} onChange={(e) => set(i, { trigger: e.target.value })} disabled={disabled} className="col-span-2 sm:col-span-1">
              {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </Select>
            {!disabled && <Button type="button" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} className="col-span-2 sm:col-span-1">Remove</Button>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={cx("text-sm font-medium", sum === 100 ? "text-green-700" : "text-red-700")} data-schedule-sum>Total {sum}%{sum !== 100 && " — must be 100%"}</span>
        {!disabled && (
          <span className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setRows([...rows, { label: "Progress", pct: 0, trigger: "delivered" }])} disabled={rows.length >= 6}>+ Milestone</Button>
            <Button type="button" disabled={pending || sum !== 100} onClick={() => start(async () => setResult(await savePaymentSchedule(rows.map((r) => ({ ...r, pct: Number(r.pct) })))))}>
              {pending ? "Saving…" : "Save schedule"}
            </Button>
          </span>
        )}
      </div>
      <Result r={result} />
    </div>
  );
}

type Lender = { name: string; url: string; dealer_fee_pct?: number };
type Financing = { enabled: boolean; apr: number; term_months: number; lenders: Lender[] };

export function FinancingEditor({ initial, disabled }: { initial: Financing; disabled?: boolean }) {
  const [f, setF] = useState<Financing>({ ...initial, lenders: initial.lenders ?? [] });
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const setLender = (i: number, patch: Partial<Lender>) => setF({ ...f, lenders: f.lenders.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const example = monthlyPayment(15000, Number(f.apr) || 0, Number(f.term_months) || 0);
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} disabled={disabled} />
        Offer financing on estimates and invoices
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Typical APR (%)"><Input type="number" min={0} max={40} step="0.01" value={f.apr} onChange={(e) => setF({ ...f, apr: Number(e.target.value) })} disabled={disabled} /></Field>
        <Field label="Term (months)"><Input type="number" min={6} max={300} step="1" value={f.term_months} onChange={(e) => setF({ ...f, term_months: Number(e.target.value) })} disabled={disabled} /></Field>
      </div>
      <p className="text-xs text-slate-500">Example shown to homeowners: a $15,000 roof is about <b>${example.toFixed(0)}/month</b> for {f.term_months} months at {f.apr}% APR (subject to credit approval).</p>
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600">Lenders</p>
        {f.lenders.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[10rem_1fr_6rem_auto]" data-lender>
            <Input aria-label="Lender name" placeholder="GreenSky" value={l.name} onChange={(e) => setLender(i, { name: e.target.value })} disabled={disabled} />
            <Input aria-label="Prequalification link" placeholder="https://…" value={l.url} onChange={(e) => setLender(i, { url: e.target.value })} disabled={disabled} className="col-span-2 sm:col-span-1" />
            <Input aria-label="Dealer fee %" type="number" min={0} max={40} step="0.01" value={l.dealer_fee_pct ?? 0} onChange={(e) => setLender(i, { dealer_fee_pct: Number(e.target.value) })} disabled={disabled} />
            {!disabled && <Button type="button" variant="ghost" onClick={() => setF({ ...f, lenders: f.lenders.filter((_, j) => j !== i) })}>Remove</Button>}
          </div>
        ))}
        {!disabled && f.lenders.length < 5 && <Button type="button" variant="secondary" onClick={() => setF({ ...f, lenders: [...f.lenders, { name: "", url: "", dealer_fee_pct: 0 }] })}>+ Lender</Button>}
      </div>
      {!disabled && (
        <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await saveFinancing({ ...f, apr: Number(f.apr), term_months: Number(f.term_months), lenders: f.lenders.map((l) => ({ ...l, dealer_fee_pct: Number(l.dealer_fee_pct ?? 0) })) })))}>
          {pending ? "Saving…" : "Save financing"}
        </Button>
      )}
      <Result r={result} />
    </div>
  );
}
