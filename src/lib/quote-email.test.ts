import { describe, expect, it } from "vitest";
import type { PublicEstimate } from "@/app/q/[token]/model";
import { buildQuoteEmail, paymentParts, validDays, waysToPayText } from "./quote-email";

const doc = (lines: [string, number, string, number][], over: Partial<PublicEstimate> = {}): PublicEstimate => ({
  kind: "estimate", id: "e1", number: 1012, status: "sent", created_at: "2026-11-08T05:00:00Z", sent_at: "2026-11-08T06:00:00Z",
  notes: "Replace the rusted valley iron and rebed the ridge.", terms: "This quote is valid for 30 days. All prices are in Australian dollars and include GST.",
  tax_rate: 10, discount: 0, gst_inclusive: true, accepted_at: null, accepted_name: null, option_label: "options", selected_option_id: null,
  signature_data: null, legal_notices: [], state: "QLD",
  org: { name: "Bbang Roofing", phone: "0413 881 009", email: "hello@bbang.example", address: "4/27 Kingston Rd, Underwood", website: null, state: "QLD", postcode: "4119", abn: "71166542651", gst_registered: true, insurance_certificate_url: null, licence: { number: "15234789", classes: ["Roof and wall cladding"] } },
  financing: { enabled: false, apr: 0, term_months: 0 },
  customer: { name: "Priya Sharma", email: "priya@example.com", phone: "0412 345 678", street: "9 Bay Tce", suburb: "Wynnum", state: "QLD", postcode: "4178" },
  job: { title: "Valley repair", site_address: "9 Bay Tce, Wynnum QLD 4178", state: "QLD", is_insurance: false, roof_material: "concrete_tile", job_type: "repair", lead_source: "website" },
  compliance: null, options: [],
  items: lines.map(([description, quantity, unit, unit_price]) => ({ description, quantity, unit, unit_price, option_id: null, extra_status: null })),
  ...over,
});
const base = { url: "https://ridgeandbeam.com/q/abc", logoUrl: "https://ridgeandbeam.com/email/mark.png", sender: { name: "Bambang Durrani", phone: "0413 881 009" }, payMethods: ["bank", "card", "cash"] as const };

describe("quote email", () => {
  it("is a complete small-job quote: business, licence, ABN, single total inc GST, validity, link", () => {
    const e = buildQuoteEmail({ ...base, payMethods: [...base.payMethods], doc: doc([["New valley iron", 6.2, "lm", 110.35], ["Rebed ridge", 8, "lm", 33], ["Replace tiles", 12, "ea", 16.5], ["Labour", 1, "job", 385]]), schedule: [{ label: "On completion", pct: 100, trigger: "completed" }], depositCap: null });
    expect(e.total).toBe(1531.17);
    expect(e.subject).toBe("Quote 1012: Valley repair · $1,531.17 inc GST");
    for (const s of ["Bbang Roofing", "ABN 71 166 542 651", "Licence 15234789", "Priya Sharma", "9 Bay Tce, Wynnum QLD 4178", "$1,531.17", "includes GST of $139.20", "valid until 8 Dec 2026", "https://ridgeandbeam.com/q/abc", "No card surcharge", "agreed with you in writing"]) expect(e.html).toContain(s);
    expect(e.text).toContain("View and accept it here: https://ridgeandbeam.com/q/abc");
  });

  it("over $20k in QLD: cooling-off notice, deposit within the legal limit", () => {
    const e = buildQuoteEmail({ ...base, payMethods: ["bank"], doc: doc([["New COLORBOND roof", 1, "job", 31046.4]]), schedule: [{ label: "Deposit", pct: 30, trigger: "signed" }, { label: "Roof finished", pct: 70, trigger: "completed" }], depositCap: 1552.32 });
    expect(e.html).toMatch(/cooling-off/i);
    expect(e.html).toContain("Deposit: $1,552.32 when you accept");
    expect(e.html).toContain("within the $1,552.32 legal limit");
    expect(e.html).not.toContain("No card surcharge");
  });

  it("escapes customer text", () => {
    const e = buildQuoteEmail({ ...base, payMethods: ["bank"], doc: doc([["<script>x</script>", 1, "job", 100]]), schedule: [], depositCap: null });
    expect(e.html).not.toContain("<script>x");
    expect(e.html).toContain("&lt;script&gt;");
  });
});

describe("helpers", () => {
  it("reads the validity from the terms", () => {
    expect(validDays("This quote is valid for 14 days.")).toBe(14);
    expect(validDays(null)).toBe(30);
  });
  it("caps the deposit and moves the rest to the next payment", () => {
    const p = paymentParts(10000, [{ label: "Deposit", pct: 30, trigger: "signed" }, { label: "Done", pct: 70, trigger: "completed" }], 1000);
    expect(p.map((x) => x.amount)).toEqual([1000, 9000]);
  });
  it("says how to pay", () => {
    expect(waysToPayText(["bank", "card", "cash"])).toBe("Bank transfer or PayID, card or cash");
  });
});

describe("formatting", async () => {
  const { auPhone } = await import("./quote-email");
  it("formats AU phone numbers", () => {
    expect(auPhone("0413881009")).toBe("0413 881 009");
    expect(auPhone("+61 7 3333 4444")).toBe("07 3333 4444");
  });
  it("doesn't double the state and postcode in the address", () => {
    const e = buildQuoteEmail({ ...base, payMethods: ["bank"], doc: doc([["Repair", 1, "job", 100]], { org: { ...doc([]).org, address: "4/27 Kingston Rd, Underwood QLD 4119" } }), schedule: [], depositCap: null });
    expect(e.html).toContain("4/27 Kingston Rd, Underwood QLD 4119<");
    expect(e.html).not.toContain("QLD 4119 QLD 4119");
  });
});
