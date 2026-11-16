// The job file view: every document and record on the job in one place, newest first, filtered by job record line,
// with the plans (and which revision was used), the roof report checked against our measure, and the photos.
// ?print=1 lays it all out as one document to save as PDF for insurers, disputes or the crew.
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { cx } from "@/components/ui";
import type { FileEntry, JobFile } from "@/lib/job-file-server";
import { LABEL, type RecordKey } from "@/lib/job-record";
import { Icon } from "../../job-section-ui";

export const FILE_ORDER: RecordKey[] = ["lead", "plans", "quote", "contract", "legal", "payments", "materials", "variations", "safety", "photos", "signoff", "warranty", "messages"];

const ICON: Record<FileEntry["icon"], string> = {
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  plan: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16",
  photo: "M4 6h16v13H4zM8 13l3-3 5 5M14 11l2-2 4 4",
  sign: "M3 17c3-6 5-6 6-2s3 2 4-1 3-3 4 0 2 2 4 1M3 21h18",
  cash: "M3 7h18v11H3zM3 10h18M7 15h3",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
};
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6";
const DL = "M12 4v11M7 10l5 5 5-5M5 20h14";
const ORDER = FILE_ORDER;
const lab = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400";
const box = "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
const ext = (h: string) => !h.startsWith("/");

function Row({ e, print }: { e: FileEntry; print: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5" data-file-entry={e.record}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cream text-ink ring-1 ring-slate-300"><Icon d={ICON[e.icon]} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{e.name}{e.tag && <span className="ml-1.5 rounded bg-ink px-1.5 py-0.5 align-middle font-mono text-[9px] font-semibold uppercase tracking-wider text-white">{e.tag}</span>}</span>
        <span className="block font-mono text-[11px] leading-snug text-slate-500">{LABEL[e.record]} · {day(e.at)}{e.detail ? ` · ${e.detail}` : ""}</span>
      </span>
      {!print && e.view && (ext(e.view)
        ? <a href={e.view} target="_blank" rel="noreferrer" title="View" aria-label={`View ${e.name}`} className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></a>
        : <Link href={e.view} title="Open" aria-label={`Open ${e.name}`} className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></Link>)}
      {!print && e.download && <a href={e.download} title="Download" aria-label={`Download ${e.name}`} className={box}><Icon d={DL} className="h-3.5 w-3.5" /></a>}
    </li>
  );
}

export function JobFileView({ f, r, print, base }: { f: JobFile; r: RecordKey | null; print: boolean; base: string }) {
  const counts = new Map<RecordKey, number>();
  for (const e of f.entries) counts.set(e.record, (counts.get(e.record) ?? 0) + 1);
  const shown = r ? f.entries.filter((e) => e.record === r) : f.entries;
  const plans = f.plans.filter((p) => !p.isReport);
  const reports = f.plans.filter((p) => p.isReport);
  const current = plans.find((p) => !p.superseded);
  const showPlans = !r || r === "plans";
  const showPhotos = (!r || r === "photos") && f.photos.length > 0;

  return (
    <div data-job-file-page className={cx(print && "mx-auto max-w-3xl")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className={lab}>Job file{print ? ` · printed ${day(new Date().toISOString())}` : ""}</p>
          <h2 className="font-display text-[22px] font-bold text-ink">{f.job.customer} · {f.job.title}</h2>
          {f.job.site && <p className="font-mono text-[12px] text-slate-500">{f.job.site}</p>}
        </div>
        <div className="no-print flex gap-2">
          {print
            ? <><Link href={base} className="inline-flex min-h-10 items-center rounded-xl px-4 font-mono text-xs font-semibold uppercase tracking-wider text-ink ring-1 ring-slate-300">Back</Link><PrintButton /></>
            : <Link href={`${base}?print=1`} className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">Download job file · PDF</Link>}
        </div>
      </div>

      <div className={cx("mt-5 grid gap-6", !print && "lg:grid-cols-[200px_minmax(0,1fr)]")}>
        {!print && (
          <nav className="no-print" aria-label="Filter the job file">
            <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0">
              {[null, ...ORDER.filter((k) => counts.get(k))].map((k) => (
                <li key={k ?? "all"}>
                  <Link href={k ? `${base}?r=${k}` : base} data-file-filter={k ?? "all"} className={cx("flex items-center justify-between gap-3 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-wider", r === k ? "bg-ink text-white" : "text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 lg:ring-0")}>
                    <span>{k ? LABEL[k] : "Everything"}</span><span className={r === k ? "text-white/70" : "text-slate-400"}>{k ? counts.get(k) : f.entries.length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="min-w-0 space-y-7">
          {showPlans && (plans.length > 0 || reports.length > 0 || f.measured) && (
            <section data-file-plans>
              <h3 className="border-b-2 border-dashed border-slate-200 pb-1.5 font-display text-[16px] font-bold text-ink">Plans & measurements</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] p-4 ring-1 ring-slate-200">
                  <p className={lab}>Plan revisions</p>
                  {plans.length === 0 ? <p className="mt-2 font-mono text-[12px] text-slate-500">No plans uploaded</p> : (
                    <ul className="mt-1 divide-y-2 divide-dashed divide-slate-200">
                      {plans.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 py-2">
                          <span className="min-w-0 flex-1">
                            <span className={cx("block font-display text-[13.5px] font-bold [overflow-wrap:anywhere]", p.superseded ? "text-slate-400 line-through" : "text-ink")}>{p.name}</span>
                            <span className="block font-mono text-[11px] text-slate-500">{[p.revision, day(p.at), p.superseded ? "superseded" : null].filter(Boolean).join(" · ")}</span>
                          </span>
                          {p === current && <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-white">Current</span>}
                          {!print && p.view && <a href={p.view} target="_blank" rel="noreferrer" title="View" className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></a>}
                          {!print && p.download && <a href={p.download} title="Download" className={box}><Icon d={DL} className="h-3.5 w-3.5" /></a>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-[22px] p-4 ring-1 ring-slate-200">
                  <p className={lab}>Measurements</p>
                  {f.measured ? (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[12px]">
                      {([["Roof area", `${Math.round(f.measured.area * 10) / 10} m²`], ["Pitch", `${Math.round(f.measured.pitch)}°`], ["Ridge & hip", `${Math.round(f.measured.ridgeHip * 10) / 10} m`], ["Valley", `${Math.round(f.measured.valley * 10) / 10} m`], ["Eave", `${Math.round(f.measured.eave * 10) / 10} m`], ["Barge", `${Math.round(f.measured.barge * 10) / 10} m`]] as const).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-dashed border-slate-200 pb-1"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
                      ))}
                    </dl>
                  ) : <p className="mt-2 font-mono text-[12px] text-slate-500">Not measured yet</p>}
                  {reports.map((p) => {
                    const diff = f.measured && p.area ? Math.abs(p.area - f.measured.area) / f.measured.area : null;
                    return (
                      <div key={p.id} className="mt-3 flex items-center gap-2 rounded-xl bg-cream p-2.5 ring-1 ring-slate-200" data-roof-report>
                        <Icon d={ICON.ruler} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[13px] font-bold text-ink">{p.source ?? "Roof"} report{p.area ? ` · ${Math.round(p.area * 10) / 10} m²` : ""}{p.pitch ? ` · ${Math.round(p.pitch)}°` : ""}</span>
                          <span className="block font-mono text-[11px] text-slate-500">{diff === null ? p.name : diff <= 0.02 ? `Matches our measure within ${Math.max(1, Math.round(diff * 100))}%` : `Differs from our measure by ${Math.round(diff * 100)}% — check before ordering`}</span>
                        </span>
                        {!print && p.view && <a href={p.view} target="_blank" rel="noreferrer" title="View the full report" className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></a>}
                        {!print && p.download && <a href={p.download} title="Download" className={box}><Icon d={DL} className="h-3.5 w-3.5" /></a>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {showPhotos && (
            <section data-file-photos>
              <h3 className="border-b-2 border-dashed border-slate-200 pb-1.5 font-display text-[16px] font-bold text-ink">Photos · {f.photos.length}</h3>
              {(["before", "during", "after", "other"] as const).map((s) => {
                const ps = f.photos.filter((p) => p.stage === s);
                if (!ps.length) return null;
                return (
                  <div key={s} className="mt-3">
                    <p className={lab}>{s === "other" ? "Other" : s[0].toUpperCase() + s.slice(1)} · {ps.length}</p>
                    <div className={cx("mt-1.5 grid gap-1.5", print ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-6")}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs */}
                      {ps.slice(0, print ? 24 : 18).map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.caption} className="aspect-square w-full rounded-lg object-cover" /></a>)}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <section>
            <h3 className="border-b-2 border-dashed border-slate-200 pb-1.5 font-display text-[16px] font-bold text-ink">{r ? LABEL[r] : "Everything on the job"} · {shown.length}</h3>
            {shown.length === 0 ? <p className="py-6 font-mono text-[12px] text-slate-500">Nothing here yet.</p> : (
              <ul className="divide-y-2 divide-dashed divide-slate-200">{shown.map((e) => <Row key={e.id} e={e} print={print} />)}</ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
