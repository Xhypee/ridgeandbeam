// Australian job types for the jobs.job_type enum (values added in 20261110000600_au_production.sql).
// The DB keeps the older values ("replacement", "new_construction", "inspection") so existing jobs still load.

export const AU_JOB_TYPES = ["replacement", "tile_to_metal", "restoration", "repair", "gutters", "asbestos", "new_construction", "inspection", "other"] as const;
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
  other: "Other",
};

export const jobTypeLabel = (t: string | null | undefined) => AU_JOB_TYPE_LABEL[t as AuJobType] ?? (t ? t.replace(/_/g, " ") : "");
