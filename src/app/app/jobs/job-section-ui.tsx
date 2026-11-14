// Shared bits of the job sidebar sections (no "use client", no server code) so both server and client sections can use them.
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

export const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6";
export const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
export const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
export const PIN = "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5";

export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <details open className="group border-t border-slate-100" data-lead-section={title}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-ink">{title}</span>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{count}</span>}
        {action && <span className="ml-auto">{action}</span>}
        <Icon d="M6 9l6 6 6-6" className={cx(action ? "" : "ml-auto", "h-4 w-4 text-slate-400 transition-transform group-open:rotate-180")} />
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

export function ContactRow({ icon, label, value, children }: { icon: string; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream text-slate-600 ring-1 ring-slate-200"><Icon d={icon} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] text-slate-500">{label}</span><span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{value}</span></span>
      {children}
    </div>
  );
}
export const iconBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50";
