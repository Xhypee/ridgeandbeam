import { describe, expect, it } from "vitest";
import { replySubject, textToHtml, threadsOf, type MailRow } from "./inbox";

const row = (o: Partial<MailRow>): MailRow => ({ id: "x", direction: "outbound", from_address: null, to_address: null, subject: null, body: "", status: "sent", created_at: "2026-11-10T00:00:00Z", read_at: null, thread_ref: null, job_id: null, customer_id: null, customer: null, job: null, ...o });

describe("inbox", () => {
  it("groups by Gmail thread, newest conversation first, counting unread replies", () => {
    const t = threadsOf([
      row({ id: "1", thread_ref: "t1", subject: "Your quote", to_address: "ahmed@x.com", created_at: "2026-11-10T00:00:00Z", customer: { name: "Ahmed Khan", email: "ahmed@x.com" }, customer_id: "c1", job_id: "j1", job: { title: "Re-roof" } }),
      row({ id: "2", thread_ref: "t1", direction: "inbound", subject: "Re: Your quote", from_address: "Ahmed <ahmed@x.com>", created_at: "2026-11-11T00:00:00Z" }),
      row({ id: "3", subject: "Invoice", to_address: "sue@y.com", created_at: "2026-11-09T00:00:00Z" }),
    ]);
    expect(t.map((x) => x.key)).toEqual(["t1", "m:3"]);
    expect(t[0]).toMatchObject({ subject: "Your quote", who: "Ahmed Khan", email: "ahmed@x.com", count: 2, unread: 1, jobId: "j1", jobTitle: "Re-roof" });
    expect(t[1]).toMatchObject({ who: "sue@y.com", unread: 0 });
  });
  it("reply subjects and safe html", () => {
    expect(replySubject("Your quote")).toBe("Re: Your quote");
    expect(replySubject("RE: Your quote")).toBe("RE: Your quote");
    expect(textToHtml("Hi <b>\nThanks")).toContain("Hi &lt;b&gt;<br>Thanks");
  });
});
