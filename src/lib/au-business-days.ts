/**
 * Business-day maths for Australian statutory periods (cooling-off, ACL termination, notice windows).
 *
 * Dates are plain calendar dates ("YYYY-MM-DD") in the job's state. All arithmetic is done in UTC on
 * those calendar dates so the server's time zone can never shift a day.
 *
 * PUBLIC HOLIDAYS: only NATIONAL public holidays (observed in every state and territory) are built in:
 * New Year's Day, Australia Day, Good Friday, Easter Monday, Anzac Day, Christmas Day and Boxing Day,
 * with the Monday/Tuesday substitute days used when 1 Jan, 26 Jan, 25 Dec or 26 Dec fall on a weekend.
 * STATE-ONLY public holidays (King's Birthday, Labour Day, Melbourne Cup, Royal Queensland Show,
 * Easter Saturday/Sunday where gazetted, Anzac Day substitutes, Reconciliation Day, etc.) are NOT
 * included. Callers can pass them in `extraHolidays`. Until then, any period computed here can end one
 * business day too early if a state-only holiday falls inside it; the UI says so next to every date.
 */

export type IsoDate = string; // YYYY-MM-DD

const DAY = 86_400_000;

export function isIsoDate(v: unknown): v is IsoDate {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Calendar date ("YYYY-MM-DD") of a Date/timestamp in an IANA time zone (default Sydney). */
export function calendarDate(d: Date | string, timeZone = "Australia/Sydney"): IsoDate {
  if (isIsoDate(d)) return d;
  const v = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(v.getTime())) throw new Error(`Invalid date: ${String(d)}`);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
}

const toUtc = (iso: IsoDate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (t: number): IsoDate => new Date(t).toISOString().slice(0, 10);

export const addDays = (iso: IsoDate, n: number): IsoDate => fromUtc(toUtc(iso) + n * DAY);
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: IsoDate) => new Date(toUtc(iso)).getUTCDay();
const isWeekend = (iso: IsoDate) => weekday(iso) === 0 || weekday(iso) === 6;

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type Holiday = { date: IsoDate; name: string };

/** National public holidays for a year (see the file comment for what is NOT included). */
export function nationalPublicHolidays(year: number): Holiday[] {
  const taken = new Set<IsoDate>();
  const out: Holiday[] = [];
  const add = (date: IsoDate, name: string) => {
    taken.add(date);
    out.push({ date, name });
  };
  // A weekend holiday moves to the next weekday that isn't already a holiday (gives the usual
  // Christmas/Boxing Day Monday + Tuesday substitutes).
  const withSubstitute = (date: IsoDate, name: string) => {
    if (!isWeekend(date) && !taken.has(date)) return add(date, name);
    if (isWeekend(date)) add(date, name);
    let d = addDays(date, 1);
    while (isWeekend(d) || taken.has(d)) d = addDays(d, 1);
    add(d, `${name} (additional day)`);
  };
  withSubstitute(`${year}-01-01`, "New Year's Day");
  withSubstitute(`${year}-01-26`, "Australia Day");
  const easter = easterSunday(year);
  add(addDays(easter, -2), "Good Friday");
  add(addDays(easter, 1), "Easter Monday");
  add(`${year}-04-25`, "Anzac Day");
  withSubstitute(`${year}-12-25`, "Christmas Day");
  withSubstitute(`${year}-12-26`, "Boxing Day");
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const holidayCache = new Map<number, Set<IsoDate>>();
function nationalSet(year: number) {
  let s = holidayCache.get(year);
  if (!s) {
    s = new Set(nationalPublicHolidays(year).map((h) => h.date));
    holidayCache.set(year, s);
  }
  return s;
}

export type BusinessDayOptions = {
  /** NSW Home Building Act: 27, 28, 29, 30 and 31 December are not business days. */
  excludeDec27to31?: boolean;
  /** State-only public holidays to skip as well (YYYY-MM-DD). */
  extraHolidays?: readonly IsoDate[];
};

export function isPublicHoliday(iso: IsoDate, opts: BusinessDayOptions = {}) {
  return nationalSet(Number(iso.slice(0, 4))).has(iso) || Boolean(opts.extraHolidays?.includes(iso));
}

export function isBusinessDay(iso: IsoDate, opts: BusinessDayOptions = {}) {
  if (isWeekend(iso)) return false;
  if (isPublicHoliday(iso, opts)) return false;
  if (opts.excludeDec27to31 && iso.slice(5, 7) === "12" && Number(iso.slice(8)) >= 27) return false;
  return true;
}

/**
 * The Nth business day AFTER `from` (the start day itself is never counted, i.e. "clear" days).
 * Example: a cooling-off of "5 clear business days after receiving the contract" received on `from`
 * ends at the end of `addBusinessDays(from, 5)`.
 */
export function addBusinessDays(from: IsoDate, n: number, opts: BusinessDayOptions = {}): IsoDate {
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer");
  let d = from;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isBusinessDay(d, opts)) left--;
  }
  return d;
}

/** Business days strictly after `from` up to and including `to` (0 if `to` <= `from`). */
export function businessDaysBetween(from: IsoDate, to: IsoDate, opts: BusinessDayOptions = {}) {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusinessDay(d, opts)) n++;
  return n;
}

export const HOLIDAY_NOTE =
  "Counted without weekends and national public holidays. State-only public holidays (for example King's Birthday or Labour Day) are not counted yet: if one falls inside the period, it ends one business day later.";
