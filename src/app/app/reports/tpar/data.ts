import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTpar, financialYear, fyFromStart, type FinancialYear, type TparCost, type TparCrew } from "@/lib/tpar";
import { isoDate } from "@/lib/format";

/** Which financial year a ?fy=2025 query means (default: the last completed year until 28 Aug, else current). */
export function pickYear(fy: unknown): FinancialYear {
  const n = Number(fy);
  if (Number.isInteger(n) && n >= 2000 && n <= 2100) return fyFromStart(n);
  const today = isoDate(new Date());
  const cur = financialYear(today);
  // Until the lodgement due date, the report people want is the year that just ended.
  return today <= `${cur.startYear}-08-28` ? fyFromStart(cur.startYear - 1) : cur;
}

export async function tparData(supabase: SupabaseClient, orgId: string, fy: FinancialYear) {
  const [{ data: costs }, { data: crews }] = await Promise.all([
    supabase.from("job_costs").select("id, amount, incurred_on, vendor, source, source_id, category").eq("org_id", orgId).gte("incurred_on", fy.start).lte("incurred_on", fy.end).limit(10000),
    supabase.from("crews").select("id, name, abn, gst_registered, phone, is_subcontractor").eq("org_id", orgId).order("name"),
  ]);
  const crewList = (crews ?? []) as TparCrew[];
  return { rows: buildTpar((costs ?? []) as TparCost[], crewList, fy), crews: crewList };
}
