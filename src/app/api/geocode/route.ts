import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/dal";

/** Address -> lat/lng for the map tools. Nominatim first (house-level), Open-Meteo place search as a fallback. */
const cache = new Map<string, { lat: number; lng: number; precision: "address" | "place"; source: string }>();

export async function GET(req: NextRequest) {
  await requireOrg();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 300);
  if (q.length < 3) return Response.json({ error: "Enter an address" }, { status: 400 });
  const hit = cache.get(q.toLowerCase());
  if (hit) return Response.json(hit);

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "RidgeAndBeam/1.0 (roofing CRM satellite measure)", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const rows = (await res.json()) as { lat: string; lon: string }[];
      if (rows[0]) {
        const r = { lat: Number(rows[0].lat), lng: Number(rows[0].lon), precision: "address" as const, source: "OpenStreetMap Nominatim" };
        cache.set(q.toLowerCase(), r);
        return Response.json(r);
      }
    }
  } catch {
    // fall through
  }
  try {
    // Open-Meteo matches place names / ZIPs only, so use the most specific trailing part.
    const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
    const zip = q.match(/\b\d{5}\b/)?.[0];
    const name = zip ?? parts[parts.length >= 3 ? parts.length - 2 : parts.length - 1] ?? q;
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&countryCode=US&name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { results?: { latitude: number; longitude: number }[] };
      if (j.results?.[0]) {
        const r = { lat: j.results[0].latitude, lng: j.results[0].longitude, precision: "place" as const, source: "Open-Meteo" };
        cache.set(q.toLowerCase(), r);
        return Response.json(r);
      }
    }
  } catch {
    // fall through
  }
  return Response.json({ error: "Couldn't find that address. Pan and zoom the map to the roof." }, { status: 404 });
}
