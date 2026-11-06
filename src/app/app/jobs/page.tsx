import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, daysSince, label, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { JOB_STAGES, type Job } from "@/lib/types";
import { LeadTimer } from "./lead-timer";
import { displayName, initials, mineFilter, orgPeople } from "./people";

export const metadata: Metadata = { title: "Jobs" };

type Row = Job & {
  customers: { name: string } | null;
  crews: { name: string; color: string } | null;
  assigned_to: string | null;
  sales_rep_id: string | null;
  setter_id: string | null;
  lead_source: string | null;
  lead_received_at: string;
  first_contacted_at: string | null;
  stage_changed_at: string;
};

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const { supabase, org, user, isSalesRep } = await requireOrg();
  const { view, mine: mineParam } = await searchParams;
  const showClosed = view === "all";
  const mine = mineParam === "1" || (mineParam === undefined && isSalesRep);
  let q = supabase.from("jobs").select("*, customers(name), crews(name, color)").order("updated_at", { ascending: false }).limit(500);
  if (!showClosed) q = q.not("stage", "in", "(paid,lost)");
  if (mine) q = q.or(mineFilter(user.id));
  const [{ data, error }, people] = await Promise.all([q, orgPeople(supabase, org.id)]);
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as Row[];
  const stages = JOB_STAGES.filter((s) => showClosed || (s !== "paid" && s !== "lost"));
  const waiting = jobs.filter((j) => j.stage === "lead" && !j.first_contacted_at).length;

  const href = (over: { view?: string; mine?: string }) => {
    const p = new URLSearchParams();
    const v = over.view ?? (showClosed ? "all" : undefined);
    if (v) p.set("view", v);
    p.set("mine", over.mine ?? (mine ? "1" : "0"));
    return `/app/jobs?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={waiting > 0 ? <span className="font-medium text-red-700">{waiting} new lead{waiting === 1 ? "" : "s"} waiting for a first call</span> : "Your pipeline, from first call to final payment."}
        actions={
          <>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="group" aria-label="Whose jobs">
              <Link href={href({ mine: "1" })} aria-pressed={mine} className={cx("rounded-md px-3 py-1.5 font-medium", mine ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>My jobs</Link>
              <Link href={href({ mine: "0" })} aria-pressed={!mine} className={cx("rounded-md px-3 py-1.5 font-medium", !mine ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>Everyone</Link>
            </div>
            <LinkButton variant="secondary" href={href({ view: showClosed ? "" : "all" })}>{showClosed ? "Hide paid & lost" : "Show paid & lost"}</LinkButton>
            <LinkButton href="/app/jobs/new">New job</LinkButton>
          </>
        }
      />
      {jobs.length === 0 && !showClosed ? (
        <Empty title={mine ? "No open jobs assigned to you" : "No open jobs"}>
          {mine ? <Link className="text-brand-600 underline" href={href({ mine: "0" })}>See everyone&apos;s jobs</Link> : "Create a job from a customer, or start a new one."}
        </Empty>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {stages.map((stage) => {
            const col = jobs
              .filter((j) => j.stage === stage)
              // uncontacted leads first, oldest first: they're the ones losing money
              .sort((a, b) => (stage === "lead" ? Number(!!a.first_contacted_at) - Number(!!b.first_contacted_at) || a.lead_received_at.localeCompare(b.lead_received_at) : 0));
            return (
              <div key={stage} className="w-64 shrink-0 snap-start">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                  <span className="text-xs text-slate-500">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((j) => {
                    const owner = people.byId.get(j.assigned_to ?? j.sales_rep_id ?? "");
                    const inStage = daysSince(j.stage_changed_at);
                    return (
                      <Link key={j.id} href={`/app/jobs/${j.id}`} data-job-card={j.id} className="block rounded-lg bg-white p-3 ring-1 ring-slate-200 hover:ring-brand-500">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-slate-900">{j.title}</p>
                          {owner && (
                            <span title={`Assigned to ${displayName(owner)}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">{initials(owner)}</span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">{j.customers?.name}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {j.stage === "lead" && !j.first_contacted_at && <LeadTimer since={j.lead_received_at} compact />}
                          <span className={cx("rounded px-1.5 py-0.5", inStage >= 14 ? "bg-red-50 text-red-700" : inStage >= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600")} title="Days in this stage">
                            {inStage}d in stage
                          </span>
                          {j.lead_source && j.stage === "lead" && <span className="rounded bg-slate-50 px-1.5 py-0.5">{label(j.lead_source)}</span>}
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
                    );
                  })}
                  {col.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
