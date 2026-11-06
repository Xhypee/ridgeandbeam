"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";
import { PAY_SHEET_KEYS } from "@/lib/production";

const done = (msg = "Saved.") => { revalidatePath("/app", "layout"); return { ok: msg }; };

export async function updateCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, org } = ctx;
  const name = str(fd, "name");
  if (!name) return { error: "Company name is required." };
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      address: str(fd, "address"),
      license_number: str(fd, "license_number"),
      tax_rate: num(fd, "tax_rate"),
      default_waste_pct: num(fd, "default_waste_pct", 10),
      estimate_terms: str(fd, "estimate_terms") ?? "",
      invoice_terms: str(fd, "invoice_terms") ?? "",
    })
    .eq("id", org.id);
  if (error) return { error: friendly(error) };
  return done();
}

const CATS = ["material", "labor", "other"] as const;

export async function saveCatalogItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };
  const row = { name, unit: str(fd, "unit") ?? "ea", unit_price: Math.max(0, num(fd, "unit_price")), category: oneOf(fd, "category", CATS, "material") };
  const { error } = id
    ? await supabase.from("catalog_items").update(row).eq("id", id)
    : await supabase.from("catalog_items").insert({ ...row, org_id: org.id });
  if (error) return { error: friendly(error) };
  return done(id ? "Saved." : "Added.");
}

export async function deleteCatalogItem(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("catalog_items").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/settings");
}

export async function addCrew(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "You don't have permission to do that." };
  const name = str(fd, "name");
  if (!name) return { error: "Crew name is required." };
  const color = /^#[0-9a-f]{6}$/i.test(String(fd.get("color"))) ? String(fd.get("color")) : "#2563eb";
  const { error } = await supabase.from("crews").insert({ org_id: org.id, name, color });
  if (error) return { error: friendly(error) };
  return done("Crew added.");
}

export async function deleteCrew(fd: FormData) {
  const { supabase, isCrewLead } = await requireOrg();
  if (isCrewLead) throw new Error("You don't have permission to do that.");
  const { error } = await supabase.from("crews").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app", "layout");
}

export async function inviteMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const email = str(fd, "email")?.toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter a valid email." };
  const role = oneOf(fd, "role", ["member", "admin", "sales_rep", "crew_lead"] as const, "member");
  const { error } = await ctx.supabase.from("invites").insert({ org_id: ctx.org.id, email, role, invited_by: ctx.user.id });
  if (error) return { error: friendly(error) };
  return done("Invite created. Copy the link below and send it to them.");
}

export async function revokeInvite(fd: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("invites").delete().eq("id", String(fd.get("id")));
  revalidatePath("/app/settings");
}

export async function removeMember(fd: FormData) {
  const { supabase, org } = await requireAdmin();
  const { error } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", String(fd.get("user_id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/settings");
}

// ---------------------------------------------------------------------------
// Production: crew pay sheets ($/m²), member settings, commission plans
// ---------------------------------------------------------------------------
const money2 = (fd: FormData, k: string) => Math.max(0, Math.round(num(fd, k) * 100) / 100);

export async function updateCrew(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, canSeeMoney } = await requireOrg();
  if (!canSeeMoney) return { error: "You don't have permission to do that." };
  const name = str(fd, "name");
  if (!name) return { error: "Crew name is required." };
  const color = /^#[0-9a-f]{6}$/i.test(String(fd.get("color"))) ? String(fd.get("color")) : "#2563eb";
  const { error } = await supabase.from("crews").update({
    name, color,
    phone: str(fd, "phone"),
    is_subcontractor: fd.get("is_subcontractor") === "on",
    ...Object.fromEntries(PAY_SHEET_KEYS.map((k) => [k, money2(fd, k)])),
  }).eq("id", String(fd.get("id")));
  if (error) return { error: friendly(error) };
  return done("Crew saved.");
}

/** New portal link for a crew (the old link stops working). */
export async function resetCrewLink(fd: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("crews").update({ public_token: randomBytes(18).toString("hex") }).eq("id", String(fd.get("id")));
  revalidatePath("/app/settings/crews");
}

const ROLES = ["member", "admin", "sales_rep", "crew_lead"] as const;

export async function updateMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, org, user } = ctx;
  const userId = String(fd.get("user_id"));
  const { data: m } = await supabase.from("memberships").select("role").eq("org_id", org.id).eq("user_id", userId).maybeSingle();
  if (!m) return { error: "Member not found." };
  const role = fd.has("role") ? oneOf(fd, "role", ROLES, "member") : null;
  if (role && m.role !== "owner" && role !== m.role) {
    if (userId === user.id) return { error: "You can't change your own role." };
    const { error } = await supabase.from("memberships").update({ role }).eq("org_id", org.id).eq("user_id", userId);
    if (error) return { error: friendly(error) };
  }
  const { error } = await supabase.rpc("set_member_settings", {
    p_org: org.id, p_user: userId, p_crew: str(fd, "crew_id"), p_plan: str(fd, "commission_plan_id"), p_phone: str(fd, "phone"),
  });
  if (error) return { error: friendly(error) };
  return done("Member updated.");
}

const PLAN_KINDS = ["pct_contract", "pct_gross_profit", "split_10_50_50"] as const;

export async function saveCommissionPlan(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Name the plan." };
  const rate = num(fd, "rate", NaN);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Rate must be between 0 and 100%." };
  const row = { name, kind: oneOf(fd, "kind", PLAN_KINDS, "pct_contract"), rate, draw_amount: money2(fd, "draw_amount") };
  const { error } = id
    ? await ctx.supabase.from("commission_plans").update(row).eq("id", id)
    : await ctx.supabase.from("commission_plans").insert({ ...row, org_id: ctx.org.id });
  if (error) return { error: friendly(error) };
  return done(id ? "Plan saved." : "Plan added.");
}

export async function deleteCommissionPlan(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("commission_plans").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/settings", "layout");
}
