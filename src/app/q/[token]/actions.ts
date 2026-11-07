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
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const extras = [...new Set(String(fd.get("extras") ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
  if (extras.length > 50 || extras.some((x) => !UUID.test(x))) return { error: "Those extras didn't look right. Refresh the page and try again." };
  if (fd.get("agree") !== "on") return { error: "Please confirm you agree to the quote and its terms." };
  if (name.length < 2) return { error: "Type your full name to sign." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "Please draw your signature in the box." };

  const db = anonClient();
  const { data } = await db.rpc("get_public_estimate", { p_token: token });
  if (!data) return { error: "This quote can no longer be accepted. Please contact us." };
  const doc = data as PublicEstimate;
  const p = buildProposal(doc);
  if (p.options.length && !p.options.some((o) => o.id === optionId)) return { error: "Please choose one of the options above." };
  if (extras.some((x) => !p.offered.some((i) => i.id === x && (!i.option_id || i.option_id === optionId)))) {
    return { error: "This quote was just updated. Refresh the page to see the latest version." };
  }
  const total = p.totalWith(extras, optionId).total;

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
    p_extras: extras,
  });
  if (error) return { error: error.message };
  if (!ok) return { error: "This quote can no longer be accepted. Please contact us." };
  revalidatePath(`/q/${token}`);
  return { ok: "Accepted." };
}
