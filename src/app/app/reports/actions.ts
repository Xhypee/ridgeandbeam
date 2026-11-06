"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

const KINDS = ["advance", "draw", "final", "chargeback", "adjustment"] as const;

/** Admin records a commission payout, draw or chargeback (chargebacks are entered as positive amounts). */
export async function recordPayout(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, org } = ctx;
  const userId = str(fd, "user_id");
  if (!userId) return { error: "Pick a rep." };
  const amount = Math.round(num(fd, "amount", NaN) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a positive amount (chargebacks are subtracted automatically)." };
  const paidOn = str(fd, "paid_on");
  if (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Use a valid date." };
  const { data: member } = await supabase.from("memberships").select("user_id").eq("org_id", org.id).eq("user_id", userId).maybeSingle();
  if (!member) return { error: "That person isn't on your team." };
  const { error } = await supabase.from("commission_payouts").insert({
    org_id: org.id, user_id: userId, job_id: str(fd, "job_id"), kind: oneOf(fd, "kind", KINDS, "final"), amount,
    ...(paidOn ? { paid_on: paidOn } : {}), notes: str(fd, "notes"),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/app/reports/commissions");
  return { ok: "Payout recorded." };
}

export async function deletePayout(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("commission_payouts").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/reports/commissions");
}
