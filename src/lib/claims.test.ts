import { describe, expect, it } from "vitest";
import { claimMoney, expectedChecks, followUpDate, nextClaimStage, nextFollowUpAfter } from "./claims";
import { classify, diffScopes, flaggedToSupplementItems, parseMoney, parseScope } from "./claims-scope";
import { planSchedule, validateSchedule } from "./claims-billing";

describe("claim money", () => {
  it("computes ACV payable and recoverable depreciation for RCV policies", () => {
    const m = claimMoney({ policy_type: "rcv", rcv_amount: 20000, depreciation_amount: 6000, deductible: 1000 });
    expect(m.acvPayable).toBe(13000);
    expect(m.recoverable).toBe("yes");
    expect(m.depreciationRecoverable).toBe(6000);
    expect(m.carrierTotal).toBe(19000);
    expect(m.homeownerDeductible).toBe(1000);
    expect(m.warnings).toHaveLength(0);
  });
  it("warns that ACV / roof-schedule depreciation is not recoverable", () => {
    for (const p of ["acv", "roof_schedule"] as const) {
      const m = claimMoney({ policy_type: p, rcv_amount: 20000, depreciation_amount: 6000, deductible: 1000 });
      expect(m.recoverable).toBe("no");
      expect(m.depreciationLost).toBe(6000);
      expect(m.carrierTotal).toBe(13000);
      expect(m.warnings[0]).toMatch(/does not pay back depreciation/);
    }
  });
  it("never goes negative", () => {
    expect(claimMoney({ policy_type: "unknown", rcv_amount: 1000, depreciation_amount: 900, deductible: 500 }).acvPayable).toBe(0);
  });
  it("generates expected checks", () => {
    const rcv = expectedChecks({ policy_type: "rcv", rcv_amount: 20000, depreciation_amount: 6000, deductible: 1000, mortgagee_name: "Big Bank" });
    expect(rcv.map((c) => [c.kind, c.expected_amount, c.endorsement])).toEqual([
      ["acv", 13000, "needed"],
      ["depreciation", 6000, "needed"],
      ["deductible", 1000, "not_required"],
    ]);
    const acv = expectedChecks({ policy_type: "acv", rcv_amount: 20000, depreciation_amount: 6000, deductible: 1000 });
    expect(acv.map((c) => c.kind)).toEqual(["acv", "deductible"]);
  });
  it("advances stages", () => {
    expect(nextClaimStage("contingency_signed")).toBe("claim_filed");
    expect(nextClaimStage("depreciation_released")).toBe("closed");
    expect(nextClaimStage("closed")).toBeNull();
  });
});

describe("supplement follow-ups", () => {
  it("schedules 5/10/14 then weekly", () => {
    expect(followUpDate("2026-11-01", 0)).toBe("2026-11-06");
    expect(followUpDate("2026-11-01", 1)).toBe("2026-11-11");
    expect(followUpDate("2026-11-01", 2)).toBe("2026-11-15");
    expect(followUpDate("2026-11-01", 3)).toBe("2026-11-22");
  });
  it("pushes past today when followed up late", () => {
    expect(nextFollowUpAfter("2026-11-01", 0, "2026-11-06")).toEqual({ date: "2026-11-11", count: 1 });
    expect(nextFollowUpAfter("2026-11-01", 0, "2026-11-12")).toEqual({ date: "2026-11-15", count: 2 });
  });
});

describe("scope parsing", () => {
  it("parses money", () => {
    expect(parseMoney("$1,275.19")).toBe(1275.19);
    expect(parseMoney("(12.50)")).toBe(-12.5);
    expect(Number.isNaN(parseMoney("SQ"))).toBe(true);
  });
  it("parses tab-separated spreadsheet rows with a header", () => {
    const t = "Code\tDescription\tQty\tUnit\tUnit Price\tTotal\nRFG 300S\tLaminated - comp. shingle rfg - w/out felt\t25.33\tSQ\t265.10\t6,714.98\nRFG DRIP\tDrip edge\t180\tLF\t2.85\t513.00\n";
    const { lines } = parseScope(t);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ xact_code: "RFG 300S", quantity: 25.33, unit: "SQ", unit_price: 265.1, total: 6714.98 });
    expect(lines[1].description).toBe("Drip edge");
  });
  it("parses CSV with quotes and Xactimate-style qty+unit cells", () => {
    const t = 'Description,Quantity,Replace,RCV\n"Starter strip, asphalt",180.00 LF,1.92,345.60\nRidge cap - composition shingles,60.00 LF,4.12,247.20';
    const { lines } = parseScope(t);
    expect(lines[0]).toMatchObject({ description: "Starter strip, asphalt", quantity: 180, unit: "LF", unit_price: 1.92, total: 345.6 });
    expect(lines[1].unit).toBe("LF");
  });
  it("parses headerless rows and loose PDF lines", () => {
    expect(parseScope("Ice & water barrier\t400\tSF\t1.85\t740").lines[0]).toMatchObject({ quantity: 400, unit: "SF", total: 740 });
    const loose = parseScope("3. RFG DRIP Drip edge 180.00 LF 2.85 0.00 513.00").lines[0];
    expect(loose).toMatchObject({ xact_code: "RFG DRIP", description: "Drip edge", quantity: 180, unit: "LF", unit_price: 2.85 });
  });
  it("classifies common roof items", () => {
    expect(classify(null, "Hip / Ridge cap - Standard profile - composition shingles")).toBe("ridge_cap");
    expect(classify(null, "Ridge vent - shingle-over style")).toBe("ridge_vent");
    expect(classify(null, "Remove Laminated - comp. shingle rfg")).toBe("tearoff");
    expect(classify("RFG IWS", "Ice & water barrier")).toBe("ice_water");
    expect(classify(null, "Overhead & Profit")).toBe("o_and_p");
    expect(classify("RFG STEEP", "Additional charge for steep roof - 7/12 to 9/12 slope")).toBe("steep");
  });
});

describe("scope diff", () => {
  const L = (description: string, quantity: number, unit: string, unit_price: number, xact_code: string | null = null) => ({ xact_code, description, quantity, unit, unit_price, total: Math.round(quantity * unit_price * 100) / 100 });
  it("matches, flags missing and short commonly-missed items", () => {
    const carrier = [L("Laminated comp shingle roofing", 25, "SQ", 265), L("Hip / ridge cap", 40, "LF", 4.12), L("Gutter guard", 1, "EA", 50)];
    const contractor = [L("Architectural shingles", 25.2, "SQ", 265), L("Ridge cap shingles", 60, "LF", 4.12), L("Drip edge", 180, "LF", 2.85), L("Starter strip", 180, "LF", 1.92)];
    const d = diffScopes(carrier, contractor);
    const by = (s: string) => d.rows.filter((r) => r.status === s).length;
    expect(by("matched")).toBe(1);
    expect(by("qty_differs")).toBe(1);
    expect(by("missing_from_carrier")).toBe(2);
    expect(by("extra")).toBe(1);
    expect(d.flags.filter((f) => f.kind === "missing").map((f) => f.key).sort()).toEqual(["drip_edge", "starter"]);
    expect(d.flags.find((f) => f.kind === "short")?.key).toBe("ridge_cap");
    expect(d.flags.some((f) => f.kind === "check" && f.key === "ice_water")).toBe(true);
    const items = flaggedToSupplementItems(d.flags);
    expect(items).toHaveLength(3);
    const ridge = items.find((i) => /ridge/i.test(i.description))!;
    expect(ridge.quantity).toBe(20);
    expect(items.find((i) => i.description === "Drip edge")?.code_citation).toMatch(/R905\.2\.8\.5/);
  });
});

describe("payment schedule", () => {
  it("validates percentages", () => {
    expect(validateSchedule([{ label: "A", pct: 50, trigger: "signed" }, { label: "B", pct: 40, trigger: "completed" }]).ok).toBe(false);
    expect(validateSchedule([{ label: "A", pct: 50, trigger: "bogus" }, { label: "B", pct: 50, trigger: "completed" }]).ok).toBe(false);
  });
  it("splits a total exactly with milestone kinds", () => {
    const v = validateSchedule([{ label: "Deposit", pct: 30, trigger: "signed" }, { label: "Delivered", pct: 40, trigger: "delivered" }, { label: "Done", pct: 30, trigger: "completed" }]);
    if (!v.ok) throw new Error(v.error);
    const p = planSchedule(10000.01, v.steps);
    expect(p.map((x) => x.kind)).toEqual(["deposit", "progress", "final"]);
    expect(p.map((x) => x.amount)).toEqual([3000, 4000, 3000.01]);
  });
});
