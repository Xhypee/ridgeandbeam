export const KNOCK_STATUSES = ["not_home", "not_interested", "come_back", "interested", "inspection_booked", "customer"] as const;
export type KnockStatus = (typeof KNOCK_STATUSES)[number];

export const KNOCK_META: Record<KnockStatus, { label: string; color: string }> = {
  not_home: { label: "Not home", color: "#64748b" },
  not_interested: { label: "Not interested", color: "#dc2626" },
  come_back: { label: "Come back", color: "#f59e0b" },
  interested: { label: "Interested", color: "#2563eb" },
  inspection_booked: { label: "Inspection booked", color: "#16a34a" },
  customer: { label: "Customer", color: "#7c3aed" },
};

/** SPOTIO / SalesRabbit status text -> our statuses. */
export function mapImportedStatus(raw: string | null | undefined): KnockStatus {
  const s = (raw ?? "").toLowerCase();
  if (!s.trim()) return "not_home";
  if (/(customer|sold|signed|closed won|contract)/.test(s)) return "customer";
  if (/(appointment|appt|booked|inspection|scheduled|set)/.test(s)) return "inspection_booked";
  if (/(not interested|no soliciting|no thanks|\bni\b|do not|dnk|declined|not int)/.test(s)) return "not_interested";
  if (/(come back|callback|call back|go back|follow|revisit|later)/.test(s)) return "come_back";
  if (/(interested|lead|hot|warm|maybe)/.test(s)) return "interested";
  if (/(not home|nh|no answer|nobody|away)/.test(s)) return "not_home";
  return (KNOCK_STATUSES as readonly string[]).includes(s) ? (s as KnockStatus) : "not_home";
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Best-guess column for each field from typical SPOTIO / SalesRabbit headers. */
export function guessMapping(headers: string[]) {
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = headers.findIndex((h) => re.test(h.trim().toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    lat: find(/^lat(itude)?$/, /lat/),
    lng: find(/^(lng|lon|long|longitude)$/, /(lng|lon)/),
    address: find(/^(full )?address$/, /street/, /address/),
    status: find(/^(status|result|disposition|outcome)$/, /status/, /disposition/),
    notes: find(/^(notes?|comments?)$/, /note/, /comment/),
  };
}
