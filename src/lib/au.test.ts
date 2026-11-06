import { describe, expect, it } from "vitest";
import { auPhoneE164, gstOfInclusive, isValidAbn, stateFromPostcode } from "./au";

describe("au helpers", () => {
  it("maps postcodes to states", () => {
    expect(stateFromPostcode("2000")).toBe("NSW");
    expect(stateFromPostcode("2600")).toBe("ACT");
    expect(stateFromPostcode("3000")).toBe("VIC");
    expect(stateFromPostcode("4000")).toBe("QLD");
    expect(stateFromPostcode("5000")).toBe("SA");
    expect(stateFromPostcode("6000")).toBe("WA");
    expect(stateFromPostcode("7000")).toBe("TAS");
    expect(stateFromPostcode("0800")).toBe("NT");
    expect(stateFromPostcode("abc")).toBeNull();
  });
  it("validates ABNs with the ATO checksum", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true); // ATO's published example
    expect(isValidAbn("51 824 753 557")).toBe(false);
  });
  it("extracts GST from inclusive prices", () => {
    expect(gstOfInclusive(110)).toBe(10);
    expect(gstOfInclusive(1100)).toBe(100);
  });
  it("normalises AU phone numbers", () => {
    expect(auPhoneE164("0412 345 678")).toBe("+61412345678");
    expect(auPhoneE164("(02) 9876 5432")).toBe("+61298765432");
    expect(auPhoneE164("555-0142")).toBeNull();
  });
});

import { isoDate, orgToday } from "./format";
describe("Australian dates", () => {
  it("uses Australian time, not the UTC server clock", () => {
    const utcEvening = new Date("2026-11-09T20:30:00Z"); // 7:30am Tue 10 Nov in Sydney (AEDT)
    expect(isoDate(utcEvening)).toBe("2026-11-10");
    expect(orgToday("QLD", utcEvening)).toBe("2026-11-10"); // 6:30am Brisbane
    expect(orgToday("WA", new Date("2026-11-09T15:30:00Z"))).toBe("2026-11-09"); // 11:30pm Perth
  });
});
