"use server";
// The homeowner signs off their finished roof from the project page (the office can also get it signed on site).

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/components/action-form";
import { anonClient } from "@/lib/public";

export async function signOffRoof(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const signature = String(fd.get("signature") ?? "");
  if (fd.get("agree") !== "on") return { error: "Please confirm the work is finished to your satisfaction." };
  if (name.length < 2) return { error: "Type your full name." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "Please sign in the box." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const { data, error } = await anonClient().rpc("sign_public_walkthrough", { p_token: token, p_name: name, p_signature: signature, p_ip: ip, p_user_agent: h.get("user-agent") });
  if (error) return { error: "That didn't save. Please try again or call us." };
  if (!data) return { error: "This roof has already been signed off, or isn't finished yet." };
  revalidatePath(`/p/${token}`);
  return { ok: "Signed off. Thank you!" };
}
