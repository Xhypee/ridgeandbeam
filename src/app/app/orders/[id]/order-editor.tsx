"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { money } from "@/lib/format";
import { orderTotal } from "@/lib/production-orders";
import { saveOrder, supplierLines, type SaveOrderInput } from "../actions";

type Line = { description: string; sku: string | null; quantity: number; unit: string; unit_cost: number; calc_key: string | null; supplier_price_item_id: string | null };
type Header = Omit<SaveOrderInput, "items">;
export type SupplierOption = { id: string; name: string; hasSheet: boolean; branch_name: string | null; branch_email: string | null; branch_phone: string | null };

export function OrderEditor({ initial, items: initialItems, locked, suppliers, legacySupplier }: { initial: Header; items: Line[]; locked: boolean; suppliers: SupplierOption[]; legacySupplier: string | null }) {
  const router = useRouter();
  const [h, setH] = useState<Header>(initial);
  const [items, setItems] = useState<Line[]>(initialItems);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setHeader = (p: Partial<Header>) => { setH((x) => ({ ...x, ...p })); setDirty(true); setMsg(null); };
  const setLine = (i: number, p: Partial<Line>) => { setItems((xs) => xs.map((x, n) => (n === i ? { ...x, ...p } : x))); setDirty(true); setMsg(null); };
  const current = suppliers.find((s) => s.id === h.org_supplier_id) ?? null;

  function chooseSupplier(id: string) {
    const s = suppliers.find((x) => x.id === id) ?? null;
    setHeader({ org_supplier_id: s?.id ?? null, ...(s ? { branch: s.branch_name, branch_email: s.branch_email, branch_phone: s.branch_phone } : {}) });
    setMsg(s && s.hasSheet && items.length ? { ok: `Tap “Use ${s.name} codes” to switch the lines to ${s.name}'s product codes.` } : null);
  }
  function useSupplierCodes() {
    if (!h.org_supplier_id) return;
    start(async () => {
      const r = await supplierLines(h.org_supplier_id!, items, h.color ?? null);
      if (r.error) { setMsg({ error: r.error }); return; }
      if (r.items) { setItems(r.items.map((x) => ({ ...x, sku: x.sku ?? null, calc_key: x.calc_key ?? null, supplier_price_item_id: x.supplier_price_item_id ?? null }))); setDirty(true); }
      setMsg({ ok: r.ok });
    });
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier" hint={suppliers.length === 0 ? "Add suppliers in Settings → Suppliers" : current && !current.hasSheet ? "No price sheet yet" : undefined}>
          <Select name="org_supplier_id" value={h.org_supplier_id ?? ""} onChange={(e) => chooseSupplier(e.target.value)}>
            <option value="">{legacySupplier && !h.org_supplier_id ? legacySupplier : "Choose supplier…"}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Branch"><Input name="branch" value={h.branch ?? ""} onChange={(e) => setHeader({ branch: e.target.value })} placeholder="e.g. Smithfield" /></Field>
        <Field label="Branch email" hint="Where “Send to branch” goes"><Input name="branch_email" type="email" value={h.branch_email ?? ""} onChange={(e) => setHeader({ branch_email: e.target.value })} /></Field>
        <Field label="Branch phone"><Input name="branch_phone" value={h.branch_phone ?? ""} onChange={(e) => setHeader({ branch_phone: e.target.value })} /></Field>
        <Field label="PO number"><Input name="po_number" value={h.po_number ?? ""} onChange={(e) => setHeader({ po_number: e.target.value })} /></Field>
        <Field label="Colour" hint="Confirm with the homeowner before sending"><Input name="color" value={h.color ?? ""} onChange={(e) => setHeader({ color: e.target.value })} /></Field>
        <Field label="Delivery date"><Input name="delivery_date" type="date" value={h.delivery_date ?? ""} onChange={(e) => setHeader({ delivery_date: e.target.value || null })} /></Field>
        <Field label="Delivery">
          <Select name="delivery_type" value={h.delivery_type} onChange={(e) => setHeader({ delivery_type: e.target.value as Header["delivery_type"] })}>
            <option value="roof_load">Roof load</option>
            <option value="ground_drop">Ground drop</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-3"><Textarea name="notes" value={h.notes ?? ""} onChange={(e) => setHeader({ notes: e.target.value })} placeholder="Gate code, drop location, call before delivery…" /></Field>
      </fieldset>

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="min-w-64 px-2 py-2">Description</th><th className="px-2 py-2">Product code</th><th className="w-24 px-2 py-2">Qty</th><th className="w-20 px-2 py-2">Unit</th><th className="w-28 px-2 py-2">Cost ex GST</th><th className="w-24 px-2 py-2 text-right">Total</th><th className="w-8" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <tr key={i}>
                <td className="px-2 py-1"><Input aria-label="Description" value={it.description} disabled={locked} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td className="px-2 py-1"><Input aria-label="Product code" value={it.sku ?? ""} disabled={locked} onChange={(e) => setLine(i, { sku: e.target.value || null })} /></td>
                <td className="px-2 py-1"><Input aria-label="Quantity" type="number" step="any" value={it.quantity} disabled={locked} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} /></td>
                <td className="px-2 py-1"><Input aria-label="Unit" value={it.unit} disabled={locked} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                <td className="px-2 py-1"><Input aria-label="Unit cost" type="number" step="0.01" value={it.unit_cost} disabled={locked} onChange={(e) => setLine(i, { unit_cost: Number(e.target.value) })} /></td>
                <td className="px-2 py-1 text-right">{money(it.quantity * it.unit_cost)}</td>
                <td className="px-1">{!locked && <button type="button" aria-label="Remove line" className="p-2 text-slate-400 hover:text-red-600" onClick={() => { setItems((xs) => xs.filter((_, n) => n !== i)); setDirty(true); }}>✕</button>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">No lines yet.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={5} className="px-2 py-2 text-right font-medium">Order cost ex GST</td><td className="px-2 py-2 text-right font-semibold" data-testid="order-total">{money(orderTotal(items))}</td><td /></tr></tfoot>
        </table>
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => { setItems((xs) => [...xs, { description: "", sku: null, quantity: 1, unit: "ea", unit_cost: 0, calc_key: null, supplier_price_item_id: null }]); setDirty(true); }}>+ Line</Button>
          {current?.hasSheet && items.length > 0 && <Button type="button" variant="secondary" disabled={pending} onClick={useSupplierCodes}>Use {current.name} codes</Button>}
          <Button type="button" disabled={pending} onClick={() => start(async () => {
            const r = await saveOrder({ ...h, items });
            setMsg(r ?? null);
            if (r && "ok" in r && r.ok) { setDirty(false); router.refresh(); }
          })}>{pending ? "Saving…" : "Save order"}</Button>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        </div>
      )}
      {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg.ok}</p>}
    </div>
  );
}
