// A roof read off a plan: the drawn lines (paper mm, as on the PDF page) plus the drawing scale and pitch.
// analyzeRoof() turns that into faces, typed edges, heights and true (sloped) lengths and areas.
// Pure: runs in the browser editor, on the server (to recompute what the client sent) and in tests.
//
// Model of the roof surface: every panel (face) is a plane at the roof pitch rising from its own eave line, so a
// point's height = its distance from that eave line × tan(pitch). Heights come from eaves only, so gable ends
// (barges) and skillions (apron on the high side) work. Lines between panels are classified from those planes:
// level = ridge; both panels fall away from it = hip; both rise away from it = valley.

import {
  area as polyArea, cleanSegments, cross, dist, dot, interiorPoint, key, leftNormal, lineSide, mid, perimeter, planarFaces,
  segDist, sub, turnDeg, unit, type Pt, type Seg,
} from "./geometry";

export type LineKind = "ridge" | "hip" | "valley" | "barge";
export type EdgeType = "eave" | "barge" | "apron";
export const LINE_KINDS: LineKind[] = ["ridge", "hip", "valley", "barge"];
export const EDGE_TYPES: EdgeType[] = ["eave", "barge", "apron"];
export const NEXT_KIND: Record<LineKind, LineKind> = { ridge: "hip", hip: "valley", valley: "barge", barge: "ridge" };
export const NEXT_EDGE: Record<EdgeType, EdgeType> = { eave: "barge", barge: "apron", apron: "eave" };
export const KIND_LABEL: Record<LineKind | EdgeType, string> = { ridge: "Ridge", hip: "Hip", valley: "Valley", barge: "Barge", eave: "Gutter", apron: "Apron / wall" };

/** One drawn line, in paper mm. `set` is the type the user chose (kept across edits); otherwise worked out. */
export type PlanLine = { a: Pt; b: Pt; set?: LineKind | EdgeType | null };
export type PlanModel = {
  /** Drawing scale: real = paper × scale (1:100 → 100). */
  scale: number;
  /** Roof pitch, degrees. */
  pitch: number;
  lines: PlanLine[];
};

/** Tolerances in real mm. */
export const TOL = { snap: 60, node: 25, minFaceM2: 0.05, minFaceWidth: 150, kinkDeg: 20, levelMm: 50 };

export type AnalyzedEdge = {
  /** Index into model.lines. */
  i: number;
  a: Pt; b: Pt; // real mm
  role: "outline" | "inner" | "loose";
  type: LineKind | EdgeType | null;
  auto: LineKind | EdgeType | null;
  faces: number[];
  plan: number; // mm
  true: number; // mm
  run: number; // index into runs (-1 for loose)
};
export type AnalyzedFace = {
  pts: Pt[]; // real mm, positive orientation
  plan: number; // m²
  area: number; // true m²
  eave: [Pt, Pt] | null; // eave line, face on its left
  label: Pt;
  name: string;
  /** Indices into edges, in order round the panel. */
  edges: number[];
};
export type Run = { kind: LineKind | EdgeType; edges: number[]; plan: number; true: number; a: Pt; b: Pt };
export type RoofTotals = { plan: number; area: number; ridge: number; hip: number; valley: number; barge: number; apron: number; eave: number };
export type RoofAnalysis = {
  faces: AnalyzedFace[];
  edges: AnalyzedEdge[];
  runs: Run[];
  height: (p: Pt) => number;
  /** Height of any point on panel fi (from that panel's own plane). */
  faceHeight: (fi: number, p: Pt) => number;
  vertexHeight: Map<string, number>;
  totals: RoofTotals;
  /** Outline loops (panel on the left), for drawing. */
  outlines: Pt[][];
  /** Outline corners: convex / reflex / kink (a straight eave with a slight bend, under 20°). */
  corners: Map<string, "convex" | "reflex" | "kink">;
  warnings: string[];
};

export const toReal = (p: Pt, scale: number): Pt => [p[0] * scale, p[1] * scale];
const tanOf = (deg: number) => Math.tan((Math.max(0, Math.min(75, deg)) * Math.PI) / 180);
const cosOf = (deg: number) => Math.cos((Math.max(0, Math.min(75, deg)) * Math.PI) / 180);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Clean drawn lines (paper mm): snap near-coincident ends, split at T-junctions and crossings, drop duplicates. */
export function normalizeLines(lines: PlanLine[], scale: number): PlanLine[] {
  const segs: Seg[] = lines.map((l) => [l.a, l.b]);
  const cleaned = cleanSegments(segs, TOL.snap / scale, TOL.node / scale);
  // Carry each line's chosen type onto the pieces that lie along it.
  return cleaned.map(([a, b]) => {
    const m = mid(a, b);
    const src = lines.find((l) => l.set && segDist(m, l.a, l.b) < TOL.node / scale && segDist(a, l.a, l.b) < TOL.snap / scale && segDist(b, l.a, l.b) < TOL.snap / scale);
    return src?.set ? { a, b, set: src.set } : { a, b };
  });
}

/** Corner type at an outline vertex from the incoming and outgoing outline directions (face on the left). */
export function cornerType(din: Pt, dout: Pt, kinkDeg = TOL.kinkDeg): "convex" | "reflex" | "kink" {
  const t = turnDeg(din, dout);
  if (Math.abs(t) < kinkDeg) return "kink";
  return t > 0 ? "convex" : "reflex";
}

export function analyzeRoof(model: PlanModel): RoofAnalysis {
  const scale = model.scale > 0 ? model.scale : 100;
  const pitch = model.pitch;
  const tanP = tanOf(pitch), cosP = cosOf(pitch);
  const warnings: string[] = [];
  const segs: Seg[] = model.lines.map((l) => [toReal(l.a, scale), toReal(l.b, scale)]);

  // 1. Faces (drop slivers: a 138 mm gutter strip between the fascia and gutter lines is not a roof panel).
  const raw = planarFaces(segs).filter((f) => f.area / 1e6 >= TOL.minFaceM2 && (2 * f.area) / perimeter(f.pts) >= TOL.minFaceWidth);
  const facesOf = new Map<number, number[]>();
  raw.forEach((f, fi) => f.edges.forEach((e) => facesOf.set(e.seg, [...(facesOf.get(e.seg) ?? []), fi])));

  // 2. Outline: edges with a panel on one side only, oriented with the panel on the left.
  const outHalf = new Map<string, { from: Pt; to: Pt; seg: number; face: number }>(); // keyed by from-vertex
  raw.forEach((f, fi) => f.edges.forEach((e) => {
    if ((facesOf.get(e.seg) ?? []).length === 1 && !outHalf.has(key(e.from))) outHalf.set(key(e.from), { ...e, face: fi });
  }));
  const corners = new Map<string, "convex" | "reflex" | "kink">();
  const inDir = new Map<string, Pt>();
  for (const h of outHalf.values()) inDir.set(key(h.to), unit(sub(h.to, h.from)));
  for (const h of outHalf.values()) {
    const din = inDir.get(key(h.from));
    if (din) corners.set(key(h.from), cornerType(din, unit(sub(h.to, h.from))));
  }

  // Runs of outline edges between real corners (a kink under 20° does not end a run).
  const runOf = new Map<number, number>();
  const runs: Run[] = [];
  const visited = new Set<number>();
  for (const h0 of outHalf.values()) {
    if (visited.has(h0.seg)) continue;
    // walk back to a corner (or all the way round)
    let start = h0;
    for (let g = 0; g < 10000; g++) {
      if (corners.get(key(start.from)) !== "kink") break;
      const prev = [...outHalf.values()].find((h) => key(h.to) === key(start.from));
      if (!prev || prev === h0) break;
      start = prev;
    }
    const run: Run = { kind: "eave", edges: [], plan: 0, true: 0, a: start.from, b: start.to };
    let h: typeof h0 | undefined = start;
    for (let g = 0; h && g < 10000; g++) {
      if (visited.has(h.seg)) break;
      visited.add(h.seg);
      run.edges.push(h.seg);
      run.b = h.to;
      runOf.set(h.seg, runs.length);
      const nx = outHalf.get(key(h.to));
      if (!nx || corners.get(key(h.to)) !== "kink") break;
      h = nx;
    }
    runs.push(run);
  }

  // 3. Edge records.
  const edges: AnalyzedEdge[] = segs.map(([a, b], i) => {
    const fs = facesOf.get(i) ?? [];
    const role = fs.length === 1 ? "outline" : fs.length >= 2 ? "inner" : "loose";
    return { i, a, b, role, type: null, auto: null, faces: fs, plan: dist(a, b), true: dist(a, b), run: role === "outline" ? runOf.get(i) ?? -1 : -1 };
  });
  const userSet = (e: AnalyzedEdge) => {
    const s = model.lines[e.i]?.set;
    if (!s) return null;
    if (e.role === "outline" && (EDGE_TYPES as string[]).includes(s)) return s as EdgeType;
    if (e.role === "inner" && (LINE_KINDS as string[]).includes(s)) return s as LineKind;
    return null;
  };
  // A run the user typed takes that type everywhere along it.
  const runSet = runs.map((r) => r.edges.map((i) => userSet(edges[i])).find(Boolean) as EdgeType | undefined);
  const outlineType = (gable: Set<number>, sideBarge: Set<number> = new Set()) => {
    for (const e of edges) {
      if (e.role !== "outline") continue;
      e.auto = gable.has(e.run) || sideBarge.has(e.i) ? "barge" : "eave";
      e.type = runSet[e.run] ?? e.auto;
    }
  };

  // 4. Planes and heights from the current eave typing.
  let facePlane: ((p: Pt) => number)[] = [];
  let faceEave: ([Pt, Pt] | null)[] = [];
  const vertexHeight = new Map<string, number>();
  const eaveSegs = () => edges.filter((e) => e.role === "outline" && e.type === "eave");
  const fallback = (p: Pt) => {
    const es = eaveSegs();
    if (!es.length) return 0;
    return Math.min(...es.map((e) => segDist(p, e.a, e.b))) * tanP;
  };
  const computeHeights = () => {
    faceEave = raw.map((f) => {
      // Longest straight stretch of eave on this face (consecutive collinear eave edges merged).
      let best: [Pt, Pt] | null = null, bestLen = 0;
      let curA: Pt | null = null, curB: Pt | null = null;
      const flush = () => {
        if (curA && curB && dist(curA, curB) > bestLen) { bestLen = dist(curA, curB); best = [curA, curB]; }
        curA = curB = null;
      };
      const n = f.edges.length;
      // start the scan at an edge that is not an eave so stretches don't wrap
      let s0 = f.edges.findIndex((e) => edges[e.seg].type !== "eave" || edges[e.seg].role !== "outline");
      if (s0 < 0) s0 = 0;
      for (let k = 0; k < n; k++) {
        const e = f.edges[(s0 + k) % n];
        const isEave = edges[e.seg].role === "outline" && edges[e.seg].type === "eave";
        if (!isEave) { flush(); continue; }
        if (curA && curB && Math.abs(turnDeg(unit(sub(curB, curA)), unit(sub(e.to, e.from)))) < 3) curB = e.to;
        else { flush(); curA = e.from; curB = e.to; }
      }
      flush();
      return best;
    });
    facePlane = raw.map((f, fi) => {
      const e = faceEave[fi];
      if (e) return (p: Pt) => Math.max(0, lineSide(p, e[0], e[1])) * tanP;
      return fallback;
    });
    vertexHeight.clear();
    const inc = new Map<string, number[]>();
    raw.forEach((f, fi) => f.pts.forEach((p) => inc.set(key(p), [...(inc.get(key(p)) ?? []), fi])));
    const onEave = new Set<string>();
    for (const e of eaveSegs()) { onEave.add(key(e.a)); onEave.add(key(e.b)); }
    for (const [k, fs] of inc) {
      if (onEave.has(k)) { vertexHeight.set(k, 0); continue; }
      const p = k.split(",").map(Number) as Pt;
      const hs = fs.filter((fi) => faceEave[fi]).map((fi) => facePlane[fi](p)).sort((x, y) => x - y);
      vertexHeight.set(k, hs.length ? hs[Math.floor((hs.length - 1) / 2)] : fallback(p));
    }
  };
  const hAt = (p: Pt) => vertexHeight.get(key(p)) ?? fallback(p);

  const classifyInner = () => {
    for (const e of edges) {
      if (e.role !== "inner") continue;
      const dh = Math.abs(hAt(e.a) - hAt(e.b));
      let auto: LineKind;
      if (dh < TOL.levelMm / 2 + 0.25 * tanP * e.plan) auto = "ridge"; // a hip rises ~0.7 × tan(pitch) per mm
      else {
        // Do the two panels fall away from this line (hip) or rise away from it (valley)?
        const m = mid(e.a, e.b), d = unit(sub(e.b, e.a)), nrm = leftNormal(d), eps = Math.min(200, e.plan / 4);
        let up = 0, down = 0;
        for (const fi of e.faces.slice(0, 2)) {
          const f = raw[fi];
          // which side of the line the face is on
          const inside = f.edges.some((h) => h.seg === e.i && key(h.from) === key(e.a)) ? 1 : -1;
          const q: Pt = [m[0] + nrm[0] * eps * inside, m[1] + nrm[1] * eps * inside];
          const slope = facePlane[fi](q) - facePlane[fi](m);
          if (slope > 1) up++; else if (slope < -1) down++;
        }
        if (down === 2) auto = "hip";
        else if (up === 2) auto = "valley";
        else {
          // Fall back on the outline corner the line starts from: convex = hip, reflex = valley (kink = hip).
          const c = corners.get(key(e.a)) ?? corners.get(key(e.b));
          auto = c === "reflex" ? "valley" : "hip";
        }
      }
      e.auto = auto;
      e.type = userSet(e) ?? auto;
    }
  };

  // Pass 1: every outline edge an eave.
  outlineType(new Set());
  computeHeights();
  classifyInner();
  // Gable ends: a ridge that ends in the middle of a straight outline run makes that run a barge.
  const gable = new Set<number>();
  for (const e of edges) {
    if (e.role !== "inner" || e.auto !== "ridge") continue;
    for (const p of [e.a, e.b]) {
      if (corners.get(key(p)) !== "kink") continue; // corners (and non-outline points) are not gable ends
      const r = edges.find((o) => o.role === "outline" && (key(o.a) === key(p) || key(o.b) === key(p)));
      if (r && r.run >= 0) gable.add(r.run);
    }
  }
  // Skillions and lean-tos: on a panel with an apron (high side), outline edges running up the slope
  // (across the apron direction) are barges, not gutters.
  const sideBarge = new Set<number>();
  raw.forEach((f) => {
    const aprons = f.edges.filter((h) => edges[h.seg].role === "outline" && edges[h.seg].type === "apron");
    if (!aprons.length) return;
    const ad = unit(sub(aprons[0].to, aprons[0].from));
    for (const h of f.edges) {
      const e = edges[h.seg];
      if (e.role !== "outline" || e.type === "apron") continue;
      const t = Math.abs(turnDeg(ad, unit(sub(h.to, h.from))));
      if (t > TOL.kinkDeg && t < 180 - TOL.kinkDeg) sideBarge.add(e.i);
    }
  });
  // Pass 2 with gables (and the user's edge types) in place.
  outlineType(gable, sideBarge);
  computeHeights();
  classifyInner();

  // 5. True lengths.
  for (const e of edges) {
    if (e.role === "loose") continue;
    const dh = hAt(e.a) - hAt(e.b);
    e.true = e.type === "eave" || e.type === "ridge" ? e.plan : Math.hypot(e.plan, dh);
  }
  for (const r of runs) {
    const es = r.edges.map((i) => edges[i]);
    r.kind = es[0]?.type ?? "eave";
    r.plan = es.reduce((s, e) => s + e.plan, 0);
    r.true = es.reduce((s, e) => s + e.true, 0);
  }
  // Inner runs: chains of collinear lines of the same kind (a ridge split where a valley meets it is one ridge).
  const innerDone = new Set<number>();
  for (const e of edges) {
    if (e.role !== "inner" || innerDone.has(e.i)) continue;
    const chain = [e];
    innerDone.add(e.i);
    for (const end of [0, 1] as const) {
      let cur = e, p = end === 0 ? e.a : e.b;
      for (let g = 0; g < 1000; g++) {
        const dir = unit(sub(p, key(cur.a) === key(p) ? cur.b : cur.a));
        const next = edges.filter((o) => o.role === "inner" && !innerDone.has(o.i) && o.type === e.type && (key(o.a) === key(p) || key(o.b) === key(p)));
        const straight = next.filter((o) => {
          const q = key(o.a) === key(p) ? o.b : o.a;
          return Math.abs(turnDeg(dir, unit(sub(q, p)))) < 10;
        });
        if (straight.length !== 1) break;
        const o = straight[0];
        innerDone.add(o.i);
        chain.push(o);
        cur = o;
        p = key(o.a) === key(p) ? o.b : o.a;
      }
    }
    const ri = runs.length;
    chain.forEach((c) => (c.run = ri));
    const pts = chain.flatMap((c) => [c.a, c.b]);
    let a = pts[0], b = pts[1], best = 0;
    for (const p of pts) for (const q of pts) if (dist(p, q) > best) { best = dist(p, q); a = p; b = q; }
    runs.push({ kind: e.type ?? "ridge", edges: chain.map((c) => c.i), plan: chain.reduce((s, c) => s + c.plan, 0), true: chain.reduce((s, c) => s + c.true, 0), a, b });
  }

  // 6. Faces and totals.
  const order = raw.map((_, i) => i).sort((i, j) => raw[j].area - raw[i].area);
  const faces: AnalyzedFace[] = raw.map((f, fi) => ({
    pts: f.pts,
    plan: f.area / 1e6,
    area: f.area / 1e6 / cosP,
    eave: faceEave[fi],
    label: interiorPoint(f.pts),
    name: `Panel ${panelName(order.indexOf(fi))}`,
    edges: f.edges.map((e) => e.seg),
  }));
  const totals: RoofTotals = { plan: 0, area: 0, ridge: 0, hip: 0, valley: 0, barge: 0, apron: 0, eave: 0 };
  for (const f of faces) { totals.plan += f.plan; totals.area += f.area; }
  for (const e of edges) if (e.role !== "loose" && e.type) totals[e.type] += e.true / 1000;
  for (const k of Object.keys(totals) as (keyof RoofTotals)[]) totals[k] = r2(totals[k]);
  if (!faces.length) warnings.push("No closed roof outline found. Draw the outline or pick another page.");
  if (faces.length && !eaveSegs().length) warnings.push("Mark at least one edge as a gutter (eave) so the roof slopes can be worked out.");

  const outlines: Pt[][] = [];
  const seenLoop = new Set<string>();
  for (const h0 of outHalf.values()) {
    if (seenLoop.has(key(h0.from))) continue;
    const loop: Pt[] = [];
    let h: typeof h0 | undefined = h0;
    for (let g = 0; h && !seenLoop.has(key(h.from)) && g < 10000; g++) {
      seenLoop.add(key(h.from));
      loop.push(h.from);
      h = outHalf.get(key(h.to));
    }
    if (loop.length >= 3) outlines.push(loop);
  }
  return {
    faces, edges, runs, vertexHeight, totals, corners, warnings, outlines,
    height: (p: Pt) => (vertexHeight.has(key(p)) ? vertexHeight.get(key(p))! : fallback(p)),
    faceHeight: (fi: number, p: Pt) => (facePlane[fi] ? facePlane[fi](p) : fallback(p)),
  };
}

const panelName = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

/** 3D length of a straight segment on the roof (plan length combined with the rise between its ends). */
export const trueLength = (a: Pt, b: Pt, ha: number, hb: number) => Math.hypot(dist(a, b), ha - hb);

/** Plan area (m²) of a polygon in real mm. */
export const planM2 = (pts: Pt[]) => polyArea(pts) / 1e6;

/** Snap a point (paper mm) to the nearest vertex, or onto the nearest line, within `tol` (paper mm). */
export function snapPoint(p: Pt, lines: PlanLine[], tol: number): Pt {
  let best: Pt = p, bd = tol;
  for (const l of lines) for (const q of [l.a, l.b]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  if (best !== p) return best;
  bd = tol;
  for (const l of lines) {
    const d = segDist(p, l.a, l.b);
    if (d < bd) {
      bd = d;
      const v = sub(l.b, l.a), t = Math.max(0, Math.min(1, dot(sub(p, l.a), v) / (dot(v, v) || 1)));
      best = [l.a[0] + v[0] * t, l.a[1] + v[1] * t];
    }
  }
  return best;
}

/** Index of the line nearest to p (paper mm) within tol, or -1. */
export function nearestLine(p: Pt, lines: PlanLine[], tol: number): number {
  let best = -1, bd = tol;
  lines.forEach((l, i) => { const d = segDist(p, l.a, l.b); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** Turn angle sign check used by tests: cross of consecutive directions. */
export const isLeftTurn = (a: Pt, b: Pt, c: Pt) => cross(sub(b, a), sub(c, b)) > 0;
