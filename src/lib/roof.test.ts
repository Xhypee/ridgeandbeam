import { describe, expect, it } from "vitest";
import { CALC_KEY_MAP } from "./calc-keys";
import {
  ASBESTOS_WARNING, coverWidthMm, cutList, DEFAULT_MEASUREMENTS, DEFAULT_SETTINGS, degFromRisePer12, facetsToSections, instantQuoteRange,
  isLegacyImperial, margin, mergeMeasurements, metalCut, monthlyPayment, normalizeCalcSettings, normalizeMeasurements, parseFacetCsv,
  parsePitch, pitchFactor, pitchFromRiseRun, profileFromText, rafterLength, summarize, takeoff, takeoffWarnings, totals,
  calcKeyUnit, EXTRA_CALC_KEYS, type Measurements, type RoofSection,
} from "./roof";

const m = (over: Partial<Measurements>): Measurements => ({ ...DEFAULT_MEASUREMENTS, ...over, settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) } });
const q = (ms: Measurements, opts?: Parameters<typeof takeoff>[1]) => Object.fromEntries(takeoff(ms, opts).map((t) => [t.key, t.quantity]));
const metal = (over: Partial<RoofSection> = {}): RoofSection => ({ label: "Main", area: 60, pitch: 22.5, system: "metal", profile: "custom_orb", ...over });

describe("geometry", () => {
  it("pitch factor is 1 / cos(pitch in degrees)", () => {
    expect(pitchFactor(0)).toBe(1);
    expect(pitchFactor(15)).toBeCloseTo(1.0353, 4);
    expect(pitchFactor(20)).toBeCloseTo(1.0642, 4);
    expect(pitchFactor(22.5)).toBeCloseTo(1.0824, 4);
    expect(pitchFactor(25)).toBeCloseTo(1.1034, 4);
    expect(pitchFactor(-5)).toBe(1); // junk clamps to flat
  });
  it("converts rise/run to degrees", () => {
    expect(pitchFromRiseRun(250, 1000)).toBe(14.04); // atan(0.25)
    expect(pitchFromRiseRun(1, 1)).toBe(45);
    expect(pitchFromRiseRun(5, 0)).toBe(0);
    expect(degFromRisePer12(6)).toBe(26.57);
  });
  it("rafter length from a plan run", () => {
    expect(rafterLength(6, 22.5)).toBeCloseTo(6.494, 3);
  });
  it("profile cover widths with editable overrides", () => {
    expect(coverWidthMm("custom_orb")).toBe(762);
    expect(coverWidthMm("trimdek")).toBe(762);
    expect(coverWidthMm("klip_lok")).toBe(700);
    expect(coverWidthMm("spandek", { ...DEFAULT_SETTINGS, coverWidthMm: { spandek: 710 } })).toBe(710);
    expect(coverWidthMm("spandek", { ...DEFAULT_SETTINGS, coverWidthMm: { spandek: 5 } })).toBe(700); // nonsense ignored
    expect(profileFromText("COLORBOND Klip-Lok 700 Hi-Strength")).toBe("klip_lok");
    expect(profileFromText("Lysaght Custom Orb 0.42")).toBe("custom_orb");
    expect(profileFromText("Ridge capping")).toBeNull();
  });
});

describe("metal cut list", () => {
  it("cuts sheets per run: ceil(width / cover), run + 50 mm overhang", () => {
    // 10.0 m wide / 0.762 = 13.12 -> 14 sheets; 6.5 m run + 50 mm = 6550 mm; 14 × 6.55 = 91.7 lm
    // supports = ceil(6.5 / 0.9) + 1 = 9; screws = 14 × 9 × 5 = 630
    const c = metalCut(metal({ runLength: 6.5, width: 10 }), m({}));
    expect(c).toMatchObject({ sheets: 14, lengthMm: 6550, lm: 91.7, exact: true, supports: 9, screws: 630, coverMm: 762 });
  });
  it("does not add a sheet for floating-point dust (exact multiples of cover)", () => {
    const c = metalCut(metal({ runLength: 5, width: 0.762 * 14 }), m({}));
    expect(c.sheets).toBe(14);
  });
  it("Klip-Lok 700 needs more sheets for the same width", () => {
    // 10 / 0.7 = 14.29 -> 15 sheets × 6.55 = 98.25 lm
    const c = metalCut(metal({ runLength: 6.5, width: 10 }), m({}), { profile: "klip_lok" });
    expect(c).toMatchObject({ sheets: 15, lm: 98.25, coverMm: 700 });
  });
  it("derives the width from true area when only the run is known", () => {
    // true area 60 / cos 22.5° = 64.94 m²; width = 64.94 / 6.5 = 9.99 -> ceil(9.99 / 0.762 = 13.11) = 14
    const c = metalCut(metal({ runLength: 6.5 }), m({}));
    expect(c.sheets).toBe(14);
    expect(c.exact).toBe(true);
  });
  it("estimates lineal metres from area + waste when no run is measured", () => {
    // 64.9435 × 1.10 = 71.4379 m² / 0.762 = 93.75 lm; screws ceil(71.4379 / (0.762 × 0.9) = 104.17) = 105 × 5 = 525
    const c = metalCut(metal(), m({ wastePct: 10 }));
    expect(c).toMatchObject({ sheets: 0, lengthMm: 0, lm: 93.75, exact: false, screws: 525 });
  });
  it("cutList only covers metal sections with area", () => {
    const rows = cutList(m({ sections: [metal(), metal({ label: "Tiles", system: "concrete_tile" }), metal({ label: "Empty", area: 0 })] }));
    expect(rows.map((r) => r.section)).toEqual(["Main"]);
  });
});

describe("summarize", () => {
  it("sums plan and true area by system and steep area above the threshold", () => {
    const s = summarize(m({
      sections: [metal(), { label: "Verandah", area: 20, pitch: 5, system: "membrane" }, { label: "Back", area: 50, pitch: 30, system: "concrete_tile" }],
      ridge: 10, hip: 4,
    }));
    expect(s.planArea).toBe(130);
    expect(s.metalArea).toBe(64.94);
    expect(s.membraneArea).toBe(20.08); // 20 / cos 5° = 20.076
    expect(s.tileArea).toBe(57.74); // 50 / cos 30° = 57.735
    expect(s.steepArea).toBe(57.74); // only the 30° section is above 25°
    expect(s.maxPitch).toBe(30);
    expect(s.ridgeHip).toBe(14);
  });
  it("ignores negative and junk input", () => {
    const s = summarize(m({ sections: [{ label: "x", area: -50, pitch: NaN }] }));
    expect(s.trueArea).toBe(0);
  });
});

describe("takeoff — metal re-roof (worked example)", () => {
  // Gable roof, two 60 m² plan faces at 22.5°, each 10 m wide with a 6.5 m sheet run; 10 lm ridge, 26 lm barge.
  const job = m({
    jobType: "reroof", existingRoof: "tile", wastePct: 10, ridge: 10, barge: 26,
    sections: [metal({ label: "Front", runLength: 6.5, width: 10 }), metal({ label: "Back", runLength: 6.5, width: 10 })],
  });
  const r = q(job);
  it("cuts sheets and counts fixings", () => {
    expect(r.metal_sheet).toBe(183.4); // 2 × 14 sheets × 6.55 m
    expect(r.roof_screws).toBe(3); // 2 × 630 = 1260 screws / 500 per box -> 3 boxes
  });
  it("capping with 5% laps", () => {
    expect(r.ridge_capping).toBe(10.5);
    expect(r.barge_capping).toBe(27.3);
  });
  it("sarking and safety mesh by coverage", () => {
    // true 129.887 m² × 1.1 = 142.88 m² / 40.5 = 3.53 -> 4 rolls; mesh 129.89 / 75 = 1.73 -> 2 rolls
    expect(r.sarking).toBe(4);
    expect(r.safety_mesh).toBe(2);
  });
  it("labour, site and disposal", () => {
    expect(r.labour_strip).toBe(129.89);
    expect(r.labour_install).toBe(129.89);
    expect(r.labour_steep).toBeUndefined(); // 22.5° is not above 25°
    expect(r.edge_protection).toBe(1);
    expect(r.skip_bin).toBe(1); // 129.89 × 0.04 m³ = 5.2 m³ -> one 6 m³ bin
    expect(r.asbestos_removal).toBeUndefined();
    expect(r.roof_tile).toBeUndefined();
  });
  it("emits units from calc-keys", () => {
    for (const t of takeoff(job)) expect(t.unit).toBe(CALC_KEY_MAP[t.key]?.unit ?? EXTRA_CALC_KEYS.find((k) => k.key === t.key)?.unit);
    expect(calcKeyUnit("metal_sheet")).toBe("lm");
  });
  it("re-runs the cut list for another profile (Best = Klip-Lok)", () => {
    const k = q(job, { profileOverride: { profile: "klip_lok" } });
    expect(k.metal_sheet).toBe(196.5); // 2 × 15 × 6.55
    expect(takeoff(job, { profileOverride: { profile: "klip_lok" } }).find((t) => t.key === "metal_sheet")?.profile).toBe("klip_lok");
  });
  it("splits sheet lines per profile", () => {
    const mixed = takeoff(m({ sections: [metal({ runLength: 6.5, width: 10 }), metal({ label: "Patio", profile: "trimdek", runLength: 3, width: 4 })] }))
      .filter((t) => t.key === "metal_sheet");
    // Patio: ceil(4 / 0.762 = 5.25) = 6 sheets × 3.05 m = 18.3 lm
    expect(mixed.map((t) => [t.profile, t.quantity])).toEqual([["custom_orb", 91.7], ["trimdek", 18.3]]);
  });
  it("cover width override changes the cut list", () => {
    const wide = q(m({ ...job, settings: { ...DEFAULT_SETTINGS, coverWidthMm: { custom_orb: 1000 } } }));
    expect(wide.metal_sheet).toBe(131); // 2 × 10 sheets × 6.55
  });
  it("switches off optional items", () => {
    const r2 = q(m({ ...job, includeSarking: false, includeSafetyMesh: false, includeSkip: false, includeEdgeProtection: false }));
    expect(r2.sarking ?? r2.safety_mesh ?? r2.skip_bin ?? r2.edge_protection).toBeUndefined();
  });
});

describe("takeoff — tile re-roof (worked example)", () => {
  // 100 m² plan at 25° = 110.34 m² true; + 10% waste = 121.37 m²
  const job = m({ jobType: "reroof", existingRoof: "tile", wastePct: 10, ridge: 12, hip: 8, valley: 6, sections: [{ label: "Main", area: 100, pitch: 25, system: "concrete_tile" }] });
  const r = q(job);
  it("tiles, ridge tiles, battens and pointing", () => {
    expect(r.roof_tile).toBe(1202); // 121.37 × 9.9 = 1201.58 -> 1202
    expect(r.ridge_tile).toBe(52); // 20 lm × 2.6
    expect(r.tile_battens).toBe(351.8); // 121.37 / 0.345
    expect(r.pointing).toBe(4); // 20 lm / 5 lm per bag
    expect(r.valley_iron).toBe(6.3);
    expect(r.sarking).toBe(3); // 121.37 / 40.5 = 2.997 -> 3
  });
  it("no metal-only items", () => {
    expect(r.metal_sheet ?? r.roof_screws ?? r.ridge_capping ?? r.safety_mesh).toBeUndefined();
  });
  it("tiles per m² is editable", () => {
    expect(q(m({ ...job, settings: { ...DEFAULT_SETTINGS, tilesPerM2: 15 } })).roof_tile).toBe(1821); // 121.37 × 15 = 1820.57
  });
  it("steep allowance above the threshold", () => {
    expect(q(m({ ...job, sections: [{ label: "Main", area: 50, pitch: 30, system: "terracotta_tile" }] })).labour_steep).toBe(57.74);
    expect(q(m({ ...job, settings: { ...DEFAULT_SETTINGS, steepAboveDeg: 20 } })).labour_steep).toBe(110.34);
  });
});

describe("takeoff — other job types", () => {
  it("restoration: clean, rebed/repoint, coat, replace tiles", () => {
    // 150 m² plan at 20° = 159.63 m²
    const r = q(m({ jobType: "restoration", ridge: 18, hip: 12, replaceTiles: 15, sections: [{ label: "Main", area: 150, pitch: 20, system: "concrete_tile" }] }));
    expect(r).toEqual({ restore_clean: 159.63, rebed_repoint: 30, roof_coating: 159.63, tile_replace: 15, edge_protection: 1 });
  });
  it("metal restoration has no rebed or tiles", () => {
    const r = q(m({ jobType: "restoration", ridge: 18, replaceTiles: 15, sections: [metal()] }));
    expect(Object.keys(r).sort()).toEqual(["edge_protection", "restore_clean", "roof_coating"]);
  });
  it("asbestos replacement: licensed removal, no strip, no skip bin, warning", () => {
    // 100 m² plan at 10° = 101.54 m²
    const job = m({ jobType: "asbestos", existingRoof: "fibro", sections: [metal({ area: 100, pitch: 10 })] });
    const r = q(job);
    expect(r.asbestos_removal).toBe(101.54);
    expect(r.labour_strip).toBeUndefined();
    expect(r.skip_bin).toBeUndefined();
    expect(takeoffWarnings(job).map((w) => w.text)).toContain(ASBESTOS_WARNING);
  });
  it("pre-1990 / asbestos suspected on a normal re-roof switches to licensed removal", () => {
    const r = q(m({ jobType: "tile_to_metal", asbestosSuspected: true, sections: [metal()] }));
    expect(r.asbestos_removal).toBe(64.94);
    expect(r.labour_strip).toBeUndefined();
  });
  it("gutters only", () => {
    expect(q(m({ jobType: "gutters", eave: 42, downpipes: 4, sections: [metal()] }))).toEqual({ gutter: 42, downpipe: 4, edge_protection: 1 });
  });
  it("repair: broken tiles and flashings only", () => {
    expect(q(m({ jobType: "repair", replaceTiles: 6, apron: 3, sections: [metal()] }))).toEqual({ tile_replace: 6, flashing: 3.15, edge_protection: 1 });
  });
  it("gutters can be added to a re-roof", () => {
    const r = q(m({ includeGutters: true, eave: 30, downpipes: 3, sections: [metal()] }));
    expect([r.gutter, r.downpipe]).toEqual([30, 3]);
  });
  it("membrane sections get the membrane system, no sarking", () => {
    const r = q(m({ sections: [{ label: "Deck", area: 40, pitch: 2, system: "membrane" }], existingRoof: "metal" }));
    expect(r.membrane_roof).toBe(44.03); // 40 / cos 2° = 40.024 × 1.1
    expect(r.sarking).toBeUndefined();
  });
  it("new frame: nothing to strip or skip", () => {
    const r = q(m({ existingRoof: "none", sections: [metal()] }));
    expect(r.labour_strip ?? r.skip_bin).toBeUndefined();
  });
  it("warns when there is no area", () => {
    expect(takeoffWarnings(m({ sections: [metal({ area: 0 })] }))[0].code).toBe("no_area");
  });
});

describe("normalizeMeasurements", () => {
  it("fills defaults", () => {
    const n = normalizeMeasurements({}, 8);
    expect(n.units).toBe("metric");
    expect(n.wastePct).toBe(8);
    expect(n.sections[0].pitch).toBe(22.5);
    expect(n.settings.sarkingRollM2).toBe(40.5);
  });
  it("converts the old imperial format (sq ft, rise/12, feet)", () => {
    expect(isLegacyImperial({ sections: [{ area: 2000, pitch: 6 }] })).toBe(true);
    expect(isLegacyImperial({ units: "metric", sections: [{ area: 200, pitch: 22 }] })).toBe(false);
    const n = normalizeMeasurements({ sections: [{ label: "Main", area: 2000, pitch: 6 }, { label: "Porch", area: 100, pitch: 1 }], eaves: 100, ridges: 40, rakes: 50, layers: 2 });
    expect(n.sections[0]).toMatchObject({ area: 185.81, pitch: 26.57, system: "metal" });
    expect(n.sections[1].system).toBe("membrane");
    expect([n.eave, n.ridge, n.barge]).toEqual([30.48, 12.19, 15.24]);
  });
  it("keeps metric data and settings, applying org defaults underneath", () => {
    const n = normalizeMeasurements({ units: "metric", sections: [{ label: "A", area: 80, pitch: 18, system: "terracotta_tile", runLength: 5, width: 16 }], settings: { tilesPerM2: 12 } }, 10, { steepAboveDeg: 30, tilesPerM2: 11 });
    expect(n.sections[0]).toMatchObject({ area: 80, pitch: 18, system: "terracotta_tile", runLength: 5, width: 16 });
    expect(n.settings.tilesPerM2).toBe(12); // estimate overrides org
    expect(n.settings.steepAboveDeg).toBe(30); // org default
  });
  it("calc defaults ignore junk", () => {
    expect(normalizeCalcSettings({ tilesPerM2: "x", lapPct: -1, coverWidthMm: { trimdek: 760 } })).toMatchObject({ tilesPerM2: 9.9, lapPct: 5, coverWidthMm: { trimdek: 760 } });
  });
  it("mergeMeasurements keeps extra keys and drops legacy imperial keys", () => {
    const raw = { satellite: { facets: [] }, eaves: 100, layers: 1 };
    const merged = mergeMeasurements(raw, normalizeMeasurements(raw));
    expect(merged.satellite).toEqual({ facets: [] });
    expect("eaves" in merged || "layers" in merged).toBe(false);
    expect(merged.units).toBe("metric");
  });
});

describe("report import", () => {
  it("parses degrees, ratios and rise-per-12", () => {
    expect(parsePitch("22.5")).toBe(22.5);
    expect(parsePitch("22.5°")).toBe(22.5);
    expect(parsePitch("15 deg")).toBe(15);
    expect(parsePitch("1:4")).toBe(14.04);
    expect(parsePitch("6/12")).toBe(26.57);
    expect(parsePitch("80")).toBeNull();
    expect(parsePitch("steep")).toBeNull();
  });
  it("parses a pasted facet table (header skipped, m² suffix ok)", () => {
    const { rows, errors } = parseFacetCsv("Facet, Area, Pitch\nFront, 64.9 m², 22.5\nBack\t1,064.5\t22.5°\nPorch, 12, 1:10\nBad, x, 5");
    expect(rows).toEqual([
      { label: "Front", area: 64.9, pitch: 22.5 },
      { label: "Back", area: 1064.5, pitch: 22.5 },
      { label: "Porch", area: 12, pitch: 5.71 },
    ]);
    expect(errors).toEqual(['Line 5: area "x" is not a number']);
  });
  it("converts sloped report areas to plan area", () => {
    const [s] = facetsToSections([{ label: "Front", area: 64.94, pitch: 22.5 }]);
    expect(s.area).toBe(60); // 64.94 × cos 22.5°
    expect(facetsToSections([{ label: "P", area: 50, pitch: 10 }], "plan", "concrete_tile")[0]).toMatchObject({ area: 50, system: "concrete_tile" });
  });
});

describe("money helpers", () => {
  it("tax-exclusive totals and margin", () => {
    expect(totals([{ quantity: 2, unit_price: 100 }], 20, 10)).toEqual({ subtotal: 200, discount: 20, tax: 18, total: 198 });
    expect(margin([{ quantity: 2, unit_price: 100, unit_cost: 60 }], 0)).toEqual({ sell: 200, cost: 120, profit: 80, pct: 40 });
  });
  it("monthly repayment", () => {
    expect(monthlyPayment(12000, 0, 12)).toBe(1000);
    expect(monthlyPayment(10000, 9.99, 60)).toBeCloseTo(212.42, 1);
  });
});

describe("instant quote", () => {
  it("house floor area -> roof m² -> GST-inclusive range", () => {
    // 200 m² single storey, medium (22.5°): 200 × 1.15 × 1.0824 = 248.95 -> 249 m²; $100–$150/m²
    expect(instantQuoteRange({ mode: "house", floorM2: 200, storeys: 1, pitch: "medium" }, 100, 150)).toEqual({ m2: 249, low: 24900, high: 37400 });
  });
  it("two storeys halve the footprint; a known roof area is used as-is", () => {
    expect(instantQuoteRange({ mode: "house", floorM2: 200, storeys: 2, pitch: "flat" }, 100, 100).m2).toBe(115); // 100 × 1.15 × 1.0014
    expect(instantQuoteRange({ mode: "roof", roofM2: 180, pitch: "steep" }, 150, 120)).toEqual({ m2: 180, low: 21600, high: 27000 });
  });
});
