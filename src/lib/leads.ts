import "server-only";
import { adminClient, hasAdminKey } from "@/lib/admin";
import { addBusinessDays, siteUrl } from "@/lib/format";
import { normalizePhone, sendEmail, sendSms, smsConfigured } from "@/lib/notify";
import { aiEnabled, draftText, RESPONDER_TASK } from "@/lib/ai";
import { asAuState, stateFromPostcode, type AuState } from "@/lib/au";

const STATE_NAMES: Record<string, AuState> = {
  "new south wales": "NSW", victoria: "VIC", queensland: "QLD", "western australia": "WA",
  "south australia": "SA", tasmania: "TAS", "australian capital territory": "ACT", "northern territory": "NT",
};

/** "NSW", "nsw", "New South Wales" or just a postcode → an Australian state code. */
export function leadState(state: string | undefined, postcode: string | undefined): AuState | undefined {
  const s = (state ?? "").trim();
  return asAuState(s) ?? STATE_NAMES[s.toLowerCase()] ?? stateFromPostcode(postcode) ?? undefined;
}


/** Lead sources a report can group by. Free text is allowed too (e.g. "hipages", "facebook"). */
export const LEAD_SOURCE_SUGGESTIONS = ["website", "instant_quote", "google_ads", "facebook", "angi", "referral", "door_knock", "storm", "repeat", "yard_sign", "other"];

export type LeadPayload = {
  name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string;
  message?: string; source?: string; source_detail?: string; title?: string; insurance?: boolean;
};

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
};

/**
 * Accepts the field names website forms, Zapier, Angi and Facebook lead ads typically send
 * and maps them to submit_public_lead's payload.
 */
export function normalizeLead(raw: Record<string, unknown>): LeadPayload {
  const first = pick(raw, "first_name", "firstName", "fname");
  const last = pick(raw, "last_name", "lastName", "lname");
  const name = pick(raw, "name", "full_name", "fullName", "customer_name", "contact_name") ?? [first, last].filter(Boolean).join(" ");
  const sourceRaw = pick(raw, "source", "lead_source", "utm_source");
  const KNOWN = ["referral", "website", "door_knock", "storm", "repeat", "ads", "other"];
  const src = sourceRaw?.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const ins = pick(raw, "insurance", "is_insurance", "insurance_claim");
  return {
    name: name.slice(0, 200),
    phone: pick(raw, "phone", "phone_number", "phoneNumber", "mobile", "tel")?.slice(0, 50),
    email: pick(raw, "email", "email_address", "emailAddress")?.slice(0, 200),
    address: pick(raw, "address", "street", "street_address", "address1", "address_line_1")?.slice(0, 300),
    city: pick(raw, "suburb", "city", "town", "locality")?.slice(0, 100),
    state: leadState(pick(raw, "state", "region", "province"), pick(raw, "postcode", "post_code", "zip", "zipcode", "zip_code", "postal_code")),
    zip: pick(raw, "postcode", "post_code", "zip", "zipcode", "zip_code", "postal_code")?.slice(0, 20),
    message: pick(raw, "message", "comments", "comment", "notes", "details", "description")?.slice(0, 4000),
    // customers.source enum gets the coarse bucket; jobs.lead_source keeps the detail
    source: src && KNOWN.includes(src) ? src : src ? (/(ad|google|facebook|fb|hipages|oneflare|serviceseeking|airtasker|angi)/.test(src) ? "ads" : "website") : "website",
    source_detail: (src ?? "website").slice(0, 100),
    title: pick(raw, "title", "service", "service_type")?.slice(0, 200),
    insurance: ins ? /^(1|true|yes|on|y)$/i.test(ins) : undefined,
  };
}

// --- naive in-memory rate limit (per server instance): 8 leads / 10 min per IP+key ---
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return arr.length > limit;
}

/** Next few inspection slots: business days, 9am / 1pm / 4pm, starting tomorrow. */
export function inspectionSlots(now = new Date(), count = 3) {
  const slots: string[] = [];
  let d = addBusinessDays(now, 1);
  const hours = [9, 13, 16];
  while (slots.length < count) {
    for (const h of hours) {
      if (slots.length >= count) break;
      const s = new Date(d); s.setHours(h, 0, 0, 0);
      slots.push(s.toLocaleString("en-AU", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    }
    d = addBusinessDays(d, 1);
  }
  return slots;
}

/**
 * After a lead is saved: text + email the assigned rep, then (optionally) have the AI instant
 * responder text the homeowner. Runs after the HTTP response; failures are logged, never thrown.
 */
export async function afterLeadCreated(jobId: string) {
  if (!hasAdminKey()) return;
  const db = adminClient();
  const { data: job } = await db
    .from("jobs")
    .select("id, org_id, title, site_address, assigned_to, lead_source, customers(id, name, phone, email, notes), organizations(name, phone, ai_responder_enabled)")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const c = job.customers as unknown as { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
  const org = job.organizations as unknown as { name: string; phone: string | null; ai_responder_enabled: boolean };
  const url = `${siteUrl()}/app/jobs/${job.id}`;

  if (job.assigned_to) {
    const { data: rep } = await db.from("memberships").select("full_name, email, phone").eq("org_id", job.org_id).eq("user_id", job.assigned_to).maybeSingle();
    if (rep) {
      const line = [c.name, c.phone, job.site_address].filter(Boolean).join(" · ");
      if (rep.phone) {
        await sendSms(db, { orgId: job.org_id, jobId: job.id, to: rep.phone, body: `New ${job.lead_source ?? "web"} lead — call now: ${line}. ${url}` });
      }
      if (rep.email) {
        const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
        await sendEmail(db, {
          orgId: job.org_id, jobId: job.id, to: rep.email,
          subject: `New lead: ${c.name} — call within 5 minutes`,
          text: `${c.name}\n${c.phone ?? ""}\n${c.email ?? ""}\n${job.site_address ?? ""}\n\n${c.notes ?? ""}\n\nOpen the lead: ${url}`,
          html: `<p><b>${esc(c.name)}</b><br>${esc(c.phone ?? "")}<br>${esc(c.email ?? "")}<br>${esc(job.site_address ?? "")}</p>${c.notes ? `<p>${esc(c.notes)}</p>` : ""}<p><a href="${url}">Open the lead</a> — leads called within 5 minutes book far more often.</p>`,
        });
      }
    }
  }

  // Optional AI instant responder: only with Claude + Twilio configured and a textable homeowner.
  if (!aiEnabled() || !smsConfigured() || !org.ai_responder_enabled || !normalizePhone(c.phone)) return;
  try {
    const firstName = c.name.split(/\s+/)[0];
    const body = await draftText({
      task: RESPONDER_TASK,
      maxTokens: 2000,
      content: `Company: ${org.name}${org.phone ? ` (phone ${org.phone})` : ""}\nHomeowner first name: ${firstName}\nTheir request: ${(c.notes ?? "roof inspection").slice(0, 600)}\nInspection times you can offer:\n- ${inspectionSlots().join("\n- ")}`,
    });
    const text = body.replace(/\s+/g, " ").slice(0, 320);
    const r = await sendSms(db, { orgId: job.org_id, jobId: job.id, customerId: c.id, to: c.phone, body: text });
    await db.from("job_notes").insert({ org_id: job.org_id, job_id: job.id, body: `Instant responder texted the homeowner (${r.status}):\n${text}`, author_name: "AI instant responder" });
  } catch (e) {
    await db.from("job_notes").insert({ org_id: job.org_id, job_id: job.id, body: `Instant responder skipped: ${(e as Error).message}`, author_name: "AI instant responder" });
  }
}
