"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/dal";
import { friendly, num, str } from "@/lib/form";
import { siteUrl } from "@/lib/format";
import { cleanAccount, cleanBsb, isValidAccount, isValidBsb, normalisePayId, type PayIdType } from "@/lib/payments-au";
import { createAccountLink, createExpressAccount, getAccount, StripeError, stripeConfigured } from "@/lib/stripe";
import type { ActionResult } from "@/components/action-form";

async function admin() {
  try { return await requireAdmin(); } catch (e) { return { error: (e as Error).message } as const; }
}
const done = (ok = "Saved.") => { revalidatePath("/app/settings/payments"); return { ok }; };

/** Bank transfer (BSB + account) and PayID details printed on every invoice. */
export async function saveBankDetails(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const name = str(fd, "bank_account_name");
  const bsbRaw = str(fd, "bank_bsb");
  const accRaw = str(fd, "bank_account_number");
  if ((bsbRaw || accRaw) && !(bsbRaw && accRaw)) return { error: "Enter both the BSB and the account number (or neither)." };
  if (bsbRaw && !isValidBsb(bsbRaw)) return { error: "A BSB is 6 digits, e.g. 062-000." };
  if (accRaw && !isValidAccount(accRaw)) return { error: "An account number is 5 to 10 digits." };
  if (bsbRaw && !name) return { error: "Enter the account name exactly as your bank shows it." };
  const payidType = (["email", "phone", "abn"].includes(String(fd.get("payid_type"))) ? String(fd.get("payid_type")) : "email") as PayIdType;
  const payidRaw = str(fd, "payid");
  const payid = payidRaw ? normalisePayId(payidType, payidRaw) : null;
  if (payidRaw && !payid) return { error: payidType === "email" ? "That PayID email doesn't look right." : payidType === "phone" ? "A PayID mobile is 04xx xxx xxx." : "A PayID ABN is 11 digits." };
  const { error } = await ctx.supabase.from("organizations").update({
    bank_account_name: name,
    bank_bsb: bsbRaw ? cleanBsb(bsbRaw) : null,
    bank_account_number: accRaw ? cleanAccount(accRaw) : null,
    payid,
    payid_type: payid ? payidType : null,
  }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done("Bank details saved. They appear on every invoice.");
}

/** Online payment options. There is deliberately no card-surcharge setting (RBA ban from 1 Oct 2026). */
export async function savePaymentOptions(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const fee = num(fd, "card_fee_pct", NaN);
  if (!(fee >= 0 && fee <= 10)) return { error: "Card cost should be between 0% and 10%." };
  const { error } = await ctx.supabase.from("organizations").update({
    card_fee_pct: fee, pass_card_fee: false, becs_enabled: fd.get("becs_enabled") === "on",
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
  acknowledged: z.boolean(),
  lenders: z.array(z.object({
    provider: z.enum(["brighte", "humm", "zip", "plenti", "other"]),
    name: z.string().trim().min(1, "Provider name is required").max(80),
    url: z.string().trim().url("Each link must be a full https:// address").refine((u) => u.startsWith("https://"), "Each link must start with https://"),
  })).max(6),
});

export async function saveFinancing(payload: unknown): Promise<ActionResult> {
  const ctx = await admin();
  if ("error" in ctx) return { error: ctx.error };
  const parsed = financingSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the finance settings." };
  const f = parsed.data;
  if (f.enabled && f.lenders.length === 0) return { error: "Add at least one finance provider link." };
  if (f.enabled && !f.acknowledged) return { error: "Confirm the credit licensing note before showing finance to homeowners." };
  const { data: cur } = await ctx.supabase.from("organizations").select("financing").eq("id", ctx.org.id).single();
  const { error } = await ctx.supabase.from("organizations").update({ financing: { ...((cur?.financing as Record<string, unknown>) ?? {}), ...f } }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  return done("Finance links saved.");
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
  return done("Stripe disconnected. Invoices show bank transfer and PayID details only.");
}
