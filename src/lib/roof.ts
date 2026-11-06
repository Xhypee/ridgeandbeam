// Roof measurement -> material & labor quantities.
// Pure functions, no I/O, so the same math runs in the browser editor and in tests.

export type RoofSection = {
  label: string;
  /** Flat (plan-view) footprint area in square feet. */
  area: number;
  /** Rise in inches per 12" of run, e.g. 6 for a 6/12 roof. */
  pitch: number;
};

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
};

/** Multiplier from plan area to actual sloped surface area. */
export function pitchFactor(pitch: number): number {
  const p = Math.max(0, pitch);
  return Math.sqrt(1 + (p / 12) ** 2);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
const ceil = (n: number) => (n <= 0 ? 0 : Math.ceil(n - 1e-9));

export type RoofSummary = {
  /** Sloped surface area, no waste (sq ft). */
  surfaceArea: number;
  /** Roofing squares (100 sq ft), no waste. */
  squares: number;
  /** Squares including waste, rounded up to the nearest 1/3 square (one bundle). */
  orderSquares: number;
  /** Squares on sections pitched 8/12 or steeper (no waste). */
  steepSquares: number;
  /** Shingle bundles to order (3 per square, waste included). */
  bundles: number;
};

export function summarize(m: Measurements): RoofSummary {
  let surface = 0;
  let steep = 0;
  for (const s of m.sections) {
    const a = Math.max(0, Number(s.area) || 0) * pitchFactor(Number(s.pitch) || 0);
    surface += a;
    if ((Number(s.pitch) || 0) >= 8) steep += a;
  }
  const squares = surface / 100;
  const withWaste = squares * (1 + Math.max(0, m.wastePct) / 100);
  const bundles = ceil(withWaste * 3);
  return {
    surfaceArea: round2(surface),
    squares: round2(squares),
    orderSquares: round2(bundles / 3),
    steepSquares: round2(steep / 100),
    bundles,
  };
}

/** Keys match catalog_items.calc_key, seeded by create_organization(). */
export type CalcKey =
  | "tearoff"
  | "labor"
  | "steep"
  | "shingles"
  | "underlayment"
  | "ice_water"
  | "starter"
  | "ridge_cap"
  | "drip_edge"
  | "ridge_vent"
  | "nails"
  | "pipe_boot"
  | "dumpster"
  | "permit";

export type Takeoff = { key: CalcKey; quantity: number };

/**
 * Quantities to order. Coverage assumptions (typical architectural-shingle system):
 * 3 bundles/sq · underlayment 10 sq/roll · ice & water 2 sq/roll (~66 LF x 3 ft)
 * starter ~100 LF/bundle (eaves + rakes) · hip & ridge ~30 LF/bundle
 * drip edge 10 ft pieces (eaves + rakes) · ridge vent 4 ft pieces · nails ~15 sq/box
 */
export function takeoff(m: Measurements): Takeoff[] {
  const s = summarize(m);
  const out: Takeoff[] = [];
  const add = (key: CalcKey, q: number) => {
    if (q > 0) out.push({ key, quantity: round2(q) });
  };
  const eaveRake = Math.max(0, m.eaves) + Math.max(0, m.rakes);
  const hipRidge = Math.max(0, m.hips) + Math.max(0, m.ridges);

  if (m.layers > 0) add("tearoff", s.squares * m.layers);
  add("labor", s.squares);
  add("steep", s.steepSquares);
  add("shingles", s.bundles);
  add("underlayment", ceil(s.bundles / 30));
  // Ice & water: eave rows plus valleys (valleys get a full-width 3 ft strip).
  const iceWaterLf = Math.max(0, m.eaves) * Math.max(0, m.iceWaterRows) + Math.max(0, m.valleys);
  add("ice_water", ceil(iceWaterLf / 66));
  add("starter", ceil(eaveRake / 100));
  add("ridge_cap", ceil(hipRidge / 30));
  add("drip_edge", ceil(eaveRake / 10));
  if (m.ridgeVent) add("ridge_vent", ceil(Math.max(0, m.ridges) / 4));
  add("nails", ceil(s.bundles / 45));
  add("pipe_boot", Math.max(0, Math.round(m.pipeBoots)));
  if (m.includeDumpster && s.squares > 0) add("dumpster", Math.max(1, ceil(s.squares / 30)));
  if (m.includePermit && s.squares > 0) add("permit", 1);
  return out;
}

/** Accept anything stored in the jsonb column and fill in defaults. */
export function normalizeMeasurements(raw: unknown, defaultWaste = 10): Measurements {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Measurements>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const sections =
    Array.isArray(r.sections) && r.sections.length > 0
      ? r.sections.map((s, i) => ({
          label: typeof s?.label === "string" ? s.label : `Section ${i + 1}`,
          area: num(s?.area, 0),
          pitch: num(s?.pitch, 6),
        }))
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
  };
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
