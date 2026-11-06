/**
 * Suppliers & price books (builder S). Contract 1 (S → E): `supplierPriceBook` turns an org
 * supplier's ACTIVE imported price list into one price row per calc key, in the calc key's unit,
 * with cost ex GST and sell inc GST = cost × (1 + markup_pct[category]/100) × 1.1.
 * Trade prices are private to the org; RLS also hides them from crew leads.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CALC_KEYS, CALC_KEY_MAP, type CalcCategory } from "./calc-keys";
import { calcUnitsPerSupplierUnit, sellIncGst } from "./price-sheet";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PriceRow = {
  calc_key: string;
  name: string;
  unit: string;
  unit_cost_ex_gst: number;
  unit_price_inc_gst: number;
  supplier_price_item_id: string;
  product_code: string | null;
  pack_qty: number | null;
  profile?: string | null;
  finish?: string | null;
  cover_width_mm?: number | null;
  thickness_mm?: number | null;
};

export type PriceBookOptions = { profile?: string | null; finish?: string | null };

/** A stored supplier_price_items row (the columns pricing needs). */
export type PriceItem = {
  id: string;
  product_code: string | null;
  description: string;
  profile: string | null;
  finish: string | null;
  thickness_mm: number | null;
  cover_width_mm: number | null;
  girth_mm?: number | null;
  length_mm: number | null;
  unit: string;
  pack_qty: number | null;
  cost_ex_gst: number;
  calc_key: string | null;
};

export const PRICE_ITEM_COLUMNS = "id, product_code, description, profile, finish, thickness_mm, cover_width_mm, girth_mm, length_mm, unit, pack_qty, cost_ex_gst, calc_key";

export const SUPPLIER_CATEGORY_LABEL: Record<string, string> = {
  metal_roofing: "Metal roofing",
  tiles: "Roof tiles",
  roof_plumbing: "Roof plumbing",
  general_trade: "General trade",
  sarking_insulation: "Sarking & insulation",
  fasteners: "Fasteners",
  coatings: "Coatings",
  hire: "Hire",
};

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function matches(want: string | null | undefined, field: string | null, description: string): boolean {
  const w = norm(want);
  if (!w) return false;
  const f = norm(field);
  if (f && (f.includes(w) || w.includes(f))) return true;
  return norm(description).includes(w);
}

/** Markup % for a calc key's category ("material" | "labor" | "other"). */
export function markupFor(markup: Record<string, number> | null | undefined, category: CalcCategory): number {
  const v = markup?.[category];
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

/** A row's cost in its calc key's unit (null when unmapped or not convertible). */
export function itemCalcCost(item: PriceItem): { calc_key: string; unit: string; cost: number } | null {
  if (!item.calc_key) return null;
  const def = CALC_KEY_MAP[item.calc_key];
  if (!def) return null;
  const f = calcUnitsPerSupplierUnit({ unit: item.unit, cost_ex_gst: Number(item.cost_ex_gst), length_mm: item.length_mm, cover_width_mm: item.cover_width_mm, pack_qty: item.pack_qty }, def.unit);
  if (!f) return null;
  return { calc_key: item.calc_key, unit: def.unit, cost: Number(item.cost_ex_gst) / f };
}

/**
 * Cost used to rank rows of one calc key: per calc unit, except boxes and rolls of different
 * sizes, which rank per piece / per m² when the pack quantity is known (a box of 1000 screws
 * isn't "dearer" than a box of 500).
 */
export function comparableCost(unit: string, cost: number, packQty: number | null | undefined): number {
  return (unit === "box" || unit === "roll") && Number(packQty) > 0 ? cost / Number(packQty) : cost;
}

/**
 * Pure selection: for each calc key, the best row. Rows matching the chosen profile (2 points)
 * and finish (1 point) win; ties go to the cheapest (see comparableCost). Ordered like CALC_KEYS.
 */
export function buildPriceBook(items: PriceItem[], markup: Record<string, number> | null | undefined, opts: PriceBookOptions = {}): PriceRow[] {
  const best = new Map<string, { item: PriceItem; cost: number; rank: number; score: number }>();
  for (const item of items) {
    const c = itemCalcCost(item);
    if (!c) continue;
    const score = (matches(opts.profile, item.profile, item.description) ? 2 : 0) + (matches(opts.finish, item.finish, item.description) ? 1 : 0);
    const rank = comparableCost(c.unit, c.cost, item.pack_qty);
    const cur = best.get(c.calc_key);
    if (!cur || score > cur.score || (score === cur.score && rank < cur.rank)) best.set(c.calc_key, { item, cost: c.cost, rank, score });
  }
  const out: PriceRow[] = [];
  for (const def of CALC_KEYS) {
    const b = best.get(def.key);
    if (!b) continue;
    const m = markupFor(markup, def.category);
    out.push({
      calc_key: def.key,
      name: b.item.description,
      unit: def.unit,
      unit_cost_ex_gst: round2(b.cost),
      unit_price_inc_gst: sellIncGst(b.cost, m),
      supplier_price_item_id: b.item.id,
      product_code: b.item.product_code,
      pack_qty: b.item.pack_qty === null ? null : Number(b.item.pack_qty),
      profile: b.item.profile,
      finish: b.item.finish,
      cover_width_mm: b.item.cover_width_mm === null ? null : Number(b.item.cover_width_mm),
      thickness_mm: b.item.thickness_mm === null ? null : Number(b.item.thickness_mm),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data access (RLS-respecting; pass the request's Supabase client)
// ---------------------------------------------------------------------------
type Db = SupabaseClient;

/** The org supplier's active, completed price list id (null when none). */
export async function activePriceListId(supabase: Db, orgId: string, orgSupplierId: string): Promise<string | null> {
  const { data } = await supabase
    .from("supplier_price_lists")
    .select("id")
    .eq("org_id", orgId)
    .eq("org_supplier_id", orgSupplierId)
    .eq("is_active", true)
    .eq("status", "ready")
    .maybeSingle();
  return data?.id ?? null;
}

/** All rows of a price list (paged past PostgREST's row cap). `mappedOnly` skips rows with no calc key. */
export async function priceListItems(supabase: Db, listId: string, mappedOnly = true): Promise<PriceItem[]> {
  const out: PriceItem[] = [];
  const page = 1000;
  for (let from = 0; from < 50000; from += page) {
    let q = supabase.from("supplier_price_items").select(PRICE_ITEM_COLUMNS).eq("price_list_id", listId).order("id").range(from, from + page - 1);
    if (mappedOnly) q = q.not("calc_key", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as PriceItem[];
    out.push(...rows.map((r) => ({ ...r, cost_ex_gst: Number(r.cost_ex_gst) })));
    if (rows.length < page) break;
  }
  return out;
}

async function orgPricing(supabase: Db, orgId: string) {
  const { data } = await supabase.from("organizations").select("markup_pct, default_supplier_id").eq("id", orgId).maybeSingle();
  return { markup: (data?.markup_pct ?? null) as Record<string, number> | null, defaultSupplierId: (data?.default_supplier_id ?? null) as string | null };
}

/**
 * Contract 1. Price rows (one per calc key) from the supplier's active price list, or null when
 * that supplier has no active list. `orgSupplierId` null → the org's default supplier.
 */
export async function supplierPriceBook(supabase: Db, orgId: string, orgSupplierId: string | null, opts: PriceBookOptions = {}): Promise<PriceRow[] | null> {
  const { markup, defaultSupplierId } = await orgPricing(supabase, orgId);
  const osId = orgSupplierId ?? defaultSupplierId;
  if (!osId) return null;
  const listId = await activePriceListId(supabase, orgId, osId);
  if (!listId) return null;
  return buildPriceBook(await priceListItems(supabase, listId), markup, opts);
}

export type OrgSupplier = {
  id: string;
  supplier_id: string | null;
  name: string;
  category: string | null;
  website: string | null;
  account_number: string | null;
  branch_name: string | null;
  branch_email: string | null;
  branch_phone: string | null;
  is_default: boolean;
  custom: boolean;
  /** Active price list summary (null when no sheet imported yet, or the viewer can't see prices). */
  active_list: { id: string; name: string; effective_date: string | null; created_at: string } | null;
};

type OrgSupplierRow = {
  id: string; supplier_id: string | null; custom_name: string | null; account_number: string | null; branch_name: string | null;
  branch_email: string | null; branch_phone: string | null; is_default: boolean;
  suppliers: { name: string; category: string; website: string | null } | null;
  supplier_price_lists: { id: string; name: string; effective_date: string | null; created_at: string; is_active: boolean; status: string }[] | null;
};

export const orgSupplierName = (r: { custom_name?: string | null; suppliers?: { name: string } | null }) => r.suppliers?.name ?? r.custom_name ?? "Supplier";

/** The org's suppliers for dropdowns ("Price from: …", orders): default first, then by name. */
export async function listOrgSuppliers(supabase: Db, orgId: string): Promise<OrgSupplier[]> {
  const { data, error } = await supabase
    .from("org_suppliers")
    .select("id, supplier_id, custom_name, account_number, branch_name, branch_email, branch_phone, is_default, suppliers(name, category, website), supplier_price_lists(id, name, effective_date, created_at, is_active, status)")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrgSupplierRow[])
    .map((r) => {
      const active = (r.supplier_price_lists ?? []).find((l) => l.is_active && l.status === "ready") ?? null;
      return {
        id: r.id, supplier_id: r.supplier_id, name: orgSupplierName(r), category: r.suppliers?.category ?? null, website: r.suppliers?.website ?? null,
        account_number: r.account_number, branch_name: r.branch_name, branch_email: r.branch_email, branch_phone: r.branch_phone,
        is_default: r.is_default, custom: !r.supplier_id,
        active_list: active ? { id: active.id, name: active.name, effective_date: active.effective_date, created_at: active.created_at } : null,
      };
    })
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Compare suppliers (same calc keys, side by side)
// ---------------------------------------------------------------------------
export type CompareCell = { cost: number; name: string; product_code: string | null; pack_qty: number | null };
/** `per` is what `cost` is per: the calc unit, or "ea"/"m2" when boxes/rolls of known size are compared per piece/m². */
export type CompareRow = { calc_key: string; label: string; unit: string; per: string; cells: Record<string, CompareCell | null>; cheapest: string | null };
export type SupplierComparison = { suppliers: { id: string; name: string }[]; rows: CompareRow[] };

/** Pure: per calc key, each supplier's chosen unit cost (ex GST) and the cheapest supplier. */
export function compareBooks(books: { id: string; name: string; rows: PriceRow[] }[], calcKeys?: string[]): SupplierComparison {
  const wanted = calcKeys?.length ? new Set(calcKeys) : null;
  const rows: CompareRow[] = [];
  for (const def of CALC_KEYS) {
    if (wanted && !wanted.has(def.key)) continue;
    const found = books.map((b) => ({ id: b.id, r: b.rows.find((x) => x.calc_key === def.key) ?? null }));
    const present = found.filter((f) => f.r);
    // Boxes/rolls compare per piece / per m² only when every supplier gives the pack size.
    const perPack = (def.unit === "box" || def.unit === "roll") && present.length > 0 && present.every((f) => Number(f.r!.pack_qty) > 0);
    const cells: Record<string, CompareCell | null> = {};
    let cheapest: string | null = null;
    let low = Infinity;
    for (const f of found) {
      if (!f.r) { cells[f.id] = null; continue; }
      const cost = perPack ? Math.round((f.r.unit_cost_ex_gst / Number(f.r.pack_qty)) * 10000) / 10000 : f.r.unit_cost_ex_gst;
      cells[f.id] = { cost, name: f.r.name, product_code: f.r.product_code, pack_qty: f.r.pack_qty };
      if (cost < low) { low = cost; cheapest = f.id; }
    }
    const per = perPack ? (def.unit === "box" ? "ea" : "m2") : def.unit;
    if (present.length || wanted) rows.push({ calc_key: def.key, label: def.label, unit: def.unit, per, cells, cheapest: present.length > 1 ? cheapest : null });
  }
  return { suppliers: books.map((b) => ({ id: b.id, name: b.name })), rows };
}

/** Every org supplier with an active price list, compared on the given calc keys (all when omitted). */
export async function compareSuppliers(supabase: Db, orgId: string, calcKeys?: string[], opts: PriceBookOptions = {}): Promise<SupplierComparison> {
  const [suppliers, { markup }] = await Promise.all([listOrgSuppliers(supabase, orgId), orgPricing(supabase, orgId)]);
  const priced = suppliers.filter((s) => s.active_list);
  const books = await Promise.all(priced.map(async (s) => ({ id: s.id, name: s.name, rows: buildPriceBook(await priceListItems(supabase, s.active_list!.id), markup, opts) })));
  return compareBooks(books, calcKeys);
}
