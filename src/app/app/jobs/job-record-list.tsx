// The job record under the task: lines that are filled in (ticked), the one the job is waiting on (ringed),
// and the rest as faint chips that fill in as the job goes.
import Link from "next/link";
import { cx } from "@/components/ui";
import { NOW_EMPTY, type RecordRow } from "@/lib/job-record";
import { Icon } from "./job-section-ui";

const CHECK = "M5 12l5 5 9-10";
const CHEV = "M9 6l6 6-6 6";

export function JobRecordList({ rows, lost }: { rows: RecordRow[]; lost?: boolean }) {
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
          const body = (
            <>
              {now
                ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2 ring-ink"><span className="h-1.5 w-1.5 rounded-full bg-ink" /></span>
                : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-white"><Icon d={CHECK} className="h-3 w-3" /></span>}
              <span className="w-24 shrink-0 font-display text-[14px] font-bold text-ink">{r.label}</span>
              <span className={cx("min-w-0 flex-1 font-mono text-[12px] leading-snug", now ? "font-semibold text-ink" : "text-slate-600")}>{r.value || NOW_EMPTY[r.key] || "Not yet"}</span>
              {r.href && <Icon d={CHEV} className="h-3.5 w-3.5 text-slate-300 group-hover:text-ink" />}
            </>
          );
          const cls = cx("group flex items-center gap-3 py-2.5", now ? "-mx-2 rounded-lg bg-slate-100 px-2" : "");
          return (
            <li key={r.key} className={cx(!now && "border-b-2 border-dashed border-slate-200")} data-record={r.key} data-state={r.state}>
              {r.href ? <Link href={r.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
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
