import { describe, expect, it } from "vitest";
import { rectFromAreaPerimeter, roofSheet } from "./roof-sheet";

describe("rectFromAreaPerimeter", () => {
  it("finds length and width from area and perimeter", () => {
    const r = rectFromAreaPerimeter(260.5, 72.8)!;
    expect(r.long).toBeCloseTo(26.6, 1);
    expect(r.short).toBeCloseTo(9.8, 1);
  });
  it("gives up when no rectangle fits, or it would be a sliver", () => {
    expect(rectFromAreaPerimeter(400, 40)).toBeNull();
    expect(rectFromAreaPerimeter(30, 64)).toBeNull();
    expect(rectFromAreaPerimeter(0, 50)).toBeNull();
  });
});

describe("roofSheet", () => {
  const summary = { planArea: 260.5, trueArea: 282, metalArea: 282, tileArea: 0, membraneArea: 0, steepArea: 0, maxPitch: 22.5, ridgeHip: 52.6 };
  it("labels the drawing", () => {
    const s = roofSheet(summary, { ridge: 16.8, hip: 35.8, eave: 72.8 });
    expect(s.area).toBe("282 m²");
    expect(s.pitch).toBe("22.5° pitch");
    expect(s.dims).toMatchObject({ long: "26.6 m", short: "9.8 m" });
    expect(s.foot).toBe("ridge 16.8 · hips 35.8 · eave 72.8 m");
  });
  it("leaves out what it doesn't know", () => {
    const s = roofSheet({ ...summary, maxPitch: 0 }, { ridge: 0, hip: 0, eave: 0 });
    expect(s.pitch).toBeNull();
    expect(s.dims).toBeNull();
    expect(s.foot).toBeNull();
  });
});
