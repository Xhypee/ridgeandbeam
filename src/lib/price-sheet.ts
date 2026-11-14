/**
 * Supplier price-sheet import (pure; runs in the browser wizard and again on the server):
 * delimited-text parsing, header detection, column auto-mapping, unit normalisation, row
 * validation, calc-key suggestion and conversion of a supplier's unit into the calculator's unit.
 * Australian conventions: metric, prices stored ex GST, GST 10%.
 */
import { CALC_KEYS, CALC_KEY_MAP, suggestCalcKey, type CalcUnit } from "./calc-keys";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export const SHEET_UNITS = ["lm", "m2", "sheet", "length", "ea", "box", "roll", "bag", "hr", "job"] as const;
export type SheetUnit = (typeof SHEET_UNITS)[number];

export const SHEET_UNIT_LABEL: Record<SheetUnit, string> = {
  lm: "per lineal metre", m2: "per m²", sheet: "per sheet", length: "per length", ea: "each",
  box: "per box", roll: "per roll", bag: "per bag", hr: "per hour", job: "per job",
};
export const UNIT_SHORT: Record<string, string> = { lm: "lm", m2: "m²", sheet: "sheet", length: "length", ea: "ea", box: "box", roll: "roll", bag: "bag", hr: "hr", job: "job" };

const UNIT_SYNONYMS: Record<string, SheetUnit> = {
  lm: "lm", "l/m": "lm", "lin m": "lm", linm: "lm", "per m": "lm", "/m": "lm", m: "lm", mtr: "lm", metre: "lm", meter: "lm", metres: "lm",
  "lineal metre": "lm", "lineal meter": "lm", "linear metre": "lm", "linear meter": "lm", "lineal m": "lm", "/lm": "lm", "per lm": "lm", lmt: "lm",
  m2: "m2", "m²": "m2", sqm: "m2", "sq m": "m2", "sq.m": "m2", "square metre": "m2", "/m2": "m2", "per m2": "m2", "per sqm": "m2",
  sheet: "sheet", sht: "sheet", sheets: "sheet", "per sheet": "sheet",
  length: "length", lgth: "length", lth: "length", len: "length", lengths: "length", "per length": "length", "stock length": "length",
  ea: "ea", each: "ea", no: "ea", "no.": "ea", pce: "ea", pc: "ea", pcs: "ea", piece: "ea", item: "ea", unit: "ea", "per each": "ea",
  box: "box", bx: "box", pkt: "box", pk: "box", pack: "box", packet: "box", carton: "box", ctn: "box", "per box": "box",
  roll: "roll", rl: "roll", rll: "roll", rolls: "roll", "per roll": "roll",
  bag: "bag", bg: "bag", bags: "bag", "per bag": "bag",
  hr: "hr", hrs: "hr", hour: "hr", hours: "hr",
  job: "job", "per job": "job", allowance: "job",
};

/** "L/M", "Lin m", "BX", "EA", "Length" → a canonical unit (null when unknown or blank). */
export function normaliseUnit(raw: string | null | undefined): SheetUnit | null {
  const t = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (UNIT_SYNONYMS[t]) return UNIT_SYNONYMS[t];
  const stripped = t.replace(/^(per|\/)\s*/, "").replace(/[.]$/, "");
  return UNIT_SYNONYMS[stripped] ?? null;
}

// ---------------------------------------------------------------------------
// Delimited text (CSV, TSV pasted from Excel, semicolon)
// ---------------------------------------------------------------------------
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  let best = ",";
  let bestCount = -1;
  for (const d of ["\t", ",", ";", "|"]) {
    let count = 0;
    let quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) count++;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/** RFC-4180-ish parser with quoted fields, doubled quotes, CRLF and a BOM. Drops fully blank rows. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** Cells from an XLSX reader (numbers, dates, booleans, null) → strings. */
export function cellsToStrings(rows: unknown[][]): string[][] {
  return rows
    .map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())))
    .filter((r) => r.some((c) => c !== ""));
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
export const IMPORT_FIELDS = [
  { field: "product_code", label: "Product code", hint: "Supplier SKU / item code" },
  { field: "description", label: "Description", required: true },
  { field: "profile", label: "Profile / range", hint: "Custom Orb, Trimdek, Klip-Lok…" },
  { field: "finish", label: "Finish / colour", hint: "COLORBOND Monument, ZINCALUME…" },
  { field: "thickness_mm", label: "Thickness (BMT mm)" },
  { field: "cover_width_mm", label: "Cover width (mm)" },
  { field: "girth_mm", label: "Girth (mm)" },
  { field: "length_mm", label: "Sheet / stock length", hint: "mm or m" },
  { field: "unit", label: "Unit", hint: "LM, EA, BOX, ROLL, M2, LENGTH…" },
  { field: "pack_qty", label: "Pack qty / roll m²", hint: "Screws per box, m² per roll" },
  { field: "price", label: "Price", required: true },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["field"];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  product_code: ["product code", "item code", "code", "sku", "part no", "part number", "part #", "item no", "item number", "stock code", "item #", "product id", "article", "cat no", "catalogue no"],
  description: ["description", "item description", "product description", "desc", "product name", "item name", "product", "item", "name", "details"],
  profile: ["profile", "range", "product range", "series"],
  finish: ["finish", "colour", "color", "coating", "colour/finish", "material"],
  thickness_mm: ["bmt", "thickness", "gauge", "thk", "bmt mm", "thickness mm"],
  cover_width_mm: ["cover width", "cover", "effective cover", "cover mm", "width cover", "effective width"],
  girth_mm: ["girth", "girth mm"],
  length_mm: ["length", "sheet length", "stock length", "len", "length mm", "length m"],
  unit: ["unit", "uom", "unit of measure", "units", "per", "sell unit", "price unit", "u/m"],
  pack_qty: ["pack qty", "pack", "pack size", "qty per pack", "qty per box", "box qty", "coverage", "roll m2", "m2 per roll", "coverage m2", "per box", "carton qty"],
  price: ["price ex gst", "price inc gst", "unit price", "nett price", "net price", "trade price", "price", "cost", "nett", "net", "rate", "ex gst", "inc gst", "sell", "amount", "your price", "account price"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[_\-.:()$]+/g, " ").replace(/\s+/g, " ").trim();

function headerScore(h: string, field: ImportField): number {
  const n = normHeader(h);
  if (!n) return 0;
  let best = 0;
  for (const syn of HEADER_SYNONYMS[field]) {
    if (n === syn) best = Math.max(best, 100 + syn.length);
    else if (n.startsWith(syn + " ") || n.endsWith(" " + syn) || n.includes(" " + syn + " ")) best = Math.max(best, 50 + syn.length);
    else if (syn.length >= 4 && n.includes(syn)) best = Math.max(best, 20 + syn.length);
  }
  return best;
}

/** Index of the header row: the first of the top 15 rows with ≥ 2 recognisable column names. */
export function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let bestIdx = 0;
  let bestHits = 0;
  for (let i = 0; i < limit; i++) {
    const hits = new Set<ImportField>();
    for (const c of rows[i]) {
      // A header cell is a short column name: numbers and long notes above the table ("All prices ex GST.
      // Cut-to-length sheet priced per lineal metre.") don't count, and each cell names one column at most.
      if (/^-?[$]?\d[\d,.]*$/.test(c) || c.trim().length > 40) continue;
      let best: ImportField | null = null, bestScore = 49;
      for (const f of IMPORT_FIELDS) { const sc = headerScore(c, f.field); if (sc > bestScore) { best = f.field; bestScore = sc; } }
      if (best) hits.add(best);
    }
    if (hits.size > bestHits) { bestHits = hits.size; bestIdx = i; }
    if (hits.size >= 3) break;
  }
  return bestHits >= 2 ? bestIdx : 0;
}

/** Best column for each field (each column used at most once). */
export function autoMapColumns(header: string[]): ColumnMapping {
  const cand: { field: ImportField; col: number; score: number }[] = [];
  header.forEach((h, col) => {
    for (const f of IMPORT_FIELDS) {
      const score = headerScore(h, f.field);
      if (score > 0) cand.push({ field: f.field, col, score });
    }
  });
  cand.sort((a, b) => b.score - a.score);
  const out: ColumnMapping = {};
  const used = new Set<number>();
  for (const c of cand) {
    if (out[c.field] !== undefined || used.has(c.col)) continue;
    out[c.field] = c.col;
    used.add(c.col);
  }
  return out;
}

/** "Price inc GST" header → inc; "ex GST"/"nett" → ex; otherwise unknown. */
export function guessGst(header: string[], mapping: ColumnMapping): "inc" | "ex" | null {
  const h = mapping.price !== undefined ? normHeader(header[mapping.price] ?? "") : "";
  if (/\binc(l|luding)?\b|\bincl gst\b|\binc gst\b/.test(h)) return "inc";
  if (/\bex(cl|cluding)?\b|\bnett?\b|\bex gst\b/.test(h)) return "ex";
  return null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------
/** "$1,234.50", "12.5", "AUD 9" → number; null for blank/invalid. */
export function parsePrice(v: string | null | undefined): number | null {
  const t = String(v ?? "").replace(/aud|\$|,|\s/gi, "");
  if (!t) return null;
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
}
function parseNumber(v: string | null | undefined): number | null {
  const m = String(v ?? "").replace(/,/g, "").match(/-?\d*\.?\d+/);
  return m ? Number(m[0]) : null;
}
/** Length in mm from "6500", "6500mm", "6.5m", "6.5" (bare numbers < 50 are metres). */
export function parseLengthMm(v: string | null | undefined): number | null {
  const t = String(v ?? "").trim().toLowerCase().replace(/,/g, "");
  const m = t.match(/(\d*\.?\d+)\s*(mm|m)?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  if (m[2] === "mm") return n;
  if (m[2] === "m") return n * 1000;
  return n < 50 ? n * 1000 : n;
}

/** Stock length written into a description: "… 6.5m", "x 6500mm", "6.0 m length". */
export function lengthFromText(s: string): number | null {
  const t = s.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s?m(?![m²2a-z])/);
  if (m && Number(m[1]) > 0 && Number(m[1]) <= 30) return Number(m[1]) * 1000;
  const mm = t.match(/(\d{4,5})\s?mm/);
  if (mm && Number(mm[1]) >= 1000 && Number(mm[1]) <= 30000) return Number(mm[1]);
  return null;
}
/** Pack size written into a description: "Box of 500", "500/box", "100pk". */
export function packFromText(s: string): number | null {
  const t = s.toLowerCase();
  const m = t.match(/(?:box|bx|pack|pkt|ctn|carton)\s*(?:of\s*)?(\d+)/) ?? t.match(/(\d+)\s*(?:\/\s*|per\s+)?(?:box|bx|pk|pack|pcs|pkt)\b/);
  return m ? Number(m[1]) : null;
}
/** Roll coverage in m² from "1350mm x 30m", "1.35 x 60m" or "81m2". */
export function rollAreaFromText(s: string): number | null {
  const t = s.toLowerCase().replace(/×/g, "x");
  const area = t.match(/(\d+(?:\.\d+)?)\s?(?:m2|m²|sqm)/);
  if (area) return Number(area[1]);
  const dims = t.match(/(\d+(?:\.\d+)?)\s*(mm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*m\b/);
  if (!dims) return null;
  let w = Number(dims[1]);
  if (dims[2] === "mm" || w > 10) w = w / 1000;
  const l = Number(dims[3]);
  return w > 0 && l > 0 ? round2(w * l) : null;
}

/** Cover widths confirmed from Lysaght specs (au_trade_practice_estimating.md). */
const PROFILE_COVER: { match: RegExp; profile: string; cover: number }[] = [
  { match: /custom\s*orb|corrugated/i, profile: "Custom Orb", cover: 762 },
  { match: /trimdek/i, profile: "Trimdek", cover: 762 },
  { match: /klip[\s-]*lok/i, profile: "Klip-Lok 700", cover: 700 },
];
export function profileFromText(s: string): { profile: string; cover: number } | null {
  const p = PROFILE_COVER.find((x) => x.match.test(s));
  return p ? { profile: p.profile, cover: p.cover } : null;
}

// ---------------------------------------------------------------------------
// Calc-key suggestion (wraps the shared vocabulary; generic words lose to specific ones)
// ---------------------------------------------------------------------------
const GENERIC_HINTS = new Set(["sheet", "roofing", "capping", "tile", "mesh", "vent", "clean", "paint", "membrane", "bin", "rail", "remove", "removal", "install", "foil"]);

/** Best calc key for a row: specific hints ("barge", "screw") beat generic ones ("capping", "roofing"). */
export function suggestRowCalcKey(row: { description: string; profile?: string | null; unit?: string | null }): string | null {
  const d = ` ${[row.description, row.profile].filter(Boolean).join(" ").toLowerCase()} `;
  let best: { key: string; score: number } | null = null;
  for (const k of CALC_KEYS) {
    for (const h of k.hints) {
      if (!d.includes(h)) continue;
      const score = h.length + (GENERIC_HINTS.has(h) ? 0 : 100);
      if (!best || score > best.score) best = { key: k.key, score };
    }
  }
  return best?.key ?? suggestCalcKey(row.description);
}

// ---------------------------------------------------------------------------
// Unit conversion: supplier unit → calculator unit
// ---------------------------------------------------------------------------
export type ConvertibleItem = {
  unit: string;
  cost_ex_gst: number;
  length_mm?: number | null;
  cover_width_mm?: number | null;
  pack_qty?: number | null;
};

/**
 * How many calculator units one supplier unit gives (null = can't convert). Cost per calc unit
 * = supplier cost ÷ factor. E.g. a 6.5 m sheet → 6.5 lm; a 1350 × 60 m roll → 81 m²; a box of 500 → 500 ea.
 */
export function calcUnitsPerSupplierUnit(item: ConvertibleItem, target: CalcUnit): number | null {
  const u = normaliseUnit(item.unit) ?? (item.unit as SheetUnit);
  const len = Number(item.length_mm) > 0 ? Number(item.length_mm) / 1000 : null;
  const cover = Number(item.cover_width_mm) > 0 ? Number(item.cover_width_mm) / 1000 : null;
  const pack = Number(item.pack_qty) > 0 ? Number(item.pack_qty) : null;
  if (u === target) return 1;
  switch (target) {
    case "lm":
      if ((u === "sheet" || u === "length") && len) return len;
      if (u === "m2" && cover) return 1 / cover;
      return null;
    case "m2":
      if (u === "lm" && cover) return cover;
      if ((u === "sheet" || u === "length") && len && cover) return len * cover;
      if ((u === "roll" || u === "box") && pack) return pack;
      return null;
    case "ea":
      if (u === "box" && pack) return pack;
      if (u === "length" || u === "sheet") return 1;
      return null;
    case "bag":
    case "job":
      return u === "ea" ? 1 : null;
    default:
      return null;
  }
}

export function costPerCalcUnit(item: ConvertibleItem, target: CalcUnit): number | null {
  const f = calcUnitsPerSupplierUnit(item, target);
  if (!f) return null;
  return Number(item.cost_ex_gst) / f;
}

/** Why a mapped row can't be priced in its calc key's unit (null when fine). */
export function conversionProblem(item: ConvertibleItem, calcKey: string | null): string | null {
  if (!calcKey) return null;
  const def = CALC_KEY_MAP[calcKey];
  if (!def) return `Unknown estimating item "${calcKey}".`;
  if (calcUnitsPerSupplierUnit(item, def.unit) !== null) return null;
  const u = normaliseUnit(item.unit) ?? item.unit;
  if ((u === "sheet" || u === "length") && def.unit === "lm") return "Needs a sheet/stock length to price per lm.";
  if (u === "m2" && def.unit === "lm") return "Needs a cover width to price per lm.";
  if ((u === "roll" || u === "box") && def.unit === "m2") return "Needs m² per roll/box (pack qty).";
  if (u === "box" && def.unit === "ea") return "Needs the pack quantity.";
  return `Sold ${SHEET_UNIT_LABEL[u as SheetUnit] ?? u}, but "${def.label}" is priced per ${UNIT_SHORT[def.unit] ?? def.unit}.`;
}

/** Sell price inc GST from a cost ex GST and a markup %, rounded to cents (contract 1). */
export function sellIncGst(costEx: number, markupPct: number): number {
  return round2(costEx * (1 + (Number(markupPct) || 0) / 100) * 1.1);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export type ParsedRow = {
  line: number;
  product_code: string | null;
  description: string;
  profile: string | null;
  finish: string | null;
  thickness_mm: number | null;
  cover_width_mm: number | null;
  girth_mm: number | null;
  length_mm: number | null;
  unit: SheetUnit | null;
  unit_raw: string;
  pack_qty: number | null;
  price: number | null;
  cost_ex_gst: number | null;
  calc_key: string | null;
  errors: string[];
  warnings: string[];
  raw: Record<string, string>;
};

export type BuildOptions = { pricesIncludeGst: boolean; defaultUnit?: SheetUnit };

const cellAt = (r: string[], i: number | undefined) => (i === undefined || i < 0 ? "" : (r[i] ?? "").trim());

/** Turn sheet rows (after the header) into validated, normalised price rows. */
export function buildRows(rows: string[][], headerIdx: number, mapping: ColumnMapping, opts: BuildOptions): ParsedRow[] {
  const header = rows[headerIdx] ?? [];
  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (f: ImportField) => cellAt(r, mapping[f]);
    const raw: Record<string, string> = {};
    header.forEach((h, n) => { if (r[n]) raw[h || `col${n + 1}`] = r[n]; });
    out.push(normaliseRow({
      line: i + 1,
      product_code: get("product_code"), description: get("description"), profile: get("profile"), finish: get("finish"),
      thickness: get("thickness_mm"), cover: get("cover_width_mm"), girth: get("girth_mm"), length: get("length_mm"),
      unit: get("unit"), pack: get("pack_qty"), price: get("price"), raw,
    }, opts));
  }
  return out;
}

export type RowInput = {
  line: number; product_code?: string; description?: string; profile?: string; finish?: string; thickness?: string; cover?: string;
  girth?: string; length?: string; unit?: string; pack?: string; price?: string; raw?: Record<string, string>;
};

export function normaliseRow(x: RowInput, opts: BuildOptions): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const description = (x.description ?? "").replace(/\s+/g, " ").trim();
  const text = `${description} ${x.profile ?? ""}`;
  if (!description) errors.push("Missing description.");

  const price = parsePrice(x.price);
  if (price === null) errors.push(x.price ? `Price "${x.price}" isn't a number.` : "Missing price.");
  else if (price < 0) errors.push("Price can't be negative.");

  let unit = normaliseUnit(x.unit);
  if (!unit && x.unit) errors.push(`Unknown unit "${x.unit}".`);
  if (!unit && !x.unit) { unit = opts.defaultUnit ?? "ea"; if (!opts.defaultUnit) warnings.push("No unit given — treated as each."); }

  let profile = x.profile?.trim() || null;
  let cover = parseNumber(x.cover);
  const guess = profileFromText(text);
  if (!profile && guess) profile = guess.profile;
  if (!cover && guess) cover = guess.cover;

  let length = parseLengthMm(x.length);
  if (!length && (unit === "sheet" || unit === "length")) length = lengthFromText(description);
  if ((unit === "sheet" || unit === "length") && !length) warnings.push("No length — can't convert to per lm.");

  let pack = parseNumber(x.pack);
  if (!pack && unit === "box") pack = packFromText(description);
  if (!pack && unit === "roll") pack = rollAreaFromText(description);
  if (unit === "box" && !pack) warnings.push("No pack quantity.");
  if (unit === "roll" && !pack) warnings.push("No roll coverage (m²).");

  const thickness = parseNumber(x.thickness);
  const cost = price === null || price < 0 ? null : round2(opts.pricesIncludeGst ? price / 1.1 : price);
  const row: ParsedRow = {
    line: x.line,
    product_code: x.product_code?.trim() || null,
    description,
    profile,
    finish: x.finish?.trim() || null,
    thickness_mm: thickness !== null && thickness > 0 && thickness < 10 ? thickness : null,
    cover_width_mm: cover && cover > 0 ? cover : null,
    girth_mm: parseNumber(x.girth),
    length_mm: length,
    unit,
    unit_raw: x.unit ?? "",
    pack_qty: pack && pack > 0 ? pack : null,
    price,
    cost_ex_gst: cost,
    calc_key: null,
    errors,
    warnings,
    raw: x.raw ?? {},
  };
  row.calc_key = description ? suggestRowCalcKey({ description, profile, unit }) : null;
  return row;
}

/** Problems that stop a row priced against its (current) calc key. */
export function rowIssues(row: ParsedRow): string[] {
  const issues = [...row.errors];
  if (!row.errors.length && row.unit && row.cost_ex_gst !== null) {
    const p = conversionProblem({ unit: row.unit, cost_ex_gst: row.cost_ex_gst, length_mm: row.length_mm, cover_width_mm: row.cover_width_mm, pack_qty: row.pack_qty }, row.calc_key);
    if (p) issues.push(p);
  }
  return issues;
}

/** Bulk mapping: every row whose description/profile/code contains `needle` → `calcKey`. */
export function bulkMap<T extends { description: string; profile?: string | null; product_code?: string | null; calc_key: string | null }>(rows: T[], needle: string, calcKey: string | null): { rows: T[]; changed: number } {
  const n = needle.trim().toLowerCase();
  if (!n) return { rows, changed: 0 };
  let changed = 0;
  const next = rows.map((r) => {
    const hay = `${r.description} ${r.profile ?? ""} ${r.product_code ?? ""}`.toLowerCase();
    if (!hay.includes(n) || r.calc_key === calcKey) return r;
    changed++;
    return { ...r, calc_key: calcKey };
  });
  return { rows: next, changed };
}

/** Sample template offered for download on the import screen (illustrative rows, NOT real prices). */
export const TEMPLATE_CSV = [
  "Product code,Description,Profile,Finish,BMT,Cover width mm,Girth mm,Length,Unit,Pack qty,Price ex GST",
  "CO42-MON,Custom Orb 0.42 COLORBOND Monument,Custom Orb,COLORBOND Monument,0.42,762,,,LM,,0.00",
  "TD48-ZINC,Trimdek 0.48 ZINCALUME 6.5m sheet,Trimdek,ZINCALUME,0.48,762,,6500,SHEET,,0.00",
  "RC-ROLLTOP,Roll top ridge capping COLORBOND,,COLORBOND Monument,,,,,LM,,0.00",
  "BARGE-180,Barge capping 180 girth,,COLORBOND Monument,,,180,,LM,,0.00",
  "QG115-6.5,Quad gutter 115mm 6.5m length,,COLORBOND Monument,,,,6.5,LENGTH,,0.00",
  "DP90-RND,Downpipe 90mm round 3m,,COLORBOND Monument,,,,3,LENGTH,,0.00",
  "SCR-12-14x45,Roofing screw 12-14x45 hex head,,,,,,,BOX,500,0.00",
  "SARK-1350x60,Sarking 1350mm x 60m,,,,,,,ROLL,81,0.00",
].join("\n") + "\n";
