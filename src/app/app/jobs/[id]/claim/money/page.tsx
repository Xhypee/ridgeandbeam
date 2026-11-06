import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { KeepForm } from "../_components/keep-form";
import { Badge, Card, Field, Input, Select, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money } from "@/lib/format";
import {
  AU_DOC_TYPES, CHECK_KIND_LABEL, CHECK_KINDS, DOC_LABEL, PAYER_GROUP_LABEL, PAYER_GROUP_TONE, PAYER_GROUPS, PAYER_LABEL, PAYERS, payerGroup, SETTLEMENT_SHORT,
} from "@/lib/claims";
import { INVOICE_KIND_LABEL, type InvoiceKind } from "@/lib/claims-billing";
import { getClaimForJob, invoiceTotalsFor, type ClaimCheck, type ClaimDocument } from "@/lib/claims-server";
import { addCheck, deleteCheck, generateExpectedPayments, markCheckReceived, recordCheck, toggleDocument, updateDocument } from "../actions";

export const metadata: Metadata = { title: "Claim money" };

export default async function ClaimMoneyPage({ params }: PageProps<"/app/jobs/[id]/claim/money">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const [{ data: checkRows }, { data: docRows }, { data: invRows }, { data: fileRows }] = await Promise.all([
    supabase.from("claim_checks").select("*").eq("claim_id", claim.id).order("created_at"),
    supabase.from("claim_documents").select("*").eq("claim_id", claim.id),
    supabase.from("invoices").select("id, number, kind, status, milestone_label, bill_to").eq("job_id", id).neq("status", "void").order("number"),
    supabase.from("job_files").select("id, kind, caption, category, created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const checks = (checkRows ?? []) as ClaimCheck[];
  const docs = ((docRows ?? []) as ClaimDocument[])
    .filter((d) => (AU_DOC_TYPES as readonly string[]).includes(d.doc_type) || d.doc_type === "other")
    .sort((a, b) => (AU_DOC_TYPES as readonly string[]).indexOf(a.doc_type) - (AU_DOC_TYPES as readonly string[]).indexOf(b.doc_type));
  type Inv = { id: string; number: number; kind: InvoiceKind; status: string; milestone_label: string | null; bill_to: string };
  const invoices = (invRows ?? []) as unknown as Inv[];
  const invTotals = await invoiceTotalsFor(supabase, invoices.map((i) => i.id));
  const invBalance = (i: Inv) => invTotals.get(i.id)?.balance ?? 0;
  const invNumber = new Map<string, number>();
  if (checks.some((c) => c.payment_id)) {
    const { data: pays } = await supabase.from("payments").select("id, invoices(number)").in("id", checks.filter((c) => c.payment_id).map((c) => c.payment_id!));
    for (const p of pays ?? []) invNumber.set(p.id, (p.invoices as unknown as { number: number }).number);
  }
  const files = (fileRows ?? []) as { id: string; kind: string; caption: string | null; category: string; created_at: string }[];
  const fileLabel = (f: (typeof files)[number]) => `${f.caption || label(f.category)} (${label(f.kind)}, ${date(f.created_at, { day: "numeric", month: "short" })})`;

  const totals = checks.reduce(
    (t, c) => ({ expected: t.expected + Number(c.expected_amount), received: t.received + Number(c.received_amount) }),
    { expected: 0, received: 0 },
  );
  const coming = Math.max(0, Math.round((totals.expected - totals.received) * 100) / 100);
  const pct = totals.expected > 0 ? Math.min(100, Math.round((totals.received / totals.expected) * 100)) : 0;
  const byGroup = PAYER_GROUPS.map((g) => {
    const rows = checks.filter((c) => payerGroup(c) === g);
    return { g, expected: rows.reduce((s, c) => s + Number(c.expected_amount), 0), received: rows.reduce((s, c) => s + Number(c.received_amount), 0) };
  }).filter((x) => x.expected > 0 || x.received > 0);
  const docsDone = docs.filter((d) => d.status === "accepted" || d.status === "sent").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">Money for this claim</h2>
        <p className="text-sm text-slate-600">Every dollar you expect, who pays it, and what is still missing. {SETTLEMENT_SHORT[claim.settlement_path]}.</p>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200" data-testid="claim-money-summary">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div><dt className="text-sm text-slate-500">Expected</dt><dd className="font-display text-3xl font-semibold tabular-nums text-ink">{money(totals.expected)}</dd></div>
          <div><dt className="text-sm text-slate-500">Received</dt><dd className="font-display text-3xl font-semibold tabular-nums text-green-700">{money(totals.received)}</dd></div>
          <div><dt className="text-sm text-slate-500">Still coming</dt><dd className={cx("font-display text-3xl font-semibold tabular-nums", coming > 0 ? "text-amber-700" : "text-slate-400")}>{money(coming)}</dd></div>
        </dl>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Received of expected">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
        </div>
        {byGroup.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="by-payer">
            {byGroup.map((x) => (
              <div key={x.g} className="rounded-lg bg-slate-50 p-2">
                <dt className="text-xs text-slate-500">{PAYER_GROUP_LABEL[x.g]}</dt>
                <dd className="text-sm font-semibold tabular-nums">{money(x.received)} <span className="font-normal text-slate-500">of {money(x.expected)}</span></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Payments</h3>
          <KeepForm action={generateExpectedPayments}>
            <input type="hidden" name="claim_id" value={claim.id} />
            <SubmitButton variant="secondary" className="min-h-11">Work out expected payments</SubmitButton>
          </KeepForm>
        </div>
        {checks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No expected payments yet. Set the settlement path, approved amount and excess on the Overview, then press &ldquo;Work out expected payments&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" data-testid="ledger">
            {checks.map((c) => {
              const g = payerGroup(c);
              const owed = Math.max(0, Number(c.expected_amount) - Number(c.received_amount));
              return (
                <li key={c.id} className="p-4" data-check-kind={c.kind} data-payer={g}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={PAYER_GROUP_TONE[g]}>{PAYER_GROUP_LABEL[g]}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{c.label || CHECK_KIND_LABEL[c.kind]}</p>
                      <p className="text-xs text-slate-500">
                        {CHECK_KIND_LABEL[c.kind]}
                        {c.check_number && ` · ref ${c.check_number}`}
                        {c.received_on && ` · received ${date(c.received_on)}`}
                        {c.payment_id && invNumber.has(c.payment_id) && ` · applied to invoice #${invNumber.get(c.payment_id)}`}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">{money(c.expected_amount)}</p>
                    {owed > 0 ? <Badge tone="amber">{Number(c.received_amount) > 0 ? `Owed ${money(owed)}` : "Due"}</Badge> : <Badge tone="green">Received</Badge>}
                    {owed > 0 && !c.payment_id && (
                      <form action={markCheckReceived}>
                        <input type="hidden" name="id" value={c.id} />
                        <SubmitButton variant="secondary" className="min-h-11">Mark received</SubmitButton>
                      </form>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700">Record details</summary>
                    <KeepForm action={recordCheck} className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Amount received"><Input name="received_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(c.received_amount) || Number(c.expected_amount) || ""} /></Field>
                      <Field label="Date received"><Input name="received_on" type="date" defaultValue={c.received_on ?? isoDate(new Date())} /></Field>
                      <Field label="Payment reference"><Input name="check_number" defaultValue={c.check_number ?? ""} placeholder="EFT ref / remittance no." /></Field>
                      {!c.payment_id ? (
                        <Field label="Also record on an invoice (optional)">
                          <Select name="invoice_id" defaultValue="">
                            <option value="">Don&apos;t apply to an invoice</option>
                            {invoices.map((i) => (
                              <option key={i.id} value={i.id}>#{i.number} · {i.milestone_label || INVOICE_KIND_LABEL[i.kind] || "Invoice"} · balance {money(invBalance(i))}</option>
                            ))}
                          </Select>
                        </Field>
                      ) : (
                        <p className="text-xs text-slate-500">Applied to an invoice payment; changing the amount updates that payment too.</p>
                      )}
                      <Field label="Notes" className="sm:col-span-2"><Input name="notes" defaultValue={c.notes ?? ""} /></Field>
                      <div className="sm:col-span-2"><SubmitButton className="min-h-11">Save payment</SubmitButton></div>
                    </KeepForm>
                    {!c.payment_id && (
                      <form action={deleteCheck} className="mt-2">
                        <input type="hidden" name="id" value={c.id} />
                        <SubmitButton variant="ghost" confirm="Remove this payment from the ledger?">Remove from ledger</SubmitButton>
                      </form>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700">+ Add another expected payment</summary>
          <KeepForm action={addCheck} className="mt-2 grid gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-2">
            <input type="hidden" name="claim_id" value={claim.id} />
            <Field label="What for"><Select name="kind" defaultValue="other">{CHECK_KINDS.map((k) => <option key={k} value={k}>{CHECK_KIND_LABEL[k]}</option>)}</Select></Field>
            <Field label="Who pays"><Select name="payer" defaultValue="carrier">{PAYERS.map((p) => <option key={p} value={p}>{PAYER_LABEL[p]}</option>)}</Select></Field>
            <Field label="Label"><Input name="label" placeholder="e.g. Gutters (separate claim item)" /></Field>
            <Field label="Expected amount (inc GST)"><Input name="expected_amount" type="number" step="0.01" min="0.01" inputMode="decimal" required /></Field>
            <div className="sm:col-span-2"><SubmitButton variant="secondary" className="min-h-11">Add payment</SubmitButton></div>
          </KeepForm>
        </details>
      </section>

      <section>
        <h3 className="font-display text-lg font-semibold text-ink">Paperwork the insurer needs <span className="text-sm font-normal text-slate-500">· {docsDone} of {docs.length} sent</span></h3>
        <p className="mb-3 text-sm text-slate-600">Most payment delays come from missing paperwork. Tap each item when it is sent.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="paperwork">
          {docs.map((d) => {
            const done = d.status === "sent" || d.status === "accepted";
            return (
              <li key={d.id} data-doc={d.doc_type}>
                <form action={toggleDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="sent" value={done ? "0" : "1"} />
                  <button className={cx("flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-medium ring-1", done ? "bg-green-50 text-green-900 ring-green-200" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50")} aria-pressed={done}>
                    <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", done ? "bg-green-700 text-white" : "ring-2 ring-slate-300")}>{done ? "✓" : ""}</span>
                    <span className="min-w-0">{DOC_LABEL[d.doc_type] ?? label(d.doc_type)}{d.sent_on && <span className="block text-xs font-normal opacity-70">sent {date(d.sent_on, { day: "numeric", month: "short" })}</span>}</span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        {docs.length > 0 && (
          <details className="mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700">Link files to paperwork</summary>
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
              {docs.map((d) => (
                <li key={d.id} className="p-3">
                  <KeepForm action={updateDocument} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_8rem_minmax(0,1.3fr)_auto]">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="notes" value={d.notes ?? ""} />
                    <input type="hidden" name="sent_on" value={d.sent_on ?? ""} />
                    <p className="min-w-0 self-center text-sm font-medium text-slate-900">{DOC_LABEL[d.doc_type] ?? label(d.doc_type)}</p>
                    <Field label="Status">
                      <Select name="status" defaultValue={d.status}>{["missing", "ready", "sent", "accepted"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                    </Field>
                    <Field label="File">
                      <Select name="file_id" defaultValue={d.file_id ?? ""}>
                        <option value="">None</option>
                        {files.map((f) => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}
                      </Select>
                    </Field>
                    <SubmitButton variant="secondary" className="min-h-11">Save</SubmitButton>
                  </KeepForm>
                </li>
              ))}
            </ul>
            {files.length === 0 && <p className="mt-2 text-xs text-slate-500">No job files yet. Upload photos and documents on the <Link className="text-brand-700" href={`/app/jobs/${id}/field`}>Field</Link> tab.</p>}
          </details>
        )}
      </section>
      <Card title="Invoices on this job">
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices yet. Create tax invoices on the <Link className="text-brand-700" href={`/app/jobs/${id}/billing`}>Billing</Link> tab.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex justify-between gap-2"><Link href={`/app/invoices/${i.id}`} className="font-medium text-slate-800 hover:text-brand-600">#{i.number} · {i.milestone_label || INVOICE_KIND_LABEL[i.kind]}</Link><span className="tabular-nums text-slate-600">balance {money(invBalance(i))}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
