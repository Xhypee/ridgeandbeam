import "server-only";
import { adminClient } from "@/lib/admin";
import { normalizePhone, notifyUser } from "@/lib/notify";

export type InboundResult =
  | { matched: false }
  | { matched: true; orgId: string; customerId: string; jobId: string | null; notifiedUserId: string | null };

/**
 * X3 inbound homeowner replies. Called by the SMS webhook (builder E's /api/sms/inbound route).
 * Matches the sender to a customer by phone across all orgs (preferring the org that texted them most
 * recently), logs an inbound `messages` row, adds a job note, and notifies the job's assigned user
 * (or the whole org when nobody is assigned). Uses the service role: call only from trusted server code.
 */
export async function recordInboundMessage(fromPhone: string, body: string): Promise<InboundResult> {
  const db = adminClient();
  const text = (body ?? "").toString().slice(0, 4000);
  const from = normalizePhone(fromPhone) ?? fromPhone;
  const { data, error } = await db.rpc("match_customer_phone", { p_phone: fromPhone });
  if (error) throw new Error(error.message);
  const m = (Array.isArray(data) ? data[0] : data) as
    | { org_id: string; customer_id: string; job_id: string | null; assigned_to: string | null; customer_name: string; job_title: string | null }
    | undefined;
  if (!m) return { matched: false };

  await db.from("messages").insert({
    org_id: m.org_id, job_id: m.job_id, customer_id: m.customer_id, direction: "inbound", channel: "sms",
    from_address: from, to_address: process.env.TWILIO_FROM_NUMBER ?? null, body: text || "(empty message)", status: "received",
  });
  if (m.job_id) {
    await db.from("job_notes").insert({ org_id: m.org_id, job_id: m.job_id, body: `Text from ${m.customer_name}: ${text || "(empty message)"}`, author_name: `${m.customer_name} (SMS)` });
  }
  await notifyUser(db, {
    orgId: m.org_id, userId: m.assigned_to, kind: "sms_reply",
    title: `Text from ${m.customer_name}`, body: text.slice(0, 200),
    url: m.job_id ? `/app/jobs/${m.job_id}` : `/app/customers/${m.customer_id}`,
  });
  return { matched: true, orgId: m.org_id, customerId: m.customer_id, jobId: m.job_id, notifiedUserId: m.assigned_to };
}
