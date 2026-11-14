// Pure helpers for the address lookup (no React, no server code), so tests can import them.
import { AU_STATES } from "@/lib/au";

export type AddrComponent = { longText: string | null; shortText: string | null; types: string[] };
export type AddressParts = { address: string; city: string; state: string; zip: string; lat: number | null; lng: number | null };

/** Google address components → our fields ("9 Bay Tce", "Wynnum", "QLD", "4178"). Exported for tests. */
export function partsFromComponents(cs: AddrComponent[], loc?: { lat: number; lng: number } | null): AddressParts {
  const get = (t: string, short = false) => { const c = cs.find((x) => x.types.includes(t)); return (short ? c?.shortText : c?.longText) ?? ""; };
  const unit = get("subpremise");
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  const state = get("administrative_area_level_1", true).toUpperCase();
  return {
    address: unit && street ? `${unit}/${street}` : street || get("premise") || get("establishment"),
    city: get("locality") || get("sublocality_level_1") || get("sublocality") || get("postal_town"),
    state: (AU_STATES as readonly string[]).includes(state) ? state : "",
    zip: get("postal_code"),
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
  };
}
