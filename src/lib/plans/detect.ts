// Find the roof in a set of plan pages: which page is the roof plan, the drawing scale, the pitch, which pen draws
// the roof, and the roof's line work. Pure (takes the extracted PageData from ./pdf).

import {
  area as polyArea, cleanSegments, components, dist, interiorPoint, key, mergeCollinear, planarFaces, pointInPolygon, pruneDangling, segDist, signedArea, sub, turnDeg, unit,
  type Pt, type Seg,
} from "./geometry";
import { analyzeRoof, type PlanLine, type PlanModel } from "./roof-model";
import { paperSize, type PageData, type VSeg, type VText } from "./pdf";

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------
const STD_SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 1000];

/** "1:100", "SCALE 1 : 100", "1/100", "SCALE 1:100 @ A3" → 100. Null when absent or implausible. */
export function parseScale(text: string): number | null {
  const m = String(text ?? "").match(/\b1\s*[:/]\s*(\d{1,4})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 5 && n <= 2000 ? n : null;
}
/** "@ A3" / "AT A1" → "A3". */
export function parsePaper(text: string): string | null {
  const m = String(text ?? "").toUpperCase().match(/(?:@|\bAT)\s*(A[0-4])\b/);
  return m ? m[1] : null;
}

/**
 * Scale from dimension strings: a number like "5500" written beside a drawn line whose paper length × scale is
 * 5500 mm. Each dimension votes for the standard scale it fits; the winner needs at least 3 votes.
 */
export function inferScaleFromDimensions(page: Pick<PageData, "segs" | "texts">): number | null {
  const nums = page.texts.filter((t) => /^\d{3,5}$/.test(t.s.trim())).slice(0, 400);
  if (nums.length < 3) return null;
  const votes = new Map<number, number>();
  const segs = page.segs.filter((s) => dist(s.a, s.b) > 3);
  for (const t of nums) {
    const v = Number(t.s.trim());
    const ang = (t.angle * Math.PI) / 180;
    const dir: Pt = [Math.cos(ang), Math.sin(ang)];
    let hit: number | null = null;
    for (const s of segs) {
      const L = dist(s.a, s.b);
      const d: Pt = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L];
      if (Math.abs(d[0] * dir[0] + d[1] * dir[1]) < 0.98) continue; // dimension lines run along the text
      if (segDist([t.x, t.y], s.a, s.b) > Math.max(4, t.size * 2.5)) continue;
      const k = v / L;
      const std = STD_SCALES.find((n) => Math.abs(k - n) / n < 0.02);
      if (std) { hit = std; break; }
    }
    if (hit) votes.set(hit, (votes.get(hit) ?? 0) + 1);
  }
  let best: number | null = null, bv = 2;
  for (const [n, c] of votes) if (c > bv) { bv = c; best = n; }
  return best;
}

export type ScaleInfo = { scale: number; source: "label" | "dimensions" | "other_sheet" | "default"; paper: string | null; text: string };

/** The page's drawing scale: a "1:100" label on the page, else its dimensions, else another sheet's, else 1:100. */
export function pageScale(page: PageData, all: PageData[]): ScaleInfo {
  const paper = page.texts.map((t) => parsePaper(t.s)).find(Boolean) ?? paperSize(page.widthMm, page.heightMm);
  const labels = page.texts.map((t) => parseScale(t.s)).filter((n): n is number => n != null);
  const fmt = (n: number) => `1:${n}${paper ? ` at ${paper}` : ""}`;
  if (labels.length) {
    const n = mode(labels);
    return { scale: n, source: "label", paper, text: fmt(n) };
  }
  const dims = inferScaleFromDimensions(page);
  if (dims) return { scale: dims, source: "dimensions", paper, text: fmt(dims) };
  // Another plan sheet of the same paper size (floor plans are usually at the roof plan's scale).
  const others = all.filter((p) => p !== page && Math.abs(p.widthMm - page.widthMm) < 5 && /FLOOR\s*PLAN/i.test(p.texts.map((t) => t.s).join(" ")));
  for (const o of others) {
    const n = o.texts.map((t) => parseScale(t.s)).find((x) => x != null) ?? inferScaleFromDimensions(o);
    if (n) return { scale: n, source: "other_sheet", paper, text: fmt(n) };
  }
  return { scale: 100, source: "default", paper, text: fmt(100) };
}

function mode(xs: number[]): number {
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------
/** Degree labels on a page: "23°", "22.5 °", "25 deg", "PITCH 22.5" (1–60°). */
export function pitchLabels(texts: Pick<VText, "s">[]): number[] {
  const out: number[] = [];
  for (const t of texts) {
    const s = t.s.replace(/\s+/g, " ");
    for (const m of s.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s?(?:°|º|deg\b|degrees?\b)/gi)) {
      // skip bearings like 100° 34' 25"
      if (/\d+\s?°\s?\d+\s?'/.test(s)) continue;
      const n = Number(m[1]);
      if (n >= 1 && n <= 60) out.push(n);
    }
  }
  return out;
}
/** Most common pitch label (ties: the larger count wins, then the steeper). */
export function pagePitch(texts: Pick<VText, "s">[]): number | null {
  const xs = pitchLabels(texts);
  return xs.length ? mode(xs) : null;
}

// ---------------------------------------------------------------------------
// Roof line work
// ---------------------------------------------------------------------------
/**
 * Remove small closed symbols drawn in the roof pen (a downpipe or vent square sitting on a line): the edges of tiny
 * faces go, unless they carry on straight from a line outside the symbol (the line running through it).
 */
export function dropSymbols(segs: Seg[], minFace: number): Seg[] {
  const faces = planarFaces(segs);
  const small = new Set<number>();
  for (const f of faces) if (f.area < minFace) for (const e of f.edges) small.add(e.seg);
  const at = new Map<string, number[]>();
  segs.forEach(([a, b], i) => { for (const p of [a, b]) at.set(key(p), [...(at.get(key(p)) ?? []), i]); });
  const dir = (i: number, from: Pt): Pt => { const [a, b] = segs[i]; const to = key(a) === key(from) ? b : a; return unit(sub(to, from)); };
  const keep = segs.map((_, i) => {
    if (!small.has(i)) return true;
    // collinear continuation through either end
    return segs[i].some((p) => (at.get(key(p)) ?? []).some((j) => j !== i && !small.has(j) && Math.abs(Math.abs(turnDeg(dir(i, p), dir(j, p))) - 180) < 5));
  });
  return mergeCollinear(pruneDangling(segs.filter((_, i) => keep[i])));
}

export type RoofCandidate = { page: number; pens: string[]; lines: PlanLine[]; score: number; faces: number; plan: number; pitchLabelsInside: number; outline: Pt[] | null };

const penKey = (s: VSeg) => `${s.w.toFixed(2)}|${s.c}`;

/** Largest outline polygon of a cleaned network (union of its faces' outer boundary), paper mm. */
function outlineOf(lines: PlanLine[], scale: number, pitch: number): { pts: Pt[] | null; faces: number; plan: number; diag: number } {
  const a = analyzeRoof({ scale, pitch, lines });
  if (!a.faces.length) return { pts: null, faces: 0, plan: 0, diag: 0 };
  // Chain outline edges into loops; keep the biggest.
  const outl = a.edges.filter((e) => e.role === "outline");
  const next = new Map<string, Pt>();
  for (const f of a.faces) for (let i = 0; i < f.pts.length; i++) {
    const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length];
    if (outl.some((e) => (e.a === p && e.b === q) || (e.a === q && e.b === p) || (sameP(e.a, p) && sameP(e.b, q)) || (sameP(e.a, q) && sameP(e.b, p)))) next.set(`${p[0]},${p[1]}`, q);
  }
  let best: Pt[] | null = null;
  const seen = new Set<string>();
  for (const [k] of next) {
    if (seen.has(k)) continue;
    const loop: Pt[] = [];
    let cur = k;
    for (let g = 0; g < 5000 && !seen.has(cur); g++) {
      seen.add(cur);
      const p = cur.split(",").map(Number) as Pt;
      loop.push(p);
      const n = next.get(cur);
      if (!n) break;
      cur = `${n[0]},${n[1]}`;
    }
    if (loop.length >= 3 && (!best || polyArea(loop) > polyArea(best))) best = loop;
  }
  const diag = a.edges.filter((e) => e.role === "inner" && e.type !== "ridge").length;
  return { pts: best ? best.map((p) => [p[0] / scale, p[1] / scale] as Pt) : null, faces: a.faces.length, plan: a.totals.plan, diag };
}
const sameP = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

/**
 * Candidate roofs on one page: line work grouped by pen (width + colour), cleaned, split into connected parts;
 * each part that closes into panels is scored (pitch labels inside, number of panels, hips/valleys, sensible size).
 * Tiny symbols (downpipe squares) fall out because they are too small to be a roof.
 */
export function roofCandidates(page: PageData, scale: number, pitch = 22.5): RoofCandidate[] {
  const minLen = 50 / scale; // ignore line work under 50 mm real
  const groups = new Map<string, VSeg[]>();
  for (const s of page.segs) {
    if (dist(s.a, s.b) < minLen) continue;
    const k = penKey(s);
    const g = groups.get(k);
    if (g) g.push(s); else groups.set(k, [s]);
  }
  const pitchPts = page.texts.filter((t) => pitchLabels([t]).length).map((t) => [t.x, t.y] as Pt);
  const cands: RoofCandidate[] = [];
  const pageDiag = Math.hypot(page.widthMm, page.heightMm);
  for (const [pen, segs] of groups) {
    if (segs.length < 3 || segs.length > 6000) continue;
    const cleaned = cleanSegments(segs.map((s) => [s.a, s.b] as Seg), 60 / scale, 25 / scale);
    for (const comp of components(cleaned)) {
      const pr = dropSymbols(pruneDangling(comp), 0.1e6 / (scale * scale));
      if (pr.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [a, b] of pr) { x0 = Math.min(x0, a[0], b[0]); y0 = Math.min(y0, a[1], b[1]); x1 = Math.max(x1, a[0], b[0]); y1 = Math.max(y1, a[1], b[1]); }
      const bboxReal = (x1 - x0) * (y1 - y0) * scale * scale / 1e6;
      if (bboxReal < 20 || bboxReal > 4000) continue;
      if (Math.hypot(x1 - x0, y1 - y0) > 0.85 * pageDiag) continue; // the sheet border
      const lines: PlanLine[] = pr.map(([a, b]) => ({ a, b }));
      const o = outlineOf(lines, scale, pitch);
      if (!o.faces || !o.pts) continue;
      if (o.plan < 15 || o.plan > 2500) continue;
      const inside = pitchPts.filter((p) => pointInPolygon(p, o.pts!)).length;
      const nearEdge = x0 < 6 || y0 < 6 || x1 > page.widthMm - 6 || y1 > page.heightMm - 6;
      const score = Math.min(inside, 8) * 4 + Math.min(o.faces, 12) + Math.min(o.diag, 10) * 1.5 + (o.plan >= 40 && o.plan <= 1500 ? 3 : 0) - (nearEdge ? 10 : 0);
      cands.push({ page: page.index, pens: [pen], lines, score, faces: o.faces, plan: o.plan, pitchLabelsInside: inside, outline: o.pts });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  // A roof drawn with two pens (thick outline, thin hips): try adding other pens' line work that sits inside.
  const best = cands[0];
  if (best?.outline) {
    for (const [pen, segs] of groups) {
      if (best.pens.includes(pen) || segs.length > 400) continue;
      const inside = segs.filter((s) => pointInPolygon(s.a, best.outline!) || pointInPolygon(s.b, best.outline!));
      if (inside.length < 2 || inside.length < segs.length * 0.6) continue;
      const merged = cleanSegments([...best.lines.map((l) => [l.a, l.b] as Seg), ...inside.map((s) => [s.a, s.b] as Seg)], 60 / scale, 25 / scale);
      const lines = pruneDangling(merged).map(([a, b]) => ({ a, b }));
      const o = outlineOf(lines, scale, pitch);
      if (o.faces > best.faces && o.pts && polyArea(o.pts) <= polyArea(best.outline) * 1.05) {
        const insideLabels = pitchPts.filter((p) => pointInPolygon(p, o.pts!)).length;
        const score = Math.min(insideLabels, 8) * 4 + Math.min(o.faces, 12) + Math.min(o.diag, 10) * 1.5 + (o.plan >= 40 && o.plan <= 1500 ? 3 : 0);
        if (score > best.score) Object.assign(best, { pens: [...best.pens, pen], lines, score, faces: o.faces, plan: o.plan, outline: o.pts, pitchLabelsInside: insideLabels });
      }
    }
  }
  return cands;
}

/** Text clues that a page is the roof plan. */
export function roofPageTextScore(page: Pick<PageData, "texts">): number {
  const all = page.texts.map((t) => t.s).join(" ").toUpperCase();
  let s = 0;
  if (/ROOF\s*(PLAN|LAYOUT)/.test(all)) s += 6;
  if (/ROOF\s*DRAINAGE/.test(all)) s += 5;
  if (/\bROOF\b/.test(all)) s += 1;
  s += Math.min(8, pitchLabels(page.texts).length);
  if (/FLOOR\s*PLAN|ELECTRICAL|ELEVATION|SECTION/.test(all) && !/ROOF\s*(PLAN|DRAINAGE)/.test(all)) s -= 2;
  return s;
}

export type DetectedPage = {
  page: number;
  scale: ScaleInfo;
  pitch: number | null;
  candidate: RoofCandidate | null;
  score: number;
  downpipes: number;
};

/** Downpipes marked "DP" on the roof plan (exact "DP" labels; legend text in sentences is ignored). */
export function downpipeCount(texts: Pick<VText, "s">[]): number {
  return texts.filter((t) => /^\s*DP\d*\s*$/.test(t.s)).length;
}

/** Score every page and return them best first. */
export function detectRoofPages(pages: PageData[]): DetectedPage[] {
  const out = pages.map((p) => {
    const scale = pageScale(p, pages);
    const pitch = pagePitch(p.texts);
    const cands = roofCandidates(p, scale.scale, pitch ?? 22.5);
    const candidate = cands[0] ?? null;
    const score = roofPageTextScore(p) + (candidate ? candidate.score : -20);
    return { page: p.index, scale, pitch, candidate, score, downpipes: downpipeCount(p.texts) };
  });
  return out.sort((a, b) => b.score - a.score);
}

/** The editable roof model for a detected page. */
export function modelFromDetection(d: DetectedPage, pitchFallback = 22.5): PlanModel {
  return { scale: d.scale.scale, pitch: d.pitch ?? pitchFallback, lines: d.candidate?.lines ?? [] };
}

/** Faces' inside points (for tests / labels). */
export const facesInside = (pts: Pt[]) => interiorPoint(pts);
export const orientation = (pts: Pt[]) => Math.sign(signedArea(pts));
