import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import {
  addDaysIso, dateRange, isWeekend, jobReadiness, mondayOfIso, packLanes, weatherRisk, type DayForecast, type Readiness, type ReadinessJob,
} from "@/lib/production";
import { getForecast, readinessContexts } from "@/lib/production-data";
import { RainDay } from "./rain-day";
import { ReadinessDots } from "./readiness-dots";

export const metadata: Metadata = { title: "Schedule" };

type Row = ReadinessJob & {
  id: string; title: string; stage: string; site_address: string | null; crew_id: string | null; scheduled_end: string | null; schedule_locked: boolean;
  customers: { name: string } | null; crews: { name: string; color: string } | null;
};
const JOB_COLS = "id, title, stage, site_address, crew_id, scheduled_start, scheduled_end, schedule_locked, permit_status, hoa_status, colors_confirmed, shingle_color, materials_status, dumpster_status, customers(name), crews(name, color)";

const kmh = (v: number | null | undefined) => Math.round(v ?? 0);

function Weather({ f }: { f?: DayForecast }) {
  if (!f) return null;
  const risk = weatherRisk(f);
  return (
    <span className={cx("mt-0.5 block text-[11px] leading-tight", risk ? "font-semibold text-red-700" : "text-slate-500")} title={`Rain ${f.precipProb ?? "?"}% · wind ${kmh(f.windKmh)} km/h`}>
      {risk === "rain" ? "🌧" : risk === "wind" ? "💨" : (f.precipProb ?? 0) >= 25 ? "🌦" : "☀"} {f.precipProb ?? "–"}% · {kmh(f.windKmh)} km/h
    </span>
  );
}

function JobChip({ j, r, compact }: { j: Row; r: Readiness; compact?: boolean }) {
  const color = j.crews?.color ?? "#94a3b8";
  return (
    <Link
      href={`/app/jobs/${j.id}/production`}
      data-testid="schedule-job"
      data-locked={j.schedule_locked ? "true" : "false"}
      className={cx(
        "block min-w-0 rounded-lg px-2.5 py-1.5 text-xs transition hover:brightness-95",
        j.schedule_locked ? "border-l-4 bg-white ring-1 ring-slate-200" : "border-2 border-dashed bg-white/80",
      )}
      style={j.schedule_locked ? { borderLeftColor: color } : { borderColor: color }}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="truncate text-[13px] font-semibold text-ink">{j.customers?.name}</span>
        <span className={cx("shrink-0 rounded-full px-1.5 text-[10px] font-semibold", j.schedule_locked ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800")}>{j.schedule_locked ? "Locked" : "Tentative"}</span>
      </span>
      <span className="block truncate text-slate-600">{j.title}</span>
      <span className="mt-0.5 flex items-center justify-between gap-1">
        <ReadinessDots r={r} />
        {compact && <span className="truncate text-slate-400">{j.crews?.name ?? "No crew"}</span>}
      </span>
    </Link>
  );
}

export default async function SchedulePage({ searchParams }: PageProps<"/app/schedule">) {
  const ctx = await requireOrg();
  const { supabase, org, isCrewLead, crewId } = ctx;
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "2w";
  const today = isoDate(new Date());
  const rawFrom = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  const spanDays = view === "week" ? 7 : 14;
  const from = view === "week" ? mondayOfIso(rawFrom) : rawFrom;
  const to = addDaysIso(from, spanDays - 1);
  const days = dateRange(from, spanDays);
  const href = (f: string, v = view) => `/app/schedule?view=${v}&from=${f}`;

  let jobsQ = supabase.from("jobs").select(JOB_COLS).eq("org_id", org.id).not("scheduled_start", "is", null).lte("scheduled_start", to).gte("scheduled_end", from).neq("stage", "lost").order("scheduled_start");
  if (isCrewLead) jobsQ = jobsQ.eq("crew_id", crewId ?? "00000000-0000-0000-0000-000000000000");
  const [{ data: scheduled }, { data: unscheduled }, { data: crewsData }, forecast] = await Promise.all([
    jobsQ,
    isCrewLead ? Promise.resolve({ data: [] }) : supabase.from("jobs").select(JOB_COLS).eq("org_id", org.id).is("scheduled_start", null).in("stage", ["sold", "scheduled"]).order("updated_at", { ascending: false }),
    supabase.from("crews").select("id, name, color").order("name"),
    getForecast({ zip: org.zip, lat: org.lat, lng: org.lng }),
  ]);
  const jobs = (scheduled ?? []) as unknown as Row[];
  const waiting = (unscheduled ?? []) as unknown as Row[];
  const rctx = await readinessContexts(supabase, [...jobs, ...waiting].map((j) => j.id));
  const ready = (j: Row) => jobReadiness(j, rctx.get(j.id)!);
  const fc = new Map((forecast ?? []).map((f) => [f.date, f]));
  const riskyDates = days.filter((d) => weatherRisk(fc.get(d)));
  const crews = ((crewsData ?? []) as { id: string; name: string; color: string }[]).filter((c) => !isCrewLead || c.id === crewId);
  const lanes = [...crews.map((c) => ({ id: c.id as string | null, name: c.name, color: c.color })), ...(isCrewLead ? [] : [{ id: null, name: "Unassigned", color: "#94a3b8" }])];
  const idx = (d: string) => Math.max(0, Math.min(spanDays - 1, Math.round((new Date(d + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000)));
  const gridCols = `9rem repeat(${spanDays}, minmax(0, 1fr))`;
  const tentative = jobs.filter((j) => !j.schedule_locked).length;

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={`${date(from, { month: "short", day: "numeric" })} – ${date(to, { month: "short", day: "numeric", year: "numeric" })} · ${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${tentative} tentative`}
        actions={
          <>
            <div className="flex gap-1.5 text-[15px]" role="group" aria-label="View">
              {([["2w", "2 weeks"], ["week", "Week"]] as const).map(([v, l]) => (
                <Link key={v} href={href(from, v)} aria-current={view === v ? "true" : undefined}
                  className={cx("inline-flex min-h-11 items-center rounded-full px-4 font-semibold ring-1 ring-inset", view === v ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>{l}</Link>
              ))}
            </div>
            <LinkButton variant="secondary" href={href(addDaysIso(from, -spanDays))} aria-label="Previous">←</LinkButton>
            <LinkButton variant="secondary" href={`/app/schedule?view=${view}`}>Today</LinkButton>
            <LinkButton variant="secondary" href={href(addDaysIso(from, spanDays))} aria-label="Next">→</LinkButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border-l-4 border-slate-500 bg-white ring-1 ring-slate-200" /> Locked</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border-2 border-dashed border-slate-400" /> Tentative</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /><span className="h-2 w-2 rounded-full bg-red-400" /> Permit · Strata · Colours · Materials · Skip bin · Deposit</span>
          {forecast ? (
            riskyDates.length > 0 && <span className="font-medium text-red-700">⚠ Weather risk: {riskyDates.map((d) => date(d, { weekday: "short", month: "numeric", day: "numeric" })).join(", ")}</span>
          ) : (
            <span className="text-slate-400">Forecast unavailable{org.zip ? "" : " — add your postcode in company settings"}</span>
          )}
        </div>
        {!isCrewLead && <RainDay crews={crews} defaultDate={riskyDates[0] ?? today} riskyDates={riskyDates} />}
      </div>

      {/* Desktop: crew swimlanes */}
      <div className="hidden overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 md:block" data-testid="swimlanes">
        <div className="grid border-b border-slate-200 bg-cream" style={{ gridTemplateColumns: gridCols }}>
          <div className="px-4 py-2.5 text-[13px] font-semibold text-slate-500">Crew</div>
          {days.map((d) => {
            const risk = weatherRisk(fc.get(d));
            return (
              <div key={d} className={cx("border-l border-slate-200 px-2 py-2 text-xs", d === today && "bg-brand-50", risk && "bg-red-50", isWeekend(d) && !risk && "bg-slate-100/70")}>
                <span className={cx("block text-[13px] font-semibold", d === today ? "text-brand-700" : "text-slate-700")}>{new Date(d + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short" })} {Number(d.slice(8))}</span>
                <Weather f={fc.get(d)} />
              </div>
            );
          })}
        </div>
        {lanes.map((lane) => {
          const laneJobs = packLanes(
            jobs.filter((j) => (j.crew_id ?? null) === lane.id).map((j) => ({ j, start: j.scheduled_start!, end: j.scheduled_end ?? j.scheduled_start! })),
          );
          const nLanes = Math.max(1, ...laneJobs.map((x) => x.lane + 1));
          return (
            <div key={lane.id ?? "none"} className="grid border-b border-slate-100 last:border-0" style={{ gridTemplateColumns: gridCols, gridTemplateRows: `repeat(${nLanes}, minmax(3.75rem, auto))` }} data-testid="crew-lane">
              <div className="flex items-start gap-2.5 px-4 py-3 text-[15px] font-semibold text-ink" style={{ gridRow: `1 / span ${nLanes}`, gridColumn: 1 }}>
                <span className="mt-1 h-3.5 w-1.5 shrink-0 rounded-full" style={{ background: lane.color }} />
                <span className="min-w-0 break-words">{lane.name}</span>
              </div>
              {days.map((d, i) => (
                <div key={d} aria-hidden className={cx("border-l border-slate-100", d === today && "bg-brand-50/50", weatherRisk(fc.get(d)) && "bg-red-50/70", isWeekend(d) && "bg-slate-50")} style={{ gridRow: `1 / span ${nLanes}`, gridColumn: i + 2 }} />
              ))}
              {laneJobs.map(({ j, start, end, lane: l }) => (
                <div key={j.id} className="relative z-10 min-w-0 p-1" style={{ gridColumn: `${idx(start < from ? from : start) + 2} / ${idx(end > to ? to : end) + 3}`, gridRow: l + 1 }}>
                  <JobChip j={j} r={ready(j)} />
                </div>
              ))}
            </div>
          );
        })}
        {lanes.length === 0 && <p className="p-4 text-sm text-slate-500">No crews yet. Add crews in <Link className="underline" href="/app/settings/crews">Settings → Crews & pay</Link>.</p>}
      </div>

      {/* Mobile: day list */}
      <ol className="space-y-3 md:hidden" data-testid="day-list">
        {days.map((d) => {
          const dayJobs = jobs.filter((j) => j.scheduled_start! <= d && (j.scheduled_end ?? j.scheduled_start)! >= d);
          if (isWeekend(d) && dayJobs.length === 0) return null;
          const risk = weatherRisk(fc.get(d));
          return (
            <li key={d} className={cx("rounded-2xl bg-white p-4 ring-1", d === today ? "ring-2 ring-brand-500" : risk ? "ring-red-300" : "ring-slate-200")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={cx("font-display text-[15px] font-bold", d === today ? "text-brand-700" : "text-ink")}>{date(d, { weekday: "long", month: "short", day: "numeric" })}</p>
                <Weather f={fc.get(d)} />
              </div>
              {dayJobs.length === 0 ? <p className="text-xs text-slate-400">Nothing scheduled</p> : (
                <div className="space-y-1.5">{dayJobs.map((j) => <JobChip key={j.id} j={j} r={ready(j)} compact />)}</div>
              )}
            </li>
          );
        })}
      </ol>

      {!isCrewLead && (
        <Card className="mt-6" title={`Sold, waiting to be scheduled (${waiting.length})`}>
          {waiting.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waiting. Sold jobs without dates show up here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {waiting.map((j) => {
                const r = ready(j);
                return (
                  <li key={j.id}>
                    <Link href={`/app/jobs/${j.id}/production`} className="flex min-h-14 items-center justify-between gap-3 py-2.5 hover:text-brand-600">
                      <span className="min-w-0"><span className="block truncate text-[15px] font-semibold">{j.customers?.name}: {j.title}</span><span className="block truncate text-xs text-slate-500">{r.ready ? "Ready to lock" : `Waiting on ${r.blockers.map((b) => b.label.toLowerCase()).join(", ")}`}</span></span>
                      <span className="flex shrink-0 items-center gap-2"><ReadinessDots r={r} /><Badge tone={STAGE_TONE[j.stage]}>{STAGE_LABEL[j.stage]}</Badge></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
