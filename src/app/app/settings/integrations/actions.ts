"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { disconnect, qboConfigured, syncOrg } from "@/lib/quickbooks";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}

export async function syncQuickBooks(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  if (!qboConfigured()) return { error: "QuickBooks isn't configured on this server." };
  try {
    const r = await syncOrg(ctx.supabase, ctx.org.id);
    revalidatePath("/app/settings/integrations");
    return r.errors ? { error: r.message } : { ok: r.message };
  } catch (e) {
    revalidatePath("/app/settings/integrations");
    return { error: (e as Error).message };
  }
}

export async function disconnectQuickBooks(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  await disconnect(ctx.org.id);
  revalidatePath("/app/settings/integrations");
  return { ok: "QuickBooks disconnected. Nothing was deleted in QuickBooks." };
}

export async function resolveSyncProblem(fd: FormData) {
  const ctx = await requireAdmin();
  const id = String(fd.get("id"));
  const { data } = await ctx.supabase.from("integration_sync_log").update({ resolved_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id).select("entity, entity_id").maybeSingle();
  // "Re-create" option: forget the mapping so the next sync pushes it again.
  if (data?.entity_id && fd.get("forget") === "1") {
    await ctx.supabase.from("external_refs").delete().eq("org_id", ctx.org.id).eq("provider", "quickbooks").eq("entity", data.entity).eq("entity_id", data.entity_id);
  }
  revalidatePath("/app/settings/integrations");
}
