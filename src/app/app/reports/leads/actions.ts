"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { friendly, num, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";
import { normSource } from "./report";

export async function saveLeadSpend(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const source = normSource(str(fd, "source"));
  const month = str(fd, "month"); // YYYY-MM
  const amount = num(fd, "amount", NaN);
  if (source === "unknown") return { error: "Which lead source?" };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  if (!(amount >= 0) || amount > 10_000_000) return { error: "Enter what you spent (0 or more)." };
  const { error } = await ctx.supabase.from("lead_spend").upsert({ org_id: ctx.org.id, source, month: `${month}-01`, amount }, { onConflict: "org_id,source,month" });
  if (error) return { error: friendly(error) };
  revalidatePath("/app/reports/leads");
  return { ok: `Saved ${source} spend for ${month}.` };
}

export async function deleteLeadSpend(fd: FormData) {
  const ctx = await requireAdmin();
  await ctx.supabase.from("lead_spend").delete().eq("id", String(fd.get("id"))).eq("org_id", ctx.org.id);
  revalidatePath("/app/reports/leads");
}
