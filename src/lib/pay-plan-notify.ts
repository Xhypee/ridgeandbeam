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

/** Email (and text, once Twilio is set up) the customer a payment from their plan. Every attempt is logged in messages. */
export async function sendPartMessage(db: SupabaseClient, m: PartMessage) {
  const first = m.customerName.trim().split(/\s+/)[0] || "there";
  const pay = `${site()}/i/${m.invoiceToken}`;
  const plan = `${site()}/p/${m.jobToken}`;
  const due = fmtDate(m.dueDate);
  const ways = waysToPay(m.methods);
  const lead = m.when === "soon" ? `A reminder that your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is due ${due ?? "soon"}.`
    : m.when === "today" ? `Your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is due today.`
    : `Your ${m.label.toLowerCase()} payment of ${aud(m.amount)} is ready${due ? `, due ${due}` : ""}.`;
  const sms = `Hi ${first}, ${lead.charAt(0).toLowerCase()}${lead.slice(1)} ${ways}: ${pay} - ${m.orgName}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#13221a">
<p>Hi ${esc(first)},</p><p>${esc(lead)}</p>
<p><a href="${pay}" style="display:inline-block;background:#1f5f3f;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">View and pay ${esc(aud(m.amount))}</a></p>
<p>${esc(ways)} on that page. You can see your whole payment plan here: <a href="${plan}">${plan}</a></p>
<p>Thanks,<br>${esc(m.orgName)}${m.orgPhone ? `<br>${esc(m.orgPhone)}` : ""}</p></div>`;
  const base = { orgId: m.orgId, jobId: m.jobId, customerId: m.customerId };
  const results = await Promise.all([
    isRealEmail(m.email) ? sendEmail(db, { ...base, to: m.email, subject: `${m.label}: ${aud(m.amount)}${due ? ` due ${due}` : ""} · ${m.orgName}`, html, text: sms }) : null,
    m.phone ? sendSms(db, { ...base, to: m.phone, body: sms }) : null,
  ]);
  return results.filter(Boolean).map((r) => r!.status);
}
