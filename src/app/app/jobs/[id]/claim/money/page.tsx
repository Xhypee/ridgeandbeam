import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money } from "@/lib/format";
import {
  CHECK_KIND_LABEL,
  CHECK_KINDS,
  DOC_LABEL,
  DOC_STATUS_TONE,
  DOC_STATUSES,
  ENDORSEMENT_LABEL,
  ENDORSEMENT_TONE,
  ENDORSEMENTS,
  PAYER_LABEL,
  PAYERS,
  type Endorsement,
} from "@/lib/claims";
import { INVOICE_KIND_LABEL, type InvoiceKind } from "@/lib/claims-billing";
import { getClaimForJob, type ClaimCheck, type ClaimDocument } from "@/lib/claims-server";
import { addCheck, deleteCheck, generateExpectedChecks, recordCheck, setEndorsement, updateDocument } from "../actions";

export const metadata: Metadata = { title: "Claim money" };

const NEXT_ENDORSEMENT: Partial<Record<Endorsement, Endorsement>> = { needed: "sent_to_lender", sent_to_lender: "endorsed" };
const DOC_ORDER = ["w9", "contract", "scope", "coc", "final_invoice", "lien_waiver", "license_coi", "photos", "endorsed_check", "other"];

export default async function ClaimMoneyPage({ params }: PageProps<"/app/jobs/[id]/claim/money">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const [{ data: checkRows }, { data: docRows }, { data: invRows }, { data: fileRows }] = await Promise.all([
    supabase.from("claim_checks").select("*").eq("claim_id", claim.id).order("created_at"),
    supabase.from("claim_documents").select("*").eq("claim_id", claim.id),
    supabase.from("invoices").select("id, number, kind, status, milestone_label, bill_to, invoice_totals(balance)").eq("job_id", id).neq("status", "void").order("number"),
    supabase.from("job_files").select("id, kind, caption, category, created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const checks = (checkRows ?? []) as ClaimCheck[];
  const docs = ((docRows ?? []) as ClaimDocument[]).sort((a, b) => DOC_ORDER.indexOf(a.doc_type) - DOC_ORDER.indexOf(b.doc_type));
  type Inv = { id: string; number: number; kind: InvoiceKind; status: string; milestone_label: string | null; bill_to: string; invoice_totals: { balance: number } | { balance: number }[] | null };
  const invoices = (invRows ?? []) as unknown as Inv[];
  const invBalance = (i: Inv) => Number((Array.isArray(i.invoice_totals) ? i.invoice_totals[0] : i.invoice_totals)?.balance ?? 0);
  const invNumber = new Map<string, number>();
  if (checks.some((c) => c.payment_id)) {
    const { data: pays } = await supabase.from("payments").select("id, invoices(number)").in("id", checks.filter((c) => c.payment_id).map((c) => c.payment_id!));
    for (const p of pays ?? []) invNumber.set(p.id, (p.invoices as unknown as { number: number }).number);
  }
  const files = (fileRows ?? []) as { id: string; kind: string; caption: string | null; category: string; created_at: string }[];
  const fileLabel = (f: (typeof files)[number]) => `${f.caption || label(f.category)} (${label(f.kind)}, ${date(f.created_at, { month: "short", day: "numeric" })})`;

  const totals = checks.reduce(
    (t, c) => ({ expected: t.expected + Number(c.expected_amount), received: t.received + Number(c.received_amount), outstanding: t.outstanding + Math.max(0, Number(c.expected_amount) - Number(c.received_amount)) }),
    { expected: 0, received: 0, outstanding: 0 },
  );
  const docsDone = docs.filter((d) => d.status === "accepted" || d.status === "sent").length;

  return (
    <div className="space-y-6">
      <Card
        title="Insurance ledger"
        actions={
          <ActionForm action={generateExpectedChecks}>
            <input type="hidden" name="claim_id" value={claim.id} />
            <SubmitButton variant="secondary">Generate expected checks</SubmitButton>
          </ActionForm>
        }
      >
        <p className="mb-4 text-sm text-slate-600">
          Every check you&apos;re owed on this claim, expected vs received. &ldquo;Generate expected checks&rdquo; builds the list from the claim&apos;s RCV, depreciation and deductible.
          {claim.mortgagee_name && <> Checks are likely co-payable to <b>{claim.mortgagee_name}</b> and need their endorsement.</>}
        </p>
        <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Expected</dt><dd className="font-semibold tabular-nums">{money(totals.expected)}</dd></div>
          <div className="rounded-lg bg-green-50 p-2"><dt className="text-xs text-green-700">Received</dt><dd className="font-semibold tabular-nums text-green-900">{money(totals.received)}</dd></div>
          <div className={cx("rounded-lg p-2", totals.outstanding > 0 ? "bg-amber-50" : "bg-slate-50")}><dt className="text-xs text-slate-500">Still owed</dt><dd className="font-semibold tabular-nums">{money(totals.outstanding)}</dd></div>
        </dl>
        {checks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No checks yet. Enter the carrier numbers on the Overview, then generate expected checks.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" data-testid="ledger">
            {checks.map((c) => {
              const owed = Math.max(0, Number(c.expected_amount) - Number(c.received_amount));
              const nextE = NEXT_ENDORSEMENT[c.endorsement];
              return (
                <li key={c.id} className="p-3" data-check-kind={c.kind}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{c.label || CHECK_KIND_LABEL[c.kind]}</p>
                      <p className="text-xs text-slate-500">
                        {CHECK_KIND_LABEL[c.kind]} · from {PAYER_LABEL[c.payer]}
                        {c.check_number && ` · check #${c.check_number}`}
                        {c.received_on && ` · received ${date(c.received_on)}`}
                        {c.payment_id && invNumber.has(c.payment_id) && ` · applied to invoice #${invNumber.get(c.payment_id)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums text-sm"><span className="text-slate-500">Expected</span> {money(c.expected_amount)}</p>
                      <p className="tabular-nums text-sm"><span className="text-slate-500">Received</span> <b>{money(c.received_amount)}</b></p>
                      {owed > 0 ? <Badge tone="amber">Owed {money(owed)}</Badge> : <Badge tone="green">Paid</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={ENDORSEMENT_TONE[c.endorsement]}>{ENDORSEMENT_LABEL[c.endorsement]}</Badge>
                    {nextE && (
                      <form action={setEndorsement}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="endorsement" value={nextE} />
                        <SubmitButton variant="ghost" className="min-h-11 text-brand-700">Mark {ENDORSEMENT_LABEL[nextE].toLowerCase()}</SubmitButton>
                      </form>
                    )}
                  </div>
                  <details className="mt-2 group">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700">{Number(c.received_amount) > 0 ? "Edit received check" : "Record check received"}</summary>
                    <ActionForm action={recordCheck} className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Amount received"><Input name="received_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(c.received_amount) || Number(c.expected_amount) || ""} /></Field>
                      <Field label="Date received"><Input name="received_on" type="date" defaultValue={c.received_on ?? isoDate(new Date())} /></Field>
                      <Field label="Check #"><Input name="check_number" defaultValue={c.check_number ?? ""} /></Field>
                      <Field label="Endorsement">
                        <Select name="endorsement" defaultValue={c.endorsement}>{ENDORSEMENTS.map((e) => <option key={e} value={e}>{ENDORSEMENT_LABEL[e]}</option>)}</Select>
                      </Field>
                      {!c.payment_id ? (
                        <Field label="Also record as a payment on invoice (optional)" className="sm:col-span-2">
                          <Select name="invoice_id" defaultValue="">
                            <option value="">Don&apos;t apply to an invoice</option>
                            {invoices.map((i) => (
                              <option key={i.id} value={i.id}>
                                #{i.number} · {i.milestone_label || INVOICE_KIND_LABEL[i.kind] || "Invoice"} · balance {money(invBalance(i))}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : (
                        <p className="text-xs text-slate-500 sm:col-span-2">Applied to an invoice payment; changing the amount updates that payment too.</p>
                      )}
                      <Field label="Notes" className="sm:col-span-2"><Input name="notes" defaultValue={c.notes ?? ""} /></Field>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <SubmitButton className="min-h-11">Save check</SubmitButton>
                      </div>
                    </ActionForm>
                    {!c.payment_id && (
                      <form action={deleteCheck} className="mt-2">
                        <input type="hidden" name="id" value={c.id} />
                        <SubmitButton variant="ghost" confirm="Remove this check from the ledger?">Remove from ledger</SubmitButton>
                      </form>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-700">+ Add another expected check</summary>
          <ActionForm action={addCheck} className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <input type="hidden" name="claim_id" value={claim.id} />
            <Field label="Kind"><Select name="kind" defaultValue="other">{CHECK_KINDS.map((k) => <option key={k} value={k}>{CHECK_KIND_LABEL[k]}</option>)}</Select></Field>
            <Field label="From"><Select name="payer" defaultValue="carrier">{PAYERS.map((p) => <option key={p} value={p}>{PAYER_LABEL[p]}</option>)}</Select></Field>
            <Field label="Label"><Input name="label" placeholder="e.g. Gutters (separate check)" /></Field>
            <Field label="Expected amount"><Input name="expected_amount" type="number" step="0.01" min="0.01" inputMode="decimal" required /></Field>
            <div className="sm:col-span-2"><SubmitButton variant="secondary" className="min-h-11">Add check</SubmitButton></div>
          </ActionForm>
        </details>
      </Card>

      <Card title={<>Loss-draft paperwork <span className="font-normal text-slate-500">· {docsDone} of {docs.length} sent</span></>}>
        <p className="mb-4 text-sm text-slate-600">
          What the mortgage company&apos;s loss-draft department usually needs before endorsing a check. Missing paperwork — not denials — is the most common reason money is held up.
          {claim.loss_draft_contact && <> Contact: <b>{claim.loss_draft_contact}</b>.</>}
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {docs.map((d) => (
            <li key={d.id} className="p-3" data-doc={d.doc_type}>
              <ActionForm action={updateDocument} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_8rem_minmax(0,1.3fr)_9rem_auto]">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="notes" value={d.notes ?? ""} />
                <div className="min-w-0 self-center">
                  <p className="text-sm font-medium text-slate-900">{DOC_LABEL[d.doc_type] ?? label(d.doc_type)}</p>
                  <Badge tone={DOC_STATUS_TONE[d.status]}>{label(d.status)}{d.sent_on ? ` ${date(d.sent_on, { month: "short", day: "numeric" })}` : ""}</Badge>
                </div>
                <Field label="Status">
                  <Select name="status" defaultValue={d.status} aria-label={`${DOC_LABEL[d.doc_type] ?? d.doc_type} status`}>{DOC_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                </Field>
                <Field label="Linked file">
                  <Select name="file_id" defaultValue={d.file_id ?? ""}>
                    <option value="">None</option>
                    {files.map((f) => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}
                  </Select>
                </Field>
                <Field label="Sent on"><Input name="sent_on" type="date" defaultValue={d.sent_on ?? ""} /></Field>
                <SubmitButton variant="secondary" className="min-h-11">Save</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        {files.length === 0 && <p className="mt-3 text-xs text-slate-500">No job files yet. Upload photos and documents on the <Link className="text-brand-700" href={`/app/jobs/${id}/field`}>Field</Link> tab, then link them here.</p>}
      </Card>
    </div>
  );
}
