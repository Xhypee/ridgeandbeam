"use client";

import { useEffect, useRef, useState } from "react";
import { openPdf, type OpenPdf } from "@/lib/plans/pdf-client";

/** Plan sheets drawn with pdf.js. Give it key={url} so a new file starts fresh. (works the same on phones, where browsers often won't show PDFs inline). */
export function PdfViewer({ url, name }: { url: string; name: string }) {
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Couldn't load the file (${r.status}).`))))
      .then((buf) => openPdf(buf))
      .then((p) => { if (!off) setPdf(p); })
      .catch((e) => { if (!off) { setErr(e instanceof Error ? e.message : "Couldn't open this PDF."); setBusy(false); } });
    return () => { off = true; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvas.current || !box.current) return;
    let off = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const pg = await pdf.doc.getPage(page + 1);
      if (off) return;
      setBusy(true);
      const base = pg.getViewport({ scale: 1 });
      const fit = (box.current!.clientWidth - 2) / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: fit * zoom * dpr });
      const c = canvas.current!;
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      c.style.width = `${Math.ceil(vp.width / dpr)}px`;
      c.style.height = `${Math.ceil(vp.height / dpr)}px`;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      task = pg.render({ canvasContext: ctx, viewport: vp }) as unknown as { cancel: () => void; promise: Promise<void> };
      await task.promise.catch(() => undefined);
      if (!off) setBusy(false);
    })();
    return () => { off = true; task?.cancel(); };
  }, [pdf, page, zoom]);

  const btn = "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40";
  return (
    <div className="relative">
      <div ref={box} className="h-[72vh] overflow-auto bg-slate-100" data-pdf-viewer={name}>
        {err ? <p className="p-6 text-sm text-red-700">{err}</p> : <canvas ref={canvas} className="mx-auto block bg-white" aria-label={`${name}, page ${page + 1}`} />}
        {busy && !err && <p className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">Loading…</p>}
      </div>
      {pdf && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-ink px-2 py-1 text-white">
          <button type="button" className={btn} aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>−</button>
          <span className="w-12 text-center text-sm tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
          <button type="button" className={btn} aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}>+</button>
          <button type="button" className={btn} onClick={() => setZoom(1)}>Fit</button>
          {pdf.numPages > 1 && (
            <>
              <span className="mx-1 h-4 w-px bg-white/30" />
              <button type="button" className={btn} aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
              <span className="text-sm tabular-nums text-white/80">{page + 1} / {pdf.numPages}</span>
              <button type="button" className={btn} aria-label="Next page" disabled={page >= pdf.numPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
