"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CATEGORY_LABEL, EVENT_LABEL, PHOTO_CATEGORIES, SLOPES, SLOPE_LABEL, STATUS_ACTIONS } from "@/lib/field";
import { preparePhoto } from "@/lib/field-image";
import { extFor, newClientId, type QueueItem, type Shape } from "@/lib/field-queue";
import { deleteFile, setNotifyHomeowner, textPortalLink, updateFile } from "@/app/app/jobs/[id]/field/actions";
import { Annotator } from "./annotator";
import { BlobImg, useBlobUrl } from "./blob-img";
import type { ServerEvent, ServerFile } from "./types";
import { useFieldQueue } from "./use-field-queue";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const chip = "min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 transition";
const chipOn = "bg-slate-900 text-white ring-slate-900";
const chipOff = "bg-white text-slate-800 ring-slate-300";

type Props = {
  jobId: string;
  orgId: string;
  notifyHomeowner: boolean;
  hasPhone: boolean;
  portalUrl: string;
  files: ServerFile[];
  events: ServerEvent[];
};

type Tile =
  | { src: "queue"; key: string; item: QueueItem }
  | { src: "server"; key: string; file: ServerFile };

const noopSubscribe = () => () => {};

/** Local-time label; rendered client-side only (server and phone time zones differ). */
function Time({ iso }: { iso: string | null | undefined }) {
  return <time suppressHydrationWarning dateTime={iso ?? undefined}>{fmtTime(iso)}</time>;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function useHits(jobId: string) {
  const key = `rb-hits-${jobId}`;
  const [hits, setHits] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setHits(v);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = (slope: string, n: number) =>
    setHits((h) => {
      const next = { ...h, [slope]: Math.max(0, n) };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [hits, set] as const;
}

export function FieldApp({ jobId, orgId, notifyHomeowner, hasPhone, portalUrl, files, events }: Props) {
  const q = useFieldQueue(jobId, orgId);
  const [slope, setSlope] = useState<string>("front");
  const [category, setCategory] = useState<string>("overview");
  const [caption, setCaption] = useState("");
  const [hits, setHits] = useHits(jobId);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fSlope, setFSlope] = useState<string>("all");
  const [fCat, setFCat] = useState<string>("all");
  const [open, setOpen] = useState<Tile | null>(null);
  const [annotating, setAnnotating] = useState<Tile | null>(null);
  const [statusKind, setStatusKind] = useState<string | null>(null);
  const [notify, setNotify] = useState(notifyHomeowner);
  const [, startTransition] = useTransition();

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 4000);
  };

  const serverClientIds = useMemo(() => new Set(files.map((f) => f.client_id).filter(Boolean)), [files]);
  const serverEventIds = useMemo(() => new Set(events.map((e) => e.client_id).filter(Boolean)), [events]);
  const queuedFiles = q.items.filter((i) => i.op === "file" && !(i.status === "done" && serverClientIds.has(i.id)));
  const pendingPhotos = q.items.filter((i) => i.op === "file" && i.kind === "photo" && i.status !== "done").length;
  const pendingOther = q.items.filter((i) => i.status !== "done").length - pendingPhotos;
  const failed = q.items.filter((i) => i.status === "failed");
  const uploading = q.items.some((i) => i.status === "uploading");
  const queuedEvents = q.items.filter((i) => i.op === "event" && !(i.status === "done" && serverEventIds.has(i.id)));

  const tiles: Tile[] = [
    ...queuedFiles.filter((i) => i.kind === "photo").reverse().map((item) => ({ src: "queue" as const, key: item.id, item })),
    ...files.filter((f) => f.kind === "photo" && !q.items.some((i) => i.id === f.client_id && i.status !== "done")).map((file) => ({ src: "server" as const, key: file.id, file })),
  ];
  const tSlope = (t: Tile) => (t.src === "queue" ? t.item.slope : t.file.slope) ?? "other";
  const tCat = (t: Tile) => (t.src === "queue" ? t.item.category : t.file.category) ?? "other";
  const shown = tiles.filter((t) => (fSlope === "all" || tSlope(t) === fSlope) && (fCat === "all" || tCat(t) === fCat));
  const voice = [
    ...queuedFiles.filter((i) => i.kind === "voice").map((item) => ({ src: "queue" as const, key: item.id, item })),
    ...files.filter((f) => f.kind === "voice").map((file) => ({ src: "server" as const, key: file.id, file })),
  ];

  async function onPhotos(list: FileList | null) {
    if (!list?.length) return;
    const arr = Array.from(list);
    setBusy(`Saving ${arr.length} photo${arr.length > 1 ? "s" : ""}…`);
    let n = 0;
    try {
      for (const f of arr) {
        const p = await preparePhoto(f);
        await q.enqueue({
          op: "file", kind: "photo", blob: p.blob, mime: p.mime, ext: extFor(p.mime), takenAt: p.takenAt,
          slope, category, caption: caption.trim() || null, hits: category === "test_square" ? (hits[slope] ?? 0) : null,
        });
        n++;
      }
      say(`${n} photo${n > 1 ? "s" : ""} saved on this phone${navigator.onLine ? " — uploading" : " — will upload when you have signal"}.`);
    } catch (e) {
      say(`Couldn't save photo: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const latestTestSquare = tiles.find((t) => tCat(t) === "test_square" && tSlope(t) === slope);

  async function applyHits() {
    const n = hits[slope] ?? 0;
    if (!latestTestSquare) return say("Take a test-square photo on this slope first.");
    if (latestTestSquare.src === "queue") await q.patch(latestTestSquare.item.id, { hits: n });
    else {
      const r = await updateFile({ id: latestTestSquare.file.id, test_square_hits: n });
      if (r.error) return say(r.error);
    }
    say(`${n} hits saved to the ${SLOPE_LABEL[slope].toLowerCase()} test square.`);
  }

  return (
    <div className="space-y-5 pb-24 text-slate-900">
      <SyncBanner online={q.online} pendingPhotos={pendingPhotos} pendingOther={pendingOther} failed={failed.length} uploading={uploading}
        storageError={q.storageError} onRetry={() => failed.forEach((f) => q.retry(f.id))} />

      {/* Status actions (X3) */}
      <section aria-labelledby="status-h">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="status-h" className="text-lg font-bold">Status update</h2>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={!notify}
              onChange={(e) => {
                const v = !e.target.checked;
                setNotify(v);
                startTransition(async () => { const r = await setNotifyHomeowner(jobId, v); say(r.error ?? r.ok ?? ""); });
              }} />
            Don&apos;t notify homeowner
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ACTIONS.map((a) => (
            <button key={a.kind} type="button" onClick={() => setStatusKind(a.kind)}
              className="min-h-16 rounded-2xl bg-slate-900 px-3 text-left text-base font-bold leading-tight text-white active:bg-slate-700">
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => setStatusKind("note")}
            className="col-span-2 min-h-14 rounded-2xl bg-white px-3 text-base font-bold ring-2 ring-slate-900">
            + Custom note
          </button>
        </div>
        {!hasPhone && notify && <p className="mt-2 text-sm text-amber-800">No homeowner phone on file — updates won&apos;t be texted.</p>}
      </section>

      {/* Capture (X1) */}
      <section aria-labelledby="cap-h" className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h2 id="cap-h" className="mb-2 text-lg font-bold">Capture</h2>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Slope</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {SLOPES.map((s) => (
            <button key={s} type="button" aria-pressed={slope === s} onClick={() => setSlope(s)} className={cx(chip, slope === s ? chipOn : chipOff)}>{SLOPE_LABEL[s]}</button>
          ))}
        </div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {PHOTO_CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cx(chip, category === c ? chipOn : chipOff)}>{CATEGORY_LABEL[c]}</button>
          ))}
        </div>

        {category === "test_square" && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-900">Test square hits — {SLOPE_LABEL[slope]} slope (10×10 ft)</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" aria-label="Remove a hit" onClick={() => setHits(slope, (hits[slope] ?? 0) - 1)}
                className="h-16 w-16 rounded-2xl bg-white text-4xl font-bold ring-2 ring-slate-900">−</button>
              <output aria-label="Hit count" className="min-w-16 text-center text-5xl font-black tabular-nums">{hits[slope] ?? 0}</output>
              <button type="button" aria-label="Add a hit" onClick={() => setHits(slope, (hits[slope] ?? 0) + 1)}
                className="h-16 flex-1 rounded-2xl bg-brand-500 text-4xl font-bold text-white">+</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={applyHits} className="min-h-11 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Save count to last test-square photo</button>
              <button type="button" onClick={() => setHits(slope, 0)} className="min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ring-slate-300">Reset</button>
            </div>
            {(hits[slope] ?? 0) >= 8 && <p className="mt-2 text-xs text-amber-900">8+ hits per square often supports replacement — but carrier rules vary.</p>}
          </div>
        )}

        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption for next photos (optional)"
          className="mb-3 block min-h-12 w-full rounded-xl px-3 text-base ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none" />

        <label className={cx("flex min-h-20 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand-500 text-xl font-black text-white shadow active:bg-brand-600", busy && "opacity-60")}>
          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" data-testid="photo-input"
            onChange={(e) => { const fl = e.target.files; void onPhotos(fl).then(() => { e.target.value = ""; }); }} />
          {busy ?? "Take photos"}
        </label>
        <p className="mt-1 text-center text-xs text-slate-500">Tagged {SLOPE_LABEL[slope]} · {CATEGORY_LABEL[category]}. Saved on this phone first — no signal needed.</p>
        <VoiceRecorder onDone={async (blob, mime) => {
          await q.enqueue({ op: "file", kind: "voice", blob, mime, ext: extFor(mime), takenAt: new Date().toISOString(), slope, category: "other", caption: caption.trim() || "Voice note" });
          say("Voice note saved.");
        }} />
      </section>

      {/* Gallery */}
      <section aria-labelledby="gal-h">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="gal-h" className="text-lg font-bold">Photos <span className="text-sm font-medium text-slate-500">({tiles.length})</span></h2>
          <a href={`/app/jobs/${jobId}/field/report`} className="min-h-11 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold ring-1 ring-slate-300">Photo report</a>
        </div>
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {["all", ...SLOPES].map((s) => (
            <button key={s} type="button" onClick={() => setFSlope(s)} className={cx(chip, "shrink-0", fSlope === s ? chipOn : chipOff)}>{s === "all" ? "All slopes" : SLOPE_LABEL[s]}</button>
          ))}
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {["all", ...PHOTO_CATEGORIES].map((c) => (
            <button key={c} type="button" onClick={() => setFCat(c)} className={cx(chip, "shrink-0", fCat === c ? chipOn : chipOff)}>{c === "all" ? "All types" : CATEGORY_LABEL[c]}</button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No photos {tiles.length ? "match this filter" : "yet"}.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="gallery">
            {shown.map((t) => (
              <li key={t.key} className="relative overflow-hidden rounded-xl bg-slate-200" data-testid="tile" data-status={t.src === "queue" ? t.item.status : "done"}>
                <button type="button" onClick={() => setOpen(t)} className="block aspect-square w-full" aria-label="Open photo">
                  {t.src === "queue" ? (
                    <BlobImg blob={t.item.annotatedBlob ?? t.item.blob} alt={t.item.caption ?? "Queued photo"} className="h-full w-full object-cover" />
                  ) : t.file.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.file.url} alt={t.file.caption ?? "Job photo"} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </button>
                <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1">
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{SLOPE_LABEL[tSlope(t)] ?? tSlope(t)} · {CATEGORY_LABEL[tCat(t)]}</span>
                  {(t.src === "queue" ? t.item.category === "test_square" && t.item.hits != null : t.file.hits != null) && (
                    <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-black">{t.src === "queue" ? t.item.hits : t.file.hits} hits</span>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1">
                  {t.src === "queue" ? <StatusChip item={t.item} offline={!q.online} onRetry={() => q.retry(t.item.id)} /> : <span className="rounded bg-green-600 px-1.5 py-0.5 text-[11px] font-bold text-white" data-testid="chip">Uploaded</span>}
                  {t.src === "server" && (
                    <button type="button"
                      onClick={() => startTransition(async () => { const r = await updateFile({ id: t.file.id, shared_with_homeowner: !t.file.shared }); if (r.error) say(r.error); })}
                      className={cx("min-h-9 rounded-lg px-2 text-[11px] font-bold", t.file.shared ? "bg-brand-500 text-white" : "bg-white/90 text-slate-900")}
                      aria-pressed={t.file.shared}>
                      {t.file.shared ? "Shared ✓" : "Share"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {voice.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-bold">Voice notes</h3>
            {voice.map((v) => <VoiceRow key={v.key} tile={v} onRetry={(id) => q.retry(id)} onDelete={async (id) => { const r = await deleteFile(id); say(r.error ?? r.ok ?? ""); }} />)}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section aria-labelledby="tl-h">
        <h2 id="tl-h" className="mb-2 text-lg font-bold">Job timeline</h2>
        <ol className="space-y-2" data-testid="timeline">
          {queuedEvents.slice().reverse().map((i) => (
            <li key={i.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{EVENT_LABEL[i.event!.kind] ?? i.event!.kind}</p>
                <StatusChip item={i} offline={!q.online} onRetry={() => q.retry(i.id)} />
              </div>
              {i.event!.note && <p className="text-sm text-slate-700">{i.event!.note}</p>}
              {i.info && <p className="text-xs text-slate-500">{i.info}</p>}
            </li>
          ))}
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              {e.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <p className="font-bold">{EVENT_LABEL[e.kind] ?? e.kind}</p>
                {e.note && <p className="text-sm text-slate-700">{e.note}</p>}
                <p className="text-xs text-slate-500"><Time iso={e.created_at} /> · {e.created_by_name}{e.notified ? " · homeowner texted" : ""}{!e.visible ? " · internal" : ""}</p>
              </div>
            </li>
          ))}
          {events.length === 0 && queuedEvents.length === 0 && <li className="text-sm text-slate-500">No updates yet.</li>}
        </ol>
      </section>

      {/* Homeowner portal */}
      <section className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold">Homeowner portal</h2>
        <p className="mb-2 text-sm text-slate-600">One link for progress, shared photos, documents and the claim explainer.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="min-h-12 rounded-xl bg-white font-semibold ring-1 ring-slate-300"
            onClick={async () => { try { await navigator.clipboard.writeText(portalUrl); say("Portal link copied."); } catch { window.prompt("Copy this link:", portalUrl); } }}>
            Share homeowner portal
          </button>
          <button type="button" className="min-h-12 rounded-xl bg-slate-900 font-semibold text-white"
            onClick={() => startTransition(async () => { const r = await textPortalLink(jobId); say(r.error ?? r.ok ?? ""); })}>
            Text link to homeowner
          </button>
        </div>
        <a href={portalUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-brand-700 underline" data-testid="portal-link">{portalUrl}</a>
      </section>

      {toast && (
        <div role="status" className="fixed inset-x-3 bottom-4 z-40 mx-auto max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white shadow-lg">{toast}</div>
      )}

      {open && (
        <PhotoSheet tile={open} onClose={() => setOpen(null)}
          onMarkup={() => { setAnnotating(open); setOpen(null); }}
          onQueuePatch={async (p) => { if (open.src === "queue") { await q.patch(open.item.id, p); setOpen(null); } }}
          onDiscard={async () => { if (open.src === "queue") { await q.discard(open.item.id); setOpen(null); say("Photo discarded."); } }}
          onServerSaved={(m) => { setOpen(null); say(m); }} />
      )}

      {annotating && (
        <AnnotateHost tile={annotating} onClose={() => setAnnotating(null)}
          onSave={async (shapes, blob) => {
            const t = annotating;
            // Not uploaded yet: fold the markup into the queued photo. Already uploading/uploaded: queue a follow-up.
            if (t.src === "queue" && (t.item.status === "queued" || t.item.status === "failed")) await q.patch(t.item.id, { annotations: { shapes }, annotatedBlob: blob });
            else if (t.src === "queue") await q.enqueue({ op: "annotate", targetClientId: t.item.id, annotations: { shapes }, annotatedBlob: blob });
            else await q.enqueue({ op: "annotate", targetFileId: t.file.id, annotations: { shapes }, annotatedBlob: blob });
            setAnnotating(null);
            say("Markup saved.");
          }} />
      )}

      {statusKind && (
        <StatusSheet kind={statusKind} notify={notify && hasPhone} recent={files.filter((f) => f.kind === "photo").slice(0, 8)}
          onClose={() => setStatusKind(null)}
          onPost={async ({ note, photo, fileId }) => {
            let fileClientId: string | null = null;
            if (photo) {
              const p = await preparePhoto(photo);
              const cat = statusKind === "materials_delivered" ? "delivery" : statusKind === "completed" || statusKind === "cleanup_verified" ? "completion" : "progress";
              const it = await q.enqueue({ op: "file", kind: "photo", blob: p.blob, mime: p.mime, ext: extFor(p.mime), takenAt: p.takenAt, slope, category: cat, caption: note || EVENT_LABEL[statusKind] });
              fileClientId = it.id;
            }
            await q.enqueue({ id: newClientId(), op: "event", event: { kind: statusKind, note: note || null, fileClientId, fileId } });
            setStatusKind(null);
            say(navigator.onLine ? `${EVENT_LABEL[statusKind]} posted.` : `${EVENT_LABEL[statusKind]} saved — will post when you have signal.`);
          }} />
      )}
    </div>
  );
}

function SyncBanner({ online, pendingPhotos, pendingOther, failed, uploading, storageError, onRetry }: {
  online: boolean; pendingPhotos: number; pendingOther: number; failed: number; uploading: boolean; storageError: string | null; onRetry: () => void;
}) {
  const pending = pendingPhotos + pendingOther;
  let tone = "bg-green-700 text-white";
  let text = "All captures uploaded";
  if (storageError) { tone = "bg-red-700 text-white"; text = `This phone can't save captures: ${storageError}`; }
  else if (failed > 0) { tone = "bg-red-700 text-white"; text = `${failed} upload${failed > 1 ? "s" : ""} failed`; }
  else if (pending > 0 && (!online || !uploading)) {
    tone = "bg-amber-400 text-black";
    const what = pendingPhotos ? `${pendingPhotos} photo${pendingPhotos > 1 ? "s" : ""}` : `${pending} update${pending > 1 ? "s" : ""}`;
    text = online ? `${what} queued — uploading shortly` : `${what} waiting for signal`;
  } else if (pending > 0) { tone = "bg-blue-700 text-white"; text = `Uploading… ${pending} left`; }
  else if (!online) { tone = "bg-slate-700 text-white"; text = "Offline — captures will be saved on this phone"; }
  return (
    <div role="status" aria-live="polite" data-testid="sync-banner"
      className={cx("sticky top-[5.75rem] z-20 -mx-1 flex min-h-12 items-center justify-between gap-2 rounded-xl px-3 py-2 text-base font-bold shadow lg:top-2", tone)}>
      <span>{text}</span>
      {failed > 0 && <button type="button" onClick={onRetry} className="min-h-10 rounded-lg bg-white px-3 text-sm font-bold text-red-800">Retry</button>}
    </div>
  );
}

function StatusChip({ item, onRetry, offline }: { item: QueueItem; onRetry: () => void; offline?: boolean }) {
  const map: Record<string, [string, string]> = {
    queued: ["bg-amber-400 text-black", offline || item.error === "Waiting for signal" ? "Waiting for signal" : "Queued"],
    uploading: ["bg-blue-600 text-white", "Uploading…"],
    done: ["bg-green-600 text-white", "Uploaded"],
    failed: ["bg-red-600 text-white", "Failed"],
  };
  const [cls, text] = map[item.status];
  return (
    <span className="flex items-center gap-1">
      <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-bold", cls)} data-testid="chip" title={item.error ?? undefined}>{text}</span>
      {item.status === "failed" && (
        <button type="button" onClick={onRetry} className="min-h-9 rounded-lg bg-white px-2 text-[11px] font-bold text-red-800 ring-1 ring-red-300">Retry</button>
      )}
    </span>
  );
}

function VoiceRecorder({ onDone }: { onDone: (b: Blob, mime: string) => Promise<void> }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [rec]);
  const supported = useSyncExternalStore(noopSubscribe, () => "MediaRecorder" in window, () => false);
  if (!supported) return null;
  return (
    <div className="mt-3">
      <button type="button"
        onClick={async () => {
          setErr(null);
          if (rec) { rec.stop(); return; }
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            chunks.current = [];
            r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
            r.onstop = async () => {
              stream.getTracks().forEach((t) => t.stop());
              const mime = r.mimeType || "audio/webm";
              const blob = new Blob(chunks.current, { type: mime });
              setRec(null);
              setSecs(0);
              if (blob.size) await onDone(blob, mime);
            };
            r.start();
            setRec(r);
          } catch (e) {
            setErr((e as Error).message || "Microphone not available");
          }
        }}
        className={cx("min-h-14 w-full rounded-2xl text-lg font-bold ring-2", rec ? "bg-red-600 text-white ring-red-600" : "bg-white text-slate-900 ring-slate-900")}>
        {rec ? `■ Stop recording (${secs}s)` : "● Record voice note"}
      </button>
      {err && <p className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  );
}

function VoiceRow({ tile, onRetry, onDelete }: { tile: Tile; onRetry: (id: string) => void; onDelete: (id: string) => void }) {
  const local = useBlobUrl(tile.src === "queue" ? tile.item.blob : null);
  const src = tile.src === "queue" ? local : tile.file.url;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
      {src && <audio controls src={src} className="h-10 min-w-0 flex-1" />}
      <span className="text-xs text-slate-500">{tile.src === "queue" ? tile.item.caption : tile.file.caption} · <Time iso={tile.src === "queue" ? tile.item.takenAt : tile.file.taken_at ?? tile.file.created_at} /></span>
      {tile.src === "queue" ? <StatusChip item={tile.item} onRetry={() => onRetry(tile.item.id)} /> : (
        <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold text-red-700 ring-1 ring-red-200" onClick={() => { if (confirm("Delete this voice note?")) onDelete(tile.file.id); }}>Delete</button>
      )}
    </div>
  );
}

function AnnotateHost({ tile, onSave, onClose }: { tile: Tile; onSave: (s: Shape[], b: Blob) => Promise<void>; onClose: () => void }) {
  const local = useBlobUrl(tile.src === "queue" ? tile.item.blob : null);
  const src = tile.src === "queue" ? local : tile.file.original_url ?? tile.file.url;
  const initial = tile.src === "queue" ? tile.item.annotations?.shapes : tile.file.shapes ?? undefined;
  if (!src) return null;
  return <Annotator src={src} initial={initial} onSave={onSave} onClose={onClose} />;
}

function PhotoSheet({ tile, onClose, onMarkup, onQueuePatch, onDiscard, onServerSaved }: {
  tile: Tile; onClose: () => void; onMarkup: () => void;
  onQueuePatch: (p: Partial<QueueItem>) => Promise<void>; onDiscard: () => Promise<void>; onServerSaved: (m: string) => void;
}) {
  const init = tile.src === "queue"
    ? { caption: tile.item.caption ?? "", slope: tile.item.slope ?? "other", category: tile.item.category ?? "other", hits: tile.item.hits ?? 0, shared: false }
    : { caption: tile.file.caption ?? "", slope: tile.file.slope ?? "other", category: tile.file.category, hits: tile.file.hits ?? 0, shared: tile.file.shared };
  const [v, setV] = useState(init);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const local = useBlobUrl(tile.src === "queue" ? tile.item.annotatedBlob ?? tile.item.blob : null);
  const src = tile.src === "queue" ? local : tile.file.url;

  const save = () => start(async () => {
    if (tile.src === "queue") {
      await onQueuePatch({ caption: v.caption || null, slope: v.slope, category: v.category, hits: v.category === "test_square" ? v.hits : null });
      return;
    }
    const r = await updateFile({
      id: tile.file.id, caption: v.caption || null, slope: v.slope as (typeof SLOPES)[number],
      category: v.category as (typeof PHOTO_CATEGORIES)[number], test_square_hits: v.category === "test_square" ? v.hits : null, shared_with_homeowner: v.shared,
    });
    if (r.error) setErr(r.error); else onServerSaved("Photo saved.");
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 sm:items-center sm:justify-center" role="dialog" aria-label="Photo details" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-3 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="mb-3 max-h-[40vh] w-full rounded-xl bg-slate-100 object-contain" />
        )}
        <input value={v.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} placeholder="Caption" aria-label="Caption"
          className="mb-3 block min-h-12 w-full rounded-xl px-3 text-base ring-1 ring-slate-300" />
        <div className="mb-3 grid grid-cols-3 gap-2">
          {SLOPES.map((s) => <button key={s} type="button" onClick={() => setV({ ...v, slope: s })} className={cx(chip, v.slope === s ? chipOn : chipOff)}>{SLOPE_LABEL[s]}</button>)}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {PHOTO_CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setV({ ...v, category: c })} className={cx(chip, v.category === c ? chipOn : chipOff)}>{CATEGORY_LABEL[c]}</button>)}
        </div>
        {v.category === "test_square" && (
          <div className="mb-3 flex items-center gap-3">
            <button type="button" aria-label="Fewer hits" onClick={() => setV({ ...v, hits: Math.max(0, v.hits - 1) })} className="h-14 w-14 rounded-xl text-3xl font-bold ring-2 ring-slate-900">−</button>
            <span className="text-3xl font-black tabular-nums">{v.hits}</span>
            <button type="button" aria-label="More hits" onClick={() => setV({ ...v, hits: v.hits + 1 })} className="h-14 w-14 rounded-xl bg-brand-500 text-3xl font-bold text-white">+</button>
            <span className="text-sm text-slate-600">hits</span>
          </div>
        )}
        {tile.src === "server" && (
          <label className="mb-3 flex min-h-12 items-center gap-3 rounded-xl px-3 ring-1 ring-slate-300">
            <input type="checkbox" className="h-6 w-6 accent-brand-500" checked={v.shared} onChange={(e) => setV({ ...v, shared: e.target.checked })} />
            <span className="font-semibold">Share with homeowner</span>
          </label>
        )}
        {err && <p className="mb-2 text-sm text-red-700">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onMarkup} className="min-h-14 rounded-xl bg-white text-base font-bold ring-2 ring-brand-500 text-brand-700">Mark up</button>
          <button type="button" onClick={save} disabled={pending} className="min-h-14 rounded-xl bg-brand-500 text-base font-bold text-white">{pending ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl font-semibold ring-1 ring-slate-300">Close</button>
          <button type="button" className="min-h-12 rounded-xl font-semibold text-red-700 ring-1 ring-red-200"
            onClick={() => {
              if (!confirm(tile.src === "queue" ? "Discard this photo? It hasn't uploaded yet." : "Delete this photo?")) return;
              if (tile.src === "queue") void onDiscard();
              else start(async () => { const r = await deleteFile(tile.file.id); if (r.error) setErr(r.error); else onServerSaved("Photo deleted."); });
            }}>
            {tile.src === "queue" ? "Discard" : "Delete"}
          </button>
        </div>
        {tile.src === "queue" && tile.item.error && <p className="mt-2 text-xs text-slate-500">Last upload attempt: {tile.item.error}</p>}
      </div>
    </div>
  );
}

function StatusSheet({ kind, notify, recent, onClose, onPost }: {
  kind: string; notify: boolean; recent: ServerFile[]; onClose: () => void;
  onPost: (p: { note: string; photo: File | null; fileId: string | null }) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const preview = useBlobUrl(photo);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 sm:items-center sm:justify-center" role="dialog" aria-label="Post status update" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-black">{EVENT_LABEL[kind] ?? "Update"}</h3>
        <p className="mb-3 text-sm text-slate-600">{notify ? "The homeowner gets a text with a link to their portal." : "Homeowner will not be texted."}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-label="Note"
          placeholder={kind === "note" ? "What should the homeowner (and office) know?" : "Optional note"}
          className="mb-3 block w-full rounded-xl p-3 text-base ring-1 ring-slate-300" />
        <label className="mb-2 flex min-h-14 cursor-pointer items-center justify-center rounded-xl bg-white text-base font-bold ring-2 ring-slate-900">
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setFileId(null); }} />
          {photo ? "Retake photo" : "+ Add photo (optional)"}
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="mb-2 h-32 rounded-xl object-cover" />
        )}
        {!photo && recent.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Or attach a recent photo</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recent.map((f) => (
                <button key={f.id} type="button" onClick={() => setFileId(fileId === f.id ? null : f.id)} aria-pressed={fileId === f.id}
                  className={cx("h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2", fileId === f.id ? "ring-brand-500" : "ring-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.url && <img src={f.url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="min-h-14 rounded-xl text-base font-semibold ring-1 ring-slate-300">Cancel</button>
          <button type="button" disabled={posting || (kind === "note" && !note.trim())}
            onClick={async () => { setPosting(true); try { await onPost({ note: note.trim(), photo, fileId }); } finally { setPosting(false); } }}
            className="min-h-14 rounded-xl bg-brand-500 text-base font-black text-white disabled:opacity-50">
            {posting ? "Saving…" : "Post update"}
          </button>
        </div>
      </div>
    </div>
  );
}
