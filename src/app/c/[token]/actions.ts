"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/components/action-form";
import { anonClient } from "@/lib/public";

export async function approveChangeOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const signature = String(fd.get("signature") ?? "");
  if (fd.get("agree") !== "on") return { error: "Please confirm you approve the change and its price." };
  if (name.length < 2) return { error: "Type your full name." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "Please sign in the box." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const { data, error } = await anonClient().rpc("approve_public_change_order", {
    p_token: token, p_name: name, p_signature: signature, p_ip: ip, p_user_agent: h.get("user-agent"),
  });
  if (error) return { error: error.message };
  if (!data) return { error: "This change order can no longer be approved. Please contact us." };
  revalidatePath(`/c/${token}`);
  return { ok: "Approved. Thank you!" };
}

export async function declineChangeOrder(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  await anonClient().rpc("decline_public_change_order", { p_token: token });
  revalidatePath(`/c/${token}`);
}
