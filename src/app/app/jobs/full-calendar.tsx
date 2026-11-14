"use client";

// The full calendar behind "See full calendar" when booking an inspection: one staff member's week (or month),
// with their inspections at their times and builds as all-day bars, plus every project they're on. Clicking a
// free half hour picks it for the booking.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { STAGE_LABEL } from "@/lib/format";
import { monthGrid, weekOf, type ScheduleItem, type StaffProject } from "@/lib/lead-steps";
import { getStaffProjects, getStaffSchedule } from "./lead-actions";

const START = 7, END = 18, ROW = 52; // 7 am – 6 pm, px per hour
const HOURS = Array.from({ length: END - START }, (_, i) => START + i);
const hourLabel = (h: number) => `${h > 12 ? h - 12 : h} ${h >= 12 ? "pm" : "am"}`;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const shortDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { ...o, timeZone: "UTC" });
const fmtRange = (a: string | null, b: string | null) => (a ? `${shortDay(a, { day: "numeric", month: "short" })}${b && b !== a ? ` – ${shortDay(b, { day: "numeric", month: "short" })}` : ""}` : null);
const X = "M6 6l12 12M18 6L6 18";
const Svg = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

export type FullCalendarProps = {
  people: { user_id: string; name: string }[];
  staff: string; day: string; time: string; today: string; tz: string; leadName: string;
  onPick: (p: { staff: string; day: string; time: string }) => void;
  onClose: () => void;
  load?: (staffId: string, from: string, to: string, tz: string) => Promise<ScheduleItem[]>;
  loadProjects?: (staffId: string) => Promise<StaffProject[]>;
};

export function FullCalendar({ people, staff: staff0, day: day0, time, today, tz, leadName, onPick, onClose, load = getStaffSchedule, loadProjects = getStaffProjects }: FullCalendarProps) {
  const [staff, setStaff] = useState(staff0);
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(day0);
  const [data, setData] = useState<{ key: string; items: ScheduleItem[] } | null>(null);
  const [projects, setProjects] = useState<{ staff: string; list: StaffProject[] } | null>(null);
  const week = useMemo(() => weekOf(anchor), [anchor]);
  const ym = { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) };
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym.y, ym.m]);
  const from = view === "week" ? week[0] : (grid.flat().find(Boolean) as string);
  const to = view === "week" ? week[6] : ([...grid.flat()].reverse().find(Boolean) as string);
  const key = `${staff}|${from}|${to}`;

  useEffect(() => {
    let live = true;
    load(staff, from, to, tz).then((items) => live && setData({ key, items })).catch(() => live && setData({ key, items: [] }));
    return () => { live = false; };
  }, [staff, from, to, tz, key, load]);
  useEffect(() => {
    let live = true;
    loadProjects(staff).then((list) => live && setProjects({ staff, list })).catch(() => live && setProjects({ staff, list: [] }));
    return () => { live = false; };
  }, [staff, loadProjects]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const items = useMemo(() => (data && data.key === key ? data.items : []), [data, key]);
  const loading = data?.key !== key;
  const byDay = useMemo(() => { const m = new Map<string, ScheduleItem[]>(); for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]); return m; }, [items]);
  const name = people.find((p) => p.user_id === staff)?.name ?? "Staff";
  const first = name.split(" ")[0];
  const list = projects?.staff === staff ? projects.list : null;
  const move = (n: number) => {
    const t = Date.parse(`${anchor}T12:00:00Z`);
    if (view === "week") setAnchor(new Date(t + n * 7 * 86400000).toISOString().slice(0, 10));
    else { const m = ym.m + n; const y = ym.y + (m < 1 ? -1 : m > 12 ? 1 : 0); setAnchor(`${y}-${String(((m + 11) % 12) + 1).padStart(2, "0")}-01`); }
  };
  const title = view === "week" ? `${shortDay(week[0], { day: "numeric", month: "short" })} – ${shortDay(week[6], { day: "numeric", month: "short", year: "numeric" })}` : shortDay(`${ym.y}-${String(ym.m).padStart(2, "0")}-15`, { month: "long", year: "numeric" });
  const pick = (d: string, min: number) => onPick({ staff, day: d, time: hhmm(min) });
  const [pickH, pickM] = time.split(":").map(Number);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal aria-label={`${name}'s calendar`} data-full-calendar onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[min(860px,92vh)] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        {/* Header: who, week/month, navigation */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Book {leadName}&rsquo;s inspection</p>
            <p className="font-display text-xl font-bold text-ink">{first}&rsquo;s calendar</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Staff">
            {people.map((p) => (
              <button key={p.user_id} type="button" role="radio" aria-checked={p.user_id === staff} onClick={() => setStaff(p.user_id)}
                className={cx("rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1", p.user_id === staff ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>{p.name.split(" ")[0]}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-0.5 text-[13px] font-semibold">
              {(["week", "month"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cx("rounded-lg px-3 py-1.5 capitalize", view === v ? "bg-white text-ink ring-1 ring-slate-200" : "text-slate-500")}>{v}</button>)}
            </div>
            <button type="button" onClick={() => setAnchor(today)} className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">Today</button>
            <button type="button" onClick={() => move(-1)} aria-label="Previous" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Svg d="M15 6l-6 6 6 6" /></button>
            <span className="min-w-[150px] text-center text-sm font-semibold text-ink">{title}</span>
            <button type="button" onClick={() => move(1)} aria-label="Next" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Svg d="M9 6l6 6-6 6" /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="ml-1 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"><Svg d={X} className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Calendar */}
          <div className={cx("no-scrollbar min-w-0 flex-1 overflow-auto", loading && "opacity-70")}>
            {view === "week" ? (
              <div className="min-w-[640px]">
                <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 bg-white">
                  <span />
                  {week.map((d) => {
                    const n = byDay.get(d)?.length ?? 0;
                    return (
                      <div key={d} className={cx("border-l border-slate-100 px-2 py-2 text-center", d === today && "bg-brand-50")}>
                        <p className="text-[11px] font-semibold uppercase text-slate-400">{shortDay(d, { weekday: "short" })}</p>
                        <p className={cx("text-lg font-bold leading-tight", d < today ? "text-slate-300" : "text-ink")}>{Number(d.slice(8))}</p>
                        <p className="text-[10px] text-slate-400">{n ? `${n} on` : "Free"}</p>
                      </div>
                    );
                  })}
                  {/* All-day: builds */}
                  <span className="border-t border-slate-100 py-1 pr-1 text-right text-[10px] text-slate-400">All day</span>
                  {week.map((d) => (
                    <div key={d} className="min-h-8 space-y-0.5 border-l border-t border-slate-100 p-0.5">
                      {(byDay.get(d) ?? []).filter((i) => i.kind === "build").map((b, k) => (
                        <Link key={k} href={b.jobId ? `/app/jobs?job=${b.jobId}` : "#"} title={b.label} className="block truncate rounded-md bg-violet-100 px-1.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-200">{b.label.replace(/^Build · /, "")}</Link>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
                  <div className="relative" style={{ height: HOURS.length * ROW }}>
                    {HOURS.map((h, i) => <span key={h} style={{ top: i === 0 ? 2 : i * ROW - 7 }} className="absolute right-2 text-[10px] leading-none text-slate-400">{hourLabel(h)}</span>)}
                  </div>
                  {week.map((d) => {
                    const insp = (byDay.get(d) ?? []).filter((i) => i.kind === "inspection" && i.minutes !== null);
                    return (
                      <div key={d} className={cx("relative border-l border-slate-100", d < today && "bg-slate-50/70")} style={{ height: HOURS.length * ROW }}>
                        {HOURS.flatMap((h) => [0, 30].map((m) => {
                          const min = h * 60 + m;
                          const busy = insp.some((i) => Math.abs((i.minutes as number) - min) < 60);
                          const off = d < today || busy;
                          return <button key={min} type="button" disabled={off} onClick={() => pick(d, min)} aria-label={`${d} ${hhmm(min)}`}
                            className={cx("block w-full border-t", m === 0 ? "border-slate-100" : "border-dashed border-slate-100/70", !off && "hover:bg-brand-50")} style={{ height: ROW / 2 }} />;
                        }))}
                        {insp.map((i, k) => (
                          <Link key={k} href={i.jobId ? `/app/jobs?job=${i.jobId}` : "#"} title={`${i.time} ${i.label}`}
                            className="absolute inset-x-1 overflow-hidden rounded-md bg-slate-200 px-1.5 py-1 text-[11px] leading-tight text-slate-800 ring-1 ring-white hover:bg-slate-300"
                            style={{ top: (((i.minutes as number) - START * 60) / 60) * ROW, height: ROW - 2 }}>
                            <b className="block truncate">{i.label.replace(/^Inspection · /, "")}</b>
                            <span className="block truncate text-slate-500">{i.time} · {STAGE_LABEL[i.stage ?? ""] ?? "Inspection"}</span>
                          </Link>
                        ))}
                        {d === day0 && (
                          <span className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-brand-500 bg-brand-50/80 px-1.5 py-1 text-[11px] font-bold leading-tight text-brand-700"
                            style={{ top: ((pickH * 60 + pickM - START * 60) / 60) * ROW, height: ROW - 2 }}>{leadName}<span className="block font-semibold">New inspection</span></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3">
                <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-slate-400">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w} className="py-1">{w}</span>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {grid.flat().map((d, i) => d ? (
                    <button key={d} type="button" onClick={() => { setAnchor(d); setView("week"); }} className={cx("flex min-h-[104px] flex-col rounded-lg p-1.5 text-left ring-1", d === today ? "bg-brand-50 ring-brand-300" : "bg-white ring-slate-200 hover:ring-slate-300")}>
                      <span className={cx("text-sm font-bold", d < today ? "text-slate-300" : "text-ink")}>{Number(d.slice(8))}</span>
                      {(byDay.get(d) ?? []).slice(0, 3).map((it, k) => <span key={k} className={cx("mt-0.5 truncate rounded px-1 py-0.5 text-[10px] font-semibold", it.kind === "build" ? "bg-violet-100 text-violet-800" : "bg-slate-200 text-slate-700")}>{it.time ? `${it.time.replace(":00", "")} ` : ""}{it.label.replace(/^(Inspection|Build) · /, "")}</span>)}
                      {(byDay.get(d)?.length ?? 0) > 3 && <span className="mt-0.5 text-[10px] text-slate-500">+{(byDay.get(d)?.length ?? 0) - 3} more</span>}
                    </button>
                  ) : <span key={i} />)}
                </div>
              </div>
            )}
          </div>

          {/* Projects this staff member is on */}
          <aside className="no-scrollbar hidden w-[300px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-4 md:block" data-staff-projects>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{first}&rsquo;s projects</p>
            <p className="mb-3 font-display text-lg font-bold text-ink">{list ? `On ${list.length} ${list.length === 1 ? "job" : "jobs"}` : "Loading…"}</p>
            <ul className="space-y-2">
              {(list ?? []).map((pj) => (
                <li key={pj.id}>
                  <Link href={`/app/jobs?job=${pj.id}`} className="block rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200 hover:ring-brand-400">
                    <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm text-ink">{pj.customer}</b><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{pj.role}</span></span>
                    <span className="block truncate text-xs text-slate-500">{[pj.title, pj.suburb].filter(Boolean).join(" · ")}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs"><span className="font-semibold text-brand-700">{STAGE_LABEL[pj.stage] ?? pj.stage}</span>
                      <span className="text-slate-500">{fmtRange(pj.start, pj.end) ?? (pj.inspection ? `Inspection ${new Date(pj.inspection).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: tz })}` : "")}</span></span>
                  </Link>
                </li>
              ))}
              {list && list.length === 0 && <li className="text-sm text-slate-500">Not on any open jobs.</li>}
            </ul>
          </aside>
        </div>
        <div className="flex items-center gap-4 border-t border-slate-200 px-5 py-2.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-200" />Inspection</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-100" />Build</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border-2 border-dashed border-brand-500" />This booking</span>
          <span className="ml-auto">Click a free half hour to book it</span>
        </div>
      </div>
    </div>
  );
}
