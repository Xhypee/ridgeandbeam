import { describe, expect, it } from "vitest";
import { handoverEmail, warrantyEnds, workmanshipPdf, type HandoverDoc } from "./handover";

const d: HandoverDoc = {
  org: { name: "Bbang Roofing", phone: "0413 881 009", email: "owner@bbang.test", abn: "12 345 678 901", licence: "15123456" },
  customer: { name: "Chris Parker" }, site: "60 Oxford St, Bulimba QLD 4171",
  job: { title: "Re-roof, Bulimba", completedOn: "2026-11-06", quoteNo: 1005 },
  workmanshipYears: 7, product: "COLORBOND steel", photoCount: 6,
};

describe("handover pack", () => {
  it("covers the workmanship for the company's years from completion", () => {
    expect(warrantyEnds("2026-11-06", 7)).toBe("6 November 2033");
  });
  it("lists the warranty, the manufacturer's product and the photos, in plain words", () => {
    const e = handoverEmail(d);
    expect(e.text).toContain("Hi Chris,");
    expect(e.text).toContain("7-year workmanship warranty certificate");
    expect(e.text).toContain("COLORBOND steel");
    expect(e.text).toContain("6 photos");
    expect(e.html).not.toContain("<script");
  });
  it("makes the certificate PDF", async () => {
    const pdf = await workmanshipPdf(d);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
