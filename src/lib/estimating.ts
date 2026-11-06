// Estimating domain helpers (builder B): price-book rows, good/better/best options, certifications,
// and building line items from a calculator takeoff. Pure — safe for client and server.

import type { Takeoff } from "./roof";

export const TIERS = ["good", "better", "best"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

export const CERTIFICATIONS = [
  "GAF Master Elite",
  "GAF Certified",
  "Owens Corning Platinum Preferred",
  "Owens Corning Preferred",
  "CertainTeed SELECT ShingleMaster",
  "CertainTeed ShingleMaster",
  "Malarkey Emerald Pro",
  "IKO ShieldPRO",
  "Other",
] as const;

export type CatalogRow = {
  id: string;
  calc_key: string | null;
  name: string;
  unit: string;
  unit_price: number;
  unit_cost: number;
  category: "material" | "labor" | "other";
  tier: Tier | null;
  warranty: string | null;
  requires_certification: string | null;
};

/** Price-book items this company may offer (manufacturer-certification gated warranties, etc.). */
export function allowedCatalog<T extends Pick<CatalogRow, "requires_certification">>(catalog: T[], certifications: string[] | null | undefined): T[] {
  const certs = new Set((certifications ?? []).map((c) => c.toLowerCase()));
  return catalog.filter((c) => !c.requires_certification || certs.has(c.requires_certification.toLowerCase()));
}

export type DraftItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  unit_cost: number;
  category: "material" | "labor" | "other";
  calc_key: string | null;
  /** Client-side option key; null = included in every option. */
  option_key: string | null;
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
  good: { description: "Quality architectural shingles with the manufacturer's standard limited warranty. A solid, budget-friendly roof." },
  better: { description: "Designer shingles plus matched ridge, starter and underlayment for an enhanced system warranty. Our most popular choice." },
  best: { description: "Class 4 impact-resistant shingles (may qualify for an insurance discount) with our premium system warranty." },
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
    name: { good: "Good", better: "Better", best: "Best" }[t],
    tier: t,
    description: DEFAULT_TIER_COPY[t].description,
    warranty: "",
    recommended: t === "better",
  }));
}

const toItem = (c: CatalogRow, quantity: number, option_key: string | null): DraftItem => ({
  description: c.name,
  quantity,
  unit: c.unit,
  unit_price: Number(c.unit_price),
  unit_cost: Number(c.unit_cost ?? 0),
  category: c.category,
  calc_key: c.calc_key,
  option_key,
});

/** Tier-specific price-book item for this option, falling back to the untiered item. */
function pick(candidates: CatalogRow[], tier: Tier | null): CatalogRow | undefined {
  return (tier ? candidates.find((c) => c.tier === tier) : undefined) ?? candidates.find((c) => c.tier == null);
}

/**
 * Build calculator lines. Items identical across every option become shared lines (option_key null);
 * keys with tier-specific price-book items (shingles, warranty, ...) become one line per option.
 * `catalog` should already be filtered with allowedCatalog().
 */
export function buildLines(rows: Takeoff[], catalog: CatalogRow[], options: Pick<DraftOption, "key" | "tier">[]) {
  const items: DraftItem[] = [];
  const missing = new Set<string>();
  const warranties: Record<string, string> = {};
  const byKey = (k: string) => catalog.filter((c) => c.calc_key === k);

  const place = (key: string, quantity: number, optional: boolean) => {
    const candidates = byKey(key);
    if (!options.length) {
      const c = pick(candidates, null);
      if (c) items.push(toItem(c, quantity, null));
      else if (!optional) missing.add(key);
      return;
    }
    const picks = options.map((o) => ({ o, c: pick(candidates, o.tier) }));
    if (!optional && picks.some((p) => !p.c)) missing.add(key);
    const found = picks.filter((p) => p.c);
    if (!found.length) return;
    if (found.length === options.length && found.every((p) => p.c!.id === found[0].c!.id)) {
      items.push(toItem(found[0].c!, quantity, null));
    } else {
      for (const p of found) items.push(toItem(p.c!, quantity, p.o.key));
    }
    for (const p of found) if (p.c!.warranty) warranties[p.o.key] = p.c!.warranty;
  };

  for (const r of rows) place(r.key, r.quantity, false);
  if (options.length && rows.length) place("warranty", 1, true);
  return { items, missing: [...missing], warranties };
}

/** Lines that came from the calculator (replaced on refill) vs hand-added ones (kept). */
export function isCalculatorLine(it: Pick<DraftItem, "calc_key" | "description">, calcNames: Set<string>) {
  return Boolean(it.calc_key) || calcNames.has(it.description);
}
