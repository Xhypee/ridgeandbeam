import { describe, expect, it } from "vitest";
import { exifTakenAt, parseExifDate } from "./field-exif";
import { claimExplainer, deriveMilestones, headlineMilestone, type PublicJob } from "./field-milestones";
import { statusSms, warrantyDaysLeft } from "./field";

function jpegWithExif(date: string, little = true): ArrayBuffer {
  // SOI, APP1(Exif) with IFD0 -> ExifIFD -> DateTimeOriginal (ASCII, 20 bytes)
  const tiff: number[] = [];
  const w16 = (n: number) => (little ? tiff.push(n & 255, n >> 8) : tiff.push(n >> 8, n & 255));
  const w32 = (n: number) => (little ? tiff.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : tiff.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255));
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  w16(42); w32(8);
  // IFD0 at 8: 1 entry (ExifIFD pointer)
  w16(1); w16(0x8769); w16(4); w32(1); w32(26); w32(0);
  // Exif IFD at 26: 1 entry DateTimeOriginal -> offset 44
  w16(1); w16(0x9003); w16(2); w32(20); w32(44); w32(0);
  for (const ch of date) tiff.push(ch.charCodeAt(0));
  tiff.push(0);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

describe("exif", () => {
  it("reads DateTimeOriginal (little and big endian)", () => {
    const want = new Date(2026, 4, 6, 14, 3, 22).toISOString();
    expect(exifTakenAt(jpegWithExif("2026:05:06 14:03:22"))).toBe(want);
    expect(exifTakenAt(jpegWithExif("2026:05:06 14:03:22", false))).toBe(want);
  });
  it("returns null for non-jpeg or junk", () => {
    expect(exifTakenAt(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
    expect(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull();
    expect(parseExifDate("0000:00:00 00:00:00")).toBeNull();
  });
});

const base: PublicJob = {
  id: "j", org_id: "o", title: "Roof", site_address: null, stage: "sold", job_type: "replacement", is_insurance: false,
  scheduled_start: null, scheduled_end: null, permit_status: "needed", materials_status: "not_ordered", colors_confirmed: false,
  shingle_color: null, completed_at: null, walkthrough_signed_at: null, warranty_product: null, warranty_registered_at: null, created_at: "2026-01-01",
  org: { name: "Summit", phone: null, email: null, website: null, address: null, license_number: null, insurance_certificate_url: null, certifications: [], google_review_url: null },
  customer: { first_name: "Jane" }, crew: null, rep: null, file_count: 3, events: [], photos: [], estimates: [], invoices: [], change_orders: [], claim: null, accepted_estimate: true,
};

describe("milestones", () => {
  it("marks the first unfinished milestone current", () => {
    const ms = deriveMilestones(base);
    expect(ms.map((m) => m.key)).toEqual(["inspection", "contract", "materials_ordered", "permit", "delivered", "tear_off", "dry_in", "complete", "cleanup", "final_invoice", "warranty"]);
    expect(ms.find((m) => m.key === "contract")!.status).toBe("done");
    expect(ms.find((m) => m.key === "materials_ordered")!.status).toBe("current");
    expect(ms.filter((m) => m.status === "current")).toHaveLength(1);
  });
  it("advances from field events and close-out columns", () => {
    const ms = deriveMilestones({
      ...base, stage: "in_progress", permit_status: "approved", materials_status: "delivered",
      events: [{ kind: "tear_off_started", note: null, created_at: "2026-03-01T10:00:00Z", photo: null }, { kind: "dry_in", note: null, created_at: "2026-03-01T15:00:00Z", photo: null }],
    });
    expect(ms.find((m) => m.key === "dry_in")!.status).toBe("done");
    expect(ms.find((m) => m.key === "complete")!.status).toBe("current");
  });
  it("implies earlier build steps once a later one is tapped, but not the claim", () => {
    const claim = { carrier: "X", claim_number: "1", stage: "supplementing", policy_type: "rcv", rcv_amount: 0, depreciation_amount: 0, deductible: 0, mortgagee_name: null, checks: [] };
    const ms = deriveMilestones({ ...base, stage: "in_progress", claim, events: [{ kind: "tear_off_started", note: null, created_at: "2026-03-01T10:00:00Z", photo: null }] });
    expect(ms.find((m) => m.key === "materials_ordered")!.status).toBe("done");
    expect(ms.find((m) => m.key === "permit")!.status).toBe("done");
    expect(ms.find((m) => m.key === "claim")!.status).toBe("current");
    expect(headlineMilestone(ms)!.key).toBe("dry_in");
  });
  it("includes the claim step for insurance jobs", () => {
    const claim = { carrier: "State Farm", claim_number: "1", stage: "approved", policy_type: "rcv", rcv_amount: 20000, depreciation_amount: 5000, deductible: 1000, mortgagee_name: null, checks: [] };
    const ms = deriveMilestones({ ...base, claim });
    expect(ms[1]).toMatchObject({ key: "claim", status: "done" });
  });
});

describe("claim explainer", () => {
  it("explains deductible, held-back depreciation and next check", () => {
    const x = claimExplainer({
      carrier: "State Farm", claim_number: "1", stage: "built", policy_type: "rcv", rcv_amount: 20000, depreciation_amount: 5000, deductible: 1000, mortgagee_name: "Chase",
      checks: [
        { kind: "acv", payer: "carrier", label: null, expected_amount: 14000, received_amount: 14000, received_on: "2026-02-01", endorsement: "endorsed" },
        { kind: "depreciation", payer: "carrier", label: null, expected_amount: 5000, received_amount: 0, received_on: null, endorsement: "needed" },
      ],
    });
    expect(x.heldBack).toBe(5000);
    expect(x.receivedFromInsurer).toBe(14000);
    expect(x.nextCheck).toMatchObject({ amount: 5000 });
    expect(x.lines[0]).toContain("$1,000.00");
    expect(x.lines.join(" ")).toContain("Held back by your insurer until we finish: $5,000.00");
    expect(x.lines.join(" ")).toContain("Chase");
  });
});

describe("helpers", () => {
  it("builds status SMS with link", () => {
    expect(statusSms("on_my_way", "Summit", "https://x/p/t")).toBe("Summit: we're on our way to your home now. Track your project: https://x/p/t");
    expect(statusSms("note", "Summit", "L", "Skylight flashed")).toBe("Summit: update on your roof project: Skylight flashed Track your project: L");
  });
  it("counts warranty registration days", () => {
    const now = new Date("2026-03-11T00:00:00Z");
    expect(warrantyDaysLeft("2026-03-01T00:00:00Z", now)).toBe(35);
    expect(warrantyDaysLeft(null, now)).toBeNull();
  });
});
