import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEASUREMENTS, facetsToSections, instantQuoteRange, margin, mergeMeasurements, monthlyPayment, normalizeMeasurements,
  parseFacetCsv, parsePitch, pitchFactor, sectionSystem, summarize, takeoff, totals, type Measurements,
} from "./roof";

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

// N5: per-section waste & system, bundles/sq, pitch tiers, layers, decking, report import, money helpers.
const q = (mm: Measurements, opts?: Parameters<typeof takeoff>[1]) => Object.fromEntries(takeoff(mm, opts).map((t) => [t.key, t.quantity]));

describe("low-slope sections", () => {
  it("defaults sections under 3/12 to low-slope", () => {
    expect(sectionSystem({ pitch: 2 })).toBe("low_slope");
    expect(sectionSystem({ pitch: 3 })).toBe("shingle");
    expect(sectionSystem({ pitch: 1, system: "shingle" })).toBe("shingle");
  });

  it("excludes low-slope from shingles, underlayment, starter and waste, and prices it via low_slope", () => {
    const mm = m({
      sections: [{ label: "Main", area: 2000, pitch: 6 }, { label: "Porch", area: 400, pitch: 1 }],
      wastePct: 10, eaves: 120, rakes: 80, ridges: 45,
    });
    const s = summarize(mm);
    expect(s.lowSlopeSquares).toBeCloseTo(4.01, 2); // 400 * 1.0035
    expect(s.bundles).toBe(74); // same as the main roof alone
    const t = q(mm);
    expect(t.shingles).toBe(74);
    expect(t.low_slope).toBe(4.01); // no shingle waste on low-slope
    expect(t.underlayment).toBe(3);
    expect(t.labor).toBe(22.36); // shingle install labor only
    expect(t.tearoff).toBe(26.37); // tear-off is the whole roof
    // starter: 200 LF x steep share (2236.07 / 2637.47) = 169.6 LF -> 2 bundles
    expect(t.starter).toBe(2);
  });

  it("an all-low-slope roof gets no shingle, underlayment, starter or labor lines", () => {
    const t = q(m({ sections: [{ label: "Flat", area: 1500, pitch: 0.5 }], eaves: 150, rakes: 50 }));
    expect(t.shingles).toBeUndefined();
    expect(t.underlayment).toBeUndefined();
    expect(t.starter).toBeUndefined();
    expect(t.labor).toBeUndefined();
    expect(t.nails).toBeUndefined();
    expect(t.low_slope).toBe(15.01);
    expect(t.drip_edge).toBe(20);
  });

  it("per-section waste override applies to low-slope and shingle sections", () => {
    const t = q(m({ sections: [{ label: "Flat", area: 1000, pitch: 0, waste: 5 }, { label: "Main", area: 1000, pitch: 6, waste: 15 }], wastePct: 10 }));
    expect(t.low_slope).toBe(10.5);
    // 11.18 sq * 1.15 = 12.857 sq -> 38.57 bundles -> 39
    expect(t.shingles).toBe(39);
  });

  it("metal sections are priced via metal with waste and skip shingles", () => {
    const t = q(m({ sections: [{ label: "Metal", area: 1000, pitch: 4, system: "metal" }], wastePct: 10 }));
    expect(t.shingles).toBeUndefined();
    expect(t.metal).toBe(11.6); // 10.54 * 1.1
    expect(t.underlayment).toBe(2);
    expect(t.labor).toBe(10.54);
  });
});

describe("bundles per square", () => {
  it("uses the configured bundles per square", () => {
    const mm = m({ sections: [{ label: "Main", area: 2000, pitch: 6 }], wastePct: 10 });
    const s4 = summarize(mm, { bundlesPerSquare: 4 });
    expect(s4.bundles).toBe(99); // 24.6 sq x 4 = 98.39 -> 99
    expect(s4.orderSquares).toBe(24.75);
    expect(summarize(mm).bundles).toBe(74);
    expect(q(mm, { bundlesPerSquare: 4 }).shingles).toBe(99);
  });
});

describe("pitch-tier labor", () => {
  it("charges steep for 8-9/12 and steep_high for 10/12 and up", () => {
    const t = q(m({ sections: [{ label: "A", area: 1000, pitch: 8 }, { label: "B", area: 500, pitch: 9 }, { label: "C", area: 500, pitch: 12 }], wastePct: 0 }));
    expect(t.steep).toBeCloseTo(12.02 + 6.25, 1); // 1000 * 1.2019 + 500 * 1.25
    expect(t.steep_high).toBe(7.07); // 500 * 1.4142
  });
  it("no steep charge below 8/12", () => {
    const t = q(m({ sections: [{ label: "A", area: 1000, pitch: 7.5 }] }));
    expect(t.steep).toBeUndefined();
    expect(t.steep_high).toBeUndefined();
  });
});

describe("tear-off layers and decking", () => {
  it("prices extra layers separately", () => {
    const t = q(m({ sections: [{ label: "A", area: 1000, pitch: 0 }], layers: 3 }));
    expect(t.tearoff).toBe(10);
    expect(t.extra_layer).toBe(20);
    expect(q(m({ sections: [{ label: "A", area: 1000, pitch: 0 }], layers: 1 })).extra_layer).toBeUndefined();
  });
  it("adds a decking allowance in sheets", () => {
    expect(q(m({ sections: [{ label: "A", area: 1000, pitch: 6 }], deckingSheets: 6 })).decking).toBe(6);
    expect(q(m({ sections: [{ label: "A", area: 1000, pitch: 6 }] })).decking).toBeUndefined();
  });
});

describe("normalizeMeasurements (v2 keys)", () => {
  it("keeps per-section waste/system and drops junk systems", () => {
    const n = normalizeMeasurements({
      sections: [{ label: "A", area: 10, pitch: 2, waste: 4, system: "metal" }, { label: "B", area: 5, pitch: 6, system: "tile" }],
      deckingSheets: 3,
    });
    expect(n.sections[0]).toEqual({ label: "A", area: 10, pitch: 2, waste: 4, system: "metal" });
    expect(n.sections[1].system).toBeUndefined();
    expect(n.sections[1].waste).toBeNull();
    expect(n.deckingSheets).toBe(3);
  });
  it("reads satellite-measure sections (contract 1) and keeps unknown keys on merge", () => {
    const raw = { sections: [{ label: "S", area: 100, pitch: 5 }], satellite: { lat: 1 } };
    const n = normalizeMeasurements(raw);
    expect(n.sections[0]).toEqual({ label: "S", area: 100, pitch: 5, waste: null });
    const out = mergeMeasurements(raw, n);
    expect(out.satellite).toEqual({ lat: 1 });
    expect((out.sections as unknown[]).length).toBe(1);
  });
});

describe("measurement report import", () => {
  it("parses pitches", () => {
    expect(parsePitch("6/12")).toBe(6);
    expect(parsePitch("7.5")).toBe(7.5);
    expect(parsePitch(" 10 / 12 ")).toBe(10);
    expect(parsePitch("steep")).toBeNull();
  });
  it("parses facet CSV with a header, units, blank lines and reports bad rows", () => {
    const r = parseFacetCsv("Facet,Area,Pitch\nFront,1200,6/12\nRear,800 sq ft,6\n\nPorch,150,1/12\nBad,abc,6");
    expect(r.rows).toEqual([
      { label: "Front", area: 1200, pitch: 6 },
      { label: "Rear", area: 800, pitch: 6 },
      { label: "Porch", area: 150, pitch: 1 },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(parseFacetCsv("A\t1,250\t8/12").rows).toEqual([{ label: "A", area: 1250, pitch: 8 }]);
    expect(parseFacetCsv("900, 4").rows).toEqual([{ label: "Facet 1", area: 900, pitch: 4 }]);
  });
  it("converts sloped report areas to plan areas", () => {
    const [s] = facetsToSections([{ label: "F", area: 1118.03, pitch: 6 }]);
    expect(s.area).toBe(1000);
    expect(facetsToSections([{ label: "F", area: 1000, pitch: 6 }], "plan")[0].area).toBe(1000);
  });
});

describe("cost vs sell", () => {
  it("computes gross profit and margin after discount", () => {
    const r = margin([{ quantity: 10, unit_price: 100, unit_cost: 60 }, { quantity: 1, unit_price: 500, unit_cost: 200 }], 100);
    expect(r).toEqual({ sell: 1400, cost: 800, profit: 600, pct: 42.86 });
    expect(margin([], 0).pct).toBe(0);
  });
});

describe("monthlyPayment", () => {
  it("amortizes like a standard loan", () => {
    expect(monthlyPayment(15000, 9.99, 120)).toBeCloseTo(198.15, 1);
    expect(monthlyPayment(12000, 0, 12)).toBe(1000);
    expect(monthlyPayment(0, 9.99, 120)).toBe(0);
  });
});

describe("instantQuoteRange", () => {
  it("estimates squares from house size, stories and pitch", () => {
    // 2000 sq ft / 1 story x 1.15 x pitchFactor(7) = 1.1577 -> 26.63 sq
    const r = instantQuoteRange({ mode: "house", houseSqft: 2000, stories: 1, pitch: "medium" }, 450, 650);
    expect(r.squares).toBeCloseTo(26.63, 2);
    expect(r.low).toBe(12000);
    expect(r.high).toBe(17300);
    const two = instantQuoteRange({ mode: "house", houseSqft: 2000, stories: 2, pitch: "medium" }, 450, 650);
    expect(two.squares).toBeCloseTo(13.31, 1);
  });
  it("takes known squares as-is", () => {
    expect(instantQuoteRange({ mode: "squares", squares: 30, pitch: "steep" }, 500, 700)).toEqual({ squares: 30, low: 15000, high: 21000 });
  });
});
