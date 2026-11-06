import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/admin";
import { siteUrl } from "@/lib/format";
import {
  customerToXero, DEFAULT_XERO_ACCOUNTS, invoiceToXero, jobCostToXero, paymentToXero, plainXeroError, supplierToXero, xeroQuote, type XeroAccounts,
} from "@/lib/xero-map";

/**
 * Xero (the dominant small-business ledger in Australia): OAuth 2.0 + push sync of contacts, sales invoices
 * (GST on Income), payments and job-cost bills (GST on Expenses).
 * Env: XERO_CLIENT_ID, XERO_CLIENT_SECRET, optional XERO_REDIRECT_URI and XERO_SCOPES
 * (apps created after Xero's granular-scope change may need e.g. "accounting.invoices accounting.payments").
 * Tokens live ONLY in integration_secrets (service role); the tenant id is integrations.external_id.
 */

export const xeroConfigured = () => Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const REVOKE_URL = "https://identity.xero.com/connect/revocation";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API = "https://api.xero.com/api.xro/2.0";
const DEFAULT_SCOPES = "openid profile email offline_access accounting.contacts accounting.transactions accounting.settings.read";
export const xeroRedirectUri = () => process.env.XERO_REDIRECT_URI ?? `${siteUrl()}/api/integrations/xero/callback`;

// --- OAuth state: signed "orgId.userId.timestamp" so the callback can't be forged ---
const sign = (s: string) => createHmac("sha256", process.env.XERO_CLIENT_SECRET ?? "").update(s).digest("hex").slice(0, 32);
export function makeState(orgId: string, userId: string) {
  const raw = `${orgId}.${userId}.${Date.now()}`;
  return `${raw}.${sign(raw)}`;
}
export function readState(state: string | null): { orgId: string; userId: string } | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [orgId, userId, ts, sig] = parts;
  const expected = sign(`${orgId}.${userId}.${ts}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
  return { orgId, userId };
}

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({ response_type: "code", client_id: process.env.XERO_CLIENT_ID!, redirect_uri: xeroRedirectUri(), scope: process.env.XERO_SCOPES ?? DEFAULT_SCOPES, state });
  return `${AUTH_URL}?${p}`;
}

const basic = () => "Basic " + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
type Tokens = { access_token: string; refresh_token: string; expires_in: number };
async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Tokens & { error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "Xero sign-in expired. Reconnect Xero." : `Xero sign-in failed (${json.error ?? res.status}).`);
  return json;
}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: xeroRedirectUri() });
const refreshTokens = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

/** The Xero organisation (tenant) the user just authorised — the most recently connected one. */
export async function firstTenant(accessToken: string): Promise<{ tenantId: string; tenantName: string; connectionId: string }> {
  const res = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const list = (await res.json().catch(() => [])) as { id: string; tenantId: string; tenantName: string; tenantType: string; updatedDateUtc?: string }[];
  const orgs = (Array.isArray(list) ? list : []).filter((c) => c.tenantType === "ORGANISATION").sort((a, b) => String(b.updatedDateUtc).localeCompare(String(a.updatedDateUtc)));
  if (!orgs[0]) throw new Error("Xero didn't share an organisation. Try connecting again and pick your organisation.");
  return { tenantId: orgs[0].tenantId, tenantName: orgs[0].tenantName, connectionId: orgs[0].id };
}

/** Store tokens for an org (service role). Creates the integrations row if needed. */
export async function saveConnection(orgId: string, tenant: { tenantId: string; tenantName: string; connectionId: string }, t: Tokens) {
  const db = adminClient();
  const { data: prev } = await db.from("integrations").select("settings").eq("org_id", orgId).eq("provider", "xero").maybeSingle();
  const settings = { ...DEFAULT_XERO_ACCOUNTS, ...((prev?.settings as Record<string, unknown>) ?? {}), connection_id: tenant.connectionId };
  const { data: integ, error } = await db
    .from("integrations")
    .upsert({ org_id: orgId, provider: "xero", status: "connected", external_id: tenant.tenantId, external_name: tenant.tenantName, connected_at: new Date().toISOString(), settings }, { onConflict: "org_id,provider" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("integration_secrets").upsert({ integration_id: integ.id, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() });
}

export async function disconnect(orgId: string) {
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id").eq("org_id", orgId).eq("provider", "xero").maybeSingle();
  if (!integ) return;
  const { data: sec } = await db.from("integration_secrets").select("refresh_token").eq("integration_id", integ.id).maybeSingle();
  if (sec?.refresh_token && xeroConfigured()) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: sec.refresh_token }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  }
  await db.from("integration_secrets").delete().eq("integration_id", integ.id);
  await db.from("integrations").update({ status: "disconnected" }).eq("id", integ.id);
}

export function accountsFrom(settings: unknown): XeroAccounts {
  const s = (settings ?? {}) as Partial<XeroAccounts>;
  const pick = (v: unknown, d: string) => (typeof v === "string" && /^[A-Za-z0-9.-]{1,10}$/.test(v) ? v : d);
  return { sales: pick(s.sales, DEFAULT_XERO_ACCOUNTS.sales), costs: pick(s.costs, DEFAULT_XERO_ACCOUNTS.costs), bank: pick(s.bank, DEFAULT_XERO_ACCOUNTS.bank) };
}

// ---------------------------------------------------------------------------
// API client with automatic token refresh (access tokens last 30 minutes; refresh tokens rotate)
// ---------------------------------------------------------------------------
class XeroError extends Error {
  constructor(public status: number, public body: unknown) { super(`Xero ${status}`); }
}

async function connection(orgId: string) {
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id, external_id, status, settings").eq("org_id", orgId).eq("provider", "xero").maybeSingle();
  if (!integ || integ.status === "disconnected" || !integ.external_id) throw new Error("Xero isn't connected.");
  const { data: sec } = await db.from("integration_secrets").select("*").eq("integration_id", integ.id).maybeSingle();
  if (!sec?.refresh_token) throw new Error("Xero isn't connected.");
  let access = sec.access_token as string;
  if (!sec.expires_at || new Date(sec.expires_at).getTime() - Date.now() < 2 * 60 * 1000) {
    try {
      const t = await refreshTokens(sec.refresh_token);
      access = t.access_token;
      await db.from("integration_secrets").update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq("integration_id", integ.id);
    } catch (e) {
      await db.from("integrations").update({ status: "error" }).eq("id", integ.id);
      throw e;
    }
  }
  const tenant = integ.external_id as string;
  async function call<T = Record<string, unknown>>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${access}`, "xero-tenant-id": tenant, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new XeroError(res.status, json);
    return json as T;
  }
  return { integrationId: integ.id as string, accounts: accountsFrom(integ.settings), call };
}

// ---------------------------------------------------------------------------
// Sync (push): customers -> Contacts, invoices -> Invoices (ACCREC), payments -> Payments,
// job costs -> bills (ACCPAY) / supplier credit notes. Every failure is logged in plain language.
// ---------------------------------------------------------------------------
export type SyncResult = { created: number; errors: number; message: string };

export async function syncOrg(db: SupabaseClient, orgId: string): Promise<SyncResult> {
  const conn = await connection(orgId);
  const { data: org } = await db.from("organizations").select("gst_registered").eq("id", orgId).single();
  const orgGst = org?.gst_registered !== false;
  let created = 0;
  let errors = 0;

  const { data: refRows } = await db.from("external_refs").select("entity, entity_id, external_id").eq("org_id", orgId).eq("provider", "xero");
  const refs = new Map((refRows ?? []).map((r) => [`${r.entity}:${r.entity_id}`, r.external_id as string]));
  const remember = async (entity: string, id: string, externalId: string) => {
    refs.set(`${entity}:${id}`, externalId);
    await db.from("external_refs").upsert({ org_id: orgId, provider: "xero", entity, entity_id: id, external_id: externalId });
    await db.from("integration_sync_log").update({ resolved_at: new Date().toISOString() }).eq("org_id", orgId).eq("provider", "xero").eq("entity_id", id).is("resolved_at", null);
    created++;
  };
  const fail = async (entity: string, id: string | null, what: string, e: unknown) => {
    errors++;
    const message = e instanceof XeroError ? plainXeroError(e.status, e.body, what) : `${what} didn't sync: ${(e as Error).message}`;
    let q = db.from("integration_sync_log").select("id").eq("org_id", orgId).eq("provider", "xero").eq("entity", entity).eq("message", message).is("resolved_at", null);
    q = id ? q.eq("entity_id", id) : q.is("entity_id", null);
    const { data: existing } = await q.limit(1);
    if (!existing?.length) await db.from("integration_sync_log").insert({ org_id: orgId, provider: "xero", entity, entity_id: id, status: "error", message });
  };
  const findContact = async (name: string) => {
    const r = await conn.call<{ Contacts?: { ContactID: string }[] }>("GET", `Contacts?where=${encodeURIComponent(`Name==${xeroQuote(name)}`)}`);
    return r.Contacts?.[0]?.ContactID ?? null;
  };

  // 1. Customers -> Contacts
  const { data: customers } = await db.from("customers").select("id, name, email, phone, address, city, state, zip").eq("org_id", orgId).order("created_at").limit(500);
  const ensureCustomer = async (id: string): Promise<string | null> => {
    const have = refs.get(`customer:${id}`);
    if (have) return have;
    const c = (customers ?? []).find((x) => x.id === id);
    if (!c) return null;
    try {
      const body = customerToXero(c);
      const cid = (await findContact(body.Name)) ?? (await conn.call<{ Contacts: { ContactID: string }[] }>("POST", "Contacts", { Contacts: [body] })).Contacts[0].ContactID;
      await remember("customer", id, cid);
      return cid;
    } catch (e) {
      await fail("customer", id, `Customer ${c.name}`, e);
      return null;
    }
  };
  for (const c of customers ?? []) await ensureCustomer(c.id);

  // 2. Invoices (sent or later) -> ACCREC, GST on Income
  const { data: invoices } = await db
    .from("invoices")
    .select("id, number, issue_date, due_date, discount, tax_rate, amounts_include_gst, status, jobs(title, customer_id), invoice_items(description, quantity, unit_price, position)")
    .eq("org_id", orgId)
    .not("status", "in", "(draft,void)")
    .order("created_at")
    .limit(500);
  type Inv = { id: string; number: number; issue_date: string; due_date: string | null; discount: number; tax_rate: number; amounts_include_gst: boolean; jobs: { title: string; customer_id: string }; invoice_items: { description: string; quantity: number; unit_price: number; position: number }[] };
  const ensureInvoice = async (inv: Inv): Promise<string | null> => {
    const have = refs.get(`invoice:${inv.id}`);
    if (have) return have;
    const contactId = await ensureCustomer(inv.jobs.customer_id);
    if (!contactId) { await fail("invoice", inv.id, `Invoice #${inv.number}`, new Error("its customer couldn't be sent to Xero first")); return null; }
    try {
      const items = [...inv.invoice_items].sort((a, b) => a.position - b.position);
      const body = invoiceToXero({ ...inv, job_title: inv.jobs.title }, items, { contactId, gstRegistered: orgGst, accounts: conn.accounts });
      const r = await conn.call<{ Invoices: { InvoiceID: string }[] }>("POST", "Invoices", { Invoices: [body] });
      await remember("invoice", inv.id, r.Invoices[0].InvoiceID);
      return r.Invoices[0].InvoiceID;
    } catch (e) {
      await fail("invoice", inv.id, `Invoice #${inv.number}`, e);
      return null;
    }
  };
  const invList = (invoices ?? []) as unknown as Inv[];
  for (const inv of invList) await ensureInvoice(inv);

  // 3. Payments
  const { data: payments } = await db.from("payments").select("id, invoice_id, amount, paid_on, method, reference").eq("org_id", orgId).order("created_at").limit(1000);
  for (const p of payments ?? []) {
    if (refs.has(`payment:${p.id}`)) continue;
    const inv = invList.find((i) => i.id === p.invoice_id);
    const invoiceId = inv ? await ensureInvoice(inv) : null;
    const what = `Payment of ${Number(p.amount).toLocaleString("en-AU", { style: "currency", currency: "AUD" })}`;
    if (!invoiceId) { await fail("payment", p.id, what, new Error("its invoice isn't in Xero yet")); continue; }
    try {
      const r = await conn.call<{ Payments: { PaymentID: string }[] }>("PUT", "Payments", { Payments: [paymentToXero(p, { invoiceId, bankAccountCode: conn.accounts.bank })] });
      await remember("payment", p.id, r.Payments[0].PaymentID);
    } catch (e) {
      await fail("payment", p.id, what, e);
    }
  }

  // 4. Job costs -> bills (GST on Expenses) / supplier credit notes; skip rows that came from an accounting system
  const { data: crews } = await db.from("crews").select("id, name, abn, gst_registered, phone").eq("org_id", orgId);
  const { data: costs } = await db.from("job_costs").select("id, category, vendor, description, amount, incurred_on, source, source_id, jobs(title)").eq("org_id", orgId).not("source", "in", "(quickbooks,xero)").order("created_at").limit(1000);
  const supplierIds = new Map<string, string>();
  const ensureSupplier = async (name: string, abn?: string | null, phone?: string | null) => {
    const key = name.trim().toLowerCase();
    if (supplierIds.has(key)) return supplierIds.get(key)!;
    const body = supplierToXero({ name, abn, phone });
    const id = (await findContact(body.Name)) ?? (await conn.call<{ Contacts: { ContactID: string }[] }>("POST", "Contacts", { Contacts: [body] })).Contacts[0].ContactID;
    supplierIds.set(key, id);
    return id;
  };
  for (const k of (costs ?? []) as unknown as { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; source: string; source_id: string | null; jobs: { title: string } }[]) {
    if (refs.has(`job_cost:${k.id}`) || Number(k.amount) === 0) continue;
    const what = `${Number(k.amount) < 0 ? "Credit" : "Cost"} "${k.description ?? k.category}"`;
    try {
      const crew = (crews ?? []).find((c) => (k.source === "crew_pay" && c.id === k.source_id) || (k.vendor && c.name.trim().toLowerCase() === k.vendor.trim().toLowerCase()));
      const contactId = await ensureSupplier(crew?.name ?? k.vendor ?? "Sundry supplier", crew?.abn, crew?.phone);
      const { entity, body } = jobCostToXero({ ...k, job_title: k.jobs?.title }, { contactId, supplierGst: crew ? crew.gst_registered !== false : true, orgGst, accounts: conn.accounts });
      const r = await conn.call<Record<string, { InvoiceID?: string; CreditNoteID?: string }[]>>("POST", entity, { [entity]: [body] });
      const row = r[entity][0];
      await remember("job_cost", k.id, (row.InvoiceID ?? row.CreditNoteID)!);
    } catch (e) {
      await fail("job_cost", k.id, what, e);
    }
  }

  await db.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "connected" }).eq("id", conn.integrationId);
  return { created, errors, message: errors ? `Sent ${created} record(s) to Xero; ${errors} need attention.` : `Sent ${created} new record(s) to Xero. Everything is up to date.` };
}
