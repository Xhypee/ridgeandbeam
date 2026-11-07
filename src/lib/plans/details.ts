// Job details read off the plans' text (title blocks, notes): site address, client, lot & plan, council, designer,
// drawing issue/date, building type, storeys, roof material, downpipes, eaves. Deterministic and pure; an optional
// AI pass (server) can fill gaps and is merged with mergeDetails().

import { stateFromPostcode, asAuState } from "../au";
import type { VText } from "./pdf";

export const DETAIL_KEYS = [
  "street", "suburb", "state", "postcode", "client", "lot", "council", "designer", "drawingDate", "drawingIssue",
  "buildingType", "storeys", "roofMaterial", "pitch", "downpipes", "eaveOverhang",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];
export const DETAIL_LABEL: Record<DetailKey, string> = {
  street: "Street address", suburb: "Suburb", state: "State", postcode: "Postcode", client: "Client / builder", lot: "Lot & plan",
  council: "Council", designer: "Designer / drafter", drawingDate: "Drawing date", drawingIssue: "Drawing issue",
  buildingType: "Building", storeys: "Storeys", roofMaterial: "Roof material", pitch: "Roof pitch", downpipes: "Downpipes", eaveOverhang: "Eave overhang",
};
export type Found = { key: DetailKey; value: string; page: number; via: "plans" | "ai" };
export type PageText = { index: number; texts: VText[] };

// ---------------------------------------------------------------------------
// Text lines (title blocks are often rotated 90°, so lines are built in each text run's own frame)
// ---------------------------------------------------------------------------
export type Line = { text: string; u0: number; u1: number; v: number; size: number; angle: number; page: number };

export function buildLines(page: PageText): Line[] {
  const groups = new Map<number, VText[]>();
  for (const t of page.texts) {
    const a = Math.round(t.angle / 5) * 5;
    groups.set(a, [...(groups.get(a) ?? []), t]);
  }
  const lines: Line[] = [];
  for (const [angle, ts] of groups) {
    const r = (angle * Math.PI) / 180;
    const dir = [Math.cos(r), Math.sin(r)], down = [-Math.sin(r), Math.cos(r)];
    const items = ts.map((t) => ({ t, u: t.x * dir[0] + t.y * dir[1], v: t.x * down[0] + t.y * down[1] })).sort((p, q) => p.v - q.v || p.u - q.u);
    const used = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const row = [items[i]];
      used.add(i);
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(items[j].v - items[i].v) < 0.45 * Math.max(items[i].t.size, 1)) { row.push(items[j]); used.add(j); }
      }
      row.sort((p, q) => p.u - q.u);
      // split the row where the gap is big (separate columns)
      let cur = [row[0]];
      const flush = () => {
        const size = Math.max(...cur.map((c) => c.t.size));
        const text = cur.map((c) => c.t.s).join(" ").replace(/\s+/g, " ").trim();
        const u1 = cur[cur.length - 1].u + cur[cur.length - 1].t.s.length * size * 0.55;
        if (text) lines.push({ text, u0: cur[0].u, u1, v: cur[0].v, size, angle, page: page.index });
      };
      for (let k = 1; k < row.length; k++) {
        const prev = cur[cur.length - 1];
        const prevEnd = prev.u + prev.t.s.length * prev.t.size * 0.55;
        // a new column starts at a big gap, or where another title-block label begins
        if (row[k].u - prevEnd > 2 * Math.max(prev.t.size, 1.5) || isLabel(row[k].t.s.trim())) { flush(); cur = [row[k]]; } else cur.push(row[k]);
      }
      flush();
    }
  }
  return lines;
}

const LABELS: { key: string; re: RegExp; take: number }[] = [
  { key: "address", re: /^(?:PROJECT|SITE|PROPERTY|JOB|STREET)?\s*ADDRESS\b[.:]?\s*/i, take: 3 },
  { key: "client", re: /^(?:CLIENTS?|OWNERS?|BUILDER|PREPARED\s+FOR)\b[.:]?\s*/i, take: 2 },
  { key: "project", re: /^(?:PROJECT|PROPOSED|DEVELOPMENT|JOB)\b(?!\s*(?:ADDRESS|NO|NUMBER))[.:]?\s*/i, take: 2 },
  { key: "date", re: /^DATE\b[.:]?\s*/i, take: 1 },
  { key: "issue", re: /^(?:ISSUE|REVISION|REV|STATUS)\b[.:]?\s*/i, take: 1 },
  { key: "ref", re: /^(?:REF|DRAWING\s*(?:NO|NUMBER|REF)|DWG\s*NO|JOB\s*(?:NO|NUMBER))\b[.:]?\s*/i, take: 1 },
  { key: "designer", re: /^(?:DESIGNER|DESIGNED\s*BY|DRAWN\s*BY|DRAFTSPERSON|ARCHITECT|BUILDING\s*DESIGNER)\b[.:]?\s*/i, take: 2 },
  { key: "council", re: /^(?:LOCAL\s*AUTHORITY|COUNCIL|LGA|MUNICIPALITY)\b\s*[.:-]?\s*/i, take: 1 },
  { key: "drawn", re: /^(?:DRAWN|CHECKED|SCALE|SHEET|DRAWING\s*REFERENCE|SHEET\s*NO)\b/i, take: 0 },
];
const isLabel = (text: string) => LABELS.some((l) => l.re.test(text) && text.replace(l.re, "").trim().length < 2);

/** Values under (or after) each label, per page: label key → value lines. */
export function labelValues(lines: Line[]): Map<string, { value: string[]; page: number }> {
  const out = new Map<string, { value: string[]; page: number }>();
  for (const L of lines) {
    for (const lab of LABELS) {
      if (!lab.take || out.has(lab.key) || !lab.re.test(L.text)) continue;
      const rest = L.text.replace(lab.re, "").trim();
      if (rest.length >= 2 && !/^[.:]+$/.test(rest)) { out.set(lab.key, { value: [rest], page: L.page }); break; }
      const below = lines
        .filter((o) => o !== L && o.page === L.page && o.angle === L.angle && o.v > L.v + 0.2 && o.v < L.v + 6 * Math.max(L.size, 1.5) && Math.abs(o.u0 - L.u0) < Math.max(4, 1.5 * L.size))
        .sort((p, q) => p.v - q.v || Math.abs(p.u0 - L.u0) - Math.abs(q.u0 - L.u0));
      const vals: string[] = [];
      for (const o of below) {
        if (isLabel(o.text) || LABELS.some((l) => l.take && l.re.test(o.text) && o.text.replace(l.re, "").trim().length === 0)) break;
        vals.push(o.text);
        if (vals.length >= lab.take) break;
      }
      if (vals.length) out.set(lab.key, { value: vals, page: L.page });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Field parsers (also used directly by tests)
// ---------------------------------------------------------------------------
const SMALL = new Set(["of", "and", "the", "on", "at", "for", "to"]);
const KEEP_UPPER = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT", "PTY", "LTD", "SP", "RP", "DP", "PS", "LP", "TP", "UPVC", "PVC", "CBD", "NBN"]);
export function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").split(" ").map((w, i) => {
    const up = w.toUpperCase();
    if (up === "PTY" || up === "LTD") return up[0] + up.slice(1).toLowerCase();
    if (KEEP_UPPER.has(up.replace(/[^A-Z]/g, "")) && w === up) return up;
    if (/\d/.test(w) && /^[\dA-Z/-]+$/.test(w)) return w.toUpperCase();
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.replace(/(^|[-'(/])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
  }).join(" ");
}

const STREET_TYPES = "STREET|ST|ROAD|RD|AVENUE|AVE|AV|PLACE|PL|COURT|CT|CRESCENT|CRES|CR|DRIVE|DR|LANE|LN|WAY|PARADE|PDE|CLOSE|CL|TERRACE|TCE|HIGHWAY|HWY|BOULEVARD|BVD|BLVD|CIRCUIT|CCT|GROVE|GR|RISE|PARKWAY|PKWY|SQUARE|SQ|ESPLANADE|ESP|ROW|VIEW|WALK|LOOP|CHASE|GLEN|HEIGHTS|HTS|MEWS|RIDGE|OUTLOOK|VISTA|PROMENADE|RETREAT|BEND|BROW|TRACK|TRAIL|CIRCLE|COVE|GARDENS|GDNS|GATE|GREEN|HILL|MEANDER|PASS|PATH|POINT|QUAY|REACH|STRAND|VALE";
const STREET_RE = new RegExp(`(?:^|[\\s,])((?:(?:UNIT|U|LOT)\\s*\\d+[A-Z]?\\s*[,/]?\\s*)?\\d+[A-Z]?(?:\\s*[-/]\\s*\\d+[A-Z]?)?\\s+(?:[A-Z][A-Z'.-]*\\s+){1,4}?(?:${STREET_TYPES}))\\b\\.?`, "i");
const STATE_RE = /\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT|NEW SOUTH WALES|VICTORIA|QUEENSLAND|WESTERN AUSTRALIA|SOUTH AUSTRALIA|TASMANIA)\b/i;
const STATE_FULL: Record<string, string> = { "NEW SOUTH WALES": "NSW", VICTORIA: "VIC", QUEENSLAND: "QLD", "WESTERN AUSTRALIA": "WA", "SOUTH AUSTRALIA": "SA", TASMANIA: "TAS" };

export type Address = { street: string | null; suburb: string | null; state: string | null; postcode: string | null };

/** "12 WATTLE GROVE, ELTHAM 3095 VIC" (any order of suburb/state/postcode) → parts. */
export function parseAddress(text: string): Address {
  const t = text.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  const sm = t.match(STREET_RE);
  const street = sm ? titleCase(sm[1].replace(/\s*,\s*$/, "")) : null;
  let rest = sm ? t.slice((sm.index ?? 0) + sm[0].length) : t;
  rest = rest.replace(/\bAUSTRALIA\b/i, " ");
  const st = rest.match(STATE_RE);
  let state = st ? STATE_FULL[st[1].toUpperCase()] ?? st[1].toUpperCase() : null;
  const pc = rest.match(/\b(\d{4})\b/);
  const postcode = pc ? pc[1] : null;
  if (!state && postcode) state = stateFromPostcode(postcode);
  const suburbRaw = rest.replace(STATE_RE, " ").replace(/\b\d{4}\b/, " ").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  const suburb = suburbRaw && /^[A-Za-z][A-Za-z' -]{1,40}$/.test(suburbRaw) ? titleCase(suburbRaw) : null;
  return { street, suburb, state: asAuState(state) ?? null, postcode };
}

/** "LOT: 7 on SP123456", "LOT 3 DP 12345", "Lot 21 PS 712345" → "Lot 7 on SP123456". */
export function parseLot(text: string): string | null {
  const m = text.match(/\bLOT\s*[:.]?\s*(\d+[A-Z]?)\s*,?\s*(?:ON\s+|IN\s+)?(?:PLAN\s*(?:NO\.?)?\s*)?\b(SP|RP|DP|PS|LP|TP|SL|CP|CT|FP|D|P)\s*[:.]?\s*(\d{3,8})\b/i);
  return m ? `Lot ${m[1].toUpperCase()} on ${m[2].toUpperCase()}${m[3]}` : null;
}

/** "LOCAL AUTHORITY: LOGAN", "COUNCIL: CITY OF CASEY" → "Logan". */
export function parseCouncil(text: string): string | null {
  const m = text.match(/\b(?:LOCAL\s+AUTHORITY|COUNCIL|LGA|MUNICIPALITY)\s*[:\-]\s*([A-Z][A-Z .'&-]{2,50})/i);
  if (m) return titleCase(m[1].replace(/\s+(?:COUNCIL)?\s*$/i, "").trim());
  const c = text.match(/\b((?:CITY\s+OF\s+)?[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)?)\s+(?:CITY|SHIRE|REGIONAL|MUNICIPAL)\s+COUNCIL\b/i);
  if (c && !/\b(LOCAL|THE|RELEVANT|BY|TO)\b/i.test(c[1])) return titleCase(c[1]);
  return null;
}

const STOP = new Set(["OF", "THE", "BY", "FOR", "CLIENT", "USE", "TO", "AND", "IS", "A", "ANY", "EXCLUSIVE", "THIS", "ALL", "AN", "WITH", "FROM"]);
/** Drafting / architecture firm names, preferring one that matches an email domain on the sheet. */
export function parseDesigner(text: string): string | null {
  const domains = [...text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9-]+)\./gi)].map((m) => m[1].toLowerCase());
  const cands = new Map<string, number>();
  for (const m of text.matchAll(/((?:[A-Z][A-Z&'-]*\s+){1,3})(STUDIO|ARCHITECTS?|ARCHITECTURE|DESIGNS?|DRAFTING(?:\s+SERVICES)?|BUILDING\s+DESIGN|PLANNING)\b/g)) {
    const words = m[1].trim().split(/\s+/);
    while (words.length && STOP.has(words[0].toUpperCase())) words.shift();
    const keep: string[] = [];
    for (let i = words.length - 1; i >= 0 && !STOP.has(words[i].toUpperCase()); i--) keep.unshift(words[i]);
    if (!keep.length) continue;
    if (/^(BUILDING|THE|STRUCTURAL|ENGINEERS?)$/i.test(keep.join(" "))) continue;
    const name = `${keep.join(" ")} ${m[2]}`.toUpperCase();
    const flat = name.replace(/[^A-Z]/g, "").toLowerCase();
    const score = (cands.get(name) ?? 0) + 1 + (domains.some((d) => d.includes(flat) || flat.includes(d)) ? 10 : 0);
    cands.set(name, score);
  }
  let best: string | null = null, bs = 0;
  for (const [n, s] of cands) if (s > bs) { bs = s; best = n; }
  return best ? titleCase(best) : null;
}

/** "10/09/25" or "10.09.2025" → "10/09/2025" (DD/MM/YYYY). */
export function parseDrawingDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
}

export type BuildingInfo = { buildingType: string | null; jobType: "new_construction" | "other" | null };
export function parseBuildingType(text: string): BuildingInfo {
  const t = text.toUpperCase();
  const m = t.match(/\b(NEW\s+(?:RESIDENCE|DWELLING|HOME|HOUSE|DUPLEX|TOWNHOUSES?)|PROPOSED\s+(?:RESIDENCE|DWELLING)|GRANNY\s+FLAT|SECONDARY\s+DWELLING|DUAL\s+OCCUPANCY|(?:PROPOSED\s+)?(?:ALTERATIONS?\s*(?:&|AND)\s*)?ADDITIONS?|EXTENSION|ALTERATIONS?)\b/);
  if (!m) return { buildingType: null, jobType: null };
  const v = m[1].replace(/\s+/g, " ");
  return { buildingType: titleCase(v), jobType: /^ALTERATIONS?$/.test(v) ? "other" : "new_construction" };
}
export function parseStoreys(text: string): number | null {
  const m = text.toUpperCase().match(/\b(SINGLE|ONE|1|DOUBLE|TWO|2|THREE|3|TRIPLE)[\s-]*STOR(?:E)?Y\b/);
  if (!m) return null;
  return ({ SINGLE: 1, ONE: 1, "1": 1, DOUBLE: 2, TWO: 2, "2": 2, THREE: 3, "3": 3, TRIPLE: 3 } as Record<string, number>)[m[1]] ?? null;
}
export type RoofMaterial = { material: string; system: "metal" | "concrete_tile" | "terracotta_tile" | "membrane" };
export function parseRoofMaterial(text: string): RoofMaterial | null {
  const t = text.toUpperCase();
  if (/COLOU?RBOND/.test(t)) return { material: "COLORBOND steel", system: "metal" };
  if (/ZINCALUME/.test(t)) return { material: "ZINCALUME steel", system: "metal" };
  if (/TERRACOTTA\s+(?:ROOF\s+)?TILE/.test(t)) return { material: "Terracotta tile", system: "terracotta_tile" };
  if (/(?:CONCRETE\s+(?:ROOF\s+)?TILE|ROOF\s+TILES?\b|TILED\s+ROOF)/.test(t)) return { material: "Concrete tile", system: "concrete_tile" };
  if (/(?:METAL|STEEL|SHEET)\s+ROOF/.test(t)) return { material: "Metal sheet", system: "metal" };
  return null;
}
/** "DOWNPIPES (DP) TO BE 100mmØ UPVC" + "MAXIMUM 12.0m CTRS" → "100 mm uPVC, max 12 m apart". */
export function parseDownpipes(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const size = t.match(/DOWN\s*PIPES?[^.]{0,40}?(\d{2,3})\s*(?:MM)?\s*(?:Ø|DIA\.?|DIAMETER)?\s*(UPVC|PVC|COLOU?RBOND|STEEL|METAL)?/i);
  const rect = t.match(/DOWN\s*PIPES?[^.]{0,40}?(\d{2,3})\s*[X×]\s*(\d{2,3})/i);
  const sp = t.match(/(?:MAX(?:IMUM)?\.?\s*)(\d{1,2}(?:\.\d)?)\s*M\s*(?:CTRS|CENTRES|CENTERS|CRS)/i) ?? t.match(/NOT\s+MORE\s+THAN\s+(\d{1,2}(?:\.\d)?)\s*MET(?:RE|ER)S?\s+OF\s+GUTTER/i);
  const parts: string[] = [];
  if (rect) parts.push(`${rect[1]} × ${rect[2]} mm`);
  else if (size) parts.push(`${size[1]} mm${size[2] ? ` ${/PVC/i.test(size[2]) ? "uPVC" : titleCase(size[2])}` : ""}`);
  if (sp) parts.push(`max ${Number(sp[1])} m apart`);
  return parts.length ? parts.join(", ") : null;
}
export function parseEaveOverhang(text: string): number | null {
  const t = text.toUpperCase();
  const m = t.match(/\bEAVES?\s*(?:OVERHANG|WIDTH)?\s*[:=-]?\s*(\d{3,4})\s*(?:MM)?\b/) ?? t.match(/\b(\d{3,4})\s*(?:MM)?\s*(?:WIDE\s+)?EAVES?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 150 && n <= 1500 ? n : null;
}

// ---------------------------------------------------------------------------
// All together
// ---------------------------------------------------------------------------
/** Every detail we can read off the plans, with the sheet each came from (first sheet that has it wins). */
export function parseDetails(pages: PageText[], extra: { pitch?: number | null; pitchPage?: number; roofPage?: number } = {}): Found[] {
  const out = new Map<DetailKey, Found>();
  const put = (key: DetailKey, value: string | number | null | undefined, page: number) => {
    if (value == null || value === "" || out.has(key)) return;
    out.set(key, { key, value: String(value), page, via: "plans" });
  };
  const order = [...pages].sort((a, b) => a.index - b.index);
  for (const p of order) {
    const lines = buildLines(p);
    const lv = labelValues(lines);
    const all = lines.map((l) => l.text).join("\n");
    const addr = lv.get("address");
    if (addr) {
      const a = parseAddress(addr.value.join(", "));
      put("street", a.street, p.index); put("suburb", a.suburb, p.index); put("state", a.state, p.index); put("postcode", a.postcode, p.index);
    }
    const client = lv.get("client");
    if (client) put("client", titleCase(client.value.join(" ")), p.index);
    const date = lv.get("date");
    if (date) put("drawingDate", parseDrawingDate(date.value.join(" ")), p.index);
    const issue = lv.get("issue"), ref = lv.get("ref");
    if (issue || ref) put("drawingIssue", [issue ? titleCase(issue.value.join(" ")) : null, ref ? `rev ${ref.value.join(" ")}` : null].filter(Boolean).join(", "), p.index);
    const designer = lv.get("designer");
    if (designer) put("designer", titleCase(designer.value.join(" ")), p.index);
    const project = lv.get("project");
    const b = parseBuildingType(project ? project.value.join(" ") : "");
    if (b.buildingType) put("buildingType", b.buildingType, p.index);
    put("lot", parseLot(all.replace(/\n/g, " ")), p.index);
    const council = lv.get("council");
    put("council", council ? titleCase(council.value.join(" ")) : parseCouncil(all), p.index);
  }
  // Whole-set phrases (notes, elevations).
  for (const p of order) {
    const all = buildLines(p).map((l) => l.text).join("\n");
    if (!out.has("street")) {
      const a = parseAddress(all.split("\n").find((l) => STREET_RE.test(l)) ?? "");
      if (a.street) { put("street", a.street, p.index); put("suburb", a.suburb, p.index); put("state", a.state, p.index); put("postcode", a.postcode, p.index); }
    }
    put("designer", parseDesigner(all.toUpperCase()), p.index);
    put("buildingType", parseBuildingType(all).buildingType, p.index);
    put("storeys", parseStoreys(all), p.index);
    put("roofMaterial", parseRoofMaterial(all)?.material, p.index);
    const e = parseEaveOverhang(all);
    if (e) put("eaveOverhang", `${e} mm`, p.index);
  }
  // Downpipe size and spacing are often in different notes on different sheets.
  const dpPage = order.find((p) => p.texts.some((t) => /DOWN\s*PIPE/i.test(t.s)));
  if (dpPage) put("downpipes", parseDownpipes(order.map((p) => buildLines(p).map((l) => l.text).join(" ")).join(" . ")), dpPage.index);
  if (extra.pitch) put("pitch", `${extra.pitch}°`, extra.pitchPage ?? extra.roofPage ?? 0);
  return DETAIL_KEYS.filter((k) => out.has(k)).map((k) => out.get(k)!);
}

/** Deterministic values win; AI values fill keys we didn't find. */
export function mergeDetails(found: Found[], ai: Partial<Record<DetailKey, { value: string; page?: number | null }>>): Found[] {
  const out = [...found];
  for (const k of DETAIL_KEYS) {
    const v = ai[k];
    if (!v || !String(v.value ?? "").trim() || out.some((f) => f.key === k)) continue;
    out.push({ key: k, value: String(v.value).trim().slice(0, 200), page: Number.isFinite(v.page) ? Number(v.page) : -1, via: "ai" });
  }
  return DETAIL_KEYS.flatMap((k) => out.filter((f) => f.key === k));
}

/** Job type for the jobs table from the building description. */
export const jobTypeFromBuilding = (s: string | null | undefined) => (s ? parseBuildingType(s).jobType : null);
/** Roof system from a material description. */
export const roofSystemFromMaterial = (s: string | null | undefined) => (s ? parseRoofMaterial(s)?.system ?? null : null);

/** All page text as plain lines (for the AI pass), capped. */
export function plainText(pages: PageText[], maxChars = 40000): string {
  let s = "";
  for (const p of [...pages].sort((a, b) => a.index - b.index)) {
    const block = `--- Sheet ${p.index} ---\n${buildLines(p).map((l) => l.text).join("\n")}\n`;
    if (s.length + block.length > maxChars) break;
    s += block;
  }
  return s;
}
