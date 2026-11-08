import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, sendSms } from "./notify";
import { aud, type PayMethod } from "./pay-plan";

/** Made-up addresses (demo data, tests) are never emailed: they bounce and hurt the sending domain. */
export const isRealEmail = (e: string | null | undefined): e is string => Boolean(e && /@/.test(e) && !/@(example\.(com|org|net)|[^@]*\.(test|invalid|example|localhost))$/i.test(e.trim()));

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ridgeandbeam.com").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type PartMessage = {
  orgId: string; orgName: string; orgPhone: string | null; jobId: string; customerId: string | null;
  customerName: string; email: string | null; phone: string | null;
  label: string; amount: number; dueDate: string | null; invoiceToken: string; jobToken: string; methods: PayMethod[];
  /** "due" = new invoice, "soon" = reminder 3 days out, "today" = due today. */
  when: "due" | "soon" | "today";
  /** Optional: why it's due, in the customer's words ("Your materials were delivered…"), and the stage line ("Materials delivered · 30% of $36,172"). */
  reason?: string; detail?: string;
  /** Optional: what's been paid and what's still to come, shown under the amount. */
  footnote?: string;
};

/** "Pay by card, PayID or bank transfer" for the ways this job takes. */
export function waysToPay(methods: PayMethod[]): string {
  const w = [methods.includes("card") && "card", methods.includes("bank") && "PayID / bank transfer", methods.includes("cash") && "cash"].filter(Boolean) as string[];
  if (!w.length) return "Payment details";
  return `Pay by ${w.length === 1 ? w[0] : `${w.slice(0, -1).join(", ")} or ${w.at(-1)}`}`;
}

function fmtDate(iso: string | null) {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null;
}

/** The message for one payment: subject, branded email and text. Used to send and to preview. */
export function partMessage(m: PartMessage) {
  const first = m.customerName.trim().split(/\s+/)[0] || "there";
  const pay = `${site()}/i/${m.invoiceToken}`;
  const plan = `${site()}/p/${m.jobToken}`;
  const due = fmtDate(m.dueDate);
  const ways = waysToPay(m.methods);
  const lead = m.reason ? m.reason
    : m.when === "soon" ? `A reminder that your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is due ${due ?? "soon"}.`
    : m.when === "today" ? `Your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is due today.`
    : `Your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is ready${due ? `, due ${due}` : ""}.`;
  const sms = `Hi ${first}, ${lead.charAt(0).toLowerCase()}${lead.slice(1)}${m.reason ? ` ${aud(m.amount)}.` : ""} ${ways}: ${pay} - ${m.orgName}`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef0ea;padding:24px 12px;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#13221a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e3e6df">
<div style="background:#1f5f3f;color:#fff;padding:16px 22px;font-weight:700;font-size:17px">${esc(m.orgName)}</div>
<div style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 16px">${esc(lead)}</p>
<div style="background:#fbfaf5;border:1px solid #e3e6df;border-radius:14px;padding:14px 16px;margin:0 0 16px">
<div style="font-size:12px;color:#64748b">${esc(m.detail ?? m.label)}${due ? ` · due ${esc(due)}` : ""}</div>
<div style="font-size:28px;font-weight:700;margin-top:4px">${esc(aud(m.amount))}</div>
${m.footnote ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${esc(m.footnote)}</div>` : ""}
</div>
<p style="margin:0 0 16px"><a href="${pay}" style="display:block;text-align:center;background:#1f5f3f;color:#fff;padding:13px 18px;border-radius:12px;text-decoration:none;font-weight:600">Pay ${esc(aud(m.amount))}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#475569">${esc(ways)} on that page. Your whole payment plan: <a href="${plan}" style="color:#1f5f3f">${plan}</a></p>
<p style="margin:0">Thanks,<br>${esc(m.orgName)}${m.orgPhone ? `<br>${esc(m.orgPhone)}` : ""}</p>
</div></div></body></html>`;
  const subject = m.reason ? `Next payment for your roof · ${aud(m.amount)} · ${m.orgName}` : `${m.label}: ${aud(m.amount)}${due ? ` due ${due}` : ""} · ${m.orgName}`;
  return { subject, html, sms, pay };
}

/** Email (and text, once Twilio is set up) the customer a payment from their plan. Every attempt is logged in messages. */
export async function sendPartMessage(db: SupabaseClient, m: PartMessage) {
  const { subject, html, sms } = partMessage(m);
  const base = { orgId: m.orgId, jobId: m.jobId, customerId: m.customerId };
  const results = await Promise.all([
    isRealEmail(m.email) ? sendEmail(db, { ...base, to: m.email, subject, html, text: sms, fromName: m.orgName }) : null,
    m.phone ? sendSms(db, { ...base, to: m.phone, body: sms }) : null,
  ]);
  return results.filter(Boolean).map((r) => r!.status);
}
