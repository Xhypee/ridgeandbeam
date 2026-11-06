import { describe, expect, it } from "vitest";
import { rulesFor } from "./au-rules";
import { buildChecklist, checklistProgress, depositReadiness, type ChecklistCtx } from "./job-compliance";

const ctx = (over: Partial<ChecklistCtx> & { state?: string; value?: number; roof?: "metal" | "concrete_tile"; doorKnock?: boolean } = {}): ChecklistCtx => {
  const { state = "NSW", value = 30000, roof = "metal", ...rest } = over;
  return {
    rules: rulesFor(state, { contractValueIncGst: value, contractDate: "2026-11-06", roofSystem: roof, jobType: "re_roof", existingHouse: true, doorKnockSale: over.doorKnock }),
    licenceNumber: null, signedAt: null, copyGivenOn: null, permitStatus: "needed", buildingApprovalRequired: null, builtBefore1990: null,
    doorKnock: false, disasterEmergencyRepair: false, jobType: "re_roof", stored: [], today: "2026-11-06",
    ...rest,
  };
};
const byKey = (c: ChecklistCtx) => new Map(buildChecklist(c).map((i) => [i.key, i]));

describe("job compliance checklist", () => {
  it("NSW over $20k: HBC certificate blocks the deposit until ticked", () => {
    const items = buildChecklist(ctx());
    expect(depositReadiness(items).ready).toBe(false);
    const ticked = buildChecklist(ctx({ stored: [{ item_key: "insurance_certificate", status: "done", note: null, reference: "HBC-1", file_id: null }] }));
    expect(depositReadiness(ticked).ready).toBe(true);
  });

  it("licence item is done when the state's licence number is set", () => {
    expect(byKey(ctx()).get("licence_on_quote")!.status).toBe("todo");
    expect(byKey(ctx({ licenceNumber: "123456C" })).get("licence_on_quote")!.status).toBe("done");
  });

  it("cooling-off completes after the end date", () => {
    const c = ctx({ signedAt: "2026-11-06", copyGivenOn: "2026-11-06" });
    expect(byKey(c).get("cooling_off")!.due).toBe("2026-11-13");
    expect(byKey({ ...c, today: "2026-11-13" }).get("cooling_off")!.status).toBe("todo");
    expect(byKey({ ...c, today: "2026-11-14" }).get("cooling_off")!.status).toBe("done");
  });

  it("items that don't apply are not needed (VIC metal re-roof has no DBC cooling-off or insurance)", () => {
    const m = byKey(ctx({ state: "VIC" }));
    expect(m.get("cooling_off")!.status).toBe("not_needed");
    expect(m.get("insurance_certificate")!.status).toBe("not_needed");
    expect(m.get("plumbing_certificate")!.status).toBe("todo");
  });

  it("door-knock sale blocks payment until day 11", () => {
    const c = ctx({ state: "QLD", doorKnock: true, signedAt: "2026-11-06", stored: [{ item_key: "insurance_certificate", status: "done", note: null, reference: null, file_id: null }] });
    const k = byKey({ ...c, today: "2026-11-20" }).get("door_knock_rules")!;
    expect(k.blocksDeposit).toBe(true);
    expect(k.due).toBe("2026-11-20");
    expect(depositReadiness(buildChecklist({ ...c, today: "2026-11-21" })).ready).toBe(true);
  });

  it("asbestos check is done for houses built from 1990; permit done when not needed", () => {
    const m = byKey(ctx({ builtBefore1990: false, buildingApprovalRequired: false }));
    expect(m.get("asbestos_check")!.status).toBe("done");
    expect(m.get("permit_check")!.status).toBe("done");
  });

  it("stored ticks override automatic status and count toward progress", () => {
    const items = buildChecklist(ctx({ stored: [{ item_key: "swms", status: "done", note: "SWMS v2", reference: null, file_id: null }] }));
    const swms = items.find((i) => i.key === "swms")!;
    expect(swms).toMatchObject({ status: "done", manual: true });
    expect(checklistProgress(items).done).toBeGreaterThanOrEqual(1);
  });
});
