import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, daysSince, money, STAGE_LABEL, STATUS_TONE, label } from "@/lib/format";
import { JOB_STAGES, type Crew, type Customer, type Job } from "@/lib/types";
import { addNote, deleteJob, scheduleJob, setStage, updateJob } from "../actions";
import { JobFields } from "../job-fields";
import { addFinancingApplication, markContacted, saveLeadInfo, setFinancingStatus, undoContacted } from "../lead-actions";
import { LeadTimer } from "../lead-timer";
import { displayName, durationLabel, minutesBetween, orgPeople } from "../people";

type LeadCols = {
  assigned_to: string | null; sales_rep_id: string | null; setter_id: string | null; lead_source: string | null;
  lead_received_at: string; first_contacted_at: string | null; bid_due_on: string | null; stage_changed_at: string;
};
type FinApp = { id: string; lender: string; amount: number; status: string; dealer_fee_pct: number; notes: string | null; created_at: string; funded_on: string | null };
const FIN_STATUSES = ["link_sent", "prequalified", "approved", "declined", "funded", "cancelled"];
const SOURCE_SUGGESTIONS = ["website", "instant_quote", "google_ads", "facebook", "angi", "referral", "door_knock", "storm", "repeat", "yard_sign", "other"];
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x);

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { supabase, isAdmin, canSeeMoney, isCrewLead, org } = await requireOrg();
  const empty = Promise.resolve({ data: [] as never[] });
  const [{ data: j }, { data: crews }, { data: notes }, { data: estimates }, { data: invoices }, { data: finApps }, people] = await Promise.all([
    supabase.from("jobs").select("*, customers(*)").eq("id", id).maybeSingle(),
    supabase.from("crews").select("id, name, color").order("name"),
    supabase.from("job_notes").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    canSeeMoney ? supabase.from("estimates").select("id, number, status, created_at, estimate_totals(total)").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    canSeeMoney ? supabase.from("invoices").select("id, number, status, issue_date, invoice_totals(total, balance)").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    canSeeMoney ? supabase.from("financing_applications").select("*").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    orgPeople(supabase, org.id),
  ]);
  if (!j) notFound();
  const job = j as Job & LeadCols & { customers: Customer };
  const c = job.customers;
  const responseMin = minutesBetween(job.lead_received_at, job.first_contacted_at);
  const salesPeople = people.list.filter((p) => p.role !== "crew_lead");
  const lenders = org.financing?.lenders ?? [];
  const fin = (finApps ?? []) as FinApp[];

  return (
    <>
      {!isCrewLead && (
        <Card className="mb-6" title="Lead" actions={job.lead_source ? <Badge>{label(job.lead_source)}</Badge> : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            {job.first_contacted_at ? (
              <>
                <span className="text-sm text-slate-700">
                  Contacted {new Date(job.first_contacted_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  <b data-response-time className={cx(responseMin !== null && responseMin <= 5 ? "text-green-700" : responseMin !== null && responseMin <= 60 ? "text-amber-700" : "text-red-700")}>
                    response time {durationLabel(responseMin)}
                  </b>
                </span>
                <form action={undoContacted}><input type="hidden" name="id" value={job.id} /><SubmitButton variant="ghost">Undo</SubmitButton></form>
              </>
            ) : (
              <>
                <LeadTimer since={job.lead_received_at} />
                <span className="text-sm text-slate-600">Came in {new Date(job.lead_received_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                {c.phone && <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Call {c.phone}</a>}
                <form action={markContacted}><input type="hidden" name="id" value={job.id} /><SubmitButton className="min-h-11">Mark contacted</SubmitButton></form>
              </>
            )}
          </div>
          <ActionForm action={saveLeadInfo} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="id" value={job.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {([["assigned_to", "Assigned to"], ["sales_rep_id", "Sales rep"], ["setter_id", "Setter / canvasser"]] as const).map(([k, l]) => (
                <Field key={k} label={l}>
                  <Select name={k} defaultValue={job[k] ?? ""}>
                    <option value="">Nobody</option>
                    {salesPeople.map((p) => <option key={p.user_id} value={p.user_id}>{displayName(p)}</option>)}
                  </Select>
                </Field>
              ))}
              <Field label="Lead source">
                <Input name="lead_source" list="lead-sources" defaultValue={job.lead_source ?? ""} placeholder="website, angi…" />
                <datalist id="lead-sources">{SOURCE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Bid due (commercial)"><Input type="date" name="bid_due_on" defaultValue={job.bid_due_on ?? ""} /></Field>
            </div>
            <div className="mt-3"><SubmitButton variant="secondary">Save lead info</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      <Card className="mb-6" title="Pipeline stage" actions={<span className="text-xs text-slate-500">{daysSince(job.stage_changed_at)} days in stage</span>}>
        <form action={setStage} className="flex flex-wrap gap-1.5">
          <input type="hidden" name="id" value={job.id} />
          {JOB_STAGES.map((s) => (
            <button
              key={s}
              name="stage"
              value={s}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition",
                s === job.stage ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-slate-600 ring-slate-200 hover:ring-brand-500",
              )}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {canSeeMoney && (
            <>
              <Card title="Estimates">
                {(estimates ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No estimates yet. Use <b>New estimate</b> to measure the roof and build a quote.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {(estimates ?? []).map((e) => {
                      const total = one(e.estimate_totals as unknown as { total: number }[] | { total: number } | null)?.total;
                      return (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <Link href={`/app/estimates/${e.id}`} className="text-sm font-medium hover:text-brand-600">Estimate #{e.number}</Link>
                          <span className="flex items-center gap-3 text-sm">
                            {e.status === "draft" && <Link href={`/app/measure/${e.id}`} className="text-xs font-medium text-brand-600 hover:underline">Measure on map</Link>}
                            {money(total)}
                            <Badge tone={STATUS_TONE[e.status]}>{label(e.status)}</Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card title="Invoices">
                {(invoices ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No invoices yet. Accepted estimates can be turned into an invoice in one click.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {(invoices ?? []).map((v) => {
                      const tot = one(v.invoice_totals as unknown as { total: number; balance: number }[] | { total: number; balance: number } | null);
                      return (
                        <li key={v.id}>
                          <Link href={`/app/invoices/${v.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-brand-600">
                            <span className="text-sm font-medium">Invoice #{v.number}</span>
                            <span className="flex items-center gap-3 text-sm">
                              {money(tot?.total)}
                              {Number(tot?.balance) > 0 && v.status !== "draft" && <span className="text-xs text-slate-500">{money(tot?.balance)} due</span>}
                              <Badge tone={STATUS_TONE[v.status]}>{label(v.status)}</Badge>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card title="Financing">
                {fin.length > 0 && (
                  <ul className="mb-4 divide-y divide-slate-100">
                    {fin.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-financing={f.status}>
                        <span className="min-w-0">
                          <span className="font-medium">{f.lender}</span> · {money(f.amount)} · dealer fee {Number(f.dealer_fee_pct)}% ({money((Number(f.amount) * Number(f.dealer_fee_pct)) / 100)})
                          {f.status === "funded" && <span className="block text-xs text-slate-500">Funded{f.funded_on ? ` ${date(f.funded_on)}` : ""} · dealer fee posted to Job cost</span>}
                        </span>
                        <form action={setFinancingStatus} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={f.id} />
                          <Select name="status" defaultValue={f.status} aria-label="Financing status" className="w-36">
                            {FIN_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                          </Select>
                          <SubmitButton variant="secondary">Update</SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={addFinancingApplication} className="space-y-3">
                  <input type="hidden" name="job_id" value={job.id} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Lender">
                      <Input name="lender" list="lenders" required placeholder="GreenSky, Service Finance…" />
                      <datalist id="lenders">{lenders.map((l) => <option key={l.name} value={l.name} />)}</datalist>
                    </Field>
                    <Field label="Amount ($)"><Input name="amount" type="number" min={1} step="0.01" required /></Field>
                    <Field label="Dealer fee %"><Input name="dealer_fee_pct" type="number" min={0} max={40} step="0.01" defaultValue={lenders[0]?.dealer_fee_pct ?? 0} /></Field>
                    <Field label="Status">
                      <Select name="status" defaultValue="link_sent">{FIN_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                    </Field>
                  </div>
                  <SubmitButton variant="secondary">Record financing</SubmitButton>
                  <p className="text-xs text-slate-500">Mark an application <b>Funded</b> and its dealer fee is added to Job cost automatically, so margin stays honest.</p>
                </ActionForm>
              </Card>
            </>
          )}

          <Card title="Notes & activity">
            <ActionForm action={addNote} className="mb-4">
              <input type="hidden" name="job_id" value={job.id} />
              <Textarea name="body" placeholder="Inspection findings, calls with the adjuster, crew notes…" required />
              <div className="mt-2"><SubmitButton variant="secondary">Add note</SubmitButton></div>
            </ActionForm>
            <ul className="space-y-3">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{n.author_name} · {new Date(n.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Schedule">
            <ActionForm action={scheduleJob} className="space-y-3">
              <input type="hidden" name="id" value={job.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><Input type="date" name="scheduled_start" defaultValue={job.scheduled_start ?? ""} /></Field>
                <Field label="End"><Input type="date" name="scheduled_end" defaultValue={job.scheduled_end ?? ""} /></Field>
              </div>
              <Field label="Crew">
                <Select name="crew_id" defaultValue={job.crew_id ?? ""}>
                  <option value="">Unassigned</option>
                  {((crews ?? []) as Crew[]).map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
                </Select>
              </Field>
              {(crews ?? []).length === 0 && <p className="text-xs text-slate-500">Add crews in <Link className="underline" href="/app/settings/crews">Settings</Link>.</p>}
              <SubmitButton variant="secondary">Save schedule</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Customer">
            <dl className="space-y-1.5 text-sm">
              {c.phone && <div><dt className="sr-only">Phone</dt><dd><a className="text-brand-600 hover:underline" href={`tel:${c.phone}`}>{c.phone}</a></dd></div>}
              {c.email && <div><dt className="sr-only">Email</dt><dd className="break-all"><a className="text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
              {c.insurance_company && <div className="pt-2 text-slate-600"><dt className="text-xs text-slate-400">Insurance</dt><dd>{c.insurance_company}{c.claim_number && ` · Claim ${c.claim_number}`}</dd></div>}
              {c.adjuster_name && <div className="text-slate-600"><dt className="text-xs text-slate-400">Adjuster</dt><dd>{c.adjuster_name} {c.adjuster_phone}</dd></div>}
            </dl>
          </Card>

          <Card title="Job details">
            <ActionForm action={updateJob} className="space-y-4">
              <input type="hidden" name="id" value={job.id} />
              <JobFields j={job} />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>

          {isAdmin && (
            <form action={deleteJob} className="text-right">
              <input type="hidden" name="id" value={job.id} />
              <SubmitButton variant="danger" confirm="Delete this job and its estimates and invoices?">Delete job</SubmitButton>
            </form>
          )}
          <p className="text-right text-xs text-slate-400">Created {date(job.created_at)}</p>
        </div>
      </div>
    </>
  );
}
