import { describe, expect, it } from "vitest";
import { stateNoticeGaps, stateNoticesFor } from "@/components/state-notices";

const base = { contractValueIncGst: 30000, contractDate: "2026-11-06", roofSystem: "concrete_tile" as const, jobType: "re_roof" as const, existingHouse: true };
const ids = (s: string, over = {}) => stateNoticesFor({ ...base, state: s, business: { name: "Acme Roofing", licenceNumber: "123456C", abn: "51 824 753 556" }, ...over }).map((n) => n.id);

describe("stateNoticesFor", () => {
  it("NSW over $20k: licence, verbatim sample cooling-off clause, warranties, HBC", () => {
    const n = stateNoticesFor({ ...base, state: "NSW", business: { licenceNumber: "123456C" } });
    expect(n.map((x) => x.id)).toEqual(expect.arrayContaining(["nsw_licence", "nsw_cooling_off", "nsw_warranties", "nsw_insurance"]));
    const c = n.find((x) => x.id === "nsw_cooling_off")!;
    expect(c).toMatchObject({ wording: "verbatim", conspicuous: true, verifiedOn: "2026-11-06" });
    expect(c.text).toMatch(/^Cooling off period for contracts with price over \$20,000/);
    expect(c.text).not.toMatch(/\[notices clause\]/);
    expect(c.verify).toBe("This is general information, not legal advice.");
  });
  it("VIC tile: approved notice + detachable form; VIC metal: no DBC notice", () => {
    expect(ids("VIC")).toEqual(expect.arrayContaining(["vic_cooling_off", "vic_cooling_off_form"]));
    expect(ids("VIC", { roofSystem: "metal" })).not.toContain("vic_cooling_off");
  });
  it("SA uses Form 1 clause 2; QLD a labelled summary", () => {
    const sa = stateNoticesFor({ ...base, state: "SA" }).find((x) => x.id === "sa_form1_cooling_off")!;
    expect(sa.text).toMatch(/What are my "cooling off" rights\?/);
    expect(stateNoticesFor({ ...base, state: "QLD" }).find((x) => x.id === "qld_cooling_off")!.wording).toBe("summary");
  });
  it("door-knock sale adds the ACL front-page notice and termination form", () => {
    const n = stateNoticesFor({ ...base, state: "WA", doorKnockSale: true });
    const front = n.find((x) => x.id === "acl_front_page")!;
    expect(front.title).toBe("Important Notice to the Consumer");
    expect(front.text).toMatch(/10 business days from and including the day after/);
    expect(n.find((x) => x.id === "acl_info")!.text).toMatch(/20\/11\/2026/);
    expect(n.some((x) => x.id === "acl_termination_form" && x.form)).toBe(true);
  });
  it("no cooling-off notice in WA / ACT / NT; gaps list what's missing", () => {
    expect(ids("ACT").some((i) => /cooling/.test(i))).toBe(false);
    expect(ids("NT").some((i) => /cooling/.test(i))).toBe(false);
    expect(stateNoticeGaps({ ...base, state: "NSW" })).toEqual(expect.arrayContaining([expect.stringMatching(/licence number/)]));
    expect(stateNoticeGaps({ ...base, state: "VIC", contractDate: "2027-04-01" }).join(" ")).toMatch(/approved by the Building and Plumbing Commission/);
  });
});
