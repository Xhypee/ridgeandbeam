import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { SupplierCompare } from "@/components/supplier-compare";
import { Badge, Card, LinkButton } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, daysSince } from "@/lib/format";
import { compareSuppliers, listOrgSuppliers, SUPPLIER_CATEGORY_LABEL } from "@/lib/suppliers";
import { removeSupplier, setDefaultSupplier } from "./actions";
import { DirectoryPicker, type DirectorySupplier } from "./directory-picker";
import { MarkupEditor } from "./markup-editor";

export const metadata: Metadata = { title: "Suppliers" };

const dmy = (d: string | null) => (d ? date(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const STALE_DAYS = 90;

export default async function SuppliersPage() {
  const { supabase, org, isAdmin, role } = await requireMoneyAccess();
  const canEdit = isAdmin || role === "member";
  const [{ data: directory }, suppliers, comparison] = await Promise.all([
    supabase.from("suppliers").select("id, name, category, website, states, notes, verified").order("name"),
    listOrgSuppliers(supabase, org.id),
    compareSuppliers(supabase, org.id),
  ]);

  // Item and unmapped counts for each active sheet.
  const counts = new Map<string, { items: number; unmapped: number }>();
  await Promise.all(suppliers.filter((s) => s.active_list).map(async (s) => {
    const id = s.active_list!.id;
    const [all, unmapped] = await Promise.all([
      supabase.from("supplier_price_items").select("id", { count: "exact", head: true }).eq("price_list_id", id),
      supabase.from("supplier_price_items").select("id", { count: "exact", head: true }).eq("price_list_id", id).is("calc_key", null),
    ]);
    counts.set(s.id, { items: all.count ?? 0, unmapped: unmapped.count ?? 0 });
  }));

  return (
    <div className="space-y-6">
      <Card title="Your suppliers" actions={<Link href="/app/settings/suppliers/template" prefetch={false} className="text-sm font-medium text-brand-600 hover:underline">Download price sheet template</Link>}>
        <p className="mb-4 text-sm text-slate-500">
          Import each supplier&apos;s price sheet (your account pricing) and estimates can price materials from it. Your prices stay private to your business —
          they are never shown to homeowners or crew leads, or shared with anyone else.
        </p>
        {suppliers.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No suppliers yet. Add the suppliers you buy from below.</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="org-suppliers">
            {suppliers.map((s) => {
              const c = counts.get(s.id);
              const stale = s.active_list && daysSince(s.active_list.created_at) > STALE_DAYS;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="org-supplier">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      <Link href={`/app/settings/suppliers/${s.id}`} className="hover:text-brand-600">{s.name}</Link>
                      {s.is_default && <Badge tone="teal">Default</Badge>}
                      {s.custom && <Badge>Custom</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[s.category && SUPPLIER_CATEGORY_LABEL[s.category], s.account_number && `Acct ${s.account_number}`, s.branch_name, s.branch_email].filter(Boolean).join(" · ") || "No account details yet"}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {s.active_list ? (
                        <span className={stale ? "text-amber-700" : "text-slate-600"}>
                          Price sheet updated {dmy(s.active_list.created_at)} · {c?.items ?? 0} items
                          {c && c.unmapped > 0 && <Link href={`/app/settings/suppliers/${s.id}?show=unmapped`} className="ml-1 font-medium text-amber-700 hover:underline">· {c.unmapped} unmapped to fix</Link>}
                          {stale && " · older than 90 days — ask the branch for a new sheet"}
                        </span>
                      ) : <span className="text-slate-500">No price sheet yet</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEdit && <LinkButton href={`/app/settings/suppliers/${s.id}/import`} variant={s.active_list ? "secondary" : "primary"} className="min-h-11">{s.active_list ? "Update prices" : "Import price sheet"}</LinkButton>}
                    {isAdmin && !s.is_default && (
                      <form action={setDefaultSupplier}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost" className="min-h-11">Make default</SubmitButton></form>
                    )}
                    {canEdit && (
                      <form action={removeSupplier}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost" className="min-h-11" confirm={`Remove ${s.name} and its price sheets?`}>Remove</SubmitButton></form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canEdit && (
        <Card title="Add supplier">
          <DirectoryPicker directory={(directory ?? []) as DirectorySupplier[]} serviceStates={org.service_states ?? []} addedIds={suppliers.map((s) => s.supplier_id).filter((v): v is string => Boolean(v))} />
          <p className="mt-3 text-xs text-slate-500">
            Supplier coverage comes from public listings and may be out of date{(org.service_states ?? []).length === 0 ? " — set your service states in Company settings to filter this list" : ""}.
          </p>
        </Card>
      )}

      <Card title="Markup">
        <p className="mb-3 text-sm text-slate-500">Applied to supplier cost (ex GST) to get your sell price. Homeowner prices include GST.</p>
        <MarkupEditor initial={org.markup_pct ?? {}} canEdit={isAdmin} />
      </Card>

      <Card title="Compare suppliers">
        <p className="mb-3 text-sm text-slate-500">Unit cost ex GST for the same estimating items, from each supplier&apos;s active price sheet.</p>
        <SupplierCompare data={comparison} />
      </Card>
    </div>
  );
}
