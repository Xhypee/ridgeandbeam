"use client";
// Pay a supplier's invoice: the invoice (from Gmail, or added here), its details filled in and checked against the
// order, the supplier's bank details to copy, and "I've paid it" (records who and when).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { attachSupplierInvoice, paySupplierInvoice } from "./build-actions";

type Inv = {
  fileName: string | null; fileUrl: string | null; source: string | null; from: string | null;
  no: string | null; date: string | null; due: string | null; ex: number | null; gst: number | null; abn: string | null;
  bankName: string | null; bsb: string | null; account: string | null;
};
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const num = (s: string) => Number(s.replace(/[$,\s]/g, "")) || 0;
function Ico({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function SupplierPayForm({ orgId, jobId, orderId, supplier, orderCode, orderItems, orderCost, inv, read, closeHref }: {
  closeHref: string; orgId: string; jobId: string; orderId: string; supplier: string; orderCode: string | null; orderItems: number; orderCost: number; inv: Inv; read: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ex, setEx] = useState(inv.ex !== null ? inv.ex.toFixed(2) : orderCost.toFixed(2));
  const [gst, setGst] = useState(inv.gst !== null ? inv.gst.toFixed(2) : (Math.round(orderCost * 10) / 100).toFixed(2));
  const [copied, setCopied] = useState<string | null>(null);
  const total = Math.round((num(ex) + num(gst)) * 100) / 100;
  const diff = Math.round((num(ex) - orderCost) * 100) / 100;

  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("That file is over 20 MB.");
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "invoice.pdf";
      const path = `${orgId}/${jobId}/files/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from("job-files").upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) throw new Error(error.message);
      const r = await attachSupplierInvoice({ orderId, path, name: f.name, mime: f.type || null, size: f.size });
      if (r?.error) throw new Error(r.error);
      setMsg(r?.ok ?? null);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const copy = (k: string, v: string | null) => { if (v) { void navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1200); } };
  const box = "min-h-10 w-full rounded-lg bg-white px-3 text-sm text-ink ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500";
  const field = (labelText: string, name: string, def: string | null, extra?: { type?: string; value?: string; onChange?: (v: string) => void; inputMode?: "decimal" }) => (
    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">{labelText}</span>
      {extra?.onChange
        ? <input name={name} inputMode={extra.inputMode} value={extra.value} onChange={(e) => extra.onChange!(e.target.value)} className={box} />
        : <input name={name} type={extra?.type} defaultValue={def ?? ""} className={box} />}
    </label>
  );

  return (
    <ActionForm action={paySupplierInvoice} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="back" value={closeHref} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {inv.fileUrl ? (
          <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200" data-invoice-file>
            <span className="grid h-11 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-[9px] font-bold text-red-600 ring-1 ring-red-100">PDF</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{inv.fileName}</span><span className="block truncate text-xs text-slate-500">{inv.source === "gmail" ? `From Gmail${inv.from ? ` · ${inv.from}` : ""}` : "Added to the job's documents"}</span></span>
            <a href={inv.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700">Open</a>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-center" data-invoice-upload>
            <input ref={input} type="file" className="sr-only" accept="application/pdf,image/*" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
            <span className="text-sm font-semibold text-ink">{busy ? "Adding the invoice…" : `Add ${supplier}'s invoice`}</span>
            <span className="text-xs text-slate-500">PDF or photo. It&apos;s saved with the job&apos;s documents. Gmail isn&apos;t connected yet, so invoices aren&apos;t picked up from your inbox.</span>
          </label>
        )}
        {msg && <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{msg}</p>}
        <p className={cx("flex items-center gap-1.5 text-xs font-medium", read ? "text-brand-700" : "text-slate-500")}><Ico d={read ? "M5 12l5 5 9-10" : "M12 8v5M12 16h.01M12 21a9 9 0 100-18 9 9 0 000 18"} className="h-3.5 w-3.5" />{read ? "Filled in from the invoice. Check it and pay." : "Check these against the invoice before you pay."}</p>
        <div className="grid grid-cols-2 gap-3">
          {field("Invoice number", "invoice_no", inv.no)}
          {field("Invoice date", "invoice_date", inv.date, { type: "date" })}
          {field("Amount ex GST", "invoice_ex", null, { value: ex, onChange: setEx, inputMode: "decimal" })}
          {field("GST", "invoice_gst", null, { value: gst, onChange: setGst, inputMode: "decimal" })}
          {field("Due", "invoice_due", inv.due, { type: "date" })}
          {field("Their ABN", "invoice_abn", inv.abn)}
        </div>
        <div className={cx("rounded-xl px-3.5 py-3 ring-1", Math.abs(diff) < 0.05 ? "bg-brand-50 ring-brand-100" : "bg-amber-50/70 ring-amber-200")} data-match={Math.abs(diff) < 0.05 ? "yes" : "no"}>
          <p className={cx("flex items-center gap-2 text-sm font-semibold", Math.abs(diff) < 0.05 ? "text-brand-800" : "text-amber-900")}><Ico d={Math.abs(diff) < 0.05 ? "M5 12l5 5 9-10" : "M12 8v5M12 16h.01"} />{Math.abs(diff) < 0.05 ? "Matches the order" : `${aud(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the order`}</p>
          <p className="mt-0.5 text-xs text-slate-600">Order {orderCode ?? ""} · {orderItems} item{orderItems === 1 ? "" : "s"} · {aud(orderCost)} ex GST.{Math.abs(diff) >= 0.05 ? " Check for extra items or price changes before you pay." : ""}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-slate-200">
          <p className="border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-500">Pay by bank transfer</p>
          {([["Account name", "bank_name", inv.bankName], ["BSB", "bank_bsb", inv.bsb], ["Account", "bank_account", inv.account]] as const).map(([k, name, v]) => (
            <div key={k} className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-1.5">
              <span className="w-24 shrink-0 text-xs text-slate-500">{k}</span>
              <input name={name} defaultValue={v ?? ""} placeholder="From the invoice" className="min-h-9 min-w-0 flex-1 bg-transparent text-sm font-medium tabular-nums text-ink placeholder:font-normal placeholder:text-slate-300 focus:outline-none" />
              <button type="button" onClick={(e) => copy(k, (e.currentTarget.previousElementSibling as HTMLInputElement).value)} className="text-xs font-semibold text-brand-700">{copied === k ? "Copied" : "Copy"}</button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-3.5 py-2.5"><span className="w-24 shrink-0 text-xs text-slate-500">Reference</span><span className="flex-1 text-sm font-medium text-ink">{inv.no ?? orderCode ?? "Invoice number"}</span></div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">Total inc GST</p><p className="font-display text-2xl font-bold leading-none text-ink" data-pay-total>{aud(total)}</p></div>
        <SubmitButton className="min-h-12 gap-2 px-5"><Ico d="M5 12l5 5 9-10" />I&apos;ve paid it</SubmitButton>
      </div>
    </ActionForm>
  );
}
