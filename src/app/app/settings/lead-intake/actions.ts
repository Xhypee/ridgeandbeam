"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { friendly } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}

export async function saveInstantQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase
    .from("organizations")
    .update({ instant_quote: { ...ctx.org.instant_quote, enabled: fd.get("enabled") === "on" } })
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
