"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { disconnect, syncOrg, xeroConfigured } from "@/lib/xero";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}

export async function syncXero(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  if (!xeroConfigured()) return { error: "Xero isn't configured on this server." };
  try {
    const r = await syncOrg(ctx.supabase, ctx.org.id);
    revalidatePath("/app/settings/integrations");
    return r.errors ? { error: r.message } : { ok: r.message };
  } catch (e) {
    revalidatePath("/app/settings/integrations");
    return { error: (e as Error).message };
  }
}

export async function disconnectXero(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  await disconnect(ctx.org.id);
  revalidatePath("/app/settings/integrations");
  return { ok: "Xero disconnected. Nothing was deleted in Xero." };
}

const CODE = /^[A-Za-z0-9.-]{1,10}$/;

/** Xero account codes used for sales (GST on Income), job-cost bills (GST on Expenses) and payments. */
export async function saveXeroAccounts(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const sales = String(fd.get("sales") ?? "").trim();
  const costs = String(fd.get("costs") ?? "").trim();
  const bank = String(fd.get("bank") ?? "").trim();
  if (![sales, costs, bank].every((c) => CODE.test(c))) return { error: "Account codes are short codes from your Xero chart of accounts, e.g. 200, 310, 090." };
  const { data: integ } = await ctx.supabase.from("integrations").select("id, settings").eq("org_id", ctx.org.id).eq("provider", "xero").maybeSingle();
  const settings = { ...((integ?.settings as Record<string, unknown>) ?? {}), sales, costs, bank };
  const { error } = integ
    ? await ctx.supabase.from("integrations").update({ settings }).eq("id", integ.id)
    : await ctx.supabase.from("integrations").insert({ org_id: ctx.org.id, provider: "xero", status: "disconnected", settings });
  if (error) return { error: friendly(error) };
  revalidatePath("/app/settings/integrations");
  return { ok: "Account codes saved." };
}

export async function resolveSyncProblem(fd: FormData) {
  const ctx = await requireAdmin();
  const id = String(fd.get("id"));
  const { data } = await ctx.supabase.from("integration_sync_log").update({ resolved_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id).select("entity, entity_id").maybeSingle();
  // "Send again" option: forget the mapping so the next sync pushes it again.
  if (data?.entity_id && fd.get("forget") === "1") {
    await ctx.supabase.from("external_refs").delete().eq("org_id", ctx.org.id).eq("provider", "xero").eq("entity", data.entity).eq("entity_id", data.entity_id);
  }
  revalidatePath("/app/settings/integrations");
}
