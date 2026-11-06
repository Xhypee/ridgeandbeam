"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { anonClient } from "@/lib/public";
import type { ActionResult } from "@/components/action-form";
import { buildProposal, type PublicEstimate } from "./model";

export async function acceptEstimate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const signature = String(fd.get("signature") ?? "");
  const optionId = String(fd.get("option_id") ?? "") || null;
  if (fd.get("agree") !== "on") return { error: "Please confirm you agree to the estimate and terms." };
  if (name.length < 2) return { error: "Type your full name to sign." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "Please draw your signature in the box." };

  const db = anonClient();
  const { data } = await db.rpc("get_public_document", { p_kind: "estimate", p_token: token });
  if (!data) return { error: "This estimate can no longer be accepted. Please contact us." };
  const doc = data as PublicEstimate;
  const p = buildProposal(doc);
  if (p.options.length && !p.options.some((o) => o.id === optionId)) return { error: "Please choose one of the options above." };
  const total = p.options.find((o) => o.id === optionId)?.total ?? p.totals.total;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const { data: ok, error } = await db.rpc("accept_public_estimate", {
    p_token: token,
    p_name: name,
    p_option_id: optionId,
    p_signature: signature,
    p_ip: ip,
    p_user_agent: h.get("user-agent"),
    p_notices: p.snapshot(total),
  });
  if (error) return { error: error.message };
  if (!ok) return { error: "This estimate can no longer be accepted. Please contact us." };
  revalidatePath(`/q/${token}`);
  return { ok: "Accepted." };
}
