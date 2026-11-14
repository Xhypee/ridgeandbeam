import { describe, expect, it } from "vitest";
import { complianceAlert, contractorCompliance, expiryState } from "./contacts";

describe("contractor licence & insurance", () => {
  const today = "2026-11-14";
  it("flags expired, due within 30 days, fine, and missing", () => {
    expect(expiryState("2026-11-01", today)).toBe("expired");
    expect(expiryState("2026-11-26", today)).toBe("soon");
    expect(expiryState("2027-06-30", today)).toBe("ok");
    expect(expiryState(null, today)).toBe("missing");
  });
  it("puts the worst item first and words the alert", () => {
    const c = { licence_expiry: "2027-08-01", pl_expiry: "2027-06-30", workcover_expiry: "2026-11-26" };
    expect(contractorCompliance(c, today)[0].key).toBe("workcover");
    expect(complianceAlert(c, today)).toEqual({ text: "WorkCover expires in 12 days", tone: "amber" });
    expect(complianceAlert({ ...c, pl_expiry: "2026-10-01" }, today)).toEqual({ text: "Public liability expired", tone: "red" });
    expect(complianceAlert({ licence_expiry: "2027-08-01", pl_expiry: null, workcover_expiry: null }, today)).toBeNull();
  });
});
