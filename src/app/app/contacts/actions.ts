"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { formatAbn, isValidAbn } from "@/lib/au";
import { isContactType } from "@/lib/contacts";
import { requireOrg } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import { CONTACT_KINDS, CUSTOMER_SOURCES, type ContactKind } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT = ["name", "email", "phone", "address", "city", "zip", "notes", "company", "trade", "licence_no", "licence_class", "pl_cover", "payment_terms", "rate", "bank_name", "bank_bsb", "bank_account"] as const;
const DATES = ["follow_up_on", "licence_expiry", "pl_expiry", "workcover_expiry"] as const;

/** Only the fields the form actually showed are written, so switching type doesn't wipe the others. */
function contactPatch(fd: FormData): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  for (const k of TEXT) if (fd.has(k)) patch[k] = str(fd, k)?.slice(0, k === "notes" ? 4000 : 200) ?? null;
  for (const k of DATES) if (fd.has(k)) { const v = str(fd, k); if (v && !DATE.test(v)) return { patch, error: "Check the dates." }; patch[k] = v; }
  if (fd.has("state")) patch.state = str(fd, "state")?.toUpperCase() ?? null;
  if (fd.has("kind")) { const k = String(fd.get("kind")); patch.kind = (CONTACT_KINDS as readonly string[]).includes(k) ? (k as ContactKind) : "customer"; }
  if (fd.has("source")) { const s = String(fd.get("source")); patch.source = (CUSTOMER_SOURCES as readonly string[]).includes(s) ? s : "other"; }
  if (fd.has("abn")) { const a = str(fd, "abn"); if (a && !isValidAbn(a)) return { patch, error: "That ABN doesn't look right (11 digits)." }; patch.abn = a ? formatAbn(a) : null; }
  if (fd.has("retention_pct")) { const r = str(fd, "retention_pct"); const n = r === null ? null : Number(r); if (n !== null && (!Number.isFinite(n) || n < 0 || n > 20)) return { patch, error: "Retention is a percentage between 0 and 20." }; patch.retention_pct = n; }
  if (fd.has("gst_registered")) { const g = String(fd.get("gst_registered")); patch.gst_registered = g === "yes" ? true : g === "no" ? false : null; }
  if (patch.email && !EMAIL.test(String(patch.email))) return { patch, error: "Enter a valid email." };
  return { patch };
}

function supplierPatch(fd: FormData): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  for (const k of ["branch_name", "branch_phone", "account_number", "rep_name", "rep_phone", "bank_name", "bank_bsb", "bank_account"]) if (fd.has(k)) patch[k] = str(fd, k)?.slice(0, 120) ?? null;
  if (fd.has("notes")) patch.notes = str(fd, "notes")?.slice(0, 4000) ?? null;
  if (fd.has("branch_email")) { const e = str(fd, "branch_email"); if (e && !EMAIL.test(e)) return { patch, error: "Enter a valid ordering email." }; patch.branch_email = e; }
  if (fd.has("abn")) { const a = str(fd, "abn"); if (a && !isValidAbn(a)) return { patch, error: "That ABN doesn't look right (11 digits)." }; patch.abn = a ? formatAbn(a) : null; }
  return { patch };
}

const done = () => revalidatePath("/app", "layout");

export async function createContact(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, role, isAdmin } = await requireOrg();
  const type = String(fd.get("type"));
  if (!isContactType(type)) return { error: "Choose what they are." };
  const name = str(fd, "name");
  if (!name) return { error: "Give them a name." };
  if (type === "supplier") {
    if (!isAdmin && role !== "member") return { error: "Only owners, admins and office staff can add suppliers." };
    const { patch, error: bad } = supplierPatch(fd);
    if (bad) return { error: bad };
    const { data, error } = await supabase.from("org_suppliers").insert({ ...patch, org_id: org.id, custom_name: name.slice(0, 120) }).select("id").single();
    if (error) return { error: error.code === "23505" ? "That supplier is already in your contacts." : friendly(error) };
    if (isAdmin && !org.default_supplier_id) await supabase.rpc("set_default_supplier", { p_org: org.id, p_org_supplier: data.id });
    done();
    redirect(`/app/contacts?supplier=${data.id}`);
  }
  const { patch, error: bad } = contactPatch(fd);
  if (bad) return { error: bad };
  const { data, error } = await supabase.from("customers").insert({ ...patch, kind: type, name: name.slice(0, 200), org_id: org.id, created_by: user.id }).select("id").single();
  if (error) return { error: friendly(error) };
  done();
  redirect(`/app/contacts?contact=${data.id}`);
}

export async function updateContact(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const id = String(fd.get("id"));
  const { patch, error: bad } = contactPatch(fd);
  if (bad) return { error: bad };
  if ("name" in patch && !patch.name) return { error: "Give them a name." };
  const { data, error } = await supabase.from("customers").update(patch).eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Contact not found." };
  done();
  return { ok: "Saved." };
}

export async function updateSupplierContact(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, role, isAdmin } = await requireOrg();
  if (!isAdmin && role !== "member") return { error: "Only owners, admins and office staff can change suppliers." };
  const id = String(fd.get("id"));
  const { patch, error: bad } = supplierPatch(fd);
  if (bad) return { error: bad };
  if (fd.has("custom_name")) { const n = str(fd, "custom_name"); if (!n) return { error: "Give the supplier a name." }; patch.custom_name = n.slice(0, 120); }
  const { data, error } = await supabase.from("org_suppliers").update(patch).eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Supplier not found." };
  done();
  return { ok: "Saved." };
}

export async function addPerson(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const name = str(fd, "name");
  if (!name) return { error: "Add their name." };
  const email = str(fd, "email");
  if (email && !EMAIL.test(email)) return { error: "Enter a valid email." };
  const { error } = await supabase.from("contact_people").insert({ org_id: org.id, contact_id: String(fd.get("contact_id")), name: name.slice(0, 120), role: str(fd, "role")?.slice(0, 80) ?? null, phone: str(fd, "phone")?.slice(0, 40) ?? null, email });
  if (error) return { error: friendly(error) };
  done();
  return { ok: "Added." };
}

export async function removePerson(fd: FormData) {
  const { supabase } = await requireOrg();
  await supabase.from("contact_people").delete().eq("id", String(fd.get("id")));
  done();
}

export async function addToJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const jobId = str(fd, "job_id");
  if (!jobId) return { error: "Pick a job." };
  const contactId = String(fd.get("contact_id"));
  const { data: dup } = await supabase.from("job_contacts").select("id").eq("job_id", jobId).eq("contact_id", contactId).limit(1);
  if (dup?.length) return { error: "Already on that job." };
  const { error } = await supabase.from("job_contacts").insert({ org_id: org.id, job_id: jobId, contact_id: contactId, role: str(fd, "role")?.slice(0, 80) ?? null });
  if (error) return { error: friendly(error) };
  done();
  return { ok: "Added to the job." };
}

export async function removeFromJob(fd: FormData) {
  const { supabase } = await requireOrg();
  await supabase.from("job_contacts").delete().eq("job_id", String(fd.get("job_id"))).eq("contact_id", String(fd.get("contact_id")));
  done();
}
