// Server-only: the price book a quote is priced from (the company's price book, with the quote's supplier sheet
// on top when it has one: one sheet price per profile/finish asked for). Used by the docket and "Measure from plans".
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedCatalog, isLegacyItem, resolvePriceBook, type CatalogRow } from "./estimating";
import { DOCKET_PROFILES } from "./docket";
import { supplierPriceBook, type PriceRow } from "./suppliers";

type OrgLite = { id: string; prices_include_gst?: boolean | null; certifications?: string[] | null };

/** The company's AU price book (legacy and certification-gated items left out), with its GST convention. */
export function usableCatalog(rows: CatalogRow[], org: OrgLite): CatalogRow[] {
  const inc = org.prices_include_gst !== false;
  return allowedCatalog(rows, org.certifications ?? []).filter((c) => !isLegacyItem(c)).map((c) => ({ ...c, price_inc_gst: inc }));
}

/**
 * Price book + supplier sheet. Asks the supplier for every tiered sheet item's profile/finish and for the docket's
 * three profiles in COLORBOND and ZINCALUME, so switching profile or colour on the docket finds a supplier price.
 */
export async function quotePriceBook(supabase: SupabaseClient, org: OrgLite, catalog: CatalogRow[], orgSupplierId: string | null): Promise<{ book: CatalogRow[]; supplier: boolean }> {
  if (!orgSupplierId) return { book: catalog, supplier: false };
  try {
    const base = await supplierPriceBook(supabase, org.id, orgSupplierId);
    if (!base?.length) return { book: catalog, supplier: false };
    const rows: PriceRow[] = [...base];
    const asks = [
      ...catalog.filter((x) => x.calc_key === "metal_sheet" && x.tier).map((c) => ({ profile: c.profile ?? null, finish: c.finish ?? null })),
      ...DOCKET_PROFILES.flatMap((p) => [{ profile: p, finish: "COLORBOND" }, { profile: p, finish: "ZINCALUME" }]),
    ];
    const seen = new Set<string>();
    for (const a of asks) {
      const sig = `${a.profile}|${a.finish}`;
      if (seen.has(sig) || seen.size >= 10) continue;
      seen.add(sig);
      const more = await supplierPriceBook(supabase, org.id, orgSupplierId, a);
      for (const r of more ?? []) if (r.calc_key === "metal_sheet" && !rows.some((x) => x.supplier_price_item_id === r.supplier_price_item_id)) rows.push(r);
    }
    return { book: resolvePriceBook(catalog, rows), supplier: true };
  } catch {
    return { book: catalog, supplier: false };
  }
}
