import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe over its REST API (no SDK). Server code only — never import from a client component.
 * Env: STRIPE_SECRET_KEY (platform key, Connect enabled), STRIPE_WEBHOOK_SECRET (whsec_...),
 * STRIPE_PRICE_ID (the flat Ridge & Beam plan price, subscription mode).
 */

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const subscriptionBillingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

type Scalar = string | number | boolean | null | undefined;
interface Params { [key: string]: Scalar | Params | (string | Params)[] }

/** Stripe's bracketed form encoding: a[b][0][c]=v */
export function formEncode(params: Params, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") parts.push(formEncode(item, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === "object") parts.push(formEncode(v, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

export class StripeError extends Error {}

export async function stripeRequest<T = Record<string, unknown>>(method: "GET" | "POST" | "DELETE", path: string, params?: Params, opts?: { idempotencyKey?: string }): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("Online payments aren't configured yet.");
  const body = params ? formEncode(params) : undefined;
  const url = `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe returned HTTP ${res.status}`);
  return json as T;
}

/** Fee the customer pays (or the contractor absorbs) for a card payment, rounded to cents. */
export function cardFee(amount: number, pct: number) {
  return Math.round(amount * pct) / 100;
}
/** ACH via Stripe: 0.8% capped at $5. */
export function achFee(amount: number) {
  return Math.min(5, Math.round(amount * 0.8) / 100);
}

// ---------------------------------------------------------------------------
// Connect Express onboarding
// ---------------------------------------------------------------------------
export async function createExpressAccount(org: { id: string; email: string | null; name: string }) {
  return stripeRequest<{ id: string }>("POST", "/accounts", {
    type: "express",
    country: "US",
    email: org.email ?? undefined,
    business_profile: { name: org.name, mcc: "1761" }, // roofing, siding, sheet metal
    capabilities: { card_payments: { requested: true }, transfers: { requested: true }, us_bank_account_ach_payments: { requested: true } },
    metadata: { org_id: org.id },
  });
}

export async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
  return stripeRequest<{ url: string }>("POST", "/account_links", { account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
}

export async function getAccount(accountId: string) {
  return stripeRequest<{ id: string; charges_enabled: boolean; details_submitted: boolean }>("GET", `/accounts/${accountId}`);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
export type InvoiceCheckout = {
  orgId: string;
  invoiceId: string;
  invoiceNumber: number;
  accountId: string;
  method: "card" | "ach";
  /** Amount applied to the invoice (dollars). */
  amount: number;
  /** Processing fee (dollars) — charged on top when passFee, otherwise informational. */
  fee: number;
  passFee: boolean;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
};

export function invoiceCheckoutParams(c: InvoiceCheckout): Params {
  const cents = (n: number) => Math.round(n * 100);
  const lines: Params[] = [
    { price_data: { currency: "usd", unit_amount: cents(c.amount), product_data: { name: `Invoice #${c.invoiceNumber}` } }, quantity: 1 },
  ];
  if (c.passFee && c.fee > 0) {
    lines.push({ price_data: { currency: "usd", unit_amount: cents(c.fee), product_data: { name: c.method === "card" ? "Card processing fee" : "Bank transfer fee" } }, quantity: 1 });
  }
  const metadata = { org_id: c.orgId, invoice_id: c.invoiceId, applied_amount: c.amount.toFixed(2), fee_amount: c.fee.toFixed(2), kind: "invoice" };
  return {
    mode: "payment",
    payment_method_types: [c.method === "card" ? "card" : "us_bank_account"],
    line_items: lines,
    customer_email: c.customerEmail ?? undefined,
    success_url: c.successUrl,
    cancel_url: c.cancelUrl,
    metadata,
    payment_intent_data: { transfer_data: { destination: c.accountId }, metadata },
  };
}

export async function createInvoiceCheckout(c: InvoiceCheckout) {
  return stripeRequest<{ id: string; url: string }>("POST", "/checkout/sessions", invoiceCheckoutParams(c));
}

export async function createSubscriptionCheckout(o: { orgId: string; email: string | null; customerId: string | null; successUrl: string; cancelUrl: string }) {
  return stripeRequest<{ id: string; url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    client_reference_id: o.orgId,
    customer: o.customerId ?? undefined,
    customer_email: o.customerId ? undefined : (o.email ?? undefined),
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    metadata: { org_id: o.orgId, kind: "subscription" },
    subscription_data: { metadata: { org_id: o.orgId } },
  });
}

export async function setSubscriptionCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
  return stripeRequest<{ id: string; current_period_end?: number; cancel_at?: number | null }>("POST", `/subscriptions/${subscriptionId}`, { cancel_at_period_end: cancel });
}

// ---------------------------------------------------------------------------
// Webhook signature verification (https://docs.stripe.com/webhooks#verify-manually)
// Header: Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.payload">[,v1=...]
// ---------------------------------------------------------------------------
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function signPayload(payload: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), tolerance = WEBHOOK_TOLERANCE_SECONDS): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature header" };
  let timestamp: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t") timestamp = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!timestamp || !Number.isFinite(timestamp)) return { ok: false, reason: "missing timestamp" };
  if (sigs.length === 0) return { ok: false, reason: "no v1 signature" };
  if (Math.abs(nowSeconds - timestamp) > tolerance) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = Buffer.from(signPayload(payload, secret, timestamp), "hex");
  const match = sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false;
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
