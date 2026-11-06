/**
 * Pure Ridge & Beam -> QuickBooks Online payload mappers (unit-tested; no I/O).
 * QBO API reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
/** QBO names can't contain ':' (sub-customer separator), tabs or newlines; max 100 chars. */
export const qboName = (s: string) => s.replace(/[:\t\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Unnamed";
const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : undefined);
type Ref = { value: string; name?: string };

export type RbCustomer = { id: string; name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
export function customerToQbo(c: RbCustomer) {
  return {
    DisplayName: qboName(c.name),
    PrimaryEmailAddr: c.email ? { Address: c.email } : undefined,
    PrimaryPhone: c.phone ? { FreeFormNumber: clip(c.phone, 30) } : undefined,
    BillAddr: c.address || c.city ? { Line1: clip(c.address, 500), City: clip(c.city, 255), CountrySubDivisionCode: clip(c.state, 255), PostalCode: clip(c.zip, 30) } : undefined,
    Notes: `Ridge & Beam customer ${c.id}`,
  };
}

export type RbInvoiceItem = { description: string; quantity: number; unit_price: number };
export type RbInvoice = { id: string; number: number; issue_date: string; due_date: string | null; discount: number; tax_rate: number; notes: string | null; job_title?: string | null };
export function invoiceToQbo(inv: RbInvoice, items: RbInvoiceItem[], refs: { customer: Ref; item: Ref }) {
  const subtotal = r2(items.reduce((s, i) => s + r2(Number(i.quantity) * Number(i.unit_price)), 0));
  const discount = r2(Math.min(Number(inv.discount) || 0, subtotal));
  const tax = r2(((subtotal - discount) * (Number(inv.tax_rate) || 0)) / 100);
  const Line: Record<string, unknown>[] = items.map((i) => ({
    DetailType: "SalesItemLineDetail",
    Amount: r2(Number(i.quantity) * Number(i.unit_price)),
    Description: clip(i.description, 4000),
    SalesItemLineDetail: { ItemRef: refs.item, Qty: Number(i.quantity), UnitPrice: Number(i.unit_price) },
  }));
  if (discount > 0) Line.push({ DetailType: "DiscountLineDetail", Amount: discount, DiscountLineDetail: { PercentBased: false } });
  return {
    DocNumber: String(inv.number),
    TxnDate: inv.issue_date,
    DueDate: inv.due_date ?? undefined,
    CustomerRef: refs.customer,
    Line,
    TxnTaxDetail: tax > 0 ? { TotalTax: tax } : undefined,
    CustomerMemo: inv.notes ? { value: clip(inv.notes, 1000) } : undefined,
    PrivateNote: clip(`Ridge & Beam invoice #${inv.number}${inv.job_title ? ` · ${inv.job_title}` : ""}`, 4000),
  };
}

export type RbPayment = { id: string; amount: number; paid_on: string; method: string; reference: string | null };
export function paymentToQbo(p: RbPayment, refs: { customer: Ref; invoiceTxnId: string }) {
  return {
    TotalAmt: r2(Number(p.amount)),
    TxnDate: p.paid_on,
    CustomerRef: refs.customer,
    PaymentRefNum: clip(p.reference ?? p.method, 21),
    PrivateNote: `Ridge & Beam payment ${p.id} (${p.method})`,
    Line: [{ Amount: r2(Number(p.amount)), LinkedTxn: [{ TxnId: refs.invoiceTxnId, TxnType: "Invoice" }] }],
  };
}

export type RbJobCost = { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; job_title?: string | null };
export type CostEntity = "Bill" | "Purchase" | "VendorCredit";
/**
 * Job costs become vendor Bills (when a vendor is known) or cash Purchases; credits/returns
 * (negative amounts) become VendorCredits. Lines carry the job's customer so QBO job costing works.
 */
export function jobCostToQbo(cost: RbJobCost, refs: { vendor?: Ref | null; expenseAccount: Ref; bankAccount?: Ref | null; customer?: Ref | null }): { entity: CostEntity; body: Record<string, unknown> } {
  const amount = r2(Math.abs(Number(cost.amount)));
  const desc = clip([cost.description || cost.category.replace(/_/g, " "), cost.job_title ? `(${cost.job_title})` : null].filter(Boolean).join(" "), 4000);
  const line = {
    DetailType: "AccountBasedExpenseLineDetail",
    Amount: amount,
    Description: desc,
    AccountBasedExpenseLineDetail: { AccountRef: refs.expenseAccount, CustomerRef: refs.customer ?? undefined, BillableStatus: "NotBillable" },
  };
  const note = `Ridge & Beam job cost ${cost.id}`;
  const credit = Number(cost.amount) < 0;
  if (refs.vendor) {
    return { entity: credit ? "VendorCredit" : "Bill", body: { VendorRef: refs.vendor, TxnDate: cost.incurred_on, Line: [line], PrivateNote: note } };
  }
  if (!refs.bankAccount) throw new Error("No bank account available for an expense without a vendor");
  return { entity: "Purchase", body: { PaymentType: "Cash", AccountRef: refs.bankAccount, TxnDate: cost.incurred_on, Credit: credit || undefined, Line: [line], PrivateNote: note } };
}

export function vendorToQbo(name: string) {
  return { DisplayName: qboName(name) };
}

/** Escape a value for a QBO query string literal. */
export const qboQuote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

type Fault = { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] }; fault?: { error?: { message?: string; detail?: string; code?: string }[] } };
/** QBO error payload / HTTP status -> one sentence an office manager can act on. */
export function plainQboError(status: number, body: unknown, what: string): string {
  const f = body as Fault;
  const e = f?.Fault?.Error?.[0] ?? (f?.fault?.error?.[0] ? { Message: f.fault.error[0].message, Detail: f.fault.error[0].detail, code: f.fault.error[0].code } : undefined);
  const code = e?.code ?? "";
  const detail = e?.Detail ?? e?.Message ?? "";
  if (status === 401 || code === "3200" || code === "3201") return "QuickBooks disconnected us (the sign-in expired). Reconnect QuickBooks in Settings → Integrations, then sync again.";
  if (status === 403 || code === "3100") return "Your QuickBooks user isn't allowed to do this. Reconnect with a QuickBooks admin account.";
  if (status === 429 || code === "003001") return "QuickBooks asked us to slow down. Try Sync now again in a minute.";
  if (code === "6240" || /duplicate name/i.test(detail)) return `${what} has the same name as an existing customer, vendor or employee in QuickBooks. Rename one of them, then sync again.`;
  if (code === "6140" || /duplicate document number/i.test(detail)) return `${what}: QuickBooks already has a document with this number. Turn off "custom transaction numbers" duplicates warning or renumber it.`;
  if (code === "610" || /object not found/i.test(detail)) return `${what} points at something that was deleted in QuickBooks. Restore it there or resolve this to re-create it.`;
  if (code === "6000" || code === "2020" || code === "2010") return `QuickBooks rejected ${what.toLowerCase()}: ${detail || "a required field is missing"}`;
  if (code === "5010" || /stale object/i.test(detail)) return `${what} was changed in QuickBooks at the same time. Sync again.`;
  if (status >= 500) return "QuickBooks is having trouble right now. Try again later.";
  return `${what} didn't sync: ${detail || `QuickBooks returned HTTP ${status}`}`;
}
