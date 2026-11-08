"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { attachJobFile } from "./actions";

/** Upload plans or documents straight to the job's storage folder. */
export function FileUpload({ orgId, jobId, category, label }: { orgId: string; jobId: string; category: "plans" | "document"; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 50 * 1024 * 1024) throw new Error(`${f.name} is over 50 MB.`);
        const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
        const path = `${orgId}/${jobId}/files/${crypto.randomUUID()}-${safe}`;
        const { error } = await createClient().storage.from("job-files").upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(error.message);
        const r = await attachJobFile({ jobId, path, name: f.name, mime: f.type || null, size: f.size, category });
        if (r?.error) throw new Error(r.error);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
        <input ref={input} type="file" multiple className="sr-only" accept={category === "plans" ? "application/pdf,image/*" : "application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"} disabled={busy} data-upload={category} onChange={(e) => onFiles(e.target.files)} />
        {busy ? "Uploading…" : label}
      </label>
      {err && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
