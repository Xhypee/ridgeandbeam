import { describe, expect, it } from "vitest";
import { daysLeft, quoteReminder, validUntil } from "./quote-remind";

describe("quote reminder", () => {
  const m = quoteReminder({
    org: { name: "Bbang Roofing", phone: "0413 881 009" }, sender: { name: "Bambang Durrani", phone: "0413 881 009" },
    customer: { name: "George Papadopoulos" },
    quote: { number: 1009, total: 10723, validUntil: "2026-12-01", url: "https://ridgeandbeam.com/q/abc", title: "Re-roof, Trimdek" },
  });
  it("is a short, friendly check-in with the link, the price and how long it's good for", () => {
    expect(m.text).toContain("Hi George,");
    expect(m.text).toContain("$10,723");
    expect(m.text).toContain("good until Tuesday 1 December");
    expect(m.sms).toContain("https://ridgeandbeam.com/q/abc");
    expect(m.sms).toContain("it's Bambang from Bbang Roofing");
  });
  it("escapes what people typed", () => {
    const x = quoteReminder({ org: { name: "A & <B>", phone: null }, sender: { name: "Sam", phone: null }, customer: { name: "Jo" }, quote: { number: 1, total: 1, validUntil: null, url: "https://x/q/1", title: "<b>" } });
    expect(x.html).not.toContain("<B>");
    expect(x.html).not.toContain("· <b>");
  });
});

describe("valid until", () => {
  it("adds the quote's days to the sent date and counts what's left", () => {
    expect(validUntil("2026-11-01T03:00:00Z", 30)).toBe("2026-12-01");
    expect(daysLeft("2026-12-01", "2026-11-08")).toBe(23);
    expect(daysLeft("2026-11-01", "2026-11-08")).toBe(-7);
  });
});
