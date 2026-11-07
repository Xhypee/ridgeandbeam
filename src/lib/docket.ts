// The receipt docket quote: the roof is the main item, extras (sarking, gutters, fascia, safety mesh…) are tapped
// on ("added", in the total) or off ("offered", listed under "Often added"). Pure: safe for client and server.
//
// Which lines are extras: a default list by calculator key, overridden per price-book item (catalog_items.is_extra).
// Quantities come from the calculator takeoff (every extra is worked out even when it isn't included, so it can be
// offered), prices from the price book or the quote's supplier sheet, exactly like "Fill line items from measurements".

import { countsInTotal, estimateTotals, itemsForOption } from "./estimate-totals";
import { buildLines, pick, priceIn, rowProfile, type CatalogRow, type DraftItem, type DraftOption, type PriceMode } from "./estimating";
import {
  calcKeyUnit, isTile, METAL_PROFILE_INFO, round2, sectionSystem, summarize, takeoff, trueArea,
  type JobType, type Measurements, type MetalProfile, type ProfileOverride, type Takeoff,
} from "./roof";

export type ExtraStatus = "added" | "offered";

/** Calculator keys that are extras unless the price book says otherwise. */
export const DEFAULT_EXTRA_KEYS = ["sarking", "safety_mesh", "gutter", "downpipe", "fascia", "edge_protection", "whirlybird", "skip_bin"] as const;

/** The "why" next to an extra when the price book has none. Plain language, no legal claims. */
export const EXTRA_BLURB: Record<string, string> = {
  sarking: "Keeps heat out and stops condensation",
  safety_mesh: "Fall protection under the new sheets",
  gutter: "New gutter, colour-matched",
  downpipe: "New downpipes",
  fascia: "Colour-matched to the roof",
  edge_protection: "Guard rail around the roof edge for the install",
  whirlybird: "Vents hot air from the roof space",
  skip_bin: "Takes away offcuts and packaging",
  roof_coating: "A fresh coat that protects the roof",
};

/** Extras shown (and added or removed) together as one row. */
export const EXTRA_GROUPS: Record<string, { id: string; name: string; blurb: string }> = {
  gutter: { id: "gutters", name: "Gutters & downpipes", blurb: "New gutter and downpipes, colour-matched" },
  downpipe: { id: "gutters", name: "Gutters & downpipes", blurb: "New gutter and downpipes, colour-matched" },
};

/** The measurement switch that includes a key in the calculator (kept in step with the docket). */
export const EXTRA_FLAG: Record<string, "includeSarking" | "includeSafetyMesh" | "includeGutters" | "includeEdgeProtection" | "includeSkip"> = {
  sarking: "includeSarking",
  safety_mesh: "includeSafetyMesh",
  gutter: "includeGutters",
  downpipe: "includeGutters",
  edge_protection: "includeEdgeProtection",
  skip_bin: "includeSkip",
};

const DEFAULT_SET = new Set<string>(DEFAULT_EXTRA_KEYS);

/** Whether a price-book item is an extra (its own flag, else the default for its calculator key). */
export function isExtraItem(c: Pick<CatalogRow, "calc_key" | "is_extra">): boolean {
  if (c.is_extra === true || c.is_extra === false) return c.is_extra;
  return Boolean(c.calc_key && DEFAULT_SET.has(c.calc_key));
}

/** Calculator keys that are extras for this price book. */
export function extraKeySet(catalog: Pick<CatalogRow, "calc_key" | "is_extra">[]): Set<string> {
  const keys = new Set<string>(DEFAULT_EXTRA_KEYS);
  const explicit = new Map<string, boolean>();
  for (const c of catalog) {
    if (!c.calc_key || (c.is_extra !== true && c.is_extra !== false)) continue;
    // Any item of a key marked "extra" makes the key an extra; "not an extra" wins only when no item says extra.
    explicit.set(c.calc_key, (explicit.get(c.calc_key) ?? false) || c.is_extra);
  }
  for (const [k, v] of explicit) {
    if (v) keys.add(k);
    else keys.delete(k);
  }
  return keys;
}

export function blurbFor(key: string | null, book: Pick<CatalogRow, "calc_key" | "blurb" | "name">[], description?: string): string | null {
  const own = book.find((c) => (key ? c.calc_key === key : c.name === description) && c.blurb?.trim())?.blurb?.trim();
  return own || (key ? EXTRA_GROUPS[key]?.blurb ?? EXTRA_BLURB[key] ?? null : null);
}

const REPLACES: JobType[] = ["reroof", "new_build", "tile_to_metal", "asbestos"];

/**
 * The calculator's takeoff with every extra worked out (so it can be offered even when not included), plus sensible
 * defaults the calculator leaves out: 2 whirlybirds when none were counted, fascia along the eave, one skip bin for
 * offcuts on a new roof.
 */
export function docketTakeoff(m: Measurements, extras: Set<string>, opts: { profileOverride?: ProfileOverride } = {}): Takeoff[] {
  const all: Measurements = { ...m };
  for (const [key, flag] of Object.entries(EXTRA_FLAG)) if (extras.has(key)) all[flag] = true;
  const replaces = REPLACES.includes(m.jobType);
  if (extras.has("whirlybird") && replaces && !(m.whirlybirds > 0) && m.sections.some((s) => s.area > 0)) all.whirlybirds = 2;
  const rows = takeoff(all, opts);
  const has = (k: string) => rows.some((r) => r.key === k);
  if (replaces && rows.length) {
    if (extras.has("fascia") && !has("fascia") && m.eave > 0) rows.push({ key: "fascia", quantity: round2(m.eave), unit: calcKeyUnit("fascia"), basis: `eave ${m.eave} lm` });
    const asbestos = m.jobType === "asbestos" || m.asbestosSuspected;
    if (extras.has("skip_bin") && !has("skip_bin") && !asbestos) rows.push({ key: "skip_bin", quantity: 1, unit: calcKeyUnit("skip_bin"), basis: "offcuts and packaging" });
  }
  return rows;
}

/** An extra's status when (re)filling: the measurement switch for switchable keys, else what it was before. */
export function extraStatusFor(key: string, m: Measurements, previous: Pick<DraftItem, "calc_key" | "extra_status">[]): ExtraStatus {
  const flag = EXTRA_FLAG[key];
  if (flag) return m[flag] ? "added" : "offered";
  const prev = previous.find((p) => p.calc_key === key);
  if (!prev) return "offered";
  return prev.extra_status ?? "added";
}

/** COLORBOND colour or ZINCALUME added to the sheet line's description. */
export function sheetDescription(name: string, colour: string | null | undefined): string {
  const base = stripColour(name);
  if (!colour) return base;
  return base.toLowerCase().includes(colour.toLowerCase()) ? base : `${base} · ${colour}`.slice(0, 500);
}
const COLOUR_NAMES = () => COLOURS.map((c) => c.name);
export function stripColour(description: string): string {
  let d = description;
  for (const n of COLOUR_NAMES()) d = d.replace(new RegExp(` · ${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "");
  return d;
}

/**
 * Lines from the measurements for the quote (the docket and "Fill line items from measurements"):
 * main lines (extra_status null), extras added to the total, and extras offered. `previous` = the quote's current
 * lines (keeps each extra's added/offered choice and the customer's picks). Hand-added lines are the caller's to keep.
 */
export function fillQuoteLines(args: {
  m: Measurements;
  book: CatalogRow[];
  options?: Pick<DraftOption, "key" | "tier">[];
  mode: PriceMode;
  previous?: DraftItem[];
  colour?: string | null;
  keepCustom?: DraftItem[];
}) {
  const { m, book, mode } = args;
  const options = args.options ?? [];
  const previous = args.previous ?? [];
  const extras = extraKeySet(book);
  const rows = docketTakeoff(m, extras);
  const built = buildLines(rows, book, options, { mode, rowsFor: (o) => docketTakeoff(m, extras, { profileOverride: o }) });
  const items: DraftItem[] = built.items.map((it) => {
    const key = it.calc_key;
    const desc = key === "metal_sheet" ? sheetDescription(it.description, args.colour) : it.description;
    if (!key || !extras.has(key)) return { ...it, description: desc, extra_status: null, blurb: null, customer_added: false };
    const status = extraStatusFor(key, m, previous);
    const prev = previous.find((p) => p.calc_key === key && (p.option_key ?? null) === (it.option_key ?? null));
    return { ...it, description: desc, extra_status: status, blurb: blurbFor(key, book), customer_added: status === "added" && Boolean(prev?.customer_added) };
  });
  // Price-book items marked "extra" that the calculator doesn't measure: offered once each (qty 1).
  const kept = [...(args.keepCustom ?? []), ...items];
  for (const c of book) {
    if (c.calc_key || c.is_extra !== true || kept.some((k) => k.description === c.name)) continue;
    items.push({
      description: c.name, quantity: 1, unit: c.unit, unit_price: priceIn(c, mode), unit_cost: Number(c.unit_cost) || 0, category: c.category,
      calc_key: null, option_key: null, supplier_price_item_id: c.supplier_price_item_id ?? null, extra_status: "offered", blurb: c.blurb ?? null, customer_added: false,
    });
  }
  return { items, missing: built.missing, warranties: built.warranties };
}

// ---------------------------------------------------------------------------
// Colours and profiles
// ---------------------------------------------------------------------------
/** Approximate on-screen colours of popular COLORBOND colours, plus unpainted ZINCALUME. */
export const COLOURS: { name: string; hex: string }[] = [
  { name: "Monument", hex: "#323233" },
  { name: "Surfmist", hex: "#e4e2d5" },
  { name: "Basalt", hex: "#6d6c6e" },
  { name: "Woodland Grey", hex: "#4b4c46" },
  { name: "Shale Grey", hex: "#bdbfba" },
  { name: "Dune", hex: "#b1ada3" },
  { name: "Jasper", hex: "#6c6153" },
  { name: "Manor Red", hex: "#5e1d0e" },
  { name: "Windspray", hex: "#888b8a" },
  { name: "Paperbark", hex: "#cabfa4" },
  { name: "Classic Cream", hex: "#e9dcb8" },
  { name: "Night Sky", hex: "#000000" },
  { name: "ZINCALUME", hex: "#a9adb0" },
];
export const colourHex = (name: string | null | undefined) => COLOURS.find((c) => c.name.toLowerCase() === (name ?? "").toLowerCase())?.hex ?? null;
export const isZincalume = (name: string | null | undefined) => /zincalume/i.test(name ?? "");

/** The three profiles on the docket's buttons. */
export const DOCKET_PROFILES: MetalProfile[] = ["custom_orb", "trimdek", "klip_lok"];
export const PROFILE_SHORT: Record<MetalProfile, string> = { custom_orb: "Custom Orb", trimdek: "Trimdek", klip_lok: "Klip-Lok 700", spandek: "Spandek" };

/** The sheet item for a profile, preferring the finish that matches the colour (ZINCALUME vs COLORBOND). */
export function pickSheet(book: CatalogRow[], profile: MetalProfile, colour: string | null | undefined): CatalogRow | undefined {
  const sheets = book.filter((c) => c.calc_key === "metal_sheet");
  const same = sheets.filter((c) => rowProfile(c) === profile);
  const zinc = isZincalume(colour);
  const finish = (c: CatalogRow) => `${c.finish ?? ""} ${c.name}`.toLowerCase();
  const wanted = same.find((c) => (zinc ? finish(c).includes("zincalume") : finish(c).includes("colorbond"))) ?? same[0];
  return wanted ?? pick(sheets, null, profile);
}

/** The profile the quote's metal sections use (null when there are none, or they differ). */
export function sectionsProfile(m: Measurements): MetalProfile | null {
  const metal = m.sections.filter((s) => sectionSystem(s) === "metal" && s.area > 0);
  const ps = new Set(metal.map((s) => s.profile ?? "custom_orb"));
  return ps.size === 1 ? [...ps][0] : null;
}

/**
 * Switch the roof to another sheet profile: re-cut the sheets (plans cut list for that profile, else area ÷ cover),
 * re-price the sheet line from the price book for that profile and colour, and re-count the screws.
 * Every other line (and any price typed in the detailed editor) is left alone.
 */
export function switchProfile(args: { items: DraftItem[]; m: Measurements; profile: MetalProfile; colour: string | null; book: CatalogRow[]; mode: PriceMode }) {
  const { profile, colour, book, mode } = args;
  const m: Measurements = { ...args.m, sections: args.m.sections.map((s) => (sectionSystem(s) === "metal" ? { ...s, profile } : s)) };
  const rows = takeoff(m);
  const sheet = rows.find((r) => r.key === "metal_sheet");
  const screws = rows.find((r) => r.key === "roof_screws");
  const row = pickSheet(book, profile, colour);
  let items = args.items;
  if (sheet) {
    const at = items.findIndex((i) => i.calc_key === "metal_sheet" && !i.option_key);
    const prev = at >= 0 ? items[at] : null;
    const line: DraftItem = row
      ? {
          description: sheetDescription(row.name, colour), quantity: sheet.quantity, unit: row.unit, unit_price: priceIn(row, mode), unit_cost: Number(row.unit_cost) || 0,
          category: row.category, calc_key: "metal_sheet", option_key: null, supplier_price_item_id: row.supplier_price_item_id ?? null, extra_status: null, blurb: null, customer_added: false,
        }
      : {
          description: sheetDescription(`${METAL_PROFILE_INFO[profile].label} roof sheet`, colour), quantity: sheet.quantity, unit: "lm", unit_price: prev?.unit_price ?? 0,
          unit_cost: prev?.unit_cost ?? 0, category: "material", calc_key: "metal_sheet", option_key: null, supplier_price_item_id: null, extra_status: null, blurb: null, customer_added: false,
        };
    const rest = items.filter((i) => !(i.calc_key === "metal_sheet" && !i.option_key));
    rest.splice(at >= 0 ? at : 0, 0, line);
    items = rest;
  }
  if (screws) items = items.map((i) => (i.calc_key === "roof_screws" && !i.option_key ? { ...i, quantity: screws.quantity } : i));
  return { items, m, priced: Boolean(row) };
}

/** Change the colour: renames the sheet line, and re-prices it when moving between ZINCALUME and COLORBOND. */
export function switchColour(args: { items: DraftItem[]; m: Measurements; profile: MetalProfile | null; from: string | null; to: string; book: CatalogRow[]; mode: PriceMode }) {
  if (args.profile && isZincalume(args.from) !== isZincalume(args.to)) {
    const before = args.items.find((i) => i.calc_key === "metal_sheet" && !i.option_key);
    const now = pickSheet(args.book, args.profile, args.to);
    if (before && now && stripColour(before.description) !== now.name) return switchProfile({ items: args.items, m: args.m, profile: args.profile, colour: args.to, book: args.book, mode: args.mode }).items;
  }
  return args.items.map((i) => (i.calc_key === "metal_sheet" ? { ...i, description: sheetDescription(i.description, args.to) } : i));
}

// ---------------------------------------------------------------------------
// The docket view of a quote's lines
// ---------------------------------------------------------------------------
const UNIT_WORD: Record<string, [string, string]> = {
  lm: ["m", "m"], m: ["m", "m"], m2: ["m²", "m²"], roll: ["roll", "rolls"], box: ["box", "boxes"], bag: ["bag", "bags"], job: ["job", "jobs"],
  sheet: ["sheet", "sheets"], hr: ["hr", "hrs"], ea: ["", ""],
};
const fmtNum = (n: number) => Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 });
/** "361.2 m", "253.7 m²", "5 boxes", "7 rolls", "2". */
export function qtyText(quantity: number, unit: string): string {
  const q = Number(quantity) || 0;
  const w = UNIT_WORD[unit];
  const word = w ? (q === 1 ? w[0] : w[1]) : unit;
  const num = unit === "lm" || unit === "m" || unit === "m2" ? q.toLocaleString("en-AU", { maximumFractionDigits: 1 }) : fmtNum(q);
  return word ? `${num} ${word}` : num;
}

export const lineAmount = (i: Pick<DraftItem, "quantity" | "unit_price">) => round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0));

export type ExtraRow = {
  /** Stable id for the row: the group (gutters), else the calc key, else the description. */
  id: string;
  name: string;
  blurb: string | null;
  qty: string;
  amount: number;
  status: ExtraStatus;
  /** Indexes into the items list. */
  idx: number[];
  calcKey: string | null;
  customerAdded: boolean;
};

/** Split a quote's lines (one option, or no options) into main lines, added extras and offered extras. */
export function docketView<T extends DraftItem>(items: T[], optionKey: string | null = null) {
  const visible = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !it.option_key || it.option_key === optionKey);
  const main = visible.filter(({ it }) => !it.extra_status);
  const groups = new Map<string, ExtraRow>();
  for (const { it, idx } of visible) {
    if (!it.extra_status) continue;
    const g = it.calc_key ? EXTRA_GROUPS[it.calc_key] : undefined;
    const id = `${it.extra_status}:${g?.id ?? it.calc_key ?? `d:${it.description}`}`;
    const row = groups.get(id);
    const qty = it.unit === "ea" && g ? `${fmtNum(Number(it.quantity))}` : qtyText(Number(it.quantity), it.unit);
    if (row) {
      row.idx.push(idx);
      row.amount = round2(row.amount + lineAmount(it));
      row.qty = `${row.qty} + ${qty}`;
      row.customerAdded = row.customerAdded || Boolean(it.customer_added);
    } else {
      groups.set(id, {
        id: g?.id ?? it.calc_key ?? `d:${it.description}`, name: g?.name ?? shortName(it), blurb: g ? g.blurb : it.blurb ?? null,
        qty, amount: lineAmount(it), status: it.extra_status, idx: [idx], calcKey: g ? "gutter" : it.calc_key, customerAdded: Boolean(it.customer_added),
      });
    }
  }
  const rows = [...groups.values()];
  const rank = (k: string | null) => { const i = k ? MAIN_ORDER.indexOf(k) : -1; return i < 0 ? MAIN_ORDER.length : i; };
  return {
    // The roof itself first (like a receipt's main item), then labour, capping and the rest; hand-added lines last.
    main: main.map(({ it, idx }) => ({ ...it, idx })).sort((a, b) => rank(a.calc_key) - rank(b.calc_key) || a.idx - b.idx),
    added: rows.filter((r) => r.status === "added"),
    offered: rows.filter((r) => r.status === "offered"),
    mainTotal: round2(main.reduce((s, { it }) => s + lineAmount(it), 0)),
  };
}

/** Display order of main lines on the docket. */
const MAIN_ORDER = [
  "metal_sheet", "roof_tile", "membrane_roof", "roof_coating", "restore_clean", "labour_install", "labour_strip", "asbestos_removal", "labour_steep",
  "ridge_capping", "ridge_tile", "barge_capping", "valley_iron", "flashing", "roof_battens", "tile_battens", "roof_screws", "pointing", "rebed_repoint", "tile_replace",
];

/** Friendlier names for extras on the docket (the price-book name is kept on the line). */
const SHORT: Record<string, string> = {
  sarking: "Sarking", safety_mesh: "Safety mesh", fascia: "Metal fascia", edge_protection: "Edge protection", whirlybird: "Whirlybirds", skip_bin: "Skip bin",
  gutter: "Gutter", downpipe: "Downpipes",
};
function shortName(it: Pick<DraftItem, "calc_key" | "description">) {
  return (it.calc_key && SHORT[it.calc_key]) || it.description;
}

/** Move an extra row between added and offered. Also keeps the calculator's include switches in step. */
export function setExtra<T extends DraftItem>(items: T[], idx: number[], status: ExtraStatus, m?: Measurements): { items: T[]; m?: Measurements } {
  const set = new Set(idx);
  const next = items.map((it, i) => (set.has(i) && it.extra_status ? { ...it, extra_status: status, customer_added: status === "added" ? it.customer_added : false } : it));
  if (!m) return { items: next };
  const mm = { ...m };
  for (const i of idx) {
    const flag = items[i]?.calc_key ? EXTRA_FLAG[items[i].calc_key!] : undefined;
    if (flag) mm[flag] = status === "added";
  }
  return { items: next, m: mm };
}

/** Totals of the docket (offered extras left out), GST-aware like the rest of the app. */
export function docketTotals(items: Pick<DraftItem, "quantity" | "unit_price" | "extra_status" | "option_key">[], discount: number, taxRate: number, inclusive: boolean, optionKey: string | null = null) {
  const lines = itemsForOption(items.map((i) => ({ ...i, option_id: i.option_key ?? null })), optionKey).filter(countsInTotal);
  return estimateTotals(lines.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })), discount, taxRate, inclusive);
}

// ---------------------------------------------------------------------------
// The roof header
// ---------------------------------------------------------------------------
/** "New Trimdek roof", "New tiled roof", "Roof restoration"… */
export function roofTitle(m: Pick<Measurements, "jobType" | "sections">, profile: MetalProfile | null): string {
  const live = m.sections.filter((s) => s.area > 0);
  const metal = live.some((s) => sectionSystem(s) === "metal");
  const tile = live.some((s) => isTile(sectionSystem(s)));
  switch (m.jobType) {
    case "restoration": return "Roof restoration";
    case "repair": return "Roof repairs";
    case "gutters": return "New gutters & downpipes";
    default:
      if (metal && profile) return `New ${PROFILE_SHORT[profile]} roof`;
      if (tile && !metal) return "New tiled roof";
      if (live.length && live.every((s) => sectionSystem(s) === "membrane")) return "New membrane roof";
      return "New roof";
  }
}

/** "253.7 m² · 8 panels at 23°" (plans) or "129.9 m² · 2 sections at 22.5°". */
export function roofFacts(m: Pick<Measurements, "sections" | "settings" | "jobType" | "wastePct" | "ridge" | "hip">, panels?: number | null): string {
  const live = m.sections.filter((s) => s.area > 0);
  if (!live.length) return "Not measured yet";
  const area = summarize(m as Measurements).trueArea || round2(live.reduce((s, x) => s + trueArea(x), 0));
  const pitches = [...new Set(live.map((s) => round2(Number(s.pitch) || 0)))].sort((a, b) => a - b);
  const pitch = pitches.length === 1 ? `${fmtNum(pitches[0])}°` : `${fmtNum(pitches[0])}–${fmtNum(pitches.at(-1)!)}°`;
  const n = panels ?? live.length;
  const what = panels != null ? (n === 1 ? "panel" : "panels") : n === 1 ? "section" : "sections";
  return `${area.toLocaleString("en-AU", { maximumFractionDigits: 1 })} m² · ${n} ${what} at ${pitch}`;
}
