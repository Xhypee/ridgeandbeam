import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outbound customer messaging. Providers are optional:
 *  - SMS:   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *  - Email: RESEND_API_KEY, EMAIL_FROM (e.g. "Ridge & Beam <noreply@yourdomain.com>")
 * Every attempt is logged to `messages`; without a provider the row is stored with
 * status "not_configured" so the office still sees what would have been sent.
 */

export const smsConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

type Base = { orgId: string; jobId?: string | null; customerId?: string | null };

export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 6 ? `+${digits}` : null;
}

export async function sendSms(db: SupabaseClient, m: Base & { to: string | null | undefined; body: string }) {
  const to = normalizePhone(m.to);
  let status = "not_configured";
  let providerRef: string | null = null;
  let error: string | null = null;
  if (!to) {
    status = "failed";
    error = "No valid phone number";
  } else if (smsConfigured()) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: m.body }),
      });
      const json = (await res.json()) as { sid?: string; message?: string };
      if (res.ok) { status = "sent"; providerRef = json.sid ?? null; } else { status = "failed"; error = json.message ?? `HTTP ${res.status}`; }
    } catch (e) {
      status = "failed";
      error = (e as Error).message;
    }
  }
  await db.from("messages").insert({
    org_id: m.orgId, job_id: m.jobId ?? null, customer_id: m.customerId ?? null,
    direction: "outbound", channel: "sms", to_address: to ?? m.to ?? null, from_address: process.env.TWILIO_FROM_NUMBER ?? null,
    body: m.body, status, provider_ref: providerRef, error,
  });
  return { status, error };
}

export async function sendEmail(db: SupabaseClient, m: Base & { to: string | null | undefined; subject: string; html: string; text?: string }) {
  let status = "not_configured";
  let providerRef: string | null = null;
  let error: string | null = null;
  if (!m.to) {
    status = "failed";
    error = "No email address";
  } else if (emailConfigured()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      });
      const json = (await res.json()) as { id?: string; message?: string };
      if (res.ok) { status = "sent"; providerRef = json.id ?? null; } else { status = "failed"; error = json.message ?? `HTTP ${res.status}`; }
    } catch (e) {
      status = "failed";
      error = (e as Error).message;
    }
  }
  await db.from("messages").insert({
    org_id: m.orgId, job_id: m.jobId ?? null, customer_id: m.customerId ?? null,
    direction: "outbound", channel: "email", to_address: m.to ?? null, from_address: process.env.EMAIL_FROM ?? null,
    subject: m.subject, body: m.text ?? m.html.replace(/<[^>]+>/g, " "), status, provider_ref: providerRef, error,
  });
  return { status, error };
}

/** In-app notification for one user (or the whole org when userId is null). */
export async function notifyUser(db: SupabaseClient, n: { orgId: string; userId?: string | null; kind: string; title: string; body?: string; url?: string }) {
  await db.from("notifications").insert({ org_id: n.orgId, user_id: n.userId ?? null, kind: n.kind, title: n.title, body: n.body ?? null, url: n.url ?? null });
}
