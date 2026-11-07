// Read vector line work and text off a PDF page with pdf.js (pdfjs-dist). The caller passes the loaded page and
// pdf.js's OPS table, so this module has no pdf.js import of its own (works with the browser build and the
// Node "legacy" build used by local scripts).
//
// Output units are PAPER millimetres, y down, origin at the page's top-left (after the page's rotation), so they
// line up with a rendered image of the page. Real size = paper mm × drawing scale.

import type { Pt } from "./geometry";

/** A stroked straight piece of line work: ends, pen width (paper mm) and colour. */
export type VSeg = { a: Pt; b: Pt; w: number; c: string };
export type VText = { s: string; x: number; y: number; size: number; angle: number };
export type PageData = { index: number; widthMm: number; heightMm: number; segs: VSeg[]; texts: VText[] };

type Matrix = [number, number, number, number, number, number];
const PT_MM = 25.4 / 72;
const mmul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** Minimal shapes of the pdf.js objects we use (structural, so either build fits). */
export type PdfPageLike = {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent(): Promise<{ items: unknown[] }>;
};
export type OpsLike = Record<string, number>;

const asNums = (v: unknown): number[] => (Array.isArray(v) ? (v as number[]) : v && typeof v === "object" && "length" in (v as object) ? Array.from(v as ArrayLike<number>) : []);

function toHexColour(args: unknown): string {
  const a = asNums(args);
  if (typeof args === "string") return args;
  if (Array.isArray(args) && typeof args[0] === "string") return args[0] as string;
  if (a.length >= 3) return hex(a[0], a[1], a[2]);
  if (a.length === 1) return hex(a[0] * 255, a[0] * 255, a[0] * 255);
  return "#000000";
}

/** Stroked line work of a page (curves become chords; filled shapes are ignored). */
export async function pageSegments(page: PdfPageLike, OPS: OpsLike): Promise<{ segs: VSeg[]; widthMm: number; heightMm: number }> {
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as Matrix;
  const ol = await page.getOperatorList();
  const segs: VSeg[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let lw = 1;
  let colour = "#000000";
  const stack: { ctm: Matrix; lw: number; colour: string }[] = [];
  let path: [Pt, Pt][] = [];

  const flush = (stroke: boolean) => {
    if (stroke && path.length) {
      const m = mmul(ctm, base);
      const scaleW = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const w = Math.max(0, lw) * scaleW * PT_MM;
      for (const [p, q] of path) {
        const a = apply(m, p[0], p[1]), b = apply(m, q[0], q[1]);
        segs.push({ a: [a[0] * PT_MM, a[1] * PT_MM], b: [b[0] * PT_MM, b[1] * PT_MM], w: Math.round(w * 1000) / 1000, c: colour });
      }
    }
    path = [];
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as unknown[] | null;
    switch (fn) {
      case OPS.save: stack.push({ ctm, lw, colour }); break;
      case OPS.restore: { const s = stack.pop(); if (s) ({ ctm, lw, colour } = s); break; }
      case OPS.transform: ctm = mmul(asNums(args) as Matrix, ctm); break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ctm, lw, colour });
        const m = asNums(args?.[0]);
        if (m.length === 6) ctm = mmul(m as Matrix, ctm);
        break;
      }
      case OPS.paintFormXObjectEnd: { const s = stack.pop(); if (s) ({ ctm, lw, colour } = s); break; }
      case OPS.setLineWidth: lw = Number(asNums(args)[0]) || 0; break;
      case OPS.setStrokeRGBColor: case OPS.setStrokeColor: case OPS.setStrokeGray: colour = toHexColour(args); break;
      case OPS.constructPath: {
        const ops = asNums(args?.[0]);
        const co = asNums(args?.[1]);
        let k = 0;
        let cur: Pt | null = null, start: Pt | null = null;
        for (const op of ops) {
          if (op === OPS.moveTo) { cur = start = [co[k], co[k + 1]]; k += 2; }
          else if (op === OPS.lineTo) { const p: Pt = [co[k], co[k + 1]]; k += 2; if (cur) path.push([cur, p]); cur = p; }
          else if (op === OPS.curveTo) { const p: Pt = [co[k + 4], co[k + 5]]; k += 6; if (cur) path.push(...bezier(cur, [co[k - 6], co[k - 5]], [co[k - 4], co[k - 3]], p)); cur = p; }
          else if (op === OPS.curveTo2) { const p: Pt = [co[k + 2], co[k + 3]]; const c2: Pt = [co[k], co[k + 1]]; k += 4; if (cur) path.push(...bezier(cur, cur, c2, p)); cur = p; }
          else if (op === OPS.curveTo3) { const p: Pt = [co[k + 2], co[k + 3]]; const c1: Pt = [co[k], co[k + 1]]; k += 4; if (cur) path.push(...bezier(cur, c1, p, p)); cur = p; }
          else if (op === OPS.closePath) { if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1])) path.push([cur, start]); cur = start; }
          else if (op === OPS.rectangle) {
            const [x, y, w, h] = [co[k], co[k + 1], co[k + 2], co[k + 3]]; k += 4;
            const p0: Pt = [x, y], p1: Pt = [x + w, y], p2: Pt = [x + w, y + h], p3: Pt = [x, y + h];
            path.push([p0, p1], [p1, p2], [p2, p3], [p3, p0]);
            cur = start = p0;
          }
        }
        break;
      }
      case OPS.stroke: case OPS.closeStroke: case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke:
        flush(true); break;
      case OPS.fill: case OPS.eoFill: case OPS.endPath:
        flush(false); break;
      default: break;
    }
  }
  return { segs, widthMm: vp.width * PT_MM, heightMm: vp.height * PT_MM };
}

/** A cubic Bézier as 4 chords (plenty for drawing arcs in a roof plan). */
function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt): [Pt, Pt][] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return pts.slice(0, -1).map((p, i) => [p, pts[i + 1]] as [Pt, Pt]);
}

/** Text runs with their position (paper mm, y down), size and angle (degrees, 0 = reading left to right). */
export async function pageTexts(page: PdfPageLike): Promise<VText[]> {
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as Matrix;
  const tc = await page.getTextContent();
  const out: VText[] = [];
  for (const raw of tc.items) {
    const it = raw as { str?: string; transform?: number[] };
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const m = mmul(it.transform as Matrix, base);
    const size = Math.hypot(m[2], m[3]) * PT_MM;
    const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    out.push({ s: it.str, x: m[4] * PT_MM, y: m[5] * PT_MM, size: Math.round(size * 100) / 100, angle: Math.round(angle) });
  }
  return out;
}

export async function readPage(page: PdfPageLike, OPS: OpsLike, index: number): Promise<PageData> {
  const [{ segs, widthMm, heightMm }, texts] = await Promise.all([pageSegments(page, OPS), pageTexts(page)]);
  return { index, widthMm, heightMm, segs, texts };
}

/** Paper size name from the page size (A0–A4, either orientation). */
export function paperSize(wMm: number, hMm: number): string | null {
  const [s, l] = [Math.min(wMm, hMm), Math.max(wMm, hMm)];
  const sizes: [string, number, number][] = [["A4", 210, 297], ["A3", 297, 420], ["A2", 420, 594], ["A1", 594, 841], ["A0", 841, 1189]];
  for (const [n, a, b] of sizes) if (Math.abs(s - a) < 8 && Math.abs(l - b) < 8) return n;
  return null;
}
