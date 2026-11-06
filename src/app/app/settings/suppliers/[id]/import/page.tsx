import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireMoneyAccess } from "@/lib/dal";
import { isoDate } from "@/lib/format";
import { activePriceListId, orgSupplierName, priceListItems } from "@/lib/suppliers";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import price sheet" };

export default async function ImportPage({ params }: PageProps<"/app/settings/suppliers/[id]/import">) {
  const { id } = await params;
  const { supabase, org, isAdmin, role } = await requireMoneyAccess();
  if (!isAdmin && role !== "member") redirect(`/app/settings/suppliers/${id}`);
  const { data: os } = await supabase
    .from("org_suppliers")
    .select("id, custom_name, import_mapping, suppliers(name)")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!os) notFound();
  const name = orgSupplierName({ custom_name: os.custom_name, suppliers: os.suppliers as unknown as { name: string } | null });
  // Re-imports keep the estimating item each product code was mapped to last time.
  const activeId = await activePriceListId(supabase, org.id, id);
  const previousKeys: Record<string, string> = {};
  if (activeId) for (const i of await priceListItems(supabase, activeId)) if (i.product_code && i.calc_key) previousKeys[i.product_code] = i.calc_key;
  const saved = (os.import_mapping ?? null) as { columns?: Record<string, string>; prices_include_gst?: boolean } | null;
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/app/settings/suppliers/${id}`} className="text-sm text-slate-500 hover:text-brand-600">← {name}</Link>
        <h2 className="text-xl font-semibold text-slate-900">Import {name} price sheet</h2>
        <p className="text-sm text-slate-500">
          Upload the CSV or Excel file from your branch or trade portal, or paste rows copied from Excel. Your previous price list is kept (inactive) so nothing is lost.
          {" "}<Link href="/app/settings/suppliers/template" prefetch={false} className="font-medium text-brand-600 hover:underline">Download a sample template</Link>.
        </p>
      </div>
      <ImportWizard orgSupplierId={id} supplierName={name} today={isoDate(new Date())} saved={saved} previousKeys={previousKeys} />
    </div>
  );
}
