import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, LinkButton } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { label } from "@/lib/format";
import { accountsFrom, xeroConfigured } from "@/lib/xero";
import { gmailConfigured } from "@/lib/gmail";
import { checkGmail, disconnectGmail, disconnectXero, resolveSyncProblem, saveXeroAccounts, setGmailSending, syncXero } from "./actions";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/app/settings/integrations">) {
  const { supabase, org, isAdmin } = await requireOrg();
  const sp = await searchParams;
  const [{ data: integ }, { data: problems }, { count: synced }, { data: gm }, { count: mailCount }] = await Promise.all([
    supabase.from("integrations").select("status, external_id, external_name, connected_at, last_synced_at, settings").eq("org_id", org.id).eq("provider", "xero").maybeSingle(),
    supabase.from("integration_sync_log").select("id, entity, entity_id, message, created_at").eq("org_id", org.id).eq("provider", "xero").eq("status", "error").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("external_refs").select("entity_id", { count: "exact", head: true }).eq("org_id", org.id).eq("provider", "xero"),
    supabase.from("integrations").select("status, external_name, connected_at, last_synced_at, settings").eq("org_id", org.id).eq("provider", "gmail").maybeSingle(),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", org.id).like("provider_ref", "gmail:%"),
  ]);
  const gmailOn = Boolean(gm && gm.status !== "disconnected");
  const gmailSends = (gm?.settings as { send_via_gmail?: boolean } | null)?.send_via_gmail !== false;
  const configured = xeroConfigured();
  const connected = Boolean(integ && integ.status !== "disconnected");
  const accounts = accountsFrom(integ?.settings);
  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "never");
  const badge = !configured ? "Not configured" : !connected ? "Not connected" : integ?.status === "error" ? "Needs reconnect" : "Connected";

  return (
    <div className="space-y-6">
      {sp.gmail === "connected" && <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-ink ring-1 ring-slate-200">Gmail connected. Customer emails now go out from {gm?.external_name}, and replies show up in <a href="/app/inbox" className="font-semibold underline">Inbox</a>.</p>}
      {typeof sp.gmail_error === "string" && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.gmail_error}</p>}

      <Card title="Gmail" actions={<Badge tone={!gmailConfigured() ? "slate" : gm?.status === "error" ? "red" : gmailOn ? "green" : "slate"}>{!gmailConfigured() ? "Not set up" : gm?.status === "error" ? "Needs reconnect" : gmailOn ? "Connected" : "Not connected"}</Badge>} >
        <p className="text-sm text-slate-600" data-gmail-card>
          Send quotes, invoices and updates from <b>your own Gmail address</b> (they sit in your Sent folder), and read and reply to <b>every email</b> in that mailbox from the app&apos;s Inbox. Emails with your contacts are linked to the contact and their job. Spam and trash stay in Gmail.
        </p>
        {!gmailConfigured() ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500" data-testid="gmail-not-configured">
            Gmail isn&apos;t set up on this server: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Google Cloud OAuth client with the Gmail API turned on, and add {"<site>"}/api/integrations/gmail/callback as an authorised redirect URI.
          </p>
        ) : (
          <>
            {gmailOn && (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Mailbox</dt><dd className="font-medium [overflow-wrap:anywhere]">{gm?.external_name}</dd></div>
                <div><dt className="text-xs text-slate-500">Last checked</dt><dd>{fmt(gm?.last_synced_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">Emails in the app</dt><dd>{mailCount ?? 0}</dd></div>
              </dl>
            )}
            {gmailOn && gm?.status !== "error" && (
              <form action={setGmailSending} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                <input type="hidden" name="on" value={gmailSends ? "0" : "1"} />
                <span className="flex-1">{gmailSends ? <>Customer emails go out from <b>{gm?.external_name}</b>.</> : <>Customer emails go out from the app&apos;s address. Gmail is only used for reading.</>}</span>
                {isAdmin && <SubmitButton variant="secondary">{gmailSends ? "Send from the app instead" : "Send from Gmail"}</SubmitButton>}
              </form>
            )}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                {gmailOn && gm?.status !== "error" ? (
                  <>
                    <ActionForm action={checkGmail}><SubmitButton className="min-h-11">Check for new email</SubmitButton></ActionForm>
                    <ActionForm action={disconnectGmail}><SubmitButton variant="ghost" className="min-h-11" confirm="Disconnect Gmail? Emails already in the app stay here.">Disconnect</SubmitButton></ActionForm>
                  </>
                ) : (
                  <LinkButton href="/api/integrations/gmail/connect" prefetch={false} className="min-h-11">{gmailOn ? "Reconnect Gmail" : "Connect Gmail"}</LinkButton>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {sp.xero === "connected" && <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-ink ring-1 ring-slate-200">Xero connected. Check the account codes below, then press <b>Sync now</b>.</p>}
      {typeof sp.xero_error === "string" && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.xero_error}</p>}

      <Card title="Xero" actions={<Badge tone={badge === "Connected" ? "green" : badge === "Needs reconnect" ? "red" : "slate"}>{badge}</Badge>}>
        <p className="text-sm text-slate-600">
          Sends customers as contacts, tax invoices (GST on Income), payments, and <b>job costs as bills</b> (GST on Expenses) — supplier bills, crew pay with the crew&apos;s ABN, and supplier credits for returns. Nothing is ever deleted in Xero.
        </p>
        {!configured ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500" data-testid="xero-not-configured">
            Xero isn&apos;t configured on this server: set XERO_CLIENT_ID and XERO_CLIENT_SECRET from your Xero developer app, and register {"<site>"}/api/integrations/xero/callback as its redirect URI.
          </p>
        ) : (
          <>
            {connected && (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Organisation</dt><dd className="font-medium">{integ?.external_name ?? integ?.external_id}</dd></div>
                <div><dt className="text-xs text-slate-500">Last sync</dt><dd>{fmt(integ?.last_synced_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">Records linked</dt><dd>{synced ?? 0}</dd></div>
              </dl>
            )}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                {connected && integ?.status !== "error" ? (
                  <>
                    <ActionForm action={syncXero}><SubmitButton className="min-h-11">Sync now</SubmitButton></ActionForm>
                    <ActionForm action={disconnectXero}><SubmitButton variant="ghost" className="min-h-11" confirm="Disconnect Xero? Records already sent stay in Xero.">Disconnect</SubmitButton></ActionForm>
                  </>
                ) : (
                  <LinkButton href="/api/integrations/xero/connect" prefetch={false} className="min-h-11">{connected ? "Reconnect Xero" : "Connect Xero"}</LinkButton>
                )}
              </div>
            )}
          </>
        )}
        <ActionForm action={saveXeroAccounts} className="mt-5 grid gap-3 border-t-2 border-dashed border-slate-200 pt-4 sm:grid-cols-4">
          <Field label="Sales account" hint="GST on Income"><Input name="sales" defaultValue={accounts.sales} disabled={!isAdmin} inputMode="numeric" /></Field>
          <Field label="Job cost account" hint="GST on Expenses"><Input name="costs" defaultValue={accounts.costs} disabled={!isAdmin} inputMode="numeric" /></Field>
          <Field label="Bank account" hint="Where payments land"><Input name="bank" defaultValue={accounts.bank} disabled={!isAdmin} inputMode="numeric" /></Field>
          {isAdmin && <div className="flex items-end"><SubmitButton variant="secondary" className="min-h-11 w-full">Save codes</SubmitButton></div>}
        </ActionForm>
      </Card>

      <Card title={`Sync inbox${problems?.length ? ` · ${problems.length}` : ""}`}>
        {(problems ?? []).length === 0 ? (
          <Empty title="Nothing needs attention">Anything Xero rejects shows up here in plain language, with what to do about it.</Empty>
        ) : (
          <ul className="divide-y-2 divide-dashed divide-slate-200" data-sync-problems>
            {(problems ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{p.message}</p>
                  <p className="text-xs text-slate-500">{label(p.entity)} · {fmt(p.created_at)}</p>
                </div>
                {isAdmin && (
                  <form action={resolveSyncProblem} className="flex flex-wrap gap-1">
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton variant="secondary">Mark resolved</SubmitButton>
                    {p.entity_id && <SubmitButton variant="ghost" name="forget" value="1">Send again next sync</SubmitButton>}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
