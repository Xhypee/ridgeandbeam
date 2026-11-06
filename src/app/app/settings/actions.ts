"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOrg } from "@/lib/dal";
import { friendly, num, oneOf, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

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
  const { supabase, org } = await requireOrg();
  const name = str(fd, "name");
  if (!name) return { error: "Crew name is required." };
  const color = /^#[0-9a-f]{6}$/i.test(String(fd.get("color"))) ? String(fd.get("color")) : "#2563eb";
  const { error } = await supabase.from("crews").insert({ org_id: org.id, name, color });
  if (error) return { error: friendly(error) };
  return done("Crew added.");
}

export async function deleteCrew(fd: FormData) {
  const { supabase } = await requireOrg();
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
