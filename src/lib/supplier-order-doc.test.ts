import { describe, expect, it } from "vitest";
import { deliveryWhen, orderCode, qtyText, roofReportPdf, supplierOrderEmail, supplierOrderPdf, type SupplierOrderDoc } from "./supplier-order-doc";

const doc: SupplierOrderDoc = {
  code: "1004-STE", supplier: "Steeline", branch: "Slacks Creek", account: null,
  org: { name: "Bbang Roofing", phone: "0413881009", email: "owner@bbang.test", abn: null }, sender: "Matt",
  job: { customer: "Sophie Williams", title: "Re-roof", address: "28 Latrobe Tce, Paddington QLD 4064" },
  delivery: { date: "2026-11-13", time: "7 am", type: "crane", contact: "Matt 0412 345 678", notes: "Power lines <street side>" },
  confirmUrl: "https://ridgeandbeam.com/o/abc", logoUrl: "https://ridgeandbeam.com/email/mark.png", attachNames: ["Order 1004-STE.pdf"], withPlans: true,
  items: [
    { description: "COLORBOND Custom Orb", spec: "Woodland Grey", sku: null, quantity: 43, unit: "m", length_m: 6.5 },
    { description: "Roofing screws", spec: null, sku: null, quantity: 4, unit: "box", length_m: null },
  ],
};

describe("supplier order email", () => {
  const e = supplierOrderEmail(doc);
  it("has no prices, only what to supply", () => {
    expect(e.html).not.toMatch(/\$\s?\d/);
    expect(e.text).not.toMatch(/\$\s?\d/);
    expect(e.html).toContain("COLORBOND Custom Orb");
  });
  it("links to the no-login confirm page and greets the team", () => {
    expect(e.html).toContain(doc.confirmUrl);
    expect(e.text).toContain("Hi Steeline team,");
  });
  it("escapes what people typed", () => {
    expect(e.html).not.toContain("<street side>");
  });
  it("puts the code and delivery day in the subject", () => {
    expect(e.subject).toContain("1004-STE");
    expect(e.subject).toContain("13 Nov");
  });
});

describe("quantities", () => {
  it("shows cut lengths as pieces × length", () => {
    expect(qtyText({ quantity: 43, unit: "m", length_m: 6.5 })).toMatch(/43 × 6\.50 m/);
    expect(qtyText({ quantity: 12.6, unit: "m", length_m: null })).toMatch(/12\.6 m/);
  });
  it("says when the date isn't set", () => {
    expect(deliveryWhen(null, null)).toMatch(/confirmed/i);
  });
});

describe("order codes", () => {
  it("keeps suppliers with the same initial apart", () => {
    expect(orderCode(1004, "Steeline")).toBe("1004-STE");
    expect(orderCode(1004, "Stratco")).toBe("1004-STR");
    expect(orderCode(null, "Lysaght (BlueScope)")).toBe("JOB-LYS");
  });
});

describe("PDFs", () => {
  it("builds the order PDF and the roof report", async () => {
    const a = await supplierOrderPdf(doc);
    const b = await roofReportPdf(doc, { area: 212.4, planArea: 184, pitch: 22.5, faces: 4, lengths: [["Ridge", 12.6, "m"], ["Valley", 4.41, "m"]] });
    expect(new TextDecoder().decode(a.slice(0, 5))).toBe("%PDF-");
    expect(b.length).toBeGreaterThan(500);
  });
});
