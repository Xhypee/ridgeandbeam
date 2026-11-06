"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistKey } from "@/lib/job-compliance";
import { attachUploadedEvidence } from "./actions";

/** Upload a certificate / SWMS / signed receipt straight to job storage and link it to the checklist item. */
export function EvidenceUpload({ orgId, jobId, itemKey, title }: { orgId: string; jobId: string; itemKey: ChecklistKey; title: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) return setMsg({ error: "That file is over 50 MB." });
    setBusy(true);
    setMsg(null);
    try {
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
      const path = `${orgId}/${jobId}/compliance/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from("job-files").upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) throw new Error(error.message);
      const r = await attachUploadedEvidence({ jobId, itemKey, path, name: f.name, mime: f.type || null, size: f.size, title });
      setMsg(r ?? null);
      if (!r?.error) router.refresh();
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
        <input ref={input} type="file" className="sr-only" accept="application/pdf,image/*" disabled={busy} data-evidence-input={itemKey} onChange={(e) => onFile(e.target.files?.[0])} />
        {busy ? "Uploading…" : "Upload evidence"}
      </label>
      {msg?.error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg.ok}</p>}
    </div>
  );
}
