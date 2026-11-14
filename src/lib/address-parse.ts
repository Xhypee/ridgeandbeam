// Splits a one-line Australian address ("Lot 214, Grand Ave, Springfield Lakes QLD 4300") into parts.
import { AU_STATES } from "./au";

export type ParsedAddress = { address: string; city: string; state: string; zip: string };
const TAIL = new RegExp(`^(.*?)[\\s,]+(${AU_STATES.join("|")})[\\s,]+(\\d{4})$`, "i");

export function parseAuAddress(line: string): ParsedAddress {
  const s = line.trim().replace(/\s+/g, " ").replace(/,?\s*Australia$/i, "");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  // "36 Brownvale St, Logan Central, QLD, 4114": state and postcode in their own parts → rejoin the tail.
  if (parts.length >= 3 && /^\d{4}$/.test(parts[parts.length - 1]) && (AU_STATES as readonly string[]).includes(parts[parts.length - 2].toUpperCase())) {
    parts.splice(-3, 3, `${parts[parts.length - 3]} ${parts[parts.length - 2]} ${parts[parts.length - 1]}`);
  }
  const last = parts.length ? parts[parts.length - 1] : "";
  const m = last.match(TAIL);
  if (!m) return { address: s, city: "", state: "", zip: "" };
  return { address: parts.slice(0, -1).join(", "), city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
}
