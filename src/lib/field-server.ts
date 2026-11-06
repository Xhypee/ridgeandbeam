import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEvent, ServerFile } from "@/components/field/types";
import type { Shape } from "@/lib/field-queue";

export const BUCKET = "job-files";

type FileRow = {
  id: string; client_id: string | null; kind: ServerFile["kind"]; storage_path: string; caption: string | null; category: string;
  slope: string | null; test_square_hits: number | null; shared_with_homeowner: boolean; taken_at: string | null; created_at: string;
  annotations: { shapes?: Shape[]; original_path?: string } | null;
};

/** Signs many storage paths at once; returns path -> url. Works with the user client (RLS) or adminClient (public pages). */
export async function signPaths(db: SupabaseClient, paths: (string | null | undefined)[], expiresIn = 60 * 60 * 6) {
  const uniq = [...new Set(paths.filter(Boolean) as string[])];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(uniq, expiresIn);
  for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  return out;
}

/** Job photos/voice notes + events with signed URLs (for the Field tab and photo report). */
export async function loadFieldData(db: SupabaseClient, jobId: string) {
  const [{ data: fileRows }, { data: eventRows }] = await Promise.all([
    db.from("job_files").select("id, client_id, kind, storage_path, caption, category, slope, test_square_hits, shared_with_homeowner, taken_at, created_at, annotations")
      .eq("job_id", jobId).in("kind", ["photo", "voice"]).order("taken_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000),
    db.from("job_events").select("id, client_id, kind, note, created_at, created_by_name, notified, visible_to_homeowner, file_id").eq("job_id", jobId)
      .order("created_at", { ascending: false }).limit(200),
  ]);
  const rows = (fileRows ?? []) as FileRow[];
  const urls = await signPaths(db, [...rows.map((r) => r.storage_path), ...rows.map((r) => r.annotations?.original_path)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const files: ServerFile[] = rows.map((r) => ({
    id: r.id, client_id: r.client_id, kind: r.kind, url: urls.get(r.storage_path) ?? null,
    original_url: r.annotations?.original_path ? urls.get(r.annotations.original_path) ?? null : null,
    caption: r.caption, category: r.category, slope: r.slope, hits: r.test_square_hits, shared: r.shared_with_homeowner,
    taken_at: r.taken_at, created_at: r.created_at, shapes: r.annotations?.shapes ?? null,
  }));
  const events: ServerEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id, client_id: e.client_id, kind: e.kind, note: e.note, created_at: e.created_at, created_by_name: e.created_by_name,
    notified: e.notified, visible: e.visible_to_homeowner,
    photo_url: e.file_id && byId.get(e.file_id) ? urls.get(byId.get(e.file_id)!.storage_path) ?? null : null,
  }));
  return { files, events };
}
