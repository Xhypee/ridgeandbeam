import { requireMoneyAccess } from "@/lib/dal";
import { supplierOrderCsv } from "@/lib/suppliers-orders";

export async function GET(_req: Request, { params }: RouteContext<"/app/orders/[id]/csv">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const { data: o } = await supabase
    .from("material_orders")
    .select("*, material_order_items(*), org_suppliers(account_number), jobs(title, site_address, customers(name))")
    .eq("id", id)
    .maybeSingle();
  if (!o) return new Response("Not found", { status: 404 });
  const job = o.jobs as { title: string; site_address: string | null; customers: { name: string } | null };
  const items = (o.material_order_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  const account = (o.org_suppliers as { account_number: string | null } | null)?.account_number ?? null;
  const csv = supplierOrderCsv({
    supplier: o.supplier, account_number: account, branch: o.branch, po_number: o.po_number, color: o.color, delivery_date: o.delivery_date,
    delivery_type: o.delivery_type, notes: o.notes, job: `${job.customers?.name ?? ""} — ${job.title}`, address: job.site_address,
  }, items);
  const name = `order-${(o.po_number ?? id.slice(0, 8)).replace(/[^a-z0-9-]/gi, "")}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
