// Daily (vercel.json cron, ~7 am in Queensland): payment plans.
//  1. Dated payments (instalments) are issued 3 days before they're due.
//  2. Customers get the invoice when it's issued and a reminder on the due date (if the job has reminders on).
// Vercel calls this with "Authorization: Bearer $CRON_SECRET"; anything else is refused.
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/admin";
import { asAuState, AU_STATE_TZ } from "@/lib/au";
import { calendarDate } from "@/lib/au-business-days";
import { addDays } from "@/lib/pay-plan";
import { sendPartMessage } from "@/lib/pay-plan-notify";
import { effectiveMethods } from "@/lib/pay-plan-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = {
  id: string; org_id: string; job_id: string; status: string; milestone_label: string | null; milestone_trigger: string | null; due_date: string; public_token: string; last_reminder_on: string | null;
  invoice_totals: { total: number; balance: number } | { total: number; balance: number }[] | null;
  jobs: {
    state: string | null; public_token: string; pay_methods: string[]; pay_reminders: boolean; customer_id: string;
    customers: { name: string; email: string | null; phone: string | null; state: string | null } | null;
    organizations: { name: string; phone: string | null; state: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean | null; subscription_status: string } | null;
  } | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = adminClient();
  const horizon = addDays(new Date().toISOString().slice(0, 10), 5);
  const { data, error } = await db.from("invoices")
    .select("id, org_id, job_id, status, milestone_label, milestone_trigger, due_date, public_token, last_reminder_on, invoice_totals(total, balance), jobs(state, public_token, pay_methods, pay_reminders, customer_id, customers(name, email, phone, state), organizations(name, phone, state, stripe_account_id, stripe_charges_enabled, subscription_status))")
    .in("kind", ["deposit", "progress", "final", "instalment"])
    .in("status", ["draft", "sent", "partial"])
    .not("due_date", "is", null)
    .lte("due_date", horizon)
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let issued = 0, reminded = 0;
  for (const r of (data ?? []) as unknown as Row[]) {
    const j = r.jobs;
    const o = j?.organizations;
    if (!j || !o || o.subscription_status === "cancelled") continue;
    const state = asAuState(j.state) ?? asAuState(j.customers?.state) ?? asAuState(o.state) ?? "NSW";
    const today = calendarDate(new Date(), AU_STATE_TZ[state]);
    const t = Array.isArray(r.invoice_totals) ? r.invoice_totals[0] : r.invoice_totals;
    const issueNow = r.status === "draft" && r.milestone_trigger === "date" && r.due_date <= addDays(today, 3);
    // Only dated parts are issued automatically; milestones wait for the office ("Send now").
    if (r.status === "draft" && !issueNow) continue;
    const dueToday = r.status !== "draft" && r.due_date === today && Number(t?.balance ?? 0) > 0 && r.last_reminder_on !== today;
    if (issueNow) {
      await db.from("invoices").update({ status: "sent", issue_date: today, last_reminder_on: j.pay_reminders ? today : r.last_reminder_on }).eq("id", r.id).eq("status", "draft");
      issued++;
    } else if (!dueToday) continue;
    if (!j.pay_reminders) continue;
    await sendPartMessage(db, {
      orgId: r.org_id, orgName: o.name, orgPhone: o.phone, jobId: r.job_id, customerId: j.customer_id,
      customerName: j.customers?.name ?? "", email: j.customers?.email ?? null, phone: j.customers?.phone ?? null,
      label: r.milestone_label ?? "Payment", amount: Number(issueNow ? t?.total : t?.balance) || 0, dueDate: r.due_date,
      invoiceToken: r.public_token, jobToken: j.public_token,
      methods: effectiveMethods(j.pay_methods ?? [], Boolean(o.stripe_account_id && o.stripe_charges_enabled)),
      when: issueNow ? (r.due_date === today ? "today" : "soon") : "today",
    });
    if (dueToday) await db.from("invoices").update({ last_reminder_on: today }).eq("id", r.id);
    reminded++;
  }
  return NextResponse.json({ ok: true, issued, reminded });
}
