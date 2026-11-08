// The supplier's view of a material order (from the email): what to supply, where and when, and one button to
// confirm. No prices and no login.
import { auPhone } from "@/lib/quote-email";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { anonClient } from "@/lib/public";
import { DELIVERY_LABEL, deliveryWhen, qtyText } from "@/lib/supplier-order-doc";
import { confirmOrder } from "./actions";

export const metadata: Metadata = { title: "Material order", robots: { index: false } };

type Doc = {
  status: string; supplier: string; branch: string | null; po_number: string | null; delivery_date: string | null; delivery_time: string | null; delivery_type: string;
  notes: string | null; site_contact: string | null; confirmed_at: string | null; supplier_ref: string | null; supplier_delivery_date: string | null; account_number: string | null;
  org: { name: string; phone: string | null; email: string | null }; site_address: string | null;
  items: { description: string; spec: string | null; sku: string | null; quantity: number; unit: string; length_m: number | null }[];
};

export default async function SupplierOrderPage({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const { data } = await anonClient().rpc("get_supplier_order", { p_token: token });
  if (!data) notFound();
  const d = data as Doc;
  const confirmed = d.status === "confirmed" || d.status === "delivered";
  return (
    <main className="min-h-screen bg-cream px-4 py-8">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
        <div className="flex items-center justify-between bg-brand-500 px-6 py-5 text-white">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">Material order {d.po_number ?? ""}</p><p className="font-display text-2xl font-bold">{d.org.name}</p></div>
          <p className="text-right text-xs text-brand-200">For {d.supplier}{d.branch ? ` · ${d.branch}` : ""}{d.account_number ? <><br />Account {d.account_number}</> : null}</p>
        </div>
        <div className="grid gap-4 border-b border-slate-100 px-6 py-5 text-sm sm:grid-cols-2">
          {[["Deliver to", d.site_address ?? "To be confirmed"], ["When", deliveryWhen(d.delivery_date, d.delivery_time)], ["Delivery", DELIVERY_LABEL[d.delivery_type] ?? d.delivery_type], ["On site", d.site_contact ?? d.org.phone ?? "Call the office"]].map(([k, v]) => (
            <p key={k}><span className="block text-xs text-slate-500">{k}</span><span className="font-medium text-ink">{v}</span></p>
          ))}
          {d.notes && <p className="sm:col-span-2"><span className="block text-xs text-slate-500">Driver notes</span><span className="text-ink">{d.notes}</span></p>}
        </div>
        <ul className="divide-y divide-slate-100 px-6">
          {d.items.map((i, n) => (
            <li key={n} className="flex items-start gap-3 py-3 text-sm">
              <span className="w-6 text-slate-400">{n + 1}</span>
              <span className="min-w-0 flex-1"><b className="font-semibold text-ink">{i.description}</b>{i.spec && <span className="block text-xs text-slate-500">{i.spec}</span>}{i.sku && <span className="block text-xs text-slate-500">Code {i.sku}</span>}</span>
              <span className="whitespace-nowrap font-medium tabular-nums text-ink">{qtyText({ quantity: Number(i.quantity), unit: i.unit, length_m: i.length_m === null ? null : Number(i.length_m) })}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 bg-cream px-6 py-5">
          {confirmed ? (
            <div className="rounded-2xl bg-brand-50 px-4 py-3 text-brand-800 ring-1 ring-brand-100" data-confirmed>
              <p className="font-semibold">Confirmed{d.confirmed_at ? ` ${new Date(d.confirmed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}. Thanks!</p>
              <p className="text-sm">{d.supplier_delivery_date ? `Delivery ${deliveryWhen(d.supplier_delivery_date, null)}` : `Delivery ${deliveryWhen(d.delivery_date, d.delivery_time)}`}{d.supplier_ref ? ` · your ref ${d.supplier_ref}` : ""}</p>
            </div>
          ) : (
            <ActionForm action={confirmOrder}>
              <input type="hidden" name="token" value={token} />
              <p className="font-display text-lg font-bold text-ink">Confirm the order</p>
              <p className="text-sm text-slate-500">Price it to {d.org.name}&apos;s account as usual. Change the date if you can&apos;t make it.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Delivery date</span><input type="date" name="date" defaultValue={d.delivery_date ?? ""} className="min-h-11 w-full rounded-xl bg-white px-3 ring-1 ring-slate-300" /></label>
                <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-500">Your order number (optional)</span><input name="ref" className="min-h-11 w-full rounded-xl bg-white px-3 ring-1 ring-slate-300" /></label>
                <label className="block text-sm sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Note (optional)</span><input name="note" placeholder="e.g. ridge capping on back order" className="min-h-11 w-full rounded-xl bg-white px-3 ring-1 ring-slate-300" /></label>
              </div>
              <SubmitButton className="mt-4 min-h-12 w-full text-base">Confirm order &amp; delivery</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-3 text-center text-xs text-slate-500">Questions? {d.org.phone ? `Call ${auPhone(d.org.phone) ?? d.org.phone}` : ""}{d.org.phone && d.org.email ? " or " : ""}{d.org.email ? `email ${d.org.email}` : ""}</p>
        </div>
      </div>
    </main>
  );
}
