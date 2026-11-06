"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/dal";
import { friendly, num } from "@/lib/form";
import { siteUrl } from "@/lib/format";
import { createAccountLink, createExpressAccount, getAccount, StripeError, stripeConfigured } from "@/lib/stripe";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}
const done = (ok = "Saved.") => { revalidatePath("/app/settings/payments"); return { ok }; };

export async function savePaymentOptions(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const fee = num(fd, "card_fee_pct", NaN);
  if (!(fee >= 0 && fee <= 10)) return { error: "Card fee should be between 0% and 10%." };
  const { error } = await ctx.supabase.from("organizations").update({
    card_fee_pct: fee, pass_card_fee: fd.get("pass_card_fee") === "on", ach_enabled: fd.get("ach_enabled") === "on",
  }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done();
}

const scheduleSchema = z
  .array(z.object({ label: z.string().trim().min(1, "Every milestone needs a name").max(60), pct: z.number().positive("Percent must be above 0").max(100), trigger: z.enum(["signed", "delivered", "completed"]) }))
  .min(1, "Add at least one milestone")
  .max(6, "Up to 6 milestones")
  .refine((rows) => Math.abs(rows.reduce((s, r) => s + r.pct, 0) - 100) < 0.001, "Percentages must add up to 100%");

export async function savePaymentSchedule(rows: unknown): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const parsed = scheduleSchema.safeParse(rows);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the schedule." };
  const { error } = await ctx.supabase.from("organizations").update({ payment_schedule: parsed.data }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done("Payment schedule saved.");
}

const financingSchema = z.object({
  enabled: z.boolean(),
  apr: z.number().min(0).max(40),
  term_months: z.number().int().min(6).max(300),
  lenders: z.array(z.object({
    name: z.string().trim().min(1, "Lender name is required").max(80),
    url: z.string().trim().url("Prequal link must be a full https:// URL").refine((u) => u.startsWith("https://"), "Prequal link must start with https://"),
    dealer_fee_pct: z.number().min(0).max(40),
  })).max(5),
});

export async function saveFinancing(payload: unknown): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const parsed = financingSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the financing settings." };
  if (parsed.data.enabled && parsed.data.lenders.length === 0) return { error: "Add at least one lender with a prequalification link." };
  const { error } = await ctx.supabase.from("organizations").update({ financing: parsed.data }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done("Financing saved.");
}

export async function connectStripe(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  if (!stripeConfigured()) return { error: "Online payments aren't configured on this server (STRIPE_SECRET_KEY)." };
  let url: string;
  try {
    let accountId = ctx.org.stripe_account_id;
    if (!accountId) {
      accountId = (await createExpressAccount({ id: ctx.org.id, email: ctx.org.email, name: ctx.org.name })).id;
      const { error } = await ctx.supabase.from("organizations").update({ stripe_account_id: accountId }).eq("id", ctx.org.id);
      if (error) return { error: friendly(error) };
    }
    const base = `${siteUrl()}/app/settings/payments`;
    url = (await createAccountLink(accountId, `${base}?stripe=return`, `${base}?stripe=refresh`)).url;
  } catch (e) {
    return { error: e instanceof StripeError ? e.message : "Couldn't reach Stripe. Try again." };
  }
  redirect(url);
}

/** After returning from Stripe onboarding: record whether the account can take charges. */
export async function refreshStripeStatus(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  if (!stripeConfigured() || !ctx.org.stripe_account_id) return { error: "Stripe isn't connected." };
  try {
    const acct = await getAccount(ctx.org.stripe_account_id);
    await ctx.supabase.from("organizations").update({ stripe_charges_enabled: acct.charges_enabled }).eq("id", ctx.org.id);
    return done(acct.charges_enabled ? "Stripe is ready to take payments." : "Stripe still needs a few details before you can take payments.");
  } catch (e) {
    return { error: e instanceof StripeError ? e.message : "Couldn't reach Stripe." };
  }
}

export async function disconnectStripe(): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.from("organizations").update({ stripe_account_id: null, stripe_charges_enabled: false }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done("Stripe disconnected. Invoices show check / bank transfer instructions again.");
}
