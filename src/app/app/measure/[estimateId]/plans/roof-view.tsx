"use client";

// The roof card: "All measurements" (flat plan over the PDF page, every line labelled, tap to edit) and "Interact"
// (3D model: drag to spin, hover a panel to see its edges, area and sheets). Everything is in real millimetres.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Pt } from "@/lib/plans/geometry";
import { dist, lineSide, segDist, sub, turnDeg, unit } from "@/lib/plans/geometry";
import { KIND_LABEL, type EdgeType, type LineKind, type RoofAnalysis } from "@/lib/plans/roof-model";
import type { Piece } from "@/lib/plans/sheets";

export type Tool = "type" | "add" | "delete" | "measure";
type Kind = LineKind | EdgeType;
export const KIND_COLOR: Record<Kind, string> = { eave: "#2563eb", ridge: "#dc2626", hip: "#ea7a1a", valley: "#8a7a12", barge: "#7c3aed", apron: "#475569" };

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

type Props = {
  analysis: RoofAnalysis;
  pitch: number;
  tab: "interact" | "all";
  onTab: (t: "interact" | "all") => void;
  image: { url: string; w: number; h: number } | null;
  showSheets: boolean;
  colour: string;
  pieces: Piece[] | null;
  bump: number;
  tool: Tool;
  selected: number | null;
  draft: Pt | null;
  readOnly: boolean;
  hint?: string;
  onLine: (i: number) => void;
  onPoint: (p: Pt) => void;
};

export function RoofView({ analysis: a, pitch, tab, onTab, image, showSheets, colour, pieces, bump, tool, selected, draft, readOnly, hint, onLine, onPoint }: Props) {
  const [hoverFace, setHoverFace] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [spin, setSpin] = useState(0.35);
  const drag = useRef<{ x: number; spin: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 620 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const r = e.contentRect; if (r.width > 50 && r.height > 50) setBox({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tilt = tab === "interact";

  // 0 = flat plan, 1 = 3D, animated between.
  const [tt, setTt] = useState(0);
  const ttRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const from = ttRef.current, to = tilt ? 1 : 0, t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const v = from + (to - from) * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
      ttRef.current = v;
      setTt(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tilt]);

  const geo = useMemo(() => {
    const pts = a.faces.flatMap((f) => f.pts);
    if (!pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    const diag = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(0.35, Math.min(4, diag / 26000)); // label scale (1 ≈ a 26 m roof)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const C = Math.cos(Math.PI / 6), S = Math.sin(Math.PI / 6);
    const iso = (q: Pt, th: number, hgt: number): Pt => {
      const dx = q[0] - cx, dy = q[1] - cy;
      const rx = dx * Math.cos(th) - dy * Math.sin(th), ry = dx * Math.sin(th) + dy * Math.cos(th);
      return [cx + (rx - ry) * C, cy + (rx + ry) * S - hgt];
    };
    // One fixed 3D frame that fits the roof at every spin angle (no zoom jumps while dragging).
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let s = 0; s < 24; s++) for (const q of pts) {
      const [X, Y] = iso(q, (s * Math.PI) / 12, a.height(q));
      X0 = Math.min(X0, X); Y0 = Math.min(Y0, Y); X1 = Math.max(X1, X); Y1 = Math.max(Y1, Y + 1400 * k);
    }
    // extra room on the right for the panel card
    const isoVb = [X0 - 300 * k, Y0 - 1400 * k, (X1 - X0) * 1.45 + 600 * k, Y1 - Y0 + 1700 * k];
    const m = 0.06 * diag + 1500 * k;
    const flatVb = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
    // Gentle per-panel tone so the 3D shape reads: Newell normal · light from the upper left.
    const light = [-0.45, -0.55, 0.7];
    const raw = a.faces.map((f) => {
      const v = f.pts.map((q) => [q[0], q[1], a.height(q)]);
      const n = [0, 0, 0];
      v.forEach((p, i) => {
        const q = v[(i + 1) % v.length];
        n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]);
      });
      if (n[2] < 0) n.forEach((_, i) => { n[i] = -n[i]; });
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      return (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / len;
    });
    const mean = raw.reduce((t, r) => t + r, 0) / (raw.length || 1);
    const bright = raw.map((r) => Math.max(-0.16, Math.min(0.16, (r - mean) * 1.2)));
    // Panel facts: each edge (straight gutter pieces joined) with its 3D length and type.
    const panels = a.faces.map((f, fi) => {
      const list: { kind: Kind; a: Pt; b: Pt; len: number }[] = [];
      for (const ei of f.edges) {
        const e = a.edges[ei];
        if (!e?.type || e.true < 150) continue;
        // orient along the face cycle
        const last = list[list.length - 1];
        if (last && last.kind === "eave" && e.type === "eave" && Math.abs(turnDeg(unit(sub(last.b, last.a)), unit(sub(e.b, e.a)))) % 180 < 6) {
          last.b = dist(last.b, e.a) < dist(last.b, e.b) ? e.b : e.a;
          last.len += e.true;
          continue;
        }
        list.push({ kind: e.type, a: e.a, b: e.b, len: e.true });
      }
      const mine = (pieces ?? []).filter((p) => p.face === fi);
      return { edges: list, sheets: mine.length, longest: Math.max(0, ...mine.map((p) => p.lengthMm)) };
    });
    return { iso, isoVb, flatVb, bright, panels, k };
  }, [a, pieces]);

  if (!geo) {
    return (
      <div className="grid h-[560px] place-items-center rounded-[28px] bg-white px-6 text-center ring-1 ring-slate-200">
        <p className="max-w-sm text-slate-600">No closed roof outline on this sheet yet. Pick another sheet, or use <b>Add a line</b> to draw the outline.</p>
      </div>
    );
  }
  const k = geo.k;
  const P = (q: Pt, h = a.height(q)): Pt => { const i = geo.iso(q, spin, h); return [q[0] + (i[0] - q[0]) * tt, q[1] + (i[1] - q[1]) * tt]; };
  const ptsStr = (ps: Pt[], hs?: (q: Pt) => number) => ps.map((q) => P(q, hs ? hs(q) : a.height(q)).join(",")).join(" ");
  const vbA = geo.flatVb.map((v, i) => v + (geo.isoVb[i] - v) * tt);
  const vb = vbA.join(" ");
  // millimetres per screen pixel, so labels and lines keep a readable size whatever the roof's size
  const u = Math.max(vbA[2] / box.w, vbA[3] / box.h);
  const px = (n: number) => n * u;
  const pill = (text: string, size: number) => ({ w: px(text.length * size * 0.62 + size * 1.3), h: px(size * 1.75), f: px(size) });
  const lit = (col: string, i: number) => {
    const m = col.startsWith("#") ? [1, 3, 5].map((x) => parseInt(col.slice(x, x + 2), 16)) : (col.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
    const f = (geo.bright[i] ?? 0) * tt, to = f > 0 ? 255 : 0;
    return `rgb(${m.map((c) => Math.round(c + (to - c) * Math.abs(f))).join(",")})`;
  };
  const panel = hoverFace !== null ? geo.panels[hoverFace] : null;
  const editing = !readOnly && tab === "all" && tt === 0 && !showSheets;

  const toSvg = (e: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const onPointerDown = (e: RPointerEvent) => { if (tab === "interact") drag.current = { x: e.clientX, spin }; };
  const onPointerMove = (e: RPointerEvent) => {
    if (drag.current) setSpin(drag.current.spin + (e.clientX - drag.current.x) * 0.008);
    if (editing && (tool === "add" || draft)) setCursor(toSvg(e));
  };

  // Labels: inner lines and outline runs, at their middle (outline labels pushed outside the roof).
  // Labels: every inner line and outline run, placed along its line where it doesn't cover another label
  // (outline labels sit just outside the roof). Longer lines get first pick.
  const labels: { at: Pt; text: string; kind: Kind; small: boolean }[] = [];
  if (tab === "all" && tt === 0) {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const runs = a.runs.filter((r) => r.edges.length && a.edges[r.edges[0]]?.role !== "loose").sort((x, y) => y.true - x.true);
    for (const r of runs) {
      const e0 = a.edges[r.edges[0]];
      const small = e0.role === "outline";
      const text = `${(r.true / 1000).toFixed(2)} m`;
      const b = pill(text, small ? 11 : 12.5);
      let p0 = r.a, p1 = r.b, off: Pt = [0, 0];
      if (small) {
        const best = r.edges.map((i) => a.edges[i]).sort((x, y) => y.plan - x.plan)[0];
        p0 = best.a; p1 = best.b;
        const fi = best.faces[0];
        const inside = a.faces[fi] ? lineSide(a.faces[fi].label, best.a, best.b) : 1;
        const n = unit([-(best.b[1] - best.a[1]), best.b[0] - best.a[0]]);
        const sgn = inside > 0 ? -1 : 1;
        off = [n[0] * sgn * px(16), n[1] * sgn * px(16)];
      }
      const along = (t: number): Pt => [p0[0] + (p1[0] - p0[0]) * t + off[0], p0[1] + (p1[1] - p0[1]) * t + off[1]];
      const nrm = unit([-(p1[1] - p0[1]), p1[0] - p0[0]]);
      const cands: Pt[] = [0.5, 0.32, 0.68, 0.2, 0.8].map(along);
      const m = along(0.5);
      for (const k of [1, -1, 2, -2, 3, -3]) cands.push([m[0] + nrm[0] * k * b.h * 1.1, m[1] + nrm[1] * k * b.h * 1.1]);
      const pad = px(2);
      const box = (c: Pt) => ({ x0: c[0] - b.w / 2 - pad, y0: c[1] - b.h / 2 - pad, x1: c[0] + b.w / 2 + pad, y1: c[1] + b.h / 2 + pad });
      const overlap = (q: ReturnType<typeof box>) => placed.reduce((sum, o) => sum + Math.max(0, Math.min(q.x1, o.x1) - Math.max(q.x0, o.x0)) * Math.max(0, Math.min(q.y1, o.y1) - Math.max(q.y0, o.y0)), 0);
      // first spot that is free, else the one that covers least
      let at = cands[0], least = Infinity;
      for (const c of cands) {
        const ov = overlap(box(c));
        if (ov === 0) { at = c; break; }
        if (ov < least) { least = ov; at = c; }
      }
      placed.push(box(at));
      labels.push({ at, text, kind: r.kind as Kind, small });
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200"
      onMouseLeave={() => { setHoverFace(null); setHoverEdge(null); setCursor(null); }}
      data-testid="roof-view"
    >
      <div className="pointer-events-none absolute inset-x-5 top-5 z-10 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Roof view">
          {([["interact", "Interact"], ["all", "All measurements"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => onTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "text-slate-600 hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "all" && hint && <p className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200" data-testid="roof-hint">{hint}</p>}
        {tab === "interact" && (
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="hidden rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200 sm:inline">Drag to spin · hover a panel</span>
            <button type="button" aria-label="Spin left" onClick={() => setSpin((v) => v - Math.PI / 4)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50">⟲</button>
            <button type="button" aria-label="Spin right" onClick={() => setSpin((v) => v + Math.PI / 4)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50">⟳</button>
          </div>
        )}
      </div>
      <div
        ref={boxRef}
        className={`h-[520px] px-3 pb-3 pt-20 sm:h-[720px] sm:px-4 sm:pb-4 ${tab === "interact" ? "cursor-grab active:cursor-grabbing" : editing && (tool === "add" || tool === "measure") ? "cursor-crosshair" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        <svg
          ref={svgRef}
          viewBox={vb}
          className="h-full w-full touch-none select-none"
          role="img"
          aria-label="Roof measured from the plans"
          onClick={(e) => { if (editing && tool === "add") { const p = toSvg(e); if (p) onPoint(p); } }}
        >
          <defs><filter id="rb-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={420 * k} /></filter></defs>
          {image && <image href={image.url} x={0} y={0} width={image.w} height={image.h} opacity={(showSheets ? 0.08 : 0.22) * (1 - tt)} preserveAspectRatio="none" />}
          {tt > 0 && a.outlines.map((loop, i) => (
            // The roof sits on the house: a soft patch of shade on the ground below it.
            <polygon key={`g${i}`} data-testid="ground-shade" points={loop.map((q) => { const p = geo.iso(q, spin, 0); return `${p[0] + 900 * k},${p[1] + 2300 * k}`; }).join(" ")} fill="#13221a" opacity={0.22 * tt} filter="url(#rb-soft)" />
          ))}
          {a.faces.map((f, i) => (
            <polygon
              key={i}
              data-testid="roof-panel"
              data-panel={f.name}
              points={ptsStr(f.pts)}
              fill={!showSheets ? lit(hoverFace === i ? "#8fd0a8" : "#cfe6d7", i) : lit(shade(colour, hoverFace === i && tt > 0 ? 45 : 25), i)}
              fillOpacity={!showSheets ? (tt > 0 ? 1 : 0.7) : 1}
              stroke="white" strokeWidth={px(1.2)}
              style={{ animation: `rb-fade .5s ${0.3 + i * 0.06}s both`, transition: "fill .2s", cursor: tab === "interact" ? "pointer" : "default" }}
              onMouseEnter={() => setHoverFace(i)} onMouseLeave={() => setHoverFace(null)}
            />
          ))}
          {showSheets && (pieces ?? []).map((st, i) => (
            <polygon
              key={`s${i}-${bump}`}
              className="rb-sheet"
              points={ptsStr(st.pts, (q) => a.faceHeight(st.face, q))}
              fill={lit(shade(colour, (st.k % 2 ? 8 : -8) + (hoverFace === st.face && tt > 0 ? 30 : 0)), st.face)}
              stroke={shade(colour, -40)} strokeWidth={px(0.6)}
              style={{ animationDelay: `${(st.face * 0.1 + st.k * 0.02).toFixed(3)}s`, pointerEvents: "none" }}
            />
          ))}
          {a.edges.map((e) => {
            if (e.role === "loose" || !e.type) return null;
            const isSel = selected === e.i, isHover = hoverEdge === e.i && editing;
            const col = KIND_COLOR[e.type];
            const pa = P(e.a), pb = P(e.b);
            const clickable = editing && (tool === "type" || tool === "delete" || tool === "measure");
            return (
              <g key={`e${e.i}`} data-testid="roof-line" data-kind={e.type} data-role={e.role} data-index={e.i}
                onClick={(ev) => { if (clickable) { ev.stopPropagation(); onLine(e.i); } }}
                onMouseEnter={() => setHoverEdge(e.i)} onMouseLeave={() => setHoverEdge(null)}
                style={{ cursor: clickable ? "pointer" : "default", pointerEvents: tab === "all" && tt === 0 ? "auto" : "none" }}>
                <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke="transparent" strokeWidth={px(22)} />
                <line className="rb-line" pathLength={1} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                  stroke={isSel ? "#13221a" : tool === "delete" && isHover ? "#dc2626" : col}
                  strokeWidth={px(e.role === "outline" ? 3.5 : 4) * (isSel || isHover ? 1.7 : 1)} strokeLinecap="round"
                  strokeDasharray={tool === "delete" && isHover ? `${0.04} ${0.03}` : undefined}
                  style={{ animationDelay: `${0.2 + (e.i % 40) * 0.03}s`, transition: "stroke .25s" }} />
              </g>
            );
          })}
          {labels.map((l, i) => {
            const b = pill(l.text, l.small ? 11 : 12.5);
            return (
              <g key={`t${i}`} style={{ animation: `rb-pop .35s ${0.8 + i * 0.03}s both`, transformOrigin: `${l.at[0]}px ${l.at[1]}px`, pointerEvents: "none" }} data-testid="line-label">
                <rect x={l.at[0] - b.w / 2} y={l.at[1] - b.h / 2} width={b.w} height={b.h} rx={b.h / 2} fill="white" stroke={KIND_COLOR[l.kind]} strokeWidth={px(1.5)} />
                <text x={l.at[0]} y={l.at[1] + b.f * 0.36} textAnchor="middle" fontSize={b.f} fontWeight={800} fill={KIND_COLOR[l.kind]}>{l.text}</text>
              </g>
            );
          })}
          {editing && draft && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={draft[0]} cy={draft[1]} r={px(7)} fill="#13221a" />
              {cursor && <line x1={draft[0]} y1={draft[1]} x2={cursor[0]} y2={cursor[1]} stroke="#13221a" strokeWidth={px(3)} strokeDasharray={`${px(10)} ${px(7)}`} />}
            </g>
          )}
          {panel && hoverFace !== null && tt > 0.95 && panel.edges.map((e, i) => {
            const [ax, ay] = P(e.a), [bx, by] = P(e.b), mx = (ax + bx) / 2, my = (ay + by) / 2;
            const text = `${(e.len / 1000).toFixed(2)} m`, b = pill(text, 15);
            return (
              <g key={`pe${i}`} style={{ pointerEvents: "none" }} data-testid="edge-3d-label">
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke={KIND_COLOR[e.kind]} strokeWidth={px(6)} strokeLinecap="round" />
                <rect x={mx - b.w / 2} y={my - b.h / 2} width={b.w} height={b.h} rx={b.h / 2} fill="white" stroke={KIND_COLOR[e.kind]} strokeWidth={px(2)} />
                <text x={mx} y={my + b.f * 0.36} textAnchor="middle" fontSize={b.f} fontWeight={800} fill={KIND_COLOR[e.kind]}>{text}</text>
              </g>
            );
          })}
          {hoverFace !== null && tt === 0 && !showSheets && (() => {
            const f = a.faces[hoverFace];
            const [lx, ly] = P(f.label);
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={lx - px(52)} y={ly - px(17)} width={px(104)} height={px(34)} rx={px(17)} fill="#13221a" />
                <text x={lx} y={ly + px(6)} textAnchor="middle" fontSize={px(17)} fontWeight={800} fill="white">{f.area.toFixed(1)} m²</text>
              </g>
            );
          })()}
        </svg>
      </div>
      {panel && hoverFace !== null && tt > 0.95 && (
        <div className="pointer-events-none absolute bottom-5 right-5 z-20 w-64 rounded-2xl bg-white p-4 ring-1 ring-slate-200" data-testid="panel-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{a.faces[hoverFace].name}</p>
          <p className="font-display text-3xl font-bold text-ink">{a.faces[hoverFace].area.toFixed(1)} m²</p>
          <p className="text-sm text-slate-500">{pitch}° pitch</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {panel.edges.map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="h-1.5 w-5 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
                <span className="text-slate-600">{KIND_LABEL[e.kind]}</span>
                <span className="ml-auto font-semibold tabular-nums text-ink">{(e.len / 1000).toFixed(2)} m</span>
              </li>
            ))}
          </ul>
          {panel.sheets > 0 && <p className="mt-3 border-t border-slate-100 pt-2 text-sm text-slate-600"><b className="text-ink">{panel.sheets} sheets</b>, longest {(panel.longest / 1000).toFixed(2)} m</p>}
        </div>
      )}
    </div>
  );
}

/** Nearest drawn line to a point (real mm) within tol; -1 if none. Used by the page for tool clicks. */
export function nearestEdge(a: RoofAnalysis, p: Pt, tol: number): number {
  let best = -1, bd = tol;
  for (const e of a.edges) { const d = segDist(p, e.a, e.b); if (d < bd) { bd = d; best = e.i; } }
  return best;
}
