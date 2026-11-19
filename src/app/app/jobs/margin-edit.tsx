"use client";
// The margin line on the quote receipt, with Change: set the margin as a %, as dollars, or just type the total.
// The new price shows as you type; Save reprices the costed lines (setQuoteMargin).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { marginForTarget, moneyAtMargin, type MarginBasis, type MarginTarget } from "@/lib/quote-pricing";
import { setQuoteMargin } from "./quote-margin-actions";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const MODES: { key: MarginTarget["mode"]; label: string; short: string }[] = [{ key: "pct", label: "Margin %", short: "%" }, { key: "profit", label: "Margin $", short: "$" }, { key: "total", label: "Total", short: "Total" }];
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

  const bad = err ?? (r && "error" in r ? r.error : null);
  const show = at ?? { profit, pct };
  return (
    <div className="mt-2.5 border-t-2 border-dashed border-slate-200 pt-2.5" data-margin-editor>
      {/* The margin line shows the new margin as you type. */}
      <div className="flex items-baseline justify-between gap-3 font-mono text-[12.5px]">
        <span className="text-slate-500">Your margin <span className="text-slate-400">· ex GST</span></span>
        <span className={cx("shrink-0 font-semibold tabular-nums", atLow || (!at && low) ? "text-amber-700" : "text-green-700")} data-margin-preview>{aud(show.profit)} · {show.pct.toFixed(1)}%</span>
      </div>
      {/* One row: change by (% · $ · Total) · the number, with the new total in it · Save · close. */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Change the price by">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => pick(m.key)} data-margin-mode={m.key} title={m.label}
              className={cx("h-9 rounded-md px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider", mode === m.key ? "bg-white text-ink ring-1 ring-slate-300" : "text-slate-500 hover:text-ink")}>{m.short}</button>
          ))}
        </div>
        <label className={cx("flex h-10 min-w-0 flex-1 items-center gap-0.5 rounded-lg bg-white px-2 ring-1 focus-within:ring-2", bad ? "ring-red-300 focus-within:ring-red-500" : "ring-slate-300 focus-within:ring-ink")}>
          {mode !== "pct" && <span className="font-display text-[15px] font-bold text-slate-400">$</span>}
          <input autoFocus inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
            aria-label={MODES.find((m) => m.key === mode)!.label} className="w-full min-w-0 bg-transparent font-display text-[15px] font-bold tabular-nums text-ink outline-none" data-margin-input />
          {mode === "pct" && <span className="font-display text-[15px] font-bold text-slate-400">%</span>}
          {mode !== "total" && at && <span className="ml-1 shrink-0 font-mono text-[11px] tabular-nums text-slate-500" data-margin-new-total>= {aud(at.total)}</span>}
          {mode === "total" && <span className="ml-1 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">inc GST</span>}
        </label>
        <button type="button" onClick={save} disabled={!at || saving} className="h-10 shrink-0 rounded-lg bg-ink px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-ink/90 disabled:opacity-40" data-margin-save>{saving ? "…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" title="Cancel" className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {/* Only when something's wrong (or under the minimum). */}
      {(bad || atLow) && <p className={cx("mt-1.5 font-mono text-[11.5px] leading-snug", bad ? "text-red-700" : "text-amber-700")} data-margin-problem>{bad ?? `Under your ${minMarginPct}% minimum`}</p>}
    </div>
  );
}
