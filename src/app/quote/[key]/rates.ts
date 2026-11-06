import type { QuoteRoofType } from "@/lib/roof";

/** Instant-quote rates per m² of roof, GST inclusive (organizations.instant_quote, set in Settings → Price book). */
export type QuoteRates = Record<QuoteRoofType, { low: number; high: number }>;

export function quoteRates(iq: Record<string, unknown> | null | undefined): QuoteRates {
  const v = (k: string) => Math.max(0, Number(iq?.[k]) || 0);
  return { metal: { low: v("metal_m2_low"), high: v("metal_m2_high") }, tile: { low: v("tile_m2_low"), high: v("tile_m2_high") } };
}
