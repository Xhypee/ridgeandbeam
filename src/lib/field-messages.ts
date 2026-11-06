import "server-only";
import { adminClient } from "@/lib/admin";
import { normalizePhone, notifyUser } from "@/lib/notify";

// ---------------------------------------------------------------------------
// MINIMAL PLACEHOLDER (builder E). Builder C owns src/lib/field-messages.ts; at merge the
// coordinator should keep C's full implementation and make sure it still exports
// `recordInboundMessage(fromPhone, body)` with this signature (used by /api/sms/inbound).
// ---------------------------------------------------------------------------

/** Log an inbound homeowner text: match the customer by phone, attach to their latest job, notify the company. */
export async function recordInboundMessage(fromPhone: string, body: string): Promise<{ matched: boolean; orgId?: string; jobId?: string | null }> {
  const from = normalizePhone(fromPhone);
  if (!from) return { matched: false };
  const db = adminClient();
  const last4 = from.slice(-4);
  const { data: candidates } = await db.from("customers").select("id, org_id, name, phone, created_at").ilike("phone", `%${last4}%`).order("created_at", { ascending: false }).limit(50);
  const customer = (candidates ?? []).find((c) => normalizePhone(c.phone) === from);
  if (!customer) return { matched: false };
  const { data: job } = await db.from("jobs").select("id").eq("customer_id", customer.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  await db.from("messages").insert({
    org_id: customer.org_id, job_id: job?.id ?? null, customer_id: customer.id,
    direction: "inbound", channel: "sms", from_address: from, to_address: process.env.TWILIO_FROM_NUMBER ?? null,
    body: body.slice(0, 4000), status: "received",
  });
  await notifyUser(db, {
    orgId: customer.org_id, kind: "inbound_sms", title: `Text from ${customer.name}`, body: body.slice(0, 140),
    url: job ? `/app/jobs/${job.id}` : `/app/customers/${customer.id}`,
  });
  return { matched: true, orgId: customer.org_id, jobId: job?.id ?? null };
}
