import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { money } from "@/lib/format";
import { diffScopes, ITEM_LABEL, type DiffStatus, type ScopeLine } from "@/lib/claims-scope";
import { getClaimForJob } from "@/lib/claims-server";
import { clearScope, supplementFromFlags, copyEstimateToScope } from "../actions";
import { ScopeImport } from "./scope-import";

export const metadata: Metadata = { title: "Scope comparison" };

const STATUS: Record<DiffStatus, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  matched: { label: "Matched", tone: "green" },
  qty_differs: { label: "Quantity differs", tone: "amber" },
  missing_from_carrier: { label: "Missing from carrier", tone: "red" },
  extra: { label: "Only on carrier", tone: "slate" },
};
const ORDER: DiffStatus[] = ["missing_from_carrier", "qty_differs", "extra", "matched"];

export default async function ScopePage({ params }: PageProps<"/app/jobs/[id]/claim/scope">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const { data } = await supabase.from("scope_items").select("source, xact_code, description, quantity, unit, unit_price, total, position").eq("claim_id", claim.id).order("position");
  const toLine = (r: Record<string, unknown>): ScopeLine => ({ xact_code: (r.xact_code as string) ?? null, description: String(r.description), quantity: Number(r.quantity), unit: String(r.unit), unit_price: Number(r.unit_price), total: Number(r.total) });
  const carrier = (data ?? []).filter((r) => r.source === "carrier").map(toLine);
  const contractor = (data ?? []).filter((r) => r.source === "contractor").map(toLine);
  const both = carrier.length > 0 && contractor.length > 0;
  const diff = both ? diffScopes(carrier, contractor) : null;
  const rows = diff ? [...diff.rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) : [];
  const addable = diff ? diff.flags.filter((f) => f.kind !== "check" && f.row?.contractor).length : 0;

  const side = (source: "carrier" | "contractor", lines: ScopeLine[]) => (
    <Card
      title={<>{source === "carrier" ? "Carrier scope" : "Your scope"} <span className="font-normal text-slate-500">· {lines.length} lines · {money(lines.reduce((s, l) => s + l.total, 0))}</span></>}
      actions={
        lines.length > 0 ? (
          <form action={clearScope}>
            <input type="hidden" name="claim_id" value={claim.id} />
            <input type="hidden" name="source" value={source} />
            <SubmitButton variant="ghost" confirm={`Clear the ${source} scope?`}>Clear</SubmitButton>
          </form>
        ) : undefined
      }
    >
      <ScopeImport claimId={claim.id} source={source} existing={lines.length} />
      {source === "contractor" && (
        <ActionForm action={copyEstimateToScope} className="mt-3">
          <input type="hidden" name="claim_id" value={claim.id} />
          <SubmitButton variant="secondary" className="min-h-11">Use my accepted estimate</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Paste or upload line items from the carrier&apos;s estimate and your own. Works with rows copied from Excel/Google Sheets, CSV exports and Xactimate PDF text.
        Native Xactimate ESX import requires a Verisk partnership, so it isn&apos;t supported — use paste or CSV.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {side("carrier", carrier)}
        {side("contractor", contractor)}
      </div>

      {!both ? (
        <p className="text-sm text-slate-500">Import both scopes to see the line-by-line comparison.</p>
      ) : (
        <>
          <Card
            title={<>Commonly missed items <span className="font-normal text-slate-500">· {diff!.flags.length} flag{diff!.flags.length === 1 ? "" : "s"}</span></>}
            actions={
              addable > 0 ? (
                <form action={supplementFromFlags}>
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <SubmitButton className="min-h-11">Add flagged items to a new supplement</SubmitButton>
                </form>
              ) : undefined
            }
          >
            {diff!.flags.length === 0 ? (
              <p className="text-sm text-green-700">Nothing commonly missed was found. Nice scope.</p>
            ) : (
              <ul className="space-y-2" data-testid="flags">
                {diff!.flags.map((f, i) => (
                  <li key={i} className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", f.kind === "check" ? "bg-slate-50 text-slate-700" : "bg-red-50 text-red-900")}>
                    <Badge tone={f.kind === "missing" ? "red" : f.kind === "short" ? "amber" : "slate"}>{f.kind === "missing" ? "Missing" : f.kind === "short" ? "Short" : "Check"}</Badge>
                    <span>{f.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Line-by-line</h2>
              <p className="text-sm text-slate-600">
                Carrier <b className="tabular-nums">{money(diff!.totals.carrier)}</b> · yours <b className="tabular-nums">{money(diff!.totals.contractor)}</b> · gap{" "}
                <b className={cx("tabular-nums", diff!.totals.delta > 0 ? "text-red-700" : "text-slate-900")}>{money(diff!.totals.delta)}</b>
              </p>
            </div>
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Status</th>
                  <th className={th}>Item</th>
                  <th className={`${th} text-right`}>Carrier</th>
                  <th className={`${th} text-right`}>Yours</th>
                  <th className={`${th} text-right`}>Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100" data-testid="diff">
                {rows.map((r, i) => (
                  <tr key={i} data-status={r.status} className={r.flag ? "bg-red-50/40" : undefined}>
                    <td className={td}><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                    <td className={td}>
                      <div className="font-medium text-slate-800">{r.contractor?.description ?? r.carrier?.description}</div>
                      <div className="text-xs text-slate-500">
                        {[r.carrier?.xact_code ?? r.contractor?.xact_code, r.key ? ITEM_LABEL[r.key] : null].filter(Boolean).join(" · ")}
                        {r.carrier && r.contractor && r.carrier.description !== r.contractor.description && <> · carrier: {r.carrier.description}</>}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.carrier ? <>{r.carrier.quantity} {r.carrier.unit}<div className="text-xs text-slate-500">{money(r.carrier.total)}</div></> : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.contractor ? <>{r.contractor.quantity} {r.contractor.unit}<div className="text-xs text-slate-500">{money(r.contractor.total)}</div></> : "—"}</td>
                    <td className={cx(td, "text-right tabular-nums", r.delta > 0 && "font-medium text-red-700")}>{money(r.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
