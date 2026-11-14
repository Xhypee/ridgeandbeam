import { describe, expect, it } from "vitest";
import { normalizeMeasurements, summarize } from "./roof";
import { intakeNote, NO_ROOF, planDocUpdates, roofAreaDiff, roofMeasurementsFromDoc, sameValue, type Current, type DocRead } from "./doc-intake";

const read = (over: Partial<DocRead>): DocRead => ({
  doc_type: "other", summary: null,
  customer: { phone: null, email: null, address: null, suburb: null, state: null, postcode: null },
  site: { address: null, suburb: null, state: null, postcode: null },
  job: { roof_material: null, roof_area_m2: null },
  roof: NO_ROOF,
  insurance: { insurer: null, claim_number: null, policy_number: null, assessor_name: null, assessor_phone: null, assessor_email: null, excess: null, date_of_loss: null },
  notes: null, ...over,
});
const cur = (over: Partial<Current> = {}): Current => ({
  customer: { phone: null, email: null, address: null, city: null, state: null, zip: null },
  job: { site_address: null, state: null, zip: null, roof_material: null, is_insurance: false },
  claim: null, ...over,
});

describe("sameValue", () => {
  it("treats +61 and 0 mobiles, case and spacing as the same", () => {
    expect(sameValue("phone", "+61 491 570 313", "0491570313")).toBe(true);
    expect(sameValue("email", "Priya@Example.com ", "priya@example.com")).toBe(true);
    expect(sameValue("text", "9 Bay Tce, Wynnum QLD 4178", "9 Bay Tce Wynnum")).toBe(true);
    expect(sameValue("phone", "0491 570 313", "0412 000 000")).toBe(false);
  });
});

describe("planDocUpdates", () => {
  it("starts an insurance claim from an assessor report and fills empty fields only", () => {
    const p = planDocUpdates(read({
      doc_type: "insurance", summary: "NRMA assessor report approving roof repairs.",
      customer: { phone: "0491 570 313", email: "PRIYA@example.com", address: null, suburb: null, state: null, postcode: null },
      insurance: { insurer: "NRMA", claim_number: "88213", policy_number: null, assessor_name: "Jane Smith", assessor_phone: "0400 111 222", assessor_email: null, excess: 500, date_of_loss: "2026-10-30" },
    }), cur({ customer: { phone: "0491570313", email: null, address: null, city: null, state: null, zip: null } }));
    expect(p.createClaim).toBe(true);
    expect(p.job.is_insurance).toBe(true);
    expect(p.claim).toMatchObject({ carrier: "NRMA", claim_number: "88213", adjuster_name: "Jane Smith", excess: 500, date_of_loss: "2026-10-30" });
    expect(p.customer).toEqual({ email: "priya@example.com" }); // mobile already on file (same number)
    expect(p.differs).toEqual([]);
  });

  it("never overwrites: a different value becomes a note", () => {
    const p = planDocUpdates(read({ doc_type: "correspondence", customer: { phone: "0412 000 000", email: null, address: null, suburb: null, state: null, postcode: null } }),
      cur({ customer: { phone: "0491 570 313", email: null, address: null, city: null, state: null, zip: null } }));
    expect(p.customer).toEqual({});
    expect(p.differs[0]).toContain("mobile on file is 0491 570 313");
  });

  it("files plans as plans, fills the site, ignores the architect's phone, and points to Measure from plans", () => {
    const p = planDocUpdates(read({
      doc_type: "plans", customer: { phone: "07 3000 1111", email: "studio@architects.com.au", address: null, suburb: null, state: null, postcode: null },
      site: { address: "Lot 214 Grand Ave", suburb: "Springfield Lakes", state: "qld", postcode: "4300" }, job: { roof_material: "Colorbond Kliplok", roof_area_m2: 212.4 },
    }), cur());
    expect(p.category).toBe("plans");
    expect(p.customer).toEqual({});
    expect(p.job).toMatchObject({ site_address: "Lot 214 Grand Ave, Springfield Lakes, QLD 4300", state: "QLD", zip: "4300", roof_material: "Colorbond Kliplok" });
    expect(p.hints[0]).toContain("212 m²");
  });

  it("doesn't start a claim from a non-insurance document", () => {
    const p = planDocUpdates(read({ doc_type: "contract", insurance: { insurer: "Suncorp", claim_number: null, policy_number: null, assessor_name: null, assessor_phone: null, assessor_email: null, excess: null, date_of_loss: null } }), cur());
    expect(p.createClaim).toBe(false);
    expect(p.claim).toBeNull();
  });

  it("writes a readable note", () => {
    const r = read({ doc_type: "insurance", summary: "Assessor report", insurance: { insurer: "NRMA", claim_number: "88213", policy_number: null, assessor_name: null, assessor_phone: null, assessor_email: null, excess: null, date_of_loss: null } });
    const note = intakeNote("Assessor report.pdf", r, planDocUpdates(r, cur()));
    expect(note).toBe('Read "Assessor report.pdf" · Insurance document\nAssessor report\n\nAdded\n- Insurer NRMA\n- Claim # 88213\n- Marked as an insurance job');
  });

  it("puts differences, things to confirm and key specs in their own sections", () => {
    const r = read({ doc_type: "plans", summary: "Plans for a new single-storey house.", site: { address: "Lot 214 Grand Ave", suburb: "Springfield Lakes", state: "QLD", postcode: "4300" },
      details: ["hip roof, 600 mm eaves", "Anticon 60 sarking"], checks: ["Wind class N3 to be confirmed."] });
    const p = planDocUpdates(r, cur({ job: { site_address: "36 Brownvale St, Logan Central QLD 4114", state: "QLD", zip: "4114", roof_material: null, is_insurance: false } }));
    const note = intakeNote("Plans.pdf", r, p);
    expect(note.split("\n")[0]).toBe('Read "Plans.pdf" · Plans');
    expect(note).toContain("\nCheck\n- Site address: you have 36 Brownvale St, Logan Central QLD 4114, the plans say ");
    expect(note).toContain("Kept yours\n");
    expect(note).toContain("- Wind class N3 to be confirmed");
    expect(note).toContain("\nDetails\n- Hip roof, 600 mm eaves\n- Anticon 60 sarking");
  });
});

describe("roofMeasurementsFromDoc", () => {
  it("uses the plan area and pitch from a roof report, plus the line lengths", () => {
    const r = roofMeasurementsFromDoc({ ...NO_ROOF, plan_area_m2: 180, area_m2: 195, pitch_deg: 22.5, ridge_m: 14.2, hip_m: 22, valley_m: 0, gutter_m: 58, downpipes: 5 }, "Colorbond Trimdek", { wastePct: 12 })!;
    expect(r.measurements).toMatchObject({ wastePct: 12, sections: [{ label: "Main roof", area: 180, pitch: 22.5, system: "metal" }], ridge: 14.2, hip: 22, eave: 58, downpipes: 5 });
    expect(r.measurements).not.toHaveProperty("valley");
    expect(r.label).toBe("roof area 195 m² at 22.5°");
  });
  it("works the plan area out from the roof area, assuming 22.5° when no pitch is given", () => {
    const r = roofMeasurementsFromDoc({ ...NO_ROOF, area_m2: 212 }, "Concrete tile", null)!;
    const sec = (r.measurements.sections as { area: number; pitch: number; system: string }[])[0];
    expect(sec.pitch).toBe(22.5);
    expect(sec.system).toBe("concrete_tile");
    expect(sec.area).toBeCloseTo(212 * Math.cos((22.5 * Math.PI) / 180), 1);
    expect(r.label).toBe("roof area 212 m² at 22.5° (pitch assumed)");
  });
  it("reads back as metric on the quote (not as old imperial data)", () => {
    const r = roofMeasurementsFromDoc({ ...NO_ROOF, area_m2: 212, pitch_deg: 22.5, ridge_m: 14 }, "Colorbond", {})!;
    const s = summarize(normalizeMeasurements(r.measurements));
    expect(s.trueArea).toBeCloseTo(212, 0);
    expect(s.maxPitch).toBe(22.5);
    expect(normalizeMeasurements(r.measurements).ridge).toBe(14);
  });
  it("gives nothing without a believable area", () => {
    expect(roofMeasurementsFromDoc(NO_ROOF, null, null)).toBeNull();
    expect(roofMeasurementsFromDoc({ ...NO_ROOF, area_m2: 2 }, null, null)).toBeNull();
    expect(roofMeasurementsFromDoc(null, null, null)).toBeNull();
  });
});

describe("roofAreaDiff", () => {
  it("flags a document whose roof area is 5% or more off the quote's", () => {
    expect(roofAreaDiff({ ...NO_ROOF, area_m2: 212 }, 195)).toBe("roof area on the quote is 195 m², the document says 212 m²");
  });
  it("stays quiet when they're close, or there's nothing to compare", () => {
    expect(roofAreaDiff({ ...NO_ROOF, area_m2: 200 }, 195)).toBeNull();
    expect(roofAreaDiff(NO_ROOF, 195)).toBeNull();
    expect(roofAreaDiff({ ...NO_ROOF, area_m2: 212 }, 0)).toBeNull();
  });
});
