"use client";

// Drop box in a job sidebar's Documents section: drag in files or whole folders (every file inside is
// uploaded, subfolders kept in the name, e.g. "Plans/Roof plan.pdf"), or browse for files or a folder.
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { attachJobFile, prepareJobUpload, readUploadedDocument, type DocIntakeResult } from "./[id]/files/actions";

const MAX = 50 * 1024 * 1024;
type Item = { file: File; name: string };

/** Hidden / system files nobody means to upload. Exported for tests. */
export const skipFile = (name: string) => name.split("/").some((part) => part.startsWith(".") || part === "Thumbs.db" || part === "desktop.ini" || part === "__MACOSX");

// Minimal FileSystem entry types (folders dragged in from the desktop).
type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string };
type FsFile = FsEntry & { file(ok: (f: File) => void, bad: (e: unknown) => void): void };
type FsDir = FsEntry & { createReader(): { readEntries(ok: (e: FsEntry[]) => void, bad: (e: unknown) => void): void } };

async function walk(entry: FsEntry, prefix = ""): Promise<Item[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((ok, bad) => (entry as FsFile).file(ok, bad));
    return [{ file, name: prefix + file.name }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FsDir).createReader();
  const kids: FsEntry[] = [];
  // readEntries returns at most ~100 at a time; keep reading until it returns none.
  for (;;) {
    const batch = await new Promise<FsEntry[]>((ok, bad) => reader.readEntries(ok, bad));
    if (!batch.length) break;
    kids.push(...batch);
  }
  const nested = await Promise.all(kids.map((k) => walk(k, `${prefix}${entry.name}/`)));
  return nested.flat();
}

export function DocumentDrop({ jobId }: { jobId: string }) {
  const router = useRouter();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number; reading?: boolean } | null>(null);
  const [reads, setReads] = useState<DocIntakeResult[]>([]);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function upload(all: Item[]) {
    const items = all.filter((i) => !skipFile(i.name));
    if (!items.length) { setMsg({ error: "There was nothing to upload in that." }); return; }
    const big = items.filter((i) => i.file.size > MAX);
    const todo = items.filter((i) => i.file.size <= MAX);
    setMsg(null);
    setReads([]);
    setBusy({ done: 0, total: todo.length });
    const failed: string[] = [];
    const uploaded: string[] = [];
    const db = createClient();
    for (const [n, it] of todo.entries()) {
      try {
        const prep = await prepareJobUpload(jobId, it.file.name);
        if (!prep.path) throw new Error(prep.error ?? "Upload failed.");
        const { error } = await db.storage.from("job-files").upload(prep.path, it.file, { contentType: it.file.type || undefined, upsert: false });
        if (error) throw new Error(error.message);
        const r = await attachJobFile({ jobId, path: prep.path, name: it.name.slice(-200), mime: it.file.type || null, size: it.file.size, category: "document" });
        if (r?.error) throw new Error(r.error);
        if (r?.id) uploaded.push(r.id);
      } catch {
        failed.push(it.name);
      }
      setBusy({ done: n + 1, total: todo.length });
    }
    // Claude reads each uploaded file and updates the job, customer and claim (two at a time).
    const results: DocIntakeResult[] = [];
    if (uploaded.length) {
      setBusy({ done: 0, total: uploaded.length, reading: true });
      let next = 0, done = 0;
      const worker = async () => {
        while (next < uploaded.length) {
          const id = uploaded[next++];
          results.push(await readUploadedDocument(id).catch(() => ({ name: "file", status: "failed" as const })));
          setBusy({ done: ++done, total: uploaded.length, reading: true });
        }
      };
      await Promise.all([worker(), worker()]);
    }
    setReads(results);
    setBusy(null);
    const ok = todo.length - failed.length;
    const notes = [
      big.length ? `${big.length} over 50 MB skipped (${big.map((b) => b.name).slice(0, 2).join(", ")}${big.length > 2 ? "…" : ""})` : null,
      failed.length ? `${failed.length} didn't upload (${failed.slice(0, 2).join(", ")}${failed.length > 2 ? "…" : ""})` : null,
    ].filter(Boolean).join(". ");
    setMsg(failed.length || big.length ? { error: `${ok ? `Uploaded ${ok}. ` : ""}${notes}.` } : { ok: `Uploaded ${ok} ${ok === 1 ? "file" : "files"}.` });
    if (ok) router.refresh();
    if (files.current) files.current.value = "";
    if (folder.current) folder.current.value = "";
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    const entries = Array.from(e.dataTransfer.items ?? [])
      .map((i) => (i.kind === "file" && typeof i.webkitGetAsEntry === "function" ? (i.webkitGetAsEntry() as unknown as FsEntry | null) : null))
      .filter((x): x is FsEntry => x !== null);
    // Browsers without folder support: plain files only.
    const items = entries.length ? (await Promise.all(entries.map((en) => walk(en)))).flat() : Array.from(e.dataTransfer.files).map((f) => ({ file: f, name: f.name }));
    void upload(items);
  }

  const fromInput = (list: FileList | null) => {
    if (!list?.length) return;
    void upload(Array.from(list).map((f) => ({ file: f, name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name })));
  };

  return (
    <div className="mt-2" data-document-drop>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={onDrop}
        className={cx("flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition",
          over ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/60")}>
        <svg viewBox="0 0 24 24" className={cx("h-7 w-7", over ? "text-brand-600" : "text-slate-400")} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        {busy ? (
          <>
            <p className="text-sm font-semibold text-ink">{busy.reading ? "Claude is reading" : "Uploading"} {Math.min(busy.done + 1, busy.total)} of {busy.total}…</p>
            <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink">{over ? "Drop to upload" : "Drag files or folders here"}</p>
            <p className="text-xs text-slate-500">
              or <button type="button" onClick={() => files.current?.click()} className="font-semibold text-brand-700 hover:underline">browse files</button>
              {" · "}<button type="button" onClick={() => folder.current?.click()} className="font-semibold text-brand-700 hover:underline">choose a folder</button>
            </p>
          </>
        )}
        <input ref={files} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} />
        <input ref={folder} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
      </div>
      {reads.length > 0 && <IntakeResults reads={reads} />}
      {msg && <p role={msg.error ? "alert" : "status"} className={cx("mt-2 rounded-lg px-3 py-2 text-sm", msg.error ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-700")}>{msg.error ?? msg.ok}</p>}
    </div>
  );
}

/** What Claude did with each file: its type, what it filled in, and anything that didn't match. */
export function IntakeResults({ reads }: { reads: DocIntakeResult[] }) {
  const off = reads.every((r) => r.status === "off");
  if (off) return <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" data-intake-off>Saved. Claude isn&rsquo;t connected yet, so it couldn&rsquo;t read them to update the job.</p>;
  return (
    <ul className="mt-2 space-y-1.5" data-intake-results>
      {reads.map((r, i) => (
        <li key={i} className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs ring-1 ring-brand-100">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brand-600" aria-hidden><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="currentColor" /></svg>
            <span className="min-w-0 truncate">{r.name}</span>{r.type && <span className="shrink-0 font-normal text-slate-500">· {r.type}</span>}
          </p>
          {r.status === "read" ? (
            <>
              {r.filled?.length ? <p className="mt-0.5 text-brand-800">Filled in: {r.filled.join(", ")}</p> : <p className="mt-0.5 text-slate-600">{r.summary ?? "Nothing new for the job."}</p>}
              {r.differs?.map((d, k) => <p key={k} className="mt-0.5 text-amber-800">Didn&rsquo;t change: {d}</p>)}
              {r.hints?.map((h, k) => <p key={k} className="mt-0.5 text-slate-600">{h}</p>)}
            </>
          ) : <p className="mt-0.5 text-slate-500">{r.status === "skipped" ? "Saved. Claude can read PDFs, photos and text files." : r.status === "off" ? "Saved. Claude isn't connected yet." : "Saved, but Claude couldn't read it."}</p>}
        </li>
      ))}
    </ul>
  );
}
