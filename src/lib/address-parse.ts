// Splits a one-line Australian address ("Lot 214, Grand Ave, Springfield Lakes QLD 4300") into parts.
import { AU_STATES } from "./au";

export type ParsedAddress = { address: string; city: string; state: string; zip: string };
const TAIL = new RegExp(`^(.*?)[\\s,]+(${AU_STATES.join("|")})[\\s,]+(\\d{4})$`, "i");

export function parseAuAddress(line: string): ParsedAddress {
  const s = line.trim().replace(/\s+/g, " ").replace(/,?\s*Australia$/i, "");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  const m = last.match(TAIL);
  if (!m) return { address: s, city: "", state: "", zip: "" };
  return { address: parts.slice(0, -1).join(", "), city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
}
