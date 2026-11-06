"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import type { TimelineStep } from "@/lib/next-step";

const BAR = { done: "bg-green-600", current: "bg-brand-500", todo: "bg-slate-200" };

/**
 * The job's 7 phases (Lead · Inspect · Quote · Claim · Build · Close · Paid) as the job page navigation.
 * The bar colour shows where the job is (teal = done, evergreen = now); the outline shows the page you're on.
 */
export function JobTimeline({ steps, extras = [] }: { steps: TimelineStep[]; extras?: { href: string; label: string }[] }) {
  const path = usePathname();
  const base = steps.find((s) => s.key === "lead")?.href ?? "";
  const isActive = (href: string) => {
    const h = href.split("#")[0];
    if (h === base || /\/app\/jobs\/[^/]+$/.test(h)) return path === h;
    return path === h || path.startsWith(h + "/");
  };
  return (
    <nav aria-label="Job timeline" className="no-print mb-5">
      <ol data-timeline className="-mx-4 grid auto-cols-[minmax(7.25rem,1fr)] grid-flow-col gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:auto-cols-fr">
        {steps.map((s) => {
          const active = isActive(s.href);
          // On the overview the outline sits on the job's current phase (where the work is), as in the design.
          const outlined = active || (path === base && s.state === "current");
          return (
            <li key={s.key} data-step={s.key} data-phase={s.state} data-active={active ? "true" : undefined} className="min-w-0">
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block h-full min-h-16 rounded-xl bg-white px-3 pb-3 pt-2.5 transition hover:ring-slate-400",
                  outlined ? "ring-2 ring-ink" : "ring-1 ring-slate-200",
                  s.state === "todo" && !outlined ? "text-slate-500" : "text-ink",
                )}
              >
                <span aria-hidden className={cx("mb-2 block h-1 rounded-full", BAR[s.state])} />
                <span className="block text-[13px] font-bold">
                  {s.label}
                  {s.state === "current" && <span className="sr-only"> (current step)</span>}
                </span>
                <span className={cx("mt-0.5 block truncate text-xs", s.state === "current" ? "font-semibold text-brand-700" : "opacity-85")}>{s.status}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {extras.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center justify-end gap-x-1 text-[13px] text-slate-500">
          <span>Also:</span>
          {extras.map((x, i) => (
            <span key={x.href} className="inline-flex items-center gap-1">
              {i > 0 && <span aria-hidden>·</span>}
              <Link href={x.href} aria-current={isActive(x.href) ? "page" : undefined}
                className={cx("inline-flex min-h-8 items-center rounded-md px-1.5 font-semibold hover:text-brand-700", isActive(x.href) ? "text-ink underline underline-offset-4" : "text-brand-600")}>
                {x.label}
              </Link>
            </span>
          ))}
        </p>
      )}
    </nav>
  );
}
