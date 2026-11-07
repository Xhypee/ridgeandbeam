import { describe, expect, it } from "vitest";
import { cleanSegments, mergeCollinear, nodeSegments, planarFaces, pruneDangling, signedArea, snapEndpoints, type Pt, type Seg } from "./geometry";
import { cornerType } from "./roof-model";

const square = (x: number, y: number, s: number): Seg[] => [
  [[x, y], [x + s, y]], [[x + s, y], [x + s, y + s]], [[x + s, y + s], [x, y + s]], [[x, y + s], [x, y]],
];

describe("planar face extraction", () => {
  it("finds the bounded faces of a square split by a diagonal", () => {
    const segs: Seg[] = [...square(0, 0, 10), [[0, 0], [10, 10]]];
    const faces = planarFaces(cleanSegments(segs, 0.1));
    expect(faces).toHaveLength(2);
    expect(faces.map((f) => f.area).sort()).toEqual([50, 50]);
    for (const f of faces) expect(signedArea(f.pts)).toBeGreaterThan(0);
  });
  it("handles two rooms sharing a wall, and ignores a dangling line", () => {
    const segs: Seg[] = [...square(0, 0, 10), ...square(10, 0, 10), [[20, 5], [30, 5]]];
    const faces = planarFaces(cleanSegments(segs, 0.1));
    expect(faces.map((f) => Math.round(f.area))).toEqual([100, 100]);
    // the stub splits the right-hand wall in two; pruning removes only the stub
    expect(cleanSegments(segs, 0.1)).toHaveLength(9);
    expect(pruneDangling(cleanSegments(segs, 0.1))).toHaveLength(8);
  });
});

describe("snapping and noding", () => {
  it("merges a line drawn twice a few mm apart", () => {
    const a = square(0, 0, 1000);
    const b = square(8, -6, 1000);
    const out = snapEndpoints([...a, ...b], 60);
    expect(out).toHaveLength(4);
    expect(planarFaces(out)).toHaveLength(1);
  });
  it("splits a line where another one ends on it (T-junction)", () => {
    const out = nodeSegments([[[0, 0], [10, 0]], [[5, 0.01], [5, 5]]], 0.05);
    expect(out).toHaveLength(3);
    expect(out.some(([p, q]) => (p[0] === 0 && q[0] === 5) || (p[0] === 5 && q[0] === 0))).toBe(true);
  });
  it("splits crossing lines and drops overlapping duplicates", () => {
    const out = nodeSegments([[[0, 0], [10, 10]], [[0, 10], [10, 0]], [[0, 0], [10, 10]]], 0.01);
    expect(out).toHaveLength(4);
  });
  it("joins straight pieces that meet end to end", () => {
    const pieces: Seg[] = [[[0, 0], [1, 1]], [[1, 1], [3, 3]], [[3, 3], [3, 5]]];
    expect(mergeCollinear(pieces)).toHaveLength(2);
  });
});

describe("eave kink rule", () => {
  const dir = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  it("a bend under 20° in a straight eave is not a corner", () => {
    expect(cornerType(dir(0), dir(10))).toBe("kink");
    expect(cornerType(dir(0), dir(-19))).toBe("kink");
  });
  it("left turns are outside (convex) corners, right turns inside (reflex)", () => {
    expect(cornerType(dir(0), dir(90))).toBe("convex");
    expect(cornerType(dir(0), dir(-90))).toBe("reflex");
    expect(cornerType(dir(0), dir(25))).toBe("convex");
  });
});
