import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, money } from "@/lib/format";
import { subscriptionBillingConfigured } from "@/lib/stripe";
import { cancelSubscription, reactivateSubscription, startSubscriptionCheckout } from "./actions";
import { EXPORTS, PLAN } from "./plan";

export const metadata: Metadata = { title: "Plan & billing" };

export default async function BillingPage({ searchParams }: PageProps<"/app/settings/billing">) {
  const { org, isAdmin } = await requireOrg();
  if (!isAdmin) return <Empty title="Only owners and admins can see billing." />;
  const sp = await searchParams;
  const o = org as typeof org & { stripe_subscription_id?: string | null };
  const cancelled = org.subscription_status === "cancelled";
  const billingReady = subscriptionBillingConfigured();

  return (
    <div className="space-y-6">
      {sp.checkout === "done" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Thanks! Your card is on file. It can take a minute for the status below to update.</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Your plan" actions={<Badge tone={cancelled ? "red" : org.subscription_status === "trialing" ? "amber" : "green"}>{cancelled ? "Cancelled" : org.subscription_status === "trialing" ? "Trial" : "Active"}</Badge>}>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-semibold tracking-tight" data-plan-price>{money(PLAN.priceMonthly)}</p>
            <p className="text-sm text-slate-500">per month, flat — for your whole company</p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {PLAN.included.map((i) => (
              <li key={i} className="flex gap-2"><span aria-hidden className="text-green-600">✓</span>{i}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Optional pass-through costs are shown before you use them: card processing on payments you collect, and text messages if you connect your own Twilio number.</p>
        </Card>

        <Card title="Status">
          {cancelled ? (
            <div className="space-y-3 text-sm" data-billing-status="cancelled">
              <p className="text-slate-700">Your subscription is cancelled{org.cancel_at ? <> and ends on <b>{date(org.cancel_at)}</b></> : ""}. You won&apos;t be charged again.</p>
              <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
                <p className="font-medium text-slate-800">What happens to your data</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Until then, everything works as normal, including your web lead form.</li>
                  <li>After that date, new web leads and instant quotes stop coming in.</li>
                  <li>You can still sign in and export everything below. Nothing is deleted unless you ask us to.</li>
                </ul>
              </div>
              <ActionForm action={reactivateSubscription}><SubmitButton>Reactivate subscription</SubmitButton></ActionForm>
            </div>
          ) : (
            <div className="space-y-3 text-sm" data-billing-status="active">
              <p className="text-slate-700">Month-to-month. {o.stripe_subscription_id ? "Billed to the card on file." : billingReady ? "Add a card to keep going after your trial." : "Card billing isn't set up on this server yet."}</p>
              {!o.stripe_subscription_id && (
                billingReady
                  ? <ActionForm action={startSubscriptionCheckout}><SubmitButton>Add a card</SubmitButton></ActionForm>
                  : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Billing not configured: set STRIPE_SECRET_KEY and STRIPE_PRICE_ID to take card payments for the plan.</p>
              )}
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-slate-600">Cancel any time. No calls, no forms — it ends 30 days from now (the end of your billing period) and you can export everything.</p>
                <ActionForm action={cancelSubscription}>
                  <SubmitButton variant="danger" confirm="Cancel your Ridge & Beam subscription? Everything keeps working until the end of the billing period.">Cancel subscription</SubmitButton>
                </ActionForm>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Export your data">
        <p className="mb-3 text-sm text-slate-600">Download a spreadsheet (CSV) of each. Opens in Excel, Google Sheets or Numbers.</p>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <a key={e.key} href={`/api/export/${e.key}`} download className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
              {e.label}.csv
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
