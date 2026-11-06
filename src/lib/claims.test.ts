import { describe, expect, it } from "vitest";
import {
  addBusinessDaysIso, addMonthsIso, auStage, CLAIM_STAGE_LABEL, claimMoney, codeTimeframes, expectedPayments, followUpDate, homeownerExplainer,
  nextClaimStage, nextFollowUpAfter, payerGroup,
} from "./claims";
import { classify, diffScopes, flaggedToSupplementItems, parseMoney, parseScope } from "./claims-scope";
import { planSchedule, validateSchedule } from "./claims-billing";

describe("AU claim stages", () => {
  it("advances along the AU path and handles decision outcomes", () => {
    expect(nextClaimStage("lodged")).toBe("assessor_booked");
    expect(nextClaimStage("scope_received")).toBe("approved");
    expect(nextClaimStage("approved")).toBe("work_authorised");
    expect(nextClaimStage("cash_settlement_offered")).toBe("work_authorised");
    expect(nextClaimStage("paid")).toBe("closed");
    expect(nextClaimStage("declined")).toBeNull();
    expect(nextClaimStage("closed")).toBeNull();
  });
  it("maps legacy US stages to AU ones", () => {
    expect(auStage("contingency_signed")).toBe("lodged");
    expect(auStage("adjuster_met")).toBe("assessed");
    expect(auStage("depreciation_released")).toBe("paid");
    expect(CLAIM_STAGE_LABEL.denied).toBe("Declined");
    expect(CLAIM_STAGE_LABEL.coc_sent).toBe("Invoiced");
  });
});

describe("expected payments by settlement path", () => {
  const base = { excess: 750, approved_amount: 18000 };
  it("own builder: insurer pays approved less excess, homeowner pays excess and the gap", () => {
    const p = expectedPayments({ ...base, settlement_path: "own_builder" }, 19500);
    expect(p.map((x) => [x.kind, x.payer, x.expected_amount])).toEqual([
      ["scope", "carrier", 17250],
      ["excess", "homeowner", 750],
      ["balance", "homeowner", 1500],
    ]);
  });
  it("insurer-managed via a panel builder: the builder pays the approved scope; excess isn't ours", () => {
    const p = expectedPayments({ ...base, settlement_path: "insurer_managed", panel_builder_name: "Acme Builders" });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "scope", payer: "panel_builder", expected_amount: 18000 });
    expect(claimMoney({ ...base, settlement_path: "insurer_managed", panel_builder_name: "Acme Builders" }).warnings.join(" ")).toMatch(/panel builder usually collects/);
  });
  it("insurer-managed with us on the insurer's network directly", () => {
    const p = expectedPayments({ ...base, settlement_path: "insurer_managed" });
    expect(p.map((x) => x.payer)).toEqual(["carrier", "homeowner"]);
  });
  it("cash settlement: the homeowner pays our price", () => {
    expect(expectedPayments({ ...base, settlement_path: "cash_settlement", cash_settlement_amount: 15000 }, 16200)).toEqual([
      { kind: "cash_settlement", payer: "homeowner", label: "Homeowner (paid from their cash settlement)", expected_amount: 16200 },
    ]);
    expect(expectedPayments({ ...base, settlement_path: "cash_settlement", cash_settlement_amount: 15000 })[0].expected_amount).toBe(15000);
  });
  it("adds make-safe from whoever pays for it, and nothing while undecided", () => {
    const p = expectedPayments({ excess: 0, approved_amount: 0, settlement_path: "undecided", make_safe_payer: "insurer", make_safe_amount: 660 });
    expect(p).toEqual([{ kind: "make_safe", payer: "carrier", label: "Make-safe / temporary repairs", expected_amount: 660 }]);
    expect(claimMoney({ excess: 0, approved_amount: 0, settlement_path: "undecided" }).warnings[0]).toMatch(/Settlement path not decided/);
  });
  it("groups ledger rows by payer", () => {
    expect(payerGroup({ kind: "excess", payer: "homeowner" })).toBe("homeowner_excess");
    expect(payerGroup({ kind: "balance", payer: "homeowner" })).toBe("homeowner_balance");
    expect(payerGroup({ kind: "scope", payer: "panel_builder" })).toBe("panel_builder");
    expect(payerGroup({ kind: "acv", payer: "mortgagee" })).toBe("insurer");
    const m = claimMoney({ ...base, settlement_path: "own_builder" }, 19500);
    expect(m.byGroup).toEqual({ insurer: 17250, homeowner_excess: 750, panel_builder: 0, homeowner_balance: 1500 });
  });
});

describe("Code of Practice timeframe guide", () => {
  it("adds months and business days", () => {
    expect(addMonthsIso("2026-10-31", 4)).toBe("2027-02-28");
    expect(addBusinessDaysIso("2026-11-06", 10)).toBe("2026-11-20"); // Fri + 10 business days
  });
  it("builds reminders until the insurer decides", () => {
    const r = codeTimeframes({ stage: "assessed", lodged_on: "2026-07-01", info_complete_on: "2026-11-02", catastrophe: "none" }, "2026-11-06");
    expect(r.map((x) => x.key)).toEqual(["update", "decision", "decision_after_info"]);
    expect(r.find((x) => x.key === "decision")).toMatchObject({ due: "2026-11-01", status: "overdue" });
    expect(r.find((x) => x.key === "decision_after_info")).toMatchObject({ due: "2026-11-16", status: "ok" });
    expect(codeTimeframes({ stage: "lodged", lodged_on: "2026-07-01", catastrophe: "extraordinary" }, "2026-11-06").find((x) => x.key === "decision")?.due).toBe("2027-07-01");
    expect(codeTimeframes({ stage: "approved", lodged_on: "2026-07-01" }, "2026-11-06")).toEqual([]);
    expect(codeTimeframes({ stage: "lodged", lodged_on: null }, "2026-11-06")).toEqual([]);
  });
});

describe("homeowner explainer", () => {
  it("explains excess, cash settlement and complaints without advice", () => {
    const s = homeownerExplainer({ excess: 500, settlement_path: "cash_settlement", insurer: "NRMA", orgName: "Top Roofing" });
    const text = s.flatMap((x) => [x.title, ...x.body]).join(" ");
    expect(text).toMatch(/\$500\.00/);
    expect(text).toMatch(/AFCA/);
    expect(text).toMatch(/internal complaints process/);
    expect(text).toMatch(/can't negotiate it for you/);
    expect(text).not.toMatch(/deductible|depreciation|mortgage/i);
  });
});

describe("variation request follow-ups", () => {
  it("schedules 5/10/14 then weekly", () => {
    expect(followUpDate("2026-11-01", 0)).toBe("2026-11-06");
    expect(followUpDate("2026-11-01", 2)).toBe("2026-11-15");
    expect(followUpDate("2026-11-01", 3)).toBe("2026-11-22");
  });
  it("pushes past today when followed up late", () => {
    expect(nextFollowUpAfter("2026-11-01", 0, "2026-11-12")).toEqual({ date: "2026-11-15", count: 2 });
  });
});

describe("insurer scope parsing (AU)", () => {
  it("parses money", () => {
    expect(parseMoney("$1,275.19")).toBe(1275.19);
    expect(parseMoney("(12.50)")).toBe(-12.5);
  });
  it("parses tab-separated rows with a header and metric units", () => {
    const t = "Description\tQty\tUnit\tRate\tTotal\nReplace Colorbond Custom Orb sheeting\t182.5\tm2\t68.00\t12,410.00\nRidge capping\t14\tLM\t32.00\t448.00\n";
    const { lines } = parseScope(t);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 182.5, unit: "M2", unit_price: 68, total: 12410 });
    expect(lines[1].unit).toBe("LM");
  });
  it("parses loose lines pasted from a PDF scope and skips GST/total rows", () => {
    const { lines } = parseScope("3. Replace valley iron 12.00 LM 38.50 462.00\nGST 46.20\nTotal inc GST 508.20");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ description: "Replace valley iron", quantity: 12, unit: "LM", unit_price: 38.5 });
  });
  it("classifies common AU roof items", () => {
    expect(classify(null, "Supply & install sarking")).toBe("sarking");
    expect(classify(null, "Edge protection / scaffold hire")).toBe("edge_protection");
    expect(classify(null, "Skip bin 6m3")).toBe("skip_bin");
    expect(classify(null, "Barge capping")).toBe("barge");
    expect(classify(null, "Rebed and repoint ridge")).toBe("ridge_capping");
    expect(classify(null, "Rebed & repoint hips")).toBe("hip_capping");
    expect(classify(null, "Make safe — tarp roof")).toBe("make_safe");
  });
});

describe("scope compare", () => {
  const L = (description: string, quantity: number, unit: string, unit_price: number) => ({ xact_code: null, description, quantity, unit, unit_price, total: Math.round(quantity * unit_price * 100) / 100 });
  it("flags missing and short commonly-missed items and drafts variation lines", () => {
    const insurer = [L("Replace roof sheeting Colorbond", 180, "M2", 68), L("Ridge capping", 10, "LM", 32), L("Clean gutters", 1, "EA", 150)];
    const ours = [L("Colorbond roof sheeting", 182, "M2", 68), L("Ridge capping", 14, "LM", 32), L("Sarking", 182, "M2", 9.5), L("Edge protection", 1, "ITEM", 1450)];
    const d = diffScopes(insurer, ours);
    expect(d.flags.filter((f) => f.kind === "missing").map((f) => f.key).sort()).toEqual(["edge_protection", "sarking"]);
    expect(d.flags.find((f) => f.kind === "short")?.key).toBe("ridge_capping");
    expect(d.flags.some((f) => f.kind === "check" && f.key === "skip_bin")).toBe(true);
    const items = flaggedToSupplementItems(d.flags);
    expect(items.find((i) => /ridge/i.test(i.description))?.quantity).toBe(4);
    expect(items.find((i) => i.description === "Sarking")?.code_citation).toMatch(/AS 4200\.2/);
    expect(d.flags.map((f) => f.message).join(" ")).toMatch(/insurer/);
  });
});

describe("payment schedule", () => {
  it("validates percentages", () => {
    expect(validateSchedule([{ label: "A", pct: 50, trigger: "signed" }, { label: "B", pct: 40, trigger: "completed" }]).ok).toBe(false);
  });
  it("splits a total exactly with milestone kinds", () => {
    const v = validateSchedule([{ label: "Deposit", pct: 10, trigger: "signed" }, { label: "Delivered", pct: 40, trigger: "delivered" }, { label: "Done", pct: 50, trigger: "completed" }]);
    if (!v.ok) throw new Error(v.error);
    const p = planSchedule(21072.35, v.steps);
    expect(p.map((x) => x.kind)).toEqual(["deposit", "progress", "final"]);
    expect(Math.round(p.reduce((s, x) => s + x.amount, 0) * 100) / 100).toBe(21072.35);
  });
});
