import { describe, expect, it } from "vitest";
import { becsFee, cardFee, formEncode, invoiceCheckoutParams, signPayload, verifyStripeSignature } from "./stripe";

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
  it("computes indicative card and BECS costs", () => {
    expect(cardFee(1000, 1.75)).toBe(17.5);
    expect(becsFee(100)).toBe(1.3);
    expect(becsFee(10000)).toBe(3.5);
  });

  it("encodes nested params like Stripe expects", () => {
    expect(formEncode({ a: { b: 1 }, l: [{ x: "y" }], m: ["p"] })).toBe("a%5Bb%5D=1&l%5B0%5D%5Bx%5D=y&m%5B0%5D=p");
  });

  it("charges AUD with no surcharge line, and BECS instead of ACH", () => {
    const base = { orgId: "o", invoiceId: "i", invoiceNumber: 1001, accountId: "acct_1", method: "card" as const, amount: 500, fee: 8.75, successUrl: "s", cancelUrl: "c" };
    const p = invoiceCheckoutParams(base);
    expect((p.line_items as unknown[]).length).toBe(1);
    expect((p.line_items as { price_data: { currency: string } }[])[0].price_data.currency).toBe("aud");
    expect((p.metadata as Record<string, string>).applied_amount).toBe("500.00");
    expect(invoiceCheckoutParams({ ...base, method: "becs" }).payment_method_types).toEqual(["au_becs_debit"]);
  });
});
