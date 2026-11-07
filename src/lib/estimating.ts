// Estimating domain helpers (AU): price-book rows, supplier price resolution, good/better/best options and
// building line items from a calculator takeoff. Pure — safe for client and server.

import { calcKeyCategory, isCurrentCalcKey, profileFromText, round2, type MetalProfile, type ProfileOverride, type Takeoff } from "./roof";
import type { PriceRow } from "./suppliers";

export const TIERS = ["good", "better", "best"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

export type CatalogRow = {
  id: string;
  calc_key: string | null;
  name: string;
  unit: string;
  /** Sell price per unit. GST-inclusive when `price_inc_gst` (supplier rows always are). */
  unit_price: number;
  /** Cost per unit, ex GST. */
  unit_cost: number;
  category: "material" | "labor" | "other";
  tier: Tier | null;
  warranty: string | null;
  requires_certification?: string | null;
  profile?: string | null;
  finish?: string | null;
  cover_width_mm?: number | null;
  /** Set when the price came from a supplier price sheet. */
  supplier_price_item_id?: string | null;
  product_code?: string | null;
  /** Whether unit_price includes GST (price book: the company's "prices include GST" setting). */
  price_inc_gst?: boolean;
  /** Offered as a tap-to-add extra on the docket. null/undefined = the default for its calc key (see docket.ts). */
  is_extra?: boolean | null;
  /** The short "why" shown next to an extra. */
  blurb?: string | null;
};

/** Legacy price-book items gated by a (US) manufacturer certification are hidden unless the company holds it. */
export function allowedCatalog<T extends Pick<CatalogRow, "requires_certification">>(catalog: T[], certifications: string[] | null | undefined): T[] {
  const certs = new Set((certifications ?? []).map((c) => c.toLowerCase()));
  return catalog.filter((c) => !c.requires_certification || certs.has(c.requires_certification.toLowerCase()));
}

/** Items keyed by a calc key the AU calculator does not use (e.g. US "shingles") — shown behind "Legacy items". */
export const isLegacyItem = (c: Pick<CatalogRow, "calc_key">) => Boolean(c.calc_key) && !isCurrentCalcKey(c.calc_key);

export type DraftItem = {
  description: string;
  quantity: number;
  unit: string;
  /** In the estimate's convention (GST-inclusive when the estimate's prices include GST). */
  unit_price: number;
  /** Ex GST. */
  unit_cost: number;
  category: "material" | "labor" | "other";
  calc_key: string | null;
  /** Client-side option key; null = included in every option. */
  option_key: string | null;
  /** The supplier price-sheet row the price came from (null = price book / typed). */
  supplier_price_item_id?: string | null;
  /** null = main line; "added" = an extra in the total; "offered" = shown under "Often added", not in the total. */
  extra_status?: "added" | "offered" | null;
  /** Short "why" for an extra. */
  blurb?: string | null;
  /** The customer added this extra when signing. */
  customer_added?: boolean;
};

export type DraftOption = {
  key: string;
  id?: string;
  name: string;
  tier: Tier | null;
  description: string;
  warranty: string;
  recommended: boolean;
};

export const DEFAULT_TIER_COPY: Record<Tier, { description: string }> = {
  good: { description: "ZINCALUME Custom Orb: the classic corrugated steel roof. Strong, light and budget-friendly." },
  better: { description: "COLORBOND Trimdek in the colour you choose. A bold, modern profile and our most popular roof." },
  best: { description: "COLORBOND Klip-Lok concealed-fix: no exposed screws on the sheets, crisp lines, suits low pitches." },
};

let seq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaultOptions(label: "options" | "alternates" = "options"): DraftOption[] {
  if (label === "alternates") {
    return [
      { key: newKey(), name: "Base bid", tier: "good", description: "", warranty: "", recommended: true },
      { key: newKey(), name: "Alternate 1", tier: "better", description: "", warranty: "", recommended: false },
    ];
  }
  return TIERS.map((t) => ({
    key: newKey(),
    name: TIER_LABEL[t],
    tier: t,
    description: DEFAULT_TIER_COPY[t].description,
    warranty: "",
    recommended: t === "better",
  }));
}

// ---------------------------------------------------------------------------
// Prices and GST
// ---------------------------------------------------------------------------
export type PriceMode = { inclusive: boolean; gstRatePct: number };

/** A row's sell price in the estimate's convention (inc or ex GST). */
export function priceIn(row: Pick<CatalogRow, "unit_price" | "price_inc_gst">, mode: PriceMode): number {
  const p = Number(row.unit_price) || 0;
  const rowInc = row.price_inc_gst ?? true;
  const f = 1 + (Number(mode.gstRatePct) || 0) / 100;
  if (rowInc === mode.inclusive) return round2(p);
  return round2(mode.inclusive ? p * f : p / f);
}

export const rowProfile = (c: Pick<CatalogRow, "profile" | "name">): MetalProfile | null => profileFromText(c.profile) ?? profileFromText(c.name);

const finishMatches = (want: string | null | undefined, row: Pick<PriceRow, "finish" | "name">) => {
  const w = (want ?? "").trim().toLowerCase();
  if (!w) return true;
  return `${row.finish ?? ""} ${row.name}`.toLowerCase().includes(w);
};

/** Supplier price rows as catalog rows (GST-inclusive sell, ex-GST cost). */
export function priceRowsToCatalog(rows: PriceRow[]): CatalogRow[] {
  return rows.map((r) => ({
    id: `spi:${r.supplier_price_item_id}`,
    calc_key: r.calc_key,
    name: r.name,
    unit: r.unit,
    unit_price: Number(r.unit_price_inc_gst) || 0,
    unit_cost: Number(r.unit_cost_ex_gst) || 0,
    category: calcKeyCategory(r.calc_key) as CatalogRow["category"],
    tier: null,
    warranty: null,
    profile: r.profile ?? null,
    finish: r.finish ?? null,
    cover_width_mm: r.cover_width_mm ?? null,
    supplier_price_item_id: r.supplier_price_item_id,
    product_code: r.product_code,
    price_inc_gst: true,
  }));
}

/**
 * Price from a supplier, falling back to the price book. For each price-book row with a calc key, the supplier's
 * row for that key replaces its price; a sheet row only takes a supplier row of the same profile and finish
 * (Better = COLORBOND Trimdek only takes a COLORBOND Trimdek row). Keys the supplier prices but the price book
 * lacks are added. `supplier` may hold several metal_sheet rows (one per profile/finish asked for).
 */
export function resolvePriceBook(catalog: CatalogRow[], supplier: PriceRow[]): CatalogRow[] {
  if (!supplier.length) return catalog;
  const spRows = priceRowsToCatalog(supplier);
  const used = new Set<string>();
  const out = catalog.map((c) => {
    if (!c.calc_key || !isCurrentCalcKey(c.calc_key)) return c;
    const sheet = c.calc_key === "metal_sheet";
    const wantProfile = sheet ? rowProfile(c) : null;
    const hit = spRows.find((r) => r.calc_key === c.calc_key && (!wantProfile || rowProfile(r) === wantProfile) && (!sheet || finishMatches(c.finish, r)));
    if (!hit) return c;
    used.add(hit.id);
    return {
      ...c, name: hit.name, unit: hit.unit, unit_price: hit.unit_price, unit_cost: hit.unit_cost, supplier_price_item_id: hit.supplier_price_item_id,
      product_code: hit.product_code, profile: hit.profile ?? c.profile, finish: hit.finish ?? c.finish, cover_width_mm: hit.cover_width_mm ?? c.cover_width_mm, price_inc_gst: true,
    };
  });
  const keysInBook = new Set(catalog.map((c) => c.calc_key).filter(Boolean));
  const seen = new Set<string>();
  for (const s of spRows) {
    const sig = `${s.calc_key}|${rowProfile(s) ?? ""}`;
    if (used.has(s.id) || keysInBook.has(s.calc_key) || seen.has(sig)) continue;
    seen.add(sig);
    out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lines from the calculator
// ---------------------------------------------------------------------------
const toItem = (c: CatalogRow, quantity: number, option_key: string | null, mode: PriceMode): DraftItem => ({
  description: c.name,
  quantity,
  unit: c.unit,
  unit_price: priceIn(c, mode),
  unit_cost: Number(c.unit_cost ?? 0),
  category: c.category,
  calc_key: c.calc_key,
  option_key,
  supplier_price_item_id: c.supplier_price_item_id ?? null,
});

/**
 * The price-book item for a line. Option with a tier: that tier's item, else an untiered one (profile match first).
 * No tier: the item matching the section's sheet profile, else untiered, else Better, else any.
 */
export function pick(candidates: CatalogRow[], tier: Tier | null, profile?: MetalProfile | null): CatalogRow | undefined {
  const untiered = candidates.filter((c) => c.tier == null);
  const byProfile = (list: CatalogRow[]) => (profile ? list.find((c) => rowProfile(c) === profile) : undefined);
  if (tier) return candidates.find((c) => c.tier === tier) ?? byProfile(untiered) ?? untiered[0];
  return byProfile(untiered) ?? byProfile(candidates) ?? untiered[0] ?? candidates.find((c) => c.tier === "better") ?? candidates[0];
}

type Entry = { key: string; quantity: number; item: CatalogRow | undefined };

/**
 * Build calculator lines. Lines identical across every option become shared lines (option_key null); keys whose
 * item or quantity differs per option (a tiered sheet, a different cover width) become one line per option.
 * When an option's tiered sheet is another profile (Best = Klip-Lok 700), `rowsFor` re-runs the takeoff with it.
 * `catalog` should already be resolved (resolvePriceBook) and filtered (allowedCatalog).
 */
export function buildLines(
  rows: Takeoff[],
  catalog: CatalogRow[],
  options: Pick<DraftOption, "key" | "tier">[],
  opts: { mode?: PriceMode; rowsFor?: (o: ProfileOverride) => Takeoff[] } = {},
) {
  const mode = opts.mode ?? { inclusive: true, gstRatePct: 10 };
  const items: DraftItem[] = [];
  const missing = new Set<string>();
  const warranties: Record<string, string> = {};
  const byKey = (k: string) => catalog.filter((c) => c.calc_key === k);

  if (!options.length) {
    for (const r of rows) {
      const c = pick(byKey(r.key), null, r.profile);
      if (c) items.push(toItem(c, r.quantity, null, mode));
      else missing.add(r.key);
    }
    return { items, missing: [...missing], warranties };
  }

  const perOption = options.map((o) => {
    const sheet = o.tier ? byKey("metal_sheet").find((c) => c.tier === o.tier) : undefined;
    let rs = rows;
    if (sheet && opts.rowsFor && rows.some((r) => r.key === "metal_sheet")) {
      const profile = rowProfile(sheet);
      const coverMm = Number(sheet.cover_width_mm) > 100 ? Number(sheet.cover_width_mm) : null;
      if (profile || coverMm) rs = opts.rowsFor({ profile, coverMm });
    }
    const entries: Entry[] = rs.map((r) => ({ key: r.key, quantity: r.quantity, item: r.key === "metal_sheet" && sheet ? sheet : pick(byKey(r.key), o.tier, r.profile) }));
    if (sheet?.warranty) warranties[o.key] = sheet.warranty;
    return { o, entries };
  });

  const keys: string[] = [];
  for (const p of perOption) for (const e of p.entries) if (!keys.includes(e.key)) keys.push(e.key);
  for (const k of keys) {
    const lists = perOption.map((p) => p.entries.filter((e) => e.key === k));
    if (lists.some((l) => l.length === 0 || l.some((e) => !e.item))) missing.add(k);
    const first = lists[0];
    const same = lists.every((l) => l.length === first.length && l.every((e, i) => e.item && first[i].item && e.item.id === first[i].item!.id && e.quantity === first[i].quantity));
    if (same) {
      for (const e of first) if (e.item) items.push(toItem(e.item, e.quantity, null, mode));
    } else {
      perOption.forEach((p, i) => {
        for (const e of lists[i]) if (e.item) items.push(toItem(e.item, e.quantity, p.o.key, mode));
      });
    }
  }
  return { items, missing: [...missing], warranties };
}

/** Lines that came from the calculator (replaced on refill) vs hand-added ones (kept). */
export function isCalculatorLine(it: Pick<DraftItem, "calc_key" | "description">, calcNames: Set<string>) {
  return Boolean(it.calc_key) || calcNames.has(it.description);
}
