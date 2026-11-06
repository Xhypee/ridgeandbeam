"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Finger / mouse signature. Writes a PNG data URL into a hidden input named `name`
 * so it submits with the surrounding <form>. Empty until the user draws.
 */
export function SignaturePad({ name = "signature", required = false, height = 160 }: { name?: string; required?: boolean; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = c.offsetWidth;
      c.width = w * ratio;
      c.height = height * ratio;
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [height]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    input.current!.value = canvas.current!.toDataURL("image/png");
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    input.current!.value = "";
    setEmpty(true);
  };

  return (
    <div>
      <div className="relative rounded-lg bg-white ring-1 ring-slate-300">
        <canvas
          ref={canvas}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Signature area: draw your signature"
          role="img"
        />
        {empty && <span className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-slate-400">Sign here with your finger or mouse</span>}
        <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-slate-300" />
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={clear} className="text-xs font-medium text-slate-500 hover:text-slate-800">Clear</button>
      </div>
      {/* Hidden carrier for the PNG; a required text input enforces signing before submit. */}
      <input ref={input} type="text" name={name} required={required} defaultValue="" className="sr-only" tabIndex={-1} aria-hidden onInvalid={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity("Please sign above")} onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity("")} />
    </div>
  );
}
