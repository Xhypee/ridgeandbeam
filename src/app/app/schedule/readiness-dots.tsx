import type { Readiness } from "@/lib/production";
import { cx } from "@/components/ui";

/** Six small dots (permit, HOA, colors, materials, dumpster, deposit): green = done, red = blocker. */
export function ReadinessDots({ r, className }: { r: Readiness; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)} aria-label={r.ready ? "Ready to lock" : `Blocked: ${r.blockers.map((b) => b.label).join(", ")}`}>
      {r.items.map((i) => (
        <span key={i.key} title={`${i.label}: ${i.detail}`} className={cx("h-2 w-2 rounded-full", i.ok ? "bg-green-500" : "bg-red-400")} />
      ))}
    </span>
  );
}
