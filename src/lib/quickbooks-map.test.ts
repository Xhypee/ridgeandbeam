import { describe, expect, it } from "vitest";
import { customerToQbo, invoiceToQbo, jobCostToQbo, paymentToQbo, plainQboError, qboName, qboQuote } from "./quickbooks-map";

describe("customerToQbo", () => {
  it("maps contact + address and sanitizes the display name", () => {
    const c = customerToQbo({ id: "c1", name: "Jane: Homeowner\t", email: "j@x.com", phone: "555-0100", address: "42 Shingle Ln", city: "Denver", state: "CO", zip: "80202" });
    expect(c.DisplayName).toBe("Jane Homeowner");
    expect(c.PrimaryEmailAddr).toEqual({ Address: "j@x.com" });
    expect(c.BillAddr).toMatchObject({ Line1: "42 Shingle Ln", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80202" });
  });
  it("omits empty optional blocks", () => {
    const c = customerToQbo({ id: "c1", name: "Bob", email: null, phone: null, address: null, city: null, state: null, zip: null });
    expect(c.PrimaryEmailAddr).toBeUndefined();
    expect(c.BillAddr).toBeUndefined();
    expect(qboName("")).toBe("Unnamed");
  });
});

describe("invoiceToQbo", () => {
  const inv = { id: "i1", number: 1007, issue_date: "2026-11-01", due_date: "2026-11-16", discount: 100, tax_rate: 8.25, notes: "Thanks", job_title: "Hail replacement" };
  const items = [{ description: "Shingles", quantity: 30, unit_price: 42 }, { description: "Labor", quantity: 20, unit_price: 95 }];
  it("builds sales lines, discount and tax", () => {
    const q = invoiceToQbo(inv, items, { customer: { value: "58" }, item: { value: "1" } });
    expect(q.DocNumber).toBe("1007");
    expect(q.CustomerRef).toEqual({ value: "58" });
    expect(q.Line).toHaveLength(3);
    expect(q.Line[0]).toMatchObject({ DetailType: "SalesItemLineDetail", Amount: 1260, SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 30, UnitPrice: 42 } });
    expect(q.Line[2]).toMatchObject({ DetailType: "DiscountLineDetail", Amount: 100 });
    // (1260 + 1900 - 100) * 8.25% = 252.45
    expect(q.TxnTaxDetail).toEqual({ TotalTax: 252.45 });
    expect(q.PrivateNote).toContain("Hail replacement");
  });
  it("skips discount and tax when zero", () => {
    const q = invoiceToQbo({ ...inv, discount: 0, tax_rate: 0 }, items, { customer: { value: "1" }, item: { value: "1" } });
    expect(q.Line).toHaveLength(2);
    expect(q.TxnTaxDetail).toBeUndefined();
  });
});

describe("paymentToQbo", () => {
  it("links the payment to the invoice", () => {
    const p = paymentToQbo({ id: "p1", amount: 5000, paid_on: "2026-11-02", method: "check", reference: "Check 1042" }, { customer: { value: "58" }, invoiceTxnId: "130" });
    expect(p.TotalAmt).toBe(5000);
    expect(p.Line[0]).toEqual({ Amount: 5000, LinkedTxn: [{ TxnId: "130", TxnType: "Invoice" }] });
    expect(p.PaymentRefNum).toBe("Check 1042");
  });
});

describe("jobCostToQbo", () => {
  const base = { id: "k1", category: "materials", vendor: "ABC Supply", description: "Shingles delivery", amount: 4200, incurred_on: "2026-11-03", job_title: "Smith roof" };
  const refs = { vendor: { value: "41" }, expenseAccount: { value: "80" }, bankAccount: { value: "35" }, customer: { value: "58" } };
  it("vendor cost -> Bill with job customer on the line", () => {
    const r = jobCostToQbo(base, refs);
    expect(r.entity).toBe("Bill");
    expect(r.body.VendorRef).toEqual({ value: "41" });
    const line = (r.body.Line as Record<string, unknown>[])[0] as { Amount: number; AccountBasedExpenseLineDetail: Record<string, unknown> };
    expect(line.Amount).toBe(4200);
    expect(line.AccountBasedExpenseLineDetail).toMatchObject({ AccountRef: { value: "80" }, CustomerRef: { value: "58" } });
  });
  it("negative vendor cost (return credit) -> VendorCredit with a positive amount", () => {
    const r = jobCostToQbo({ ...base, amount: -310.5 }, refs);
    expect(r.entity).toBe("VendorCredit");
    expect((r.body.Line as { Amount: number }[])[0].Amount).toBe(310.5);
  });
  it("no vendor -> cash Purchase from the bank account", () => {
    const r = jobCostToQbo({ ...base, vendor: null, category: "permit", description: null }, { ...refs, vendor: null });
    expect(r.entity).toBe("Purchase");
    expect(r.body).toMatchObject({ PaymentType: "Cash", AccountRef: { value: "35" } });
    expect((r.body.Line as { Description: string }[])[0].Description).toBe("permit (Smith roof)");
  });
  it("no vendor and no bank account throws", () => {
    expect(() => jobCostToQbo({ ...base, vendor: null }, { expenseAccount: { value: "80" } })).toThrow();
  });
});

describe("plainQboError", () => {
  it("explains common faults in plain language", () => {
    expect(plainQboError(401, {}, "Customer Jane")).toMatch(/Reconnect QuickBooks/);
    expect(plainQboError(400, { Fault: { Error: [{ code: "6240", Detail: "Duplicate Name Exists Error" }] } }, "Customer Jane")).toMatch(/same name/);
    expect(plainQboError(400, { Fault: { Error: [{ code: "2020", Detail: "Required param missing" }] } }, "Invoice #1")).toMatch(/Required param missing/);
    expect(plainQboError(503, {}, "x")).toMatch(/trouble/);
  });
  it("quotes query literals", () => {
    expect(qboQuote("O'Brien")).toBe("'O\\'Brien'");
  });
});
