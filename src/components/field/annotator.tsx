"use client";

import { useEffect, useRef, useState } from "react";
import { drawShapes, flatten } from "@/lib/field-image";
import type { Shape } from "@/lib/field-queue";

/**
 * Full-screen chalk-style markup: drag to draw circles or arrows in brand orange.
 * Saves the shapes as JSON plus a flattened JPEG.
 */
export function Annotator({ src, initial, onSave, onClose }: {
  src: string;
  initial?: Shape[];
  onSave: (shapes: Shape[], flattened: Blob) => Promise<void> | void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>(initial ?? []);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<"circle" | "arrow">("circle");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    if (/^https?:/.test(src)) i.crossOrigin = "anonymous";
    i.onload = () => {
      img.current = i;
      setReady(true);
    };
    i.onerror = () => setErr("Couldn't load the photo (no signal?). Try again when online.");
    i.src = src;
  }, [src]);

  useEffect(() => {
    const c = canvas.current;
    const i = img.current;
    if (!c || !i || !ready) return;
    const maxW = Math.min(window.innerWidth - 16, 1200);
    const maxH = window.innerHeight - 170;
    const s = Math.min(maxW / i.naturalWidth, maxH / i.naturalHeight);
    c.width = Math.round(i.naturalWidth * s);
    c.height = Math.round(i.naturalHeight * s);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0, c.width, c.height);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, c.width, c.height);
  }, [ready, shapes, draft]);

  const rel = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const shapeFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Shape => {
    const c = canvas.current!;
    if (tool === "arrow") return { type: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    const dx = (b.x - a.x) * c.width, dy = (b.y - a.y) * c.height;
    return { type: "circle", x: a.x, y: a.y, r: Math.hypot(dx, dy) / Math.min(c.width, c.height) };
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Mark up photo">
      <div className="flex items-center gap-2 p-2">
        {(["circle", "arrow"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTool(t)}
            className={`min-h-12 flex-1 rounded-xl text-base font-semibold ${tool === t ? "bg-brand-500 text-white" : "bg-slate-800 text-white"}`}>
            {t === "circle" ? "◯ Circle" : "➚ Arrow"}
          </button>
        ))}
        <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}
          className="min-h-12 rounded-xl bg-slate-800 px-4 font-semibold text-white disabled:opacity-40">Undo</button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {err ? <p className="p-6 text-center text-white">{err}</p> : !ready ? <p className="text-white">Loading…</p> : (
          <canvas
            ref={canvas}
            style={{ touchAction: "none" }}
            aria-label="Photo markup area: drag to draw"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = rel(e); }}
            onPointerMove={(e) => { if (start.current) setDraft(shapeFrom(start.current, rel(e))); }}
            onPointerUp={(e) => {
              if (!start.current) return;
              const s = shapeFrom(start.current, rel(e));
              start.current = null;
              setDraft(null);
              const big = s.type === "circle" ? s.r > 0.015 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.03;
              if (big) setShapes((x) => [...x, s]);
            }}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="min-h-14 rounded-xl bg-slate-800 text-lg font-semibold text-white">Cancel</button>
        <button type="button" disabled={!ready || saving}
          onClick={async () => {
            if (!img.current) return;
            setSaving(true);
            try {
              await onSave(shapes, await flatten(img.current, shapes));
            } catch (e) {
              setErr((e as Error).message);
              setSaving(false);
            }
          }}
          className="min-h-14 rounded-xl bg-brand-500 text-lg font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save markup"}
        </button>
      </div>
    </div>
  );
}
