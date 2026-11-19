"use client";
// The margin line on the quote receipt, with Change: set the margin as a %, as dollars, or just type the total.
// The new price shows as you type; Save reprices the costed lines (setQuoteMargin).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { marginForTarget, moneyAtMargin, type MarginBasis, type MarginTarget } from "@/lib/quote-pricing";
import { setQuoteMargin } from "./quote-margin-actions";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const MODES: { key: MarginTarget["mode"]; label: string }[] = [{ key: "pct", label: "Margin %" }, { key: "profit", label: "Margin $" }, { key: "total", label: "Total" }];
const PEN = "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3";

export function MarginEdit({ estimateId, basis, profit, pct, total, minMarginPct }: { estimateId: string; basis: MarginBasis; profit: number; pct: number; total: number; minMarginPct: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MarginTarget["mode"]>("pct");
  const start = (m: MarginTarget["mode"]) => String(m === "pct" ? Math.round(pct * 10) / 10 : m === "profit" ? Math.round(profit) : Math.round(total * 100) / 100);
  const [value, setValue] = useState(start("pct"));
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const low = minMarginPct > 0 && pct < minMarginPct;

  const n = Number(value.replace(/[$,%\s]/g, ""));
  const r = value.trim() === "" ? null : marginForTarget(basis, { mode, value: n });
  const at = r && "marginPct" in r ? moneyAtMargin(basis, r.marginPct / 100) : null;
  const atLow = Boolean(at && minMarginPct > 0 && at.pct < minMarginPct);

  const pick = (m: MarginTarget["mode"]) => { setMode(m); setValue(start(m)); setErr(null); };
  const save = () => {
    if (!at) return;
    setErr(null);
    startSave(async () => {
      const res = await setQuoteMargin({ estimateId, mode, value: n });
      if (res && "error" in res && res.error) { setErr(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t-2 border-dashed border-slate-200 pt-2.5 font-mono text-[12.5px]" data-task-margin={low ? "low" : "ok"}>
        <span className="min-w-0 text-slate-500">Your margin <span className="text-slate-400">· ex GST</span>{low && <span className="block text-[11px] font-semibold text-amber-700">Under your {minMarginPct}% minimum</span>}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={cx("font-semibold tabular-nums", low ? "text-amber-700" : "text-green-700")}>{aud(profit)} · {pct.toFixed(1)}%</span>
          <button type="button" onClick={() => { setOpen(true); pick("pct"); }} aria-label="Change the margin" title="Change the margin" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-ink" data-margin-change>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PEN} /></svg>
          </button>
        </span>
      </div>
    );
  }

  const prefix = mode === "pct" ? null : "$";
  return (
    <div className="mt-2.5 border-t-2 border-dashed border-slate-200 pt-3" data-margin-editor>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">Change the price by</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => pick(m.key)} data-margin-mode={m.key}
            className={cx("h-9 rounded-lg font-mono text-[11px] font-semibold uppercase tracking-wider", mode === m.key ? "bg-white text-ink ring-1 ring-slate-300" : "text-slate-500 hover:text-ink")}>{m.label}</button>
        ))}
      </div>
      <label className="mt-2 flex h-12 items-center gap-1 rounded-xl bg-white px-3 ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-ink">
        {prefix && <span className="font-display text-lg font-bold text-slate-400">{prefix}</span>}
        <input autoFocus inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
          aria-label={MODES.find((m) => m.key === mode)!.label} className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold tabular-nums text-ink outline-none" data-margin-input />
        {mode === "pct" && <span className="font-display text-lg font-bold text-slate-400">%</span>}
        {mode === "total" && <span className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400">inc GST</span>}
      </label>
      <p className={cx("mt-2 font-mono text-[12px] leading-snug", err || (r && "error" in r) ? "text-red-700" : atLow ? "text-amber-700" : "text-slate-500")} data-margin-preview>
        {err ?? (r && "error" in r ? r.error : at ? <>Total <b className="text-ink">{aud(at.total)}</b> · margin {aud(at.profit)} · {at.pct.toFixed(1)}%{atLow ? ` · under your ${minMarginPct}% minimum` : ""}</> : "Type a number.")}
      </p>
      <div className="mt-2.5 flex justify-end gap-1">
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-ink">Cancel</button>
        <button type="button" onClick={save} disabled={!at || saving} className="h-10 rounded-xl bg-ink px-5 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-ink/90 disabled:opacity-40" data-margin-save>{saving ? "Saving…" : "Save price"}</button>
      </div>
    </div>
  );
}
