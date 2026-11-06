import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireMoneyAccess } from "@/lib/dal";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Order sheet" };

/** Printable order sheet for the branch (quantities only — the branch prices it). */
export default async function OrderSheet({ params }: PageProps<"/app/orders/[id]/print">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const { data: o } = await supabase
    .from("material_orders")
    .select("*, material_order_items(*), jobs(title, site_address, gate_code, customers(name, phone))")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const job = o.jobs as { title: string; site_address: string | null; gate_code: string | null; customers: { name: string; phone: string | null } | null };
  const items = (o.material_order_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position) as { description: string; sku: string | null; quantity: number; unit: string }[];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="space-y-5 bg-white p-6 ring-1 ring-slate-200 sm:rounded-2xl print:p-0 print:ring-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xl font-semibold">{org.name}</p>
            <p className="text-sm text-slate-500">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase text-brand-600">Material order</p>
            <p className="text-sm">PO {o.po_number ?? "—"}</p>
            <p className="text-sm text-slate-500">{o.supplier}{o.branch ? ` · ${o.branch}` : ""}</p>
          </div>
        </header>
        <section className="grid gap-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs uppercase text-slate-500">Ship to</p><p className="font-medium">{job.site_address ?? "—"}</p><p>{job.customers?.name} · {job.title}</p></div>
          <div><p className="text-xs uppercase text-slate-500">Delivery</p><p className="font-medium">{date(o.delivery_date) || "TBD"} · {o.delivery_type === "ground_drop" ? "GROUND DROP" : "ROOF LOAD"}</p>{job.gate_code && <p>Gate code: {job.gate_code}</p>}</div>
          <div><p className="text-xs uppercase text-slate-500">Color</p><p className="font-medium">{o.color ?? "—"}</p></div>
          {o.notes && <div><p className="text-xs uppercase text-slate-500">Notes</p><p className="whitespace-pre-wrap">{o.notes}</p></div>}
        </section>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-1.5">#</th><th className="py-1.5">Qty</th><th className="py-1.5">Unit</th><th className="py-1.5">Description</th><th className="py-1.5">SKU</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i, n) => (
              <tr key={n}><td className="py-1.5">{n + 1}</td><td className="py-1.5 font-semibold">{i.quantity}</td><td className="py-1.5">{i.unit}</td><td className="py-1.5">{i.description}</td><td className="py-1.5">{i.sku}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400">Please confirm quantities, color and delivery date. Leftover returns: please note restocking terms on the confirmation.</p>
      </article>
    </div>
  );
}
