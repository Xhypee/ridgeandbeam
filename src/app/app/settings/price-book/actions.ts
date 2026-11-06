"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireMoneyAccess } from "@/lib/dal";
import { TIERS } from "@/lib/estimating";
import { friendly, num, oneOf, str } from "@/lib/form";
import { CALCULATOR_KEYS, DEFAULT_SETTINGS, METAL_PROFILES, normalizeCalcSettings, type CalcSettings } from "@/lib/roof";
import type { ActionResult } from "@/components/action-form";

const CATS = ["material", "labor", "other"] as const;

export async function savePriceBookItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireMoneyAccess();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };
  const price = num(fd, "unit_price", NaN);
  const cost = num(fd, "unit_cost", 0);
  if (!Number.isFinite(price) || price < 0) return { error: "Price must be 0 or more." };
  if (cost < 0) return { error: "Cost must be 0 or more." };
  const tierRaw = str(fd, "tier");
  const tier = tierRaw && (TIERS as readonly string[]).includes(tierRaw) ? tierRaw : null;
  const profile = str(fd, "profile");
  const cover = num(fd, "cover_width_mm", 0);
  const row: Record<string, unknown> = {
    name,
    unit: str(fd, "unit") ?? "ea",
    unit_price: price,
    unit_cost: cost,
    category: oneOf(fd, "category", CATS, "material"),
    tier,
  };
  if (fd.has("profile")) row.profile = profile && (METAL_PROFILES as string[]).includes(profile) ? profile : null;
  if (fd.has("finish")) row.finish = str(fd, "finish")?.slice(0, 60) ?? null;
  if (fd.has("cover_width_mm")) row.cover_width_mm = cover > 100 && cover < 2000 ? cover : null;
  if (fd.has("warranty")) row.warranty = str(fd, "warranty");
  if (fd.has("calc_key")) {
    const key = str(fd, "calc_key");
    row.calc_key = key && CALCULATOR_KEYS.includes(key) ? key : null;
  }
  if (row.calc_key == null && tier && !id) return { error: "Tiers only matter for calculator items. Pick a calculator item or leave the tier blank." };
  const { error } = id
    ? await supabase.from("catalog_items").update(row).eq("id", id)
    : await supabase.from("catalog_items").insert({ ...row, org_id: org.id });
  if (error) {
    if (error.code === "23505") return { error: "There's already an item for that calculator item and tier. Edit that one, or choose another tier." };
    return { error: friendly(error) };
  }
  revalidatePath("/app/settings/price-book");
  return { ok: id ? "Saved." : "Added." };
}

export async function deletePriceBookItem(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const { error } = await supabase.from("catalog_items").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/settings/price-book");
}

/** Existing companies (set up before the Australian price book): add the AU calculator items at $0. */
export async function addAustralianItems(): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { data, error } = await ctx.supabase.rpc("seed_catalog_au", { p_org: ctx.org.id });
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/price-book");
  return { ok: Number(data) > 0 ? `Added ${data} Australian items. Set their prices below.` : "You already have every Australian item." };
}

/** Company-wide calculator assumptions (organizations.calc_defaults). */
export async function saveCalcDefaults(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const raw: Record<string, unknown> = { coverWidthMm: {} as Record<string, number> };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof CalcSettings)[]) {
    if (k === "coverWidthMm") continue;
    const v = num(fd, k, NaN);
    if (Number.isFinite(v) && v >= 0) raw[k] = v;
  }
  for (const p of METAL_PROFILES) {
    const v = num(fd, `cover_${p}`, NaN);
    if (Number.isFinite(v)) (raw.coverWidthMm as Record<string, number>)[p] = v;
  }
  const settings = normalizeCalcSettings(raw);
  if (settings.tilesPerM2 <= 0 || settings.sarkingRollM2 <= 0 || settings.screwsPerBox <= 0) return { error: "Coverage numbers must be more than 0." };
  const { error } = await ctx.supabase.from("organizations").update({ calc_defaults: settings }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/price-book");
  return { ok: "Saved. New quotes use these assumptions." };
}

/** Instant-quote rates per m² of roof, GST inclusive (website widget). */
export async function saveInstantQuoteRates(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const rates: Record<string, number> = {};
  for (const k of ["metal_m2_low", "metal_m2_high", "tile_m2_low", "tile_m2_high"]) {
    const v = num(fd, k, 0);
    if (v < 0 || v > 5000) return { error: "Rates must be between $0 and $5,000 per m²." };
    rates[k] = v;
  }
  if (rates.metal_m2_low > rates.metal_m2_high || rates.tile_m2_low > rates.tile_m2_high) return { error: "The low rate should not be more than the high rate." };
  const current = (ctx.org.instant_quote ?? {}) as Record<string, unknown>;
  const { error } = await ctx.supabase.from("organizations").update({ instant_quote: { ...current, ...rates } }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/price-book");
  return { ok: "Saved." };
}
