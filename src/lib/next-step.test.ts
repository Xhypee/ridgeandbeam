import { describe, expect, it } from "vitest";
import { ageTone, dollars, EMPTY_INVOICES, jobPhase, jobSteps, nextStep, pipelineColumn, type NextStepCtx, type NextStepJob } from "./next-step";
import { jobReadiness } from "./production";

const NOW = new Date("2026-11-10T03:00:00Z");
const ready = { permit_status: "approved", hoa_status: "not_needed", colors_confirmed: true, materials_status: "delivered", dumpster_status: "ordered", scheduled_start: "2026-11-16" };
const job = (over: Partial<NextStepJob> = {}): NextStepJob => ({
  id: "j1", stage: "lead", is_insurance: false, customer_name: "Raj Patel", customer_phone: "0412 555 142",
  lead_received_at: "2026-11-10T02:57:00Z", first_contacted_at: null, stage_changed_at: "2026-11-01T00:00:00Z", ...ready, ...over,
});
const ctx = (over: Partial<NextStepCtx> = {}): NextStepCtx => ({
  estimate: null, claim: null, variation: null, readiness: null, invoices: { ...EMPTY_INVOICES }, warrantyRegistered: false, reviewRequested: false, now: NOW, ...over,
});
const est = (status: string, extra = {}) => ({ id: "e1", number: 1004, status, total: 18750, sent_at: "2026-11-09T00:00:00Z", accepted_at: null, ...extra });
const r = (j: Partial<NextStepJob>, deposit = true) => jobReadiness({ ...ready, ...j } as never, { depositReceived: deposit });

describe("nextStep: lead", () => {
  it("uncontacted lead → call, with minutes waiting and tel link", () => {
    const s = nextStep(job(), ctx());
    expect(s.key).toBe("call_lead");
    expect(s.title).toBe("Call Raj");
    expect(s.detail).toContain("waiting 3 min");
    expect(s.href).toBe("tel:0412555142");
    expect(s.actionLabel).toBe("Call 0412 555 142");
    expect(s.form).toBe("mark_contacted");
    expect(s.waiting).toBe(true);
  });
  it("lead without a phone opens the job", () => {
    expect(nextStep(job({ customer_phone: null }), ctx()).href).toBe("/app/jobs/j1");
  });
  it("contacted lead → book the inspection", () => {
    const s = nextStep(job({ first_contacted_at: "2026-11-08T00:00:00Z" }), ctx());
    expect(s.key).toBe("book_inspection");
    expect(s.href).toBe("/app/jobs/j1/field");
  });
});

describe("nextStep: quote", () => {
  it("no quote → write it (create form)", () => {
    const s = nextStep(job({ stage: "inspection" }), ctx());
    expect(s.key).toBe("write_quote");
    expect(s.form).toBe("create_estimate");
  });
  it("draft → send quote, list title uses surname", () => {
    const s = nextStep(job({ stage: "inspection" }), ctx({ estimate: est("draft") }));
    expect(s.key).toBe("send_quote");
    expect(s.listTitle).toBe("Send the Patel quote");
    expect(s.href).toBe("/app/estimates/e1");
    expect(s.detail).toContain("$18,750");
  });
  it("sent < 3 days → waiting on homeowner (not on you)", () => {
    const s = nextStep(job({ stage: "estimate_sent" }), ctx({ estimate: est("sent") }));
    expect(s.key).toBe("quote_out");
    expect(s.waiting).toBe(false);
  });
  it("sent ≥ 3 days → follow up", () => {
    const s = nextStep(job({ stage: "estimate_sent" }), ctx({ estimate: est("sent", { sent_at: "2026-11-04T00:00:00Z" }) }));
    expect(s.key).toBe("follow_up_quote");
    expect(s.detail).toMatch(/Sent \d days ago/);
  });
  it("declined → revise", () => {
    expect(nextStep(job({ stage: "estimate_sent" }), ctx({ estimate: est("declined") })).key).toBe("quote_declined");
  });
  it("accepted but still quoting → mark sold", () => {
    expect(nextStep(job({ stage: "estimate_sent" }), ctx({ estimate: est("accepted", { accepted_at: "2026-11-08T00:00:00Z" }) })).key).toBe("mark_sold");
  });
});

describe("nextStep: insurance", () => {
  const sold = job({ stage: "sold", is_insurance: true });
  it("insurance job with no claim → add claim details", () => {
    const s = nextStep(sold, ctx({ estimate: est("accepted") }));
    expect(s.key).toBe("add_claim");
    expect(s.phase).toBe("claim");
  });
  it("claim lodged → book the assessor", () => {
    const s = nextStep(sold, ctx({ claim: { id: "c1", stage: "claim_filed", stage_changed_at: "2026-11-05T00:00:00Z", carrier: "Allianz" } }));
    expect(s.title).toBe("Book the assessor");
    expect(s.detail).toContain("Allianz");
  });
  it("variation request waiting with a follow-up due → follow up (beats readiness)", () => {
    const s = nextStep(sold, ctx({
      claim: { id: "c1", stage: "approved", stage_changed_at: null, carrier: "Allianz" },
      variation: { id: "v1", status: "submitted", submitted_on: "2026-10-31", next_follow_up_on: "2026-11-09", requested_amount: 1240 },
      readiness: r({ dumpster_status: "needed" }),
    }));
    expect(s.key).toBe("follow_up_variation");
    expect(s.listTitle).toBe("Follow up the Patel variation request");
    expect(s.detail).toBe("Sent to Allianz 10 days ago · $1,240.");
    expect(s.tag).toBe("Insurance");
  });
  it("variation follow-up not yet due is ignored", () => {
    const s = nextStep(sold, ctx({
      claim: { id: "c1", stage: "approved", stage_changed_at: null, carrier: "Allianz" },
      variation: { id: "v1", status: "submitted", submitted_on: "2026-11-08", next_follow_up_on: "2026-11-13", requested_amount: 1240 },
      readiness: r({}),
    }));
    expect(s.key).not.toBe("follow_up_variation");
  });
  it("declined claim", () => {
    expect(nextStep(sold, ctx({ claim: { id: "c1", stage: "denied", stage_changed_at: null, carrier: null } })).key).toBe("claim_declined");
  });
  it("unknown claim stage falls back without crashing", () => {
    expect(nextStep(sold, ctx({ claim: { id: "c1", stage: "with_assessor", stage_changed_at: null, carrier: null } })).title).toBe("Check the claim");
  });
});

describe("nextStep: build", () => {
  const sold = job({ stage: "sold" });
  it("first readiness blocker, counting what's left", () => {
    const s = nextStep(sold, ctx({ readiness: r({ dumpster_status: "needed" }, false) }));
    expect(s.key).toBe("ready_dumpster");
    expect(s.title).toBe("Order the skip bin");
    expect(s.detail).toBe("2 things left before this job can be locked on the schedule.");
    expect(s.href).toBe("/app/jobs/j1/production");
    expect(s.phase).toBe("build");
  });
  it("deposit blocker goes to billing", () => {
    const s = nextStep(sold, ctx({ readiness: r({}, false) }));
    expect(s.key).toBe("ready_deposit");
    expect(s.href).toBe("/app/jobs/j1/billing");
    expect(s.tag).toBe("Money");
  });
  it("colours and permit wording", () => {
    expect(nextStep(sold, ctx({ readiness: r({ colors_confirmed: false }) })).title).toBe("Confirm colours with Raj");
    expect(nextStep(job({ stage: "sold", permit_status: "applied" }), ctx({ readiness: r({ permit_status: "applied" }) })).title).toBe("Chase the building permit");
  });
  it("computes readiness from the job when ctx has none", () => {
    expect(nextStep(job({ stage: "sold", dumpster_status: "needed" }), ctx({ invoices: { ...EMPTY_INVOICES, paid: 100 } })).key).toBe("ready_dumpster");
  });
  it("ready, no dates → schedule; dates → lock; locked → booked", () => {
    expect(nextStep(job({ stage: "sold", scheduled_start: null }), ctx({ readiness: r({ scheduled_start: null }) })).key).toBe("schedule");
    expect(nextStep(sold, ctx({ readiness: r({}) })).key).toBe("lock");
    const booked = nextStep(job({ stage: "scheduled", schedule_locked: true }), ctx({ readiness: r({}) }));
    expect(booked.key).toBe("build_booked");
    expect(booked.waiting).toBe(false);
  });
  it("on the roof; overdue build", () => {
    expect(nextStep(job({ stage: "in_progress", scheduled_end: "2026-11-11" }), ctx()).key).toBe("on_roof");
    expect(nextStep(job({ stage: "in_progress", scheduled_end: "2026-11-07" }), ctx()).key).toBe("finish_build");
  });
});

describe("nextStep: close-out and money", () => {
  const done = job({ stage: "completed", walkthrough_signed_at: "2026-11-08T00:00:00Z" });
  it("walkthrough first", () => {
    expect(nextStep(job({ stage: "completed" }), ctx()).key).toBe("walkthrough");
  });
  it("no invoice → send final invoice", () => {
    expect(nextStep(done, ctx()).key).toBe("send_invoice");
  });
  it("balance owing → chase payment, mentions overdue", () => {
    const s = nextStep(done, ctx({ invoices: { count: 1, billed: 14200, paid: 9200, balance: 5000, overdue: 1 } }));
    expect(s.key).toBe("chase_payment");
    expect(s.detail).toBe("$5,000 still owed, 1 invoice overdue.");
  });
  it("paid up → warranty, then review, then mark paid", () => {
    const paidUp = { count: 1, billed: 100, paid: 100, balance: 0, overdue: 0 };
    expect(nextStep(done, ctx({ invoices: paidUp })).key).toBe("register_warranty");
    expect(nextStep(done, ctx({ invoices: paidUp, warrantyRegistered: true })).key).toBe("ask_review");
    expect(nextStep(done, ctx({ invoices: paidUp, warrantyRegistered: true, reviewRequested: true })).key).toBe("mark_paid");
  });
  it("paid job: review, then all done", () => {
    const paid = job({ stage: "paid" });
    expect(nextStep(paid, ctx({ warrantyRegistered: true })).listTitle).toBe("Ask Raj Patel for a review");
    const s = nextStep(paid, ctx({ warrantyRegistered: true, reviewRequested: true, invoices: { count: 1, billed: 9800, paid: 9800, balance: 0, overdue: 0 } }));
    expect(s.key).toBe("done");
    expect(s.waiting).toBe(false);
  });
  it("lost job", () => {
    expect(nextStep(job({ stage: "lost" }), ctx()).key).toBe("lost");
  });
});

describe("jobPhase / jobSteps", () => {
  it("phases from stage + data", () => {
    expect(jobPhase(job(), ctx())).toBe("lead");
    expect(jobPhase(job({ stage: "inspection" }), ctx())).toBe("inspect");
    expect(jobPhase(job({ stage: "inspection" }), ctx({ estimate: est("draft") }))).toBe("quote");
    expect(jobPhase(job({ stage: "sold", is_insurance: true }), ctx())).toBe("claim");
    expect(jobPhase(job({ stage: "sold", is_insurance: true }), ctx({ claim: { id: "c", stage: "approved", stage_changed_at: null, carrier: null } }))).toBe("build");
    expect(jobPhase(job({ stage: "sold" }), ctx())).toBe("build");
    expect(jobPhase(job({ stage: "completed" }), ctx())).toBe("close");
    expect(jobPhase(job({ stage: "paid" }), ctx())).toBe("paid");
  });
  it("insurance job: 7 steps with statuses and links", () => {
    const steps = jobSteps(job({ stage: "sold", is_insurance: true, first_contacted_at: "x" }), ctx({
      estimate: est("accepted"), claim: { id: "c", stage: "approved", stage_changed_at: null, carrier: null }, readiness: r({ dumpster_status: "needed" }, false), photos: 52,
      invoices: { count: 1, billed: 13400, paid: 13400, balance: 0, overdue: 0 },
    }));
    expect(steps.map((s) => s.key)).toEqual(["lead", "inspect", "quote", "claim", "build", "close", "paid"]);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "current", "todo", "todo"]);
    expect(steps.find((s) => s.key === "inspect")?.status).toBe("52 photos");
    expect(steps.find((s) => s.key === "quote")).toMatchObject({ status: "Signed", href: "/app/estimates/e1" });
    expect(steps.find((s) => s.key === "claim")?.status).toBe("Approved");
    expect(steps.find((s) => s.key === "build")?.status).toBe("Getting ready 4/6");
    expect(steps.find((s) => s.key === "paid")?.status).toBe("$13,400 in");
    expect(steps.find((s) => s.key === "close")?.href).toBe("/app/jobs/j1/closeout");
  });
  it("retail job hides Claim; crew lead sees only Field + Build", () => {
    expect(jobSteps(job({ stage: "sold" }), ctx()).map((s) => s.key)).toEqual(["lead", "inspect", "quote", "build", "close", "paid"]);
    const crew = jobSteps(job({ stage: "in_progress" }), ctx(), { crewLead: true });
    expect(crew.map((s) => [s.key, s.label])).toEqual([["inspect", "Field"], ["build", "Build"]]);
    expect(crew[1].status).toBe("On the roof");
  });
  it("quote step without a quote points at the job's quotes", () => {
    expect(jobSteps(job({ stage: "inspection" }), ctx()).find((s) => s.key === "quote")?.href).toBe("/app/jobs/j1#quotes");
  });
});

describe("pipeline helpers", () => {
  it("columns", () => {
    expect(pipelineColumn({ stage: "lead" })).toBe("new");
    expect(pipelineColumn({ stage: "estimate_sent" })).toBe("quoted");
    expect(pipelineColumn({ stage: "inspection" })).toBe("new");
    expect(pipelineColumn({ stage: "scheduled" })).toBe("sold");
    expect(pipelineColumn({ stage: "in_progress" })).toBe("building");
    expect(pipelineColumn({ stage: "completed" })).toBe("wrapping");
    expect(pipelineColumn({ stage: "paid", stage_changed_at: "2026-11-01T00:00:00Z" }, NOW)).toBe("wrapping");
    expect(pipelineColumn({ stage: "paid", stage_changed_at: "2026-09-01T00:00:00Z" }, NOW)).toBeNull();
    expect(pipelineColumn({ stage: "lost" })).toBeNull();
  });
  it("age tones", () => {
    expect(ageTone("new", { minutes: 3 })).toBe("ok");
    expect(ageTone("new", { minutes: 41 })).toBe("amber");
    expect(ageTone("new", { minutes: 90 })).toBe("red");
    expect(ageTone("quoted", { days: 6 })).toBe("amber");
    expect(ageTone("sold", { days: 15 })).toBe("red");
  });
  it("dollars", () => {
    expect(dollars(18750.4)).toBe("$18,750");
  });
});

describe("pipelineColumn: deposit", () => {
  const signed = (over: Partial<NextStepCtx["estimate"] & object> = {}, paid = 0) => ({
    estimate: { id: "e", number: 1, status: "accepted", total: 10000, sent_at: null, accepted_at: "2026-11-01", ...over },
    invoices: { ...EMPTY_INVOICES, paid },
  });
  it("keeps a signed job in Quoted until the deposit is paid", () => {
    expect(pipelineColumn({ stage: "sold" }, NOW, signed())).toBe("quoted");
    expect(pipelineColumn({ stage: "sold" }, NOW, signed({}, 1000))).toBe("sold");
  });
  it("moves on when no deposit is due, for insurance jobs, or when nothing is known", () => {
    expect(pipelineColumn({ stage: "sold" }, NOW, signed({ depositDue: false }))).toBe("sold");
    expect(pipelineColumn({ stage: "sold", is_insurance: true }, NOW, signed())).toBe("sold");
    expect(pipelineColumn({ stage: "scheduled" })).toBe("sold");
  });
});
