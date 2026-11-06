"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Five places, each a group of related pages (research: fewer menu items, one primary action per screen).
 *  Today · Jobs (pipeline, customers, claims, canvassing) · Schedule (calendar, material orders)
 *  Money (invoices, estimates, reports) · Settings
 */
type Group = { href: string; label: string; icon: string; match: string[]; money?: boolean; crew?: boolean };

export const GROUPS: Group[] = [
  { href: "/app", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h14V10", match: ["/app", "/app/notifications"] },
  { href: "/app/jobs", label: "Jobs", icon: "M4 7h16v12H4zM9 7V5h6v2", match: ["/app/jobs", "/app/customers", "/app/claims", "/app/canvass", "/app/measure"] },
  { href: "/app/schedule", label: "Schedule", icon: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5", match: ["/app/schedule", "/app/orders"], crew: true },
  { href: "/app/invoices", label: "Money", icon: "M3 7h18v11H3zM3 10h18M7 15h3", match: ["/app/invoices", "/app/estimates", "/app/reports"], money: true },
  { href: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2" , match: ["/app/settings"], money: true },
];

export function groupFor(path: string) {
  return GROUPS.find((g) => g.match.some((m) => (m === "/app" ? path === "/app" || path === "/app/notifications" : path === m || path.startsWith(m + "/"))));
}

export function Nav({ mobile = false, canSeeMoney = true, crewLead = false }: { mobile?: boolean; canSeeMoney?: boolean; crewLead?: boolean }) {
  const path = usePathname();
  const current = groupFor(path);
  const items = GROUPS.filter((g) => (crewLead ? g.crew : canSeeMoney || !g.money));
  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={current === i ? "page" : undefined}
            className={cx("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", current === i ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-700")}>
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-1" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={current === i ? "page" : undefined}
          className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium",
            current === i ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={i.icon} />
          </svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Sub-pages of the current group, shown at the top of list pages (not on a single job or record). */
const SECTION_TABS: Record<string, { href: string; label: string; money?: boolean }[]> = {
  "/app/jobs": [
    { href: "/app/jobs", label: "Pipeline" },
    { href: "/app/customers", label: "Customers" },
    { href: "/app/claims", label: "Insurance claims", money: true },
    { href: "/app/canvass", label: "Door knocking" },
  ],
  "/app/schedule": [
    { href: "/app/schedule", label: "Calendar" },
    { href: "/app/orders", label: "Material orders" },
  ],
  "/app/invoices": [
    { href: "/app/invoices", label: "Invoices" },
    { href: "/app/estimates", label: "Quotes" },
    { href: "/app/reports", label: "Reports" },
  ],
};

export function SectionTabs({ canSeeMoney = true }: { canSeeMoney?: boolean }) {
  const path = usePathname();
  const g = groupFor(path);
  const tabs = g ? SECTION_TABS[g.href] : undefined;
  if (!tabs || !tabs.some((t) => t.href === path)) return null; // only on the group's list pages
  return (
    <nav aria-label="Section" className="no-print mb-6 flex flex-wrap gap-2">
      {tabs.filter((t) => canSeeMoney || !t.money).map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}
          className={cx("rounded-full px-4 py-2 text-sm font-semibold ring-1",
            path === t.href ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
