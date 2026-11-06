"use client";

import { useEffect, useState } from "react";

export function elapsedLabel(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/** Live "time since lead" chip: green < 5 min, amber < 1 h, red after. */
export function LeadTimer({ since, compact = false }: { since: string; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, (now ?? new Date(since).getTime()) - new Date(since).getTime());
  const tone = ms < 5 * 60000 ? "bg-green-100 text-green-800 ring-green-300" : ms < 60 * 60000 ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-red-100 text-red-800 ring-red-300";
  return (
    <span data-lead-timer className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone}`} title="Time since the lead came in (not contacted yet)" suppressHydrationWarning>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {now === null ? "…" : elapsedLabel(ms)}{!compact && " waiting"}
    </span>
  );
}
