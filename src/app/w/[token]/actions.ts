"use server";

import { adminClient, hasAdminKey } from "@/lib/admin";
import { anonClient } from "@/lib/public";

export type ProblemResult = { ok?: boolean; error?: string };

/**
 * Crew portal "Problem / missing material". The token-keyed security-definer RPC checks that the job
 * belongs to this crew and writes the job note + notification. An optional photo is stored with the
 * service role, scoped to the org/job the RPC resolved from the token.
 */
export async function reportProblem(fd: FormData): Promise<ProblemResult> {
  const token = String(fd.get("token") ?? "");
  const jobId = String(fd.get("job_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(jobId)) return { error: "Unknown job." };
  const { data, error } = await anonClient().rpc("report_crew_problem", {
    p_token: token,
    p_job: jobId,
    p_kind: String(fd.get("kind") ?? "other"),
    p_message: String(fd.get("message") ?? "").slice(0, 2000),
    p_name: String(fd.get("name") ?? "").slice(0, 80),
  });
  if (error || !data) return { error: error?.message ?? "Could not send." };
  const res = data as { org_id: string; job_id: string; note_id: string; label: string };

  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0 && hasAdminKey()) {
    if (photo.size > 8 * 1024 * 1024 || !photo.type.startsWith("image/")) return { ok: true, error: "Report sent, but the photo was too large or not an image." };
    const admin = adminClient();
    const path = `${res.org_id}/${res.job_id}/crew-${crypto.randomUUID()}.jpg`;
    const up = await admin.storage.from("job-files").upload(path, photo, { contentType: photo.type, upsert: false });
    if (!up.error) {
      await admin.from("job_files").insert({
        org_id: res.org_id, job_id: res.job_id, kind: "photo", storage_path: path, mime_type: photo.type, size_bytes: photo.size,
        caption: `Crew report: ${res.label}`, category: "other", taken_at: new Date().toISOString(),
      });
    }
  }
  return { ok: true };
}
