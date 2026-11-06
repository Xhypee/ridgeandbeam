"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { siteUrl } from "@/lib/format";
import { createSubscriptionCheckout, setSubscriptionCancelAtPeriodEnd, StripeError, stripeConfigured, subscriptionBillingConfigured } from "@/lib/stripe";
import type { ActionResult } from "@/components/action-form";

type Org = { id: string; email: string | null; stripe_subscription_id?: string | null; stripe_customer_id?: string | null };

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}

export async function cancelSubscription(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const org = ctx.org as unknown as Org;
  let cancelAt = new Date(Date.now() + 30 * 86400000);
  if (org.stripe_subscription_id && stripeConfigured()) {
    try {
      const sub = await setSubscriptionCancelAtPeriodEnd(org.stripe_subscription_id, true);
      if (sub.cancel_at) cancelAt = new Date(sub.cancel_at * 1000);
      else if (sub.current_period_end) cancelAt = new Date(sub.current_period_end * 1000);
    } catch (e) {
      return { error: e instanceof StripeError ? e.message : "Couldn't reach billing. Try again." };
    }
  }
  const { error } = await ctx.supabase.from("organizations").update({ subscription_status: "cancelled", cancel_at: cancelAt.toISOString() }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: `Cancelled. Everything keeps working until ${cancelAt.toLocaleDateString("en-US", { dateStyle: "long" })}. No further charges.` };
}

export async function reactivateSubscription(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const org = ctx.org as unknown as Org;
  if (org.stripe_subscription_id && stripeConfigured()) {
    try { await setSubscriptionCancelAtPeriodEnd(org.stripe_subscription_id, false); } catch (e) {
      return { error: e instanceof StripeError ? e.message : "Couldn't reach billing. Try again." };
    }
  }
  const { error } = await ctx.supabase.from("organizations").update({ subscription_status: "active", cancel_at: null }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Welcome back — your subscription is active again." };
}

export async function startSubscriptionCheckout(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  if (!subscriptionBillingConfigured()) return { error: "Card billing isn't configured on this server yet (STRIPE_SECRET_KEY and STRIPE_PRICE_ID)." };
  const org = ctx.org as unknown as Org;
  let url: string;
  try {
    const s = await createSubscriptionCheckout({
      orgId: org.id, email: org.email ?? ctx.user.email, customerId: org.stripe_customer_id ?? null,
      successUrl: `${siteUrl()}/app/settings/billing?checkout=done`, cancelUrl: `${siteUrl()}/app/settings/billing`,
    });
    url = s.url;
  } catch (e) {
    return { error: e instanceof StripeError ? e.message : "Couldn't start checkout." };
  }
  redirect(url);
}
