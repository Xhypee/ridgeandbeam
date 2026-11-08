import Link from "next/link";
import type { Metadata } from "next";
import { LinkButton, cx } from "@/components/ui";
import { WaitTimer } from "@/components/wait-timer";
import { requireOrg } from "@/lib/dal";
import { ageTone, dollars, nextStep, pipelineColumn, type NextStepJob, type PipelineColumn } from "@/lib/next-step";
import { asNextStepJob, loadNextStepCtx, NEXT_STEP_JOB_COLS } from "@/lib/next-step-server";
import { isoDate } from "@/lib/format";
import { displayName, initials, orgPeople } from "./people";
import { SectionTabs } from "@/components/nav";
import { loadDocket } from "@/lib/job-docket-server";
import { JobDocket } from "./job-docket";

export const metadata: Metadata = { title: "Jobs" };

type Row = NextStepJob & {
  title: string; site_address: string | null; lead_source: string | null;
  assigned_to: string | null; sales_rep_id: string | null; setter_id: string | null;
  customers: { name: string; phone: string | null } | null;
};

const COLUMNS: { key: PipelineColumn; name: string; hint: string }[] = [
  { key: "new", name: "New leads", hint: "Call within 5 minutes" },
  { key: "quoting", name: "Quoting", hint: "Inspect, measure, send options" },
  { key: "sold", name: "Sold", hint: "Get it ready to build" },
  { key: "building", name: "Building", hint: "Crew on the roof" },
  { key: "wrapping", name: "Wrapping up", hint: "Close out and get paid" },
];
const FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "My jobs" },
  { key: "insurance", label: "Insurance" },
  { key: "retail", label: "Retail" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const AGE_CLS = { ok: "bg-slate-100 text-slate-600", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" };
const DAY = 86400000;
// "77 Banksia St, Paddington QLD 4064" → "77 Banksia St, Paddington" (the state is the same on almost every card).
const STATE_TAIL = /,?\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)(\s+\d{4})?\s*$/;

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const { supabase, org, user, isSalesRep, canSeeMoney, isCrewLead } = await requireOrg();
  const sp = await searchParams;
  // ?mine=1 / ?mine=0 still work (older links).
  const raw = typeof sp.filter === "string" ? sp.filter : sp.mine === "1" ? "mine" : sp.mine === "0" ? "all" : undefined;
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : isSalesRep ? "mine" : "all";
  const now = new Date();
  const since30 = isoDate(new Date(now.getTime() - 30 * DAY));

  let q = supabase.from("jobs")
    .select(`${NEXT_STEP_JOB_COLS}, title, site_address, lead_source, assigned_to, sales_rep_id, setter_id, customers(name, phone)`)
    .neq("stage", "lost").or(`stage.neq.paid,stage_changed_at.gte.${since30}`)
    .order("stage_changed_at").limit(500);
  if (filter === "insurance") q = q.eq("is_insurance", true);
  if (filter === "retail") q = q.eq("is_insurance", false);
  const [{ data, error }, people] = await Promise.all([q, orgPeople(supabase, org.id)]);
  if (error) throw new Error(error.message);
  let jobs = ((data ?? []) as unknown as Row[]).map((j) => ({ ...j, ...asNextStepJob(j) }) as Row);
  // "My jobs" = any lead role on the job (assigned, sales rep or setter).
  if (filter === "mine") jobs = jobs.filter((j) => [j.assigned_to, j.sales_rep_id, j.setter_id].includes(user.id));
  const ctx = await loadNextStepCtx(supabase, jobs, { now });

  const cards = jobs
    .map((j) => {
      const c = ctx.get(j.id)!;
      const est = c.estimate;
      return { j, col: pipelineColumn(j, now), value: est && ["accepted", "sent"].includes(est.status) ? est.total : null, next: nextStep(j, c) };
    })
    .filter((x) => x.col !== null);
  const shownValue = cards.reduce((s, c) => s + (c.value ?? 0), 0);
  // ?job=<id> opens that job's docket in the right sidebar.
  const openId = typeof sp.job === "string" && /^[0-9a-f-]{36}$/i.test(sp.job) ? sp.job : null;
  const docket = openId ? await loadDocket(supabase, org, openId, { canSeeMoney }) : null;
  const filterQs = filter === (isSalesRep ? "mine" : "all") ? "" : `filter=${filter}`;
  const hrefFor = (id: string | null) => `/app/jobs${[filterQs, id ? `job=${id}` : ""].filter(Boolean).length ? `?${[filterQs, id ? `job=${id}` : ""].filter(Boolean).join("&")}` : ""}`;
  const waiting = cards.filter((c) => c.j.stage === "lead" && !c.j.first_contacted_at).length;

  const board = (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {cards.length} job{cards.length === 1 ? "" : "s"} · {dollars(shownValue)} in play
            {waiting > 0 && <span className="font-semibold text-red-700"> · {waiting} new lead{waiting === 1 ? "" : "s"} waiting for a first call</span>}
          </p>
        </div>
        <nav aria-label="Filter jobs" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/app/jobs?filter=${f.key}${docket ? `&job=${docket.job.id}` : ""}`} scroll={false} aria-current={filter === f.key ? "true" : undefined}
              className={cx("inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold ring-1 ring-inset transition",
                filter === f.key ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>
              {f.label}
            </Link>
          ))}
        </nav>
        <LinkButton href="/app/customers/new" className="h-11 px-5 text-[15px]">+ New lead</LinkButton>
      </header>

      {/* All five columns fit from 1280px; below that the board scrolls inside itself, never the page. */}
      <div data-pipeline-scroll className={docket ? "overflow-x-auto pb-4" : "-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 xl:mx-0 xl:px-0"}>
        <div className={cx("grid grid-cols-[repeat(5,minmax(0,1fr))] gap-3", docket ? "min-w-[780px]" : "min-w-[940px]")}>
          {COLUMNS.map((col) => {
            const list = cards
              .filter((c) => c.col === col.key)
              .sort((a, b) =>
                col.key === "new"
                  ? Number(!!a.j.first_contacted_at) - Number(!!b.j.first_contacted_at) || (a.j.lead_received_at ?? "").localeCompare(b.j.lead_received_at ?? "")
                  : (a.j.stage_changed_at ?? "").localeCompare(b.j.stage_changed_at ?? ""),
              );
            const total = list.reduce((s, c) => s + (c.value ?? 0), 0);
            return (
              <section key={col.key} aria-label={col.name} data-pipeline-col={col.key} className="flex min-w-0 flex-col gap-2.5">
                <header className="px-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-[15px] font-bold text-ink">{col.name} <span className="font-medium text-slate-500">{list.length}</span></h2>
                    {total > 0 && <span className="shrink-0 text-[13px] text-slate-500">{dollars(total)}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{col.hint}</p>
                </header>
                {list.map(({ j, value, next }) => {
                  const owner = people.byId.get(j.assigned_to ?? j.sales_rep_id ?? "");
                  const uncontacted = j.stage === "lead" && !j.first_contacted_at;
                  const days = Math.max(0, Math.floor((now.getTime() - new Date(j.stage_changed_at ?? now).getTime()) / DAY));
                  const buildDay = j.stage === "in_progress" && j.scheduled_start
                    ? Math.max(1, Math.floor((now.getTime() - new Date(j.scheduled_start + "T00:00:00").getTime()) / DAY) + 1)
                    : null;
                  const tone = buildDay ? "ok" : ageTone(col.key, { days });
                  return (
                    <Link key={j.id} href={hrefFor(j.id)} scroll={false} data-job-card={j.id} aria-current={docket?.job.id === j.id ? "true" : undefined}
                      className={cx("flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white p-3.5 transition", docket?.job.id === j.id ? "ring-2 ring-ink" : "ring-1 ring-slate-200 hover:ring-brand-400")}>
                      <span className="flex items-start gap-2">
                        <span className="font-display min-w-0 flex-1 truncate text-[15px] font-bold leading-snug text-ink">{j.customer_name ?? j.title}</span>
                        {uncontacted && j.lead_received_at ? (
                          <WaitTimer since={j.lead_received_at} className="px-2 py-0.5 text-xs" />
                        ) : (
                          <span data-age data-tone={tone} title={buildDay ? "Day of the build" : "Days in this stage"}
                            className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", AGE_CLS[tone])}>
                            {buildDay ? `Day ${buildDay}` : `${days} d`}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[13px] text-slate-500">{(j.site_address ?? j.title).replace(STATE_TAIL, "")}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-display text-[15px] font-bold text-ink">{value !== null ? dollars(value) : "Not quoted"}</span>
                        {j.is_insurance && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Insurance</span>}
                        {owner && (
                          <span title={`Assigned to ${displayName(owner)}`} className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700 ring-1 ring-brand-100">{initials(owner)}</span>
                        )}
                      </span>
                      <span data-next-step className={cx("mt-1 flex items-start gap-1.5 border-t border-slate-100 pt-2 text-[13px] leading-snug", next.waiting ? "text-slate-700" : "text-slate-500")}>
                        <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        <span className="min-w-0">{next.title}</span>
                      </span>
                    </Link>
                  );
                })}
                {list.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">Nothing here</div>}
              </section>
            );
          })}
        </div>
      </div>
      {cards.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          {filter === "mine" ? <>No open jobs assigned to you. <Link className="font-semibold text-brand-600" href="/app/jobs?filter=all">See everyone&apos;s jobs</Link></> : "No open jobs yet. Add a new lead to get started."}
        </p>
      )}
    </>
  );

  if (!docket) return board;
  return (
    <div className="lg:flex lg:h-screen">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-7">
        <SectionTabs canSeeMoney={canSeeMoney} />
        {board}
      </div>
      <aside aria-label={`Job docket: ${docket.customer.name}`} className="fixed inset-0 z-30 flex flex-col bg-cream lg:static lg:z-auto lg:h-screen lg:w-[440px] lg:shrink-0 lg:border-l lg:border-slate-200 xl:w-[460px]">
        <JobDocket d={docket} org={org} canSeeMoney={canSeeMoney} isCrewLead={isCrewLead} closeHref={hrefFor(null)} />
      </aside>
    </div>
  );
}
