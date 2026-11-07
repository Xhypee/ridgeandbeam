// Australian roof calculator: measurements (m², lineal metres, pitch in degrees) -> quantities per calc key.
// Pure functions, no I/O, so the same maths runs in the browser editor, on the server and in tests.
// Calc keys and their units come from ./calc-keys (shared with supplier price sheets).

import { CALC_KEY_MAP, type CalcCategory, type CalcKeyDef, type CalcUnit } from "./calc-keys";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
export type RoofSystem = "metal" | "concrete_tile" | "terracotta_tile" | "membrane";
export const ROOF_SYSTEMS: RoofSystem[] = ["metal", "concrete_tile", "terracotta_tile", "membrane"];
export const ROOF_SYSTEM_LABEL: Record<RoofSystem, string> = {
  metal: "Metal (COLORBOND / ZINCALUME)",
  concrete_tile: "Concrete tile",
  terracotta_tile: "Terracotta tile",
  membrane: "Membrane / low-slope",
};
/** Short names for narrow pickers. */
export const ROOF_SYSTEM_SHORT: Record<RoofSystem, string> = { metal: "Metal", concrete_tile: "Concrete tile", terracotta_tile: "Terracotta tile", membrane: "Membrane" };
export const isTile = (s: RoofSystem) => s === "concrete_tile" || s === "terracotta_tile";

export type MetalProfile = "custom_orb" | "trimdek" | "klip_lok" | "spandek";
export const METAL_PROFILES: MetalProfile[] = ["custom_orb", "trimdek", "klip_lok", "spandek"];
/**
 * Effective cover widths. Custom Orb, Trimdek (762 mm) and Klip-Lok 700 (700 mm) are confirmed from Lysaght
 * specs (research notes). Spandek's 700 mm is NOT verified in our research: it is a default the user can edit
 * in the calculator assumptions.
 */
export const METAL_PROFILE_INFO: Record<MetalProfile, { label: string; coverMm: number; verified: boolean }> = {
  custom_orb: { label: "Custom Orb (corrugated)", coverMm: 762, verified: true },
  trimdek: { label: "Trimdek", coverMm: 762, verified: true },
  klip_lok: { label: "Klip-Lok 700", coverMm: 700, verified: true },
  spandek: { label: "Spandek", coverMm: 700, verified: false },
};

/** Guess a profile from free text (catalog / supplier description). */
export function profileFromText(text: string | null | undefined): MetalProfile | null {
  const t = ` ${(text ?? "").toLowerCase()} `;
  if (/klip[\s_-]?lok/.test(t)) return "klip_lok";
  if (t.includes("trimdek")) return "trimdek";
  if (t.includes("spandek")) return "spandek";
  if (t.includes("custom orb") || t.includes("corrugated") || t.includes("custom_orb")) return "custom_orb";
  return null;
}

export const JOB_TYPES = ["reroof", "new_build", "tile_to_metal", "restoration", "repair", "gutters", "asbestos"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABEL: Record<JobType, string> = {
  reroof: "Re-roof",
  new_build: "New build (new roof, nothing to strip)",
  tile_to_metal: "Tile to metal re-roof",
  restoration: "Roof restoration",
  repair: "Repair / leak",
  gutters: "Gutters & downpipes only",
  asbestos: "Asbestos roof replacement",
};
/** Job types that install a whole new roof (stripping the old one unless there is none). */
const REPLACES_ROOF: JobType[] = ["reroof", "new_build", "tile_to_metal", "asbestos"];

export const EXISTING_ROOFS = ["tile", "metal", "fibro", "none"] as const;
export type ExistingRoof = (typeof EXISTING_ROOFS)[number];
export const EXISTING_ROOF_LABEL: Record<ExistingRoof, string> = {
  tile: "Tiles", metal: "Metal sheets", fibro: "Fibro / cement sheet", none: "Nothing (new frame)",
};

/** Calculator-only keys not in calc-keys.ts (none at the moment: membrane, battens and fascia moved there). */
export const EXTRA_CALC_KEYS: CalcKeyDef[] = [];
const EXTRA_MAP: Record<string, CalcKeyDef> = Object.fromEntries(EXTRA_CALC_KEYS.map((k) => [k.key, k]));
export const calcKeyDef = (key: string): CalcKeyDef | undefined => CALC_KEY_MAP[key] ?? EXTRA_MAP[key];
export const calcKeyLabel = (key: string) => calcKeyDef(key)?.label ?? key;
export const calcKeyUnit = (key: string): CalcUnit => calcKeyDef(key)?.unit ?? "ea";
export const calcKeyCategory = (key: string): CalcCategory => calcKeyDef(key)?.category ?? "material";
/** Every key the calculator can emit, in a stable display order. */
export const CALCULATOR_KEYS: string[] = [...new Set([...Object.keys(CALC_KEY_MAP), ...EXTRA_CALC_KEYS.map((k) => k.key)])];
export const isCurrentCalcKey = (key: string | null | undefined) => Boolean(key && calcKeyDef(key));

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------
/** One roof section / facet. Edge lengths stay global (as on measurement reports). */
export type RoofSection = {
  label: string;
  /** Plan (footprint, seen from above) area in m². */
  area: number;
  /** Roof pitch in degrees. */
  pitch: number;
  /** Roof system; undefined = metal. */
  system?: RoofSystem;
  /** Waste % for this section; null/undefined = the estimate's waste %. */
  waste?: number | null;
  /** Metal sheet profile (metal sections only); undefined = Custom Orb. */
  profile?: MetalProfile;
  /** Sheet run along the slope, eave to ridge, in metres (for an exact cut list). */
  runLength?: number | null;
  /** Width of the section along the eave in metres (number of sheets across). */
  width?: number | null;
};

export type CalcSettings = {
  /** Overrides of the profile cover widths (mm). */
  coverWidthMm: Partial<Record<MetalProfile, number>>;
  /** Sheet overhang into the gutter added to every cut length (mm). */
  overhangMm: number;
  /** Batten / purlin spacing for fixing counts (mm). */
  supportSpacingMm: number;
  /** Fasteners per sheet per support (Lysaght PAB04 method). */
  screwsPerSheetPerSupport: number;
  screwsPerBox: number;
  /** Sarking roll coverage, m² (default 1350 mm × 30 m). */
  sarkingRollM2: number;
  /** Safety mesh roll coverage, m² (check your supplier's roll size). */
  safetyMeshRollM2: number;
  /** Tiles per m² before waste (Monier Elabana-type concrete tile ≈ 9.9). */
  tilesPerM2: number;
  /** Ridge / hip tiles per lineal metre. */
  ridgeTilesPerLm: number;
  /** Tile batten gauge (spacing), mm. */
  battenGaugeMm: number;
  /** Lineal metres of ridge/hip bedded and pointed per bag (or pail) of pointing. */
  pointingLmPerBag: number;
  /** Steep-roof allowance applies to sections pitched above this (degrees). */
  steepAboveDeg: number;
  /** Skip bin size, m³. */
  skipBinM3: number;
  /** Laps added to capping, flashing and valley iron, %. */
  lapPct: number;
};

export const DEFAULT_SETTINGS: CalcSettings = {
  coverWidthMm: {},
  overhangMm: 50,
  supportSpacingMm: 900,
  screwsPerSheetPerSupport: 5,
  screwsPerBox: 500,
  sarkingRollM2: 40.5,
  safetyMeshRollM2: 75,
  tilesPerM2: 9.9,
  ridgeTilesPerLm: 2.6,
  battenGaugeMm: 345,
  pointingLmPerBag: 5,
  steepAboveDeg: 25,
  skipBinM3: 6,
  lapPct: 5,
};

/** Loose volume of stripped roofing per m² of roof (m³/m²), by what's on the roof now. Rough site rule. */
export const OLD_ROOF_M3_PER_M2: Record<ExistingRoof, number> = { tile: 0.04, metal: 0.03, fibro: 0.03, none: 0 };

/**
 * Quantities worked out from the architect's plans ("Measure from plans"): an exact sheet cut list per profile and
 * flashings ordered in lengths. Used instead of the area-based estimate while the measurements still match what
 * the plans gave (`trueArea` and `basis`); edit the roof by hand and the calculator falls back to its usual maths.
 */
export type PlanQty = {
  trueArea: number;
  sheets: Partial<Record<MetalProfile, { coverMm: number; sheets: number; lm: number; rows: { lengthMm: number; qty: number }[] }>>;
  /** Ordered lineal metres (run allowances, laps and lengths included). */
  flashings: Partial<Record<"ridge_capping" | "barge_capping" | "valley_iron" | "flashing" | "gutter" | "fascia", number>>;
  /** The measured lineal metres those orders were made from. */
  basis: { ridgeHip: number; barge: number; valley: number; apron: number; eave: number };
  battensLm: number;
};

export type Measurements = {
  units: "metric";
  jobType: JobType;
  existingRoof: ExistingRoof;
  sections: RoofSection[];
  wastePct: number;
  /** Lineal metres. */
  ridge: number;
  hip: number;
  valley: number;
  barge: number;
  /** Eave / gutter line. */
  eave: number;
  /** Apron and wall flashings. */
  apron: number;
  downpipes: number;
  whirlybirds: number;
  /** Broken tiles to replace (count). */
  replaceTiles: number;
  /** Built before 1990 or asbestos suspected: licensed removal instead of a normal strip. */
  asbestosSuspected: boolean;
  includeSarking: boolean;
  includeSafetyMesh: boolean;
  includeGutters: boolean;
  includeEdgeProtection: boolean;
  includeSkip: boolean;
  settings: CalcSettings;
  /** From "Measure from plans" (absent otherwise). */
  planQty?: PlanQty | null;
};

export const DEFAULT_MEASUREMENTS: Measurements = {
  units: "metric",
  jobType: "reroof",
  existingRoof: "tile",
  sections: [{ label: "Main roof", area: 0, pitch: 22.5, system: "metal", profile: "custom_orb" }],
  wastePct: 10,
  ridge: 0, hip: 0, valley: 0, barge: 0, eave: 0, apron: 0,
  downpipes: 0, whirlybirds: 0, replaceTiles: 0,
  asbestosSuspected: false,
  includeSarking: true,
  includeSafetyMesh: true,
  includeGutters: false,
  includeEdgeProtection: true,
  includeSkip: true,
  settings: DEFAULT_SETTINGS,
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
/** Round up, ignoring floating-point dust (10.668 / 0.762 is 14, not 14.000000001). */
const ceil = (n: number) => (n <= 0 ? 0 : Math.ceil(n - 1e-6));
const pos = (v: unknown) => Math.max(0, Number(v) || 0);
const MAX_PITCH = 75;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const rad = (deg: number) => (deg * Math.PI) / 180;
const clampPitch = (deg: number) => Math.min(MAX_PITCH, pos(deg));

/** Plan area -> true (sloped) area multiplier: 1 / cos(pitch). 15° ≈ 1.035, 20° ≈ 1.064, 25° ≈ 1.103. */
export function pitchFactor(pitchDeg: number): number {
  return 1 / Math.cos(rad(clampPitch(pitchDeg)));
}

/** Pitch in degrees from a rise and a run in the same unit (e.g. 250 mm rise over 1000 mm run ≈ 14.04°). */
export function pitchFromRiseRun(rise: number, run: number): number {
  const r = Number(run);
  if (!(r > 0)) return 0;
  return round2(Math.min(MAX_PITCH, (Math.atan(pos(rise) / r) * 180) / Math.PI));
}

/** Rafter (sloped) length from a horizontal run. */
export const rafterLength = (planRun: number, pitchDeg: number) => pos(planRun) * pitchFactor(pitchDeg);

export const sectionSystem = (s: Pick<RoofSection, "system">): RoofSystem => (s.system && ROOF_SYSTEMS.includes(s.system) ? s.system : "metal");
export const sectionProfile = (s: Pick<RoofSection, "profile">): MetalProfile => (s.profile && METAL_PROFILES.includes(s.profile) ? s.profile : "custom_orb");
export const trueArea = (s: Pick<RoofSection, "area" | "pitch">) => pos(s.area) * pitchFactor(Number(s.pitch) || 0);

export function coverWidthMm(profile: MetalProfile, settings: CalcSettings = DEFAULT_SETTINGS): number {
  const o = Number(settings.coverWidthMm?.[profile]);
  return o > 100 && o < 2000 ? o : METAL_PROFILE_INFO[profile].coverMm;
}

const sectionWaste = (s: RoofSection, m: Pick<Measurements, "wastePct">) =>
  s.waste == null || !Number.isFinite(Number(s.waste)) ? pos(m.wastePct) : pos(s.waste);

// ---------------------------------------------------------------------------
// Metal sheet cut list
// ---------------------------------------------------------------------------
export type CutRow = {
  section: string;
  profile: MetalProfile;
  coverMm: number;
  /** 0 when the run/width are unknown (quantity estimated from area). */
  sheets: number;
  /** Order length per sheet incl. overhang, rounded up to 10 mm; 0 when estimated from area. */
  lengthMm: number;
  /** Lineal metres of sheet to order for this section. */
  lm: number;
  /** True when cut from a measured run (and width); false = area ÷ cover width + waste. */
  exact: boolean;
  /** Support rows crossed per sheet (for fixings); 0 when estimated. */
  supports: number;
  screws: number;
  /** Cut list by length (from plans). */
  rows?: { lengthMm: number; qty: number }[];
};

export type ProfileOverride = { profile?: MetalProfile | null; coverMm?: number | null };

/**
 * Sheets are ordered cut to length per run. With a run length (along the slope, eave to ridge) and a width
 * (along the eave): sheets = ceil(width ÷ cover width), length = run + overhang (rounded up to 10 mm).
 * Give only one of run/width and the other is derived from the true area. Waste % does not apply to a cut list:
 * the waste is the rounding up to whole sheets.
 * With neither, lineal metres = true area × (1 + waste) ÷ cover width (no cut list).
 * Fixings (Lysaght PAB04): fasteners per sheet per support × sheets × supports, supports = ceil(run ÷ spacing) + 1.
 * Area-estimated: fasteners ≈ ceil(true area × (1 + waste) ÷ (cover × spacing)) × fasteners per sheet per support.
 */
export function metalCut(s: RoofSection, m: Pick<Measurements, "wastePct" | "settings">, override?: ProfileOverride): CutRow {
  const settings = m.settings ?? DEFAULT_SETTINGS;
  const profile = override?.profile ?? sectionProfile(s);
  const coverMm = Number(override?.coverMm) > 100 ? Number(override!.coverMm) : coverWidthMm(profile, settings);
  const cover = coverMm / 1000;
  const area = trueArea(s);
  let run = pos(s.runLength);
  let width = pos(s.width);
  if (run > 0 && !(width > 0) && area > 0) width = area / run;
  if (width > 0 && !(run > 0) && area > 0) run = area / width;
  const spacing = Math.max(0.1, pos(settings.supportSpacingMm) / 1000 || 0.9);
  const perSupport = pos(settings.screwsPerSheetPerSupport);
  if (run > 0 && width > 0) {
    const sheets = ceil(width / cover);
    const lengthMm = ceil((run * 1000 + pos(settings.overhangMm)) / 10) * 10;
    const supports = ceil(run / spacing) + 1;
    return { section: s.label, profile, coverMm, sheets, lengthMm, lm: round2((sheets * lengthMm) / 1000), exact: true, supports, screws: sheets * supports * perSupport };
  }
  const gross = area * (1 + sectionWaste(s, m) / 100);
  return { section: s.label, profile, coverMm, sheets: 0, lengthMm: 0, lm: round2(gross / cover), exact: false, supports: 0, screws: ceil(round2(gross / (cover * spacing))) * perSupport };
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

/** The plans cut list for this profile, when the measurements still match the plans. */
export function planCut(m: Measurements, override?: ProfileOverride): CutRow | null {
  const q = m.planQty;
  if (!q) return null;
  const metal = m.sections.filter((s) => sectionSystem(s) === "metal" && pos(s.area) > 0);
  if (!metal.length) return null;
  const profiles = new Set(metal.map((s) => sectionProfile(s)));
  if (!override?.profile && profiles.size > 1) return null;
  const profile = override?.profile ?? [...profiles][0];
  const settings = m.settings ?? DEFAULT_SETTINGS;
  const coverMm = Number(override?.coverMm) > 100 ? Number(override!.coverMm) : coverWidthMm(profile, settings);
  const c = q.sheets?.[profile];
  if (!c || Math.abs(c.coverMm - coverMm) > 1) return null;
  const area = metal.reduce((s, x) => s + trueArea(x), 0);
  if (!near(area, q.trueArea)) return null;
  const spacing = Math.max(0.1, pos(settings.supportSpacingMm) / 1000 || 0.9);
  const per = pos(settings.screwsPerSheetPerSupport);
  const rows = c.rows ?? [];
  const screws = rows.reduce((s, r) => s + r.qty * (ceil(r.lengthMm / 1000 / spacing) + 1) * per, 0);
  const longest = Math.max(0, ...rows.map((r) => r.lengthMm));
  return {
    section: "Whole roof (cut list from plans)", profile, coverMm, sheets: c.sheets, lengthMm: longest, lm: round2(c.lm), exact: true,
    supports: ceil(longest / 1000 / spacing) + 1, screws, rows,
  };
}

/** Cut list for every metal section (optionally re-run with another profile, e.g. a Best-option Klip-Lok). */
export function cutList(m: Measurements, override?: ProfileOverride): CutRow[] {
  const plan = planCut(m, override);
  if (plan) return [plan];
  return m.sections.filter((s) => sectionSystem(s) === "metal" && pos(s.area) > 0).map((s) => metalCut(s, m, override));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export type RoofSummary = {
  /** Plan (footprint) area, m². */
  planArea: number;
  /** True (sloped) area of every section, no waste, m². */
  trueArea: number;
  metalArea: number;
  tileArea: number;
  membraneArea: number;
  /** True area of sections pitched above the steep threshold. */
  steepArea: number;
  maxPitch: number;
  /** Lineal metres of ridge + hip. */
  ridgeHip: number;
};

export function summarize(m: Measurements): RoofSummary {
  const steepAbove = pos(m.settings?.steepAboveDeg ?? DEFAULT_SETTINGS.steepAboveDeg);
  let plan = 0, area = 0, metal = 0, tile = 0, membrane = 0, steep = 0, maxPitch = 0;
  for (const s of m.sections) {
    if (pos(s.area) <= 0) continue;
    const a = trueArea(s);
    const p = clampPitch(Number(s.pitch) || 0);
    plan += pos(s.area);
    area += a;
    const sys = sectionSystem(s);
    if (sys === "metal") metal += a;
    else if (sys === "membrane") membrane += a;
    else tile += a;
    if (p > steepAbove) steep += a;
    maxPitch = Math.max(maxPitch, p);
  }
  return {
    planArea: round2(plan), trueArea: round2(area), metalArea: round2(metal), tileArea: round2(tile), membraneArea: round2(membrane),
    steepArea: round2(steep), maxPitch: round2(maxPitch), ridgeHip: round2(pos(m.ridge) + pos(m.hip)),
  };
}

// ---------------------------------------------------------------------------
// Takeoff: quantities per calc key
// ---------------------------------------------------------------------------
export type Takeoff = {
  key: string;
  quantity: number;
  unit: CalcUnit;
  /** Metal sheet lines are split per profile. */
  profile?: MetalProfile;
  /** How the number was worked out (shown in the editor). */
  basis?: string;
};

export const ASBESTOS_WARNING =
  "Asbestos suspected: removal must be done by a licensed asbestos removalist, and the work notified to your state's WHS regulator where required. Check before quoting.";

/**
 * Quantities by job type:
 * - Re-roof / tile-to-metal / asbestos: strip (or licensed asbestos removal) + install m², the new roof's materials,
 *   sarking, safety mesh (metal), capping, valley iron, flashings, steep allowance, edge protection, skip bins.
 * - Restoration: clean m², rebed & repoint ridge + hip lm (tiles), coating m², broken tiles, steep, edge protection.
 * - Repair: broken tiles, valley iron and flashings entered, edge protection.
 * - Gutters only: gutter lm (eave line), downpipes, edge protection.
 * Gutters & downpipes are added to any job with "include gutters".
 */
export function takeoff(m: Measurements, opts: { profileOverride?: ProfileOverride } = {}): Takeoff[] {
  const st = m.settings ?? DEFAULT_SETTINGS;
  const s = summarize(m);
  const out: Takeoff[] = [];
  const add = (key: string, q: number, extra: Partial<Takeoff> = {}) => {
    if (q > 0) out.push({ key, quantity: round2(q), unit: calcKeyUnit(key), ...extra });
  };
  const job = m.jobType;
  const replaces = REPLACES_ROOF.includes(job);
  const asbestos = job === "asbestos" || Boolean(m.asbestosSuspected);
  const lap = 1 + pos(st.lapPct) / 100;
  const live = m.sections.filter((x) => pos(x.area) > 0);
  const gross = (xs: RoofSection[]) => xs.reduce((a, x) => a + trueArea(x) * (1 + sectionWaste(x, m) / 100), 0);
  const tiles = live.filter((x) => isTile(sectionSystem(x)));
  const metalSecs = live.filter((x) => sectionSystem(x) === "metal");
  const membraneSecs = live.filter((x) => sectionSystem(x) === "membrane");
  const tileGross = gross(tiles);

  if (replaces) {
    // Old roof off.
    if (m.existingRoof !== "none") {
      if (asbestos) add("asbestos_removal", s.trueArea, { basis: `${s.trueArea} m² true area (licensed removal)` });
      else add("labour_strip", s.trueArea, { basis: `${s.trueArea} m² true area` });
    }
    add("labour_install", s.trueArea, { basis: `${s.trueArea} m² true area` });
    add("labour_steep", s.steepArea, { basis: `true area pitched above ${st.steepAboveDeg}°` });

    // Metal: cut list per profile, fixings, capping.
    const cuts = cutList(m, opts.profileOverride);
    const byProfile = new Map<MetalProfile, CutRow[]>();
    for (const c of cuts) byProfile.set(c.profile, [...(byProfile.get(c.profile) ?? []), c]);
    for (const [profile, rows] of byProfile) {
      const lm = rows.reduce((a, r) => a + r.lm, 0);
      const exact = rows.every((r) => r.exact);
      const fromPlans = rows.some((r) => r.rows);
      add("metal_sheet", lm, { profile, basis: `${METAL_PROFILE_INFO[profile].label}, ${rows[0].coverMm} mm cover${fromPlans ? `, ${rows[0].sheets} sheets cut from the plans` : exact ? ", cut list" : ", from area + waste"}` });
    }
    const screws = cuts.reduce((a, r) => a + r.screws, 0);
    const perBox = Math.max(1, pos(st.screwsPerBox) || 500);
    add("roof_screws", ceil(screws / perBox), { basis: `≈${Math.round(screws)} screws (${st.screwsPerSheetPerSupport} per sheet per support at ${st.supportSpacingMm} mm), ${perBox}/box` });
    if (metalSecs.length) {
      const pr = planLm(m, "ridge_capping", "ridgeHip", s.ridgeHip);
      add("ridge_capping", pr ?? s.ridgeHip * lap, { basis: pr != null ? `ridge + hip ${s.ridgeHip} lm in lengths from the plans (300 mm per run, 100 mm laps)` : `ridge + hip ${s.ridgeHip} lm + ${st.lapPct}% laps` });
      const pb = planLm(m, "barge_capping", "barge", pos(m.barge));
      add("barge_capping", pb ?? pos(m.barge) * lap, { basis: pb != null ? `barge ${pos(m.barge)} lm in lengths from the plans` : `barge ${pos(m.barge)} lm + ${st.lapPct}% laps` });
      if (m.planQty && m.existingRoof === "none" && near(trueAreaOf(metalSecs), m.planQty.trueArea)) {
        add("roof_battens", m.planQty.battensLm, { basis: `rows every ${st.supportSpacingMm} mm from the plans` });
      }
      if (m.includeSafetyMesh) {
        const metalArea = round2(metalSecs.reduce((a, x) => a + trueArea(x), 0));
        add("safety_mesh", ceil(metalArea / Math.max(1, pos(st.safetyMeshRollM2))), { basis: `${metalArea} m² ÷ ${st.safetyMeshRollM2} m²/roll` });
      }
    }

    // Tiles.
    if (tiles.length) {
      add("roof_tile", ceil(round2(tileGross * pos(st.tilesPerM2))), { basis: `${round2(tileGross)} m² incl. waste × ${st.tilesPerM2}/m²` });
      add("ridge_tile", ceil(round2(s.ridgeHip * pos(st.ridgeTilesPerLm))), { basis: `ridge + hip ${s.ridgeHip} lm × ${st.ridgeTilesPerLm}/lm` });
      const gauge = Math.max(0.1, pos(st.battenGaugeMm) / 1000);
      add("tile_battens", tileGross / gauge, { basis: `${round2(tileGross)} m² ÷ ${st.battenGaugeMm} mm gauge` });
      add("pointing", ceil(s.ridgeHip / Math.max(0.1, pos(st.pointingLmPerBag))), { basis: `${s.ridgeHip} lm ÷ ${st.pointingLmPerBag} lm/bag` });
    }
    // Membrane / low-slope.
    const membraneGross = gross(membraneSecs);
    add("membrane_roof", membraneGross, { basis: "true area incl. waste" });

    const sarkArea = round2(gross([...metalSecs, ...tiles]));
    if (m.includeSarking) add("sarking", ceil(sarkArea / Math.max(1, pos(st.sarkingRollM2))), { basis: `${sarkArea} m² incl. waste ÷ ${st.sarkingRollM2} m²/roll` });
    const pv = planLm(m, "valley_iron", "valley", pos(m.valley));
    add("valley_iron", pv ?? pos(m.valley) * lap, { basis: pv != null ? `valleys ${pos(m.valley)} lm in lengths from the plans` : `valleys ${pos(m.valley)} lm + ${st.lapPct}% laps` });
    const pa = planLm(m, "flashing", "apron", pos(m.apron));
    add("flashing", pa ?? pos(m.apron) * lap, { basis: pa != null ? `apron / wall ${pos(m.apron)} lm in lengths from the plans` : `apron / wall ${pos(m.apron)} lm + ${st.lapPct}% laps` });
    if (m.existingRoof === "none") {
      const pf = planLm(m, "fascia", "eave", pos(m.eave));
      if (pf != null) add("fascia", pf, { basis: `eave ${pos(m.eave)} lm in lengths from the plans` });
    }
    add("whirlybird", Math.round(pos(m.whirlybirds)));

    if (m.includeSkip && !asbestos && m.existingRoof !== "none") {
      const vol = round2(s.trueArea * OLD_ROOF_M3_PER_M2[m.existingRoof]);
      add("skip_bin", ceil(vol / Math.max(1, pos(st.skipBinM3))), { basis: `≈${vol} m³ of old ${EXISTING_ROOF_LABEL[m.existingRoof].toLowerCase()} ÷ ${st.skipBinM3} m³ bins` });
    }
  } else if (job === "restoration") {
    add("restore_clean", s.trueArea, { basis: `${s.trueArea} m² true area` });
    if (tiles.length) add("rebed_repoint", s.ridgeHip, { basis: "ridge + hip lm" });
    add("roof_coating", s.trueArea, { basis: `${s.trueArea} m² true area` });
    if (tiles.length) add("tile_replace", Math.round(pos(m.replaceTiles)));
    add("labour_steep", s.steepArea, { basis: `true area pitched above ${st.steepAboveDeg}°` });
  } else if (job === "repair") {
    add("tile_replace", Math.round(pos(m.replaceTiles)));
    add("valley_iron", pos(m.valley) * lap, { basis: `valleys ${pos(m.valley)} lm + ${st.lapPct}% laps` });
    add("flashing", pos(m.apron) * lap, { basis: `apron / wall ${pos(m.apron)} lm + ${st.lapPct}% laps` });
  }

  if (job === "gutters" || m.includeGutters) {
    const pg = planLm(m, "gutter", "eave", pos(m.eave));
    add("gutter", pg ?? pos(m.eave), { basis: pg != null ? `eave ${pos(m.eave)} lm in lengths from the plans (350 mm per run)` : "eave / gutter line" });
    add("downpipe", Math.round(pos(m.downpipes)));
  }
  if (m.includeEdgeProtection && (out.length > 0 || job === "repair")) add("edge_protection", 1, { basis: "per job" });
  return out;
}

const trueAreaOf = (xs: RoofSection[]) => xs.reduce((a, x) => a + trueArea(x), 0);
/** Ordered lm from the plans for a flashing, when the measured length still matches what the plans gave. */
function planLm(m: Measurements, k: keyof PlanQty["flashings"], b: keyof PlanQty["basis"], current: number): number | null {
  const q = m.planQty;
  const v = q?.flashings?.[k];
  if (!q || v == null || !(v > 0) || !near(current, Number(q.basis?.[b]) || 0)) return null;
  return v;
}

export type TakeoffWarning = { code: "asbestos" | "no_area"; text: string };

export function takeoffWarnings(m: Measurements): TakeoffWarning[] {
  const w: TakeoffWarning[] = [];
  if (m.jobType === "asbestos" || m.asbestosSuspected) w.push({ code: "asbestos", text: ASBESTOS_WARNING });
  if (!["gutters", "repair"].includes(m.jobType) && summarize(m).trueArea <= 0) w.push({ code: "no_area", text: "Enter the plan area of at least one roof section." });
  return w;
}

// ---------------------------------------------------------------------------
// Normalising stored jsonb (incl. the old US imperial format)
// ---------------------------------------------------------------------------
const SQM_PER_SQFT = 0.09290304;
const M_PER_FT = 0.3048;
/** "6/12" rise-per-12 -> degrees (6/12 ≈ 26.57°). */
export const degFromRisePer12 = (r: number) => round2((Math.atan(pos(r) / 12) * 180) / Math.PI);

const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function normalizeSettings(raw: unknown, base: CalcSettings): CalcSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cw: Partial<Record<MetalProfile, number>> = { ...(base.coverWidthMm ?? {}) };
  if (r.coverWidthMm && typeof r.coverWidthMm === "object") {
    for (const p of METAL_PROFILES) {
      const v = Number((r.coverWidthMm as Record<string, unknown>)[p]);
      if (v > 100 && v < 2000) cw[p] = v;
    }
  }
  const out: CalcSettings = { ...base, coverWidthMm: cw };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof CalcSettings)[]) {
    if (k === "coverWidthMm") continue;
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Calculator assumptions from organizations.calc_defaults (missing keys = defaults). */
export const normalizeCalcSettings = (raw: unknown) => normalizeSettings(raw, DEFAULT_SETTINGS);

/** True when stored measurements are the old imperial (sq ft, rise/12, feet) format. */
export function isLegacyImperial(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (r.units === "metric") return false;
  const hasSections = Array.isArray(r.sections) && r.sections.length > 0;
  return hasSections || ["eaves", "rakes", "ridges", "hips", "valleys"].some((k) => typeof r[k] === "number" && (r[k] as number) > 0);
}

/** Accept anything stored in estimates.measurements and fill in defaults (old imperial data is converted). */
export function normalizeMeasurements(raw: unknown, defaultWaste = 10, orgSettings?: unknown): Measurements {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacy = isLegacyImperial(raw);
  const base = orgSettings ? normalizeCalcSettings(orgSettings) : DEFAULT_SETTINGS;
  const rawSections = Array.isArray(r.sections) ? (r.sections as Record<string, unknown>[]) : [];
  const sections: RoofSection[] = rawSections.length
    ? rawSections.map((s, i) => {
        const area = numOr(s?.area, 0);
        const pitch = numOr(s?.pitch, legacy ? 6 : 22.5);
        const sysRaw = s?.system as string | undefined;
        const sec: RoofSection = {
          label: typeof s?.label === "string" && s.label ? s.label : `Section ${i + 1}`,
          area: legacy ? round2(area * SQM_PER_SQFT) : area,
          pitch: legacy ? degFromRisePer12(pitch) : clampPitch(pitch),
          waste: typeof s?.waste === "number" && Number.isFinite(s.waste) ? s.waste : null,
          system: ROOF_SYSTEMS.includes(sysRaw as RoofSystem) ? (sysRaw as RoofSystem) : legacy && (sysRaw === "low_slope" || pitch < 3) ? "membrane" : "metal",
        };
        if (METAL_PROFILES.includes(s?.profile as MetalProfile)) sec.profile = s.profile as MetalProfile;
        if (typeof s?.runLength === "number" && s.runLength > 0) sec.runLength = s.runLength;
        if (typeof s?.width === "number" && s.width > 0) sec.width = s.width;
        return sec;
      })
    : DEFAULT_MEASUREMENTS.sections.map((s) => ({ ...s }));
  const lm = (metricKey: string, legacyKey: string) => (legacy ? round2(numOr(r[legacyKey], 0) * M_PER_FT) : numOr(r[metricKey], 0));
  const bool = (k: string, d: boolean) => (typeof r[k] === "boolean" ? (r[k] as boolean) : d);
  const jobType = JOB_TYPES.includes(r.jobType as JobType) ? (r.jobType as JobType) : "reroof";
  return {
    units: "metric",
    jobType,
    existingRoof: EXISTING_ROOFS.includes(r.existingRoof as ExistingRoof) ? (r.existingRoof as ExistingRoof) : "tile",
    sections,
    wastePct: numOr(r.wastePct, defaultWaste),
    ridge: lm("ridge", "ridges"),
    hip: lm("hip", "hips"),
    valley: lm("valley", "valleys"),
    barge: lm("barge", "rakes"),
    eave: lm("eave", "eaves"),
    apron: legacy ? 0 : numOr(r.apron, 0),
    downpipes: numOr(r.downpipes, 0),
    whirlybirds: numOr(r.whirlybirds, 0),
    replaceTiles: numOr(r.replaceTiles, 0),
    asbestosSuspected: bool("asbestosSuspected", jobType === "asbestos"),
    includeSarking: bool("includeSarking", true),
    includeSafetyMesh: bool("includeSafetyMesh", true),
    includeGutters: bool("includeGutters", false),
    includeEdgeProtection: bool("includeEdgeProtection", true),
    includeSkip: bool("includeSkip", true),
    settings: normalizeSettings(r.settings, base),
    ...(normalizePlanQty(r.planQty) ? { planQty: normalizePlanQty(r.planQty) } : {}),
  };
}

function normalizePlanQty(raw: unknown): PlanQty | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const sheets: PlanQty["sheets"] = {};
  const rs = (r.sheets && typeof r.sheets === "object" ? r.sheets : {}) as Record<string, Record<string, unknown>>;
  for (const p of METAL_PROFILES) {
    const c = rs[p];
    if (!c || typeof c !== "object") continue;
    const rows = Array.isArray(c.rows) ? (c.rows as Record<string, unknown>[]).map((x) => ({ lengthMm: num(x?.lengthMm), qty: Math.round(num(x?.qty)) })).filter((x) => x.lengthMm > 0 && x.qty > 0) : [];
    if (num(c.coverMm) > 100 && num(c.lm) > 0) sheets[p] = { coverMm: num(c.coverMm), sheets: Math.round(num(c.sheets)), lm: num(c.lm), rows };
  }
  const fr = (r.flashings && typeof r.flashings === "object" ? r.flashings : {}) as Record<string, unknown>;
  const flashings: PlanQty["flashings"] = {};
  for (const k of ["ridge_capping", "barge_capping", "valley_iron", "flashing", "gutter", "fascia"] as const) if (num(fr[k]) > 0) flashings[k] = num(fr[k]);
  const br = (r.basis && typeof r.basis === "object" ? r.basis : {}) as Record<string, unknown>;
  const trueArea = num(r.trueArea);
  if (!(trueArea > 0)) return null;
  return {
    trueArea, sheets, flashings,
    basis: { ridgeHip: num(br.ridgeHip), barge: num(br.barge), valley: num(br.valley), apron: num(br.apron), eave: num(br.eave) },
    battensLm: num(r.battensLm),
  };
}

/** Legacy US keys that must not survive a save once converted to metric. */
const LEGACY_KEYS = ["eaves", "rakes", "ridges", "hips", "valleys", "layers", "pipeBoots", "iceWaterRows", "ridgeVent", "includeDumpster", "includePermit", "deckingSheets"];

/** The normalised measurements, keeping extra keys stored in the jsonb (e.g. the satellite tracing). */
export function mergeMeasurements(raw: unknown, m: Measurements): Record<string, unknown> {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  for (const k of LEGACY_KEYS) delete base[k];
  return { ...base, ...m };
}

// ---------------------------------------------------------------------------
// Measurement report import (Nearmap / other aerial report / hand-measured table)
// ---------------------------------------------------------------------------
export const MEASUREMENT_SOURCES = ["manual", "satellite", "plans", "nearmap", "roofgraf", "other", "eagleview", "hover", "roofr", "gaf_quickmeasure"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];
export const MEASUREMENT_SOURCE_LABEL: Record<string, string> = {
  manual: "Hand measured",
  satellite: "Satellite self-measure",
  plans: "Measured from plans",
  nearmap: "Nearmap",
  roofgraf: "Roofgraf",
  other: "Other report",
  eagleview: "EagleView",
  hover: "Hover",
  roofr: "Roofr",
  gaf_quickmeasure: "GAF QuickMeasure",
};

/**
 * Parse a pitch: degrees ("22.5", "22.5°", "22.5 deg"), a rise:run ratio ("1:4" = atan(1/4) ≈ 14.04°)
 * or a rise per 12 ("6/12" ≈ 26.57°). Returns degrees, or null when not understood / out of range.
 */
export function parsePitch(v: string): number | null {
  const t = String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?$/);
  if (m) {
    const n = Number(m[1]);
    return n <= MAX_PITCH ? round2(n) : null;
  }
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:\/|in)\s*12$/);
  if (m) return Number(m[1]) <= 30 ? degFromRisePer12(Number(m[1])) : null;
  m = t.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) > 0) {
    const d = pitchFromRiseRun(Number(m[1]), Number(m[2]));
    return d < MAX_PITCH ? d : null;
  }
  return null;
}

export type FacetRow = { label: string; area: number; pitch: number };

const AREA_SUFFIX = /\s*(m²|m2|sqm|sq\.?\s*m)$/i;
const isNumber = (c: string) => /^\d[\d,]*(\.\d+)?$/.test(c.replace(AREA_SUFFIX, "").trim());

/**
 * Facets pasted from a report as CSV / TSV: `name, area m², pitch°` (or `area, pitch`) per line.
 * A header line and blank lines are skipped. Returns parsed rows plus line-level errors.
 */
export function parseFacetCsv(text: string): { rows: FacetRow[]; errors: string[] } {
  const rows: FacetRow[] = [];
  const errors: string[] = [];
  String(text ?? "").split(/\r?\n/).forEach((line, idx) => {
    const raw = line.trim();
    if (!raw) return;
    const cells = (/[\t;]/.test(raw) ? raw.split(/[\t;]/) : raw.split(",")).map((c) => c.trim());
    let label = "", areaCell = "", pitchCell = "";
    if (cells.length >= 3) [label, areaCell, pitchCell] = cells;
    else if (cells.length === 2) [areaCell, pitchCell] = cells;
    else {
      errors.push(`Line ${idx + 1}: expected "name, area, pitch"`);
      return;
    }
    if (!isNumber(areaCell)) {
      if (rows.length === 0 && errors.length === 0) return; // header row
      errors.push(`Line ${idx + 1}: area "${areaCell}" is not a number`);
      return;
    }
    const area = Number(areaCell.replace(AREA_SUFFIX, "").replace(/,/g, ""));
    const pitch = parsePitch(pitchCell);
    if (pitch == null) {
      errors.push(`Line ${idx + 1}: pitch "${pitchCell}" not understood (use degrees, e.g. 22.5)`);
      return;
    }
    if (!(area > 0)) {
      errors.push(`Line ${idx + 1}: area must be more than 0`);
      return;
    }
    rows.push({ label: label || `Facet ${rows.length + 1}`, area, pitch });
  });
  return { rows, errors };
}

/**
 * Report facets -> calculator sections. Aerial reports give the true (sloped) area per facet; the calculator
 * stores plan area, so multiply by cos(pitch) unless the areas are already plan.
 */
export function facetsToSections(facets: FacetRow[], areasAre: "sloped" | "plan" = "sloped", system: RoofSystem = "metal"): RoofSection[] {
  return facets.map((f) => ({
    label: f.label,
    pitch: f.pitch,
    area: round2(areasAre === "sloped" ? f.area / pitchFactor(f.pitch) : f.area),
    waste: null,
    system,
  }));
}

// ---------------------------------------------------------------------------
// Money (generic helpers, also used by invoices)
// ---------------------------------------------------------------------------
export type LineItem = { quantity: number; unit_price: number };

/** Tax-exclusive totals: tax is added on top of (subtotal − discount). Estimates use estimateTotals() in estimate-totals.ts. */
export function totals(items: LineItem[], discount: number, taxRate: number) {
  const subtotal = round2(items.reduce((sum, i) => sum + round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0));
  const taxable = Math.max(0, round2(subtotal - (Number(discount) || 0)));
  const tax = round2((taxable * (Number(taxRate) || 0)) / 100);
  return { subtotal, discount: round2(Number(discount) || 0), tax, total: round2(taxable + tax) };
}

export type CostedItem = LineItem & { unit_cost?: number | null };

/** Cost vs sell for a set of lines (same tax basis on both sides). A discount comes straight out of profit. */
export function margin(items: CostedItem[], discount = 0) {
  const gross = items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
  const sell = Math.max(0, round2(gross - (Number(discount) || 0)));
  const cost = round2(items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)), 0));
  const profit = round2(sell - cost);
  return { sell, cost, profit, pct: sell > 0 ? round2((profit / sell) * 100) : 0 };
}

/** Standard amortised monthly repayment. APR in percent (e.g. 9.99). 0% = straight division. */
export function monthlyPayment(principal: number, aprPct: number, months: number): number {
  const p = Number(principal) || 0;
  const n = Math.round(Number(months) || 0);
  if (p <= 0 || n <= 0) return 0;
  const r = (Number(aprPct) || 0) / 1200;
  if (r <= 0) return round2(p / n);
  return round2((p * r) / (1 - Math.pow(1 + r, -n)));
}

// ---------------------------------------------------------------------------
// Instant quote (public website widget)
// ---------------------------------------------------------------------------
export const QUOTE_PITCHES = {
  flat: { label: "Flat", deg: 3, range: "0–5°", hint: "Barely sloped" },
  low: { label: "Low", deg: 12, range: "5–15°", hint: "Easy to walk on" },
  medium: { label: "Medium", deg: 22.5, range: "15–30°", hint: "Most houses" },
  steep: { label: "Steep", deg: 35, range: "30° +", hint: "Hard to walk on" },
} as const;
export type QuotePitch = keyof typeof QUOTE_PITCHES;
export const QUOTE_ROOF_TYPES = { metal: "Metal (COLORBOND)", tile: "Tiles" } as const;
export type QuoteRoofType = keyof typeof QUOTE_ROOF_TYPES;

/** Eaves overhang: roof plan area is roughly 15% larger than the house footprint. */
export const OVERHANG_FACTOR = 1.15;

export type InstantQuoteInput =
  | { mode: "house"; floorM2: number; storeys: number; pitch: QuotePitch }
  | { mode: "roof"; roofM2: number; pitch: QuotePitch };

/**
 * Rough installed price range (GST inclusive). From house size: footprint = floor area ÷ storeys × overhang ×
 * pitch factor. A known roof area is taken as already sloped. Rates per m² come from the company's instant-quote
 * settings; results round to the nearest $100.
 */
export function instantQuoteRange(input: InstantQuoteInput, perM2Low: number, perM2High: number) {
  const deg = QUOTE_PITCHES[input.pitch]?.deg ?? 22.5;
  let m2: number;
  if (input.mode === "roof") m2 = pos(input.roofM2);
  else {
    const storeys = Math.min(4, Math.max(1, Math.round(Number(input.storeys) || 1)));
    m2 = (pos(input.floorM2) / storeys) * OVERHANG_FACTOR * pitchFactor(deg);
  }
  m2 = Math.round(m2);
  const lo = Math.min(pos(perM2Low), pos(perM2High));
  const hi = Math.max(pos(perM2Low), pos(perM2High));
  const r100 = (n: number) => Math.round(n / 100) * 100;
  return { m2, low: r100(m2 * lo), high: r100(m2 * hi) };
}
