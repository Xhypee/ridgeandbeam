/** Shared (client + server) constants for field capture, status actions and close-out. */

export const SLOPES = ["front", "rear", "left", "right", "garage", "other"] as const;
export type Slope = (typeof SLOPES)[number];

/**
 * Australian storm-damage documentation for the insurer's assessor, then build progress.
 * The DB also accepts the legacy US values ("test_square", "decking") so old photos still load.
 */
export const DAMAGE_CATEGORIES = ["broken_tiles", "ridge_capping", "sheet_damage", "hail_dents", "gutter_damage", "internal_water", "damage"] as const;
export const PHOTO_CATEGORIES = ["overview", ...DAMAGE_CATEGORIES, "decking", "progress", "completion", "delivery"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
/** All categories the DB accepts (field capture uses PHOTO_CATEGORIES). */
export const FILE_CATEGORIES = [...PHOTO_CATEGORIES, "document", "plans", "other", "test_square"] as const;

/** Photos of this category carry a count of broken / cracked tiles on that slope (job_files.test_square_hits). */
export const COUNT_CATEGORY = "broken_tiles";
export const isDamageCategory = (c: string | null | undefined) => (DAMAGE_CATEGORIES as readonly string[]).includes(c ?? "");

export const CATEGORY_LABEL: Record<string, string> = {
  overview: "Overview",
  broken_tiles: "Broken / cracked tiles",
  ridge_capping: "Ridge capping",
  sheet_damage: "Lifted / rusted sheets",
  hail_dents: "Hail dents (metal)",
  gutter_damage: "Gutters & downpipes",
  internal_water: "Water damage inside",
  damage: "Other damage",
  decking: "Battens / sarking",
  progress: "Progress",
  completion: "Completion",
  delivery: "Delivery",
  document: "Document",
  plans: "Plans",
  other: "Other",
  test_square: "Test square (old)",
};

/** What the assessor wants to see in each damage photo (shown under the category while capturing). */
export const CATEGORY_HINT: Record<string, string> = {
  overview: "Whole roof and each elevation, with the street number in one shot if you can.",
  broken_tiles: "Close-up of each broken or cracked tile, then one wider shot showing where it is. Count them per slope.",
  ridge_capping: "Dislodged, cracked or missing ridge capping and any loose bedding or pointing.",
  sheet_damage: "Lifted, loose or rusted sheets and flashings, and any missing screws.",
  hail_dents: "Dents on sheets, capping and gutters. Shoot at a low angle with a coin or tape for scale.",
  gutter_damage: "Dented, split or pulled-away gutters and downpipes.",
  internal_water: "Ceiling stains, wet insulation or water inside — note the room.",
  damage: "Anything else the storm damaged.",
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
  { kind: "tear_off_started", label: "Strip started", sms: "{company}: our crew has started stripping your old roof." },
  { kind: "dry_in", label: "Watertight", sms: "{company}: your roof is watertight again (sarking and new roof on) and protected from the weather." },
  { kind: "completed", label: "Roof complete", sms: "{company}: your new roof is on!" },
  { kind: "cleanup_verified", label: "Site clean-up done", sms: "{company}: the clean-up is done, including a sweep of your yard and driveway for screws and offcuts." },
] as const;
export type StatusKind = (typeof STATUS_ACTIONS)[number]["kind"] | "note";
export const STATUS_KINDS = [...STATUS_ACTIONS.map((a) => a.kind), "note"] as const;

export const EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(STATUS_ACTIONS.map((a) => [a.kind, a.label])),
  note: "Update",
  change_order_approved: "Change order approved",
  walkthrough_signed: "Final walkthrough signed",
  warranty_registered: "Warranty registered",
  permit_approved: "Council / building approval granted",
};

export function statusSms(kind: string, company: string, link: string, note?: string | null) {
  const a = STATUS_ACTIONS.find((x) => x.kind === kind);
  const head = a ? a.sms.replace("{company}", company) : `${company}: update on your roof project${note ? "" : "."}`;
  const body = note ? `${head}${a ? " " : ": "}${note}` : head;
  return `${body} Track your project: ${link}`;
}

/**
 * Office reminder to lodge the manufacturer's warranty (e.g. a COLORBOND / roof tile warranty) after install.
 * Our own follow-up window, not a manufacturer rule — check each manufacturer's terms.
 */
export const WARRANTY_REGISTRATION_DAYS = 30;

export function warrantyDaysLeft(completedAt: string | null | undefined, now = new Date()) {
  if (!completedAt) return null;
  const due = new Date(completedAt).getTime() + WARRANTY_REGISTRATION_DAYS * 86400000;
  return Math.ceil((due - now.getTime()) / 86400000);
}
