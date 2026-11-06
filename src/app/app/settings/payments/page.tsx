import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { KeepForm } from "@/app/app/jobs/[id]/claim/_components/keep-form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { formatBsb, SURCHARGE_NOTE } from "@/lib/payments-au";
import { getAccount, StripeError, stripeConfigured } from "@/lib/stripe";
import { connectStripe, disconnectStripe, saveBankDetails, savePaymentOptions } from "./actions";
import { FinancingEditor, ScheduleEditor } from "./editors";

export const metadata: Metadata = { title: "Payments & financing" };

type PayOrg = {
  stripe_charges_enabled?: boolean;
  bank_account_name?: string | null;
  bank_bsb?: string | null;
  bank_account_number?: string | null;
  payid?: string | null;
  payid_type?: string | null;
  becs_enabled?: boolean;
};

export default async function PaymentsSettings({ searchParams }: PageProps<"/app/settings/payments">) {
  const { org, isAdmin, supabase } = await requireOrg();
  const sp = await searchParams;
  const o = org as typeof org & PayOrg;
  const configured = stripeConfigured();
  let notice: string | undefined;
  let ready = Boolean(o.stripe_charges_enabled);
  if (isAdmin && sp.stripe === "return" && configured && org.stripe_account_id) {
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
  const financing = (org.financing ?? {}) as { enabled?: boolean; acknowledged?: boolean; lenders?: { provider?: "brighte" | "humm" | "zip" | "plenti" | "other"; name?: string; url?: string }[] };

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">{notice}</p>}
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Bank transfer & PayID" actions={<Badge tone={o.bank_bsb || o.payid ? "green" : "amber"}>{o.bank_bsb || o.payid ? "On invoices" : "Not set up"}</Badge>}>
          <p className="mb-3 text-sm text-slate-600">Printed on every invoice with the invoice number as the payment reference. Free for you and the homeowner.</p>
          <KeepForm action={saveBankDetails} className="space-y-3">
            <Field label="Account name"><Input name="bank_account_name" defaultValue={o.bank_account_name ?? ""} disabled={!isAdmin} placeholder="Your business name as the bank shows it" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="BSB"><Input name="bank_bsb" defaultValue={o.bank_bsb ? formatBsb(o.bank_bsb) : ""} disabled={!isAdmin} inputMode="numeric" placeholder="062-000" /></Field>
              <Field label="Account number"><Input name="bank_account_number" defaultValue={o.bank_account_number ?? ""} disabled={!isAdmin} inputMode="numeric" /></Field>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="PayID type">
                <Select name="payid_type" defaultValue={o.payid_type ?? "email"} disabled={!isAdmin}>
                  <option value="email">Email</option><option value="phone">Mobile</option><option value="abn">ABN</option>
                </Select>
              </Field>
              <Field label="PayID (optional)"><Input name="payid" defaultValue={o.payid ?? ""} disabled={!isAdmin} placeholder="accounts@yourroofing.com.au" /></Field>
            </div>
            {isAdmin && <SubmitButton className="min-h-11">Save bank details</SubmitButton>}
          </KeepForm>
        </Card>

        <Card
          title="Card & direct debit (Stripe, AUD)"
          actions={<Badge tone={status === "ready" ? "green" : status === "incomplete" ? "amber" : "slate"}>{{ not_configured: "Not configured", not_connected: "Not connected", incomplete: "Finish setup", ready: "Taking payments" }[status]}</Badge>}
        >
          <p className="text-sm text-slate-600">Homeowners can pay invoices by card or BECS Direct Debit from the invoice link. Money goes to your Australian bank account through Stripe.</p>
          {status === "not_configured" ? (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Online payments aren&apos;t configured on this server (STRIPE_SECRET_KEY with Connect enabled, STRIPE_WEBHOOK_SECRET). Invoices show your bank transfer and PayID details instead.</p>
          ) : isAdmin ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionForm action={connectStripe}><SubmitButton>{status === "not_connected" ? "Connect Stripe" : status === "incomplete" ? "Finish Stripe setup" : "Open Stripe setup"}</SubmitButton></ActionForm>
              {org.stripe_account_id && <ActionForm action={disconnectStripe}><SubmitButton variant="ghost" confirm="Stop taking online payments?">Disconnect</SubmitButton></ActionForm>}
            </div>
          ) : null}
          <ActionForm action={savePaymentOptions} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Your card processing cost (%)" hint="For your margins only — never added to the homeowner's bill.">
              <Input name="card_fee_pct" type="number" min={0} max={10} step="0.01" defaultValue={org.card_fee_pct} disabled={!isAdmin} className="max-w-32" />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="becs_enabled" defaultChecked={o.becs_enabled ?? false} disabled={!isAdmin} className="mt-0.5 h-5 w-5 accent-brand-500" />
              <span>Offer BECS Direct Debit<span className="block text-xs text-slate-500">Cheaper than cards on a roof-sized invoice; clears in a few business days.</span></span>
            </label>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="surcharge-note">Card surcharging: off. {SURCHARGE_NOTE}</p>
            {isAdmin && <SubmitButton variant="secondary">Save payment options</SubmitButton>}
          </ActionForm>
        </Card>
      </div>

      <Card title="Payment schedule">
        <p className="mb-3 text-sm text-slate-600">Milestone invoices are created from these percentages of the accepted quote (Billing tab on each job). Deposit limits and progress-payment rules differ by state; the quote shows your state&apos;s rules.</p>
        <ScheduleEditor initial={org.payment_schedule} disabled={!isAdmin} />
      </Card>

      <Card title="Finance providers">
        <p className="mb-3 text-sm text-slate-600">Show homeowners links to Australian payment-plan and loan providers you have a merchant or referral arrangement with.</p>
        <FinancingEditor initial={financing} disabled={!isAdmin} />
      </Card>
    </div>
  );
}
