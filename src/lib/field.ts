/** Shared (client + server) constants for field capture, status actions and close-out. */

export const SLOPES = ["front", "rear", "left", "right", "garage", "other"] as const;
export type Slope = (typeof SLOPES)[number];

export const PHOTO_CATEGORIES = ["overview", "damage", "test_square", "decking", "progress", "completion", "delivery"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
/** All categories the DB accepts (field capture uses PHOTO_CATEGORIES). */
export const FILE_CATEGORIES = [...PHOTO_CATEGORIES, "document", "other"] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  overview: "Overview",
  damage: "Damage",
  test_square: "Test square",
  decking: "Decking",
  progress: "Progress",
  completion: "Completion",
  delivery: "Delivery",
  document: "Document",
  other: "Other",
};

export const SLOPE_LABEL: Record<string, string> = {
  front: "Front",
  rear: "Rear",
  left: "Left",
  right: "Right",
  garage: "Garage",
  other: "Other",
};

/** One-tap status actions (X3). `sms` builds the homeowner text; `{company}`/`{link}` are filled in. */
export const STATUS_ACTIONS = [
  { kind: "on_my_way", label: "On my way", sms: "{company}: we're on our way to your home now." },
  { kind: "materials_delivered", label: "Materials delivered", sms: "{company}: your roofing materials have been delivered." },
  { kind: "tear_off_started", label: "Tear-off started", sms: "{company}: our crew has started tearing off your old roof." },
  { kind: "dry_in", label: "Dry-in", sms: "{company}: your roof is dried in (underlayment on) and protected from the weather." },
  { kind: "completed", label: "Completed", sms: "{company}: your new roof is installed!" },
  { kind: "cleanup_verified", label: "Cleanup + magnet sweep done", sms: "{company}: cleanup and the magnetic nail sweep of your yard and driveway are done." },
] as const;
export type StatusKind = (typeof STATUS_ACTIONS)[number]["kind"] | "note";
export const STATUS_KINDS = [...STATUS_ACTIONS.map((a) => a.kind), "note"] as const;

export const EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(STATUS_ACTIONS.map((a) => [a.kind, a.label])),
  note: "Update",
  change_order_approved: "Change order approved",
  walkthrough_signed: "Final walkthrough signed",
  warranty_registered: "Warranty registered",
  permit_approved: "Permit approved",
};

export function statusSms(kind: string, company: string, link: string, note?: string | null) {
  const a = STATUS_ACTIONS.find((x) => x.kind === kind);
  const head = a ? a.sms.replace("{company}", company) : `${company}: update on your roof project${note ? "" : "."}`;
  const body = note ? `${head}${a ? " " : ": "}${note}` : head;
  return `${body} Track your project: ${link}`;
}

/** GAF-style registration window (days after install). */
export const WARRANTY_REGISTRATION_DAYS = 45;

export function warrantyDaysLeft(completedAt: string | null | undefined, now = new Date()) {
  if (!completedAt) return null;
  const due = new Date(completedAt).getTime() + WARRANTY_REGISTRATION_DAYS * 86400000;
  return Math.ceil((due - now.getTime()) / 86400000);
}
