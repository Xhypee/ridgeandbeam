/**
 * Pure Ridge & Beam -> Xero Accounting API payload mappers (unit-tested; no I/O).
 * API reference: https://developer.xero.com/documentation/api/accounting/overview
 * Australian GST tax types: OUTPUT ("GST on Income"), INPUT ("GST on Expenses"),
 * EXEMPTOUTPUT ("GST Free Income"), EXEMPTEXPENSES ("GST Free Expenses").
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : undefined);
/** Xero contact names: max 255 chars, no leading/trailing spaces. */
export const xeroName = (s: string) => s.replace(/[\t\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 255) || "Unnamed";

export type XeroAccounts = { sales: string; costs: string; bank: string };
export const DEFAULT_XERO_ACCOUNTS: XeroAccounts = { sales: "200", costs: "310", bank: "090" };

export const TAX = { output: "OUTPUT", input: "INPUT", gstFreeIncome: "EXEMPTOUTPUT", gstFreeExpense: "EXEMPTEXPENSES" } as const;

export type RbCustomer = { id: string; name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
export function customerToXero(c: RbCustomer) {
  return {
    Name: xeroName(c.name),
    ContactNumber: `RB-${c.id}`.slice(0, 50),
    EmailAddress: clip(c.email, 255),
    Phones: c.phone ? [{ PhoneType: "MOBILE", PhoneNumber: clip(c.phone, 50) }] : undefined,
    Addresses:
      c.address || c.city
        ? [{ AddressType: "STREET", AddressLine1: clip(c.address, 500), City: clip(c.city, 255), Region: clip(c.state, 255), PostalCode: clip(c.zip, 50), Country: "Australia" }]
        : undefined,
  };
}

/** Supplier / contractor contact (crews carry their ABN as the Xero tax number). */
export function supplierToXero(s: { name: string; abn?: string | null; phone?: string | null }) {
  return {
    Name: xeroName(s.name),
    TaxNumber: s.abn ? s.abn.replace(/\D/g, "") : undefined,
    Phones: s.phone ? [{ PhoneType: "MOBILE", PhoneNumber: clip(s.phone, 50) }] : undefined,
  };
}

export type RbInvoiceItem = { description: string; quantity: number; unit_price: number };
export type RbInvoice = {
  id: string;
  number: number;
  issue_date: string;
  due_date: string | null;
  discount: number;
  tax_rate: number;
  amounts_include_gst: boolean;
  job_title?: string | null;
};

/**
 * Sales invoice (ACCREC). GST-registered orgs use OUTPUT ("GST on Income"); amounts follow the invoice:
 * GST-inclusive invoices send LineAmountTypes "Inclusive". Not registered for GST -> "NoTax".
 */
export function invoiceToXero(inv: RbInvoice, items: RbInvoiceItem[], refs: { contactId: string; gstRegistered: boolean; accounts: XeroAccounts }) {
  const gst = refs.gstRegistered && Number(inv.tax_rate) > 0;
  const taxType = gst ? TAX.output : refs.gstRegistered ? TAX.gstFreeIncome : undefined;
  const LineItems: Record<string, unknown>[] = items.map((i) => ({
    Description: clip(i.description, 4000) ?? "Roofing work",
    Quantity: Number(i.quantity),
    UnitAmount: r2(Number(i.unit_price)),
    AccountCode: refs.accounts.sales,
    TaxType: taxType,
  }));
  const discount = r2(Number(inv.discount) || 0);
  if (discount > 0) LineItems.push({ Description: "Discount", Quantity: 1, UnitAmount: -discount, AccountCode: refs.accounts.sales, TaxType: taxType });
  return {
    Type: "ACCREC",
    Contact: { ContactID: refs.contactId },
    InvoiceNumber: String(inv.number),
    Reference: clip(inv.job_title ?? undefined, 255),
    Date: inv.issue_date,
    DueDate: inv.due_date ?? inv.issue_date,
    CurrencyCode: "AUD",
    LineAmountTypes: !refs.gstRegistered ? "NoTax" : inv.amounts_include_gst ? "Inclusive" : "Exclusive",
    Status: "AUTHORISED",
    LineItems,
  };
}

export type RbPayment = { id: string; amount: number; paid_on: string; method: string; reference: string | null };
export function paymentToXero(p: RbPayment, refs: { invoiceId: string; bankAccountCode: string }) {
  return {
    Invoice: { InvoiceID: refs.invoiceId },
    Account: { Code: refs.bankAccountCode },
    Date: p.paid_on,
    Amount: r2(Number(p.amount)),
    Reference: clip(p.reference ?? p.method.replace(/_/g, " "), 255),
  };
}

export type RbJobCost = { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; job_title?: string | null };
export type CostEntity = "Invoices" | "CreditNotes";
/**
 * Job costs become supplier bills (ACCPAY) with INPUT ("GST on Expenses"); credits/returns
 * (negative amounts) become supplier credit notes (ACCPAYCREDIT). Job cost amounts are recorded ex GST.
 */
export function jobCostToXero(cost: RbJobCost, refs: { contactId: string; supplierGst: boolean; orgGst: boolean; accounts: XeroAccounts }): { entity: CostEntity; body: Record<string, unknown> } {
  const amount = r2(Math.abs(Number(cost.amount)));
  const credit = Number(cost.amount) < 0;
  const Description = clip([cost.description || cost.category.replace(/_/g, " "), cost.job_title ? `(${cost.job_title})` : null].filter(Boolean).join(" "), 4000);
  const body: Record<string, unknown> = {
    Type: credit ? "ACCPAYCREDIT" : "ACCPAY",
    Contact: { ContactID: refs.contactId },
    Date: cost.incurred_on,
    Reference: clip(`Ridge & Beam job cost ${cost.id.slice(0, 8)}`, 255),
    CurrencyCode: "AUD",
    LineAmountTypes: refs.orgGst ? "Exclusive" : "NoTax",
    Status: "AUTHORISED",
    LineItems: [{ Description, Quantity: 1, UnitAmount: amount, AccountCode: refs.accounts.costs, TaxType: refs.orgGst ? (refs.supplierGst ? TAX.input : TAX.gstFreeExpense) : undefined }],
  };
  if (!credit) body.DueDate = cost.incurred_on;
  return { entity: credit ? "CreditNotes" : "Invoices", body };
}

/** Escape a value for a Xero `where` filter string literal. */
export const xeroQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

type XeroErrorBody = {
  Message?: string;
  Detail?: string;
  Title?: string;
  Elements?: { ValidationErrors?: { Message?: string }[] }[];
};

/** Xero error payload / HTTP status -> one sentence an office manager can act on. */
export function plainXeroError(status: number, body: unknown, what: string): string {
  const b = (body ?? {}) as XeroErrorBody;
  const validation = b.Elements?.flatMap((e) => e.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean) as string[] | undefined;
  const detail = validation?.length ? validation.join(" ") : (b.Detail ?? b.Message ?? b.Title ?? "");
  if (status === 401) return "Xero disconnected us (the sign-in expired). Reconnect Xero in Settings → Integrations, then sync again.";
  if (status === 403) return "Your Xero user isn't allowed to do this, or the organisation was disconnected. Reconnect with a Xero adviser or standard user.";
  if (status === 429) return "Xero asked us to slow down (rate limit). Try Sync now again in a minute.";
  if (/account code/i.test(detail) && /not (a )?valid|does not exist|archived/i.test(detail))
    return `${what}: Xero doesn't recognise one of the account codes. Check the sales, cost and bank account codes in Settings → Integrations.`;
  if (/tax ?type/i.test(detail)) return `${what}: Xero rejected the GST tax rate. Check the account allows "GST on Income" / "GST on Expenses".`;
  if (/already (been )?(used|exists)|must be unique/i.test(detail)) return `${what}: Xero already has a document with this number. Renumber it in Xero or resolve this to send it again.`;
  if (/payment.*(exceed|more than)|amount.*outstanding/i.test(detail)) return `${what}: the payment is more than what Xero shows as owing on the invoice.`;
  if (status === 400) return `Xero rejected ${what.toLowerCase()}: ${detail || "a required field is missing"}`;
  if (status === 404) return `${what} points at something that was deleted in Xero. Resolve this to re-create it.`;
  if (status >= 500) return "Xero is having trouble right now. Try again later.";
  return `${what} didn't sync: ${detail || `Xero returned HTTP ${status}`}`;
}
