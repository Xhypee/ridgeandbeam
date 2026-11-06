"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/app", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/app/customers", label: "Customers", icon: "M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6M20 19v-1a3 3 0 00-2-2.8M4 19v-1a3 3 0 012-2.8" },
  { href: "/app/jobs", label: "Jobs", icon: "M4 7h16v12H4zM9 7V5h6v2" },
  { href: "/app/schedule", label: "Schedule", icon: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" },
  { href: "/app/estimates", label: "Estimates", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  { href: "/app/invoices", label: "Invoices", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2" },
];

export function Nav({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cx(
              "shrink-0 rounded-full px-3 py-1.5 text-sm",
              active(i.href) ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-700",
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-0.5">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            active(i.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={i.icon} />
          </svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
