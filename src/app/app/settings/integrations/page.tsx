import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, LinkButton } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { label } from "@/lib/format";
import { qboConfigured } from "@/lib/quickbooks";
import { disconnectQuickBooks, resolveSyncProblem, syncQuickBooks } from "./actions";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/app/settings/integrations">) {
  const { supabase, org, isAdmin } = await requireOrg();
  const sp = await searchParams;
  const [{ data: integ }, { data: problems }, { count: synced }] = await Promise.all([
    supabase.from("integrations").select("status, external_id, connected_at, last_synced_at").eq("org_id", org.id).eq("provider", "quickbooks").maybeSingle(),
    supabase.from("integration_sync_log").select("id, entity, entity_id, message, created_at").eq("org_id", org.id).eq("provider", "quickbooks").eq("status", "error").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("external_refs").select("entity_id", { count: "exact", head: true }).eq("org_id", org.id).eq("provider", "quickbooks"),
  ]);
  const configured = qboConfigured();
  const connected = integ && integ.status !== "disconnected";
  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "never");

  return (
    <div className="space-y-6">
      {sp.qbo === "connected" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">QuickBooks connected. Press <b>Sync now</b> to send your customers, invoices, payments and job costs.</p>}
      {typeof sp.qbo_error === "string" && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.qbo_error}</p>}

      <Card
        title="QuickBooks Online"
        actions={<Badge tone={!configured ? "slate" : !connected ? "slate" : integ.status === "error" ? "red" : "green"}>{!configured ? "Not configured" : !connected ? "Not connected" : integ.status === "error" ? "Needs reconnect" : "Connected"}</Badge>}
      >
        <p className="text-sm text-slate-600">
          Sends customers, invoices and payments, plus <b>job costs</b> — supplier bills (Bills), card/cash expenses (Purchases) and returns (Vendor credits) tagged to the job&apos;s customer so QuickBooks job costing matches. Nothing is ever deleted in QuickBooks.
        </p>
        {!configured ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">QuickBooks isn&apos;t configured on this server: set QBO_CLIENT_ID and QBO_CLIENT_SECRET (and QBO_ENVIRONMENT=sandbox for testing), and register {"<site>"}/api/integrations/quickbooks/callback as the redirect URI.</p>
        ) : (
          <>
            {connected && (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Company ID</dt><dd className="font-mono">{integ.external_id}</dd></div>
                <div><dt className="text-xs text-slate-500">Last sync</dt><dd>{fmt(integ.last_synced_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">Records linked</dt><dd>{synced ?? 0}</dd></div>
              </dl>
            )}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                {connected && integ.status !== "error" ? (
                  <>
                    <ActionForm action={syncQuickBooks}><SubmitButton>Sync now</SubmitButton></ActionForm>
                    <ActionForm action={disconnectQuickBooks}><SubmitButton variant="ghost" confirm="Disconnect QuickBooks? Already-synced records stay in QuickBooks.">Disconnect</SubmitButton></ActionForm>
                  </>
                ) : (
                  <LinkButton href="/api/integrations/quickbooks/connect" prefetch={false}>{connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}</LinkButton>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <Card title={`Sync problems${problems?.length ? ` · ${problems.length}` : ""}`}>
        {(problems ?? []).length === 0 ? (
          <Empty title="No sync problems">Anything QuickBooks rejects shows up here in plain language, with what to do about it.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100" data-sync-problems>
            {(problems ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{p.message}</p>
                  <p className="text-xs text-slate-500">{label(p.entity)} · {fmt(p.created_at)}</p>
                </div>
                {isAdmin && (
                  <form action={resolveSyncProblem} className="flex gap-1">
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton variant="secondary">Mark resolved</SubmitButton>
                    {p.entity_id && <SubmitButton variant="ghost" name="forget" value="1">Re-send next sync</SubmitButton>}
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
