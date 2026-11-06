import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Organization } from "@/lib/types";

export const ORG_COOKIE = "rd_org";

/** Verified current user (validates the JWT). Redirects to /login when signed out. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return {
    id: claims.sub as string,
    email: (claims.email as string | undefined) ?? "",
    fullName: ((claims.user_metadata as Record<string, unknown> | undefined)?.full_name as string | undefined) ?? "",
  };
});

export const getMemberships = cache(async () => {
  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, full_name, email, crew_id, phone, organizations(*)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as (Membership & { organizations: Organization })[];
});

/**
 * The organization the user is working in (chosen via cookie, falling back to their first).
 * Redirects to onboarding when the user has no company yet.
 */
export const requireOrg = cache(async () => {
  const user = await getUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.org_id === wanted) ?? memberships[0];
  const supabase = await createClient();
  return {
    supabase,
    user,
    org: m.organizations,
    role: m.role,
    isAdmin: m.role === "owner" || m.role === "admin",
    /** Sees prices, costs, margins and other reps' money. */
    canSeeMoney: m.role !== "crew_lead",
    isCrewLead: m.role === "crew_lead",
    isSalesRep: m.role === "sales_rep",
    crewId: m.crew_id ?? null,
    memberships,
  };
});

export async function requireAdmin() {
  const ctx = await requireOrg();
  if (!ctx.isAdmin) throw new Error("Only owners and admins can do that.");
  return ctx;
}

/** Blocks crew leads from money pages (prices, invoices, costs, commissions of others). */
export async function requireMoneyAccess() {
  const ctx = await requireOrg();
  if (!ctx.canSeeMoney) redirect("/app/schedule");
  return ctx;
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Office",
  sales_rep: "Sales rep",
  crew_lead: "Crew lead",
};
