"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMemberships, ORG_COOKIE } from "@/lib/dal";

export async function switchOrg(fd: FormData) {
  const orgId = String(fd.get("org_id") ?? "");
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.org_id === orgId)) throw new Error("Not a member of that company.");
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/app");
}
