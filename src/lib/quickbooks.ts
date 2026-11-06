import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/admin";
import { siteUrl } from "@/lib/format";
import { customerToQbo, invoiceToQbo, jobCostToQbo, paymentToQbo, plainQboError, qboQuote, vendorToQbo } from "@/lib/quickbooks-map";

/**
 * QuickBooks Online: OAuth 2.0 + push sync of customers, invoices, payments and job costs.
 * Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, optional QBO_ENVIRONMENT=sandbox, QBO_REDIRECT_URI.
 * Tokens live ONLY in integration_secrets (service role); the realm id is integrations.external_id.
 */

export const qboConfigured = () => Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
const sandbox = () => process.env.QBO_ENVIRONMENT === "sandbox";
export const qboApiBase = () => (sandbox() ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const MINOR = "75";
export const qboRedirectUri = () => process.env.QBO_REDIRECT_URI ?? `${siteUrl()}/api/integrations/quickbooks/callback`;

// --- OAuth state: signed "orgId.userId.timestamp" so the callback can't be forged ---
const sign = (s: string) => createHmac("sha256", process.env.QBO_CLIENT_SECRET ?? "").update(s).digest("hex").slice(0, 32);
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
  const p = new URLSearchParams({ client_id: process.env.QBO_CLIENT_ID!, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: qboRedirectUri(), state });
  return `https://appcenter.intuit.com/connect/oauth2?${p}`;
}

type Tokens = { access_token: string; refresh_token: string; expires_in: number };
async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Tokens & { error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_grant" ? "QuickBooks sign-in expired. Reconnect QuickBooks." : `QuickBooks sign-in failed (${json.error ?? res.status}).`);
  return json;
}
export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: qboRedirectUri() });
export const refreshTokens = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

/** Store tokens for an org (service role). Creates the integrations row if needed. */
export async function saveConnection(orgId: string, realmId: string, t: Tokens) {
  const db = adminClient();
  const { data: integ, error } = await db
    .from("integrations")
    .upsert({ org_id: orgId, provider: "quickbooks", status: "connected", external_id: realmId, connected_at: new Date().toISOString() }, { onConflict: "org_id,provider" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("integration_secrets").upsert({ integration_id: integ.id, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() });
}

export async function disconnect(orgId: string) {
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id").eq("org_id", orgId).eq("provider", "quickbooks").maybeSingle();
  if (!integ) return;
  const { data: sec } = await db.from("integration_secrets").select("refresh_token").eq("integration_id", integ.id).maybeSingle();
  if (sec?.refresh_token && qboConfigured()) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64"), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: sec.refresh_token }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  }
  await db.from("integration_secrets").delete().eq("integration_id", integ.id);
  await db.from("integrations").update({ status: "disconnected" }).eq("id", integ.id);
}

// ---------------------------------------------------------------------------
// API client with automatic token refresh
// ---------------------------------------------------------------------------
class QboError extends Error {
  constructor(public status: number, public body: unknown) { super(`QBO ${status}`); }
}

async function connection(orgId: string) {
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("id, external_id, status").eq("org_id", orgId).eq("provider", "quickbooks").maybeSingle();
  if (!integ || integ.status === "disconnected" || !integ.external_id) throw new Error("QuickBooks isn't connected.");
  const { data: sec } = await db.from("integration_secrets").select("*").eq("integration_id", integ.id).maybeSingle();
  if (!sec?.refresh_token) throw new Error("QuickBooks isn't connected.");
  let access = sec.access_token as string;
  if (!sec.expires_at || new Date(sec.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      const t = await refreshTokens(sec.refresh_token);
      access = t.access_token;
      await db.from("integration_secrets").update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq("integration_id", integ.id);
    } catch (e) {
      await db.from("integrations").update({ status: "error" }).eq("id", integ.id);
      throw e;
    }
  }
  const realm = integ.external_id as string;
  async function call<T = Record<string, unknown>>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${qboApiBase()}/v3/company/${realm}/${path}${sep}minorversion=${MINOR}`, {
      method,
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json as { Fault?: unknown }).Fault) throw new QboError(res.status, json);
    return json as T;
  }
  const query = async (q: string) => ((await call<{ QueryResponse: Record<string, { Id: string; Name?: string; DisplayName?: string }[]> }>("GET", `query?query=${encodeURIComponent(q)}`)).QueryResponse ?? {});
  return { integrationId: integ.id as string, call, query };
}

// ---------------------------------------------------------------------------
// Sync (push): customers -> Customer, invoices -> Invoice, payments -> Payment,
// job costs -> Bill / Purchase, credits -> VendorCredit. Every failure is logged.
// ---------------------------------------------------------------------------
export type SyncResult = { created: number; errors: number; message: string };

export async function syncOrg(db: SupabaseClient, orgId: string): Promise<SyncResult> {
  const conn = await connection(orgId);
  let created = 0;
  let errors = 0;

  const { data: refRows } = await db.from("external_refs").select("entity, entity_id, external_id").eq("org_id", orgId).eq("provider", "quickbooks");
  const refs = new Map((refRows ?? []).map((r) => [`${r.entity}:${r.entity_id}`, r.external_id as string]));
  const remember = async (entity: string, id: string, externalId: string) => {
    refs.set(`${entity}:${id}`, externalId);
    await db.from("external_refs").upsert({ org_id: orgId, provider: "quickbooks", entity, entity_id: id, external_id: externalId });
    await db.from("integration_sync_log").update({ resolved_at: new Date().toISOString() }).eq("org_id", orgId).eq("entity_id", id).is("resolved_at", null);
    created++;
  };
  const fail = async (entity: string, id: string | null, what: string, e: unknown) => {
    errors++;
    const message = e instanceof QboError ? plainQboError(e.status, e.body, what) : `${what} didn't sync: ${(e as Error).message}`;
    // don't pile up the same unresolved message on every sync
    let q = db.from("integration_sync_log").select("id").eq("org_id", orgId).eq("entity", entity).eq("message", message).is("resolved_at", null);
    q = id ? q.eq("entity_id", id) : q.is("entity_id", null);
    const { data: existing } = await q.limit(1);
    if (!existing?.length) await db.from("integration_sync_log").insert({ org_id: orgId, provider: "quickbooks", entity, entity_id: id, status: "error", message });
  };

  // Reference data in the company file
  let itemRef: { value: string } | null = null;
  let expenseRef: { value: string } | null = null;
  let bankRef: { value: string } | null = null;
  try {
    const items = (await conn.query("select Id, Name from Item where Type = 'Service' maxresults 50")).Item ?? [];
    const it = items.find((i) => /^(services?|roofing)$/i.test(i.Name ?? "")) ?? items[0];
    if (it) itemRef = { value: it.Id };
    const exp = (await conn.query("select Id, Name from Account where AccountType = 'Cost of Goods Sold' maxresults 1")).Account ?? (await conn.query("select Id, Name from Account where AccountType = 'Expense' maxresults 1")).Account ?? [];
    if (exp[0]) expenseRef = { value: exp[0].Id };
    const bank = (await conn.query("select Id, Name from Account where AccountType = 'Bank' maxresults 1")).Account ?? [];
    if (bank[0]) bankRef = { value: bank[0].Id };
  } catch (e) {
    await fail("setup", null, "Reading your QuickBooks accounts", e);
    return { created, errors, message: "Couldn't read your QuickBooks company file." };
  }
  if (!itemRef) await fail("setup", null, "Invoices", new Error("QuickBooks has no Service item. Add one named \"Services\" in QuickBooks (Sales → Products and services)."));
  if (!expenseRef) await fail("setup", null, "Job costs", new Error("QuickBooks has no Cost of Goods Sold or Expense account."));

  // 1. Customers
  const { data: customers } = await db.from("customers").select("id, name, email, phone, address, city, state, zip").eq("org_id", orgId).order("created_at").limit(500);
  const ensureCustomer = async (id: string): Promise<string | null> => {
    const have = refs.get(`customer:${id}`);
    if (have) return have;
    const c = (customers ?? []).find((x) => x.id === id);
    if (!c) return null;
    try {
      const body = customerToQbo(c);
      const found = (await conn.query(`select Id from Customer where DisplayName = ${qboQuote(body.DisplayName)}`)).Customer?.[0];
      const qid = found?.Id ?? (await conn.call<{ Customer: { Id: string } }>("POST", "customer", body)).Customer.Id;
      await remember("customer", id, qid);
      return qid;
    } catch (e) {
      await fail("customer", id, `Customer ${c.name}`, e);
      return null;
    }
  };
  for (const c of customers ?? []) await ensureCustomer(c.id);

  // 2. Invoices (sent or later)
  const { data: invoices } = await db
    .from("invoices")
    .select("id, number, issue_date, due_date, discount, tax_rate, notes, status, jobs(title, customer_id), invoice_items(description, quantity, unit_price, position)")
    .eq("org_id", orgId)
    .not("status", "in", "(draft,void)")
    .order("created_at")
    .limit(500);
  type Inv = { id: string; number: number; issue_date: string; due_date: string | null; discount: number; tax_rate: number; notes: string | null; jobs: { title: string; customer_id: string }; invoice_items: { description: string; quantity: number; unit_price: number; position: number }[] };
  const ensureInvoice = async (inv: Inv): Promise<string | null> => {
    const have = refs.get(`invoice:${inv.id}`);
    if (have) return have;
    if (!itemRef) return null;
    const cust = await ensureCustomer(inv.jobs.customer_id);
    if (!cust) { await fail("invoice", inv.id, `Invoice #${inv.number}`, new Error("its customer couldn't be synced first")); return null; }
    try {
      const items = [...inv.invoice_items].sort((a, b) => a.position - b.position);
      const r = await conn.call<{ Invoice: { Id: string } }>("POST", "invoice", invoiceToQbo({ ...inv, job_title: inv.jobs.title }, items, { customer: { value: cust }, item: itemRef }));
      await remember("invoice", inv.id, r.Invoice.Id);
      return r.Invoice.Id;
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
    const invTxn = inv ? await ensureInvoice(inv) : null;
    const cust = inv ? refs.get(`customer:${inv.jobs.customer_id}`) : null;
    if (!invTxn || !cust) { await fail("payment", p.id, `Payment of $${Number(p.amount).toFixed(2)}`, new Error("its invoice isn't in QuickBooks yet")); continue; }
    try {
      const r = await conn.call<{ Payment: { Id: string } }>("POST", "payment", paymentToQbo(p, { customer: { value: cust }, invoiceTxnId: invTxn }));
      await remember("payment", p.id, r.Payment.Id);
    } catch (e) {
      await fail("payment", p.id, `Payment of $${Number(p.amount).toFixed(2)}`, e);
    }
  }

  // 4. Job costs (skip ones that came from QuickBooks)
  if (expenseRef) {
    const { data: costs } = await db.from("job_costs").select("id, category, vendor, description, amount, incurred_on, source, jobs(title, customer_id)").eq("org_id", orgId).neq("source", "quickbooks").order("created_at").limit(1000);
    const vendorIds = new Map<string, string>();
    const ensureVendor = async (name: string) => {
      const key = name.trim().toLowerCase();
      if (vendorIds.has(key)) return vendorIds.get(key)!;
      const body = vendorToQbo(name);
      const found = (await conn.query(`select Id from Vendor where DisplayName = ${qboQuote(body.DisplayName)}`)).Vendor?.[0];
      const id = found?.Id ?? (await conn.call<{ Vendor: { Id: string } }>("POST", "vendor", body)).Vendor.Id;
      vendorIds.set(key, id);
      return id;
    };
    for (const k of (costs ?? []) as unknown as { id: string; category: string; vendor: string | null; description: string | null; amount: number; incurred_on: string; jobs: { title: string; customer_id: string } }[]) {
      if (refs.has(`job_cost:${k.id}`) || Number(k.amount) === 0) continue;
      const what = `${Number(k.amount) < 0 ? "Credit" : "Cost"} "${k.description ?? k.category}" ($${Math.abs(Number(k.amount)).toFixed(2)})`;
      try {
        const vendor = k.vendor ? { value: await ensureVendor(k.vendor) } : null;
        const cust = await ensureCustomer(k.jobs.customer_id);
        const { entity, body } = jobCostToQbo({ ...k, job_title: k.jobs.title }, { vendor, expenseAccount: expenseRef, bankAccount: bankRef, customer: cust ? { value: cust } : null });
        const r = await conn.call<Record<string, { Id: string }>>("POST", entity.toLowerCase(), body);
        await remember("job_cost", k.id, r[entity].Id);
      } catch (e) {
        await fail("job_cost", k.id, what, e);
      }
    }
  }

  await db.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "connected" }).eq("id", conn.integrationId);
  return { created, errors, message: errors ? `Synced ${created} record(s); ${errors} need attention.` : `Synced ${created} new record(s). Everything is up to date.` };
}
