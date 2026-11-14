"use client";

// Drop box in a job sidebar's Documents section: drag in files or whole folders (every file inside is
// uploaded, subfolders kept in the name, e.g. "Plans/Roof plan.pdf"), or browse for files or a folder.
// After upload Claude reads each file in the background and fills in the job (see readUploadedDocument).
// variant "measure" (a quote's empty roof plan): also fills the roof measurements, and shows Claude reading
// and what it found, since that's what they're waiting for.
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

export function DocumentDrop({ jobId, estimateId, variant = "sidebar", measured = false }: { jobId: string; estimateId?: string; variant?: "sidebar" | "measure"; measured?: boolean }) {
  const measure = variant === "measure";
  const router = useRouter();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function upload(all: Item[]) {
    const items = all.filter((i) => !skipFile(i.name));
    if (!items.length) { setMsg({ error: "There was nothing to upload in that." }); return; }
    const big = items.filter((i) => i.file.size > MAX);
    const todo = items.filter((i) => i.file.size <= MAX);
    setMsg(null);
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
    setBusy(null);
    // Quietly, in the background: Claude reads each file and fills in the job, customer and claim (two at a
    // time), then the sidebar refreshes to show the new details. Nothing is shown about it here.
    if (uploaded.length && measure) {
      // On a quote's roof plan: show Claude reading, then what it found.
      setReading({ done: 0, total: uploaded.length });
      const results: DocIntakeResult[] = [];
      let next = 0, done = 0;
      const worker = async () => {
        while (next < uploaded.length) {
          const r = await readUploadedDocument(uploaded[next++], estimateId).catch(() => null);
          if (r) results.push(r);
          setReading({ done: ++done, total: uploaded.length });
        }
      };
      void Promise.all([worker(), worker()]).then(() => { setReading(null); setMsg(readSummary(results, todo.length - failed.length, measured)); router.refresh(); });
    } else if (uploaded.length) {
      let next = 0;
      const worker = async () => { while (next < uploaded.length) await readUploadedDocument(uploaded[next++]).catch(() => null); };
      void Promise.all([worker(), worker()]).then(() => router.refresh());
    }
    const ok = todo.length - failed.length;
    const notes = [
      big.length ? `${big.length} over 50 MB skipped (${big.map((b) => b.name).slice(0, 2).join(", ")}${big.length > 2 ? "…" : ""})` : null,
      failed.length ? `${failed.length} didn't upload (${failed.slice(0, 2).join(", ")}${failed.length > 2 ? "…" : ""})` : null,
    ].filter(Boolean).join(". ");
    if (failed.length || big.length) setMsg({ error: `${ok ? `Uploaded ${ok}. ` : ""}${notes}.` });
    else if (!measure) setMsg({ ok: `Uploaded ${ok} ${ok === 1 ? "file" : "files"}.` });
    if (ok) router.refresh();
    if (files.current) files.current.value = "";
    if (folder.current) folder.current.value = "";
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (busy || reading) return;
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
    <div className={measure ? "" : "mt-2"} data-document-drop={variant}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy && !reading) setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={onDrop}
        className={cx("flex flex-col items-center justify-center gap-1 border-2 border-dashed text-center transition",
          measure && measured ? "rounded-xl px-4 py-3" : measure ? "rounded-2xl px-5 py-6" : "rounded-xl px-4 py-5",
          over ? "border-brand-500 bg-brand-50" : measure ? "border-slate-300 bg-white" : "border-slate-300 bg-slate-50/60")}>
        <svg viewBox="0 0 24 24" className={cx(measure && measured ? "hidden" : "h-7 w-7", over ? "text-brand-600" : "text-slate-400")} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        {reading ? (
          <>
            <p className="text-sm font-semibold text-ink" data-reading>Claude is reading {reading.total === 1 ? "your file" : `${Math.min(reading.done + 1, reading.total)} of ${reading.total}`}…</p>
            <p className="text-xs text-slate-500">Looking for roof measurements and job details</p>
            <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${reading.total ? Math.max(8, (reading.done / reading.total) * 100) : 0}%` }} /></div>
          </>
        ) : busy ? (
          <>
            <p className="text-sm font-semibold text-ink">Uploading {Math.min(busy.done + 1, busy.total)} of {busy.total}…</p>
            <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
          </>
        ) : (
          <>
            {measure && measured ? (
              <p className="text-sm text-slate-600"><span className="font-semibold text-ink">{over ? "Drop to upload" : "More plans or reports?"}</span> Drop files or folders here. Claude adds them to the job; your measurements stay as they are.</p>
            ) : measure ? (<>
              <p className="font-semibold text-ink">{over ? "Drop to upload" : "Not measured yet"}</p>
              <p className="max-w-md text-sm text-slate-500">Drop plans, a roof report or a whole folder here. Claude reads them, fills in the roof measurements and sorts the rest into the job. Or measure from the plans, on the satellite map, or by hand.</p>
            </>) : <p className="text-sm font-semibold text-ink">{over ? "Drop to upload" : "Drag files or folders here"}</p>}
            <p className="text-xs text-slate-500">
              or <button type="button" onClick={() => files.current?.click()} className="font-semibold text-brand-700 hover:underline">browse files</button>
              {" · "}<button type="button" onClick={() => folder.current?.click()} className="font-semibold text-brand-700 hover:underline">choose a folder</button>
            </p>
          </>
        )}
        <input ref={files} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} />
        <input ref={folder} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
      </div>
      {msg && <p role={msg.error ? "alert" : "status"} className={cx("mt-2 rounded-lg px-3 py-2 text-sm", msg.error ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-700")}>{msg.error ?? msg.ok}</p>}
    </div>
  );
}


/** What Claude did with the files dropped on a quote's roof plan, in a sentence or two. */
function readSummary(rs: DocIntakeResult[], saved: number, measured = false): { ok?: string; error?: string } {
  const files = `${saved} ${saved === 1 ? "file" : "files"}`;
  if (measured) {
    if (rs.length && rs.every((r) => r.status === "off")) return { error: `Saved ${files} to the job's Documents. Claude isn't connected yet, so ${saved === 1 ? "it hasn't" : "they haven't"} been read.` };
    const filled = [...new Set(rs.flatMap((r) => r.filled ?? []))].slice(0, 4);
    const diff = rs.find((r) => r.roofDiffers);
    const head = `Saved ${files} and Claude read ${rs.filter((r) => r.status === "read").length}.${filled.length ? ` Filled in: ${filled.join(", ")}.` : ""}`;
    if (diff) return { error: `${head} Heads up: the ${diff.roofDiffers!.replace(/^roof area on the quote is (.+?), the document says (.+)$/, `roof area in "${diff.name}" is $2, the quote has $1`)}. Kept yours; measure again if it's right.` };
    return { ok: filled.length ? head : `${head} Nothing new for the job, and the roof area matches.` };
  }
  if (rs.length && rs.every((r) => r.status === "off")) return { error: `Saved ${files} to the job's Documents. Claude isn't connected yet, so ${saved === 1 ? "it hasn't" : "they haven't"} been read. Measure from the plans, on the satellite map, or by hand.` };
  const m = rs.find((r) => r.measured);
  const others = [...new Set(rs.flatMap((r) => r.filled ?? []).filter((f) => !m?.measured || !f.startsWith(m.measured)))].slice(0, 4);
  const also = others.length ? ` Also filled in: ${others.join(", ")}.` : "";
  if (m) return { ok: `Roof measured from "${m.name}": ${m.measured}.${also} Check it in the roof report.` };
  return { error: `Saved ${files} and Claude read ${rs.filter((r) => r.status === "read").length}. No roof measurements in them${also ? "," : "."}${also ? also.replace(" Also filled", " but it filled") : ""} Measure from the plans, on the satellite map, or by hand.` };
}
