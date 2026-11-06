// Carrier vs contractor scope comparison (paste / CSV import, line-item diff, missed-item flags).
// Native Xactimate ESX import needs a Verisk partnership; this works from pasted spreadsheet rows or CSV.
import { CODE_CITATIONS } from "./claims";

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
const UNITS = ["SQ", "LF", "SF", "EA", "SY", "HR", "CY", "BX", "RL", "BNDL", "BUNDLE", "ROLL", "PIECE", "PC", "SHEET", "SH", "DA", "MO", "WK", "LS", "BOX"];

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
  ["unit_price", /^(unit\s*(price|cost)|price|rate|replace|unit\$|each)$/],
  ["total", /^(total|rcv|amount|ext(ended)?(\s*(price|amount))?|line\s*total|replacement\s*cost)$/],
  ["quantity", /^(qty|quantity|quan|count)$/],
  ["unit", /^(unit|units|uom|u\/m)$/],
  ["code", /^(code|xact(imate)?\s*code|cat\s*\/?\s*sel|selector|sel|item\s*code|line\s*code|cat)$/],
  ["description", /^(description|desc|item|line\s*item|item\s*description|activity)$/],
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

/** "22.67 SQ" -> { qty: 22.67, unit: "SQ" } */
function qtyWithUnit(v: string): { qty: number; unit: string | null } {
  const m = v.trim().match(/^([\d,]*\.?\d+)\s*([A-Za-z]{1,6})?$/);
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
  return { xact_code: code?.trim() ? code.trim().toUpperCase() : null, description: desc.slice(0, 500), quantity: r(q), unit: (unit || "EA").toUpperCase().slice(0, 12), unit_price: r(p), total: r(t) };
}

/** Whitespace-only line, as copied from an Xactimate PDF: "1. Drip edge 180.00 LF 2.85 0.00 513.00" */
function parseLoose(line: string): ScopeLine | null {
  const unitRe = UNITS.join("|");
  const m = line.match(new RegExp(`^(.*?)\\s+([\\d,]*\\.?\\d+)\\s*(${unitRe})\\b\\s*(.*)$`, "i"));
  if (!m) return null;
  let desc = m[1];
  let code: string | null = null;
  const cm = desc.match(/^\s*(?:\d+\.\s+)?([A-Z]{2,4}\s+[A-Z0-9+&<>-]{2,10})\s+-?\s*(.*)$/);
  if (cm && cm[2] && /[a-z]/.test(cm[2])) { code = cm[1]; desc = cm[2]; }
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
    if (line && !/^(total|subtotal|grand total|line item totals?)/i.test(line.description)) lines.push(line);
    else skipped++;
  }
  return { lines, skipped };
}

// ---------------------------------------------------------------------------
// Classification of common roof items
// ---------------------------------------------------------------------------
export type ItemKey =
  | "o_and_p" | "permit" | "code_upgrade" | "ice_water" | "drip_edge" | "starter" | "ridge_vent" | "ridge_cap"
  | "step_flashing" | "counter_flashing" | "valley" | "pipe_boot" | "steep" | "high" | "decking" | "dumpster"
  | "tearoff" | "underlayment" | "shingles";

const RULES: [ItemKey, RegExp, RegExp?][] = [
  ["o_and_p", /overhead|\bo\s*&\s*p\b|\bo\s*and\s*p\b|profit/i],
  ["permit", /permit/i],
  ["code_upgrade", /code\s*(upgrade|item|requirement)/i],
  ["ice_water", /ice\s*(&|and)?\s*water|ice\s*barrier|\bi\s*&\s*w\b|self[- ]adher/i, /IWS|I&W/],
  ["drip_edge", /drip\s*edge|\bdrip\b|gutter\s*apron/i, /DRIP/],
  ["starter", /starter/i, /STRT|ASTR|STARTER/],
  ["ridge_vent", /ridge\s*vent/i, /RIDGV|RVNT/],
  ["ridge_cap", /(hip|ridge)\b[^,;]{0,15}\bcap|ridge\s*cap|hip\s*cap|hip\s*(&|and|\/)\s*ridge/i, /RIDGC|HIPC|RDGC/],
  ["step_flashing", /step\s*flash/i, /STEP/],
  ["counter_flashing", /counter\s*-?\s*flash|apron\s*flash|chimney\s*flash|base\s*flash|headwall/i, /CNTR|CHMF/],
  ["valley", /valley/i, /VMTL|VALL/],
  ["pipe_boot", /pipe\s*(boot|jack|flash)|vent\s*boot|flashing\s*-\s*pipe|roof\s*jack/i, /PJ|PIPE/],
  ["steep", /steep/i, /STEEP/],
  ["high", /high\s*roof|two[- ]?stor|2[- ]?stor|\bhigh\b.*charge|charge.*\bhigh\b/i, /HIGH/],
  ["decking", /decking|\bdeck\b|sheathing|\bosb\b|plywood/i, /SHTG|DECK|OSB|PLY/],
  ["dumpster", /dumpster|haul|debris|disposal/i, /DMO|DUMP/],
  ["tearoff", /tear[- ]?off|^remove\b|removal/i],
  ["underlayment", /underlay|felt|synthetic/i, /FELT|SYNF/],
  ["shingles", /shingle|laminated|comp\.?\s*shingle|3[- ]tab/i, /^RFG\s*\d/],
];

export function classify(code: string | null | undefined, description: string): ItemKey | null {
  for (const [key, re, codeRe] of RULES) {
    if (re.test(description)) return key;
    if (codeRe && code && codeRe.test(code.toUpperCase())) return key;
  }
  return null;
}

export const ITEM_LABEL: Record<ItemKey, string> = {
  o_and_p: "Overhead & profit",
  permit: "Permit",
  code_upgrade: "Code upgrade",
  ice_water: "Ice & water shield",
  drip_edge: "Drip edge",
  starter: "Starter course",
  ridge_vent: "Ridge vent",
  ridge_cap: "Hip & ridge cap",
  step_flashing: "Step flashing",
  counter_flashing: "Counter / apron flashing",
  valley: "Valley",
  pipe_boot: "Pipe boots",
  steep: "Steep charge",
  high: "High roof charge",
  decking: "Decking / sheathing",
  dumpster: "Dumpster / haul-off",
  tearoff: "Tear-off",
  underlayment: "Underlayment",
  shingles: "Shingles",
};

/** Items carriers most often leave out of roof scopes. */
export const COMMONLY_MISSED: ItemKey[] = ["drip_edge", "starter", "ridge_cap", "ice_water", "step_flashing", "counter_flashing", "steep", "high", "o_and_p", "permit", "code_upgrade", "decking"];
/** Of those, the ones worth asking about even if neither scope lists them. */
const ALWAYS_ASK: ItemKey[] = ["drip_edge", "starter", "ridge_cap", "ice_water", "o_and_p"];

const JUSTIFY: Partial<Record<ItemKey, string>> = {
  drip_edge: "Drip edge is required at eaves and rakes and was not included in the carrier scope.",
  starter: "A starter course is required by the shingle manufacturer at eaves and rakes; it is not part of the field shingle waste allowance.",
  ridge_cap: "Hip and ridge cap shingles are a separate item from field shingles and must be installed per manufacturer instructions.",
  ice_water: "Ice barrier is required at the eaves in this area and was not included.",
  step_flashing: "Existing step flashing cannot be reused when the shingles are replaced.",
  counter_flashing: "Counter/apron flashing must be replaced to make the roof watertight.",
  steep: "Roof slopes 7/12 and steeper need extra labor and safety equipment.",
  high: "Two-story / high roof work needs extra labor and safety equipment.",
  o_and_p: "This job needs a general contractor to coordinate multiple trades; overhead and profit (customarily 10% + 10%) applies.",
  permit: "A building permit is required for this re-roof.",
  code_upgrade: "Local code requires this item as part of the replacement.",
  decking: "Damaged or spaced decking must be replaced to provide solid sheathing.",
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
        ? { key: r.key, label: lbl, kind: "missing", message: `${lbl} is in your scope but not in the carrier's.`, row: r }
        : { key: r.key, label: lbl, kind: "short", message: `Carrier has ${r.carrier!.quantity} ${r.carrier!.unit} of ${lbl.toLowerCase()}; you measured ${r.contractor!.quantity} ${r.contractor!.unit}.`, row: r },
    );
  }
  const carrierKeys = new Set(cKeys.filter(Boolean));
  const contractorKeys = new Set(rows.filter((r) => r.contractor).map((r) => r.key).filter(Boolean));
  if (carrier.length) {
    for (const k of ALWAYS_ASK) {
      if (!carrierKeys.has(k) && !contractorKeys.has(k)) {
        flags.push({ key: k, label: ITEM_LABEL[k], kind: "check", message: `${ITEM_LABEL[k]} is on neither scope. Confirm whether this roof needs it.` });
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

/** Turn flagged diff rows into supplement line items (missing = full qty, short = the difference). */
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
      code_citation: CODE_CITATIONS[f.key] ?? null,
      justification:
        f.kind === "short"
          ? `Carrier scope includes ${r.carrier!.quantity} ${r.carrier!.unit}; measured quantity is ${r.contractor.quantity} ${r.contractor.unit}. Requesting the difference.`
          : JUSTIFY[f.key] ?? null,
    });
  }
  return out;
}
