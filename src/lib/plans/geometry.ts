// Planar geometry for reading roofs off vector plans. Pure functions, no I/O (runs in the browser, on the server
// and in tests). Units are whatever the caller uses (paper mm or real mm); tolerances are passed in the same unit.
// Coordinates may be y-down (PDF/SVG) or y-up: everything here is algebraic, so orientation-dependent results
// (e.g. "bounded faces have positive signed area") hold either way.

export type Pt = [number, number];
export type Seg = [Pt, Pt];

export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const len = (a: Pt) => Math.hypot(a[0], a[1]);
export const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left normal (algebraic): rotates +x onto +y. Interior of a positive-area polygon is on this side of each edge. */
export const leftNormal = (d: Pt): Pt => [-d[1], d[0]];
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const key = (p: Pt) => `${p[0]},${p[1]}`;
export const segKey = (a: Pt, b: Pt) => {
  const ka = key(a), kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/** Parameter t ∈ [0,1] of the closest point on segment ab to q. */
export function projT(q: Pt, a: Pt, b: Pt): number {
  const v = sub(b, a);
  const l2 = dot(v, v);
  if (l2 === 0) return 0;
  return Math.max(0, Math.min(1, dot(sub(q, a), v) / l2));
}
export function segDist(q: Pt, a: Pt, b: Pt): number {
  const t = projT(q, a, b);
  return dist(q, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}
/** Signed distance from q to the infinite line through a→b, positive on the left. */
export function lineSide(q: Pt, a: Pt, b: Pt): number {
  const d = unit(sub(b, a));
  return cross(d, sub(q, a));
}

/** Signed shoelace area (positive for the orientation bounded faces come out in). */
export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
export const area = (pts: Pt[]) => Math.abs(signedArea(pts));
export function perimeter(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}
export function centroid(pts: Pt[]): Pt {
  const A = signedArea(pts);
  if (Math.abs(A) < 1e-9) return mul(pts.reduce((s, p) => add(s, p), [0, 0] as Pt), 1 / Math.max(1, pts.length));
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
}
export function pointInPolygon(q: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1] || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
/** A point well inside a polygon (centroid if inside, else the middle of the widest horizontal chord). */
export function interiorPoint(pts: Pt[]): Pt {
  const c = centroid(pts);
  if (pointInPolygon(c, pts)) return c;
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  let best: Pt = c, bestW = -1;
  for (let i = 0; i < ys.length - 1; i++) {
    const y = (ys[i] + ys[i + 1]) / 2;
    const xs = chordXs(pts, y);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (w > bestW) { bestW = w; best = [(xs[k] + xs[k + 1]) / 2, y]; }
    }
  }
  return best;
}
/** Sorted x where the horizontal line y crosses the polygon boundary. */
export function chordXs(pts: Pt[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.sort((p, q) => p - q);
}
/** Intervals [lo, hi] where the vertical line x is inside the polygon. */
export function verticalIntervals(pts: Pt[], x: number): [number, number][] {
  const ys: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
  }
  ys.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < ys.length; k += 2) out.push([ys[k], ys[k + 1]]);
  return out;
}

/** Clip a polygon to the half-plane where dot(p, n) >= c (Sutherland–Hodgman). */
export function clipHalfPlane(pts: Pt[], n: Pt, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = dot(a, n) - c, db = dot(b, n) - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
/** Clip a polygon to the vertical slab x0 <= x <= x1. */
export const clipSlab = (pts: Pt[], x0: number, x1: number) => clipHalfPlane(clipHalfPlane(pts, [1, 0], x0), [-1, 0], -x1);

/** Proper or touching intersection point of two segments (null when parallel or apart). */
export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): { p: Pt; t: number; u: number } | null {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12 * (len(r) * len(s) || 1)) return null;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { p: [a[0] + r[0] * t, a[1] + r[1] * t], t, u };
}

/** Turn angle in degrees from direction d1 to d2 (−180..180, positive = left turn algebraically). */
export function turnDeg(d1: Pt, d2: Pt): number {
  return (Math.atan2(cross(d1, d2), dot(d1, d2)) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Spatial grid (bbox buckets) so cleaning thousands of segments stays fast
// ---------------------------------------------------------------------------
class Grid<T> {
  private cells = new Map<string, T[]>();
  constructor(private size: number) {}
  private k(ix: number, iy: number) { return `${ix}:${iy}`; }
  insert(item: T, x0: number, y0: number, x1: number, y1: number) {
    const s = this.size;
    for (let ix = Math.floor(Math.min(x0, x1) / s); ix <= Math.floor(Math.max(x0, x1) / s); ix++)
      for (let iy = Math.floor(Math.min(y0, y1) / s); iy <= Math.floor(Math.max(y0, y1) / s); iy++) {
        const kk = this.k(ix, iy);
        const c = this.cells.get(kk);
        if (c) c.push(item); else this.cells.set(kk, [item]);
      }
  }
  query(x0: number, y0: number, x1: number, y1: number): Set<T> {
    const out = new Set<T>();
    const s = this.size;
    for (let ix = Math.floor(Math.min(x0, x1) / s); ix <= Math.floor(Math.max(x0, x1) / s); ix++)
      for (let iy = Math.floor(Math.min(y0, y1) / s); iy <= Math.floor(Math.max(y0, y1) / s); iy++)
        for (const it of this.cells.get(this.k(ix, iy)) ?? []) out.add(it);
    return out;
  }
}

/**
 * Snap segment endpoints that lie within `tol` of each other to one shared point (CAD often draws a line twice,
 * a few mm apart, or leaves tiny gaps at corners). Clusters are merged transitively and replaced by their mean.
 * Zero-length results and duplicates are dropped.
 */
export function snapEndpoints(segs: Seg[], tol: number): Seg[] {
  const pts: Pt[] = [];
  segs.forEach(([a, b]) => { pts.push(a, b); });
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const grid = new Grid<number>(Math.max(tol * 2, 1e-6));
  pts.forEach((p, i) => {
    for (const j of grid.query(p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol)) {
      if (dist(p, pts[j]) <= tol) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
    grid.insert(i, p[0], p[1], p[0], p[1]);
  });
  const sum = new Map<number, [number, number, number]>();
  pts.forEach((p, i) => {
    const r = find(i);
    const s = sum.get(r) ?? [0, 0, 0];
    sum.set(r, [s[0] + p[0], s[1] + p[1], s[2] + 1]);
  });
  const rep = new Map<number, Pt>();
  for (const [r, s] of sum) rep.set(r, [s[0] / s[2], s[1] / s[2]]);
  const out: Seg[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < segs.length; i++) {
    const a = rep.get(find(2 * i))!, b = rep.get(find(2 * i + 1))!;
    if (a === b || dist(a, b) < 1e-9) continue;
    const k = segKey(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([a, b]);
  }
  return out;
}

/**
 * Split every segment at the vertices (segment endpoints) lying on it within `tol` (T-junctions: a hip that ends
 * on the middle of a gutter line), and at proper crossings. Overlapping collinear pieces become duplicates and
 * are removed, so a line drawn twice (or in overlapping parts) comes out once.
 */
export function nodeSegments(segs: Seg[], tol: number): Seg[] {
  if (!segs.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [a, b] of segs) {
    x0 = Math.min(x0, a[0], b[0]); y0 = Math.min(y0, a[1], b[1]);
    x1 = Math.max(x1, a[0], b[0]); y1 = Math.max(y1, a[1], b[1]);
  }
  const cell = Math.max(tol * 4, Math.max(x1 - x0, y1 - y0) / 64, 1e-6);
  const grid = new Grid<number>(cell);
  segs.forEach(([a, b], i) => grid.insert(i, a[0] - tol, a[1] - tol, b[0] + tol, b[1] + tol));
  // Vertex registry so crossing points that land near an existing vertex reuse it.
  const vgrid = new Grid<Pt>(Math.max(tol * 2, 1e-6));
  const verts: Pt[] = [];
  const addVert = (p: Pt): Pt => {
    for (const v of vgrid.query(p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol)) if (dist(v, p) <= tol) return v;
    verts.push(p);
    vgrid.insert(p, p[0], p[1], p[0], p[1]);
    return p;
  };
  const ends = segs.map(([a, b]) => [addVert(a), addVert(b)] as Seg);
  const cuts: Pt[][] = ends.map(([a, b]) => [a, b]);
  for (let i = 0; i < ends.length; i++) {
    const [a, b] = ends[i];
    const L = dist(a, b);
    for (const j of grid.query(Math.min(a[0], b[0]) - tol, Math.min(a[1], b[1]) - tol, Math.max(a[0], b[0]) + tol, Math.max(a[1], b[1]) + tol)) {
      if (j === i) continue;
      const [c, d] = ends[j];
      // T-junction: an endpoint of j on the interior of i.
      for (const q of [c, d]) {
        if (q === a || q === b) continue;
        const t = projT(q, a, b);
        if (t * L > tol && (1 - t) * L > tol && segDist(q, a, b) <= tol) cuts[i].push(q);
      }
      // Proper crossing.
      if (j > i) {
        const x = segIntersect(a, b, c, d);
        if (x && x.t * L > tol && (1 - x.t) * L > tol) {
          const M = dist(c, d);
          if (x.u * M > tol && (1 - x.u) * M > tol) {
            const v = addVert(x.p);
            cuts[i].push(v);
            cuts[j].push(v);
          }
        }
      }
    }
  }
  const out: Seg[] = [];
  const seen = new Set<string>();
  cuts.forEach((cs, i) => {
    const a = ends[i][0];
    const uniq = [...new Set(cs)].sort((p, q) => dist(a, p) - dist(a, q));
    for (let k = 0; k + 1 < uniq.length; k++) {
      const p = uniq[k], q = uniq[k + 1];
      if (dist(p, q) <= 1e-9) continue;
      const sk = segKey(p, q);
      if (seen.has(sk)) continue;
      seen.add(sk);
      out.push([p, q]);
    }
  });
  return out;
}

/** Snap + node in one go: the standard clean-up for drawn line work. */
export function cleanSegments(segs: Seg[], snapTol: number, nodeTol = snapTol / 2): Seg[] {
  return nodeSegments(snapEndpoints(segs, snapTol), nodeTol);
}

/** Remove segments hanging off the network by a free end (repeatedly), e.g. a leader line or a stray stub. */
export function pruneDangling(segs: Seg[]): Seg[] {
  let cur = segs;
  for (;;) {
    const deg = new Map<string, number>();
    for (const [a, b] of cur) { deg.set(key(a), (deg.get(key(a)) ?? 0) + 1); deg.set(key(b), (deg.get(key(b)) ?? 0) + 1); }
    const next = cur.filter(([a, b]) => deg.get(key(a))! > 1 && deg.get(key(b))! > 1);
    if (next.length === cur.length) return next;
    cur = next;
  }
}

/** Connected components of a segment network (by shared endpoints). */
export function components(segs: Seg[]): Seg[][] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  for (const [a, b] of segs) {
    const ka = key(a), kb = key(b);
    if (!parent.has(ka)) parent.set(ka, ka);
    if (!parent.has(kb)) parent.set(kb, kb);
    const ra = find(ka), rb = find(kb);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const r = find(key(s[0]));
    const g = groups.get(r);
    if (g) g.push(s); else groups.set(r, [s]);
  }
  return [...groups.values()];
}

export type HalfEdge = { from: Pt; to: Pt; seg: number };
export type Face = { pts: Pt[]; edges: HalfEdge[]; area: number };

/**
 * Bounded faces of a noded planar segment network, by walking half-edges: leaving each vertex we always take the
 * next edge clockwise from the one we came in on, which traces every face with its interior on the left.
 * Bounded faces come out with positive signed area; each component's outside boundary comes out negative and is
 * dropped. Segments must already be noded (cleanSegments) and share exact endpoint objects/values.
 */
export function planarFaces(segs: Seg[]): Face[] {
  const out = new Map<string, { to: Pt; ang: number; seg: number; rev: boolean }[]>();
  const pt = new Map<string, Pt>();
  segs.forEach(([a, b], i) => {
    const ka = key(a), kb = key(b);
    pt.set(ka, a); pt.set(kb, b);
    if (!out.has(ka)) out.set(ka, []);
    if (!out.has(kb)) out.set(kb, []);
    out.get(ka)!.push({ to: b, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), seg: i, rev: false });
    out.get(kb)!.push({ to: a, ang: Math.atan2(a[1] - b[1], a[0] - b[0]), seg: i, rev: true });
  });
  for (const list of out.values()) list.sort((p, q) => p.ang - q.ang);
  const used = new Set<string>();
  const hk = (from: Pt, to: Pt) => `${key(from)}>${key(to)}`;
  const faces: Face[] = [];
  for (const [kFrom, list] of out) {
    for (const h0 of list) {
      const from0 = pt.get(kFrom)!;
      if (used.has(hk(from0, h0.to))) continue;
      const pts: Pt[] = [];
      const edges: HalfEdge[] = [];
      let from = from0, h = h0;
      let guard = 0;
      while (!used.has(hk(from, h.to)) && guard++ < 100000) {
        used.add(hk(from, h.to));
        pts.push(from);
        edges.push({ from, to: h.to, seg: h.seg });
        const at = out.get(key(h.to))!;
        // index of the twin (to -> from) in the list around `to`
        const i = at.findIndex((e) => e.to === from || (e.to[0] === from[0] && e.to[1] === from[1]));
        const next = at[(i - 1 + at.length) % at.length];
        from = h.to;
        h = next;
      }
      if (pts.length < 3) continue;
      const A = signedArea(pts);
      if (A > 0) faces.push({ pts, edges, area: A });
    }
  }
  return faces;
}

/** Join two segments that meet end to end in a straight line at a vertex no other segment touches. */
export function mergeCollinear(segs: Seg[], maxTurnDeg = 2): Seg[] {
  let cur = segs.slice();
  for (let guard = 0; guard < 10000; guard++) {
    const at = new Map<string, number[]>();
    cur.forEach(([a, b], i) => { for (const p of [a, b]) at.set(key(p), [...(at.get(key(p)) ?? []), i]); });
    let merged = false;
    for (const [k, list] of at) {
      if (list.length !== 2) continue;
      const [i, j] = list;
      const far = (s: Seg) => (key(s[0]) === k ? s[1] : s[0]);
      const p = key(cur[i][0]) === k ? cur[i][0] : cur[i][1];
      const a = far(cur[i]), b = far(cur[j]);
      if (Math.abs(Math.abs(turnDeg(unit(sub(a, p)), unit(sub(b, p)))) - 180) > maxTurnDeg) continue;
      cur = cur.filter((_, x) => x !== i && x !== j);
      cur.push([a, b]);
      merged = true;
      break;
    }
    if (!merged) return cur;
  }
  return cur;
}
