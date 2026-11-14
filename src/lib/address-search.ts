"use server";
// Address suggestions from the company's own contacts and jobs. Used by the address lookup when Google Maps
// isn't set up yet, so the lookup-first screen still works (repeat builders, return customers, same estate).
import { requireOrg } from "./dal";
import { parseAuAddress } from "./address-parse";

export type KnownAddress = { address: string; city: string; state: string; zip: string; lat: number | null; lng: number | null };

export async function searchKnownAddresses(query: string): Promise<KnownAddress[]> {
  const q = query.trim().replace(/[%,()]/g, " ").slice(0, 80);
  if (q.length < 3) return [];
  const { supabase } = await requireOrg();
  const like = `%${q}%`;
  const [{ data: cs }, { data: js }] = await Promise.all([
    supabase.from("customers").select("address, city, state, zip").or(`address.ilike.${like},city.ilike.${like}`).not("address", "is", null).limit(8),
    supabase.from("jobs").select("site_address, lat, lng").ilike("site_address", like).limit(8),
  ]);
  const out = new Map<string, KnownAddress>();
  for (const j of (js ?? []) as { site_address: string; lat: number | null; lng: number | null }[]) {
    const p = parseAuAddress(j.site_address);
    out.set(j.site_address.toLowerCase().replace(/\W+/g, ""), { ...p, lat: j.lat, lng: j.lng });
  }
  for (const c of (cs ?? []) as { address: string; city: string | null; state: string | null; zip: string | null }[]) {
    const line = [c.address, [c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const key = line.toLowerCase().replace(/\W+/g, "");
    if (!out.has(key)) out.set(key, { address: c.address, city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "", lat: null, lng: null });
  }
  return [...out.values()].slice(0, 5);
}
