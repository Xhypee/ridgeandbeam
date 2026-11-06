"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, ORG_COOKIE } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function acceptInvite(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_token: String(fd.get("token")), p_full_name: user.fullName || null });
  if (error) return { error: error.message };
  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/app");
}
