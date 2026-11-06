"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, ORG_COOKIE } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function createCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getUser();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Company name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_full_name: String(fd.get("full_name") ?? "").trim() || user.fullName || null,
  });
  if (error) return { error: error.message };
  const orgId = data as string;
  const phone = String(fd.get("phone") ?? "").trim();
  const tax = Number(fd.get("tax_rate") ?? 0);
  await supabase.from("organizations").update({ phone: phone || null, tax_rate: Number.isFinite(tax) ? tax : 0 }).eq("id", orgId);
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/app");
}
