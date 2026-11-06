import { describe, expect, it } from "vitest";
import {
  cancelBy, deductibleWaiverError, looksLikeDeductibleWaiver, maxDeposit, requiredNotices, resolveState, rulesFor, scheduledDeposit,
} from "./state-rules";

describe("state rules", () => {
  it("resolves job -> customer -> company state", () => {
    expect(resolveState("tx", "CO", "OH")).toEqual({ state: "TX", source: "job" });
    expect(resolveState(null, " co ", "OH")).toEqual({ state: "CO", source: "customer" });
    expect(resolveState("", null, "Ohio")).toEqual({ state: "OH", source: "company" });
    expect(resolveState(null, null, null).state).toBeNull();
    expect(rulesFor("WY").state).toBe("DEFAULT");
  });

  it("caps deposits per state", () => {
    expect(maxDeposit(rulesFor("CA"), 25000, false)).toBe(1000);
    expect(maxDeposit(rulesFor("CA"), 5000, false)).toBe(500);
    expect(maxDeposit(rulesFor("NY"), 25000, false)).toBe(0);
    expect(maxDeposit(rulesFor("TN"), 25000, true)).toBe(0);
    expect(maxDeposit(rulesFor("TN"), 25000, false)).toBeNull();
    expect(maxDeposit(rulesFor("TX"), 25000, true)).toBeNull();
    expect(scheduledDeposit([{ pct: 30, trigger: "signed" }, { pct: 70, trigger: "completed" }], 20000)).toEqual({ pct: 30, amount: 6000 });
  });

  it("computes cancel-by dates in business days and insurance windows", () => {
    const fri = new Date(2026, 10, 6, 15, 0); // Fri Nov 6 2026
    expect(cancelBy(rulesFor("TX"), fri, false).date.getDate()).toBe(11); // Mon, Tue, Wed
    const fl = cancelBy(rulesFor("FL"), fri, true);
    expect(fl.date.getDate()).toBe(16); // 10 calendar days
    const co = cancelBy(rulesFor("CO"), fri, true);
    expect(co.insuranceNote).toContain("72 hours");
  });

  it("attaches the Texas deductible notice only to insurance jobs of $1,000+", () => {
    const tx = rulesFor("TX");
    expect(requiredNotices(tx, { isInsurance: true, total: 15000 }).map((n) => n.id)).toContain("tx_27_02");
    expect(requiredNotices(tx, { isInsurance: false, total: 15000 }).map((n) => n.id)).not.toContain("tx_27_02");
    expect(requiredNotices(tx, { isInsurance: true, total: 500 }).map((n) => n.id)).not.toContain("tx_27_02");
    expect(requiredNotices(rulesFor("CO"), { isInsurance: true, total: 1 }).map((n) => n.id)).toContain("co_6_22_105");
  });

  it("flags deductible discounts in ban states only", () => {
    expect(looksLikeDeductibleWaiver({ description: "Deductible assistance", unit_price: 0 })).toBe(true);
    expect(looksLikeDeductibleWaiver({ description: "Insurance credit", unit_price: -500 })).toBe(true);
    expect(looksLikeDeductibleWaiver({ description: "Ridge vent", unit_price: 22 })).toBe(false);
    const items = [{ description: "We waive your deductible", unit_price: -1000 }];
    expect(deductibleWaiverError(rulesFor("TX"), items)).toMatch(/prohibits/);
    expect(deductibleWaiverError(rulesFor("CA"), items)).toBeNull();
    for (const s of ["CO", "FL", "KS", "MN"]) expect(rulesFor(s).deductibleWaiverBan).toBe(true);
  });
});
