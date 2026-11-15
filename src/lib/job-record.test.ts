import { describe, expect, it } from "vitest";
import { focusKey, jobRecord, type RecordInput } from "./job-record";

const NOW = new Date("2026-11-15T01:00:00Z");
const base = (over: Partial<RecordInput> = {}, job: Partial<RecordInput["job"]> = {}): RecordInput => ({
  job: {
    id: "j1", title: "Re-roof", stage: "lead", job_type: "replacement", site_address: "5 Station Rd", state: "QLD", is_insurance: false,
    lead_source: "website", lead_received_at: "2026-10-20T00:12:00Z", first_contacted_at: null, created_at: "2026-10-20T00:12:00Z",
    assigned_to: null, inspection_at: null, lost_reason: null, tz: "Australia/Brisbane", referredBy: null,
    scheduled_start: null, scheduled_end: null, completed_at: null, materials_status: "none", dumpster_status: "none",
    gate_code: null, site_hazards: null, delivery_type: null, public_token: "t", pay_methods: [], roof_material: null, crew: null, ...job,
  },
  quote: null, roof: null, invoices: [], files: { photos: 0, plans: 0, documents: 0, planName: null, thumbs: [] }, messages: [],
  compliance: null, sold: null, build: null, quoting: null, wrap: null, team: [], column: "new", ...over,
});
const quote = (status: string, over = {}) => ({ id: "q1", number: 1005, status, public_token: "p", sent_at: "2026-10-22T05:00:00Z", accepted_at: status === "accepted" ? "2026-10-23T06:12:00Z" : null, accepted_name: status === "accepted" ? "Ahmed Khan" : null, roof_profile: null, roof_colour: null, measurement_source: "plans", total: 29899, gst: 2718.09, lines: [], ...over });
const roof = { summary: { trueArea: 176.5, maxPitch: 25 } as never, m: {} as never };
const by = (rows: ReturnType<typeof jobRecord>) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe("job record", () => {
  it("a brand new lead waits on the roof being measured", () => {
    const r = by(jobRecord(base(), NOW));
    expect(r.lead.state).toBe("done");
    expect(r.lead.value).toBe("Website · 20 Oct");
    expect(r.plans.state).toBe("now");
    expect(r.quote.state).toBe("later");
  });

  it("an inspection booked ahead becomes the line it waits on", () => {
    const r = by(jobRecord(base({}, { inspection_at: "2026-11-20T00:00:00Z" }), NOW));
    expect(r.inspection.state).toBe("now");
    expect(r.inspection.value).toBe("Booked 20 Nov");
  });

  it("plans in: the quote is next, and the inspection isn't needed once quoted", () => {
    const lead = by(jobRecord(base({ roof, files: { photos: 0, plans: 1, documents: 0, planName: "plans.pdf", thumbs: [] } }), NOW));
    expect(lead.plans.value).toBe("1 plan · 176.5 m² · 25°");
    expect(lead.quote.state).toBe("now");
    const quoted = by(jobRecord(base({ roof, quote: quote("sent"), quoting: { intake: null, sent: { at: null, validUntil: null, daysLeft: null, views: 2, lastViewed: null, firstViewed: null, remindedAt: null, title: null }, draft: null, inspection: { photos: 0, at: null } } }, { stage: "estimate_sent" }), NOW));
    expect(quoted.inspection.value).toBe("Not needed · measured");
    expect(quoted.quote.value).toBe("$29,899 · sent 22 Oct · viewed 2×");
    expect(quoted.contract.state).toBe("now");
  });

  it("signed: legal steps come first while cooling-off runs or the warranty isn't paid", () => {
    const sold = { signedAt: "2026-10-23", deposit: { amount: 8969.57, on: "2026-10-23", method: "payid" }, coolingOff: { applies: true, ends: "2026-10-30", over: true }, insurance: { required: true, done: false, scheme: "QBCC" }, orders: { suppliers: ["Metroll"], items: 7, cost: 8344, sent: 1, confirmed: 1, delivered: 0, total: 1 }, crew: { name: "Crew A", start: "2026-11-09", end: "2026-11-12", locked: true }, rule: null };
    const r = by(jobRecord(base({ roof, quote: quote("accepted"), sold, column: "sold" }, { stage: "sold" }), NOW));
    expect(r.contract.value).toBe("Signed by Ahmed · 23 Oct");
    expect(r.legal.state).toBe("now");
    expect(r.legal.value).toBe("Cooling-off ended · home warranty to pay");
    expect(r.payments.value).toBe("Deposit $8,969.57 paid");
    expect(r.materials.value).toBe("Metroll · 7 items · confirmed");
    expect(r.crew.value).toBe("Crew A · 9 Nov – 12 Nov");
  });

  it("closed and lost jobs wait on nothing", () => {
    expect(focusKey(base({ quote: quote("accepted") }, { stage: "paid" }), NOW)).toBeNull();
    expect(focusKey(base({}, { stage: "lost" }), NOW)).toBeNull();
    const r = jobRecord(base({ quote: quote("accepted") }, { stage: "paid" }), NOW);
    expect(r.some((x) => x.state === "now")).toBe(false);
  });
});
