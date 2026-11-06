const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number | string | null | undefined) => usd.format(Number(n) || 0);

export function date(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!d) return "";
  // Plain dates (YYYY-MM-DD) are calendar days, so don't let the timezone shift them.
  const v = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return v.toLocaleDateString("en-US", opts);
}

export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  inspection: "Inspection",
  estimate_sent: "Estimate sent",
  sold: "Sold",
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
export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
