import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAuState, AU_STATE_TZ, type AuState } from "./au";
import { calendarDate } from "./au-business-days";
import { auJobTypeFrom, isDoorKnockSource, roofSystemFrom, rulesFor, type AuJobType, type RoofSystem, type RuleInput, type RulesResult } from "./au-rules";
import { acceptedEstimateTotal } from "./estimate-totals";
import { buildChecklist, type ChecklistItem, type StoredTick } from "./job-compliance";
import type { Organization } from "./types";

export type ComplianceProfile = {
  roof_system: RoofSystem | null;
  au_job_type: AuJobType | null;
  owner_occupier: boolean;
  existing_house: boolean;
  building_approval_required: boolean | null;
  built_before_1990: boolean | null;
  door_knock_sale: boolean | null;
  urgent_work: boolean;
  paint_or_coat_only: boolean;
  mixed_work: boolean;
  subcontract: boolean;
  disaster_emergency_repair: boolean;
  contract_copy_given_on: string | null;
};

export const DEFAULT_PROFILE: ComplianceProfile = {
  roof_system: null, au_job_type: null, owner_occupier: true, existing_house: true, building_approval_required: null, built_before_1990: null,
  door_knock_sale: null, urgent_work: false, paint_or_coat_only: false, mixed_work: false, subcontract: false, disaster_emergency_repair: false, contract_copy_given_on: null,
};

export type JobFileLite = { id: string; kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null; created_at: string; url?: string | null };

export type JobCompliance = {
  job: { id: string; org_id: string; title: string; state: string | null; job_type: string; roof_material: string | null; lead_source: string | null; permit_status: string | null; customer_name: string };
  state: AuState | null;
  stateSource: "job" | "customer" | "company" | "none";
  profile: ComplianceProfile;
  hasProfile: boolean;
  roofSystem: RoofSystem;
  jobType: AuJobType;
  doorKnock: boolean;
  value: number | null;
  valueSource: "accepted" | "latest" | "none";
  signedAt: string | null;
  contractDate: string;
  input: RuleInput | null;
  rules: RulesResult | null;
  items: ChecklistItem[];
  ticks: StoredTick[];
  files: JobFileLite[];
  licenceNumber: string | null;
};

/** Everything the compliance page (and other screens) need for one job. RLS-scoped via the caller's client. */
export async function loadJobCompliance(supabase: SupabaseClient, org: Organization, jobId: string, now = new Date()): Promise<JobCompliance | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, title, state, job_type, roof_material, lead_source, permit_status, customers(name, state)")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;
  const customer = job.customers as unknown as { name: string; state: string | null } | null;

  const [{ data: prof }, { data: ticks }, { data: files }, accepted, { data: latest }] = await Promise.all([
    supabase.from("job_compliance_profiles").select("*").eq("job_id", jobId).maybeSingle(),
    supabase.from("job_compliance_items").select("item_key, status, note, reference, file_id, updated_at, updated_by_name").eq("job_id", jobId),
    supabase.from("job_files").select("id, kind, category, caption, storage_path, mime_type, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(200),
    acceptedEstimateTotal(supabase, jobId),
    supabase.from("estimates").select("id, accepted_at, status, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
  ]);

  const j = asAuState(job.state), c = asAuState(customer?.state), o = asAuState(org.state);
  const state = j ?? c ?? o;
  const stateSource = j ? "job" : c ? "customer" : o ? "company" : "none";
  const profile: ComplianceProfile = prof ? { ...DEFAULT_PROFILE, ...(prof as Partial<ComplianceProfile>) } : DEFAULT_PROFILE;
  const roofSystem = profile.roof_system ?? roofSystemFrom(job.roof_material);
  const jobType = profile.au_job_type ?? auJobTypeFrom(job.job_type);
  const doorKnock = profile.door_knock_sale ?? isDoorKnockSource(job.lead_source);

  let value: number | null = null;
  let valueSource: JobCompliance["valueSource"] = "none";
  const acceptedRow = (latest ?? []).find((e) => e.status === "accepted" && e.accepted_at);
  const signedAt = acceptedRow?.accepted_at ?? null;
  if (accepted) { value = accepted.total; valueSource = "accepted"; }
  else if (latest?.length) {
    const { data: t } = await supabase.from("estimate_totals").select("total").eq("estimate_id", latest[0].id).maybeSingle();
    if (t) { value = Number(t.total); valueSource = "latest"; }
  }
  const tz = AU_STATE_TZ[state ?? "NSW"];
  const contractDate = signedAt ? calendarDate(signedAt, tz) : calendarDate(now, tz);

  const input: RuleInput | null = state && value !== null ? {
    contractValueIncGst: value, contractDate, roofSystem, jobType, existingHouse: profile.existing_house, doorKnockSale: doorKnock,
    ownerOccupier: profile.owner_occupier, buildingApprovalRequired: profile.building_approval_required ?? undefined,
    urgentWork: profile.urgent_work, paintOrCoatOnly: profile.paint_or_coat_only, mixedWork: profile.mixed_work, subcontract: profile.subcontract,
    disasterEmergencyRepair: profile.disaster_emergency_repair, builtBefore1990: profile.built_before_1990 ?? undefined,
  } : null;
  const rules = input && state ? rulesFor(state, input) : null;
  const licenceNumber = state ? org.licences?.[state]?.number?.trim() || null : null;
  const stored = (ticks ?? []) as StoredTick[];
  const items = rules ? buildChecklist({
    rules, licenceNumber, signedAt, copyGivenOn: profile.contract_copy_given_on, permitStatus: job.permit_status,
    buildingApprovalRequired: profile.building_approval_required, builtBefore1990: profile.built_before_1990, doorKnock,
    disasterEmergencyRepair: profile.disaster_emergency_repair, jobType, stored, today: calendarDate(now, tz),
  }) : [];

  // Signed links for evidence files that are linked to a tick.
  const fileRows = (files ?? []) as JobFileLite[];
  const linked = new Set(stored.map((s) => s.file_id).filter(Boolean) as string[]);
  const toSign = fileRows.filter((f) => linked.has(f.id)).map((f) => f.storage_path);
  if (toSign.length) {
    const { data: signed } = await supabase.storage.from("job-files").createSignedUrls(toSign, 3600);
    const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const f of fileRows) f.url = urls.get(f.storage_path) ?? null;
  }

  return {
    job: { id: job.id, org_id: job.org_id, title: job.title, state: job.state, job_type: job.job_type, roof_material: job.roof_material, lead_source: job.lead_source, permit_status: job.permit_status, customer_name: customer?.name ?? "" },
    state, stateSource, profile, hasProfile: Boolean(prof), roofSystem, jobType, doorKnock, value, valueSource, signedAt, contractDate, input, rules, items, ticks: stored, files: fileRows, licenceNumber,
  };
}
