"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import { CALC_KEY_MAP } from "@/lib/calc-keys";
import { SHEET_UNITS } from "@/lib/price-sheet";

const BASE = "/app/settings/suppliers";

/** Owners, admins and office staff manage suppliers and price sheets (RLS enforces the same). */
async function requireSupplierEditor() {
  const ctx = await requireMoneyAccess();
  if (!ctx.isAdmin && ctx.role !== "member") throw new Error("Only owners, admins and office staff can change suppliers.");
  return ctx;
}
async function editorOrError() {
  try { return { ctx: await requireSupplierEditor() }; } catch (e) { return { error: (e as Error).message }; }
}

function touch(id?: string) {
  revalidatePath(BASE);
  if (id) revalidatePath(`${BASE}/${id}`);
  revalidatePath("/app/orders");
}

const emailOrNull = (v: string | null) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "invalid" : v);

export async function addSupplier(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase, org, isAdmin } = r.ctx!;
  const supplierId = str(fd, "supplier_id");
  const customName = str(fd, "custom_name");
  if (!supplierId && !customName) return { error: "Pick a supplier from the list or type your supplier's name." };
  if (supplierId && !/^[0-9a-f-]{36}$/.test(supplierId)) return { error: "Pick a supplier from the list." };
  const branchEmail = emailOrNull(str(fd, "branch_email"));
  if (branchEmail === "invalid") return { error: "Enter a valid branch email." };
  const { data, error } = await supabase.from("org_suppliers").insert({
    org_id: org.id,
    supplier_id: supplierId,
    custom_name: supplierId ? null : customName!.slice(0, 120),
    account_number: str(fd, "account_number")?.slice(0, 60) ?? null,
    branch_name: str(fd, "branch_name")?.slice(0, 120) ?? null,
    branch_email: branchEmail,
    branch_phone: str(fd, "branch_phone")?.slice(0, 40) ?? null,
  }).select("id").single();
  if (error) return { error: error.code === "23505" ? "That supplier is already on your list." : friendly(error) };
  // First supplier becomes the default automatically.
  if (isAdmin && !org.default_supplier_id) await supabase.rpc("set_default_supplier", { p_org: org.id, p_org_supplier: data.id });
  touch();
  return { ok: "Supplier added. Import their price sheet next." };
}

export async function updateSupplier(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase } = r.ctx!;
  const id = String(fd.get("id"));
  const branchEmail = emailOrNull(str(fd, "branch_email"));
  if (branchEmail === "invalid") return { error: "Enter a valid branch email." };
  const patch: Record<string, unknown> = {
    account_number: str(fd, "account_number")?.slice(0, 60) ?? null,
    branch_name: str(fd, "branch_name")?.slice(0, 120) ?? null,
    branch_email: branchEmail,
    branch_phone: str(fd, "branch_phone")?.slice(0, 40) ?? null,
  };
  if (fd.has("custom_name")) {
    const n = str(fd, "custom_name");
    if (!n) return { error: "Give the supplier a name." };
    patch.custom_name = n.slice(0, 120);
  }
  const { data, error } = await supabase.from("org_suppliers").update(patch).eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Supplier not found." };
  touch(id);
  return { ok: "Saved." };
}

export async function setDefaultSupplier(fd: FormData) {
  const { supabase, org, isAdmin } = await requireMoneyAccess();
  if (!isAdmin) throw new Error("Only owners and admins can change the default supplier.");
  const id = String(fd.get("id"));
  const { error } = await supabase.rpc("set_default_supplier", { p_org: org.id, p_org_supplier: id });
  if (error) throw new Error(friendly(error));
  touch(id);
}

export async function removeSupplier(fd: FormData) {
  const { supabase } = await requireSupplierEditor();
  const id = String(fd.get("id"));
  const { error } = await supabase.from("org_suppliers").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
  touch();
}

const MarkupSchema = z.object({
  material: z.coerce.number().finite().min(0, "Markup can't be negative.").max(500, "Markup looks too high."),
  labor: z.coerce.number().finite().min(0, "Markup can't be negative.").max(500, "Markup looks too high."),
  other: z.coerce.number().finite().min(0, "Markup can't be negative.").max(500, "Markup looks too high."),
});

export async function saveMarkup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, isAdmin } = await requireMoneyAccess();
  if (!isAdmin) return { error: "Only owners and admins can change markup." };
  const parsed = MarkupSchema.safeParse({ material: fd.get("material"), labor: fd.get("labor"), other: fd.get("other") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the markup values." };
  const { error } = await supabase.from("organizations").update({ markup_pct: { ...(org.markup_pct ?? {}), ...parsed.data } }).eq("id", org.id);
  if (error) return { error: friendly(error) };
  touch();
  return { ok: "Markup saved." };
}

// ---------------------------------------------------------------------------
// Price sheet import: begin (inactive list) → append rows in chunks → finish (activate).
// ---------------------------------------------------------------------------
const BeginSchema = z.object({
  orgSupplierId: z.uuid(),
  name: z.string().trim().min(1, "Name this price list.").max(120),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date these prices apply from."),
  pricesIncludeGst: z.boolean(),
  filename: z.string().trim().max(200).nullable(),
  authorised: z.literal(true, { error: "Tick the box to confirm you're authorised to use this price list." }),
  mapping: z.record(z.string(), z.string().max(120)).optional(),
});
export type BeginImportInput = z.input<typeof BeginSchema>;

export async function beginImport(input: BeginImportInput): Promise<{ error?: string; listId?: string }> {
  const parsed = BeginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the import details." };
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase, org, user } = r.ctx!;
  const b = parsed.data;
  const { data: os } = await supabase.from("org_suppliers").select("id").eq("id", b.orgSupplierId).eq("org_id", org.id).maybeSingle();
  if (!os) return { error: "Supplier not found." };
  // Drop any earlier import of this supplier that never finished.
  await supabase.from("supplier_price_lists").delete().eq("org_supplier_id", os.id).eq("status", "importing");
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("supplier_price_lists").insert({
    org_id: org.id, org_supplier_id: os.id, name: b.name, effective_date: b.effectiveDate, prices_include_gst: b.pricesIncludeGst,
    source_filename: b.filename, is_active: false, status: "importing", imported_by: user.id, authorised_at: now, authorised_by: user.id,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  if (b.mapping) await supabase.from("org_suppliers").update({ import_mapping: { columns: b.mapping, prices_include_gst: b.pricesIncludeGst } }).eq("id", os.id);
  return { listId: data.id };
}

const num = z.number().finite().nullable();
const RowSchema = z.object({
  product_code: z.string().trim().max(80).nullable(),
  description: z.string().trim().min(1).max(400),
  profile: z.string().trim().max(120).nullable(),
  finish: z.string().trim().max(120).nullable(),
  thickness_mm: num.refine((v) => v === null || (v > 0 && v < 10)),
  cover_width_mm: num.refine((v) => v === null || (v > 0 && v < 10000)),
  girth_mm: num.refine((v) => v === null || (v >= 0 && v < 100000)),
  length_mm: num.refine((v) => v === null || (v > 0 && v < 100000)),
  unit: z.enum(SHEET_UNITS),
  pack_qty: num.refine((v) => v === null || (v > 0 && v < 1e9)),
  cost_ex_gst: z.number().finite().min(0).max(1e9),
  calc_key: z.string().nullable().refine((v) => v === null || Boolean(CALC_KEY_MAP[v]), "Unknown estimating item."),
  raw: z.record(z.string(), z.string().max(500)).optional(),
});
export type ImportRow = z.input<typeof RowSchema>;

export async function appendImportRows(listId: string, rows: ImportRow[]): Promise<{ error?: string; inserted?: number }> {
  if (!/^[0-9a-f-]{36}$/.test(listId)) return { error: "Bad price list." };
  if (rows.length > 1000) return { error: "Too many rows in one batch." };
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Row ${Number(i?.path?.[0] ?? 0) + 1}: ${i?.message ?? "invalid"}` };
  }
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase, org } = r.ctx!;
  const { data: list } = await supabase.from("supplier_price_lists").select("id, status").eq("id", listId).eq("org_id", org.id).maybeSingle();
  if (!list || list.status !== "importing") return { error: "This import has expired. Start again." };
  const { error } = await supabase.from("supplier_price_items").insert(parsed.data.map((x) => ({ ...x, org_id: org.id, price_list_id: listId })));
  if (error) return { error: friendly(error) };
  return { inserted: parsed.data.length };
}

export async function finishImport(listId: string): Promise<{ error?: string; ok?: string }> {
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase, org } = r.ctx!;
  const { data: list } = await supabase.from("supplier_price_lists").select("id, org_supplier_id, status").eq("id", listId).eq("org_id", org.id).maybeSingle();
  if (!list) return { error: "Price list not found." };
  const { count } = await supabase.from("supplier_price_items").select("id", { count: "exact", head: true }).eq("price_list_id", listId);
  if (!count) return { error: "No rows were imported." };
  const { error } = await supabase.rpc("activate_supplier_price_list", { p_list: listId });
  if (error) return { error: friendly(error) };
  touch(list.org_supplier_id);
  return { ok: `${count} price${count === 1 ? "" : "s"} saved as the active price list.` };
}

export async function cancelImport(listId: string): Promise<void> {
  const { supabase } = await requireSupplierEditor();
  await supabase.from("supplier_price_lists").delete().eq("id", listId).eq("status", "importing");
}

/** Make an older version the active one again. */
export async function activateList(fd: FormData) {
  const { supabase } = await requireSupplierEditor();
  const id = String(fd.get("list_id"));
  const { data: list } = await supabase.from("supplier_price_lists").select("org_supplier_id, status").eq("id", id).maybeSingle();
  if (!list || list.status !== "ready") throw new Error("Price list not found.");
  const { error } = await supabase.rpc("activate_supplier_price_list", { p_list: id });
  if (error) throw new Error(friendly(error));
  touch(list.org_supplier_id);
}

export async function deleteList(fd: FormData) {
  const { supabase } = await requireSupplierEditor();
  const id = String(fd.get("list_id"));
  const { data: list } = await supabase.from("supplier_price_lists").select("org_supplier_id, is_active").eq("id", id).maybeSingle();
  if (!list) return;
  if (list.is_active) throw new Error("Make another version active before deleting this one.");
  await supabase.from("supplier_price_lists").delete().eq("id", id);
  touch(list.org_supplier_id);
}

// ---------------------------------------------------------------------------
// Fixing calc-key mappings after import
// ---------------------------------------------------------------------------
const keyOrNull = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return CALC_KEY_MAP[s] ? s : undefined;
};

export async function mapItem(itemId: string, calcKey: string): Promise<{ error?: string; ok?: string }> {
  const key = keyOrNull(calcKey);
  if (key === undefined) return { error: "Unknown estimating item." };
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return { error: "Bad item." };
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { data, error } = await r.ctx!.supabase.from("supplier_price_items").update({ calc_key: key }).eq("id", itemId).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Item not found." };
  revalidatePath(BASE, "layout");
  return { ok: "Mapped." };
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function bulkMapItems(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await editorOrError();
  if (r.error) return { error: r.error };
  const { supabase, org } = r.ctx!;
  const listId = String(fd.get("list_id"));
  const needle = str(fd, "needle");
  const key = keyOrNull(fd.get("calc_key"));
  if (!needle) return { error: "Type the words to match, e.g. “gutter”." };
  if (key === undefined) return { error: "Choose what those rows are." };
  const pattern = `%${escLike(needle)}%`;
  const ids = new Set<string>();
  for (const col of ["description", "profile", "product_code"] as const) {
    const { data, error } = await supabase.from("supplier_price_items").update({ calc_key: key }).eq("org_id", org.id).eq("price_list_id", listId).ilike(col, pattern).select("id");
    if (error) return { error: friendly(error) };
    for (const d of data ?? []) ids.add(d.id);
  }
  revalidatePath(BASE, "layout");
  return { ok: ids.size ? `Mapped ${ids.size} row${ids.size === 1 ? "" : "s"} containing “${needle}” to ${key ? CALC_KEY_MAP[key].label : "not mapped"}.` : `No rows contain “${needle}”.` };
}
