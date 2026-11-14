"use client";

// Drop box in a job sidebar's Documents section: drag in files or whole folders (every file inside is
// uploaded, subfolders kept in the name, e.g. "Plans/Roof plan.pdf"), or browse for files or a folder.
// After upload Claude reads each file in the background and fills in the job (see readUploadedDocument).
// variant "measure" (a quote's empty roof plan): also fills the roof measurements, and shows Claude reading
// and what it found, since that's what they're waiting for.
// variant "plans" (a new lead's Next up): the same, and the quote it fills in is found or made on the fly
// (quoteForPlans), so dropping the plans is the whole first step. `compact` once the plans are in.
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { attachJobFile, prepareJobUpload, readUploadedDocument, type DocIntakeResult } from "./[id]/files/actions";
import { quoteForPlans } from "./lead-actions";
import type { RoofSheet } from "@/lib/roof-sheet";

const MAX = 50 * 1024 * 1024;
const SHEET = "#eef4f0";

/**
 * A roof in plan view on the blueprint sheet. Waiting for plans: faint and dashed. Measured: a dimensioned
 * drawing, like a roof plan. Dimension lines give the rough length × width (marked ≈), the area and pitch sit in
 * the middle, and ridge / hips / eave run along the bottom. The shape is a simple hip roof drawn at the roof's
 * length-to-width ratio (hips at 45° in plan, so the ridge stops half the width in from each end); the numbers
 * are the real ones.
 */
export function RoofDrawing({ labels }: { labels?: RoofSheet }) {
  if (!labels) {
    return (
      <svg viewBox="0 0 300 150" className="block h-auto w-full" aria-hidden>
        <g fill="none" stroke="#1f5f3f" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="5 5" opacity={0.4}>
          <rect x="30" y="20" width="240" height="106" />
          <path d="M30 20L100 73L30 126M270 20L200 73L270 126M100 73H200" />
        </g>
      </svg>
    );
  }
  const ratio = Math.min(3.6, Math.max(1.3, labels.dims?.ratio ?? 2.6));
  let w = 228, h = w / ratio;
  if (h > 104) { h = 104; w = h * ratio; }
  const x0 = (320 - w) / 2 - (labels.dims ? 8 : 0), y0 = 38 + (104 - h) / 2, cy = y0 + h / 2;
  const inset = Math.min(h / 2, w / 2), rx1 = x0 + inset, rx2 = x0 + w - inset;
  const dx = x0 + w + 13, dy = y0 - 9;
  const said = [labels.dims ? `about ${labels.dims.long} by ${labels.dims.short}` : null, labels.area, labels.pitch, labels.foot].filter(Boolean).join(", ");
  return (
    <svg viewBox="0 0 320 196" className="block h-auto w-full" role="img" aria-label={`Roof plan: ${said}`} data-roof-drawing>
      <defs>
        <marker id="dim-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#1f5f3f" /></marker>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} fill="#d8eadd" stroke="#1f5f3f" strokeWidth="2" strokeLinejoin="round" />
      <path d={`M${x0} ${y0}L${rx1} ${cy}L${x0} ${y0 + h}M${x0 + w} ${y0}L${rx2} ${cy}L${x0 + w} ${y0 + h}M${rx1} ${cy}H${rx2}`} fill="none" stroke="#1f5f3f" strokeWidth="2" strokeLinejoin="round" />
      {labels.dims && (
        <g stroke="#1f5f3f" strokeWidth="1">
          <line x1={x0} y1={dy - 5} x2={x0} y2={y0 - 3} /><line x1={x0 + w} y1={dy - 5} x2={x0 + w} y2={y0 - 3} />
          <line x1={x0} y1={dy} x2={x0 + w} y2={dy} markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
          <line x1={x0 + w + 3} y1={y0} x2={dx + 5} y2={y0} /><line x1={x0 + w + 3} y1={y0 + h} x2={dx + 5} y2={y0 + h} />
          <line x1={dx} y1={y0} x2={dx} y2={y0 + h} markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
        </g>
      )}
      <g fill="#14402a" textAnchor="middle" fontWeight="700">
        {labels.dims && (
          <g fontFamily={MONO} fontSize="11" fontWeight="600" data-roof-dims>
            <text x={x0 + w / 2} y={dy - 6}>{`\u2248 ${labels.dims.long}`}</text>
            <text x={dx + 12} y={cy} transform={`rotate(90 ${dx + 12} ${cy})`} dominantBaseline="middle">{`\u2248 ${labels.dims.short}`}</text>
          </g>
        )}
        <g fontFamily={DISPLAY}>
          <text x={x0 + w / 2} y={cy - 7} fontSize="22">{labels.area}</text>
          {labels.pitch && <text x={x0 + w / 2} y={cy + 17} fontSize="11">{labels.pitch}</text>}
        </g>
        {labels.foot && <text x="160" y="186" fontFamily={MONO} fontSize="10.5" fontWeight="600">{labels.foot}</text>}
      </g>
    </svg>
  );
}
const DISPLAY = "var(--font-display, 'Space Grotesk'), system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
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

export function DocumentDrop({ jobId, estimateId, variant = "sidebar", measured = false, compact = false, sheet, caption, joined = false }: {
  jobId: string; estimateId?: string; variant?: "sidebar" | "measure" | "plans"; measured?: boolean;
  /** plans: once the plans are in (the sheet shows `sheet`, the roof drawn with its numbers, when there is one). */
  compact?: boolean; sheet?: ReactNode; caption?: string;
  /** plans: the top of a box that carries on below (the quote), so no outline or rounding of its own. */
  joined?: boolean;
}) {
  const plans = variant === "plans";
  const measure = variant === "measure" || plans;
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
      const quoteId = estimateId ?? (plans ? await quoteForPlans(jobId).catch(() => null) ?? undefined : undefined);
      const results: DocIntakeResult[] = [];
      let next = 0, done = 0;
      const worker = async () => {
        while (next < uploaded.length) {
          const r = await readUploadedDocument(uploaded[next++], quoteId).catch(() => null);
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
      {plans ? (
        // The blueprint: a plan sheet to drop the plans on. Once measured, `sheet` is the roof drawn with its numbers.
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy && !reading) setOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
          onDrop={onDrop}
          data-plan-sheet={compact && sheet ? "drawn" : "blank"}
          className={cx("overflow-hidden transition", joined ? (over ? "ring-2 ring-inset ring-brand-500" : "") : cx("rounded-2xl", over ? "ring-2 ring-brand-500" : "ring-1 ring-brand-200"))}
          style={{ backgroundColor: SHEET, backgroundImage: "linear-gradient(rgba(31,95,63,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,95,63,.08) 1px, transparent 1px)", backgroundSize: "22px 22px", backgroundPosition: "-1px -1px" }}>
          <div className="relative">
            {compact && sheet && !reading && !busy ? sheet : <RoofDrawing />}
            {!(compact && sheet && !reading && !busy) && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-1 px-6 text-center">
                {reading ? (<>
                  <p className="rounded-md px-2 text-sm font-semibold text-ink" style={{ background: SHEET }} data-reading>Claude is reading {reading.total === 1 ? "the plans" : `${Math.min(reading.done + 1, reading.total)} of ${reading.total}`}…</p>
                  <p className="rounded-md px-2 text-xs text-slate-500" style={{ background: SHEET }}>Drawing the roof and measuring it</p>
                  <div className="mt-1.5 h-1.5 w-44 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${reading.total ? Math.max(8, (reading.done / reading.total) * 100) : 0}%` }} /></div>
                </>) : busy ? (<>
                  <p className="rounded-md px-2 text-sm font-semibold text-ink" style={{ background: SHEET }}>Uploading {Math.min(busy.done + 1, busy.total)} of {busy.total}…</p>
                  <div className="mt-1.5 h-1.5 w-44 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
                </>) : compact ? (<>
                  <p className="rounded-md px-2 text-sm font-semibold text-ink" style={{ background: SHEET }}>{over ? "Drop to upload" : "Plans saved, roof not measured yet"}</p>
                  <p className="rounded-md px-2 text-xs text-slate-500" style={{ background: SHEET }}>Measure it on the quote, or drop clearer plans here</p>
                </>) : (<>
                  <p className="rounded-md px-2 font-semibold text-ink" style={{ background: SHEET }}>{over ? "Drop to upload" : "Drop the plans on the sheet"}</p>
                  <p className="rounded-md px-2 text-xs text-slate-500" style={{ background: SHEET }}>Claude draws the roof and measures it</p>
                  <button type="button" onClick={() => files.current?.click()} className="mt-1.5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600" data-plans-browse>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>Choose files
                  </button>
                </>)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-dashed border-brand-200 px-3.5 py-2 text-xs font-semibold text-brand-700">
            <span className="min-w-0 truncate">{caption ?? "Roof plan"}</span>
            {!reading && !busy && <button type="button" onClick={() => (compact ? files : folder).current?.click()} className="shrink-0 hover:underline" data-plans-more>{compact ? "+ Add plans" : "Or choose a folder"}</button>}
          </div>
          <input ref={files} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} />
          <input ref={folder} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromInput(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
        </div>
      ) : (
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
      )}
      {msg && <p role={msg.error ? "alert" : "status"} className={cx(joined ? "border-t border-brand-200 px-3.5 py-2 text-[13px]" : "mt-2 rounded-lg px-3 py-2 text-sm", msg.error ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-700")}>{msg.error ?? msg.ok}</p>}
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
