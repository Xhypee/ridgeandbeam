"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/admin";
import { siteUrl } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { becsFee, cardFee, createInvoiceCheckout, StripeError, stripeConfigured } from "@/lib/stripe";
import type { PublicTaxInvoice } from "./pay-info";

/** Start Stripe Checkout (AUD) for the invoice balance: card, or BECS Direct Debit. Never adds a surcharge. */
export async function payInvoice(_: { error?: string } | undefined, fd: FormData): Promise<{ error?: string } | undefined> {
  const token = String(fd.get("token") ?? "");
  const method = fd.get("method") === "becs" ? "becs" : "card";
  const { data } = await anonClient().rpc("get_public_tax_invoice", { p_token: token });
  const info = data as PublicTaxInvoice | null;
  if (!info) return { error: "This invoice link isn't valid anymore." };
  const balance = Number(info.totals.balance);
  if (!(balance > 0) || info.status === "paid") return { error: "This invoice is already paid." };
  if (!stripeConfigured() || !info.pay.online_ready) return { error: "Online payment isn't available for this invoice. Please pay by bank transfer or PayID." };
  if (method === "becs" && !info.pay.becs_enabled) return { error: "Direct debit isn't offered for this invoice." };

  // Service role, scoped to the org/invoice the token resolved to.
  const db = adminClient();
  const { data: row } = await db.from("invoices").select("id, org_id, organizations(stripe_account_id), jobs(customers(email))").eq("id", info.id).single();
  const accountId = (row?.organizations as unknown as { stripe_account_id: string | null } | null)?.stripe_account_id;
  if (!row || !accountId) return { error: "Online payment isn't available for this invoice." };
  const email = (row.jobs as unknown as { customers: { email: string | null } } | null)?.customers?.email ?? null;

  const fee = method === "card" ? cardFee(balance, Number(info.pay.card_fee_pct)) : becsFee(balance);
  let url: string;
  try {
    const s = await createInvoiceCheckout({
      orgId: row.org_id, invoiceId: row.id, invoiceNumber: info.number, accountId, method, amount: balance, fee,
      successUrl: `${siteUrl()}/i/${token}?paid=1`, cancelUrl: `${siteUrl()}/i/${token}`, customerEmail: email,
    });
    url = s.url;
  } catch (e) {
    return { error: e instanceof StripeError ? e.message : "Couldn't start the payment. Please try again." };
  }
  redirect(url);
}
