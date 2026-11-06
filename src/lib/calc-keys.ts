/**
 * The shared vocabulary between the roof calculator (what it measures/outputs) and supplier
 * price sheets (what a roofer buys). A supplier price row is mapped to ONE calc key; the
 * calculator emits quantities in the key's unit. Australian conventions: metric, GST-inclusive sell.
 */

export type CalcUnit = "lm" | "m2" | "ea" | "roll" | "box" | "sheet" | "bag" | "job" | "hr";
export type CalcCategory = "material" | "labor" | "other";

export type CalcKeyDef = {
  key: string;
  label: string;
  unit: CalcUnit;
  category: CalcCategory;
  /** Which roof systems use it (empty = any). */
  systems?: ("metal" | "concrete_tile" | "terracotta_tile" | "membrane")[];
  /** Words that suggest a supplier price-sheet row belongs to this key (lower-case). */
  hints: string[];
};

export const CALC_KEYS: CalcKeyDef[] = [
  // Metal roofing
  { key: "metal_sheet", label: "Roof sheeting (cut to length)", unit: "lm", category: "material", systems: ["metal"], hints: ["custom orb", "corrugated", "trimdek", "klip-lok", "kliplok", "spandek", "longline", "sheet", "roofing"] },
  { key: "ridge_capping", label: "Ridge & hip capping", unit: "lm", category: "material", systems: ["metal"], hints: ["ridge cap", "roll top", "hip cap", "capping"] },
  { key: "barge_capping", label: "Barge capping", unit: "lm", category: "material", systems: ["metal"], hints: ["barge"] },
  { key: "valley_iron", label: "Valley iron / valley gutter", unit: "lm", category: "material", hints: ["valley"] },
  { key: "flashing", label: "Apron / wall flashing", unit: "lm", category: "material", hints: ["flashing", "apron", "wall flash", "parapet"] },
  { key: "roof_screws", label: "Roofing screws", unit: "box", category: "material", systems: ["metal"], hints: ["screw", "tek", "fastener", "buildex"] },
  // Tiles
  { key: "roof_tile", label: "Roof tiles", unit: "ea", category: "material", systems: ["concrete_tile", "terracotta_tile"], hints: ["tile", "monier", "bristile", "terracotta", "concrete tile"] },
  { key: "ridge_tile", label: "Ridge / hip tiles", unit: "ea", category: "material", systems: ["concrete_tile", "terracotta_tile"], hints: ["ridge tile", "hip tile", "capping tile"] },
  { key: "tile_battens", label: "Tile battens", unit: "lm", category: "material", systems: ["concrete_tile", "terracotta_tile"], hints: ["batten"] },
  { key: "pointing", label: "Flexible pointing / bedding", unit: "bag", category: "material", systems: ["concrete_tile", "terracotta_tile"], hints: ["pointing", "bedding", "mortar"] },
  // Under-roof
  { key: "sarking", label: "Sarking / roof blanket", unit: "roll", category: "material", hints: ["sarking", "anticon", "blanket", "thermoseal", "foil"] },
  { key: "safety_mesh", label: "Safety mesh", unit: "roll", category: "material", systems: ["metal"], hints: ["safety mesh", "mesh"] },
  // Roof plumbing
  { key: "gutter", label: "Gutter", unit: "lm", category: "material", hints: ["gutter", "quad", "half round", "fascia gutter", "box gutter"] },
  { key: "downpipe", label: "Downpipe", unit: "ea", category: "material", hints: ["downpipe", "down pipe", "dp "] },
  { key: "whirlybird", label: "Whirlybird / roof vent", unit: "ea", category: "material", hints: ["whirlybird", "vent", "ventilator"] },
  // Restoration
  { key: "restore_clean", label: "High-pressure clean", unit: "m2", category: "labor", hints: ["clean", "pressure"] },
  { key: "rebed_repoint", label: "Rebed & repoint ridge capping", unit: "lm", category: "labor", hints: ["rebed", "repoint"] },
  { key: "roof_coating", label: "Roof coating (membrane paint)", unit: "m2", category: "material", hints: ["coating", "membrane", "acratex", "paint"] },
  { key: "tile_replace", label: "Replace broken tiles", unit: "ea", category: "labor", hints: ["replace tile", "broken tile"] },
  // Labour & site
  { key: "labour_strip", label: "Strip & dispose of old roof", unit: "m2", category: "labor", hints: ["strip", "removal", "remove"] },
  { key: "labour_install", label: "Installation labour", unit: "m2", category: "labor", hints: ["install", "labour", "labor"] },
  { key: "labour_steep", label: "Steep roof allowance", unit: "m2", category: "labor", hints: ["steep"] },
  { key: "asbestos_removal", label: "Licensed asbestos removal", unit: "m2", category: "other", hints: ["asbestos"] },
  { key: "edge_protection", label: "Edge protection / scaffold", unit: "job", category: "other", hints: ["edge protection", "scaffold", "rail"] },
  { key: "skip_bin", label: "Skip bin", unit: "ea", category: "other", hints: ["skip", "bin"] },
];

export const CALC_KEY_MAP: Record<string, CalcKeyDef> = Object.fromEntries(CALC_KEYS.map((k) => [k.key, k]));

/** Best-guess calc key for a supplier price-sheet description (null when unsure). */
export function suggestCalcKey(description: string): string | null {
  const d = ` ${description.toLowerCase()} `;
  let best: { key: string; score: number } | null = null;
  for (const k of CALC_KEYS) {
    for (const h of k.hints) {
      if (d.includes(h)) {
        const score = h.length; // longer, more specific hints win ("ridge tile" over "tile")
        if (!best || score > best.score) best = { key: k.key, score };
      }
    }
  }
  return best?.key ?? null;
}
