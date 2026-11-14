import "server-only";
// Referrals: a contact (customers row) or a supplier (org_suppliers row) sent us a job.
// jobs.referred_by + jobs.referred_by_type ('contact' | 'supplier'). See migration 20261123000100_referrals.sql.
import type { createClient } from "@/lib/supabase/server";
import { orgSupplierName } from "@/lib/suppliers";

type DB = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type ReferrerType = "contact" | "supplier";
export const isReferrerType = (v: unknown): v is ReferrerType => v === "contact" || v === "supplier";
export type Referrer = { id: string; type: ReferrerType; name: string; detail?: string | null };
export type ReferredJob = { id: string; title: string; stage: string; created_at: string; customer: string; value: number | null; signed: boolean };
export type Referrals = { referred: ReferredJob[]; referredSigned: number };

const WON = ["sold", "scheduled", "in_progress", "completed", "paid"];
export const referralsWon = (r: ReferredJob[]) => r.filter((j) => j.signed || WON.includes(j.stage)).length;

/** The jobs a contact or supplier referred, newest first, with each one's quote value. */
export async function loadReferrals(supabase: DB, type: ReferrerType, id: string, { canSeeMoney }: { canSeeMoney: boolean }): Promise<Referrals> {
  const money = canSeeMoney ? ", estimates(status, created_at, estimate_totals(total))" : "";
  const { data } = await supabase.from("jobs").select(`id, title, stage, created_at, customers(name)${money}`)
    .eq("referred_by", id).eq("referred_by_type", type).order("created_at", { ascending: false }).limit(100);
  type E = { status: string; created_at: string; estimate_totals: unknown };
  type R = { id: string; title: string; stage: string; created_at: string; customers: unknown; estimates?: E[] };
  let referredSigned = 0;
  const referred = ((data ?? []) as unknown as R[]).map((j) => {
    const ests = (j.estimates ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    const accepted = ests.find((e) => e.status === "accepted");
    const shown = accepted ?? ests.find((e) => e.status === "sent");
    const value = shown ? Number(one(shown.estimate_totals as { total: number })?.total ?? 0) : null;
    if (accepted) referredSigned += value ?? 0;
    return { id: j.id, title: j.title, stage: j.stage, created_at: j.created_at, customer: one(j.customers as { name: string })?.name ?? "Customer", value, signed: Boolean(accepted) };
  });
  return { referred, referredSigned };
}

/** One referrer by id (for the New lead form and the job sidebar). */
export async function loadReferrer(supabase: DB, type: ReferrerType, id: string): Promise<Referrer | null> {
  if (type === "contact") {
    const { data } = await supabase.from("customers").select("id, name, phone, city").eq("id", id).maybeSingle();
    return data ? { id: data.id, type, name: data.name, detail: [data.phone, data.city].filter(Boolean).join(" · ") } : null;
  }
  const { data } = await supabase.from("org_suppliers").select("id, custom_name, branch_name, suppliers(name)").eq("id", id).maybeSingle();
  if (!data) return null;
  const sup = one(data.suppliers as { name: string } | { name: string }[] | null);
  return { id: data.id, type, name: orgSupplierName({ custom_name: data.custom_name, suppliers: sup }), detail: ["Supplier", data.branch_name].filter(Boolean).join(" · ") };
}

/** Where a referrer's sidebar lives on Contacts. */
export const referrerHref = (r: { id: string; type: ReferrerType }) => `/app/contacts?${r.type === "supplier" ? "supplier" : "contact"}=${r.id}`;
