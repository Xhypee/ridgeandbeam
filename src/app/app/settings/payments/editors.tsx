"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select, cx } from "@/components/ui";
import type { ActionResult } from "@/components/action-form";
import { FINANCE_DISCLAIMER, FINANCE_PROVIDERS, type FinanceProviderKey } from "@/lib/payments-au";
import { saveFinancing, savePaymentSchedule } from "./actions";

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

type Lender = { provider: FinanceProviderKey; name: string; url: string };
type Financing = { enabled: boolean; acknowledged?: boolean; lenders: Lender[] };

/** AU finance providers (Brighte, humm, Zip, Plenti) as configurable referral links. */
export function FinancingEditor({ initial, disabled }: { initial: { enabled?: boolean; acknowledged?: boolean; lenders?: Partial<Lender>[] }; disabled?: boolean }) {
  const known = new Map((initial.lenders ?? []).map((l) => [l.provider ?? "other", l]));
  const [enabled, setEnabled] = useState(Boolean(initial.enabled));
  const [ack, setAck] = useState(Boolean(initial.acknowledged));
  const [rows, setRows] = useState(
    FINANCE_PROVIDERS.map((p) => ({ provider: p.key as FinanceProviderKey, name: p.name, hint: p.hint, on: known.has(p.key), url: known.get(p.key)?.url ?? "" })),
  );
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const payload = (): Financing => ({ enabled, acknowledged: ack, lenders: rows.filter((r) => r.on).map((r) => ({ provider: r.provider, name: r.name, url: r.url.trim() })) });
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="finance-disclaimer">{FINANCE_DISCLAIMER}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.provider} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[12rem_1fr]" data-lender={r.provider}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={r.on} disabled={disabled} onChange={(e) => set(i, { on: e.target.checked })} />
              <span>{r.name}<span className="block text-xs font-normal text-slate-500">{r.hint}</span></span>
            </label>
            <Input aria-label={`${r.name} link`} placeholder="https://… your merchant / referral link" value={r.url} disabled={disabled || !r.on} onChange={(e) => set(i, { url: e.target.value })} />
          </div>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-500" checked={ack} disabled={disabled} onChange={(e) => setAck(e.target.checked)} />
        <span>We hold an Australian credit licence, are an authorised credit representative, or act only as a referrer under the provider&apos;s arrangements.</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={enabled} disabled={disabled} onChange={(e) => setEnabled(e.target.checked)} />
        Show these finance links on invoices
      </label>
      {!disabled && (
        <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await saveFinancing(payload())))} className="min-h-11">
          {pending ? "Saving…" : "Save finance links"}
        </Button>
      )}
      <Result r={result} />
    </div>
  );
}
