// The receipt docket: a printed-receipt style quote with the roof as the main item and tap-to-add extras.
// Presentational pieces shared by the roofer's quote page and the customer's quote link (no state in here).
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { ItemIcon } from "@/components/item-icons";
import type { ExtraRow } from "@/lib/docket";
import type { RoofShape } from "@/lib/docket-shape";
import { money } from "@/lib/format";

type Pt = [number, number];
const pts = (ps: Pt[]) => ps.map((p) => p.join(",")).join(" ");
const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

const isDark = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16) < 330;

/**
 * The roof seen from above in the chosen colour (panels slightly varied so they read): panels from the plans,
 * facets traced on the satellite map (north up), or one labelled tile per section when the roof was typed in.
 */
export function ColourRoof({ shape, hex, className }: { shape: RoofShape; hex: string; className?: string }) {
  if (shape.kind === "tiles") {
    if (!shape.tiles.length) {
      return (
        <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Roof not measured yet" data-testid="docket-roof" data-kind="tiles" data-colour={hex}>
          <rect x="8" y="8" width="84" height="84" rx="10" fill="none" stroke="#cbd5e1" strokeWidth="3" strokeDasharray="8 6" />
        </svg>
      );
    }
    const w = Math.max(...shape.tiles.map((t) => t.x + t.size)), h = Math.max(...shape.tiles.map((t) => t.y + t.size));
    const pad = Math.max(w, h) * 0.03;
    const ink = isDark(hex) ? "white" : "#13221a";
    // One text size for the drawing; a tile too small for its name shows just its area.
    const fs = Math.max(w, h) * 0.085;
    return (
      <svg viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} className={className} role="img" aria-label="Roof sections" data-testid="docket-roof" data-kind="tiles" data-colour={hex}>
        {shape.tiles.map((t, i) => {
          const label = t.label.length > 12 ? `${t.label.slice(0, 11)}…` : t.label;
          const named = t.size >= fs * label.length * 0.7 && t.size >= fs * 3;
          const small = Math.min(fs, t.size * 0.3);
          const area = `${Math.round(t.area * 10) / 10} m²`;
          return (
            <g key={i} data-testid="roof-tile">
              <title>{`${t.label} · ${area}`}</title>
              <rect x={t.x} y={t.y} width={t.size} height={t.size} rx={t.size * 0.12} fill={shade(hex, (i % 3) * 10 - 10)} />
              {named ? (
                <>
                  <text x={t.x + t.size / 2} y={t.y + t.size / 2 - fs * 0.15} textAnchor="middle" fontSize={fs} fontWeight={700} fill={ink}>{label}</text>
                  <text x={t.x + t.size / 2} y={t.y + t.size / 2 + fs * 1.05} textAnchor="middle" fontSize={fs * 0.9} fill={ink} opacity={0.8}>{area}</text>
                </>
              ) : (
                <text x={t.x + t.size / 2} y={t.y + t.size / 2 + small * 0.35} textAnchor="middle" fontSize={small * (area.length > 5 ? 0.8 : 1)} fontWeight={700} fill={ink}>{area}</text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }
  const xs = shape.faces.flatMap((f) => f.map((p) => p[0]));
  const ys = shape.faces.flatMap((f) => f.map((p) => p[1]));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const pad = Math.max(w, h) * 0.04;
  const sw = Math.max(w, h) / 160;
  const dark = parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16) < 200;
  return (
    <svg viewBox={`${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}`} className={className} role="img" aria-label={shape.kind === "satellite" ? "Your roof, traced from above" : "Your roof"} data-testid="docket-roof" data-kind={shape.kind} data-colour={hex}>
      {shape.faces.map((f, i) => <polygon key={i} points={pts(f)} fill={shade(hex, (i % 3) * 10 - 10)} stroke="white" strokeWidth={sw * 2} strokeLinejoin="round" />)}
      {shape.lines.map((l, i) => <line key={i} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} stroke="white" strokeOpacity={dark ? 0.45 : 0.75} strokeWidth={sw * 2.4} strokeLinecap="round" />)}
    </svg>
  );
}

/** Zig-zag torn bottom edge. */
const TORN = (() => {
  const p = ["0 0", "100% 0", "100% calc(100% - 14px)"];
  for (let x = 97; x > 0; x -= 3) p.push(`${x}% ${(100 - x) % 6 === 3 ? "100%" : "calc(100% - 14px)"}`);
  p.push("0 calc(100% - 14px)");
  return `polygon(${p.join(",")})`;
})();

export function DocketPaper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("docket-paper bg-white px-5 pb-10 pt-6 ring-1 ring-slate-200 sm:px-9 sm:pt-7", className)} style={{ clipPath: TORN }} data-testid="docket">
      {children}
    </section>
  );
}

/** Business name, ABN · licence on the left; quote number and date on the right. Monospace caps. */
export function DocketTopLine({ name, abn, licence, number, date, label = "Quote" }: { name: string; abn: string | null; licence: string | null; number: number | string; date: string; label?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 font-mono text-xs uppercase tracking-wider text-slate-500" data-testid="docket-top">
      <span className="min-w-0">
        <span className="block break-words">{name}</span>
        <span className="block">{[abn, licence].filter(Boolean).join(" · ") || " "}</span>
      </span>
      <span className="shrink-0 text-right">{label} {number}<br />{date}</span>
    </div>
  );
}

/** The cream band with the roof drawing, the title, facts, address, pickers and the roof price. */
export function RoofBand({ shape, hex, title, facts, address, price, badge, children }: {
  shape: RoofShape; hex: string; title: string; facts: string; address: string | null; price: number; badge?: string | null; children?: ReactNode;
}) {
  return (
    <div className="-mx-5 mt-4 flex items-start gap-4 border-y-2 border-dashed border-slate-200 bg-cream/60 px-5 py-5 sm:-mx-9 sm:gap-6 sm:px-9" data-testid="roof-band">
      <div className="h-24 w-20 shrink-0 sm:h-36 sm:w-28"><ColourRoof shape={shape} hex={hex} className="h-full w-full" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <p className="font-display text-xl font-bold text-ink sm:text-2xl" data-testid="roof-title">{title}</p>
          <p className="font-display hidden shrink-0 text-2xl font-bold tabular-nums text-ink sm:block" data-testid="roof-price">{money(price)}</p>
        </div>
        <p className="text-sm text-slate-500" data-testid="roof-facts">{facts}{badge && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700" data-testid="roof-badge">{badge}</span>}</p>
        {address && <p className="font-mono text-xs uppercase tracking-wider text-slate-400">{address}</p>}
        <p className="font-display mt-1 text-lg font-bold tabular-nums text-ink sm:hidden">{money(price)}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

export type MainLine = { key: string | number; calcKey: string | null; description: string; qty: string; amount: number };

/** Main lines in monospace with a boxed icon each. */
export function MainLines({ lines }: { lines: MainLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="py-2 font-mono text-sm text-slate-600" data-testid="main-lines">
      {lines.map((l) => (
        <li key={l.key} className="flex items-center gap-3 py-1.5" data-testid="main-line" data-key={l.calcKey ?? ""}>
          <ItemIcon calcKey={l.calcKey} size={20} />
          <span className="min-w-0 flex-1">
            <span className="block break-words">{l.description}</span>
            <span className="block text-xs text-slate-400 sm:hidden">{l.qty}</span>
          </span>
          <span className="hidden w-28 shrink-0 text-right sm:block">{l.qty}</span>
          <span className="w-24 shrink-0 text-right tabular-nums">{money(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A small padlock (closed = required). */
export function Lock({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </svg>
  );
}

/** Extras the customer took off when they signed (not in the total). */
export function RemovedExtras({ rows }: { rows: ExtraRow[] }) {
  if (!rows.length) return null;
  return (
    <ul className="border-t-2 border-dashed border-slate-200 py-2" data-testid="removed-extras">
      {rows.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2 text-slate-400" data-testid="removed-extra" data-extra={e.id}>
          <ItemIcon calcKey={e.calcKey} size={22} className="opacity-60" />
          <span className="min-w-0 flex-1">{e.name} <span className="text-sm">· {e.qty}</span>
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Removed by customer</span></span>
          <span className="shrink-0 tabular-nums line-through">{money(e.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Extras on the receipt (in the total), each with Remove when editable. */
export function AddedExtras({ rows, onRemove, canRemove, onRequired, busy }: {
  rows: ExtraRow[]; onRemove?: (r: ExtraRow) => void; canRemove?: (r: ExtraRow) => boolean; onRequired?: (r: ExtraRow, required: boolean) => void; busy?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <ul className="border-t-2 border-dashed border-slate-200 py-2" data-testid="added-extras">
      {rows.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2" data-testid="added-extra" data-extra={e.id}>
          <ItemIcon calcKey={e.calcKey} size={22} />
          <span className="min-w-0 flex-1 text-ink">
            {e.name} <span className="text-sm text-slate-400">· {e.qty}</span>
            {e.customerAdded && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Added by customer</span>}
            {!onRequired && e.required && <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400" data-testid="required-badge" title="Included for safety: can't be removed"><Lock />Required</span>}
          </span>
          {onRequired && (
            <button type="button" onClick={() => onRequired(e, !e.required)} aria-pressed={e.required} data-testid="required-toggle"
              title={e.required ? "Required: the customer can't remove it" : "Optional: the customer can remove it. Tap to make it required"}
              className={cx("no-print -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold", e.required ? "text-ink" : "text-slate-400 hover:text-ink")}>
              <Lock open={!e.required} />{e.required ? "Required" : "Optional"}
            </button>
          )}
          <span className="shrink-0 tabular-nums text-ink">{money(e.amount)}</span>
          {onRemove && (!canRemove || canRemove(e)) && (
            <button type="button" disabled={busy} onClick={() => onRemove(e)} className="no-print -my-2 ml-1 min-h-11 shrink-0 px-1 text-sm text-slate-400 hover:text-red-600 disabled:opacity-50" aria-label={`Remove ${e.name}`}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DocketTotal({ total, gst, gstCharged, discount }: { total: number; gst: number; gstCharged: boolean; discount?: number }) {
  return (
    <>
      {discount ? <p className="mb-2 flex justify-between font-mono text-sm text-slate-600"><span>DISCOUNT</span><span className="tabular-nums">−{money(discount)}</span></p> : null}
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink pt-4">
        <span className="font-display text-lg font-bold text-ink sm:text-xl">Total{gstCharged ? " inc GST" : ""}</span>
        <span className="font-display text-3xl font-bold tabular-nums text-ink sm:text-4xl" data-testid="docket-total" data-value={total}>{money(total)}</span>
      </div>
      {gstCharged && <p className="mt-2 text-right font-mono text-xs uppercase tracking-wider text-slate-400" data-testid="docket-gst">Includes GST of {money(gst)}</p>}
    </>
  );
}

/** Dashed "Often added" box under the receipt. */
export function OftenAdded({ rows, onAdd, busy, title = "Often added", className, note }: {
  rows: ExtraRow[]; onAdd?: (r: ExtraRow) => void; busy?: boolean; title?: string; className?: string; note?: ReactNode;
}) {
  if (!rows.length) return null;
  return (
    <section className={cx("rounded-[24px] border-2 border-dashed border-slate-300 px-5 py-4 sm:px-7", className)} data-testid="often-added">
      <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {note}
      {rows.map((e) => (
        <div key={e.id} className="flex items-center gap-3 py-2 text-slate-500" data-testid="offered-extra" data-extra={e.id}>
          <ItemIcon calcKey={e.calcKey} size={22} className="opacity-70" />
          <span className="min-w-0 flex-1">
            <span className="text-slate-600">{e.name}</span>
            {e.blurb && <span className="block text-sm sm:inline"><span className="hidden sm:inline"> · </span>{e.blurb}</span>}
          </span>
          <span className="shrink-0 tabular-nums">+{money(e.amount)}</span>
          {onAdd && (
            <button type="button" disabled={busy} onClick={() => onAdd(e)} className="no-print ml-1 min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-500 hover:bg-brand-50 disabled:opacity-50" aria-label={`Add ${e.name}`}>
              Add
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
