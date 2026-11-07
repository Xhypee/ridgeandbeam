// The receipt docket quote: the roof is the main item, extras (sarking, gutters, fascia, safety mesh…) are tapped
// on ("added", in the total) or off ("offered", listed under "Often added"). Pure: safe for client and server.
//
// Which lines are extras: a default list by calculator key, overridden per price-book item (catalog_items.is_extra).
// Quantities come from the calculator takeoff (every extra is worked out even when it isn't included, so it can be
// offered), prices from the price book or the quote's supplier sheet, exactly like "Fill line items from measurements".

import { countsInTotal, estimateTotals, itemsForOption } from "./estimate-totals";
import { buildLines, priceIn, rowProfile, type CatalogRow, type DraftItem, type DraftOption, type PriceMode } from "./estimating";
import {
  calcKeyUnit, isTile, round2, sectionSystem, summarize, takeoff, trueArea,
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

/** A fresh line id (lines keep their id across saves, so new ones are made in the browser). */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Give every line an id (keeps existing ones). */
export const withIds = <T extends DraftItem>(items: T[]): T[] => (items.every((i) => i.id) ? items : items.map((i) => (i.id ? i : { ...i, id: newId() })));

/**
 * Lines from the measurements for the quote (the docket and "Fill line items from measurements"):
 * main lines (extra_status null), extras added to the total, and extras offered. `previous` = the quote's current
 * lines: each line keeps its id, extras keep their added/offered choice, "required" and the customer's picks.
 * Without options the sheet line is the price-book row for the profile AND the colour's finish (never another
 * finish's price). Hand-added lines are the caller's to keep.
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
  const profile = sectionsProfile(m);
  const used = new Set<string>();
  const prevFor = (key: string | null, option: string | null) => {
    const p = previous.find((x) => x.id && !used.has(x.id) && x.calc_key === key && (x.option_key ?? null) === option);
    if (p?.id) used.add(p.id);
    return p;
  };
  const items: DraftItem[] = built.items.map((it) => {
    const key = it.calc_key;
    const prev = prevFor(key, it.option_key ?? null);
    const id = prev?.id ?? newId();
    if (key === "metal_sheet" && !options.length && profile) {
      return { ...sheetLine(book, profile, args.colour ?? null, it.quantity, mode), id };
    }
    const desc = key === "metal_sheet" ? sheetDescription(it.description, args.colour) : it.description;
    if (!key || !extras.has(key)) return { ...it, id, description: desc, extra_status: null, blurb: null, customer_added: false, required: false };
    const status = extraStatusFor(key, m, previous);
    return {
      ...it, id, description: desc, extra_status: status, blurb: blurbFor(key, book),
      customer_added: status === "added" && Boolean(prev?.customer_added), required: status === "added" && Boolean(prev?.required),
    };
  });
  // Price-book items marked "extra" that the calculator doesn't measure: offered once each (qty 1).
  const kept = [...(args.keepCustom ?? []), ...items];
  for (const c of book) {
    if (c.calc_key || c.is_extra !== true || kept.some((k) => k.description === c.name)) continue;
    items.push({
      id: newId(), description: c.name, quantity: 1, unit: c.unit, unit_price: priceIn(c, mode), unit_cost: Number(c.unit_cost) || 0, category: c.category,
      calc_key: null, option_key: null, supplier_price_item_id: c.supplier_price_item_id ?? null, extra_status: "offered", blurb: c.blurb ?? null, customer_added: false,
    });
  }
  return { items, missing: built.missing, warranties: built.warranties };
}

// ---------------------------------------------------------------------------
// Colours and profiles
// ---------------------------------------------------------------------------
/** Approximate on-screen colours of popular COLORBOND colours, plus unpainted ZINCALUME (same list as SQL docket_colours()). */
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

export type Finish = "colorbond" | "zincalume";
export const FINISH_LABEL: Record<Finish, string> = { colorbond: "COLORBOND", zincalume: "ZINCALUME" };
/** The finish a colour needs (no colour yet = COLORBOND, the usual roof). */
export const finishOf = (colour: string | null | undefined): Finish => (isZincalume(colour) ? "zincalume" : "colorbond");
/** The finish a price-book row is for (null = it doesn't say). */
export function rowFinish(c: Pick<CatalogRow, "finish" | "name">): Finish | null {
  const t = `${c.finish ?? ""} ${c.name}`.toLowerCase();
  if (t.includes("zincalume")) return "zincalume";
  if (t.includes("colorbond") || t.includes("colourbond")) return "colorbond";
  return null;
}

/** The three profiles on the docket's buttons. */
export const DOCKET_PROFILES: MetalProfile[] = ["custom_orb", "trimdek", "klip_lok"];
export const PROFILE_SHORT: Record<MetalProfile, string> = { custom_orb: "Custom Orb", trimdek: "Trimdek", klip_lok: "Klip-Lok 700", spandek: "Spandek" };

/**
 * The sheet item for a profile in the finish the colour needs. Only that profile and finish (a row that names no
 * finish is accepted when there is no exact one); never another finish's price.
 */
export function pickSheet(book: CatalogRow[], profile: MetalProfile, colour: string | null | undefined, finish: Finish = finishOf(colour)): CatalogRow | undefined {
  const same = book.filter((c) => c.calc_key === "metal_sheet" && rowProfile(c) === profile);
  const priced = (c: CatalogRow) => Number(c.unit_price) > 0;
  const exact = same.filter((c) => rowFinish(c) === finish);
  const loose = same.filter((c) => rowFinish(c) === null);
  return exact.find(priced) ?? loose.find(priced) ?? exact[0] ?? loose[0];
}

/** "No price for COLORBOND Custom Orb — set it in the price book" (null when the sheet is priced). */
export function sheetProblem(book: CatalogRow[], profile: MetalProfile | null, colour: string | null): string | null {
  if (!profile) return null;
  const row = pickSheet(book, profile, colour);
  if (row && Number(row.unit_price) > 0) return null;
  return `No price for ${FINISH_LABEL[finishOf(colour)]} ${PROFILE_SHORT[profile]} — set it in the price book`;
}

/** What the sheet line becomes in each finish (prices the customer's colour choice is re-priced from, server-side). */
export type SheetVariant = { name: string; unit_price: number; unit_cost: number; supplier_price_item_id: string | null };
export type SheetVariants = Partial<Record<Finish, SheetVariant>>;
export function sheetVariants(book: CatalogRow[], profile: MetalProfile, mode: PriceMode): SheetVariants {
  const out: SheetVariants = {};
  for (const f of ["colorbond", "zincalume"] as Finish[]) {
    const r = pickSheet(book, profile, null, f);
    if (r && rowFinish(r) === f && Number(r.unit_price) > 0) {
      out[f] = { name: r.name, unit_price: priceIn(r, mode), unit_cost: Number(r.unit_cost) || 0, supplier_price_item_id: r.supplier_price_item_id ?? null };
    }
  }
  return out;
}

/** The main sheet line for a profile + colour: the matching price-book row, or a $0 line named for what's missing. */
export function sheetLine(book: CatalogRow[], profile: MetalProfile, colour: string | null, quantity: number, mode: PriceMode): DraftItem {
  const row = pickSheet(book, profile, colour);
  const base = { quantity, calc_key: "metal_sheet", option_key: null, extra_status: null, blurb: null, customer_added: false, required: false, variants: sheetVariants(book, profile, mode) } as const;
  return row
    ? { ...base, description: sheetDescription(row.name, colour), unit: row.unit, unit_price: priceIn(row, mode), unit_cost: Number(row.unit_cost) || 0, category: row.category, supplier_price_item_id: row.supplier_price_item_id ?? null }
    : { ...base, description: sheetDescription(`${FINISH_LABEL[finishOf(colour)]} ${PROFILE_SHORT[profile]}`, colour), unit: "lm", unit_price: 0, unit_cost: 0, category: "material", supplier_price_item_id: null };
}

/** Refresh the per-finish prices on the main sheet line (before saving). */
export function attachVariants<T extends DraftItem>(items: T[], book: CatalogRow[], profile: MetalProfile | null, mode: PriceMode): T[] {
  if (!profile) return items;
  const v = sheetVariants(book, profile, mode);
  return items.map((i) => (i.calc_key === "metal_sheet" && !i.option_key && !i.extra_status ? { ...i, variants: v } : i));
}

/** The profile the quote's metal sections use (null when there are none, or they differ). */
export function sectionsProfile(m: Measurements): MetalProfile | null {
  const metal = m.sections.filter((s) => sectionSystem(s) === "metal" && s.area > 0);
  const ps = new Set(metal.map((s) => s.profile ?? "custom_orb"));
  return ps.size === 1 ? [...ps][0] : null;
}

/**
 * Switch the roof to another sheet profile: re-cut the sheets (plans cut list for that profile, else area ÷ cover),
 * re-price the sheet line from the price book for that profile and colour (or $0 + a warning when there's no price),
 * and re-count the screws. The sheet line keeps its id; every other line is left alone.
 */
export function switchProfile(args: { items: DraftItem[]; m: Measurements; profile: MetalProfile; colour: string | null; book: CatalogRow[]; mode: PriceMode }) {
  const { profile, colour, book, mode } = args;
  const m: Measurements = { ...args.m, sections: args.m.sections.map((s) => (sectionSystem(s) === "metal" ? { ...s, profile } : s)) };
  const rows = takeoff(m);
  const sheet = rows.find((r) => r.key === "metal_sheet");
  const screws = rows.find((r) => r.key === "roof_screws");
  let items = args.items;
  if (sheet) {
    const at = items.findIndex((i) => i.calc_key === "metal_sheet" && !i.option_key);
    const prev = at >= 0 ? items[at] : null;
    const line: DraftItem = { ...sheetLine(book, profile, colour, sheet.quantity, mode), id: prev?.id ?? newId() };
    const rest = items.filter((i) => !(i.calc_key === "metal_sheet" && !i.option_key));
    rest.splice(at >= 0 ? at : 0, 0, line);
    items = rest;
  }
  if (screws) items = items.map((i) => (i.calc_key === "roof_screws" && !i.option_key ? { ...i, quantity: screws.quantity } : i));
  return { items, m, priced: !sheetProblem(book, profile, colour) };
}

/** Change the colour: renames the sheet line, and re-prices it when the finish changes (ZINCALUME ↔ COLORBOND). */
export function switchColour(args: { items: DraftItem[]; m: Measurements; profile: MetalProfile | null; from: string | null; to: string; book: CatalogRow[]; mode: PriceMode }) {
  if (args.profile && finishOf(args.from) !== finishOf(args.to)) {
    return switchProfile({ items: args.items, m: args.m, profile: args.profile, colour: args.to, book: args.book, mode: args.mode }).items;
  }
  return args.items.map((i) => (i.calc_key === "metal_sheet" ? { ...i, description: sheetDescription(i.description, args.to) } : i));
}

// ---------------------------------------------------------------------------
// The customer's choices (customer page, and the totals the acceptance is signed for)
// ---------------------------------------------------------------------------
export type Pick_ = { id: string; calc_key: string | null };
export type CustomerChoices = { added: Pick_[]; removed: Pick_[]; colour: string | null };

/** Choices made on an older version of the quote, matched to the lines now on it (by id, then calc key). */
export function matchChoices<T extends ChoiceLine>(items: T[], picks: Pick_[], want: "offered" | "added"): string[] {
  const out: string[] = [];
  for (const p of picks) {
    const ok = (i: T) => i.extra_status === want && (want === "offered" || !i.required) && !out.includes(i.id!);
    const hit = items.find((i) => i.id === p.id && ok(i)) ?? (p.calc_key ? items.find((i) => i.calc_key === p.calc_key && ok(i)) : undefined);
    if (hit?.id) out.push(hit.id);
  }
  return out;
}

/**
 * The quote as the customer has it: their added extras in, their removed ones out, the sheet line in their colour
 * (re-priced from the per-finish price when the finish changes). Mirrors accept_public_estimate.
 */
export type ChoiceLine = Pick<DraftItem, "id" | "description" | "unit_price" | "required" | "customer_removed"> & {
  calc_key?: string | null; extra_status?: DraftItem["extra_status"]; variants?: Partial<Record<Finish, { name: string; unit_price: number }>> | null;
};
export function applyChoices<T extends ChoiceLine>(items: T[], c: { added: string[]; removed: string[]; colour: string | null; roofColour: string | null }): T[] {
  const add = new Set(c.added), rem = new Set(c.removed);
  const recolour = c.colour && c.colour !== c.roofColour;
  return items.map((i) => {
    let it = i;
    if (it.id && add.has(it.id) && it.extra_status === "offered") it = { ...it, extra_status: "added" };
    if (it.id && rem.has(it.id) && it.extra_status === "added" && !it.required) it = { ...it, extra_status: "offered", customer_removed: true };
    if (recolour && it.calc_key === "metal_sheet" && !it.extra_status) {
      const v = it.variants?.[finishOf(c.colour)];
      if (v && Number(v.unit_price) > 0) it = { ...it, description: sheetDescription(v.name, c.colour), unit_price: Number(v.unit_price) };
      else it = { ...it, description: sheetDescription(it.description, c.colour) };
    }
    return it;
  });
}

/** Colours the customer can pick: the roofer's finish always; the other finish only when it has a price. */
export function pickableColours(items: ChoiceLine[], roofColour: string | null): typeof COLOURS {
  const sheet = items.find((i) => i.calc_key === "metal_sheet" && !i.extra_status);
  if (!sheet) return [];
  return COLOURS.filter((c) => finishOf(c.name) === finishOf(roofColour) || Number(sheet.variants?.[finishOf(c.name)]?.unit_price) > 0);
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
  /** The customer can't remove it. */
  required: boolean;
  /** Taken off by the customer when they signed. */
  customerRemoved: boolean;
};

/** Split a quote's lines (one option, or no options) into main lines, added extras and offered extras. */
export function docketView<T extends DraftItem>(items: T[], optionKey: string | null = null) {
  const visible = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !it.option_key || it.option_key === optionKey);
  const main = visible.filter(({ it }) => !it.extra_status);
  const groups = new Map<string, ExtraRow>();
  for (const { it, idx } of visible) {
    if (!it.extra_status) continue;
    const g = it.calc_key ? EXTRA_GROUPS[it.calc_key] : undefined;
    const id = `${it.extra_status}:${it.customer_removed ? "x" : ""}:${g?.id ?? it.calc_key ?? `d:${it.description}`}`;
    const row = groups.get(id);
    const qty = it.unit === "ea" && g ? `${fmtNum(Number(it.quantity))}` : qtyText(Number(it.quantity), it.unit);
    if (row) {
      row.idx.push(idx);
      row.amount = round2(row.amount + lineAmount(it));
      row.qty = `${row.qty} + ${qty}`;
      row.customerAdded = row.customerAdded || Boolean(it.customer_added);
      row.required = row.required || Boolean(it.required);
    } else {
      groups.set(id, {
        id: g?.id ?? it.calc_key ?? `d:${it.description}`, name: g?.name ?? shortName(it), blurb: g ? g.blurb : it.blurb ?? null,
        qty, amount: lineAmount(it), status: it.extra_status, idx: [idx], calcKey: g ? "gutter" : it.calc_key, customerAdded: Boolean(it.customer_added),
        required: Boolean(it.required), customerRemoved: Boolean(it.customer_removed),
      });
    }
  }
  const rows = [...groups.values()];
  const rank = (k: string | null) => { const i = k ? MAIN_ORDER.indexOf(k) : -1; return i < 0 ? MAIN_ORDER.length : i; };
  return {
    // The roof itself first (like a receipt's main item), then labour, capping and the rest; hand-added lines last.
    main: main.map(({ it, idx }) => ({ ...it, idx })).sort((a, b) => rank(a.calc_key) - rank(b.calc_key) || a.idx - b.idx),
    added: rows.filter((r) => r.status === "added"),
    offered: rows.filter((r) => r.status === "offered" && !r.customerRemoved),
    /** Extras the customer took off when they signed. */
    removed: rows.filter((r) => r.status === "offered" && r.customerRemoved),
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
  const next = items.map((it, i) => (set.has(i) && it.extra_status
    ? { ...it, extra_status: status, customer_added: status === "added" ? it.customer_added : false, customer_removed: false, required: status === "added" ? it.required : false }
    : it));
  if (!m) return { items: next };
  const mm = { ...m };
  for (const i of idx) {
    const flag = items[i]?.calc_key ? EXTRA_FLAG[items[i].calc_key!] : undefined;
    if (flag) mm[flag] = status === "added";
  }
  return { items: next, m: mm };
}

/** Mark an added extra as required (the customer can't remove it) or optional. */
export function setRequired<T extends DraftItem>(items: T[], idx: number[], required: boolean): T[] {
  const set = new Set(idx);
  return items.map((it, i) => (set.has(i) && it.extra_status === "added" ? { ...it, required } : it));
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
