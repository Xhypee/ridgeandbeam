import { describe, expect, it } from "vitest";
import { exifTakenAt, parseExifDate } from "./field-exif";
import { claimProgress, deriveMilestones, headlineMilestone, type PublicClaim, type PublicJob } from "./field-milestones";
import { CATEGORY_LABEL, COUNT_CATEGORY, DAMAGE_CATEGORIES, FILE_CATEGORIES, PHOTO_CATEGORIES, statusSms, warrantyDaysLeft } from "./field";

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
    const claim: PublicClaim = { ...auClaim, stage: "scope_received" };
    const ms = deriveMilestones({ ...base, stage: "in_progress", claim, events: [{ kind: "tear_off_started", note: null, created_at: "2026-03-01T10:00:00Z", photo: null }] });
    expect(ms.find((m) => m.key === "materials_ordered")!.status).toBe("done");
    expect(ms.find((m) => m.key === "permit")!.status).toBe("done");
    expect(ms.find((m) => m.key === "claim")!.status).toBe("current");
    expect(ms.find((m) => m.key === "claim")!.detail).toBe("The insurer has sent its scope of works");
    expect(headlineMilestone(ms)!.key).toBe("dry_in");
  });
  it("includes the claim step for insurance jobs, in Australian terms", () => {
    const ms = deriveMilestones({ ...base, claim: { ...auClaim, stage: "work_authorised" } });
    expect(ms[1]).toMatchObject({ key: "claim", status: "done", detail: "The work is authorised" });
    // legacy US stage values map to the AU stage
    expect(deriveMilestones({ ...base, claim: { ...auClaim, stage: "adjuster_scheduled" } })[1].detail).toBe("The insurer's assessor is booked to inspect");
    expect(deriveMilestones({ ...base, claim: { ...auClaim, stage: "declined" } })[1].status).not.toBe("done");
  });
  it("uses Australian build words", () => {
    const labels = deriveMilestones(base).map((m) => m.label);
    expect(labels).toContain("Council / building approval");
    expect(labels).toContain("Watertight");
    expect(labels.join(" ")).not.toMatch(/Dry-in|Tear-off|magnet|Permit$/);
  });
});

const auClaim: PublicClaim = {
  insurer: "Coastal Home Insurance", claim_number: "HB-1", stage: "assessor_booked", excess: 750, settlement_path: "own_builder", approved_amount: 18500,
  payments: [
    { kind: "scope", payer: "carrier", label: null, expected_amount: 17750, received_amount: 10000, received_on: "2026-02-01" },
    { kind: "excess", payer: "homeowner", label: null, expected_amount: 750, received_amount: 750, received_on: "2026-02-01" },
  ],
};

describe("claim progress (AU)", () => {
  it("shows excess, approved amount and insurer money expected vs received", () => {
    const p = claimProgress(auClaim);
    expect(p.stage).toBe("assessor_booked");
    expect(p.stageText).toBe("The insurer's assessor is booked to inspect");
    expect(p.excess).toBe(750);
    expect(p.approved).toBe(18500);
    expect(p.receivedFromInsurer).toBe(10000);
    expect(p.stillExpected).toBe(7750);
    expect(p.step).toBe(1);
    expect(p.isCashSettlement).toBe(false);
    expect(claimProgress({ ...auClaim, stage: "cash_settlement_offered" }).isCashSettlement).toBe(true);
    expect(claimProgress({ ...auClaim, stage: "coc_sent" }).stage).toBe("invoiced");
  });
});

describe("storm damage photos", () => {
  it("has Australian damage categories and no US test squares", () => {
    expect(DAMAGE_CATEGORIES).toEqual(["broken_tiles", "ridge_capping", "sheet_damage", "hail_dents", "gutter_damage", "internal_water", "damage"]);
    expect(PHOTO_CATEGORIES).not.toContain("test_square");
    expect(FILE_CATEGORIES).toContain("test_square"); // legacy rows still load
    expect(COUNT_CATEGORY).toBe("broken_tiles");
    expect(CATEGORY_LABEL.broken_tiles).toBe("Broken / cracked tiles");
    expect(CATEGORY_LABEL.ridge_capping).toBe("Ridge capping");
    expect(CATEGORY_LABEL.decking).toBe("Battens / sarking");
  });
});

describe("helpers", () => {
  it("builds status SMS with link", () => {
    expect(statusSms("on_my_way", "Summit", "https://x/p/t")).toBe("Summit: we're on our way to your home now. Track your project: https://x/p/t");
    expect(statusSms("note", "Summit", "L", "Skylight flashed")).toBe("Summit: update on your roof project: Skylight flashed Track your project: L");
    expect(statusSms("dry_in", "Summit", "L")).toContain("watertight");
  });
  it("counts warranty registration days", () => {
    const now = new Date("2026-03-11T00:00:00Z");
    expect(warrantyDaysLeft("2026-03-01T00:00:00Z", now)).toBe(20);
    expect(warrantyDaysLeft(null, now)).toBeNull();
  });
});
