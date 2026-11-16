import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/admin";
import { siteUrl } from "@/lib/format";
import { attachmentsOf, bodyText, buildMime, emailOf, emailsOf, nameOf, newPart, toBase64Url, type MimeAttachment } from "@/lib/gmail-mime";

/**
 * Gmail: a company connects one Gmail (or Google Workspace) mailbox. Customer emails the app sends then go out
 * from that address and sit in its Sent folder, and every email in the mailbox (sent and received; not spam,
 * trash or chats) comes into the app's Inbox, threaded. Emails with a contact (customer, builder …) are also
 * linked to that contact and their latest job.
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (a Google Cloud OAuth "Web application" client with the Gmail API on);
 * register {site}/api/integrations/gmail/callback as an authorised redirect URI.
 * Tokens live ONLY in integration_secrets (service role); the mailbox address is integrations.external_name.
 */

export const gmailConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"].join(" ");
export const gmailRedirectUri = () => process.env.GOOGLE_REDIRECT_URI ?? `${siteUrl()}/api/integrations/gmail/callback`;

// --- OAuth state: signed "orgId.userId.timestamp" so the callback can't be forged ---
const sign = (s: string) => createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET ?? "").update(`gmail:${s}`).digest("hex").slice(0, 32);
export function makeState(orgId: string, userId: string) {
  const raw = `${orgId}.${userId}.${Date.now()}`;
  return `${raw}.${sign(raw)}`;
}
export function readState(state: string | null): { orgId: string; userId: string } | null {
  const parts = (state ?? "").split(".");
  if (parts.length !== 4) return null;
  const [orgId, userId, ts, sig] = parts;
  const expected = sign(`${orgId}.${userId}.${ts}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
  return { orgId, userId };
}
export function authorizeUrl(state: string, hint?: string | null) {
  const p = new URLSearchParams({ response_type: "code", client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: gmailRedirectUri(), scope: SCOPES, state, access_type: "offline", prompt: "consent", include_granted_scopes: "true", ...(hint ? { login_hint: hint } : {}) });
  return `${AUTH_URL}?${p}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Tokens & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new GmailAuthError(json.error === "invalid_grant" ? "Gmail sign-in expired or was removed. Reconnect Gmail." : `Gmail sign-in failed (${json.error_description ?? json.error ?? res.status}).`);
  return json;
}
class GmailAuthError extends Error {}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: gmailRedirectUri() });

/** Check the person ticked both Gmail boxes on Google's screen, and find which mailbox it is. */
export async function mailboxFor(t: Tokens): Promise<{ email: string; historyId: string }> {
  const granted = (t.scope ?? "").split(" ");
  if (!granted.includes("https://www.googleapis.com/auth/gmail.send") || !granted.includes("https://www.googleapis.com/auth/gmail.readonly")) {
    throw new Error("Google didn't give permission to read and send email. Connect again and tick both Gmail boxes.");
  }
  const res = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as { emailAddress?: string; historyId?: string; error?: { message?: string } };
  if (!res.ok || !json.emailAddress) throw new Error(res.status === 403 ? "The Gmail API isn't turned on for this Google Cloud project." : `Couldn't read the mailbox (${json.error?.message ?? res.status}).`);
  return { email: json.emailAddress.toLowerCase(), historyId: json.historyId ?? "" };
}

export type GmailSettings = { send_via_gmail?: boolean; connected_by?: string; history_id?: string };

export async function saveConnection(orgId: string, userId: string, mailbox: { email: string }, t: Tokens) {
  const db = adminClient();
  const { data: prev } = await db.from("integrations").select("id, settings").eq("org_id", orgId).eq("provider", "gmail").maybeSingle();
  const settings: GmailSettings = { send_via_gmail: true, ...((prev?.settings as GmailSettings) ?? {}), connected_by: userId };
  const { data: integ, error } = await db
    .from("integrations")
    .upsert({ org_id: orgId, provider: "gmail", status: "connected", external_id: mailbox.email, external_name: mailbox.email, connected_at: new Date().toISOString(), settings }, { onConflict: "org_id,provider" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: old } = await db.from("integration_secrets").select("refresh_token").eq("integration_id", integ.id).maybeSingle();
  await db.from("integration_secrets").upsert({ integration_id: integ.id, access_token: t.access_token, refresh_token: t.refresh_token ?? old?.refresh_token ?? null, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() });
}

export async function disconnect(orgId: string) {
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id").eq("org_id", orgId).eq("provider", "gmail").maybeSingle();
  if (!integ) return;
  const { data: sec } = await db.from("integration_secrets").select("refresh_token, access_token").eq("integration_id", integ.id).maybeSingle();
  const token = sec?.refresh_token ?? sec?.access_token;
  if (token) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  await db.from("integration_secrets").delete().eq("integration_id", integ.id);
  await db.from("integrations").update({ status: "disconnected" }).eq("id", integ.id);
}

// ---------------------------------------------------------------------------
// API client with token refresh (Google access tokens last an hour)
// ---------------------------------------------------------------------------
type Conn = { id: string; email: string; settings: GmailSettings; token: string };
/** The company's connected mailbox, with a fresh access token, or null when Gmail isn't connected or working. */
export async function gmailConnection(orgId: string): Promise<Conn | null> {
  if (!gmailConfigured()) return null;
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id, status, external_name, settings").eq("org_id", orgId).eq("provider", "gmail").maybeSingle();
  if (!integ || integ.status !== "connected" || !integ.external_name) return null;
  const { data: sec } = await db.from("integration_secrets").select("access_token, refresh_token, expires_at").eq("integration_id", integ.id).maybeSingle();
  if (!sec?.access_token) return null;
  let token = sec.access_token as string;
  if (!sec.expires_at || new Date(sec.expires_at).getTime() - Date.now() < 120_000) {
    if (!sec.refresh_token) { await markBroken(integ.id); return null; }
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: sec.refresh_token });
      token = t.access_token;
      await db.from("integration_secrets").update({ access_token: t.access_token, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}), expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq("integration_id", integ.id);
    } catch (e) {
      if (e instanceof GmailAuthError) await markBroken(integ.id);
      return null;
    }
  }
  return { id: integ.id, email: integ.external_name, settings: (integ.settings as GmailSettings) ?? {}, token };
}
const markBroken = (id: string) => adminClient().from("integrations").update({ status: "error" }).eq("id", id).then(() => undefined);

async function api<T>(c: Conn, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    if (res.status === 401) await markBroken(c.id);
    throw new Error(`Gmail: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

/** Send through the company's Gmail. Attachments given as a URL are fetched and attached. */
export async function sendViaGmail(c: Conn, e: { to: string; subject: string; html: string; text?: string; fromName?: string | null; replyTo?: string | null; threadId?: string | null; inReplyTo?: string | null; attachments?: { filename: string; content?: string; path?: string }[] }) {
  const attachments: MimeAttachment[] = [];
  for (const a of e.attachments ?? []) {
    if (a.content) attachments.push({ filename: a.filename, content: a.content });
    else if (a.path) {
      const r = await fetch(a.path, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Couldn't attach ${a.filename}.`);
      attachments.push({ filename: a.filename, content: Buffer.from(await r.arrayBuffer()).toString("base64") });
    }
  }
  const name = (e.fromName ?? "").replace(/[<>"\r\n]/g, "").trim();
  const raw = buildMime({ from: name ? `"${name}" <${c.email}>` : c.email, to: e.to, subject: e.subject, html: e.html, text: e.text, replyTo: null /* replies come back to this mailbox, so they show up in the app */, inReplyTo: e.inReplyTo, attachments });
  const sent = await api<{ id: string; threadId: string }>(c, "/messages/send", { method: "POST", body: JSON.stringify({ raw: toBase64Url(raw), ...(e.threadId ? { threadId: e.threadId } : {}) }) });
  const meta = await api<{ payload?: { headers?: { name: string; value: string }[] } }>(c, `/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`).catch(() => null);
  const rfc = meta?.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
  return { id: sent.id, threadId: sent.threadId, rfcMessageId: rfc };
}

// ---------------------------------------------------------------------------
// Reading: pull mail to and from the company's contacts into `messages`
// ---------------------------------------------------------------------------
type GMsg = { id: string; threadId: string; internalDate?: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[]; mimeType?: string; parts?: unknown[]; body?: { data?: string } } };

/** Fetch new mail since the last check (up to two weeks back the first time) and keep what involves a contact. */
export async function syncMailbox(orgId: string, opts: { days?: number; max?: number } = {}): Promise<{ added: number; error?: string }> {
  const c = await gmailConnection(orgId);
  if (!c) return { added: 0, error: "Gmail isn't connected." };
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("last_synced_at").eq("id", c.id).single();
  const since = integ?.last_synced_at ? Math.floor(new Date(integ.last_synced_at).getTime() / 1000) - 3600 : Math.floor(Date.now() / 1000) - (opts.days ?? 14) * 86400;
  const startedAt = new Date().toISOString();
  let added = 0;
  try {
    const ids: { id: string }[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ q: `after:${since} -in:chats -in:spam -in:trash`, maxResults: "100", ...(page ? { pageToken: page } : {}) });
      const r = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(c, `/messages?${q}`);
      ids.push(...(r.messages ?? []));
      page = r.nextPageToken;
    } while (page && ids.length < 5000);
    if (!ids.length) { await db.from("integrations").update({ last_synced_at: startedAt }).eq("id", c.id); return { added: 0 }; }

    const { data: have } = await db.from("messages").select("provider_ref").eq("org_id", orgId).in("provider_ref", ids.map((m) => `gmail:${m.id}`));
    const known = new Set((have ?? []).map((h) => h.provider_ref));
    // Oldest first, a batch per run; the rest come in on the next check (the "since" time only moves on once caught up).
    const pending = ids.filter((m) => !known.has(`gmail:${m.id}`)).reverse();
    const fresh = pending.slice(0, opts.max ?? 300);
    const caughtUp = pending.length <= fresh.length && !page;

    const msgs: GMsg[] = [];
    for (let i = 0; i < fresh.length; i += 10) {
      msgs.push(...(await Promise.all(fresh.slice(i, i + 10).map((m) => api<GMsg>(c, `/messages/${m.id}?format=full`).catch(() => null)))).filter((x): x is GMsg => Boolean(x)));
    }
    const head = (m: GMsg, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? null;
    const parsed = msgs.map((m) => {
      const from = emailOf(head(m, "from"));
      const outbound = from === c.email || (m.labelIds ?? []).includes("SENT");
      const others = outbound ? [...emailsOf(head(m, "to")), ...emailsOf(head(m, "cc"))] : from ? [from] : [];
      return { m, from, outbound, others: others.filter((x) => x !== c.email) };
    });
    const addrs = [...new Set(parsed.flatMap((p) => p.others))].filter((a) => /^[^\s,()]+@[^\s,()]+$/.test(a));

    // Contacts by email (case-insensitive), and each contact's latest open job.
    const byEmail = new Map<string, { id: string; name: string }>();
    for (let i = 0; i < addrs.length; i += 40) {
      const { data: custs } = await db.from("customers").select("id, name, email").eq("org_id", orgId).not("email", "is", null).or(addrs.slice(i, i + 40).map((a) => `email.ilike.${a}`).join(","));
      for (const cu of custs ?? []) if (cu.email) byEmail.set(cu.email.trim().toLowerCase(), { id: cu.id, name: cu.name });
    }
    const custIds = [...new Set([...byEmail.values()].map((x) => x.id))];
    const { data: jobs } = custIds.length ? await db.from("jobs").select("id, customer_id, stage, created_at").eq("org_id", orgId).in("customer_id", custIds).order("created_at", { ascending: false }) : { data: [] };
    const jobFor = new Map<string, string>();
    // Newest job that isn't lost; failing that, the newest job.
    for (const j of jobs ?? []) if (j.stage !== "lost" && !jobFor.has(j.customer_id)) jobFor.set(j.customer_id, j.id);
    for (const j of jobs ?? []) if (!jobFor.has(j.customer_id)) jobFor.set(j.customer_id, j.id);
    // A thread already linked to a job stays on that job.
    const threads = [...new Set(parsed.map((p) => p.m.threadId))];
    const { data: linked } = await db.from("messages").select("thread_ref, job_id, customer_id").eq("org_id", orgId).in("thread_ref", threads).not("job_id", "is", null);
    const threadJob = new Map((linked ?? []).map((l) => [l.thread_ref as string, { job: l.job_id as string, customer: l.customer_id as string | null }]));

    const rows = parsed.flatMap(({ m, from, outbound, others }) => {
      const cust = others.map((a) => byEmail.get(a)).find(Boolean) ?? null;
      const prior = threadJob.get(m.threadId);
      const text = bodyText((m.payload ?? {}) as never);
      const files = attachmentsOf((m.payload ?? {}) as never);
      const body = newPart(text) || (files.length ? "" : "(no text)");
      return [{
        org_id: orgId, job_id: prior?.job ?? (cust ? jobFor.get(cust.id) ?? null : null), customer_id: prior?.customer ?? cust?.id ?? null,
        direction: outbound ? "outbound" : "inbound", channel: "email",
        to_address: outbound ? others.join(", ") : c.email, from_address: outbound ? c.email : (nameOf(head(m, "from")) ? `${nameOf(head(m, "from"))} <${from}>` : from),
        subject: head(m, "subject"), body: body.slice(0, 20000), full_body: text.slice(0, 100000), attachments: files.length ? files.slice(0, 30) : null, status: outbound ? "sent" : "received",
        provider_ref: `gmail:${m.id}`, thread_ref: m.threadId, rfc_message_id: head(m, "message-id"),
        created_at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
      }];
    });
    if (rows.length) {
      // Insert together; if another check got there first (duplicate key), insert one by one and skip the duplicates.
      const sel = "id, direction, from_address, subject, customer_id";
      let { data: ins, error } = await db.from("messages").insert(rows).select(sel);
      if (error?.code === "23505") {
        ins = [];
        for (const r of rows) { const one = await db.from("messages").insert(r).select(sel).maybeSingle(); if (one.data) ins.push(one.data); }
        error = null;
      }
      if (error) throw new Error(error.message);
      added = ins?.length ?? 0;
      // A notification for emails from contacts (not for every newsletter).
      for (const n of (ins ?? []).filter((x) => x.direction === "inbound" && x.customer_id).slice(0, 10)) {
        await db.from("notifications").insert({ org_id: orgId, user_id: null, kind: "email_received", title: `Email from ${String(n.from_address ?? "a customer").replace(/\s*<.*>/, "")}`, body: n.subject ?? null, url: "/app/inbox" });
      }
    }
    if (caughtUp) await db.from("integrations").update({ last_synced_at: startedAt }).eq("id", c.id);
    return { added };
  } catch (e) {
    return { added, error: (e as Error).message };
  }
}

/** Check for new mail at most once every `minutes` (used when someone opens the inbox). */
export async function syncIfStale(orgId: string, minutes = 2) {
  const { data } = await adminClient().from("integrations").select("status, last_synced_at").eq("org_id", orgId).eq("provider", "gmail").maybeSingle();
  if (!data || data.status !== "connected") return null;
  if (data.last_synced_at && Date.now() - new Date(data.last_synced_at).getTime() < minutes * 60_000) return null;
  return syncMailbox(orgId, { max: 150 });
}

/** Download one attachment of a synced email from Gmail (they aren't copied into the app). */
export async function gmailAttachment(orgId: string, gmailMessageId: string, attachmentId: string): Promise<Buffer | null> {
  const c = await gmailConnection(orgId);
  if (!c) return null;
  const r = await api<{ data?: string }>(c, `/messages/${encodeURIComponent(gmailMessageId)}/attachments/${encodeURIComponent(attachmentId)}`).catch(() => null);
  return r?.data ? Buffer.from(r.data.replace(/-/g, "+").replace(/_/g, "/"), "base64") : null;
}
