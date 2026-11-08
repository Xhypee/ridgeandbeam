"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import {
  aud, PART_TRIGGER_LABEL, PART_TRIGGERS, PAY_METHOD_HINT, PAY_METHOD_LABEL, PAY_METHODS, presetPlan, PRESET_LABEL, PRESETS, round2,
  type PartInput, type PartTrigger, type PayMethod, type Preset,
} from "@/lib/pay-plan";
import { savePaymentPlan } from "./actions";

const COLOURS = ["#1f5f3f", "#14b8a6", "#0f766e", "#5eead4", "#99e2d8", "#b9d8c3", "#d8eadd", "#4f9c72"];
const inputCls = "block min-h-10 rounded-lg border-0 bg-white px-2.5 text-sm text-ink ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none";

export type EditorProps = {
  jobId: string;
  contractTotal: number;
  remaining: number;
  lockedCount: number;
  initial: PartInput[];
  schedule: { label: string; pct: number; trigger: string }[];
  start: string;
  today: string;
  depositRoom: number | null;
  depositCap: number | null;
  depositNote: string | null;
  stateName: string | null;
  methods: PayMethod[];
  reminders: boolean;
  onlineReady: boolean;
  customerFirst: string;
};

export function PlanEditor(p: EditorProps) {
  const router = useRouter();
  const [parts, setParts] = useState<PartInput[]>(p.initial);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [methods, setMethods] = useState<PayMethod[]>(p.methods);
  const [reminders, setReminders] = useState(p.reminders);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const sum = useMemo(() => round2(parts.reduce((a, x) => a + (Number(x.amount) || 0), 0)), [parts]);
  const diff = round2(p.remaining - sum);
  const upfront = round2(parts.filter((x) => x.trigger === "signed").reduce((a, x) => a + (Number(x.amount) || 0), 0));
  const overCap = p.depositRoom !== null && upfront > p.depositRoom + 0.001;

  const set = (i: number, patch: Partial<PartInput>) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const applyPreset = (k: Preset) => {
    setPreset(k);
    if (k !== "custom") setParts(presetPlan(k, p.remaining, { schedule: p.schedule, start: p.start, depositCap: p.depositRoom }));
  };
  const save = () => start(async () => {
    setMsg(null);
    const r = await savePaymentPlan({ jobId: p.jobId, parts: parts.map((x) => ({ ...x, amount: Number(x.amount) || 0 })), methods, reminders });
    setMsg(r ?? null);
    if (r?.ok) router.refresh();
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[14rem_minmax(0,1fr)_18rem]">
      {/* Presets */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Split it</p>
        {PRESETS.map((k) => (
          <button key={k} type="button" onClick={() => applyPreset(k)} data-preset={k}
            className={cx("block w-full rounded-xl px-3 py-2.5 text-left ring-1 transition", preset === k ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-slate-200 hover:ring-slate-400")}>
            <span className="block font-semibold text-ink">{PRESET_LABEL[k].title}</span>
            <span className="block text-xs text-slate-500">{PRESET_LABEL[k].hint}</span>
          </button>
        ))}
        {p.depositRoom !== null && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-deposit-cap>
            <p className="font-semibold">{p.stateName ?? "State"} deposit limit: {aud(p.depositCap ?? p.depositRoom)}</p>
            {p.depositCap !== null && p.depositRoom < p.depositCap && <p className="mt-0.5 font-semibold">{p.depositRoom > 0 ? `${aud(p.depositRoom)} of it is left` : "Already taken in full"}, so nothing more can be due on signing.</p>}
            <p className="mt-0.5">{p.depositNote ?? "Payments on signing can't go over this."} Plans are kept under it automatically.</p>
          </div>
        )}
      </div>

      {/* Parts */}
      <div className="min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex h-3.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {parts.map((x, i) => <span key={i} className="border-r-2 border-white last:border-0" style={{ width: `${Math.max(0, (Number(x.amount) || 0) / (p.remaining || 1)) * 100}%`, background: COLOURS[i % COLOURS.length] }} />)}
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-slate-500">{parts.length} payment{parts.length === 1 ? "" : "s"}{p.lockedCount ? ` + ${p.lockedCount} already paid` : ""}</span>
          <span data-plan-sum className={cx("font-semibold tabular-nums", diff === 0 ? "text-teal-700" : "text-red-700")}>
            {aud(sum)} of {aud(p.remaining)} {diff === 0 ? "· adds up ✓" : diff > 0 ? `· ${aud(diff)} short` : `· ${aud(-diff)} over`}
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          {parts.map((x, i) => {
            const pct = p.contractTotal > 0 ? Math.round(((Number(x.amount) || 0) / p.contractTotal) * 1000) / 10 : 0;
            return (
              <li key={i} data-plan-part className="rounded-xl px-3 py-2.5 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLOURS[i % COLOURS.length] }} />
                  <input aria-label="Payment name" className={cx(inputCls, "min-w-0 flex-1 basis-40 font-semibold")} value={x.label} onChange={(e) => set(i, { label: e.target.value })} />
                  <span className="text-sm text-slate-400">$</span>
                  <input aria-label="Amount" inputMode="decimal" className={cx(inputCls, "w-28 flex-none text-right tabular-nums")} value={x.amount}
                    onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, "") as unknown as number })} />
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
                  <button type="button" aria-label={`Remove ${x.label}`} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-700">✕</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                  <select aria-label="When it's due" className={cx(inputCls, "min-w-44 flex-1")} value={x.trigger} onChange={(e) => set(i, { trigger: e.target.value as PartTrigger, due_date: e.target.value === "date" ? x.due_date ?? p.start : null })}>
                    {PART_TRIGGERS.map((t) => <option key={t} value={t}>{PART_TRIGGER_LABEL[t]}</option>)}
                  </select>
                  {x.trigger === "date" ? (
                    <input aria-label="Due date" type="date" min={p.today} className={cx(inputCls, "flex-1")} value={x.due_date ?? ""} onChange={(e) => set(i, { due_date: e.target.value || null })} />
                  ) : <span className="flex-1 text-xs text-slate-500">{x.trigger === "signed" ? "Sent as soon as you save" : "You press Send when it happens"}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setParts((ps) => [...ps, { label: `Payment ${ps.length + 1}`, trigger: "date", amount: diff > 0 ? diff : 0, due_date: p.start }])}>+ Add a payment</button>
          {diff !== 0 && parts.length > 0 && (
            <button type="button" className="text-sm font-semibold text-slate-600 underline" onClick={() => setParts((ps) => ps.map((x, j) => (j === ps.length - 1 ? { ...x, amount: round2((Number(x.amount) || 0) + diff) } : x)))}>
              Put the {diff > 0 ? "difference" : "extra"} on the last payment
            </button>
          )}
        </div>
        {overCap && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Payments on signing come to {aud(upfront)}, over the {aud(p.depositRoom!)} deposit limit.</p>}
      </div>

      {/* How they pay */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{p.customerFirst} can pay by</p>
          <div className="mt-2 space-y-2">
            {PAY_METHODS.map((m) => {
              const on = methods.includes(m);
              const off = m === "card" && !p.onlineReady;
              return (
                <label key={m} className={cx("flex cursor-pointer gap-3 rounded-xl bg-white px-3 py-2.5 ring-1", on ? "ring-brand-300" : "ring-slate-200")}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1f5f3f]" checked={on} data-method={m}
                    onChange={(e) => setMethods((ms) => (e.target.checked ? [...ms, m] : ms.filter((x) => x !== m)))} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{PAY_METHOD_LABEL[m]}</span>
                    <span className="block text-xs text-slate-500">{off ? <>Turns on once card payments are connected in <Link className="underline" href="/app/settings/payments">Settings → Payments</Link>.</> : PAY_METHOD_HINT[m]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <label className="flex cursor-pointer gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1f5f3f]" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
          <span><span className="block text-sm font-semibold text-ink">Reminders</span><span className="block text-xs text-slate-500">Dated payments go out 3 days early, with a reminder on the day. Email now; texts once Twilio is connected.</span></span>
        </label>
        <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800"><p className="font-semibold">Each payment is its own tax invoice</p><p>Sent when it&apos;s due and marked paid when the money lands. Parts already paid stay as they are.</p></div>
        <button type="button" onClick={save} disabled={pending || diff !== 0 || overCap || parts.length === 0 || methods.length === 0} data-save-plan
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-base font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? "Saving…" : "Save plan and send what's due"}
        </button>
        {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
        {msg?.ok && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{msg.ok}</p>}
      </div>
    </div>
  );
}
