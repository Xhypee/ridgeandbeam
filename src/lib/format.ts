import { AU_STATE_TZ, asAuState } from "./au";

const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export const money = (n: number | string | null | undefined) => usd.format(Number(n) || 0);

export function date(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!d) return "";
  // Plain dates (YYYY-MM-DD) are calendar days, so don't let the timezone shift them.
  const v = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return v.toLocaleDateString("en-AU", opts);
}

export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  inspection: "Inspection",
  estimate_sent: "Estimate sent",
  sold: "Signed & Prepping",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  paid: "Paid",
  lost: "Lost",
};

export const STAGE_TONE: Record<string, Tone> = {
  lead: "slate",
  inspection: "violet",
  estimate_sent: "amber",
  sold: "blue",
  scheduled: "cyan",
  in_progress: "orange",
  completed: "teal",
  paid: "green",
  lost: "red",
};

export const STATUS_TONE: Record<string, Tone> = {
  draft: "slate",
  sent: "amber",
  accepted: "green",
  declined: "red",
  partial: "blue",
  paid: "green",
  void: "red",
};

export type Tone = "slate" | "violet" | "amber" | "blue" | "cyan" | "orange" | "teal" | "green" | "red";

/** ISO date (YYYY-MM-DD) in local time. */
/**
 * Calendar date (YYYY-MM-DD) of `d` in an Australian time zone (default Sydney/Melbourne/Canberra).
 * Servers run in UTC, so using local getters would put "today" a day behind each morning in Australia.
 * Pass the business's zone (AU_STATE_TZ[state]) or use orgToday() when the state is known.
 */
export function isoDate(d: Date, timeZone = "Australia/Sydney") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Add N business days (Mon-Fri; holidays not considered) to a date. */
export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export function daysSince(iso: string | null | undefined, now = new Date()) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
}

/** Today's date (YYYY-MM-DD) in the business's state time zone; servers run in UTC. */
export function orgToday(state: string | null | undefined, now = new Date()) {
  const tz = AU_STATE_TZ[asAuState(state) ?? "NSW"];
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
