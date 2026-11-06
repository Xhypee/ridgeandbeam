// STUB (builder E, AU estimating) — placeholder so the estimate editor compiles before builder S's
// `src/lib/suppliers.ts` merges. The coordinator keeps S's real version; these signatures mirror it
// (contract 1: supplierPriceBook + listOrgSuppliers). Returns no suppliers and no price rows.
import type { SupabaseClient } from "@supabase/supabase-js";

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
  active_list: { id: string; name: string; effective_date: string | null; created_at: string } | null;
};

/** STUB: always null (no active price list). */
export async function supplierPriceBook(supabase: SupabaseClient, orgId: string, orgSupplierId: string | null, opts: PriceBookOptions = {}): Promise<PriceRow[] | null> {
  void supabase; void orgId; void orgSupplierId; void opts;
  return null;
}

/** STUB: always empty. */
export async function listOrgSuppliers(supabase: SupabaseClient, orgId: string): Promise<OrgSupplier[]> {
  void supabase; void orgId;
  return [];
}
