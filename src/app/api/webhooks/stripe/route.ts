import { adminClient } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { verifyStripeSignature } from "@/lib/stripe";

/**
 * Stripe webhook (platform account, with Connect events). Signature-verified (HMAC-SHA256 of "t.payload",
 * constant-time compare, 5-minute tolerance). Payments are idempotent on payments.provider_ref (PaymentIntent id).
 */

type Session = {
  id: string; mode: string; payment_status: string; payment_intent: string | null; amount_total: number | null;
  customer: string | null; subscription: string | null; client_reference_id: string | null;
  payment_method_types?: string[]; metadata?: Record<string, string>;
};
type Event = { id: string; type: string; account?: string; data: { object: Record<string, unknown> } };

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Stripe webhooks aren't configured" }, { status: 501 });
  const payload = await req.text();
  const check = verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret);
  if (!check.ok) return Response.json({ error: `Invalid signature: ${check.reason}` }, { status: 400 });

  let event: Event;
  try { event = JSON.parse(payload) as Event; } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const db = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as unknown as Session;
        const md = s.metadata ?? {};
        if (s.mode === "subscription" || md.kind === "subscription") {
          const orgId = md.org_id ?? s.client_reference_id;
          if (orgId) await db.from("organizations").update({ stripe_customer_id: s.customer, stripe_subscription_id: s.subscription, subscription_status: "active", cancel_at: null }).eq("id", orgId);
          break;
        }
        if (md.kind !== "invoice" || s.payment_status !== "paid" || !s.payment_intent) break; // ACH: wait for async_payment_succeeded
        await recordPayment(db, s);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as { id: string; metadata?: Record<string, string> };
        await db.from("organizations").update({ subscription_status: "cancelled", cancel_at: new Date().toISOString() }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "account.updated": {
        const a = event.data.object as { id: string; charges_enabled?: boolean };
        await db.from("organizations").update({ stripe_charges_enabled: Boolean(a.charges_enabled) }).eq("stripe_account_id", a.id);
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook failed", event.type, e);
    return Response.json({ error: "handler failed" }, { status: 500 }); // Stripe retries
  }
  return Response.json({ received: true });
}

async function recordPayment(db: ReturnType<typeof adminClient>, s: Session) {
  const md = s.metadata ?? {};
  const { data: inv } = await db.from("invoices").select("id, org_id, number, job_id").eq("id", md.invoice_id).eq("org_id", md.org_id).maybeSingle();
  if (!inv) throw new Error(`invoice ${md.invoice_id} not found for org ${md.org_id}`);
  const applied = Number(md.applied_amount);
  const amount = Number.isFinite(applied) && applied > 0 ? Math.min(applied, (s.amount_total ?? applied * 100) / 100) : (s.amount_total ?? 0) / 100;
  if (!(amount > 0)) return;
  const ach = (s.payment_method_types ?? []).includes("us_bank_account");
  const { data: inserted, error } = await db
    .from("payments")
    .upsert(
      {
        org_id: inv.org_id, invoice_id: inv.id, amount, method: "online", paid_on: new Date().toISOString().slice(0, 10),
        reference: ach ? "Stripe bank transfer" : "Stripe card", fee_amount: Number(md.fee_amount) || 0,
        provider: "stripe", provider_ref: s.payment_intent, provider_session: s.id,
      },
      { onConflict: "provider_ref", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  if (inserted?.length) {
    await notifyUser(db, { orgId: inv.org_id, kind: "payment_received", title: `Online payment: $${amount.toFixed(2)} on invoice #${inv.number}`, url: `/app/invoices/${inv.id}` });
  }
}
