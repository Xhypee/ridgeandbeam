import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysBetween, calendarDate, easterSunday, isBusinessDay, nationalPublicHolidays } from "./au-business-days";

describe("national public holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2025)).toBe("2025-04-20");
  });

  it("lists the national days for 2026 with weekend substitutes", () => {
    const h = nationalPublicHolidays(2026).map((x) => x.date);
    expect(h).toEqual(["2026-01-01", "2026-01-26", "2026-04-03", "2026-04-06", "2026-04-25", "2026-12-25", "2026-12-26", "2026-12-28"]);
    // Boxing Day 2026 is a Saturday → Monday 28 Dec additional day
  });

  it("handles Christmas on a Saturday (2027): Mon 27 and Tue 28 Dec", () => {
    const h = nationalPublicHolidays(2027).map((x) => x.date);
    expect(h).toContain("2027-12-27");
    expect(h).toContain("2027-12-28");
  });

  it("handles Christmas on a Sunday (2022): Mon 26 and Tue 27 Dec", () => {
    const h = nationalPublicHolidays(2022).map((x) => x.date);
    expect(h).toContain("2022-12-26");
    expect(h).toContain("2022-12-27");
  });

  it("moves Australia Day off a Sunday (2025 → Mon 27 Jan)", () => {
    expect(nationalPublicHolidays(2025).map((x) => x.date)).toContain("2025-01-27");
  });
});

describe("business days", () => {
  it("skips weekends", () => {
    expect(isBusinessDay("2026-11-07")).toBe(false); // Saturday
    expect(isBusinessDay("2026-11-06")).toBe(true); // Friday
    // Signed Friday 6 Nov 2026 → 5 clear business days ends Friday 13 Nov
    expect(addBusinessDays("2026-11-06", 5)).toBe("2026-11-13");
  });

  it("skips national public holidays (Easter 2027)", () => {
    // Wed 24 Mar 2027 + 5: Thu 25, (Good Friday 26, Easter Monday 29 skipped), Tue 30, Wed 31, Thu 1, Fri 2 Apr
    expect(isBusinessDay("2027-03-26")).toBe(false); // Good Friday
    expect(isBusinessDay("2027-03-29")).toBe(false); // Easter Monday
    expect(addBusinessDays("2027-03-24", 5)).toBe("2027-04-02");
  });

  it("NSW excludes 27–31 December on top of public holidays", () => {
    // Signed Wed 23 Dec 2026: 24 Dec (Thu) counts; 25 Xmas, 28 Boxing sub, 29–31 excluded for NSW; 1 Jan holiday
    expect(addBusinessDays("2026-12-23", 5, { excludeDec27to31: true })).toBe("2027-01-07");
    // Without the NSW rule: 24, 29, 30, 31 Dec, 4 Jan
    expect(addBusinessDays("2026-12-23", 5)).toBe("2027-01-04");
  });

  it("ACL 10 business days from the day after signing", () => {
    // Signed Fri 6 Nov 2026 → day 1 is Mon 9 Nov, day 10 is Fri 20 Nov
    expect(addBusinessDays("2026-11-06", 10)).toBe("2026-11-20");
  });

  it("accepts extra (state) holidays", () => {
    // Melbourne Cup Day 3 Nov 2026 (VIC metro only) — state holidays are opt-in
    expect(addBusinessDays("2026-11-02", 1)).toBe("2026-11-03");
    expect(addBusinessDays("2026-11-02", 1, { extraHolidays: ["2026-11-03"] })).toBe("2026-11-04");
  });

  it("counts business days between dates", () => {
    expect(businessDaysBetween("2026-11-06", "2026-11-13")).toBe(5);
    expect(businessDaysBetween("2026-11-13", "2026-11-06")).toBe(0);
  });

  it("converts timestamps to the state's calendar date", () => {
    // 2026-11-06T20:00Z is already 7 Nov in Sydney but still 6 Nov in Perth
    expect(calendarDate("2026-11-06T20:00:00Z", "Australia/Sydney")).toBe("2026-11-07");
    expect(calendarDate("2026-11-06T20:00:00Z", "Australia/Perth")).toBe("2026-11-07");
    expect(calendarDate("2026-11-06T14:00:00Z", "Australia/Perth")).toBe("2026-11-06");
    expect(calendarDate("2026-11-06")).toBe("2026-11-06");
  });
});
