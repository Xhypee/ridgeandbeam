// Sheet cut list, nesting optimiser, flashings and battens for a roof read off the plans. Pure.
//
// Sheets: each panel is covered by strips one cover-width wide, laid from the panel's eave up the slope. A piece's
// order length runs from ITS OWN lowest point to its highest point (along the slope), plus the gutter overhang when
// it sits on the gutter. Pieces whose ends are cut on a hip or valley angle leave a triangle of offcut; two pieces
// with matching angled ends are cut from one sheet ("nested") so the triangle is used. Corrugated (Custom Orb) can be
// turned end for end; ribbed profiles (Trimdek, Klip-Lok) can't, so only pieces whose cuts line up as they lie on
// the roof are paired.

import { clipSlab, dist, dot, leftNormal, sub, unit, verticalIntervals, chordXs, type Pt } from "./geometry";
import type { AnalyzedFace, RoofAnalysis, Run } from "./roof-model";

export type SheetProfile = "custom_orb" | "trimdek" | "klip_lok" | "spandek";
export const SHEET_PROFILES: Record<SheetProfile, { label: string; coverMm: number; rotatable: boolean; blurb: string }> = {
  custom_orb: { label: "Custom Orb", coverMm: 762, rotatable: true, blurb: "Classic corrugated" },
  trimdek: { label: "Trimdek", coverMm: 762, rotatable: false, blurb: "Bold, modern ribs" },
  klip_lok: { label: "Klip-Lok 700", coverMm: 700, rotatable: false, blurb: "No screws showing" },
  spandek: { label: "Spandek", coverMm: 700, rotatable: false, blurb: "Low ribs" },
};

export type SheetOptions = {
  coverMm: number;
  rotatable: boolean;
  /** Sheet overhang into the gutter, mm. */
  overhangMm: number;
  /** Longest sheet that can be made when two pieces are nested, mm. */
  maxNestMm: number;
};
export const DEFAULT_SHEET_OPTIONS: SheetOptions = { coverMm: 762, rotatable: true, overhangMm: 55, maxNestMm: 15000 };

/** An angled end: slope of the cut (plan mm up the slope per mm across) and its length along the sheet. */
export type Cut = { k: number; along: number };
export type Piece = {
  face: number;
  k: number; // strip number on the face
  lengthMm: number; // order length, rounded up to 10 mm
  rawMm: number; // unrounded
  top: Cut | null;
  bottom: Cut | null;
  onGutter: boolean;
  pts: Pt[]; // the piece on the plan (real mm), for drawing
};
/** One sheet to order: the pieces cut from it; `nested` when two angled cuts share one line. */
export type StockSheet = { lengthMm: number; pieces: number[]; nested: boolean };
export type CutRow = { lengthMm: number; qty: number };
export type SheetPlan = {
  coverMm: number;
  pieces: Piece[];
  sheets: StockSheet[];
  cutList: CutRow[];
  count: number;
  lm: number;
  m2: number;
  roofM2: number;
  wastePct: number;
  pairs: number;
};

const ceil10 = (mm: number) => Math.ceil(mm / 10 - 1e-9) * 10;
const ceil100 = (mm: number) => Math.ceil(mm / 100 - 1e-9) * 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Face frame: origin at the eave start, x along the eave, y up the slope (into the panel). */
export function faceFrame(face: Pick<AnalyzedFace, "eave" | "pts">) {
  const [a, b] = face.eave ?? longestEdge(face.pts);
  const d = unit(sub(b, a)), n = leftNormal(d);
  const to = (p: Pt): Pt => { const v = sub(p, a); return [dot(v, d), dot(v, n)]; };
  const from = (q: Pt): Pt => [a[0] + d[0] * q[0] + n[0] * q[1], a[1] + d[1] * q[0] + n[1] * q[1]];
  return { to, from };
}
function longestEdge(pts: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [pts[0], pts[1]], bl = -1;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; if (dist(p, q) > bl) { bl = dist(p, q); best = [p, q]; } });
  return best;
}

/** Top or bottom boundary of a clipped strip, sampled at its left and right sides. */
function ends(local: Pt[], x0: number, x1: number): { top: [number, number]; bot: [number, number]; xl: number; xr: number } | null {
  const xs = local.map((p) => p[0]);
  const xl = Math.max(x0, Math.min(...xs)) + 0.01, xr = Math.min(x1, Math.max(...xs)) - 0.01;
  if (xr <= xl) return null;
  const il = verticalIntervals(local, xl), ir = verticalIntervals(local, xr);
  if (!il.length || !ir.length) return null;
  return { top: [Math.max(...il.map((i) => i[1])), Math.max(...ir.map((i) => i[1]))], bot: [Math.min(...il.map((i) => i[0])), Math.min(...ir.map((i) => i[0]))], xl, xr };
}

/** Lay one panel with strips starting at `start` (x in the face frame) and return its pieces. */
function layFace(face: AnalyzedFace, fi: number, cosP: number, o: SheetOptions, alignRight: boolean): Piece[] {
  const fr = faceFrame(face);
  const local = face.pts.map(fr.to);
  const xs = local.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const w = o.coverMm;
  const n = Math.max(1, Math.ceil((maxX - minX - 1) / w));
  const start = alignRight ? maxX - n * w : minX;
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const x0 = start + k * w, x1 = x0 + w;
    const clip = clipSlab(local, x0, x1);
    if (clip.length < 3) continue;
    // Extent from the strip's inside (a panel edge lying exactly on the strip's side adds nothing).
    const e = ends(clip, x0, x1);
    const inner = clip.filter((p) => p[0] > x0 + 0.01 && p[0] < x1 - 0.01).map((p) => p[1]);
    const ys = e ? [...inner, ...e.top, ...e.bot] : clip.map((p) => p[1]);
    const hi = Math.max(...ys), lo = Math.min(...ys);
    if (hi - lo < 20) continue;
    const onGutter = lo < 30;
    const raw = (hi - lo) / cosP + (onGutter ? o.overhangMm : 0);
    let top: Cut | null = null, bottom: Cut | null = null;
    if (e) {
      const span = e.xr - e.xl;
      const kt = (e.top[1] - e.top[0]) / span, kb = (e.bot[1] - e.bot[0]) / span;
      if (Math.abs(e.top[1] - e.top[0]) > 60) top = { k: kt, along: (Math.abs(kt) * Math.min(w, x1 - x0)) / cosP };
      if (!onGutter && Math.abs(e.bot[1] - e.bot[0]) > 60) bottom = { k: kb, along: (Math.abs(kb) * Math.min(w, x1 - x0)) / cosP };
    }
    out.push({ face: fi, k, lengthMm: ceil10(raw), rawMm: raw, top, bottom, onGutter, pts: clip.map(fr.from) });
  }
  return out;
}

/** Can `lower`'s top cut take `upper`'s bottom end in one sheet (rotating either end for end where allowed)? */
function fits(lower: Piece, upper: Piece, rotatable: boolean): number {
  const close = (a: Cut | null, b: Cut | null) => (a && b && Math.abs(a.k - b.k) < 0.12 ? Math.min(a.along, b.along) : 0);
  let best = close(lower.top, upper.bottom);
  if (rotatable) {
    best = Math.max(best, close(lower.top, upper.top), close(lower.bottom, upper.bottom), close(lower.bottom, upper.top));
  }
  return best;
}

/** Pair angled pieces (longest with the shortest that fits) so their offcuts are used. */
export function nestPieces(pieces: Piece[], o: Pick<SheetOptions, "rotatable" | "maxNestMm">): StockSheet[] {
  const used = new Set<number>();
  const sheets: StockSheet[] = [];
  const angled = pieces.map((p, i) => i).filter((i) => pieces[i].top || pieces[i].bottom).sort((i, j) => pieces[j].rawMm - pieces[i].rawMm);
  for (const i of angled) {
    if (used.has(i)) continue;
    let best = -1, bestLen = Infinity;
    for (let jj = angled.length - 1; jj >= 0; jj--) {
      const j = angled[jj];
      if (j === i || used.has(j)) continue;
      const save = Math.max(fits(pieces[i], pieces[j], o.rotatable), fits(pieces[j], pieces[i], o.rotatable));
      if (save <= 0) continue;
      const len = ceil10(pieces[i].rawMm + pieces[j].rawMm - save);
      if (len > o.maxNestMm) continue;
      if (len < bestLen) { bestLen = len; best = j; }
    }
    if (best >= 0) {
      used.add(i); used.add(best);
      sheets.push({ lengthMm: bestLen, pieces: [i, best], nested: true });
    }
  }
  // Short pieces left over are cut two from one sheet when together they are no longer than the longest piece
  // on the roof (fewer sheets to handle, same metres).
  const longest = Math.max(0, ...pieces.map((p) => p.lengthMm));
  const rest = pieces.map((_, i) => i).filter((i) => !used.has(i)).sort((i, j) => pieces[j].lengthMm - pieces[i].lengthMm);
  for (const i of rest) {
    if (used.has(i)) continue;
    used.add(i);
    let partner = -1;
    for (const j of rest) {
      if (used.has(j)) continue;
      if (pieces[i].lengthMm + pieces[j].lengthMm <= longest) { partner = j; break; }
    }
    if (partner >= 0) {
      used.add(partner);
      sheets.push({ lengthMm: pieces[i].lengthMm + pieces[partner].lengthMm, pieces: [i, partner], nested: false });
    } else sheets.push({ lengthMm: pieces[i].lengthMm, pieces: [i], nested: false });
  }
  return sheets;
}

export function cutListOf(lengths: number[]): CutRow[] {
  const m = new Map<number, number>();
  for (const l of lengths) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([lengthMm, qty]) => ({ lengthMm, qty }));
}

/** Lay every panel (each from its more economical end), nest, and total up. */
export function planSheets(analysis: Pick<RoofAnalysis, "faces">, pitchDeg: number, opts: Partial<SheetOptions> = {}): SheetPlan {
  const o = { ...DEFAULT_SHEET_OPTIONS, ...opts };
  const cosP = Math.cos((pitchDeg * Math.PI) / 180);
  const pieces: Piece[] = [];
  analysis.faces.forEach((f, fi) => {
    const left = layFace(f, fi, cosP, o, false), right = layFace(f, fi, cosP, o, true);
    const sum = (ps: Piece[]) => ps.reduce((s, p) => s + p.lengthMm, 0);
    pieces.push(...(sum(right) < sum(left) ? right : left));
  });
  const sheets = nestPieces(pieces, o);
  const lm = sheets.reduce((s, x) => s + x.lengthMm, 0) / 1000;
  const roofM2 = analysis.faces.reduce((s, f) => s + f.area, 0);
  const m2 = (lm * o.coverMm) / 1000;
  return {
    coverMm: o.coverMm,
    pieces,
    sheets,
    cutList: cutListOf(sheets.map((s) => s.lengthMm)),
    count: sheets.length,
    lm: r2(lm),
    m2: r2(m2),
    roofM2: r2(roofM2),
    wastePct: roofM2 > 0 ? Math.round((m2 / roofM2 - 1) * 1000) / 10 : 0,
    pairs: sheets.filter((s) => s.nested).length,
  };
}

// ---------------------------------------------------------------------------
// Flashings, gutters, battens: ordered the way a roof plumber orders them
// ---------------------------------------------------------------------------
export type FlashingOptions = {
  /** Added to every run (cutting, stop ends, fold-overs), mm. */
  runAllowanceMm: number;
  gutterRunAllowanceMm: number;
  lapMm: number;
  maxLengthMm: number;
  /** How far the gutter's outer edge sits outside the fascia line (adds length at outside corners), mm. */
  gutterProjectionMm: number;
  battenSpacingMm: number;
  battenFirstMm: number;
  battenLengthMm: number;
};
export const DEFAULT_FLASHING_OPTIONS: FlashingOptions = {
  runAllowanceMm: 300, gutterRunAllowanceMm: 350, lapMm: 100, maxLengthMm: 8000, gutterProjectionMm: 138,
  battenSpacingMm: 900, battenFirstMm: 100, battenLengthMm: 8000,
};

/** One run → order lengths: run + allowance, split into lengths no longer than max with laps, each rounded up to 100 mm. */
export function runLengths(runMm: number, allowanceMm: number, o: Pick<FlashingOptions, "lapMm" | "maxLengthMm">): number[] {
  const total = runMm + allowanceMm;
  if (total <= 0) return [];
  const n = Math.max(1, Math.ceil((total - o.lapMm) / (o.maxLengthMm - o.lapMm) - 1e-9));
  if (n === 1) return [ceil100(total)];
  const withLaps = total + (n - 1) * o.lapMm;
  const out = Array.from({ length: n - 1 }, () => o.maxLengthMm);
  out.push(ceil100(withLaps - (n - 1) * o.maxLengthMm));
  return out;
}

export type FlashingLine = { key: "ridge" | "hip" | "valley" | "barge" | "apron" | "fascia" | "gutter"; label: string; runs: number; lengths: CutRow[]; lm: number };
export type Flashings = { lines: FlashingLine[]; battens: { rows: number; lm: number; lengths: number }; downpipes: number };

const FLASH_LABEL: Record<FlashingLine["key"], string> = {
  ridge: "Ridge capping", hip: "Hip capping", valley: "Valley iron", barge: "Barge capping", apron: "Apron / wall flashing", fascia: "Fascia", gutter: "Quad gutter",
};

export function planFlashings(analysis: Pick<RoofAnalysis, "runs" | "faces" | "corners">, pitchDeg: number, downpipes: number, opts: Partial<FlashingOptions> = {}): Flashings {
  const o = { ...DEFAULT_FLASHING_OPTIONS, ...opts };
  const by = (kind: string) => analysis.runs.filter((r) => r.kind === kind);
  const line = (key: FlashingLine["key"], runs: Run[], allowance: number, lenOf: (r: Run) => number): FlashingLine => {
    const lengths = runs.flatMap((r) => runLengths(lenOf(r), allowance, o));
    return { key, label: FLASH_LABEL[key], runs: runs.length, lengths: cutListOf(lengths), lm: r2(lengths.reduce((s, l) => s + l, 0) / 1000) };
  };
  // Gutter runs follow the outer edge of the gutter: longer at outside corners, shorter at inside corners.
  const cornerAt = (p: Pt) => analysis.corners.get(`${p[0]},${p[1]}`);
  const gutterLen = (r: Run) => {
    let L = r.true;
    for (const p of [r.a, r.b]) {
      const c = cornerAt(p);
      if (c === "convex") L += o.gutterProjectionMm;
      else if (c === "reflex") L -= o.gutterProjectionMm;
    }
    return Math.max(0, L);
  };
  const lines: FlashingLine[] = [
    line("ridge", by("ridge"), o.runAllowanceMm, (r) => r.true),
    line("hip", by("hip"), o.runAllowanceMm, (r) => r.true),
    line("valley", by("valley"), o.runAllowanceMm, (r) => r.true),
    line("barge", by("barge"), o.runAllowanceMm, (r) => r.true),
    line("apron", by("apron"), o.runAllowanceMm, (r) => r.true),
    line("fascia", by("eave"), o.runAllowanceMm, (r) => r.true),
    line("gutter", by("eave"), o.gutterRunAllowanceMm, gutterLen),
  ].filter((l) => l.runs > 0);

  // Battens: rows parallel to each panel's eave, the first 100 mm up the slope then every 900 mm, the last no closer
  // than 100 mm to the top. Ordered in 8 m lengths, offcuts carried to the next row.
  const cosP = Math.cos((pitchDeg * Math.PI) / 180);
  let rows = 0, mm = 0;
  for (const f of analysis.faces) {
    const fr = faceFrame(f);
    const local = f.pts.map(fr.to);
    const top = Math.max(...local.map((p) => p[1])) / cosP;
    for (let s = o.battenFirstMm; s <= top - o.battenFirstMm; s += o.battenSpacingMm) {
      const xs = chordXs(local, s * cosP);
      let L = 0;
      for (let k = 0; k + 1 < xs.length; k += 2) L += xs[k + 1] - xs[k];
      if (L > 0) { rows++; mm += L + Math.max(0, Math.ceil(L / o.battenLengthMm) - 1) * o.lapMm; }
    }
  }
  return { lines, battens: { rows, lm: r2(mm / 1000), lengths: Math.ceil(mm / o.battenLengthMm - 1e-9) }, downpipes };
}
