// Roof measurement -> material & labor quantities.
// Pure functions, no I/O, so the same math runs in the browser editor and in tests.

export type RoofSystem = "shingle" | "low_slope" | "metal";
export const ROOF_SYSTEMS: RoofSystem[] = ["shingle", "low_slope", "metal"];
export const ROOF_SYSTEM_LABEL: Record<RoofSystem, string> = { shingle: "Shingle", low_slope: "Low-slope", metal: "Metal" };

/** Pitches below this (rise per 12) are low-slope: shingle waste tables don't apply (EagleView: valid at 3/12+). */
export const LOW_SLOPE_BELOW = 3;

/**
 * One roof facet / section. Mirrors an aerial-report facet (area + pitch); edge lengths stay global
 * on Measurements, as they are on the reports. `area` is the plan (footprint) area.
 */
export type RoofSection = {
  label: string;
  /** Flat (plan-view) footprint area in square feet. */
  area: number;
  /** Rise in inches per 12" of run, e.g. 6 for a 6/12 roof. */
  pitch: number;
  /** Waste % for this section; null/undefined = use the estimate's waste % (low-slope: none). */
  waste?: number | null;
  /** Roofing system; undefined = auto (low-slope under 3/12, shingle otherwise). */
  system?: RoofSystem;
};

/** The system a section is priced as (explicit choice, else by pitch). */
export function sectionSystem(s: Pick<RoofSection, "pitch" | "system">): RoofSystem {
  if (s.system && ROOF_SYSTEMS.includes(s.system)) return s.system;
  return (Number(s.pitch) || 0) < LOW_SLOPE_BELOW ? "low_slope" : "shingle";
}

export type Measurements = {
  sections: RoofSection[];
  wastePct: number;
  /** Linear feet */
  eaves: number;
  rakes: number;
  ridges: number;
  hips: number;
  valleys: number;
  /** Existing layers to tear off (0 = overlay / new deck). */
  layers: number;
  pipeBoots: number;
  /** Rows of ice & water shield along eaves (each row ~3 ft wide). 0 to skip. */
  iceWaterRows: number;
  ridgeVent: boolean;
  includeDumpster: boolean;
  includePermit: boolean;
  /** Decking replacement allowance in 4x8 sheets (priced per sheet; adjust on site with a change order). */
  deckingSheets: number;
};

export type CalcOptions = {
  /** Shingle bundles per square (organizations.bundles_per_square), usually 3. */
  bundlesPerSquare?: number;
};

export const DEFAULT_MEASUREMENTS: Measurements = {
  sections: [{ label: "Main roof", area: 0, pitch: 6 }],
  wastePct: 10,
  eaves: 0,
  rakes: 0,
  ridges: 0,
  hips: 0,
  valleys: 0,
  layers: 1,
  pipeBoots: 0,
  iceWaterRows: 1,
  ridgeVent: true,
  includeDumpster: true,
  includePermit: true,
  deckingSheets: 0,
};

/** Multiplier from plan area to actual sloped surface area. */
export function pitchFactor(pitch: number): number {
  const p = Math.max(0, Number(pitch) || 0);
  return Math.sqrt(1 + (p / 12) ** 2);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
const ceil = (n: number) => (n <= 0 ? 0 : Math.ceil(n - 1e-9));

export type RoofSummary = {
  /** Sloped surface area of every section, no waste (sq ft). */
  surfaceArea: number;
  /** Roofing squares (100 sq ft), every section, no waste. */
  squares: number;
  /** Shingle squares including per-section waste, rounded up to whole bundles. Low-slope/metal excluded. */
  orderSquares: number;
  /** Squares on steep-slope sections pitched 8/12 or steeper (no waste). Includes steepHighSquares. */
  steepSquares: number;
  /** Squares on steep-slope sections pitched 10/12 or steeper (no waste). */
  steepHighSquares: number;
  /** Shingle bundles to order (bundles per square, waste included, rounded up). */
  bundles: number;
  /** Squares by system, no waste. */
  shingleSquares: number;
  lowSlopeSquares: number;
  metalSquares: number;
  /** Low-slope squares plus any per-section waste override (default none). */
  lowSlopeOrderSquares: number;
  /** Metal squares with waste. */
  metalOrderSquares: number;
  /** Share (0..1) of surface area on steep-slope (shingle + metal) sections. */
  steepSlopeShare: number;
};

export function summarize(m: Measurements, opts: CalcOptions = {}): RoofSummary {
  const bps = Number(opts.bundlesPerSquare) > 0 ? Number(opts.bundlesPerSquare) : 3;
  const globalWaste = Math.max(0, Number(m.wastePct) || 0);
  let surface = 0, steep = 0, steepHigh = 0;
  let shingle = 0, shingleGross = 0, low = 0, lowGross = 0, metal = 0, metalGross = 0;
  for (const s of m.sections) {
    const pitch = Number(s.pitch) || 0;
    const a = Math.max(0, Number(s.area) || 0) * pitchFactor(pitch);
    const sys = sectionSystem(s);
    const override = s.waste == null || !Number.isFinite(Number(s.waste)) ? null : Math.max(0, Number(s.waste));
    surface += a;
    if (sys !== "low_slope") {
      if (pitch >= 8) steep += a;
      if (pitch >= 10) steepHigh += a;
    }
    if (sys === "shingle") {
      shingle += a;
      shingleGross += a * (1 + (override ?? globalWaste) / 100);
    } else if (sys === "metal") {
      metal += a;
      metalGross += a * (1 + (override ?? globalWaste) / 100);
    } else {
      low += a;
      lowGross += a * (1 + (override ?? 0) / 100);
    }
  }
  const bundles = ceil((shingleGross / 100) * bps);
  return {
    surfaceArea: round2(surface),
    squares: round2(surface / 100),
    orderSquares: round2(bundles / bps),
    steepSquares: round2(steep / 100),
    steepHighSquares: round2(steepHigh / 100),
    bundles,
    shingleSquares: round2(shingle / 100),
    lowSlopeSquares: round2(low / 100),
    metalSquares: round2(metal / 100),
    lowSlopeOrderSquares: round2(lowGross / 100),
    metalOrderSquares: round2(metalGross / 100),
    steepSlopeShare: surface > 0 ? (shingle + metal) / surface : 0,
  };
}

/** Keys match catalog_items.calc_key, seeded by create_organization() / seed_catalog_v2(). */
export type CalcKey =
  | "tearoff"
  | "extra_layer"
  | "labor"
  | "steep"
  | "steep_high"
  | "shingles"
  | "low_slope"
  | "metal"
  | "underlayment"
  | "ice_water"
  | "starter"
  | "ridge_cap"
  | "drip_edge"
  | "ridge_vent"
  | "nails"
  | "pipe_boot"
  | "decking"
  | "dumpster"
  | "permit";

/** Every calculator key, in the order lines are generated. `warranty` is a per-option price-book key. */
export const CALC_KEYS: CalcKey[] = [
  "tearoff", "extra_layer", "labor", "steep", "steep_high", "shingles", "low_slope", "metal", "underlayment", "ice_water",
  "starter", "ridge_cap", "drip_edge", "ridge_vent", "nails", "pipe_boot", "decking", "dumpster", "permit",
];
export const PRICE_BOOK_KEYS = [...CALC_KEYS, "warranty"] as const;

export const CALC_KEY_LABEL: Record<string, string> = {
  tearoff: "Tear-off (first layer)",
  extra_layer: "Extra tear-off layers",
  labor: "Installation labor",
  steep: "Steep charge 8–9/12",
  steep_high: "Steep charge 10/12 and up",
  shingles: "Shingles",
  low_slope: "Low-slope system (under 3/12)",
  metal: "Metal roofing",
  underlayment: "Underlayment",
  ice_water: "Ice & water shield",
  starter: "Starter strip",
  ridge_cap: "Hip & ridge cap",
  drip_edge: "Drip edge",
  ridge_vent: "Ridge vent",
  nails: "Nails",
  pipe_boot: "Pipe boots",
  decking: "Decking allowance (per sheet)",
  dumpster: "Dumpster",
  permit: "Permit",
  warranty: "Warranty (per option)",
};

export type Takeoff = { key: CalcKey; quantity: number };

/**
 * Quantities to order. Coverage assumptions (typical architectural-shingle system):
 * bundles/sq configurable (default 3) · underlayment 10 sq/roll · ice & water 2 sq/roll (~66 LF x 3 ft)
 * starter ~100 LF/bundle (eaves + rakes) · hip & ridge ~30 LF/bundle
 * drip edge 10 ft pieces (eaves + rakes) · ridge vent 4 ft pieces · nails ~15 sq/box
 *
 * Low-slope sections (under 3/12 unless overridden) get no shingles, underlayment, starter, install labor
 * or steep charges; they are priced per square through `low_slope`. Metal sections are priced through
 * `metal` (waste included) and share underlayment and install labor with shingles.
 * Pitch tiers: `steep` for 8/12 up to 10/12, `steep_high` for 10/12 and up.
 * Tear-off: `tearoff` is the first layer; every additional layer is `extra_layer`.
 */
export function takeoff(m: Measurements, opts: CalcOptions = {}): Takeoff[] {
  const s = summarize(m, opts);
  const out: Takeoff[] = [];
  const add = (key: CalcKey, q: number) => {
    if (q > 0) out.push({ key, quantity: round2(q) });
  };
  const steepSlope = s.shingleSquares + s.metalSquares;
  const steepSlopeGross = s.orderSquares + s.metalOrderSquares;
  const eaveRake = Math.max(0, m.eaves) + Math.max(0, m.rakes);
  const hipRidge = Math.max(0, m.hips) + Math.max(0, m.ridges);
  const layers = Math.max(0, Math.round(Number(m.layers) || 0));

  if (layers > 0) add("tearoff", s.squares);
  if (layers > 1) add("extra_layer", s.squares * (layers - 1));
  add("labor", steepSlope);
  add("steep", s.steepSquares - s.steepHighSquares);
  add("steep_high", s.steepHighSquares);
  add("shingles", s.bundles);
  add("low_slope", s.lowSlopeOrderSquares);
  add("metal", s.metalOrderSquares);
  add("underlayment", ceil(round2(steepSlopeGross) / 10));
  // Ice & water: eave rows plus valleys (valleys get a full-width 3 ft strip).
  const iceWaterLf = Math.max(0, m.eaves) * Math.max(0, m.iceWaterRows) + Math.max(0, m.valleys);
  add("ice_water", ceil(iceWaterLf / 66));
  // Edges are global (as on aerial reports); starter only runs along the steep-slope share of them.
  add("starter", ceil(round2(eaveRake * s.steepSlopeShare) / 100));
  add("ridge_cap", ceil(hipRidge / 30));
  add("drip_edge", ceil(eaveRake / 10));
  if (m.ridgeVent) add("ridge_vent", ceil(Math.max(0, m.ridges) / 4));
  add("nails", ceil(round2(steepSlopeGross) / 15));
  add("pipe_boot", Math.max(0, Math.round(m.pipeBoots)));
  add("decking", Math.max(0, Math.round(Number(m.deckingSheets) || 0)));
  if (m.includeDumpster && s.squares > 0) add("dumpster", Math.max(1, ceil(s.squares / 30)));
  if (m.includePermit && s.squares > 0) add("permit", 1);
  return out;
}

/** Accept anything stored in the jsonb column and fill in defaults. */
export function normalizeMeasurements(raw: unknown, defaultWaste = 10): Measurements {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Measurements>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const sections: RoofSection[] =
    Array.isArray(r.sections) && r.sections.length > 0
      ? r.sections.map((s, i) => {
          const sec: RoofSection = {
            label: typeof s?.label === "string" ? s.label : `Section ${i + 1}`,
            area: num(s?.area, 0),
            pitch: num(s?.pitch, 6),
            waste: typeof s?.waste === "number" && Number.isFinite(s.waste) ? s.waste : null,
          };
          if (s?.system && ROOF_SYSTEMS.includes(s.system)) sec.system = s.system;
          return sec;
        })
      : DEFAULT_MEASUREMENTS.sections.map((s) => ({ ...s }));
  return {
    sections,
    wastePct: num(r.wastePct, defaultWaste),
    eaves: num(r.eaves, 0),
    rakes: num(r.rakes, 0),
    ridges: num(r.ridges, 0),
    hips: num(r.hips, 0),
    valleys: num(r.valleys, 0),
    layers: num(r.layers, 1),
    pipeBoots: num(r.pipeBoots, 0),
    iceWaterRows: num(r.iceWaterRows, 1),
    ridgeVent: typeof r.ridgeVent === "boolean" ? r.ridgeVent : true,
    includeDumpster: typeof r.includeDumpster === "boolean" ? r.includeDumpster : true,
    includePermit: typeof r.includePermit === "boolean" ? r.includePermit : true,
    deckingSheets: num(r.deckingSheets, 0),
  };
}

/** The normalized measurements, keeping any extra keys stored in the jsonb (e.g. from the satellite tool). */
export function mergeMeasurements(raw: unknown, m: Measurements): Record<string, unknown> {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { ...base, ...m };
}

// ---------------------------------------------------------------------------
// Measurement report import (EagleView / Hover / Roofr / GAF QuickMeasure / other)
// ---------------------------------------------------------------------------
export const MEASUREMENT_SOURCES = ["manual", "satellite", "eagleview", "hover", "roofr", "gaf_quickmeasure", "other"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];
export const MEASUREMENT_SOURCE_LABEL: Record<string, string> = {
  manual: "Hand measured",
  satellite: "Satellite self-measure",
  eagleview: "EagleView",
  hover: "Hover",
  roofr: "Roofr",
  gaf_quickmeasure: "GAF QuickMeasure",
  other: "Other report",
};

/** Parse a pitch written as "6/12", "6", "6 / 12", "6:12" or "6in12". */
export function parsePitch(v: string): number | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:(?:\/|in|:)\s*12)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : null;
}

export type FacetRow = { label: string; area: number; pitch: number };

const AREA_SUFFIX = /\s*(sq\.?\s*ft\.?|sqft|sf|ft²|ft2)$/i;
const isNumber = (c: string) => /^\d[\d,]*(\.\d+)?$/.test(c.replace(AREA_SUFFIX, "").trim());

/**
 * Facets pasted from a report as CSV / TSV: `label, area, pitch` (or `area, pitch`) per line.
 * A header line and blank lines are skipped. Returns parsed rows plus line-level errors.
 */
export function parseFacetCsv(text: string): { rows: FacetRow[]; errors: string[] } {
  const rows: FacetRow[] = [];
  const errors: string[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, idx) => {
    const raw = line.trim();
    if (!raw) return;
    // Tabs or semicolons first (areas may contain thousands commas), then commas.
    const cells = (/[\t;]/.test(raw) ? raw.split(/[\t;]/) : raw.split(",")).map((c) => c.trim());
    let label = "", areaCell = "", pitchCell = "";
    if (cells.length >= 3) [label, areaCell, pitchCell] = cells;
    else if (cells.length === 2) [areaCell, pitchCell] = cells;
    else {
      errors.push(`Line ${idx + 1}: expected "label, area, pitch"`);
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
      errors.push(`Line ${idx + 1}: pitch "${pitchCell}" not understood (use 6/12 or 6)`);
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
 * Convert report facets to calculator sections. Aerial reports give the sloped (true) area per facet;
 * the calculator stores plan area, so divide by the pitch factor unless the areas are already plan.
 */
export function facetsToSections(facets: FacetRow[], areasAre: "sloped" | "plan" = "sloped"): RoofSection[] {
  return facets.map((f) => ({
    label: f.label,
    pitch: f.pitch,
    area: round2(areasAre === "sloped" ? f.area / pitchFactor(f.pitch) : f.area),
    waste: null,
  }));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export type LineItem = { quantity: number; unit_price: number };

export function totals(items: LineItem[], discount: number, taxRate: number) {
  const subtotal = round2(items.reduce((sum, i) => sum + round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0));
  const taxable = Math.max(0, round2(subtotal - (Number(discount) || 0)));
  const tax = round2((taxable * (Number(taxRate) || 0)) / 100);
  return { subtotal, discount: round2(Number(discount) || 0), tax, total: round2(taxable + tax) };
}

export type CostedItem = LineItem & { unit_cost?: number | null };

/** Cost vs sell for a set of lines, before tax. A discount comes straight out of profit. */
export function margin(items: CostedItem[], discount = 0) {
  const gross = items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
  const sell = Math.max(0, round2(gross - (Number(discount) || 0)));
  const cost = round2(items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)), 0));
  const profit = round2(sell - cost);
  return { sell, cost, profit, pct: sell > 0 ? round2((profit / sell) * 100) : 0 };
}

/** Standard amortized monthly payment. APR in percent (e.g. 9.99). 0% APR = straight division. */
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
  flat: { label: "Flat", pitch: 1, hint: "Barely sloped" },
  low: { label: "Low", pitch: 4, hint: "Easy to walk on" },
  medium: { label: "Medium", pitch: 7, hint: "Most houses" },
  steep: { label: "Steep", pitch: 10, hint: "Hard to walk on" },
} as const;
export type QuotePitch = keyof typeof QUOTE_PITCHES;

/** Eave overhangs and porches: roof plan area is roughly 15% larger than the floor footprint. */
export const OVERHANG_FACTOR = 1.15;

export type InstantQuoteInput =
  | { mode: "house"; houseSqft: number; stories: number; pitch: QuotePitch }
  | { mode: "squares"; squares: number; pitch: QuotePitch };

/**
 * Rough installed-price range. From house size: footprint = living area / stories, x overhang, x pitch
 * factor. Known squares are taken as already sloped. Prices per square come from the org's instant-quote
 * settings; results round to the nearest $100.
 */
export function instantQuoteRange(input: InstantQuoteInput, perSquareLow: number, perSquareHigh: number) {
  const pitch = QUOTE_PITCHES[input.pitch]?.pitch ?? 6;
  let squares: number;
  if (input.mode === "squares") squares = Math.max(0, Number(input.squares) || 0);
  else {
    const stories = Math.min(4, Math.max(1, Math.round(Number(input.stories) || 1)));
    const footprint = Math.max(0, Number(input.houseSqft) || 0) / stories;
    squares = (footprint * OVERHANG_FACTOR * pitchFactor(pitch)) / 100;
  }
  squares = round2(squares);
  const lo = Math.min(Number(perSquareLow) || 0, Number(perSquareHigh) || 0);
  const hi = Math.max(Number(perSquareLow) || 0, Number(perSquareHigh) || 0);
  const r100 = (n: number) => Math.round(n / 100) * 100;
  return { squares, low: r100(squares * lo), high: r100(squares * hi) };
}
