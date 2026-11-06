// ATO tax invoice maths and requirements (pure; mirrors the SQL view public.invoice_totals).
// Source: research_notes/.../insurance_payments_warranties.md §4 (ATO "Tax invoices"):
//  under $1,000: words showing it is a tax invoice, seller identity, seller ABN, issue date, description
//  (quantity and price), GST amount (or a statement that the price includes GST), extent each sale is taxable;
//  $1,000 or more (GST-inclusive): also the buyer's identity or ABN.
import { isValidAbn } from "./au";

export const TAX_INVOICE_BUYER_THRESHOLD = 1000;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type GstLine = { quantity: number | string; unit_price: number | string };
export type GstTotals = { subtotal: number; discount: number; total: number; gst: number; exGst: number };

/**
 * GST-inclusive invoices (the default): line amounts include GST, GST = total × rate / (100 + rate).
 * Legacy exclusive invoices add GST on top.
 */
export function invoiceGstTotals(items: GstLine[], discount: number | string, ratePct: number | string, inclusive = true): GstTotals {
  const subtotal = r2(items.reduce((s, i) => s + r2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0));
  const d = r2(Math.min(Math.max(Number(discount) || 0, 0), Math.max(subtotal, 0)));
  const base = r2(Math.max(subtotal - d, 0));
  const rate = Math.max(Number(ratePct) || 0, 0);
  if (inclusive) {
    const gst = r2((base * rate) / (100 + rate));
    return { subtotal, discount: d, total: base, gst, exGst: r2(base - gst) };
  }
  const gst = r2((base * rate) / 100);
  return { subtotal, discount: d, total: r2(base + gst), gst, exGst: base };
}

export type TaxInvoiceCheck = {
  /** "Tax invoice" when the seller is GST-registered, otherwise "Invoice". */
  title: "Tax invoice" | "Invoice";
  gstRegistered: boolean;
  /** Buyer identity or ABN must be shown (total ≥ $1,000 on a tax invoice). */
  buyerRequired: boolean;
  /** Problems that stop the invoice being a valid tax invoice (empty = OK to send). */
  problems: string[];
};

export function taxInvoiceCheck(i: { gstRegistered: boolean; sellerName: string | null | undefined; sellerAbn: string | null | undefined; total: number; buyerName?: string | null; buyerAbn?: string | null; itemCount: number }): TaxInvoiceCheck {
  const problems: string[] = [];
  const buyerRequired = i.gstRegistered && i.total >= TAX_INVOICE_BUYER_THRESHOLD;
  if (i.itemCount === 0) problems.push("Add at least one line describing what you supplied.");
  if (i.gstRegistered) {
    if (!i.sellerName?.trim()) problems.push("Your business name is missing (Settings → Company).");
    if (!i.sellerAbn) problems.push("Your ABN is missing. A tax invoice must show it — add it in Settings → Company.");
    else if (!isValidAbn(i.sellerAbn)) problems.push("Your ABN doesn't look right. Check it in Settings → Company.");
    if (buyerRequired && !i.buyerName?.trim() && !i.buyerAbn?.trim()) problems.push("Tax invoices of $1,000 or more must show the buyer's name or ABN.");
  }
  if (i.buyerAbn && !isValidAbn(i.buyerAbn)) problems.push("The buyer's ABN doesn't look right (11 digits).");
  return { title: i.gstRegistered ? "Tax invoice" : "Invoice", gstRegistered: i.gstRegistered, buyerRequired, problems };
}

/** Keep digits only; empty → null. */
export const cleanAbn = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d ? d : null;
};
