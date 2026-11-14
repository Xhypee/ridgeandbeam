"use client";

// Book the inspection: who's going, a small month calendar showing how busy they are (dots), that day's
// schedule for them, the time, and a clash warning. Posts staff_id, date (YYYY-MM-DD) and time (HH:MM).
import { useEffect, useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { clashAt, INSPECTION_TIMES, monthGrid, type ScheduleItem, type StaffProject } from "@/lib/lead-steps";
import { FullCalendar } from "./full-calendar";
import { bookInspection, getStaffSchedule } from "./lead-actions";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const CAL = "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5";
const Chev = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

export function BookingCalendar({ jobId, first, phone, people, defaultStaff, meId, today, suggested, tz, load = getStaffSchedule, loadProjects }: {
  jobId: string; first: string; phone: string | null; people: { user_id: string; name: string }[]; defaultStaff: string; meId: string;
  today: string; suggested: string; tz: string; load?: (staffId: string, from: string, to: string, tz: string) => Promise<ScheduleItem[]>;
  loadProjects?: (staffId: string) => Promise<StaffProject[]>;
}) {
  const [full, setFull] = useState(false);
  const [staff, setStaff] = useState(defaultStaff);
  const [day, setDay] = useState(suggested);
  const [time, setTime] = useState("09:00");
  const [ym, setYm] = useState(() => ({ y: Number(suggested.slice(0, 4)), m: Number(suggested.slice(5, 7)) }));
  const [sched, setSched] = useState<{ key: string; items: ScheduleItem[] } | null>(null);
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const from = grid.flat().find(Boolean)!, to = [...grid.flat()].reverse().find(Boolean)!;
  const key = `${staff}|${from}`;

  useEffect(() => {
    let live = true;
    load(staff, from, to, tz).then((items) => { if (live) setSched({ key, items }); }).catch(() => { if (live) setSched({ key, items: [] }); });
    return () => { live = false; };
  }, [staff, from, to, tz, key, load]);

  const loading = sched?.key !== key;
  const items = useMemo(() => (sched && sched.key === key ? sched.items : []), [sched, key]);
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);
  const dayItems = byDay.get(day) ?? [];
  const clash = clashAt(items, day, time);
  const who = people.find((p) => p.user_id === staff)?.name.split(" ")[0] ?? "them";
  const monthName = new Date(Date.UTC(ym.y, ym.m - 1, 15)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayName = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const step = (d: number) => setYm(({ y, m }) => { const n = m + d; return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }; });
  const canPrev = `${ym.y}-${String(ym.m).padStart(2, "0")}` > today.slice(0, 7);

  return (
    <ActionForm action={bookInspection} className="space-y-3">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="date" value={day} />
      <input type="hidden" name="time" value={time} />

      <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Who&rsquo;s going</span>
        <select name="staff_id" value={staff} onChange={(e) => setStaff(e.target.value)} className="h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500">
          {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.user_id === meId ? `${p.name} (me)` : p.name}</option>)}
        </select>
      </label>

      {full && (
        <FullCalendar people={people} staff={staff} day={day} time={time} today={today} tz={tz} leadName={first} load={load} loadProjects={loadProjects}
          onClose={() => setFull(false)}
          onPick={(pk) => { setStaff(pk.staff); setDay(pk.day); setTime(pk.time); setYm({ y: Number(pk.day.slice(0, 4)), m: Number(pk.day.slice(5, 7)) }); setFull(false); }} />
      )}

      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200" data-booking-calendar>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex w-[66px] items-center"><button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Chev d="M15 6l-6 6 6 6" /></button></span>
          <p className="text-sm font-semibold text-ink">{monthName}</p>
          <span className="flex items-center gap-0.5">
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Chev d="M9 6l6 6-6 6" /></button>
            <button type="button" onClick={() => setFull(true)} data-open-full-calendar aria-label={`${who}'s full calendar and projects`}
              className="group relative grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-ink">
              <Chev d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
              <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{who}&rsquo;s full calendar and projects</span>
            </button>
          </span>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">{WEEK.map((w, i) => <span key={i} className="py-1">{w}</span>)}</div>
        <div className={cx("grid grid-cols-7 gap-y-0.5 text-center", loading && "opacity-60")}>
          {grid.flat().map((d, i) => {
            if (!d) return <span key={i} />;
            const past = d < today, sel = d === day, n = byDay.get(d)?.length ?? 0, weekend = i % 7 >= 5;
            return (
              <button key={d} type="button" disabled={past} onClick={() => setDay(d)} aria-pressed={sel} aria-label={`${d}${n ? `, ${n} booked` : ""}`}
                className={cx("relative mx-auto grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums",
                  sel ? "bg-brand-500 font-bold text-white" : past ? "text-slate-300" : weekend ? "text-slate-400 hover:bg-slate-100" : "text-ink hover:bg-slate-100",
                  d === today && !sel && "ring-1 ring-brand-400")}>
                {Number(d.slice(8))}
                {n > 0 && <span className={cx("absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5")} aria-hidden>{Array.from({ length: Math.min(n, 3) }, (_, k) => <span key={k} className={cx("h-1 w-1 rounded-full", sel ? "bg-white" : "bg-amber-500")} />)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200" data-booking-day>
        <p className="text-xs font-semibold text-slate-500">{who}&rsquo;s {dayName}</p>
        {loading ? <p className="mt-1 text-sm text-slate-400">Loading…</p>
          : dayItems.length === 0 ? <p className="mt-1 text-sm text-slate-600">Nothing booked. Free all day.</p>
          : <ul className="mt-1 space-y-1">{dayItems.map((it, k) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className={cx("w-16 shrink-0 text-xs font-semibold tabular-nums", it.kind === "build" ? "text-violet-700" : "text-ink")}>{it.time ?? "All day"}</span>
                <span className="min-w-0 truncate text-slate-700">{it.label}</span>
              </li>
            ))}</ul>}
      </div>

      <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Time</span>
        <select value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full rounded-xl bg-white px-3 text-sm text-ink ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500">
          {INSPECTION_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      {clash && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-booking-clash>{who} already has {clash.label.replace(/^Inspection · /, "an inspection with ")} at {clash.time}.</p>}

      {phone && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="text_customer" defaultChecked className="h-4 w-4 accent-brand-500" />Text {first} the time
        </label>
      )}
      <SubmitButton className="min-h-11 w-full gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={CAL} /></svg>Book inspection</SubmitButton>
    </ActionForm>
  );
}
