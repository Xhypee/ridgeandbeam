"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { friendly, num } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}

export async function saveInstantQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const low = num(fd, "price_per_square_low", NaN);
  const high = num(fd, "price_per_square_high", NaN);
  if (!(low > 0) || !(high > 0)) return { error: "Enter both prices per square." };
  if (high < low) return { error: "The high price must be at least the low price." };
  if (high > 5000) return { error: "That price per square looks too high." };
  const { error } = await ctx.supabase
    .from("organizations")
    .update({ instant_quote: { ...ctx.org.instant_quote, enabled: fd.get("enabled") === "on", price_per_square_low: low, price_per_square_high: high } })
    .eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/lead-intake");
  return { ok: "Instant quote saved." };
}

export async function saveResponder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.from("organizations").update({ ai_responder_enabled: fd.get("ai_responder_enabled") === "on" }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/lead-intake");
  return { ok: "Saved." };
}

export async function regenerateIntakeKey(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.from("organizations").update({ intake_key: randomBytes(12).toString("hex") }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "New key created. Update the form and webhook URLs on your website and in Zapier — the old ones stop working now." };
}
