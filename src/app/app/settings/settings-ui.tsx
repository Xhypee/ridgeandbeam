"use client";

// Settings as cards: one card per area (icon, name, a line on how it's set up, a tag when it needs you, →).
// Tapping a card opens that area in the right sidebar, the way a job opens on the Jobs board. With nothing open
// the Claude chat sits on the right (settings/page.tsx).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, cx, Label } from "@/components/ui";

export type SettingsCard = {
  href: string; title: string; status: string; icon: string; group: string;
  chip?: { text: string; tone: "amber" | "slate" } | null;
  /** Big tables (price book, supplier price lists): the sidebar opens wider. */
  wide?: boolean;
};

const BASE = "/app/settings";
const activeFor = (path: string, cards: SettingsCard[]) => cards.find((c) => path === c.href || path.startsWith(`${c.href}/`)) ?? null;

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function SettingsCards({ cards }: { cards: SettingsCard[] }) {
  const path = usePathname() ?? BASE;
  const open = activeFor(path, cards);
  const groups = [...new Set(cards.map((c) => c.group))];
  return (
    <div className="space-y-6" data-settings-cards>
      {groups.map((g) => (
        <section key={g}>
          <Label className="mb-2.5 block">{g}</Label>
          {/* Nothing open: three across. An area open: one tidy column beside it (groups of three never leave one alone). */}
          <div className={cx("grid", open ? "gap-2" : "gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
            {cards.filter((c) => c.group === g).map((c) => {
              const on = open?.href === c.href;
              return (
                <Link key={c.href} href={on ? BASE : c.href} scroll={false} aria-current={on ? "page" : undefined} data-settings-card={c.href.slice(BASE.length + 1)}
                  className={cx("flex items-start gap-3 rounded-[22px] bg-white transition", open ? "px-4 py-3" : "p-4", on ? "ring-2 ring-ink" : "ring-1 ring-slate-200 hover:ring-slate-300")}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream text-ink ring-1 ring-slate-200"><Icon d={c.icon} /></span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1 pt-0.5">
                    <span className="font-display text-[16px] font-bold leading-snug text-ink">{c.title}</span>
                    <Label className={cx("block leading-relaxed", open && "w-full truncate")}>{c.status}</Label>
                    {c.chip && <Badge tone={c.chip.tone} className="mt-0.5">{c.chip.text}</Badge>}
                  </span>
                  <span aria-hidden className="shrink-0 self-center font-mono text-sm text-slate-400">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The right sidebar: the open area under its name, with × back to the cards. Nothing open: the page's own content
 *  (the Claude chat). */
export function SettingsPanel({ cards, children }: { cards: SettingsCard[]; children: ReactNode }) {
  const path = usePathname() ?? BASE;
  const open = activeFor(path, cards);
  if (!open) return <>{children}</>;
  return (
    <aside aria-label={`Settings: ${open.title}`} data-settings-panel={open.href.slice(BASE.length + 1)}
      className={cx("fixed inset-0 z-30 flex flex-col bg-cream lg:static lg:z-auto lg:h-full lg:shrink-0 lg:border-l lg:border-slate-200",
        open.wide ? "lg:w-[min(760px,58vw)]" : "lg:w-[520px] xl:w-[560px]")}>
      <div className="flex items-center gap-3 border-b-2 border-ink bg-white px-5 pb-3 pt-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream text-ink ring-1 ring-slate-200"><Icon d={open.icon} className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <Label className="block">Settings</Label>
          <h2 className="truncate font-display text-[22px] font-bold leading-tight text-ink">{open.title}</h2>
        </span>
        <Link href={BASE} scroll={false} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink">
          <Icon d="M6 6l12 12M18 6L6 18" />
        </Link>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" data-settings-body>{children}</div>
    </aside>
  );
}
