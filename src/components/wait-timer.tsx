"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { minutesLabel } from "@/lib/next-step";

const TONE = {
  ok: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
};

/** Live "minutes waiting" chip for a new lead: teal under 5 min, amber under an hour, red after. */
export function WaitTimer({ since, className }: { since: string; className?: string }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, now - start);
  const tone = ms < 5 * 60000 ? "ok" : ms < 60 * 60000 ? "amber" : "red";
  return (
    <span
      data-lead-timer
      data-tone={tone}
      title="Time since the lead came in (not called yet)"
      suppressHydrationWarning
      className={cx("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums", TONE[tone], className)}
    >
      {minutesLabel(ms)}
    </span>
  );
}
