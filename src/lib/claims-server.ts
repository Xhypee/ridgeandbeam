import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimStage, Endorsement, PolicyType, SupplementStatus } from "./claims";

export type Claim = {
  id: string;
  org_id: string;
  job_id: string;
  carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  policy_type: PolicyType;
  date_of_loss: string | null;
  cause_of_loss: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
  adjuster_meeting_at: string | null;
  rcv_amount: number;
  depreciation_amount: number;
  deductible: number;
  o_and_p_included: boolean;
  mortgagee_name: string | null;
  mortgage_loan_number: string | null;
  loss_draft_contact: string | null;
  stage: ClaimStage;
  stage_changed_at: string;
  notes: string | null;
  created_at: string;
};

export type ClaimCheck = {
  id: string;
  claim_id: string;
  kind: "acv" | "depreciation" | "supplement" | "deductible" | "other";
  payer: "carrier" | "homeowner" | "mortgagee";
  label: string | null;
  expected_amount: number;
  received_amount: number;
  received_on: string | null;
  check_number: string | null;
  endorsement: Endorsement;
  supplement_id: string | null;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
};

export type ClaimDocument = { id: string; claim_id: string; doc_type: string; status: "missing" | "ready" | "sent" | "accepted"; file_id: string | null; sent_on: string | null; notes: string | null };

export type Supplement = {
  id: string;
  claim_id: string;
  round: number;
  status: SupplementStatus;
  submitted_on: string | null;
  responded_on: string | null;
  requested_amount: number;
  approved_amount: number;
  carrier_response: string | null;
  next_follow_up_on: string | null;
  follow_up_count: number;
  last_followed_up_at: string | null;
  notes: string | null;
  created_at: string;
};

export type SupplementItem = {
  id: string;
  supplement_id: string;
  position: number;
  description: string;
  xact_code: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  code_citation: string | null;
  justification: string | null;
  file_ids: string[];
  status: "requested" | "approved" | "denied";
  approved_amount: number;
};

export type JobFile = { id: string; kind: string; storage_path: string; caption: string | null; category: string; mime_type: string | null; created_at: string };

export async function getClaimForJob(supabase: SupabaseClient, jobId: string): Promise<Claim | null> {
  const { data } = await supabase.from("claims").select("*").eq("job_id", jobId).maybeSingle();
  return (data as Claim | null) ?? null;
}

/** Job files plus short-lived signed URLs for photos (RLS on storage checks org membership). */
export async function jobFilesWithUrls(supabase: SupabaseClient, jobId: string, opts: { photosOnly?: boolean; ids?: string[] } = {}) {
  let q = supabase.from("job_files").select("id, kind, storage_path, caption, category, mime_type, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300);
  if (opts.photosOnly) q = q.eq("kind", "photo");
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const files = (data ?? []) as JobFile[];
  const photos = files.filter((f) => f.kind === "photo");
  const urls = new Map<string, string>();
  if (photos.length) {
    const { data: signed } = await supabase.storage.from("job-files").createSignedUrls(photos.map((p) => p.storage_path), 3600);
    for (const s of signed ?? []) if (s.signedUrl && s.path) urls.set(s.path, s.signedUrl);
  }
  return files.map((f) => ({ ...f, url: urls.get(f.storage_path) ?? null }));
}
export type JobFileWithUrl = Awaited<ReturnType<typeof jobFilesWithUrls>>[number];
