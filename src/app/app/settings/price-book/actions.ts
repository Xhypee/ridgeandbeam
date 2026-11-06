"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyAccess } from "@/lib/dal";
import { CERTIFICATIONS, TIERS } from "@/lib/estimating";
import { friendly, num, oneOf, str } from "@/lib/form";
import { PRICE_BOOK_KEYS } from "@/lib/roof";
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
  const certRaw = str(fd, "requires_certification");
  const cert = certRaw && (CERTIFICATIONS as readonly string[]).includes(certRaw) && certRaw !== "Other" ? certRaw : certRaw ? certRaw.slice(0, 80) : null;
  const row: Record<string, unknown> = {
    name,
    unit: str(fd, "unit") ?? "ea",
    unit_price: price,
    unit_cost: cost,
    category: oneOf(fd, "category", CATS, "material"),
    tier,
    warranty: str(fd, "warranty"),
    requires_certification: cert,
  };
  if (fd.has("calc_key")) {
    const key = str(fd, "calc_key");
    row.calc_key = key && (PRICE_BOOK_KEYS as readonly string[]).includes(key) ? key : null;
  }
  if (row.calc_key == null && tier && !id) return { error: "Tiers only matter for calculator items. Pick a calculator key or leave the tier blank." };
  const { error } = id
    ? await supabase.from("catalog_items").update(row).eq("id", id)
    : await supabase.from("catalog_items").insert({ ...row, org_id: org.id });
  if (error) {
    if (error.code === "23505") return { error: "There's already an item for that calculator key and tier. Edit that one, or choose another tier." };
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
