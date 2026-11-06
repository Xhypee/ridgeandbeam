import Link from "next/link";
import { cx } from "@/components/ui";
import type { Lang } from "@/lib/production-i18n";

export function fmtDay(iso: string | null, lang: Lang) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString(lang === "es" ? "es-US" : "en-AU", { weekday: "short", month: "short", day: "numeric" });
}

export function LangToggle({ base, lang }: { base: string; lang: Lang }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-semibold" role="group" aria-label="Language">
      {(["en", "es"] as const).map((l) => (
        <Link key={l} href={`${base}?lang=${l}`} aria-current={l === lang ? "true" : undefined}
          className={cx("min-h-10 min-w-12 rounded-md px-3 py-2 text-center", l === lang ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
          {l.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
