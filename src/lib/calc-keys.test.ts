import { describe, expect, it } from "vitest";
import { suggestCalcKey } from "./calc-keys";

describe("suggestCalcKey", () => {
  it("prefers specific product words over generic ones", () => {
    expect(suggestCalcKey("COLORBOND Barge Capping 2.4m")).toBe("barge_capping");
    expect(suggestCalcKey("Roofing screw 12g x 50 Class 4 (box 500)")).toBe("roof_screws");
    expect(suggestCalcKey("Custom Orb 0.42 COLORBOND Monument")).toBe("metal_sheet");
    expect(suggestCalcKey("Ridge tile Monier Horizon")).toBe("ridge_tile");
    expect(suggestCalcKey("Hi-Front quad gutter 115mm")).toBe("gutter");
    expect(suggestCalcKey("Anticon roof blanket 60mm")).toBe("sarking");
  });
  it("returns null when nothing matches", () => {
    expect(suggestCalcKey("Coffee for the crew")).toBeNull();
  });
});
