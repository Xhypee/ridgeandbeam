// State notices on quotes (licence, cooling-off, home warranty insurance, deposits, ACL door-knock rules…),
// from the rules engine in src/lib/au-rules.ts. The notices shown before signing are frozen into
// estimates.legal_notices at acceptance, so a signed quote keeps the wording the homeowner saw.
import { stateNoticesFor, type BusinessDetails } from "@/components/state-notices";
import { asAuState, type AuState } from "./au";
import { auJobTypeFrom, isDoorKnockSource, roofSystemFrom } from "./au-rules";

export type Notice = { id: string; title: string; text: string; citation?: string; conspicuous?: boolean; sourceUrl?: string; wording?: string; kind?: string; verify?: string; verifiedOn?: string };

/** Facts from Jobs → Compliance → "About this job" (job_compliance_profiles); null fields = not known. */
export type ComplianceProfile = {
  roof_system?: string | null; au_job_type?: string | null; owner_occupier?: boolean | null; existing_house?: boolean | null;
  building_approval_required?: boolean | null; built_before_1990?: boolean | null; door_knock_sale?: boolean | null;
  urgent_work?: boolean | null; paint_or_coat_only?: boolean | null; mixed_work?: boolean | null; subcontract?: boolean | null;
  disaster_emergency_repair?: boolean | null;
};

export type NoticeContext = {
  /** Contract price incl. GST. */
  total: number;
  isInsurance?: boolean;
  contractDate?: string | Date | null;
  roofMaterial?: string | null;
  jobType?: string | null;
  leadSource?: string | null;
  profile?: ComplianceProfile | null;
  business?: BusinessDetails;
};
export type NoticeSnapshot = Notice & { state: string | null };

export type ResolvedState = { state: AuState | null; source: "job" | "customer" | "company" | "none" };

/** The state whose rules apply to a job: the job's state, else the customer's, else the company's. */
export function resolveJobState(jobState?: string | null, customerState?: string | null, orgState?: string | null): ResolvedState {
  const j = asAuState(jobState);
  if (j) return { state: j, source: "job" };
  const c = asAuState(customerState);
  if (c) return { state: c, source: "customer" };
  const o = asAuState(orgState);
  if (o) return { state: o, source: "company" };
  return { state: null, source: "none" };
}

const opt = (v: boolean | null | undefined) => (v == null ? undefined : v);

/** Notices required on a quote for this job's state (empty when the state is unknown). */
export function requiredNotices(state: AuState | null, ctx: NoticeContext): Notice[] {
  if (!state) return [];
  const p = ctx.profile ?? {};
  return stateNoticesFor({
    state,
    contractValueIncGst: Math.max(0, Number(ctx.total) || 0),
    contractDate: ctx.contractDate ?? new Date(),
    roofSystem: roofSystemFrom(p.roof_system ?? ctx.roofMaterial),
    jobType: auJobTypeFrom(p.au_job_type ?? ctx.jobType),
    existingHouse: p.existing_house ?? true,
    ownerOccupier: opt(p.owner_occupier),
    buildingApprovalRequired: opt(p.building_approval_required),
    builtBefore1990: opt(p.built_before_1990),
    doorKnockSale: p.door_knock_sale ?? isDoorKnockSource(ctx.leadSource),
    urgentWork: opt(p.urgent_work),
    paintOrCoatOnly: opt(p.paint_or_coat_only),
    mixedWork: opt(p.mixed_work),
    subcontract: opt(p.subcontract),
    disasterEmergencyRepair: opt(p.disaster_emergency_repair),
    business: ctx.business,
  });
}

export const noticeSnapshot = (state: string | null, notices: Notice[]): NoticeSnapshot[] => notices.map((n) => ({ ...n, state }));
