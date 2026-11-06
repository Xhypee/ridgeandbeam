import { describe, expect, it } from "vitest";
import { DEFAULT_MEASUREMENTS, normalizeMeasurements, pitchFactor, summarize, takeoff, totals, type Measurements } from "./roof";

const m = (over: Partial<Measurements>): Measurements => ({ ...DEFAULT_MEASUREMENTS, ...over });

describe("pitchFactor", () => {
  it("matches standard pitch multipliers", () => {
    expect(pitchFactor(0)).toBe(1);
    expect(pitchFactor(4)).toBeCloseTo(1.0541, 4);
    expect(pitchFactor(6)).toBeCloseTo(1.1180, 4);
    expect(pitchFactor(12)).toBeCloseTo(1.4142, 4);
  });
});

describe("summarize", () => {
  it("converts plan area to squares with waste rounded up to whole bundles", () => {
    // 2000 sq ft footprint at 6/12 -> 2236.07 sq ft -> 22.36 sq; +10% = 24.60 -> 24.67 (74 bundles / 3)
    const s = summarize(m({ sections: [{ label: "Main", area: 2000, pitch: 6 }], wastePct: 10 }));
    expect(s.surfaceArea).toBeCloseTo(2236.07, 2);
    expect(s.squares).toBe(22.36);
    expect(s.orderSquares).toBe(24.67);
    expect(s.steepSquares).toBe(0);
  });

  it("tracks steep squares separately and sums sections", () => {
    const s = summarize(
      m({ sections: [{ label: "A", area: 1000, pitch: 4 }, { label: "B", area: 500, pitch: 10 }], wastePct: 0 }),
    );
    expect(s.squares).toBeCloseTo(10.54 + 6.51, 1);
    expect(s.steepSquares).toBeCloseTo(6.51, 2);
  });

  it("ignores negative / junk input", () => {
    const s = summarize(m({ sections: [{ label: "x", area: -50, pitch: NaN }] }));
    expect(s.squares).toBe(0);
    expect(s.orderSquares).toBe(0);
  });
});

describe("takeoff", () => {
  it("produces a full material list for a typical gable roof", () => {
    const q = Object.fromEntries(
      takeoff(
        m({
          sections: [{ label: "Main", area: 2000, pitch: 6 }],
          wastePct: 10,
          eaves: 120,
          rakes: 80,
          ridges: 45,
          hips: 0,
          valleys: 20,
          layers: 1,
          pipeBoots: 3,
          iceWaterRows: 1,
        }),
      ).map((t) => [t.key, t.quantity]),
    );
    expect(q.tearoff).toBe(22.36);
    expect(q.labor).toBe(22.36);
    expect(q.steep).toBeUndefined();
    expect(q.shingles).toBe(74);
    expect(q.underlayment).toBe(3);
    expect(q.ice_water).toBe(3); // (120 + 20) / 66 -> 2.12 -> 3
    expect(q.starter).toBe(2); // 200 LF
    expect(q.ridge_cap).toBe(2); // 45 LF
    expect(q.drip_edge).toBe(20); // 200 LF / 10
    expect(q.ridge_vent).toBe(12); // 45 / 4
    expect(q.nails).toBe(2);
    expect(q.pipe_boot).toBe(3);
    expect(q.dumpster).toBe(1);
    expect(q.permit).toBe(1);
  });

  it("skips tear-off for overlays and returns nothing for an empty roof", () => {
    expect(takeoff(m({ sections: [{ label: "A", area: 1000, pitch: 5 }], layers: 0 })).some((t) => t.key === "tearoff")).toBe(false);
    expect(takeoff(m({ sections: [{ label: "A", area: 0, pitch: 5 }], ridgeVent: true }))).toEqual([]);
  });
});

describe("totals", () => {
  it("applies discount before tax", () => {
    const t = totals([{ quantity: 30, unit_price: 40 }, { quantity: 10, unit_price: 80 }], 200, 10);
    expect(t).toEqual({ subtotal: 2000, discount: 200, tax: 180, total: 1980 });
  });
  it("never goes negative", () => {
    expect(totals([{ quantity: 1, unit_price: 50 }], 100, 8).total).toBe(0);
  });
});

describe("normalizeMeasurements", () => {
  it("fills defaults from empty jsonb", () => {
    const n = normalizeMeasurements({}, 12);
    expect(n.wastePct).toBe(12);
    expect(n.sections).toHaveLength(1);
    expect(n.ridgeVent).toBe(true);
  });
});
