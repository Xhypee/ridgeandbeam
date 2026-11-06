import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DoorKnockSaleBanner } from "@/components/door-knock-banner";
import { SecurityOfPaymentPanel } from "@/components/security-of-payment-panel";
import { StateCompliancePanel } from "@/components/state-compliance-panel";
import { StateNotices, stateNoticeGaps, stateNoticesFor } from "@/components/state-notices";
import { Badge, Card, Empty, Field, Input, Select, cx } from "@/components/ui";
import { AU_STATE_NAME } from "@/lib/au";
import { AU_JOB_TYPES, formatAuDate, ROOF_SYSTEMS } from "@/lib/au-rules";
import { requireMoneyAccess } from "@/lib/dal";
import { checklistProgress, depositReadiness, type ChecklistItem, type ItemStatus } from "@/lib/job-compliance";
import { loadJobCompliance, type JobFileLite } from "@/lib/job-compliance-server";
import { resetComplianceItem, saveComplianceProfile, setComplianceItem } from "./actions";
import { EvidenceUpload } from "./evidence-upload";

export const metadata: Metadata = { title: "Compliance" };

const STATUS: Record<ItemStatus, { label: string; tone: "green" | "amber" | "slate" }> = {
  done: { label: "Done", tone: "green" },
  todo: { label: "To do", tone: "amber" },
  not_needed: { label: "Not needed", tone: "slate" },
};

const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");

export default async function CompliancePage({ params }: PageProps<"/app/jobs/[id]/compliance">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const data = await loadJobCompliance(supabase, org, id);
  if (!data) notFound();
  const { rules, items, profile, files, job } = data;
  const progress = checklistProgress(items);
  const deposit = depositReadiness(items);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const needed = items.filter((i) => i.status !== "not_needed");
  const notNeeded = items.filter((i) => i.status === "not_needed");
  const lic = data.state ? org.licences?.[data.state] : null;
  const noticeInput = data.input && data.state
    ? { ...data.input, state: data.state, business: { name: org.name, licenceNumber: lic?.number ?? null, abn: org.abn, address: org.address, email: org.email, phone: org.phone } }
    : null;
  const notices = noticeInput ? stateNoticesFor(noticeInput) : [];
  const gaps = noticeInput ? stateNoticeGaps(noticeInput) : [];

  return (
    <div className="space-y-6" data-compliance-page>
      {!data.state ? (
        <Empty title="Which state is this job in?">
          Add the site address with its state on the <Link href={`/app/jobs/${id}`} className="font-semibold text-brand-700 underline">job overview</Link> (or set the customer&apos;s state) to build the compliance checklist.
        </Empty>
      ) : (
        <>
          {rules && (
            <section data-deposit-ready={deposit.ready ? "yes" : "no"} className={cx("flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 ring-1", deposit.ready ? "bg-teal-50 ring-teal-200" : "bg-red-50 ring-red-200")}>
              <div className="min-w-0 flex-1 basis-64">
                <p className={cx("text-[13px] font-semibold uppercase tracking-[0.06em]", deposit.ready ? "text-teal-800" : "text-red-700")}>{deposit.ready ? "Deposit invoice ready" : "Deposit invoice not ready"}</p>
                <p className="mt-0.5 text-[15px] font-semibold text-ink">
                  {deposit.ready ? `Nothing in ${AU_STATE_NAME[data.state]} rules is stopping a deposit${rules.deposit.maxAud !== null && rules.deposit.isLegalLimit ? ` (max ${formatMoney(rules.deposit.maxAud)})` : ""}.` : `First: ${deposit.reasons.join("; ")}.`}
                </p>
              </div>
              <Link href={`/app/jobs/${id}/billing`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Billing</Link>
            </section>
          )}

          {data.doorKnock && (
            <DoorKnockSaleBanner state={data.state} doorKnockSale signedAt={data.signedAt} contractValueIncGst={data.value} disasterEmergencyRepair={profile.disaster_emergency_repair} />
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
            <div className="min-w-0 space-y-6">
              {rules ? (
                <Card title={<span>Compliance checklist · {data.state} <span className="font-normal text-slate-500">({progress.done} of {progress.total} done)</span></span>}>
                  {data.valueSource === "latest" && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Using the latest quote ({formatMoney(data.value ?? 0)} incl. GST) — the rules are confirmed when the homeowner signs.</p>}
                  <ul className="space-y-3" data-testid="compliance-checklist">
                    {needed.map((it) => <ItemRow key={it.key} it={it} jobId={id} orgId={job.org_id} files={files} file={it.tick?.file_id ? fileById.get(it.tick.file_id) ?? null : null} />)}
                  </ul>
                  {notNeeded.length > 0 && (
                    <details className="mt-4">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-600">Not needed for this job ({notNeeded.length})</summary>
                      <ul className="mt-2 space-y-2">
                        {notNeeded.map((it) => (
                          <li key={it.key} data-item={it.key} data-status="not_needed" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
                            <span>{it.title}</span>
                            {it.manual && <ResetButton jobId={id} itemKey={it.key} />}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="mt-4 text-xs text-slate-500">Built from {rules.stateName} rules verified {formatAuDate(rules.verifiedOn)}. {rules.disclaimer}</p>
                </Card>
              ) : (
                <Empty title="Price the job to build the checklist">Most state rules depend on the contract value. Create a quote for this job and the checklist appears here.</Empty>
              )}

              {noticeInput && (
                <Card title="Notices for the quote and contract" actions={<span className="text-xs text-slate-500">Saved onto the quote when the homeowner signs</span>}>
                  {gaps.length > 0 && (
                    <ul className="mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="notice-gaps">
                      {gaps.map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  )}
                  {notices.length ? <StateNotices notices={notices} /> : <p className="text-sm text-slate-600">No state notices are required for this job.</p>}
                </Card>
              )}

              <Card title="About this job" actions={<span className="text-xs text-slate-500">Changes which rules apply</span>}>
                <ActionForm action={saveComplianceProfile} className="space-y-4">
                  <input type="hidden" name="job_id" value={id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Roof system">
                      <Select name="roof_system" defaultValue={profile.roof_system ?? data.roofSystem}>
                        {ROOF_SYSTEMS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Job type">
                      <Select name="au_job_type" defaultValue={profile.au_job_type ?? data.jobType}>
                        {AU_JOB_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Does the owner live there?">
                      <Select name="owner_occupier" defaultValue={profile.owner_occupier ? "yes" : "no"}>
                        <option value="yes">Yes — owner-occupier</option>
                        <option value="no">No — landlord / company / builder</option>
                      </Select>
                    </Field>
                    <Field label="Existing house?">
                      <Select name="existing_house" defaultValue={profile.existing_house ? "yes" : "no"}>
                        <option value="yes">Existing house</option>
                        <option value="no">New house / extension</option>
                      </Select>
                    </Field>
                    <Field label="Building permit / approval needed?" hint="Like-for-like re-roofs often don't — check with a certifier.">
                      <Select name="building_approval_required" defaultValue={tri(profile.building_approval_required)}>
                        <option value="">Not decided yet</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Select>
                    </Field>
                    <Field label="Built before 1990?" hint="Fibre-cement may contain asbestos.">
                      <Select name="built_before_1990" defaultValue={tri(profile.built_before_1990)}>
                        <option value="">Don&apos;t know</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Select>
                    </Field>
                    <Field label="Door-knock / cold-call sale?" hint={`Lead source: ${job.lead_source ? job.lead_source.replace(/_/g, " ") : "not set"}`}>
                      <Select name="door_knock_sale" defaultValue={tri(profile.door_knock_sale)}>
                        <option value="">Use the lead source</option>
                        <option value="yes">Yes — unsolicited sale</option>
                        <option value="no">No — the customer asked us</option>
                      </Select>
                    </Field>
                    <Field label="Owner got the signed copy on" hint="Starts most cooling-off periods.">
                      <Input type="date" name="contract_copy_given_on" defaultValue={profile.contract_copy_given_on ?? ""} />
                    </Field>
                  </div>
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="mb-1 text-xs font-medium text-slate-600">Also true for this job</legend>
                    <Check name="urgent_work" on={profile.urgent_work} label="Urgent: delay risks safety or property damage" />
                    <Check name="paint_or_coat_only" on={profile.paint_or_coat_only} label="Only cleaning / painting / coating" />
                    <Check name="mixed_work" on={profile.mixed_work} label="Metal roof plus other building work (battens, carpentry)" />
                    <Check name="subcontract" on={profile.subcontract} label="We're subcontracting to a builder" />
                    <Check name="disaster_emergency_repair" on={profile.disaster_emergency_repair} label="Disaster emergency repair (declared emergency)" />
                  </fieldset>
                  <SubmitButton className="min-h-12 w-full sm:w-auto">Save job details</SubmitButton>
                </ActionForm>
              </Card>
            </div>

            <aside className="min-w-0 space-y-6">
              <StateCompliancePanel
                state={data.state} source={data.stateSource} contractValueIncGst={data.value} contractDate={data.contractDate}
                roofSystem={data.roofSystem} jobType={data.jobType} doorKnockSale={data.doorKnock} ownerOccupier={profile.owner_occupier}
                buildingApprovalRequired={profile.building_approval_required ?? undefined} existingHouse={profile.existing_house} urgentWork={profile.urgent_work}
                paintOrCoatOnly={profile.paint_or_coat_only} mixedWork={profile.mixed_work} subcontract={profile.subcontract}
                disasterEmergencyRepair={profile.disaster_emergency_repair} builtBefore1990={profile.built_before_1990 ?? undefined}
                copyGivenOn={profile.contract_copy_given_on} licenceNumber={data.licenceNumber} compact
              />
              <SecurityOfPaymentPanel state={data.state} ownerOccupier={profile.owner_occupier} subcontract={profile.subcontract} contractValueIncGst={data.value ?? undefined} contractDate={data.contractDate} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const formatMoney = (n: number) => aud.format(n);

function Check({ name, on, label }: { name: string; on: boolean; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl px-3 ring-1 ring-slate-200">
      <input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5 accent-brand-600" />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function ResetButton({ jobId, itemKey }: { jobId: string; itemKey: string }) {
  return (
    <ActionForm action={resetComplianceItem}>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="item_key" value={itemKey} />
      <SubmitButton variant="ghost" className="min-h-9 px-2 text-xs">Back to automatic</SubmitButton>
    </ActionForm>
  );
}

function ItemRow({ it, jobId, orgId, files, file }: { it: ChecklistItem; jobId: string; orgId: string; files: JobFileLite[]; file: JobFileLite | null }) {
  const s = STATUS[it.status];
  return (
    <li data-item={it.key} data-status={it.status} className={cx("rounded-2xl p-4 ring-1", it.status === "done" ? "bg-green-50/60 ring-green-200" : it.blocksDeposit ? "bg-white ring-red-300" : "bg-white ring-slate-200")}>
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", it.status === "done" ? "bg-green-600 text-white" : "bg-slate-200 text-slate-500")}>{it.status === "done" ? "✓" : ""}</span>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{it.title}</p>
            <Badge tone={s.tone}>{s.label}</Badge>
            {it.blocksDeposit && <Badge tone="red">Blocks deposit</Badge>}
            {it.manual && <span className="text-xs text-slate-500">ticked{it.tick?.updated_by_name ? ` by ${it.tick.updated_by_name}` : ""}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-600">{it.detail}</p>
          {it.due && it.status !== "done" && <p className="mt-1 text-sm font-semibold text-ink">Date: {formatAuDate(it.due)}</p>}
          {it.link && <a href={it.link.url} target={it.link.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-brand-700 underline underline-offset-2">{it.link.label}{it.link.url.startsWith("/") ? "" : " ↗"}</a>}
          {(it.tick?.reference || it.tick?.note) && <p className="mt-1 text-sm text-slate-700">{it.tick?.reference && <span className="font-semibold">Ref {it.tick.reference}. </span>}{it.tick?.note}</p>}
          {file && (
            <p className="mt-1 text-sm">
              Evidence: {file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline underline-offset-2" data-evidence-link>{file.caption ?? "file"}</a> : <span className="font-semibold">{file.caption ?? "file"}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <ActionForm action={setComplianceItem} className="min-w-0 flex-1 basis-72">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="item_key" value={it.key} />
          <details className="mb-2">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-slate-600">Note, reference or existing file</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Reference (e.g. certificate no.)"><Input name="reference" defaultValue={it.tick?.reference ?? ""} maxLength={200} /></Field>
              <Field label="Link an existing job file">
                <Select name="file_id" defaultValue={it.tick?.file_id ?? ""}>
                  <option value="">No file</option>
                  {files.map((f) => <option key={f.id} value={f.id}>{(f.caption ?? f.storage_path.split("/").pop() ?? "file").slice(0, 60)} · {formatAuDate(f.created_at.slice(0, 10))}</option>)}
                </Select>
              </Field>
              <Field label="Note" className="sm:col-span-2"><Input name="note" defaultValue={it.tick?.note ?? ""} maxLength={1000} /></Field>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="status" value="done" variant={it.status === "done" ? "primary" : "secondary"}>Done</SubmitButton>
            <SubmitButton name="status" value="todo" variant="secondary">To do</SubmitButton>
            <SubmitButton name="status" value="not_needed" variant="ghost">Not needed</SubmitButton>
          </div>
        </ActionForm>
        <div className="flex flex-wrap items-center gap-2">
          {it.wantsEvidence && <EvidenceUpload orgId={orgId} jobId={jobId} itemKey={it.key} title={it.title} />}
          {it.manual && <ResetButton jobId={jobId} itemKey={it.key} />}
        </div>
      </div>
    </li>
  );
}
