"use server";

import { revalidatePath } from "next/cache";
import { anonClient } from "@/lib/public";
import type { ActionResult } from "@/components/action-form";

export async function acceptEstimate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (fd.get("agree") !== "on") return { error: "Please confirm you agree to the estimate and terms." };
  if (name.length < 2) return { error: "Type your full name to sign." };
  const { data, error } = await anonClient().rpc("accept_public_estimate", { p_token: token, p_name: name });
  if (error) return { error: error.message };
  if (!data) return { error: "This estimate can no longer be accepted. Please contact us." };
  revalidatePath(`/q/${token}`);
  return { ok: "Accepted." };
}
