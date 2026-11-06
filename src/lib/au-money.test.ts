import { describe, expect, it } from "vitest";
import { cleanAbn, invoiceGstTotals, taxInvoiceCheck } from "./invoice-gst";
import { bankReference, formatBsb, isValidAccount, isValidBsb, normalisePayId } from "./payments-au";
import { buildTpar, financialYear, tparCsv } from "./tpar";
import { customerToXero, DEFAULT_XERO_ACCOUNTS, invoiceToXero, jobCostToXero, paymentToXero, plainXeroError, supplierToXero, xeroQuote } from "./xero-map";

const VALID_ABN = "51824753556"; // ATO example ABN (passes the checksum)

describe("GST on invoices", () => {
  it("extracts GST from GST-inclusive amounts (1/11)", () => {
    const t = invoiceGstTotals([{ quantity: 1, unit_price: 1100 }, { quantity: 2, unit_price: 55 }], 0, 10, true);
    expect(t).toEqual({ subtotal: 1210, discount: 0, total: 1210, gst: 110, exGst: 1100 });
  });
  it("adds GST on top for legacy exclusive invoices, and none when not registered", () => {
    expect(invoiceGstTotals([{ quantity: 1, unit_price: 1000 }], 100, 10, false)).toMatchObject({ total: 990, gst: 90, exGst: 900 });
    expect(invoiceGstTotals([{ quantity: 1, unit_price: 1000 }], 0, 0, true)).toMatchObject({ total: 1000, gst: 0 });
  });
});

describe("ATO tax invoice requirements", () => {
  const ok = { gstRegistered: true, sellerName: "Top Roofing", sellerAbn: VALID_ABN, total: 500, itemCount: 1 };
  it("titles the document by GST registration", () => {
    expect(taxInvoiceCheck(ok).title).toBe("Tax invoice");
    expect(taxInvoiceCheck({ ...ok, gstRegistered: false, sellerAbn: null }).title).toBe("Invoice");
    expect(taxInvoiceCheck({ ...ok, gstRegistered: false, sellerAbn: null }).problems).toEqual([]);
  });
  it("needs the seller ABN, and the buyer from $1,000", () => {
    expect(taxInvoiceCheck({ ...ok, sellerAbn: null }).problems.join(" ")).toMatch(/ABN is missing/);
    expect(taxInvoiceCheck({ ...ok, sellerAbn: "12345678901" }).problems.join(" ")).toMatch(/doesn't look right/);
    expect(taxInvoiceCheck({ ...ok, total: 999.99 }).buyerRequired).toBe(false);
    const big = taxInvoiceCheck({ ...ok, total: 1000 });
    expect(big.buyerRequired).toBe(true);
    expect(big.problems.join(" ")).toMatch(/buyer's name or ABN/);
    expect(taxInvoiceCheck({ ...ok, total: 1000, buyerName: "Jane Citizen" }).problems).toEqual([]);
    expect(taxInvoiceCheck({ ...ok, total: 5000, buyerAbn: VALID_ABN }).problems).toEqual([]);
    expect(cleanAbn("51 824 753 556")).toBe(VALID_ABN);
  });
});

describe("AU bank details", () => {
  it("validates and formats BSB, account and PayID", () => {
    expect(isValidBsb("062-000")).toBe(true);
    expect(isValidBsb("06200")).toBe(false);
    expect(formatBsb("062000")).toBe("062-000");
    expect(isValidAccount("1234 5678")).toBe(true);
    expect(isValidAccount("123")).toBe(false);
    expect(normalisePayId("phone", "0412345678")).toBe("0412 345 678");
    expect(normalisePayId("email", "Pay@Roof.com.au")).toBe("pay@roof.com.au");
    expect(normalisePayId("abn", "51 824 753 556")).toBe(VALID_ABN);
    expect(normalisePayId("email", "nope")).toBeNull();
    expect(bankReference(1042)).toBe("INV1042");
  });
});

describe("TPAR", () => {
  it("knows the Australian financial year and the 28 August due date", () => {
    expect(financialYear("2026-06-30")).toMatchObject({ start: "2025-07-01", end: "2026-06-30", label: "2025–26", dueDate: "2026-08-28" });
    expect(financialYear("2026-07-01").label).toBe("2026–27");
  });
  it("totals crew pay and labour by contractor with ABN and GST", () => {
    const fy = financialYear("2026-03-01");
    const crews = [
      { id: "c1", name: "Smith Roofing", abn: VALID_ABN, gst_registered: true, phone: null },
      { id: "c2", name: "Joe Cash", abn: null, gst_registered: false, phone: "0400000000" },
      { id: "c3", name: "Our Employee", abn: null, gst_registered: false, phone: null, is_subcontractor: false },
    ];
    const costs = [
      { id: "1", amount: 4000, incurred_on: "2025-09-01", vendor: "Smith Roofing", source: "crew_pay", source_id: "c1", category: "labor" },
      { id: "2", amount: 1000, incurred_on: "2026-02-01", vendor: "smith roofing", source: "manual", source_id: null, category: "labor" },
      { id: "3", amount: 800, incurred_on: "2026-01-01", vendor: "Joe Cash", source: "manual", source_id: null, category: "labor" },
      { id: "4", amount: 9999, incurred_on: "2026-01-01", vendor: "Stramit", source: "order", source_id: null, category: "materials" },
      { id: "5", amount: 500, incurred_on: "2026-07-02", vendor: "Smith Roofing", source: "crew_pay", source_id: "c1", category: "labor" },
      { id: "6", amount: 700, incurred_on: "2026-01-05", vendor: "Our Employee", source: "manual", source_id: null, category: "labor" },
    ];
    const rows = buildTpar(costs, crews, fy);
    expect(rows.map((r) => [r.name, r.abn, r.payments, r.amountExGst, r.gst, r.gross])).toEqual([
      ["Joe Cash", null, 1, 800, 0, 800],
      ["Smith Roofing", VALID_ABN, 2, 5000, 500, 5500],
    ]);
    const csv = tparCsv(rows, fy);
    expect(csv.split("\r\n")[0]).toMatch(/^﻿Payee name,Payee ABN/);
    expect(csv).toMatch(/Smith Roofing,51824753556,,5500\.00,500\.00,0\.00,2,2025–26,/);
    expect(csv).toMatch(/ABN missing/);
  });
});

describe("Xero payload mappers", () => {
  const accounts = DEFAULT_XERO_ACCOUNTS;
  it("maps customers and suppliers to contacts", () => {
    const c = customerToXero({ id: "u1", name: "  Jane  Citizen ", email: "j@x.au", phone: "0400 000 000", address: "1 Main St", city: "Newtown", state: "NSW", zip: "2042" });
    expect(c).toMatchObject({ Name: "Jane Citizen", ContactNumber: "RB-u1", Addresses: [{ Region: "NSW", PostalCode: "2042", Country: "Australia" }] });
    expect(supplierToXero({ name: "Smith Roofing", abn: "51 824 753 556" }).TaxNumber).toBe(VALID_ABN);
  });
  it("maps GST-inclusive tax invoices to ACCREC with OUTPUT (GST on Income)", () => {
    const inv = invoiceToXero(
      { id: "i1", number: 1042, issue_date: "2026-11-06", due_date: null, discount: 100, tax_rate: 10, amounts_include_gst: true, job_title: "Re-roof" },
      [{ description: "Colorbond re-roof", quantity: 1, unit_price: 21072.35 }],
      { contactId: "C1", gstRegistered: true, accounts },
    );
    expect(inv).toMatchObject({ Type: "ACCREC", InvoiceNumber: "1042", LineAmountTypes: "Inclusive", Status: "AUTHORISED", CurrencyCode: "AUD", DueDate: "2026-11-06", Contact: { ContactID: "C1" } });
    expect(inv.LineItems).toEqual([
      { Description: "Colorbond re-roof", Quantity: 1, UnitAmount: 21072.35, AccountCode: "200", TaxType: "OUTPUT" },
      { Description: "Discount", Quantity: 1, UnitAmount: -100, AccountCode: "200", TaxType: "OUTPUT" },
    ]);
    const noGst = invoiceToXero({ id: "i2", number: 7, issue_date: "2026-11-06", due_date: "2026-11-20", discount: 0, tax_rate: 0, amounts_include_gst: true }, [{ description: "Repair", quantity: 1, unit_price: 400 }], { contactId: "C1", gstRegistered: false, accounts });
    expect(noGst.LineAmountTypes).toBe("NoTax");
    expect((noGst.LineItems[0] as { TaxType?: string }).TaxType).toBeUndefined();
  });
  it("maps payments to the bank account", () => {
    expect(paymentToXero({ id: "p1", amount: 2107.235, paid_on: "2026-11-06", method: "bank_transfer", reference: null }, { invoiceId: "X1", bankAccountCode: "090" })).toEqual({
      Invoice: { InvoiceID: "X1" }, Account: { Code: "090" }, Date: "2026-11-06", Amount: 2107.24, Reference: "bank transfer",
    });
  });
  it("maps job costs to bills (INPUT) and credits to supplier credit notes", () => {
    const bill = jobCostToXero({ id: "abcdef12-0000", category: "labor", vendor: "Smith", description: "Crew pay", amount: 4000, incurred_on: "2026-10-01", job_title: "Re-roof" }, { contactId: "S1", supplierGst: true, orgGst: true, accounts });
    expect(bill.entity).toBe("Invoices");
    expect(bill.body).toMatchObject({ Type: "ACCPAY", LineAmountTypes: "Exclusive", DueDate: "2026-10-01" });
    expect((bill.body.LineItems as { TaxType: string; AccountCode: string; UnitAmount: number }[])[0]).toMatchObject({ TaxType: "INPUT", AccountCode: "310", UnitAmount: 4000 });
    const credit = jobCostToXero({ id: "c2", category: "materials", vendor: "Stramit", description: "Return", amount: -250, incurred_on: "2026-10-02" }, { contactId: "S2", supplierGst: false, orgGst: true, accounts });
    expect(credit.entity).toBe("CreditNotes");
    expect(credit.body.Type).toBe("ACCPAYCREDIT");
    expect((credit.body.LineItems as { TaxType: string; UnitAmount: number }[])[0]).toMatchObject({ TaxType: "EXEMPTEXPENSES", UnitAmount: 250 });
  });
  it("explains Xero errors in plain language", () => {
    expect(plainXeroError(401, {}, "Invoice #1")).toMatch(/Reconnect Xero/);
    expect(plainXeroError(400, { Elements: [{ ValidationErrors: [{ Message: "Account code '999' is not a valid code for this document." }] }] }, "Invoice #1")).toMatch(/account codes/);
    expect(plainXeroError(400, { Elements: [{ ValidationErrors: [{ Message: "Email address must be valid." }] }] }, "Customer Jo")).toMatch(/Email address must be valid/);
    expect(plainXeroError(429, {}, "x")).toMatch(/slow down/);
    expect(xeroQuote('Jo "JJ" Smith')).toBe('"Jo \\"JJ\\" Smith"');
  });
});
