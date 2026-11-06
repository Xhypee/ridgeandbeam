"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/admin";
import { siteUrl } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { achFee, cardFee, createInvoiceCheckout, StripeError, stripeConfigured } from "@/lib/stripe";
import type { PayInfo } from "./pay-info";

export async function payInvoice(_: { error?: string } | undefined, fd: FormData): Promise<{ error?: string } | undefined> {
  const token = String(fd.get("token") ?? "");
  const method = fd.get("method") === "ach" ? "ach" : "card";
  const { data } = await anonClient().rpc("get_public_invoice_pay", { p_token: token });
  const info = data as PayInfo | null;
  if (!info) return { error: "This invoice link isn't valid anymore." };
  const balance = Number(info.balance);
  if (!(balance > 0) || info.status === "paid") return { error: "This invoice is already paid." };
  if (!stripeConfigured() || !info.online_ready) return { error: "Online payment isn't available for this invoice. Please pay by check or bank transfer." };
  if (method === "ach" && !info.ach_enabled) return { error: "Bank transfer isn't offered for this invoice." };

  // Service role, scoped to the org/invoice the token resolved to.
  const db = adminClient();
  const { data: row } = await db.from("invoices").select("id, org_id, organizations(stripe_account_id), jobs(customers(email))").eq("id", info.invoice_id).single();
  const accountId = (row?.organizations as unknown as { stripe_account_id: string | null } | null)?.stripe_account_id;
  if (!row || !accountId) return { error: "Online payment isn't available for this invoice." };
  const email = (row.jobs as unknown as { customers: { email: string | null } } | null)?.customers?.email ?? null;

  const fee = method === "card" ? cardFee(balance, Number(info.card_fee_pct)) : achFee(balance);
  const passFee = method === "card" && info.pass_card_fee;
  let url: string;
  try {
    const s = await createInvoiceCheckout({
      orgId: row.org_id, invoiceId: row.id, invoiceNumber: info.number, accountId, method, amount: balance, fee, passFee,
      successUrl: `${siteUrl()}/i/${token}?paid=1`, cancelUrl: `${siteUrl()}/i/${token}`, customerEmail: email,
    });
    url = s.url;
  } catch (e) {
    return { error: e instanceof StripeError ? e.message : "Couldn't start the payment. Please try again." };
  }
  redirect(url);
}
