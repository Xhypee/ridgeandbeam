// Insurer vs contractor scope comparison (paste / CSV import, line-item diff, missed-item flags).
// Australian insurer scopes of works usually arrive as PDFs: copy the line items and paste them,
// or export a spreadsheet to CSV. Field "xact_code" (DB column name) holds an optional item code.
import { STANDARD_REFS } from "./claims";

export type ScopeLine = {
  xact_code: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
const UNITS = ["M2", "SQM", "M²", "LM", "LIN", "M", "EA", "NO", "ITEM", "ITM", "HR", "HRS", "DAY", "DAYS", "LS", "ROLL", "ROLLS", "SHEET", "SHEETS", "SH", "BOX", "LOT", "WK", "M3"];

export function parseMoney(v: string | null | undefined): number {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "").replace(/^<|>$/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

/** Split one CSV line honoring double quotes. */
function splitCsv(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

type Col = "code" | "description" | "quantity" | "unit" | "unit_price" | "total";
const HEADER_ALIASES: [Col, RegExp][] = [
  ["unit_price", /^(unit\s*(price|cost)|price|rate|unit\$|each|rate\s*inc(l)?\.?\s*gst|rate\s*ex\.?\s*gst)$/],
  ["total", /^(total|amount|ext(ended)?(\s*(price|amount))?|line\s*total|total\s*inc(l)?\.?\s*gst|total\s*ex\.?\s*gst|cost)$/],
  ["quantity", /^(qty|quantity|quan|count)$/],
  ["unit", /^(unit|units|uom|u\/m)$/],
  ["code", /^(code|item\s*code|line\s*code|item\s*no|ref)$/],
  ["description", /^(description|desc|item|line\s*item|item\s*description|activity|scope|works?)$/],
];

function headerMap(cells: string[]): Partial<Record<Col, number>> | null {
  const map: Partial<Record<Col, number>> = {};
  cells.forEach((raw, i) => {
    const c = raw.toLowerCase().replace(/[.:#]/g, "").replace(/\s+/g, " ").trim();
    for (const [col, re] of HEADER_ALIASES) {
      if (map[col] === undefined && re.test(c)) { map[col] = i; break; }
    }
  });
  return map.description !== undefined && (map.quantity !== undefined || map.total !== undefined) ? map : null;
}

/** "120.5 m2" -> { qty: 120.5, unit: "M2" } */
function qtyWithUnit(v: string): { qty: number; unit: string | null } {
  const m = v.trim().match(/^([\d,]*\.?\d+)\s*([A-Za-z²0-9]{1,6})?$/);
  if (!m) return { qty: parseMoney(v), unit: null };
  return { qty: parseMoney(m[1]), unit: m[2] ? m[2].toUpperCase() : null };
}

const cleanDesc = (s: string) => s.replace(/^\s*\d+\.\s+/, "").replace(/\s+/g, " ").trim();

function finish(code: string | null, description: string, qty: number, unit: string | null, price: number, total: number): ScopeLine | null {
  const desc = cleanDesc(description);
  if (!desc) return null;
  let q = Number.isFinite(qty) ? qty : NaN;
  let p = Number.isFinite(price) ? price : NaN;
  let t = Number.isFinite(total) ? total : NaN;
  if (!Number.isFinite(q) && Number.isFinite(p) && Number.isFinite(t) && p !== 0) q = t / p;
  if (!Number.isFinite(q)) q = Number.isFinite(t) ? 1 : 0;
  if (!Number.isFinite(p) && Number.isFinite(t) && q !== 0) p = t / q;
  if (!Number.isFinite(p)) p = 0;
  if (!Number.isFinite(t)) t = q * p;
  const r = (n: number) => Math.round(n * 100) / 100;
  const u = (unit || "EA").toUpperCase().replace("SQM", "M2").replace("M²", "M2").replace(/^LIN$/, "LM").slice(0, 12);
  return { xact_code: code?.trim() ? code.trim().toUpperCase() : null, description: desc.slice(0, 500), quantity: r(q), unit: u, unit_price: r(p), total: r(t) };
}

/** Whitespace-only line, as copied from an insurer's PDF scope: "3. Replace valley iron 12.00 LM 38.50 462.00" */
function parseLoose(line: string): ScopeLine | null {
  const unitRe = UNITS.join("|");
  const m = line.match(new RegExp(`^(.*?)\\s+([\\d,]*\\.?\\d+)\\s*(${unitRe})(?![A-Za-z0-9])\\s*(.*)$`, "i"));
  if (!m) return null;
  const desc = m[1];
  const code: string | null = null;
  const nums = m[4].split(/\s+/).map(parseMoney).filter((n) => Number.isFinite(n));
  const qty = parseMoney(m[2]);
  const price = nums[0] ?? NaN;
  return finish(code, desc, qty, m[3], price, Number.isFinite(price) ? qty * price : NaN);
}

/**
 * Parse pasted spreadsheet rows (tab-separated), CSV/semicolon text, or loose lines.
 * Columns (any order with a header row): code, description, qty, unit, unit price, total.
 * Without a header: [code,] description, qty, unit, unit price, total.
 */
export function parseScope(text: string): { lines: ScopeLine[]; skipped: number } {
  const rows = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!rows.length) return { lines: [], skipped: 0 };
  const delim = rows.some((r) => r.includes("\t")) ? "\t" : rows.filter((r) => r.includes(";")).length > rows.filter((r) => r.includes(",")).length ? ";" : ",";
  const lines: ScopeLine[] = [];
  let skipped = 0;
  let map: Partial<Record<Col, number>> | null = null;

  for (const row of rows) {
    const cells = splitCsv(row, delim);
    if (!map) {
      const h = headerMap(cells);
      if (h) { map = h; continue; }
    }
    let line: ScopeLine | null = null;
    if (cells.length < 3) {
      line = parseLoose(row);
    } else if (map) {
      const g = (c: Col) => (map![c] !== undefined ? cells[map![c]!] ?? "" : "");
      const qu = qtyWithUnit(g("quantity"));
      line = finish(g("code") || null, g("description"), qu.qty, g("unit") || qu.unit, parseMoney(g("unit_price")), parseMoney(g("total")));
    } else {
      // No header: find the first numeric cell; everything before it is [code,] description.
      const firstNum = cells.findIndex((c, i) => i > 0 && Number.isFinite(qtyWithUnit(c).qty));
      if (firstNum < 1) { skipped++; continue; }
      const lead = cells.slice(0, firstNum);
      const code = lead.length >= 2 ? lead[0] : null;
      const desc = lead.length >= 2 ? lead.slice(1).join(" ") : lead[0];
      const qu = qtyWithUnit(cells[firstNum]);
      let i = firstNum + 1;
      let unit = qu.unit;
      if (!unit && cells[i] !== undefined && !Number.isFinite(parseMoney(cells[i]))) { unit = cells[i]; i++; }
      const nums = cells.slice(i).map(parseMoney).filter((n) => Number.isFinite(n));
      line = finish(code, desc, qu.qty, unit, nums[0] ?? NaN, nums.length > 1 ? nums[1] : NaN);
    }
    if (line && !/^(total|sub-?total|grand total|gst\b|total inc|line item totals?)/i.test(line.description)) lines.push(line);
    else skipped++;
  }
  return { lines, skipped };
}

// ---------------------------------------------------------------------------
// Classification of common Australian roof items
// ---------------------------------------------------------------------------
export type ItemKey =
  | "builders_margin" | "make_safe" | "edge_protection" | "skip_bin" | "asbestos" | "remove"
  | "sarking" | "safety_mesh" | "battens" | "ridge_capping" | "hip_capping" | "barge" | "valley" | "flashing"
  | "gutters" | "downpipes" | "fascia" | "rebed_repoint" | "tiles" | "sheeting" | "whirlybird" | "insulation";

const RULES: [ItemKey, RegExp][] = [
  ["builders_margin", /builder'?s?\s*margin|margin\s*(&|and)\s*supervision|supervision|overheads?|profit|\bpreliminar/i],
  ["make_safe", /make[- ]?safe|tarp|temporary\s*(repair|cover)|emergency\s*repair/i],
  ["edge_protection", /edge\s*protection|scaffold|safety\s*rail|harness|fall\s*(arrest|protection)|\bewp\b|elevated\s*work\s*platform/i],
  ["skip_bin", /skip|rubbish|disposal|tip\s*fee|cart(age)?\s*away|waste\s*removal/i],
  ["asbestos", /asbestos|\bacm\b|fibro\s*removal/i],
  ["safety_mesh", /safety\s*mesh|roof\s*mesh/i],
  ["sarking", /sarking|anticon|insulation\s*blanket\s*&\s*sarking|pliable\s*membrane|reflective\s*foil|wall\s*wrap/i],
  ["insulation", /insulation|anticon|blanket/i],
  ["battens", /batten/i],
  ["ridge_capping", /ridge\s*cap|ridge\s*capping|ridge\s*roll|\bridge\b/i],
  ["hip_capping", /hip\s*cap|hip\s*capping|\bhips?\b/i],
  ["barge", /barge|verge|gable\s*(trim|cap)/i],
  ["valley", /valley/i],
  ["flashing", /flashing|apron|counter\s*flash|wall\s*flash|soaker|dektite|pipe\s*(boot|flash)|penetration/i],
  ["downpipes", /downpipe|down\s*pipe|\bdp\b|rainwater\s*head|stormwater/i],
  ["gutters", /gutter|quad|half\s*round|box\s*gutter|spouting/i],
  ["fascia", /fascia/i],
  ["rebed_repoint", /re-?bed|re-?point|pointing|bedding|mortar/i],
  ["whirlybird", /whirly|roof\s*vent|ventilator|exhaust\s*vent/i],
  ["tiles", /\btiles?\b|terracotta|concrete\s*tile|monier|bristile/i],
  ["sheeting", /sheet(ing)?|colorbond|zincalume|corrugated|custom\s*orb|trimdek|klip-?lok|metal\s*roof|re-?roof/i],
  ["remove", /^remove\b|removal|strip\s*(off|existing)|demolish/i],
];

export function classify(_code: string | null | undefined, description: string): ItemKey | null {
  for (const [key, re] of RULES) if (re.test(description)) return key;
  return null;
}

export const ITEM_LABEL: Record<ItemKey, string> = {
  builders_margin: "Builder's margin / supervision",
  make_safe: "Make-safe / tarp",
  edge_protection: "Edge protection / scaffold",
  skip_bin: "Skip bin / disposal",
  asbestos: "Asbestos removal",
  remove: "Strip existing roof",
  sarking: "Sarking",
  safety_mesh: "Safety mesh",
  battens: "Battens",
  ridge_capping: "Ridge capping",
  hip_capping: "Hip capping",
  barge: "Barge flashing / capping",
  valley: "Valley iron",
  flashing: "Flashings",
  gutters: "Gutters",
  downpipes: "Downpipes",
  fascia: "Fascia",
  rebed_repoint: "Rebed & repoint",
  tiles: "Roof tiles",
  sheeting: "Roof sheeting",
  whirlybird: "Whirlybird / roof vent",
  insulation: "Insulation",
};

/** Items insurer scopes most often leave out or under-measure on roof claims. */
export const COMMONLY_MISSED: ItemKey[] = ["edge_protection", "skip_bin", "sarking", "safety_mesh", "ridge_capping", "hip_capping", "barge", "valley", "flashing", "builders_margin", "make_safe"];
/** Of those, the ones worth asking about even if neither scope lists them. */
const ALWAYS_ASK: ItemKey[] = ["edge_protection", "skip_bin", "sarking", "flashing"];

const REF: Partial<Record<ItemKey, string>> = {
  sarking: STANDARD_REFS.sarking,
  safety_mesh: STANDARD_REFS.sheet_roof,
  ridge_capping: STANDARD_REFS.sheet_roof,
  hip_capping: STANDARD_REFS.sheet_roof,
  barge: STANDARD_REFS.sheet_roof,
  valley: STANDARD_REFS.sheet_roof,
  flashing: STANDARD_REFS.sheet_roof,
  gutters: STANDARD_REFS.gutters,
  downpipes: STANDARD_REFS.gutters,
  rebed_repoint: STANDARD_REFS.tiles,
  tiles: STANDARD_REFS.tiles,
  edge_protection: STANDARD_REFS.edge_protection,
  asbestos: STANDARD_REFS.asbestos,
};

const JUSTIFY: Partial<Record<ItemKey, string>> = {
  edge_protection: "Edge protection is needed to work safely at the roof edge and was not included in the insurer's scope.",
  skip_bin: "The stripped roof material has to be removed from site; a skip bin / disposal was not included.",
  sarking: "Sarking must be replaced where the roof sheets are replaced; it cannot be reused once disturbed.",
  safety_mesh: "Safety mesh is required under new metal roof sheeting and was not included.",
  ridge_capping: "Ridge capping is a separate item from the roof sheets/tiles and was not included or was short.",
  hip_capping: "Hip capping is a separate item from the roof sheets/tiles and was not included or was short.",
  barge: "Barge flashings/capping must be replaced with the roof cladding to keep the roof weathertight.",
  valley: "Valley irons must be replaced with the roof cladding to keep the roof weathertight.",
  flashing: "Existing flashings cannot be reused with the new roof cladding and must be replaced to keep the roof weathertight.",
  builders_margin: "The work needs supervision and coordination of more than one trade; a builder's margin applies.",
  make_safe: "Emergency make-safe work (tarping) was carried out to prevent further water damage.",
};

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------
export type DiffStatus = "matched" | "qty_differs" | "missing_from_carrier" | "extra";
export type DiffRow = {
  status: DiffStatus;
  key: ItemKey | null;
  carrier: ScopeLine | null;
  contractor: ScopeLine | null;
  /** contractor total - carrier total */
  delta: number;
  flag: "missing" | "short" | null;
};
export type ScopeFlag = { key: ItemKey; label: string; kind: "missing" | "short" | "check"; message: string; row?: DiffRow };

const normCode = (c: string | null | undefined) => (c ?? "").toUpperCase().replace(/[^A-Z0-9&+<>]/g, "");
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !["and", "the", "with", "per", "for", "w/out"].includes(t)));
function jaccard(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function diffScopes(carrier: ScopeLine[], contractor: ScopeLine[]): { rows: DiffRow[]; flags: ScopeFlag[]; totals: { carrier: number; contractor: number; delta: number } } {
  const used = new Set<number>();
  const cKeys = carrier.map((l) => classify(l.xact_code, l.description));
  const rows: DiffRow[] = [];

  const pick = (pred: (i: number) => boolean) => {
    for (let i = 0; i < carrier.length; i++) if (!used.has(i) && pred(i)) { used.add(i); return i; }
    return -1;
  };

  for (const line of contractor) {
    const key = classify(line.xact_code, line.description);
    const code = normCode(line.xact_code);
    let idx = code ? pick((i) => normCode(carrier[i].xact_code) === code) : -1;
    if (idx < 0 && key) idx = pick((i) => cKeys[i] === key);
    if (idx < 0) idx = pick((i) => jaccard(carrier[i].description, line.description) >= 0.6);
    if (idx < 0) {
      rows.push({ status: "missing_from_carrier", key, carrier: null, contractor: line, delta: line.total, flag: key && COMMONLY_MISSED.includes(key) ? "missing" : null });
      continue;
    }
    const c = carrier[idx];
    const tol = Math.max(0.01, Math.abs(line.quantity) * 0.02);
    const same = Math.abs(c.quantity - line.quantity) <= tol || c.unit !== line.unit;
    const k = key ?? cKeys[idx];
    rows.push({
      status: same ? "matched" : "qty_differs",
      key: k,
      carrier: c,
      contractor: line,
      delta: Math.round((line.total - c.total) * 100) / 100,
      flag: !same && c.quantity < line.quantity && k && COMMONLY_MISSED.includes(k) ? "short" : null,
    });
  }
  carrier.forEach((c, i) => {
    if (!used.has(i)) rows.push({ status: "extra", key: cKeys[i], carrier: c, contractor: null, delta: -c.total, flag: null });
  });

  const flags: ScopeFlag[] = [];
  for (const r of rows) {
    if (!r.flag || !r.key) continue;
    const lbl = ITEM_LABEL[r.key];
    flags.push(
      r.flag === "missing"
        ? { key: r.key, label: lbl, kind: "missing", message: `${lbl} is in your scope but not in the insurer's.`, row: r }
        : { key: r.key, label: lbl, kind: "short", message: `Insurer has ${r.carrier!.quantity} ${r.carrier!.unit} of ${lbl.toLowerCase()}; you measured ${r.contractor!.quantity} ${r.contractor!.unit}.`, row: r },
    );
  }
  const carrierKeys = new Set(cKeys.filter(Boolean));
  const contractorKeys = new Set(rows.filter((r) => r.contractor).map((r) => r.key).filter(Boolean));
  if (carrier.length) {
    for (const k of ALWAYS_ASK) {
      if (!carrierKeys.has(k) && !contractorKeys.has(k)) {
        flags.push({ key: k, label: ITEM_LABEL[k], kind: "check", message: `Neither scope includes ${ITEM_LABEL[k].toLowerCase()}. Confirm whether this roof needs it.` });
      }
    }
  }
  const sum = (ls: ScopeLine[]) => Math.round(ls.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const tc = sum(carrier), tk = sum(contractor);
  return { rows, flags, totals: { carrier: tc, contractor: tk, delta: Math.round((tk - tc) * 100) / 100 } };
}

export type SupplementDraftItem = {
  description: string;
  xact_code: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  code_citation: string | null;
  justification: string | null;
};

/** Turn flagged diff rows into variation-request line items (missing = full qty, short = the difference). */
export function flaggedToSupplementItems(flags: ScopeFlag[]): SupplementDraftItem[] {
  const out: SupplementDraftItem[] = [];
  for (const f of flags) {
    const r = f.row;
    if (!r || !r.contractor) continue;
    const qty = f.kind === "short" ? Math.round((r.contractor.quantity - (r.carrier?.quantity ?? 0)) * 100) / 100 : r.contractor.quantity;
    if (!(qty > 0)) continue;
    const price = r.contractor.unit_price || r.carrier?.unit_price || 0;
    out.push({
      description: r.carrier?.description ?? r.contractor.description,
      xact_code: r.carrier?.xact_code ?? r.contractor.xact_code,
      quantity: qty,
      unit: r.contractor.unit,
      unit_price: price,
      code_citation: REF[f.key] ?? null,
      justification:
        f.kind === "short"
          ? `Insurer's scope includes ${r.carrier!.quantity} ${r.carrier!.unit}; measured quantity is ${r.contractor.quantity} ${r.contractor.unit}. Requesting the difference.`
          : JUSTIFY[f.key] ?? null,
    });
  }
  return out;
}
