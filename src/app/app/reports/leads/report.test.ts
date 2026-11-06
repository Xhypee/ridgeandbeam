import { describe, expect, it } from "vitest";
import { acceptedTotal, buildRows, median, normSource } from "./report";

describe("lead source report", () => {
  const jobs = [
    { id: "a", lead_source: "Angi", lead_received_at: "2026-10-03T10:00:00Z", first_contacted_at: "2026-10-03T10:04:00Z", stage: "sold" },
    { id: "b", lead_source: "angi", lead_received_at: "2026-10-05T10:00:00Z", first_contacted_at: "2026-10-05T13:00:00Z", stage: "inspection" },
    { id: "c", lead_source: "angi", lead_received_at: "2026-10-09T10:00:00Z", first_contacted_at: null, stage: "lost" },
    { id: "d", lead_source: null, lead_received_at: "2026-11-01T10:00:00Z", first_contacted_at: "2026-11-01T10:30:00Z", stage: "lead" },
  ];
  it("groups by normalized source and month", () => {
    const rows = buildRows(jobs, new Map([["a", 12000]]), [{ source: "angi", month: "2026-10-01", amount: 600 }]);
    const angi = rows.find((r) => r.source === "angi" && r.month === "2026-10")!;
    expect(angi.leads).toBe(3);
    expect(angi.contacted1h).toBe(1);
    expect(angi.contactedPct).toBe(33);
    expect(angi.medianResponseMin).toBe(92); // median of 4 and 180
    expect(angi.booked).toBe(2);
    expect(angi.sold).toBe(1);
    expect(angi.revenue).toBe(12000);
    expect(angi.costPerLead).toBe(200);
    expect(angi.costPerSold).toBe(600);
    expect(rows.find((r) => r.source === "unknown")?.leads).toBe(1);
  });
  it("totals across months", () => {
    expect(buildRows(jobs, new Map(), [], false).find((r) => r.source === "angi")?.month).toBe("all");
  });
  it("helpers", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(normSource(" Google Ads ")).toBe("google_ads");
    expect(acceptedTotal({ discount: 100, tax_rate: 10, selected_option_id: "o2", estimate_items: [
      { quantity: 1, unit_price: 1000, option_id: null }, { quantity: 1, unit_price: 5000, option_id: "o1" }, { quantity: 1, unit_price: 7000, option_id: "o2" },
    ] })).toBe(8690);
  });
});
