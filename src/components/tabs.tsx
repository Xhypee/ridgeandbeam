"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type Tab = { href: string; label: string; exact?: boolean; badge?: string | number };

/** Horizontal, scrollable tab bar; highlights by path prefix. */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="no-print -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:-mx-6 sm:px-6" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
              active ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== "" && t.badge !== 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
