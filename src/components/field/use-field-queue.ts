"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { backoffMs, newClientId, queue, type QueueItem } from "@/lib/field-queue";
import { postStatusEvent } from "@/app/app/jobs/[id]/field/actions";

const BUCKET = "job-files";

async function uploadOne(item: QueueItem): Promise<void> {
  const sb = createClient();
  const { data: sess } = await sb.auth.getSession();
  const userId = sess.session?.user.id ?? null;
  if (!sess.session) throw new Error("Signed out — sign in again to upload");
  const dir = `${item.orgId}/${item.jobId}`;

  if (item.op === "file") {
    if (!item.blob) throw new Error("Missing file data");
    const path = `${dir}/${item.id}.${item.ext ?? "jpg"}`;
    const up = await sb.storage.from(BUCKET).upload(path, item.blob, { upsert: true, contentType: item.mime });
    if (up.error) throw new Error(up.error.message);
    let storagePath = path;
    let annotations: Record<string, unknown> | null = null;
    if (item.annotatedBlob && item.annotations) {
      const ap = `${dir}/${item.id}-annotated.jpg`;
      const up2 = await sb.storage.from(BUCKET).upload(ap, item.annotatedBlob, { upsert: true, contentType: "image/jpeg" });
      if (up2.error) throw new Error(up2.error.message);
      storagePath = ap;
      annotations = { ...item.annotations, original_path: path };
    }
    const { error } = await sb.from("job_files").upsert(
      {
        org_id: item.orgId, job_id: item.jobId, client_id: item.id, kind: item.kind ?? "photo", storage_path: storagePath,
        mime_type: item.mime ?? null, size_bytes: item.blob.size, caption: item.caption || null, category: item.category ?? "other",
        slope: item.slope ?? null, test_square_hits: item.category === "test_square" ? (item.hits ?? 0) : null,
        annotations, taken_at: item.takenAt ?? null, uploaded_by: userId,
      },
      { onConflict: "org_id,client_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return;
  }

  if (item.op === "annotate") {
    if (!item.annotatedBlob || !item.annotations) throw new Error("Missing annotation");
    const q = sb.from("job_files").select("id, storage_path, annotations").eq("org_id", item.orgId);
    const { data: row, error: e1 } = await (item.targetFileId ? q.eq("id", item.targetFileId) : q.eq("client_id", item.targetClientId!)).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Photo not uploaded yet");
    const original = (row.annotations as { original_path?: string } | null)?.original_path ?? row.storage_path;
    const ap = `${dir}/${item.id}-annotated.jpg`;
    const up = await sb.storage.from(BUCKET).upload(ap, item.annotatedBlob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) throw new Error(up.error.message);
    const { error } = await sb.from("job_files").update({ storage_path: ap, annotations: { ...item.annotations, original_path: original } }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (item.op === "event" && item.event) {
    const r = await postStatusEvent({ jobId: item.jobId, clientId: item.id, ...item.event });
    if (r.error) throw new Error(r.error);
    if (r.notified) await queue.patch(item.id, { info: r.notified });
  }
}

/** Background uploader for one job's queue: retries with backoff, resumes on reload and on `online`. */
export function useFieldQueue(jobId: string, orgId: string) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const running = useRef(false);
  const kickRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    try {
      setItems(await queue.list(jobId));
    } catch (e) {
      setStorageError((e as Error).message);
    }
  }, [jobId]);

  const process = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let uploadedAny = false;
    try {
      for (;;) {
        const all = await queue.list(jobId);
        const now = Date.now();
        const next = all.find((i) => (i.status === "queued" || i.status === "failed") && i.nextAt <= now);
        if (!next) break;
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        await queue.patch(next.id, { status: "uploading" });
        await reload();
        try {
          await uploadOne(next);
          await queue.patch(next.id, { status: "done", doneAt: Date.now(), error: null, attempts: next.attempts + 1 });
          uploadedAny = true;
        } catch (e) {
          const offline = typeof navigator !== "undefined" && !navigator.onLine;
          const msg = (e as Error).message || "Upload failed";
          const network = offline || /fetch|network|load failed|internet/i.test(msg);
          const attempts = next.attempts + 1;
          await queue.patch(next.id, {
            status: network ? "queued" : "failed",
            attempts,
            nextAt: Date.now() + backoffMs(attempts),
            error: network ? "Waiting for signal" : msg,
          });
        }
        await reload();
      }
    } finally {
      running.current = false;
    }
    if (uploadedAny) router.refresh();
  }, [jobId, reload, router]);

  useEffect(() => {
    kickRef.current = () => void process();
  }, [process]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Anything interrupted mid-upload (crash, reload) goes back in line.
      try {
        const all = await queue.list(jobId);
        await Promise.all(all.filter((i) => i.status === "uploading").map((i) => queue.patch(i.id, { status: "queued", nextAt: 0 })));
        // Forget finished items after a day.
        await Promise.all(all.filter((i) => i.status === "done" && (i.doneAt ?? 0) < Date.now() - 86400000).map((i) => queue.remove(i.id)));
      } catch (e) {
        setStorageError((e as Error).message);
      }
      if (cancelled) return;
      setOnline(navigator.onLine);
      await reload();
      kickRef.current();
    })();
    const on = () => {
      setOnline(true);
      // Coming back online: retry everything right away.
      queue.list(jobId).then((all) => Promise.all(all.filter((i) => i.status !== "done").map((i) => queue.patch(i.id, { nextAt: 0 })))).then(() => kickRef.current());
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = window.setInterval(() => kickRef.current(), 4000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, [jobId, reload]);

  const enqueue = useCallback(
    async (partial: Omit<QueueItem, "id" | "orgId" | "jobId" | "createdAt" | "status" | "attempts" | "nextAt"> & { id?: string }) => {
      const item: QueueItem = { id: partial.id ?? newClientId(), orgId, jobId, createdAt: Date.now(), status: "queued", attempts: 0, nextAt: 0, ...partial };
      try {
        await queue.put(item);
      } catch (e) {
        setStorageError((e as Error).message);
        throw e;
      }
      await reload();
      kickRef.current();
      return item;
    },
    [jobId, orgId, reload],
  );

  const patch = useCallback(async (id: string, p: Partial<QueueItem>) => {
    await queue.patch(id, p);
    await reload();
  }, [reload]);

  const retry = useCallback(async (id: string) => {
    await queue.patch(id, { status: "queued", nextAt: 0, error: null });
    await reload();
    kickRef.current();
  }, [reload]);

  const discard = useCallback(async (id: string) => {
    await queue.remove(id);
    await reload();
  }, [reload]);

  return { items, online, storageError, enqueue, patch, retry, discard };
}
