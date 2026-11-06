import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cx } from "@/components/ui";
import { anonClient } from "@/lib/public";
import { crewStrings, type Lang } from "@/lib/production-i18n";
import { fmtDay, LangToggle } from "./crew-ui";

export const metadata: Metadata = { title: "Crew jobs", robots: { index: false } };

type Portal = {
  crew: { id: string; name: string; color: string; language: Lang };
  org: { name: string; phone: string | null };
  jobs: { id: string; title: string; site_address: string | null; scheduled_start: string; scheduled_end: string | null; schedule_locked: boolean; customer_name: string }[];
};

export default async function CrewPortal({ params, searchParams }: PageProps<"/w/[token]">) {
  const { token } = await params;
  const { lang: q } = await searchParams;
  const { data } = await anonClient().rpc("get_crew_portal", { p_token: token });
  if (!data) notFound();
  const p = data as Portal;
  const lang: Lang = q === "es" || q === "en" ? q : p.crew.language;
  const t = crewStrings(lang);
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{p.org.name}</p>
          <h1 className="flex items-center gap-2 truncate text-2xl font-semibold"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.crew.color }} />{p.crew.name}</h1>
        </div>
        <LangToggle base={`/w/${token}`} lang={lang} />
      </header>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.upcoming}</h2>
      {p.jobs.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">{t.noJobs}</p>
      ) : (
        <ul className="space-y-3">
          {p.jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/w/${token}/${j.id}?lang=${lang}`} className="block rounded-xl bg-white p-4 ring-1 ring-slate-200 active:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{fmtDay(j.scheduled_start, lang)}{j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${fmtDay(j.scheduled_end, lang)}` : ""}</p>
                  <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", j.schedule_locked ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{j.schedule_locked ? t.locked : t.tentative}</span>
                </div>
                <p className="mt-1 text-slate-800">{j.site_address ?? j.title}</p>
                <p className="text-sm text-slate-500">{j.customer_name} · {j.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {p.org.phone && <p className="mt-6 text-center text-sm text-slate-500">{t.officePhone}: <a className="font-medium text-brand-600" href={`tel:${p.org.phone}`}>{p.org.phone}</a></p>}
    </main>
  );
}
