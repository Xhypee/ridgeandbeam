// A job on the Jobs board, as a small receipt: a mono top line (job type or Insurance, owner, days in stage or
// the new-lead wait timer), the customer's name, the street, a tear line, then the next step and the price.
import Link from "next/link";
import { cx } from "@/components/ui";
import { WaitTimer } from "@/components/wait-timer";
import { dollars } from "@/lib/next-step";

const AGE_CLS = { ok: "bg-slate-100 text-slate-600", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" };

export type JobCardProps = {
  href: string; current: boolean; signed: boolean; days: number; tone: keyof typeof AGE_CLS; value: number | null;
  next: { title: string; waiting: boolean }; owner: { name: string; initials: string } | null;
  job: { id: string; name: string; title: string | null; address: string; insurance: boolean; waitingSince: string | null };
};

export function JobCard({ href, current, signed, days, tone, value, next, owner, job }: JobCardProps) {
  return (
    <Link href={href} scroll={false} data-job-card={job.id} data-signed={signed ? "1" : "0"} aria-current={current ? "true" : undefined}
      className={cx("flex min-w-0 flex-col gap-1 rounded-[18px] bg-white p-3.5 transition", current ? "ring-2 ring-ink" : "ring-1 ring-slate-200 hover:ring-slate-400")}>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">{job.insurance ? <span className="text-violet-700">Insurance</span> : (job.title || "Job")}</span>
        {owner && <span title={`Assigned to ${owner.name}`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[9px] font-semibold text-slate-600 ring-1 ring-slate-300">{owner.initials}</span>}
        {job.waitingSince ? (
          <WaitTimer since={job.waitingSince} className="px-2 py-0.5 font-mono text-[10.5px]" />
        ) : (
          <span data-age data-tone={tone} title="Days in this stage" className={cx("shrink-0 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums", AGE_CLS[tone])}>{`${days} d`}</span>
        )}
      </span>
      <span className="font-display min-w-0 truncate text-[16px] font-bold leading-snug text-ink">{job.name}</span>
      <span className="truncate font-mono text-[11.5px] text-slate-500">{job.address}</span>
      <span className="mt-2 flex items-end gap-2 border-t-2 border-dashed border-slate-200 pt-2.5">
        <span data-next-step className={cx("min-w-0 flex-1 font-mono text-[10.5px] uppercase leading-snug tracking-[0.1em]", next.waiting ? "text-slate-500" : "text-ink")}>→ {next.title}</span>
        {value !== null
          ? <span className="shrink-0 font-display text-[17px] font-bold tabular-nums text-ink">{dollars(value)}</span>
          : <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">Not quoted</span>}
      </span>
    </Link>
  );
}
