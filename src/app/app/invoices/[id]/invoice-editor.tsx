"use client";

import { AddressLookup } from "@/components/address-lookup";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { money } from "@/lib/format";
import { invoiceGstTotals, TAX_INVOICE_BUYER_THRESHOLD } from "@/lib/invoice-gst";
import type { CatalogItem, Item } from "@/lib/types";
import { saveInvoice } from "../actions";

type Props = {
  id: string;
  locked: boolean;
  catalog: CatalogItem[];
  paid: number;
  gstRegistered: boolean;
  customerName: string | null;
  customerAddress: string | null;
  initial: {
    items: Item[];
    issue_date: string;
    due_date: string | null;
    tax_rate: number;
    discount: number;
    amounts_include_gst: boolean;
    notes: string | null;
    terms: string | null;
    buyer_name: string | null;
    buyer_abn: string | null;
    buyer_address: string | null;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function InvoiceEditor({ id, locked, catalog, paid, gstRegistered, customerName, customerAddress, initial }: Props) {
  const [items, setItems] = useState<Item[]>(initial.items);
  const [issueDate, setIssueDate] = useState(initial.issue_date);
  const [dueDate, setDueDate] = useState(initial.due_date ?? "");
  const [discount, setDiscount] = useState(Number(initial.discount));
  const [inclusive, setInclusive] = useState(initial.amounts_include_gst);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [buyerName, setBuyerName] = useState(initial.buyer_name ?? "");
  const [buyerAbn, setBuyerAbn] = useState(initial.buyer_abn ?? "");
  const [buyerAddress, setBuyerAddress] = useState(initial.buyer_address ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const rate = gstRegistered ? 10 : 0;
  const t = useMemo(() => invoiceGstTotals(items, discount, rate, inclusive), [items, discount, rate, inclusive]);
  const needsBuyer = gstRegistered && t.total >= TAX_INVOICE_BUYER_THRESHOLD;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const setItem = (i: number, patch: Partial<Item>) => { setItems((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it))); touch(); };
  const ro = locked;

  function save() {
    start(async () => {
      const res = await saveInvoice({
        id,
        issue_date: issueDate,
        due_date: dueDate || null,
        discount,
        amounts_include_gst: inclusive,
        notes: notes || null,
        terms: terms || null,
        buyer_name: buyerName || null,
        buyer_abn: buyerAbn || null,
        buyer_address: buyerAddress || null,
        items: items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 })),
      });
      setMsg(res ?? null);
      if (res && !res.error) setDirty(false);
    });
  }

  return (
    <div className="space-y-6">
      <Card title={gstRegistered ? "Tax invoice" : "Invoice"}>
        <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
          <Field label="Issue date"><Input disabled={ro} type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); touch(); }} /></Field>
          <Field label="Due date"><Input disabled={ro} type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); touch(); }} /></Field>
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Description</th><th className="w-24 pb-2 font-medium">Qty</th><th className="w-20 pb-2 font-medium">Unit</th>
                <th className="w-32 pb-2 font-medium">{gstRegistered && inclusive ? "Price inc GST" : "Price"}</th><th className="w-28 pb-2 text-right font-medium">Amount</th><th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><Input disabled={ro} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} aria-label="Description" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })} aria-label="Quantity" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unit" /></td>
                  <td className="py-1 pr-2"><Input disabled={ro} type="number" step="0.01" min="0" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value as unknown as number })} aria-label="Unit price" /></td>
                  <td className="py-3 text-right tabular-nums">{money(r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)))}</td>
                  <td className="text-center">{!ro && <button type="button" className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => { setItems((p) => p.filter((_, j) => j !== i)); touch(); }} aria-label="Remove line">✕</button>}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No line items yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {!ro && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Select className="w-auto max-w-xs" value="" onChange={(e) => {
              const c = catalog.find((x) => x.id === e.target.value);
              if (c) { setItems((p) => [...p, { description: c.name, quantity: 1, unit: c.unit, unit_price: Number(c.unit_price), category: c.category }]); touch(); }
            }} aria-label="Add from price book">
              <option value="">+ Add from price book…</option>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({money(c.unit_price)}/{c.unit})</option>)}
            </Select>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setItems((p) => [...p, { description: "", quantity: 1, unit: "ea", unit_price: 0, category: "other" }]); touch(); }}>+ Custom line</Button>
          </div>
        )}
        <div className="mt-6 flex flex-col items-end gap-1.5 text-sm" data-testid="editor-totals">
          {gstRegistered && (
            <label className="mb-1 flex items-center gap-2 text-slate-600">
              <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={inclusive} disabled={ro} onChange={(e) => { setInclusive(e.target.checked); touch(); }} />
              Prices include GST
            </label>
          )}
          <div className="flex w-full max-w-72 items-center justify-between gap-2"><span className="text-slate-500">Discount</span><Input disabled={ro} className="w-28 text-right" type="number" min="0" step="0.01" value={discount} onChange={(e) => { setDiscount(Number(e.target.value) || 0); touch(); }} aria-label="Discount" /></div>
          {gstRegistered && <div className="flex w-full max-w-72 justify-between"><span className="text-slate-500">Total ex GST</span><span className="tabular-nums">{money(t.exGst)}</span></div>}
          {gstRegistered && <div className="flex w-full max-w-72 justify-between"><span className="text-slate-500">GST (10%)</span><span className="tabular-nums" data-testid="editor-gst">{money(t.gst)}</span></div>}
          <div className="flex w-full max-w-72 justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>{gstRegistered ? "Total inc GST" : "Total"}</span><span className="tabular-nums">{money(t.total)}</span></div>
          <div className="flex w-full max-w-72 justify-between text-slate-500"><span>Paid</span><span className="tabular-nums">−{money(paid)}</span></div>
          <div className="flex w-full max-w-72 justify-between font-semibold"><span>Balance due</span><span className="tabular-nums">{money(r2(t.total - paid))}</span></div>
          {!gstRegistered && <p className="text-xs text-slate-500">Your company isn&apos;t registered for GST, so this is an &ldquo;Invoice&rdquo; with no GST.</p>}
        </div>
      </Card>

      <Card title="Buyer (who the invoice is to)">
        <p className="mb-3 text-sm text-slate-600">
          {needsBuyer ? <b>Required: this tax invoice is $1,000 or more, so it must show the buyer&apos;s name or ABN.</b> : "Leave blank to use the customer on the job."}
          {" "}For an insurer or panel builder, enter their business name and ABN.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Buyer name"><Input disabled={ro} value={buyerName} placeholder={customerName ?? ""} onChange={(e) => { setBuyerName(e.target.value); touch(); }} /></Field>
          <Field label="Buyer ABN (businesses)"><Input disabled={ro} value={buyerAbn} inputMode="numeric" placeholder="11 digits" onChange={(e) => { setBuyerAbn(e.target.value); touch(); }} /></Field>
          <div className="sm:col-span-2">
            {ro ? <Field label="Buyer address"><Input disabled value={buyerAddress} placeholder={customerAddress ?? ""} /></Field>
              : <AddressLookup label="Buyer address" initialLine={buyerAddress || null} onChange={(_, line) => { setBuyerAddress(line); touch(); }} />}
            {!ro && !buyerAddress && customerAddress && <p className="mt-1 text-xs text-slate-500">Blank uses the customer&apos;s address: {customerAddress}</p>}
          </div>
        </div>
      </Card>

      <Card title="Notes & terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notes"><Textarea disabled={ro} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} /></Field>
          <Field label="Terms"><Textarea disabled={ro} value={terms} onChange={(e) => { setTerms(e.target.value); touch(); }} /></Field>
        </div>
      </Card>

      {!ro && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3">
          {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
          {msg?.ok && !dirty && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg.ok}</p>}
          <Button onClick={save} disabled={pending} className="min-h-11">{pending ? "Saving…" : dirty ? "Save invoice" : "Saved"}</Button>
        </div>
      )}
    </div>
  );
}
