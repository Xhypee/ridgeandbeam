// New-lead sidebar helpers: inspection times in the job's own timezone, lost reasons, call attempts.
// Pure (no DB) so they're unit-tested.

export const LOST_REASONS = [
  { key: "price", label: "Too expensive" },
  { key: "competitor", label: "Went with someone else" },
  { key: "not_ready", label: "Not ready yet" },
  { key: "no_response", label: "Couldn't reach them" },
  { key: "out_of_area", label: "Outside our area" },
  { key: "not_a_fit", label: "Not work we do" },
  { key: "other", label: "Other" },
] as const;
export type LostReason = (typeof LOST_REASONS)[number]["key"];
export const LOST_REASON_LABEL: Record<string, string> = Object.fromEntries(LOST_REASONS.map((r) => [r.key, r.label]));

/** Minutes east of UTC that `tz` is at the instant `at` (e.g. +600 for Brisbane, +660 for Sydney in summer). */
function offsetMinutes(at: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at.getTime()) / 60000);
}

/** "2026-11-18" + "09:00" on a wall clock in `tz` → the UTC instant (handles daylight saving). Null if malformed. */
export function localToUtc(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  if (Number.isNaN(guess)) return null;
  // Two passes so a time just after a DST change lands on the right offset.
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60000;
  utc = guess - offsetMinutes(new Date(utc), tz) * 60000;
  return new Date(utc);
}

/** "Tue 18 Nov, 9:00 am" in the job's timezone. */
export function inspectionLabel(iso: string, tz: string): string {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { ...o, timeZone: tz });
  const day = `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
  return `${day}, ${time}`;
}

/** Calendar date (YYYY-MM-DD) in `tz`, `days` from `now`. */
export function dateIn(tz: string, days = 0, now = new Date()): string {
  return new Date(now.getTime() + days * 86400000).toLocaleDateString("en-CA", { timeZone: tz });
}

/** Half-hour inspection slots 7:00 am to 5:00 pm, as value ("07:30") + label ("7:30 am"). */
export const INSPECTION_TIMES = Array.from({ length: 21 }, (_, i) => {
  const h = 7 + Math.floor(i / 2), m = i % 2 ? 30 : 0;
  const value = `${String(h).padStart(2, "0")}:${m ? "30" : "00"}`;
  return { value, label: `${h > 12 ? h - 12 : h}:${m ? "30" : "00"} ${h >= 12 ? "pm" : "am"}` };
});

/** The text a homeowner gets when the inspection is booked. */
export function inspectionSms(o: { first: string; when: string; business: string; who?: string | null }) {
  return `Hi ${o.first}, it's ${o.who ? `${o.who} from ` : ""}${o.business}. You're booked in for a roof inspection on ${o.when}. Reply to this text if you need to change the time.`;
}

/** Monday-first month grid for the booking calendar: weeks of "YYYY-MM-DD" (null = padding). month is 1–12. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** One thing on a staff member's schedule, already in the job's timezone. */
export type ScheduleItem = { date: string; time: string | null; minutes: number | null; kind: "inspection" | "build"; label: string };

/** Does a new inspection at `time` ("HH:MM") clash with one already booked that day (within an hour)? */
export function clashAt(items: ScheduleItem[], date: string, time: string): ScheduleItem | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const at = Number(m[1]) * 60 + Number(m[2]);
  return items.find((i) => i.date === date && i.kind === "inspection" && i.minutes !== null && Math.abs(i.minutes - at) < 60) ?? null;
}
