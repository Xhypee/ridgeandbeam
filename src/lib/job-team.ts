// Staff on a job (job_members). Pure, client-safe.
export const JOB_ROLES = ["sales", "office", "crew_lead", "crew", "subcontractor"] as const;
export type JobRole = (typeof JOB_ROLES)[number];
export const JOB_ROLE_LABEL: Record<JobRole, string> = { sales: "Sales", office: "Office", crew_lead: "Crew lead", crew: "Crew", subcontractor: "Subcontractor" };

/** A sensible role on a job from someone's role in the company. */
export function defaultJobRole(memberRole: string): JobRole {
  if (memberRole === "crew_lead") return "crew_lead";
  if (memberRole === "sales_rep") return "sales";
  if (memberRole === "owner" || memberRole === "admin") return "sales";
  return "office";
}

const PALETTE = ["#1f5f3f", "#7c3aed", "#2563eb", "#0891b2", "#b45309", "#be123c", "#0f766e", "#475569"];
/** Stable avatar colour per person. */
export function avatarColour(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
