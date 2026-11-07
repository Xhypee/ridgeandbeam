// "Hip roof: work out the hips and ridges" for a plan that only shows the outline. For square-cornered (rectilinear)
// outlines the straight skeleton is found by shrinking the outline: every edge moves inward at the same speed,
// corners move along their 45° bisectors (those paths are the hips and valleys), and where two opposite edges meet
// the overlap becomes a ridge. Events are solved exactly between steps, so the result is exact for equal pitches.

import { dist, dot, key, leftNormal, mergeCollinear, signedArea, sub, unit, type Pt, type Seg } from "./geometry";

const EPS = 1e-6;

/** True when every edge is (within `tolDeg`) parallel to the longest edge or square to it. */
export function isRectilinear(pts: Pt[], tolDeg = 2): boolean {
  if (pts.length < 4) return false;
  const ang = mainAngle(pts);
  return pts.every((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const a = (Math.atan2(q[1] - p[1], q[0] - p[0]) - ang) * (180 / Math.PI);
    const m = ((a % 90) + 90) % 90;
    return dist(p, q) < EPS || m < tolDeg || m > 90 - tolDeg;
  });
}
function mainAngle(pts: Pt[]): number {
  let best = 0, bl = -1;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; const l = dist(p, q); if (l > bl) { bl = l; best = Math.atan2(q[1] - p[1], q[0] - p[0]); } });
  return best;
}
const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/** Make an almost-rectilinear polygon exactly axis-aligned (after rotating its main direction onto x). */
function squareUp(pts: Pt[]): Pt[] {
  // drop repeated / collinear points
  let ps = pts.filter((p, i) => dist(p, pts[(i + 1) % pts.length]) > EPS);
  const horiz = (a: Pt, b: Pt) => Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  for (let changed = true; changed && ps.length > 3; ) {
    changed = false;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[(i - 1 + ps.length) % ps.length], b = ps[i], c = ps[(i + 1) % ps.length];
      if (horiz(a, b) === horiz(b, c)) { ps = ps.filter((_, j) => j !== i); changed = true; break; }
    }
  }
  const n = ps.length;
  const edgeH = ps.map((p, i) => horiz(p, ps[(i + 1) % n]));
  const coord = ps.map((p, i) => { const q = ps[(i + 1) % n]; return edgeH[i] ? (p[1] + q[1]) / 2 : (p[0] + q[0]) / 2; });
  return ps.map((_, i) => {
    const prev = (i - 1 + n) % n;
    return edgeH[prev] ? [coord[i], coord[prev]] : [coord[prev], coord[i]];
  });
}

type Poly = Pt[];

function velocities(poly: Poly): Pt[] {
  const n = poly.length;
  return poly.map((_, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const n1 = leftNormal(unit(sub(b, a))), n2 = leftNormal(unit(sub(c, b)));
    return [n1[0] + n2[0], n1[1] + n2[1]];
  });
}

/** Time until the next event in one wavefront polygon (Infinity if none). */
function nextEvent(poly: Poly, vel: Pt[]): number {
  const n = poly.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = unit(sub(poly[j], poly[i]));
    const rate = dot(sub(vel[j], vel[i]), d);
    if (rate < -EPS) best = Math.min(best, dist(poly[i], poly[j]) / -rate);
  }
  // opposite edges closing on each other
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], de = unit(sub(b, a)), ne = leftNormal(de);
    for (let k = i + 1; k < n; k++) {
      const c = poly[k], d = poly[(k + 1) % n], df = unit(sub(d, c));
      if (dot(de, df) > -1 + 1e-9) continue;
      const gap = dot(ne, sub(c, a));
      if (gap <= EPS) continue;
      const t = gap / 2;
      // overlap of the two edges' extents at that time
      const at = (p: Pt, v: Pt): number => dot([p[0] + v[0] * t, p[1] + v[1] * t], de);
      const e0 = at(a, vel[i]), e1 = at(b, vel[(i + 1) % n]), f0 = at(c, vel[k]), f1 = at(d, vel[(k + 1) % n]);
      const lo = Math.max(Math.min(e0, e1), Math.min(f0, f1)), hi = Math.min(Math.max(e0, e1), Math.max(f0, f1));
      if (hi - lo > EPS) best = Math.min(best, t);
    }
  }
  // corners running into each other
  for (let i = 0; i < n; i++) for (let k = i + 2; k < n; k++) {
    if (i === 0 && k === n - 1) continue;
    const dv = sub(vel[i], vel[k]), dp = sub(poly[k], poly[i]);
    const l2 = dot(dv, dv);
    if (l2 < EPS) continue;
    const t = dot(dp, dv) / l2;
    if (t <= EPS) continue;
    const miss = sub(dp, [dv[0] * t, dv[1] * t]);
    if (Math.hypot(miss[0], miss[1]) < 1e-4) best = Math.min(best, t);
  }
  return best;
}

/** Tidy a wavefront after an event: cancel opposite overlapping edges (ridges), split at pinches, drop slivers. */
function resolve(poly: Poly, ridges: Seg[]): Poly[] {
  type DE = { a: Pt; b: Pt };
  let edges: DE[] = [];
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; if (dist(p, q) > 1e-5) edges.push({ a: p, b: q }); });
  // split every edge at vertices lying on it
  const verts = edges.map((e) => e.a);
  const split: DE[] = [];
  for (const e of edges) {
    const d = sub(e.b, e.a), L = Math.hypot(d[0], d[1]);
    const cuts = [0, 1];
    for (const v of verts) {
      const t = dot(sub(v, e.a), d) / (L * L);
      const off = Math.abs(d[0] * (v[1] - e.a[1]) - d[1] * (v[0] - e.a[0])) / L;
      if (t > 1e-7 && t < 1 - 1e-7 && off < 1e-4) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p: Pt = [e.a[0] + d[0] * cuts[k], e.a[1] + d[1] * cuts[k]], q: Pt = [e.a[0] + d[0] * cuts[k + 1], e.a[1] + d[1] * cuts[k + 1]];
      if (dist(p, q) > 1e-5) split.push({ a: p, b: q });
    }
  }
  // snap coordinates so equal points compare equal
  const sn = (p: Pt): Pt => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
  edges = split.map((e) => ({ a: sn(e.a), b: sn(e.b) }));
  // cancel a→b against b→a
  const live = new Map<string, DE[]>();
  for (const e of edges) {
    const back = `${key(e.b)}>${key(e.a)}`;
    const list = live.get(back);
    if (list?.length) { list.pop(); ridges.push([e.a, e.b]); continue; }
    const k = `${key(e.a)}>${key(e.b)}`;
    live.set(k, [...(live.get(k) ?? []), e]);
  }
  const rest = [...live.values()].flat();
  const outOf = new Map<string, DE[]>();
  for (const e of rest) outOf.set(key(e.a), [...(outOf.get(key(e.a)) ?? []), e]);
  const used = new Set<DE>();
  const polys: Poly[] = [];
  for (const e0 of rest) {
    if (used.has(e0)) continue;
    const loop: Pt[] = [];
    let e: DE | undefined = e0;
    for (let g = 0; e && !used.has(e) && g < 10000; g++) {
      used.add(e);
      loop.push(e.a);
      const cands: DE[] = (outOf.get(key(e.b)) ?? []).filter((x) => !used.has(x));
      if (cands.length <= 1) { e = cands[0]; continue; }
      const rev = Math.atan2(e.a[1] - e.b[1], e.a[0] - e.b[0]);
      const cw = (x: DE) => { let a = rev - Math.atan2(x.b[1] - x.a[1], x.b[0] - x.a[0]); while (a <= 1e-9) a += 2 * Math.PI; return a; };
      e = cands.sort((x, y) => cw(x) - cw(y))[0];
    }
    // drop straight-through vertices
    const clean = loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], c = loop[(i + 1) % loop.length];
      return Math.abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-6 || dot(sub(p, a), sub(c, p)) < 0;
    });
    if (clean.length >= 4 && signedArea(clean) > 1e-3) polys.push(clean);
  }
  return polys;
}

/**
 * Hips, valleys and ridges (inner lines only) of an equal-pitch hip roof over a rectilinear outline, in the
 * outline's own coordinates. Returns null when the outline isn't square-cornered.
 */
export function hipRoofLines(outline: Pt[]): Seg[] | null {
  if (!isRectilinear(outline)) return null;
  const ang = mainAngle(outline);
  let pts = outline.map((p) => rot(p, -ang));
  if (signedArea(pts) < 0) pts = pts.reverse();
  let polys: Poly[] = [squareUp(pts)];
  const lines: Seg[] = [];
  for (let guard = 0; polys.length && guard < 2000; guard++) {
    const next: Poly[] = [];
    for (const poly of polys) {
      const vel = velocities(poly);
      const t = nextEvent(poly, vel);
      if (!Number.isFinite(t)) continue;
      const moved = poly.map((p, i) => [p[0] + vel[i][0] * t, p[1] + vel[i][1] * t] as Pt);
      poly.forEach((p, i) => { if (dist(p, moved[i]) > 1e-5) lines.push([p, moved[i]]); });
      next.push(...resolve(moved, lines));
    }
    polys = next;
  }
  const r3 = (p: Pt): Pt => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
  const back = lines.map(([a, b]) => [r3(rot(a, ang)), r3(rot(b, ang))] as Seg);
  // tidy: dedupe and join straight pieces
  const seen = new Set<string>();
  const uniq = back.filter(([a, b]) => {
    const k = [key([Math.round(a[0] * 100) / 100, Math.round(a[1] * 100) / 100]), key([Math.round(b[0] * 100) / 100, Math.round(b[1] * 100) / 100])].sort().join("|");
    if (seen.has(k) || dist(a, b) < 1e-3) return false;
    seen.add(k);
    return true;
  });
  return mergeCollinear(uniq, 0.5);
}
