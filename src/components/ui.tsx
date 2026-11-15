import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/format";

// The receipt look (from the quote docket): small grey typewriter capitals for labels and details, the display
// face for names and titles, dashed rules between rows, a thick ink rule above totals and under headings,
// big display numbers for money, white 22px cards on cream, no shadows.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-ink text-white hover:bg-ink/90",
  secondary: "bg-white text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  ghost: "text-slate-600 hover:bg-slate-100",
};
// 44px minimum tap target everywhere (field-first rule).
const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: keyof typeof BTN }) {
  return <button className={cx(btnBase, BTN[variant], className)} {...p} />;
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof BTN }) {
  return <Link className={cx(btnBase, BTN[variant], className)} {...p} />;
}

const inputCls =
  "block min-h-11 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-ink focus:outline-none";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "min-h-20", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "pr-8", className)} {...p} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ className, title, actions, children }: { className?: string; title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={cx("rounded-[22px] bg-white ring-1 ring-slate-200", className)}>
      {(title || actions) && (
        <header className="mx-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-dashed border-slate-200 py-3.5">
          <h2 className="font-display text-[16px] font-bold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

// Soft pills (50 background, 700 text), as in the approved designs. "green" renders teal (= done / received).
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-blue-50 text-blue-700",
  cyan: "bg-cyan-50 text-cyan-800",
  orange: "bg-orange-50 text-orange-800",
  teal: "bg-teal-50 text-teal-800",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
};
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider", TONES[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, kicker }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <Label className="block">{kicker}</Label>}
        <h1 className="font-display truncate text-[32px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 font-mono text-xs uppercase tracking-wider text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[22px] border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-display font-semibold text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[22px] bg-white px-3 ring-1 ring-slate-200">
      <table className="min-w-full text-sm [&_tbody_tr:not(:last-child)]:border-b-2 [&_tbody_tr]:border-dashed [&_tbody_tr]:border-slate-200 [&_thead_tr]:border-b-2 [&_thead_tr]:border-ink">{children}</table>
    </div>
  );
}
export const th = "px-4 pb-2.5 pt-4 text-left font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400";
export const td = "px-4 py-3 text-slate-700";

/** Small grey typewriter capitals: labels, details, counts. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400", className)}>{children}</span>;
}
/** A dashed rule, like the tear lines on a docket. */
export function Dash({ className }: { className?: string }) {
  return <div className={cx("border-t-2 border-dashed border-slate-200", className)} />;
}
/** Big money with a label, a dashed rule and a note: the stat card. */
export function Stat({ label, value, note, className }: { label: ReactNode; value: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-[22px] bg-white px-5 py-4 ring-1 ring-slate-200", className)}>
      <Label className="block">{label}</Label>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
      {note && <><Dash className="my-2" /><Label className="block">{note}</Label></>}
    </div>
  );
}

export { cx };
