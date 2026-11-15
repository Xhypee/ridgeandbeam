// The job record under the task: lines that are filled in (ticked), the one the job is waiting on (ringed),
// and the rest as faint chips that fill in as the job goes. Each filled line opens in place to show the documents
// behind it (lib/job-record-items), with View and Download.
import Link from "next/link";
import { cx } from "@/components/ui";
import { NOW_EMPTY, type RecordKey, type RecordRow } from "@/lib/job-record";
import type { RecordItem, RecordItemIcon, RecordItems } from "@/lib/job-record-items";
import { Icon } from "./job-section-ui";

const CHECK = "M5 12l5 5 9-10";
const DOWN = "M6 9l6 6 6-6";
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6";
const DL = "M12 4v11M7 10l5 5 5-5M5 20h14";
const ICON: Record<RecordItemIcon, string> = {
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  plan: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16",
  photo: "M4 6h16v13H4zM8 13l3-3 5 5M14 11l2-2 4 4",
  sign: "M3 17c3-6 5-6 6-2s3 2 4-1 3-3 4 0 2 2 4 1M3 21h18",
  cash: "M3 7h18v11H3zM3 10h18M7 15h3",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4",
  crew: "M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
};
const box = "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-slate-300 hover:bg-white";
const ext = (h: string) => !h.startsWith("/");

function Item({ it }: { it: RecordItem }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-ink ring-1 ring-slate-300"><Icon d={ICON[it.icon]} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[13.5px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{it.name}{it.tag && <span className="ml-1.5 rounded bg-ink px-1.5 py-0.5 align-middle font-mono text-[9px] font-semibold uppercase tracking-wider text-white">{it.tag}</span>}</span>
        <span className="block font-mono text-[11px] leading-snug text-slate-500">{it.meta}</span>
      </span>
      {it.href && (ext(it.href)
        ? <a href={it.href} target="_blank" rel="noreferrer" aria-label={`View ${it.name}`} title="View" className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></a>
        : <Link href={it.href} aria-label={`Open ${it.name}`} title="Open" className={box}><Icon d={EYE} className="h-3.5 w-3.5" /></Link>)}
      {it.download && <a href={it.download} aria-label={`Download ${it.name}`} title="Download" className={box}><Icon d={DL} className="h-3.5 w-3.5" /></a>}
    </li>
  );
}

export function JobRecordList({ rows, items = {}, lost }: { rows: RecordRow[]; items?: Partial<Record<RecordKey, RecordItems>>; lost?: boolean }) {
  const shown = rows.filter((r) => r.state !== "later");
  const later = rows.filter((r) => r.state === "later");
  const done = rows.filter((r) => r.state === "done").length;
  return (
    <section className="mt-6 px-5" data-job-record>
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
        <h3 className="font-display text-[17px] font-bold text-ink">Job record</h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">{done} of {rows.length} filled in</span>
      </div>
      <ul>
        {shown.map((r) => {
          const now = r.state === "now";
          const inside = items[r.key];
          const head = (
            <>
              {now
                ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2 ring-ink"><span className="h-1.5 w-1.5 rounded-full bg-ink" /></span>
                : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-white"><Icon d={CHECK} className="h-3 w-3" /></span>}
              <span className="w-24 shrink-0 font-display text-[14px] font-bold text-ink">{r.label}</span>
              <span className={cx("min-w-0 flex-1 font-mono text-[12px] leading-snug", now ? "font-semibold text-ink" : "text-slate-600")}>{r.value || NOW_EMPTY[r.key] || "Not yet"}</span>
            </>
          );
          const cls = cx("group flex items-center gap-3 py-2.5", now ? "-mx-2 rounded-lg bg-slate-100 px-2" : "");
          const hasInside = inside && (inside.items.length > 0 || (inside.thumbs?.length ?? 0) > 0);
          return (
            <li key={r.key} className={cx(!now && "border-b-2 border-dashed border-slate-200")} data-record={r.key} data-state={r.state}>
              {hasInside ? (
                <details className="group/rec">
                  <summary className={cx(cls, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>{head}<Icon d={DOWN} className="h-3.5 w-3.5 text-slate-300 transition-transform group-open/rec:rotate-180 group-open/rec:text-ink" /></summary>
                  <div className="mb-3 rounded-xl bg-cream px-3 py-1 ring-1 ring-slate-200" data-record-open={r.key}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs */}
                    {inside.thumbs && inside.thumbs.length > 0 && <div className="grid grid-cols-4 gap-1.5 pt-2">{inside.thumbs.slice(0, 4).map((src) => <img key={src} src={src} alt="" className="h-14 w-full rounded-lg object-cover" />)}</div>}
                    {inside.items.length > 0 && <ul className="divide-y-2 divide-dashed divide-slate-200">{inside.items.map((it, i) => <Item key={`${it.name}-${i}`} it={it} />)}</ul>}
                    {(inside.more || r.href) && (
                      <p className="border-t-2 border-dashed border-slate-200 py-2 text-right">
                        <Link href={(inside.more?.href ?? r.href)!} className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink underline underline-offset-2">{inside.more?.label ?? `Open ${r.label.toLowerCase()}`} →</Link>
                      </p>
                    )}
                  </div>
                </details>
              ) : r.href ? <Link href={r.href} className={cls}>{head}<Icon d="M9 6l6 6-6 6" className="h-3.5 w-3.5 text-slate-300 group-hover:text-ink" /></Link> : <div className={cls}>{head}</div>}
            </li>
          );
        })}
      </ul>
      {later.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">{lost ? "Never got this far" : "Fills in as the job goes"} · {later.length}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{later.map((r) => <span key={r.key} className="rounded-full px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-slate-400 ring-1 ring-dashed ring-slate-300" data-record-later={r.key}>{r.label}</span>)}</div>
        </div>
      )}
    </section>
  );
}
