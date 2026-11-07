import { describe, expect, it } from "vitest";
import type { Pt } from "./geometry";
import { analyzeRoof, normalizeLines, type PlanLine } from "./roof-model";
import { hipRoofLines, isRectilinear } from "./skeleton";

// Roofs drawn at 1:100: paper mm = real mm / 100.
const S = 100;
const P = (x: number, y: number): Pt => [x / S, y / S];
const L = (a: Pt, b: Pt, set?: PlanLine["set"]): PlanLine => ({ a: P(...a), b: P(...b), ...(set ? { set } : {}) });
const loop = (pts: Pt[]) => pts.map((p, i) => L(p, pts[(i + 1) % pts.length]));
const roof = (lines: PlanLine[], pitch = 25) => analyzeRoof({ scale: S, pitch, lines: normalizeLines(lines, S) });

const tan25 = Math.tan((25 * Math.PI) / 180), cos25 = Math.cos((25 * Math.PI) / 180);
// A 45° hip or valley rising h over a plan run of h·√2.
const hip = (h: number) => Math.hypot(h * Math.SQRT2, h * tan25) / 1000;

describe("rectangular hip roof 10 × 6 m at 25°", () => {
  const lines = [
    ...loop([[0, 0], [10000, 0], [10000, 6000], [0, 6000]]),
    L([0, 0], [3000, 3000]), L([0, 6000], [3000, 3000]), L([10000, 0], [7000, 3000]), L([10000, 6000], [7000, 3000]), L([3000, 3000], [7000, 3000]),
  ];
  const a = roof(lines);
  it("has 4 panels, plan 60 m² and true area 60 ÷ cos 25°", () => {
    expect(a.faces).toHaveLength(4);
    expect(a.totals.plan).toBeCloseTo(60, 2);
    expect(a.totals.area).toBeCloseTo(60 / cos25, 1);
  });
  it("measures hips in 3D, ridge level, gutters all round", () => {
    expect(a.totals.hip).toBeCloseTo(4 * hip(3000), 1);
    expect(a.totals.ridge).toBeCloseTo(4, 2);
    expect(a.totals.eave).toBeCloseTo(32, 2);
    expect(a.totals.valley).toBe(0);
    expect(a.totals.barge).toBe(0);
  });
  it("puts the ridge at width/2 × tan(pitch)", () => {
    expect(a.height([3000, 3000])).toBeCloseTo(3000 * tan25, 0);
    expect(a.height([0, 0])).toBe(0);
  });
});

describe("L-shaped hip roof with a valley", () => {
  const outline: Pt[] = [[0, 0], [12000, 0], [12000, 6000], [6000, 6000], [6000, 12000], [0, 12000]];
  const lines = [
    ...loop(outline),
    L([0, 0], [3000, 3000]), L([12000, 0], [9000, 3000]), L([12000, 6000], [9000, 3000]), L([6000, 12000], [3000, 9000]), L([0, 12000], [3000, 9000]),
    L([3000, 3000], [9000, 3000]), L([3000, 3000], [3000, 9000]), L([6000, 6000], [3000, 3000]),
  ];
  const a = roof(lines);
  it("classifies hips from outside corners and the valley from the inside corner", () => {
    expect(a.totals.plan).toBeCloseTo(108, 2);
    expect(a.totals.area).toBeCloseTo(108 / cos25, 1);
    expect(a.totals.hip).toBeCloseTo(5 * hip(3000), 1);
    expect(a.totals.valley).toBeCloseTo(hip(3000), 2);
    expect(a.totals.ridge).toBeCloseTo(12, 2);
    expect(a.totals.eave).toBeCloseTo(48, 2);
    const valley = a.edges.find((e) => e.type === "valley")!;
    expect(a.corners.get(`${valley.a[0]},${valley.a[1]}`) ?? a.corners.get(`${valley.b[0]},${valley.b[1]}`)).toBe("reflex");
  });
  it("lets the user change a line's type", () => {
    const i = a.edges.find((e) => e.type === "valley")!.i;
    const model = normalizeLines(lines, S);
    const b = analyzeRoof({ scale: S, pitch: 25, lines: model.map((l, j) => (j === i ? { ...l, set: "hip" } : l)) });
    expect(b.totals.valley).toBe(0);
    expect(b.totals.hip).toBeCloseTo(6 * hip(3000), 1);
  });
  it("the hip-roof generator draws the same roof from the outline alone", () => {
    expect(isRectilinear(outline)).toBe(true);
    const gen = hipRoofLines(outline)!;
    const b = roof([...loop(outline), ...gen.map(([p, q]) => L(p, q))]);
    expect(b.faces).toHaveLength(6);
    expect(b.totals.hip).toBeCloseTo(a.totals.hip, 1);
    expect(b.totals.valley).toBeCloseTo(a.totals.valley, 1);
    expect(b.totals.ridge).toBeCloseTo(a.totals.ridge, 1);
  });
});

describe("gable roof", () => {
  const a = roof([...loop([[0, 0], [10000, 0], [10000, 6000], [0, 6000]]), L([0, 3000], [10000, 3000])]);
  it("makes the ends barges when the ridge runs out to them", () => {
    expect(a.faces).toHaveLength(2);
    expect(a.totals.ridge).toBeCloseTo(10, 2);
    expect(a.totals.eave).toBeCloseTo(20, 2);
    expect(a.totals.barge).toBeCloseTo((4 * Math.hypot(3000, 3000 * tan25)) / 1000, 1);
    expect(a.totals.hip).toBe(0);
    expect(a.totals.area).toBeCloseTo(60 / cos25, 1);
    expect(a.height([0, 3000])).toBeCloseTo(3000 * tan25, 0);
  });
});

describe("skillion", () => {
  // One panel, gutter along y = 0, high side (y = 4000) against a wall: the user marks it apron.
  const lines = [L([0, 0], [6000, 0]), L([6000, 0], [6000, 4000]), L([6000, 4000], [0, 4000], "apron"), L([0, 4000], [0, 0])];
  const a = roof(lines);
  it("slopes from the one gutter up to the apron, sides become barges", () => {
    expect(a.faces).toHaveLength(1);
    expect(a.totals.eave).toBeCloseTo(6, 2);
    expect(a.totals.apron).toBeCloseTo(6, 2);
    expect(a.totals.barge).toBeCloseTo((2 * 4000) / cos25 / 1000, 1);
    expect(a.totals.area).toBeCloseTo(24 / cos25, 1);
    expect(a.height([0, 4000])).toBeCloseTo(4000 * tan25, 0);
  });
});

describe("a kink in a straight eave", () => {
  // The bottom eave bends 8° at x = 5000 where nothing lands; still a hip roof with four hips.
  const k = Math.tan((8 * Math.PI) / 180) * 5000;
  const lines = [
    L([0, 0], [5000, 0]), L([5000, 0], [10000, -k]), L([10000, -k], [10000, 6000]), L([10000, 6000], [0, 6000]), L([0, 6000], [0, 0]),
    L([0, 0], [3000, 3000]), L([0, 6000], [3000, 3000]), L([10000, -k], [7000, 3000]), L([10000, 6000], [7000, 3000]), L([3000, 3000], [7000, 3000]),
  ];
  const a = roof(lines);
  it("is not treated as a corner", () => {
    const kinkKey = [...a.corners.entries()].find(([kk]) => kk.startsWith("5000,"))!;
    expect(kinkKey[1]).toBe("kink");
    expect(a.edges.filter((e) => e.type === "hip")).toHaveLength(4);
    expect(a.totals.valley).toBe(0);
  });
});
