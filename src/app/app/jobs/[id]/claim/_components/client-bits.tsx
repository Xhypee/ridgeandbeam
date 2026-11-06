"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ComponentProps } from "react";
import { Input, Select, cx } from "@/components/ui";
import { POLICY_HINT, POLICY_LABEL, POLICY_TYPES, type PolicyType } from "@/lib/claims";

const noop = () => () => {};
const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

function toLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local input that submits a real ISO timestamp (the browser knows the user's time zone; the server doesn't). */
export function DateTimeInput({ name, defaultValue, ...rest }: { name: string; defaultValue?: string | null } & Omit<ComponentProps<"input">, "name" | "defaultValue" | "type" | "value">) {
  const isClient = useIsClient();
  const [edited, setEdited] = useState<string | null>(null);
  const local = edited ?? (isClient ? toLocal(defaultValue) : "");
  const iso = edited === null && !isClient ? (defaultValue ?? "") : local ? new Date(local).toISOString() : "";
  return (
    <>
      <Input type="datetime-local" value={local} onChange={(e) => setEdited(e.target.value)} {...rest} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

/** Shows a timestamp in the viewer's own time zone. */
export function LocalDateTime({ iso }: { iso: string }) {
  const isClient = useIsClient();
  const d = new Date(iso);
  return (
    <time dateTime={iso}>
      {isClient
        ? d.toLocaleString("en-AU", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : d.toLocaleDateString("en-AU", { month: "short", day: "numeric", timeZone: "UTC" })}
    </time>
  );
}

export function PolicySelect({ defaultValue }: { defaultValue: PolicyType }) {
  const [v, setV] = useState<PolicyType>(defaultValue);
  return (
    <>
      <Select name="policy_type" value={v} onChange={(e) => setV(e.target.value as PolicyType)}>
        {POLICY_TYPES.map((p) => <option key={p} value={p}>{POLICY_LABEL[p]}</option>)}
      </Select>
      <span className={cx("mt-1 block text-xs", v === "rcv" ? "text-slate-500" : "font-medium text-amber-700")}>{POLICY_HINT[v]}</span>
    </>
  );
}

export function ClaimNav({ base, counts }: { base: string; counts: { supplements: number; openChecks: number } }) {
  const path = usePathname();
  const items = [
    { href: base, label: "Overview", exact: true, badge: 0 },
    { href: `${base}/money`, label: "Money & paperwork", badge: counts.openChecks },
    { href: `${base}/supplements`, label: "Supplements", badge: counts.supplements },
    { href: `${base}/scope`, label: "Scope compare", badge: 0 },
  ];
  return (
    <nav className="no-print mb-5 flex flex-wrap gap-1.5" aria-label="Claim sections">
      {items.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
              active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {t.label}
            {t.badge ? <span className={cx("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
