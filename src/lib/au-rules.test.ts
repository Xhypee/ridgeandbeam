import { describe, expect, it } from "vitest";
import { aclTerminationEnd, auJobTypeFrom, canTakePayment, coolingOffEnd, roofSystemFrom, rulesFor, type RuleInput } from "./au-rules";

const base: RuleInput = { contractValueIncGst: 30000, contractDate: "2026-11-06", roofSystem: "metal", jobType: "re_roof", existingHouse: true };
const r = (state: string, over: Partial<RuleInput> = {}) => rulesFor(state, { ...base, ...over });

describe("every rule carries sources, the verified date and the disclaimer", () => {
  for (const s of ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) {
    it(s, () => {
      const x = r(s);
      expect(x.verifiedOn).toBe("2026-11-06");
      expect(x.disclaimer).toBe("This is general information, not legal advice.");
      expect(x.sources.length).toBeGreaterThan(3);
      for (const c of x.sources) expect(c.url).toMatch(/^https:\/\//);
      for (const u of x.unverified) expect(u.regulator.url).toMatch(/^https:\/\//);
      expect(x.asbestos.neverHighPressureClean).toBe(true);
    });
  }
  it("rejects unknown states", () => expect(() => rulesFor("CA", base)).toThrow());
});

describe("NSW", () => {
  it("licence over $5,000 incl GST; small vs large contract tiers", () => {
    expect(r("NSW", { contractValueIncGst: 5000 }).licence.required).toBe(false);
    expect(r("NSW", { contractValueIncGst: 5001 }).licence.required).toBe(true);
    expect(r("NSW", { contractValueIncGst: 4000 }).writtenContract.tier).toBeNull();
    expect(r("NSW", { contractValueIncGst: 12000 }).writtenContract.tier).toMatch(/Small/);
    expect(r("NSW", { contractValueIncGst: 20001 }).writtenContract.tier).toMatch(/Large/);
  });
  it("10% deposit, HBC before deposit over $20k, 5 business day cooling-off with the sample clause", () => {
    const x = r("NSW");
    expect(x.deposit).toMatchObject({ maxPct: 10, maxAud: 3000, isLegalLimit: true });
    expect(x.insurance).toMatchObject({ required: true, mustBeBefore: "deposit" });
    expect(x.coolingOff).toMatchObject({ applies: true, length: 5, noticeKind: "government_sample" });
    expect(x.coolingOff.businessDayRules.excludeDec27to31).toBe(true);
    expect(x.documents.map((d) => d.name).join(" ")).toMatch(/Security of Payment Guide/);
    expect(r("NSW", { contractValueIncGst: 20000 }).insurance.required).toBe(false);
  });
  it("urgent-work exception switches cooling-off off", () => {
    const x = r("NSW", { urgentWork: true });
    expect(x.coolingOff.applies).toBe(false);
    expect(x.coolingOff.note).toMatch(/Urgent-work exception/);
  });
  it("Consumer Building Guide over $5,000; SOP covers owner-occupiers from $5,000", () => {
    expect(r("NSW", { contractValueIncGst: 6000 }).documents.some((d) => /Consumer Building Guide/.test(d.name))).toBe(true);
    expect(r("NSW", { contractValueIncGst: 4000 }).documents.some((d) => /Consumer Building Guide/.test(d.name))).toBe(false);
    expect(r("NSW").securityOfPayment).toMatchObject({ appliesToOwnerOccupier: true, scheduleDays: 10 });
  });
  it("cooling-off end date skips 27–31 Dec", () => {
    expect(coolingOffEnd(r("NSW"), "2026-12-23")).toBe("2027-01-07");
  });
});

describe("VIC", () => {
  it("metal roofing / gutters = plumbing-only, outside the DBC Act", () => {
    const x = r("VIC", { roofSystem: "metal" });
    expect(x.scope.covered).toBe(false);
    expect(x.coolingOff.applies).toBe(false);
    expect(x.deposit.isLegalLimit).toBe(false);
    expect(x.insurance.required).toBe(false);
    expect(x.licence.classes[0]).toMatch(/Roofing \(stormwater\)/);
    expect(x.documents.some((d) => /compliance certificate/.test(d.name))).toBe(true);
    expect(r("VIC", { roofSystem: "concrete_tile", jobType: "gutters" }).scope.covered).toBe(false);
  });
  it("tile roofing = domestic building work (roof tiling registration)", () => {
    const x = r("VIC", { roofSystem: "terracotta_tile" });
    expect(x.scope.covered).toBe(true);
    expect(x.licence.classes[0]).toMatch(/limited to roof tiling/);
    expect(x.coolingOff.applies).toBe(true);
    expect(x.coolingOff.noticeKind).toBe("approved_form");
    expect(x.insurance).toMatchObject({ scheme: "First Resort Home Warranty Scheme", required: true, mustBeBefore: "work" });
  });
  it("mixed metal contract brings the DBC Act back", () => {
    expect(r("VIC", { mixedWork: true }).scope.covered).toBe(true);
  });
  it("before 31 Mar 2027: $10k major, 5% deposit at $20k+, legal-advice exception", () => {
    const x = r("VIC", { roofSystem: "concrete_tile", contractValueIncGst: 15000, contractDate: "2027-03-30" });
    expect(x.writtenContract.tier).toMatch(/Major/);
    expect(x.deposit.maxPct).toBe(10);
    expect(r("VIC", { roofSystem: "concrete_tile", contractDate: "2027-03-30" }).deposit.maxPct).toBe(5);
    expect(x.coolingOff.exceptions.join(" ")).toMatch(/legal practitioner/);
  });
  it("from 31 Mar 2027: $20k major, flat 10%, all contracts written, no legal-advice exception", () => {
    const small = r("VIC", { roofSystem: "concrete_tile", contractValueIncGst: 15000, contractDate: "2027-03-31" });
    expect(small.writtenContract.required).toBe(true);
    expect(small.writtenContract.tier).toMatch(/s 7A/);
    expect(small.coolingOff.applies).toBe(false);
    const big = r("VIC", { roofSystem: "concrete_tile", contractValueIncGst: 30000, contractDate: "2027-03-31" });
    expect(big.deposit).toMatchObject({ maxPct: 10, maxAud: 3000 });
    expect(big.coolingOff.applies).toBe(true);
    expect(big.coolingOff.exceptions.join(" ")).not.toMatch(/legal practitioner/);
    expect(big.coolingOff.noticeText).toBeNull();
    expect(big.unverified.some((u) => /31 Mar 2027/.test(u.topic))).toBe(true);
    expect(big.regime).toMatch(/on or after 31 Mar 2027/);
  });
  it("home warranty: DBI over $16k before 1 Jul 2026", () => {
    const x = r("VIC", { roofSystem: "concrete_tile", contractValueIncGst: 18000, contractDate: "2026-06-30" });
    expect(x.insurance).toMatchObject({ scheme: "Domestic Building Insurance", required: true });
    expect(r("VIC", { roofSystem: "concrete_tile", contractValueIncGst: 18000 }).insurance.required).toBe(false);
  });
  it("asbestos: 10 m² AND 1 hour per 7 days; 24 h notice", () => {
    const a = r("VIC").asbestos;
    expect(a.unlicensedTimeLimit).toMatch(/1 hour/);
    expect(a.notifyBefore).toMatch(/24 hours/);
  });
});

describe("QLD", () => {
  it("licence and level 1/2 contracts at $3,300 / $20,000", () => {
    expect(r("QLD", { contractValueIncGst: 3300 }).licence.required).toBe(false);
    expect(r("QLD", { contractValueIncGst: 3301 }).licence.required).toBe(true);
    expect(r("QLD", { contractValueIncGst: 10000 }).writtenContract.tier).toMatch(/Level 1/);
    expect(r("QLD", { contractValueIncGst: 20000 }).writtenContract.tier).toMatch(/Level 2/);
  });
  it("deposit 10% / 5%; home warranty over $3,300 before work or 10 business days", () => {
    expect(r("QLD", { contractValueIncGst: 10000 }).deposit.maxPct).toBe(10);
    expect(r("QLD").deposit.maxPct).toBe(5);
    const g = r("QLD", { jobType: "gutters", contractValueIncGst: 4000 });
    expect(g.insurance).toMatchObject({ required: true, mustBeBefore: "work" });
  });
  it("roof painting needs a painting licence", () => {
    expect(r("QLD", { jobType: "restoration", roofSystem: "concrete_tile" }).licence.classes.join(" ")).toMatch(/Painting and decorating/);
  });
  it("Consumer Building Guide v2 10/26 for level 2 contracts from Oct 2026", () => {
    expect(r("QLD").documents[0].name).toMatch(/FSG0116_v2_10\/26/);
    expect(r("QLD", { contractDate: "2026-09-30" }).documents[0].name).not.toMatch(/v2_10\/26/);
  });
  it("fall controls: 3 m housing construction, 2 m re-roof; SOP excludes resident owners", () => {
    expect(r("QLD", { jobType: "new_build" }).whs.fallControlHeightM).toBe(3);
    expect(r("QLD").whs.fallControlHeightM).toBe(2);
    expect(r("QLD").securityOfPayment.appliesToOwnerOccupier).toBe(false);
  });
});

describe("WA", () => {
  it("like-for-like re-roof without a permit → no HII and no registration", () => {
    const x = r("WA", { contractValueIncGst: 45000, buildingApprovalRequired: false });
    expect(x.insurance.required).toBe(false);
    expect(x.licence.required).toBe(false);
    expect(x.deposit).toMatchObject({ maxPct: 6.5, isLegalLimit: true });
  });
  it("permit-required re-roof over $20k → registration + HII before any payment", () => {
    const x = r("WA", { contractValueIncGst: 45000, buildingApprovalRequired: true });
    expect(x.insurance).toMatchObject({ required: true, mustBeBefore: "deposit" });
    expect(x.licence.required).toBe(true);
  });
  it("unknown permit → depends; no statutory cooling-off; HBC Act only $7.5k–$500k", () => {
    expect(r("WA").insurance.required).toBe("depends");
    expect(r("WA").coolingOff.applies).toBe(false);
    expect(r("WA", { contractValueIncGst: 7500 }).writtenContract.required).toBe(false);
    expect(r("WA", { contractValueIncGst: 7501 }).writtenContract.required).toBe(true);
  });
});

describe("SA", () => {
  it("$20k threshold for contracts from 10 Nov 2025; $12k before", () => {
    expect(r("SA", { contractValueIncGst: 15000 }).coolingOff.applies).toBe(false);
    expect(r("SA", { contractValueIncGst: 20000 }).coolingOff.applies).toBe(true);
    const old = r("SA", { contractValueIncGst: 15000, contractDate: "2025-11-09" });
    expect(old.coolingOff.applies).toBe(true);
    expect(old.deposit).toMatchObject({ maxAud: 1000, isLegalLimit: true });
  });
  it("5% deposit, Form 1 notice, licence at any value, 5-year warranty", () => {
    const x = r("SA");
    expect(x.deposit.maxPct).toBe(5);
    expect(x.coolingOff.noticeKind).toBe("prescribed_form");
    expect(x.licence.required).toBe(true);
    expect(r("SA", { contractValueIncGst: 500 }).licence.required).toBe(true);
    expect(x.statutoryWarranty[0].years).toBe(5);
  });
  it("BII only when approval is needed; SWMS 3 m → 2 m on 1 Jul 2026", () => {
    expect(r("SA", { buildingApprovalRequired: false }).insurance.required).toBe(false);
    expect(r("SA", { buildingApprovalRequired: true }).insurance).toMatchObject({ required: true, mustBeBefore: "work" });
    expect(r("SA", { contractDate: "2026-06-30" }).whs.swmsHeightM).toBe(3);
    expect(r("SA").whs.swmsHeightM).toBe(2);
  });
});

describe("TAS", () => {
  it("Act applies from $20,000; deposit 10% under $50k, 5% from $50k; no home warranty", () => {
    expect(r("TAS", { contractValueIncGst: 19999 }).writtenContract.required).toBe(false);
    expect(r("TAS").deposit.maxPct).toBe(10);
    expect(r("TAS", { contractValueIncGst: 50000 }).deposit.maxPct).toBe(5);
    expect(r("TAS").insurance.required).toBe(false);
    expect(r("TAS").coolingOff).toMatchObject({ applies: true, length: 5, noticeText: null });
  });
  it("regulations 2026 from 2 Nov 2026; earlier contracts flag the set amount", () => {
    expect(r("TAS").regime).toMatch(/Regulations 2026/);
    expect(r("TAS", { contractDate: "2026-11-01" }).unverified.some((u) => /set amount/.test(u.topic))).toBe(true);
  });
  it("SOP covers owner-occupiers", () => expect(r("TAS").securityOfPayment.appliesToOwnerOccupier).toBe(true));
});

describe("ACT", () => {
  it("no deposit cap or cooling-off; ads/quotes show licence name, number and ACN", () => {
    const x = r("ACT");
    expect(x.deposit).toMatchObject({ maxPct: null, isLegalLimit: false });
    expect(x.coolingOff.applies).toBe(false);
    expect(x.licence.showOn).toEqual(expect.arrayContaining(["ads", "quote", "contract"]));
    expect(x.licence.note).toMatch(/ACN/);
  });
  it("6-year structural warranty for roofs from $12,000; insurance only with approval", () => {
    expect(r("ACT").statutoryWarranty[0].years).toBe(6);
    expect(r("ACT", { contractValueIncGst: 11999 }).statutoryWarranty).toHaveLength(0);
    expect(r("ACT", { buildingApprovalRequired: true }).insurance.required).toBe(true);
    expect(r("ACT", { buildingApprovalRequired: false }).insurance.required).toBe(false);
  });
  it("any asbestos removal needs a licence", () => expect(r("ACT").asbestos.unlicensedMaxM2).toBe(0));
});

describe("NT", () => {
  it("re-roofing an existing house is outside the Building Act regime", () => {
    const x = r("NT", { contractValueIncGst: 60000 });
    expect(x.scope.covered).toBe(false);
    expect(x.licence.required).toBe(false);
    expect(x.writtenContract.required).toBe(false);
    expect(x.insurance.required).toBe(false);
    expect(x.deposit.isLegalLimit).toBe(false);
  });
  it("new house head contract: $25k from 30 Mar 2026, $12k before; 5% deposit; cover before payment", () => {
    const x = r("NT", { jobType: "new_build", existingHouse: false, contractValueIncGst: 20000 });
    expect(x.insurance.required).toBe(false);
    const old = r("NT", { jobType: "new_build", existingHouse: false, contractValueIncGst: 20000, contractDate: "2026-03-29" });
    expect(old.insurance).toMatchObject({ required: true, mustBeBefore: "deposit" });
    expect(old.deposit.maxPct).toBe(5);
    expect(r("NT", { jobType: "new_build", existingHouse: false }).licence.threshold).toBe(25000);
  });
  it("SOP has no owner-occupier exclusion; residential construction SWMS 3 m from 17 Jul 2026", () => {
    expect(r("NT").securityOfPayment).toMatchObject({ appliesToOwnerOccupier: true, unit: "working_days" });
    expect(r("NT", { jobType: "new_build", existingHouse: false }).whs.swmsHeightM).toBe(3);
    expect(r("NT", { jobType: "new_build", existingHouse: false, contractDate: "2026-07-16" }).whs.swmsHeightM).toBe(2);
    expect(r("NT").whs.swmsHeightM).toBe(2);
  });
});

describe("national ACL door-knock rules", () => {
  it("applies to door-knock sales of $100+ with the prescribed notice", () => {
    const x = r("QLD", { doorKnockSale: true });
    expect(x.acl).toMatchObject({ applies: true, terminationBusinessDays: 10, noSupplyOrPaymentDuringPeriod: true });
    expect(x.acl.frontPageNotice).toMatch(/^You have a right to cancel this agreement within 10 business days/);
    expect(r("QLD", { doorKnockSale: true, contractValueIncGst: 99 }).acl.applies).toBe(false);
    expect(r("QLD").acl.applies).toBe(false);
  });
  it("disaster emergency-repair exemption lifts the payment ban but keeps the conditions", () => {
    const x = r("NSW", { doorKnockSale: true, disasterEmergencyRepair: true });
    expect(x.acl.noSupplyOrPaymentDuringPeriod).toBe(false);
    expect(x.acl.notes[0]).toMatch(/state of emergency/);
  });
  it("termination period: 10 business days from the day after signing", () => {
    expect(aclTerminationEnd("2026-11-06")).toBe("2026-11-20");
    // signed 9:30 pm Sydney on Fri 6 Nov = 10:30 UTC
    expect(aclTerminationEnd("2026-11-06T10:30:00Z", "NSW")).toBe("2026-11-20");
  });
  it("canTakePayment blocks door-knock jobs until day 11 and jobs needing insurance first", () => {
    const job = { state: "NSW", lead_source: "door_knock", signed_at: "2026-11-06", contract_value_inc_gst: 15000 };
    expect(canTakePayment(job, "2026-11-20")).toMatchObject({ allowed: false, until: "2026-11-20" });
    expect(canTakePayment(job, "2026-11-21")).toMatchObject({ allowed: true, firstPaymentDay: "2026-11-21" });
    expect(canTakePayment({ ...job, lead_source: "website" }, "2026-11-07").allowed).toBe(true);
    expect(canTakePayment({ ...job, disaster_emergency_repair: true }, "2026-11-07").allowed).toBe(true);
    expect(canTakePayment({ ...job, signed_at: null }, "2026-11-07").allowed).toBe(false);
    expect(canTakePayment({ state: "NSW", insurance_required_before_payment: true, insurance_certificate_on_file: false }).allowed).toBe(false);
  });
  it("card surcharge note switches on 1 Oct 2026", () => {
    expect(r("SA").national.notes.join(" ")).toMatch(/No card surcharges/);
    expect(r("SA", { contractDate: "2026-09-01" }).national.notes.join(" ")).toMatch(/From 1 Oct 2026/);
  });
});

describe("mapping helpers", () => {
  it("maps stored roof materials and job types", () => {
    expect(roofSystemFrom("Terracotta tile")).toBe("terracotta_tile");
    expect(roofSystemFrom("Concrete tile")).toBe("concrete_tile");
    expect(roofSystemFrom("COLORBOND Trimdek")).toBe("metal");
    expect(roofSystemFrom("torch-on membrane")).toBe("membrane");
    expect(auJobTypeFrom("replacement")).toBe("re_roof");
    expect(auJobTypeFrom("new_construction")).toBe("new_build");
  });
});
