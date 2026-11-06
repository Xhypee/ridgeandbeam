import { describe, expect, it } from "vitest";
import { achFee, cardFee, formEncode, invoiceCheckoutParams, signPayload, verifyStripeSignature } from "./stripe";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_790_000_000;

describe("verifyStripeSignature", () => {
  it("accepts a valid signature", () => {
    const sig = signPayload(payload, secret, now);
    expect(verifyStripeSignature(payload, `t=${now},v1=${sig}`, secret, now)).toEqual({ ok: true });
  });

  it("accepts when one of several v1 signatures matches (secret rotation)", () => {
    const sig = signPayload(payload, secret, now);
    expect(verifyStripeSignature(payload, `t=${now},v1=${"0".repeat(64)},v1=${sig},v0=abc`, secret, now).ok).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = signPayload(payload, secret, now);
    expect(verifyStripeSignature(payload + " ", `t=${now},v1=${sig}`, secret, now)).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects the wrong secret", () => {
    const sig = signPayload(payload, "whsec_other", now);
    expect(verifyStripeSignature(payload, `t=${now},v1=${sig}`, secret, now).ok).toBe(false);
  });

  it("rejects timestamps older than 5 minutes (replay)", () => {
    const sig = signPayload(payload, secret, now - 301);
    expect(verifyStripeSignature(payload, `t=${now - 301},v1=${sig}`, secret, now)).toEqual({ ok: false, reason: "timestamp outside tolerance" });
    const ok = signPayload(payload, secret, now - 299);
    expect(verifyStripeSignature(payload, `t=${now - 299},v1=${ok}`, secret, now).ok).toBe(true);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyStripeSignature(payload, null, secret, now).ok).toBe(false);
    expect(verifyStripeSignature(payload, "v1=abc", secret, now).ok).toBe(false);
    expect(verifyStripeSignature(payload, `t=${now}`, secret, now).ok).toBe(false);
    expect(verifyStripeSignature(payload, `t=${now},v1=zz-not-hex`, secret, now).ok).toBe(false);
    expect(verifyStripeSignature(payload, `t=${now},v1=abcd`, secret, now).ok).toBe(false);
  });
});

describe("fees and checkout params", () => {
  it("computes card and ACH fees", () => {
    expect(cardFee(1000, 2.9)).toBe(29);
    expect(achFee(100)).toBe(0.8);
    expect(achFee(10000)).toBe(5);
  });

  it("encodes nested params like Stripe expects", () => {
    expect(formEncode({ a: { b: 1 }, l: [{ x: "y" }], m: ["p"] })).toBe("a%5Bb%5D=1&l%5B0%5D%5Bx%5D=y&m%5B0%5D=p");
  });

  it("adds a visible fee line only when the fee is passed on", () => {
    const base = { orgId: "o", invoiceId: "i", invoiceNumber: 1001, accountId: "acct_1", method: "card" as const, amount: 500, fee: 14.5, successUrl: "s", cancelUrl: "c" };
    expect((invoiceCheckoutParams({ ...base, passFee: true }).line_items as unknown[]).length).toBe(2);
    const p = invoiceCheckoutParams({ ...base, passFee: false });
    expect((p.line_items as unknown[]).length).toBe(1);
    expect((p.metadata as Record<string, string>).applied_amount).toBe("500.00");
  });
});
