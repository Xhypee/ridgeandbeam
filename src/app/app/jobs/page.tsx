import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { JOB_STAGES, type Job } from "@/lib/types";

export const metadata: Metadata = { title: "Jobs" };

type Row = Job & { customers: { name: string } | null; crews: { name: string; color: string } | null };

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const { supabase } = await requireOrg();
  const { view } = await searchParams;
  const showClosed = view === "all";
  let q = supabase.from("jobs").select("*, customers(name), crews(name, color)").order("updated_at", { ascending: false }).limit(500);
  if (!showClosed) q = q.not("stage", "in", "(paid,lost)");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as Row[];
  const stages = JOB_STAGES.filter((s) => showClosed || (s !== "paid" && s !== "lost"));

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Your pipeline, from first call to final payment."
        actions={
          <>
            <LinkButton variant="secondary" href={showClosed ? "/app/jobs" : "/app/jobs?view=all"}>{showClosed ? "Hide paid & lost" : "Show paid & lost"}</LinkButton>
            <LinkButton href="/app/jobs/new">New job</LinkButton>
          </>
        }
      />
      {jobs.length === 0 && !showClosed ? (
        <Empty title="No open jobs">Create a job from a customer, or start a new one.</Empty>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {stages.map((stage) => {
            const col = jobs.filter((j) => j.stage === stage);
            return (
              <div key={stage} className="w-64 shrink-0 snap-start">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                  <span className="text-xs text-slate-500">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((j) => (
                    <Link key={j.id} href={`/app/jobs/${j.id}`} className="block rounded-lg bg-white p-3 ring-1 ring-slate-200 hover:ring-brand-500">
                      <p className="truncate text-sm font-medium text-slate-900">{j.title}</p>
                      <p className="truncate text-xs text-slate-500">{j.customers?.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {j.is_insurance && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">Insurance</span>}
                        {j.scheduled_start && <span>{date(j.scheduled_start, { month: "short", day: "numeric" })}</span>}
                        {j.crews && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ background: j.crews.color }} />
                            {j.crews.name}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {col.length === 0 && <div className={cx("rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400")}>Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
