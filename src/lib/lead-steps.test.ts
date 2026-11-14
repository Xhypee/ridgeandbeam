import { describe, expect, it } from "vitest";
import { clashAt, dateIn, INSPECTION_TIMES, inspectionLabel, inspectionSms, localToUtc, LOST_REASON_LABEL, monthGrid } from "./lead-steps";

describe("localToUtc", () => {
  it("Brisbane has no daylight saving: 9 am is 23:00 UTC the day before", () => {
    expect(localToUtc("2026-11-18", "09:00", "Australia/Brisbane")?.toISOString()).toBe("2026-11-17T23:00:00.000Z");
  });
  it("Sydney in summer is UTC+11", () => {
    expect(localToUtc("2026-12-01", "09:00", "Australia/Sydney")?.toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });
  it("Sydney in winter is UTC+10", () => {
    expect(localToUtc("2026-06-15", "13:30", "Australia/Sydney")?.toISOString()).toBe("2026-06-15T03:30:00.000Z");
  });
  it("Perth is UTC+8", () => {
    expect(localToUtc("2026-11-18", "07:00", "Australia/Perth")?.toISOString()).toBe("2026-11-17T23:00:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(localToUtc("18/11/2026", "09:00", "Australia/Sydney")).toBeNull();
    expect(localToUtc("2026-11-18", "9am", "Australia/Sydney")).toBeNull();
  });
});

describe("inspectionLabel / dateIn", () => {
  it("shows the wall-clock time in the job's timezone", () => {
    expect(inspectionLabel("2026-11-17T23:00:00.000Z", "Australia/Brisbane")).toBe("Wed 18 Nov, 9:00 am");
  });
  it("round-trips with localToUtc", () => {
    const at = localToUtc("2026-12-03", "14:30", "Australia/Melbourne")!;
    expect(inspectionLabel(at.toISOString(), "Australia/Melbourne")).toBe("Thu 3 Dec, 2:30 pm");
  });
  it("dateIn gives the local calendar date", () => {
    // 20:00 UTC on 17 Nov is already 18 Nov in Brisbane.
    expect(dateIn("Australia/Brisbane", 0, new Date("2026-11-17T20:00:00Z"))).toBe("2026-11-18");
    expect(dateIn("Australia/Brisbane", 1, new Date("2026-11-17T20:00:00Z"))).toBe("2026-11-19");
  });
});

describe("slots, reasons, text", () => {
  it("offers 7 am to 5 pm in half hours", () => {
    expect(INSPECTION_TIMES[0]).toEqual({ value: "07:00", label: "7:00 am" });
    expect(INSPECTION_TIMES.at(-1)).toEqual({ value: "17:00", label: "5:00 pm" });
    expect(INSPECTION_TIMES.find((t) => t.value === "12:30")?.label).toBe("12:30 pm");
  });
  it("labels lost reasons", () => {
    expect(LOST_REASON_LABEL.competitor).toBe("Went with someone else");
  });
  it("writes the booking text", () => {
    expect(inspectionSms({ first: "Priya", when: "Wed 18 Nov, 9:00 am", business: "Bbang Roofing", who: "Sam" }))
      .toBe("Hi Priya, it's Sam from Bbang Roofing. You're booked in for a roof inspection on Wed 18 Nov, 9:00 am. Reply to this text if you need to change the time.");
  });
});


describe("monthGrid", () => {
  it("starts weeks on Monday and pads the edges", () => {
    // November 2026 starts on a Sunday.
    const g = monthGrid(2026, 11);
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(g[1][0]).toBe("2026-11-02");
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("handles February in a leap year", () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("clashAt", () => {
  const items = [
    { date: "2026-11-16", time: "9:00 am", minutes: 540, kind: "inspection" as const, label: "Tom Nguyen" },
    { date: "2026-11-16", time: null, minutes: null, kind: "build" as const, label: "Smith St build" },
  ];
  it("flags an inspection within the hour", () => {
    expect(clashAt(items, "2026-11-16", "09:30")?.label).toBe("Tom Nguyen");
    expect(clashAt(items, "2026-11-16", "08:30")?.label).toBe("Tom Nguyen");
  });
  it("ignores other times, days and all-day builds", () => {
    expect(clashAt(items, "2026-11-16", "10:00")).toBeNull();
    expect(clashAt(items, "2026-11-17", "09:00")).toBeNull();
  });
});
