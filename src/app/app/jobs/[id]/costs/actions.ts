"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";
import { COST_CATEGORIES } from "@/lib/production";

/** Add or edit a job cost line. Negative amounts are credits. */
export async function saveCost(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireMoneyAccess();
  const id = str(fd, "id");
  const jobId = String(fd.get("job_id"));
  const amount = num(fd, "amount", NaN);
  if (!Number.isFinite(amount) || amount === 0) return { error: "Enter an amount (negative for a credit)." };
  if (Math.abs(amount) > 10_000_000) return { error: "That amount looks wrong." };
  const incurred = str(fd, "incurred_on");
  if (incurred && !/^\d{4}-\d{2}-\d{2}$/.test(incurred)) return { error: "Use a valid date." };
  const row = {
    category: oneOf(fd, "category", COST_CATEGORIES, "other"),
    vendor: str(fd, "vendor"),
    description: str(fd, "description"),
    amount: Math.round(amount * 100) / 100,
    ...(incurred ? { incurred_on: incurred } : {}),
  };
  const { error } = id
    ? await supabase.from("job_costs").update(row).eq("id", id).eq("job_id", jobId)
    : await supabase.from("job_costs").insert({ ...row, org_id: org.id, job_id: jobId, source: "manual", created_by: user.id });
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${jobId}`, "layout");
  revalidatePath("/app/reports", "layout");
  return { ok: id ? "Cost updated." : "Cost added." };
}

export async function deleteCost(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const jobId = String(fd.get("job_id"));
  const { error } = await supabase.from("job_costs").delete().eq("id", String(fd.get("id"))).eq("job_id", jobId);
  if (error) throw new Error(friendly(error));
  revalidatePath(`/app/jobs/${jobId}`, "layout");
}
