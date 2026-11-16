"use client";

// The email box under a thread (reply) and on "New email": text, plus files from the paperclip, drag-and-drop or
// paste. Files go straight to storage from the browser (no size limit on the form), then get attached on send.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/components/action-form";
import { cx, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { newEmail, prepareMailUpload, replyEmail } from "./actions";

const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const CLIP = "M15 7l-6.5 6.5a2 2 0 003 3L18 10a4 4 0 00-6-6l-6.5 6.5a6 6 0 008.5 8.5L20 13";
const X = "M6 6l12 12M18 6L6 18";
const I = ({ d, className = "h-3.5 w-3.5" }: { d: string; className?: string }) => <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const MAX = 18 * 1024 * 1024;
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const kind = (f: File) => (f.type.startsWith("image/") ? "IMG" : f.type === "application/pdf" ? "PDF" : (f.name.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase());

type Props = { mode: "reply"; thread: string; placeholder: string; stub: ReactNode } | { mode: "new"; to?: string; job?: string; from: string };

export function MailComposer(p: Props) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  const [msg, setMsg] = useState<ActionResult>(undefined);
  const [step, setStep] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const total = files.reduce((t, f) => t + f.size, 0);

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    const m = new Map(previews);
    for (const f of next) if (f.type.startsWith("image/") && !m.has(f)) m.set(f, URL.createObjectURL(f));
    setFiles(next);
    setPreviews(m);
    setMsg(undefined);
  }
  const remove = (f: File) => { setFiles(files.filter((x) => x !== f)); };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (total > MAX) { setMsg({ error: "Attachments are over 18 MB in total. Send big files as a link instead." }); return; }
    start(async () => {
      try {
        const uploaded = [];
        for (const [i, f] of files.entries()) {
          setStep(`Attaching ${i + 1} of ${files.length}…`);
          const prep = await prepareMailUpload(f.name);
          if (!prep.path) throw new Error(prep.error ?? "Couldn't attach that file.");
          const { error } = await createClient().storage.from("job-files").upload(prep.path, f, { contentType: f.type || undefined, upsert: false });
          if (error) throw new Error(`${f.name}: ${error.message}`);
          uploaded.push({ path: prep.path, name: f.name, mime: f.type || null, size: f.size });
        }
        fd.set("files", JSON.stringify(uploaded));
        setStep("Sending email…");
        const r = p.mode === "reply" ? await replyEmail(undefined, fd) : await newEmail(undefined, fd);
        setMsg(r);
        if (r && !r.error) { form.current?.reset(); setFiles([]); router.refresh(); }
      } catch (err) {
        setMsg({ error: err instanceof Error ? err.message : "Couldn't send." });
      } finally {
        setStep(null);
      }
    });
  }

  const chips = files.length > 0 && (
    <div className="flex flex-wrap gap-2 px-3 pt-2" data-attached>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-2 rounded-lg bg-cream py-1 pl-1 pr-1.5 font-mono text-[11px] text-ink ring-1 ring-slate-300">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file */}
          {previews.get(f) ? <img src={previews.get(f)} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded bg-white text-[9px] font-semibold ring-1 ring-slate-200">{kind(f)}</span>}
          <span className="max-w-[160px] truncate">{f.name}</span><span className="text-slate-400">{size(f.size)}</span>
          <button type="button" onClick={() => remove(f)} aria-label={`Remove ${f.name}`} className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-white"><I d={X} className="h-3 w-3" /></button>
        </span>
      ))}
      {total > MAX && <span className="font-mono text-[11px] font-semibold text-red-600">Over 18 MB</span>}
    </div>
  );
  const clip = (
    <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50" title="Attach files" aria-label="Attach files">
      <input ref={picker} type="file" multiple className="sr-only" data-attach onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <I d={CLIP} className="h-4 w-4" />
    </label>
  );
  const send = (
    <button disabled={pending} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white disabled:opacity-60" data-send>
      <I d={MAIL} />{pending ? (step ?? "Sending…") : "Send email"}
    </button>
  );
  const note = msg?.error ? <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p> : msg?.ok ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-ink ring-1 ring-slate-200">{msg.ok}</p> : null;
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); },
    onPaste: (e: React.ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files); } },
  };

  if (p.mode === "new") {
    return (
      <form ref={form} onSubmit={submit} className="mt-3 space-y-3" {...dropProps}>
        {p.job && <input type="hidden" name="job" value={p.job} />}
        <label className="block"><span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">To</span><Input name="to" type="email" defaultValue={p.to ?? ""} required placeholder="customer@example.com" className="mt-1" /></label>
        <label className="block"><span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400">Subject</span><Input name="subject" required className="mt-1" /></label>
        <div className={cx("rounded-xl ring-1", drag ? "ring-2 ring-ink" : "ring-slate-300")}>
          <textarea name="body" rows={10} aria-label="Message" placeholder="Write your email… (drop files here to attach them)" className="block w-full resize-y rounded-xl bg-transparent px-3 py-2.5 text-[14px] outline-none" />
          {chips}
          <div className="h-2" />
        </div>
        <div className="flex items-center gap-2">
          {clip}
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{p.from}</span>
          {send}
        </div>
        {note}
      </form>
    );
  }
  return (
    <form ref={form} onSubmit={submit} className="border-t-2 border-ink p-3" {...dropProps}>
      <input type="hidden" name="thread" value={p.thread} />
      <div className="flex items-end gap-2">
        {clip}
        <div className={cx("min-w-0 flex-1 rounded-xl ring-1 focus-within:ring-2 focus-within:ring-ink", drag ? "ring-2 ring-ink" : "ring-slate-300")}>
          <textarea name="body" rows={2} aria-label={p.placeholder} placeholder={p.placeholder} className="block w-full resize-y rounded-t-xl bg-transparent px-3 py-2.5 text-[14px] outline-none" />
          {chips}
          <p className="mt-1 flex items-center gap-1.5 border-t-2 border-dashed border-slate-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500"><I d={MAIL} className="h-3 w-3" />{p.stub}{files.length > 0 && <span className="ml-auto shrink-0">· {files.length} file{files.length === 1 ? "" : "s"} · {size(total)}</span>}</p>
        </div>
        {send}
      </div>
      {drag && <p className="mt-2 text-center font-mono text-[11px] text-ink">Drop to attach</p>}
      {note}
    </form>
  );
}
