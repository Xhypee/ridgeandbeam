// Australian job types for the jobs.job_type enum (values added in 20261110000600_au_production.sql).
// The DB keeps the older values ("replacement", "new_construction", "inspection") so existing jobs still load.

export const AU_JOB_TYPES = ["replacement", "tile_to_metal", "restoration", "repair", "gutters", "asbestos", "new_construction", "inspection", "make_safe", "add_on", "maintenance", "other"] as const;
export type AuJobType = (typeof AU_JOB_TYPES)[number];

export const AU_JOB_TYPE_LABEL: Record<AuJobType, string> = {
  replacement: "Re-roof",
  tile_to_metal: "Tile-to-metal re-roof",
  restoration: "Roof restoration",
  repair: "Repair / leak",
  gutters: "Gutters & downpipes",
  asbestos: "Asbestos roof replacement",
  new_construction: "New build",
  inspection: "Inspection / report",
  make_safe: "Storm / make-safe",
  add_on: "Skylights, vents & add-ons",
  maintenance: "Maintenance",
  other: "Other",
};

/** New lead "What do they need?": one tap, a word or two each. */
export const JOB_CARDS: { type: AuJobType; title: string; hint: string }[] = [
  { type: "replacement", title: "Re-roof", hint: "Full replacement" },
  { type: "new_construction", title: "New roof", hint: "From plans" },
  { type: "repair", title: "Repair", hint: "Leaks, tiles" },
  { type: "restoration", title: "Restoration", hint: "Clean, re-point, coat" },
  { type: "gutters", title: "Gutters", hint: "Gutters, downpipes" },
  { type: "make_safe", title: "Make-safe", hint: "Storm, tarping" },
  { type: "inspection", title: "Inspection", hint: "Reports" },
  { type: "asbestos", title: "Asbestos", hint: "Fibro roofs" },
  { type: "add_on", title: "Add-ons", hint: "Skylights, vents" },
  { type: "maintenance", title: "Maintenance", hint: "Cleaning, checks" },
];

export const jobTypeLabel = (t: string | null | undefined) => AU_JOB_TYPE_LABEL[t as AuJobType] ?? (t ? t.replace(/_/g, " ") : "");
