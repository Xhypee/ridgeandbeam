"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { anonClient } from "@/lib/public";

/** The supplier confirms the order from the link in the email (no login). */
export async function confirmOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { error: "This link isn't right." };
  const date = String(fd.get("date") ?? "").trim();
  const { data, error } = await anonClient().rpc("confirm_supplier_order", {
    p_token: token, p_ref: String(fd.get("ref") ?? "").slice(0, 60) || null,
    p_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, p_note: String(fd.get("note") ?? "").slice(0, 1000) || null,
  });
  if (error) return { error: "Couldn't confirm right now. Reply to the email instead." };
  const r = data as { ok: boolean; error?: string };
  if (!r?.ok) return { error: r?.error ?? "Couldn't confirm." };
  revalidatePath(`/o/${token}`);
  return { ok: "Thanks, confirmed." };
}
