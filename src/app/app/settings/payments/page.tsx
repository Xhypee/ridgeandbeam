import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { getAccount, StripeError, stripeConfigured } from "@/lib/stripe";
import { connectStripe, disconnectStripe, savePaymentOptions } from "./actions";
import { FinancingEditor, ScheduleEditor } from "./editors";

export const metadata: Metadata = { title: "Payments & financing" };

type PayOrg = { ach_enabled?: boolean; stripe_charges_enabled?: boolean };

export default async function PaymentsSettings({ searchParams }: PageProps<"/app/settings/payments">) {
  const { org, isAdmin, supabase } = await requireOrg();
  const sp = await searchParams;
  const o = org as typeof org & PayOrg;
  const configured = stripeConfigured();
  let notice: string | undefined;
  let ready = Boolean(o.stripe_charges_enabled);
  if (isAdmin && sp.stripe === "return" && configured && org.stripe_account_id) {
    // Back from Stripe onboarding: record whether the account can take charges.
    try {
      const acct = await getAccount(org.stripe_account_id);
      ready = acct.charges_enabled;
      await supabase.from("organizations").update({ stripe_charges_enabled: ready }).eq("id", org.id);
      notice = ready ? "Stripe is ready to take payments." : "Stripe still needs a few details before you can take payments.";
    } catch (e) {
      notice = e instanceof StripeError ? e.message : "Couldn't reach Stripe.";
    }
  }
  const status = !configured ? "not_configured" : !org.stripe_account_id ? "not_connected" : ready ? "ready" : "incomplete";

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">{notice}</p>}
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card
          title="Online payments (Stripe)"
          actions={<Badge tone={status === "ready" ? "green" : status === "incomplete" ? "amber" : "slate"}>{{ not_configured: "Not configured", not_connected: "Not connected", incomplete: "Finish setup", ready: "Taking payments" }[status]}</Badge>}
        >
          <p className="text-sm text-slate-600">Homeowners pay invoices by card or bank transfer (ACH) from the invoice link. Money goes straight to your bank account through Stripe.</p>
          {status === "not_configured" ? (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Online payments aren&apos;t configured on this server (STRIPE_SECRET_KEY with Connect enabled, STRIPE_WEBHOOK_SECRET). Invoices show check and bank transfer instructions instead.</p>
          ) : isAdmin ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionForm action={connectStripe}><SubmitButton>{status === "not_connected" ? "Connect Stripe" : status === "incomplete" ? "Finish Stripe setup" : "Open Stripe setup"}</SubmitButton></ActionForm>
              {org.stripe_account_id && <ActionForm action={disconnectStripe}><SubmitButton variant="ghost" confirm="Stop taking online payments?">Disconnect</SubmitButton></ActionForm>}
            </div>
          ) : null}

          <ActionForm action={savePaymentOptions} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Card processing fee (%)" hint="Stripe's standard US rate is 2.9% + 30¢. Shown to the homeowner before they pay.">
              <Input name="card_fee_pct" type="number" min={0} max={10} step="0.01" defaultValue={org.card_fee_pct} disabled={!isAdmin} className="max-w-32" />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="pass_card_fee" defaultChecked={org.pass_card_fee} disabled={!isAdmin} className="mt-0.5 h-5 w-5 accent-brand-500" />
              <span>Pass the card fee to the customer<span className="block text-xs text-slate-500">Added as its own line at checkout. Check your state&apos;s surcharge rules; bank transfer stays fee-free for the homeowner.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="ach_enabled" defaultChecked={o.ach_enabled ?? true} disabled={!isAdmin} className="mt-0.5 h-5 w-5 accent-brand-500" />
              <span>Offer bank transfer (ACH)<span className="block text-xs text-slate-500">0.8%, capped at $5 — much cheaper than cards on a roof-sized invoice.</span></span>
            </label>
            {isAdmin && <SubmitButton variant="secondary">Save payment options</SubmitButton>}
          </ActionForm>
        </Card>

        <Card title="Payment schedule">
          <p className="mb-3 text-sm text-slate-600">Milestone invoices are created from these percentages of the accepted estimate (Billing tab on each job). Check your state&apos;s deposit limits.</p>
          <ScheduleEditor initial={org.payment_schedule} disabled={!isAdmin} />
        </Card>
      </div>

      <Card title="Financing">
        <p className="mb-3 text-sm text-slate-600">Homeowners see a monthly-payment example and your lenders&apos; prequalification links on estimates and invoices. Dealer fees you record on a job feed its margin.</p>
        <FinancingEditor initial={org.financing} disabled={!isAdmin} />
      </Card>
    </div>
  );
}
