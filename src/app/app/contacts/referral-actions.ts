"use server";

import { requireOrg } from "@/lib/dal";
import { orgSupplierName } from "@/lib/suppliers";
import type { Referrer } from "@/lib/referrals-server";

/** "Referred by" search on New lead: contacts (any kind) and suppliers together, best matches first. */
export async function searchReferrers(q: string): Promise<Referrer[]> {
  const { supabase } = await requireOrg();
  const term = q.trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const ors = [`name.ilike.%${term}%`, `email.ilike.%${term}%`, `company.ilike.%${term}%`];
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits.replace(/^61/, "").split("").join("%")}%`);
  const [{ data: contacts }, { data: sups }] = await Promise.all([
    supabase.from("customers").select("id, name, kind, phone, city, company").or(ors.join(",")).order("created_at", { ascending: false }).limit(6),
    supabase.from("org_suppliers").select("id, custom_name, branch_name, suppliers(name)").limit(200),
  ]);
  const KIND: Record<string, string> = { customer: "Customer", builder: "Builder", contractor: "Contractor", other: "Contact" };
  const t = term.toLowerCase();
  const suppliers: Referrer[] = (sups ?? []).flatMap((s) => {
    const sup = Array.isArray(s.suppliers) ? s.suppliers[0] : s.suppliers;
    const name = orgSupplierName({ custom_name: s.custom_name, suppliers: sup as { name: string } | null });
    return name.toLowerCase().includes(t) || (s.branch_name ?? "").toLowerCase().includes(t)
      ? [{ id: s.id, type: "supplier" as const, name, detail: ["Supplier", s.branch_name].filter(Boolean).join(" · ") }] : [];
  }).slice(0, 4);
  const people: Referrer[] = (contacts ?? []).map((c) => ({ id: c.id, type: "contact" as const, name: c.name, detail: [KIND[c.kind as string] ?? "Contact", c.company, c.phone, c.city].filter(Boolean).join(" · ") }));
  return [...people, ...suppliers];
}
