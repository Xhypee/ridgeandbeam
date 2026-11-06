import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, daysSince, money, STAGE_LABEL, STATUS_TONE, label } from "@/lib/format";
import { EVENT_LABEL } from "@/lib/field";
import { jobReadiness, type ReadinessJob } from "@/lib/production";
import { readinessContexts } from "@/lib/production-data";
import { JOB_STAGES, type Crew, type Customer, type Job } from "@/lib/types";
import { createEstimate } from "../../estimates/actions";
import { createInvoice } from "../../invoices/actions";
import { addNote, deleteJob, scheduleJob, setStage, updateJob } from "../actions";
import { JobFields } from "../job-fields";
import { addFinancingApplication, markContacted, saveLeadInfo, setFinancingStatus, undoContacted } from "../lead-actions";
import { LeadTimer } from "../lead-timer";
import { displayName, durationLabel, minutesBetween, orgPeople } from "../people";

type LeadCols = {
  assigned_to: string | null; sales_rep_id: string | null; setter_id: string | null; lead_source: string | null;
  lead_received_at: string; first_contacted_at: string | null; bid_due_on: string | null; stage_changed_at: string;
  permit_number: string | null; schedule_locked: boolean;
};
type FinApp = { id: string; lender: string; amount: number; status: string; dealer_fee_pct: number; notes: string | null; created_at: string; funded_on: string | null };
const FIN_STATUSES = ["link_sent", "prequalified", "approved", "declined", "funded", "cancelled"];
const SOURCE_SUGGESTIONS = ["website", "instant_quote", "google_ads", "facebook", "hipages", "angi", "referral", "door_knock", "storm", "repeat", "yard_sign", "other"];
/** Readiness gates in Australian wording (HOA → strata / body corporate, dumpster → skip bin). */
const READY_AU: Record<string, string> = { permit: "Building permit", hoa: "Strata / body corporate", colors: "Colours confirmed", materials: "Materials", dumpster: "Skip bin", deposit: "Deposit" };
const human = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
type Activity = { id: string; at: string; title: string; body: string | null; by: string | null };
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x);

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { supabase, isAdmin, canSeeMoney, isCrewLead, org } = await requireOrg();
  // Crew leads work from Field and Build only.
  if (isCrewLead) redirect(`/app/jobs/${id}/field`);
  const empty = Promise.resolve({ data: [] as never[] });
  const [{ data: j }, { data: crews }, { data: notes }, { data: estimates }, { data: invoices }, { data: finApps }, people, { data: events }, rctxMap] = await Promise.all([
    supabase.from("jobs").select("*, customers(*)").eq("id", id).maybeSingle(),
    supabase.from("crews").select("id, name, color").order("name"),
    supabase.from("job_notes").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    canSeeMoney ? supabase.from("estimates").select("id, number, status, created_at, estimate_totals(total)").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    canSeeMoney ? supabase.from("invoices").select("id, number, status, issue_date, invoice_totals(total, balance)").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    canSeeMoney ? supabase.from("financing_applications").select("*").eq("job_id", id).order("created_at", { ascending: false }) : empty,
    orgPeople(supabase, org.id),
    supabase.from("job_events").select("id, kind, note, created_at, created_by_name").eq("job_id", id).order("created_at", { ascending: false }).limit(20),
    readinessContexts(supabase, [id]),
  ]);
  if (!j) notFound();
  const job = j as Job & LeadCols & { customers: Customer };
  const c = job.customers;
  const responseMin = minutesBetween(job.lead_received_at, job.first_contacted_at);
  const salesPeople = people.list.filter((p) => p.role !== "crew_lead");
  const lenders = org.financing?.lenders ?? [];
  const fin = (finApps ?? []) as FinApp[];
  const preBuild = ["sold", "scheduled"].includes(job.stage);
  const readiness = preBuild ? jobReadiness(job as unknown as ReadinessJob, rctxMap.get(job.id) ?? { depositReceived: false }) : null;
  const crew = ((crews ?? []) as Crew[]).find((cr) => cr.id === job.crew_id);
  const activity: Activity[] = [
    ...(notes ?? []).map((n) => ({ id: n.id as string, at: n.created_at as string, title: "", body: n.body as string, by: n.author_name as string | null })),
    ...(events ?? []).filter((e) => e.kind !== "note" || e.note).map((e) => ({ id: e.id as string, at: e.created_at as string, title: EVENT_LABEL[e.kind] ?? human(e.kind), body: e.note as string | null, by: e.created_by_name as string | null })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        {readiness && (
          <section aria-labelledby="h-ready" data-ready-panel className="rounded-[18px] bg-white p-6 ring-1 ring-slate-200">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="h-ready" className="text-lg font-bold text-ink">Ready to build?</h2>
              <span className="text-sm text-slate-500">{readiness.done} of {readiness.total} ready · The schedule locks when all {readiness.total} are done.</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {readiness.items.map((i) => (
                <Link key={i.key} href={i.key === "deposit" ? `/app/jobs/${job.id}/billing` : `/app/jobs/${job.id}/production`} data-ready={i.key} data-ok={i.ok ? "true" : "false"}
                  className={cx("flex min-h-16 items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 transition hover:ring-brand-400", i.ok ? "bg-green-50 ring-green-200" : "bg-white ring-slate-200")}>
                  <span aria-hidden className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", i.ok ? "bg-green-700 text-white" : "ring-2 ring-inset ring-slate-300")}>{i.ok ? "✓" : ""}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-ink">{READY_AU[i.key] ?? i.label}</span>
                    <span className="block truncate text-[13px] text-slate-500">{i.key === "permit" && job.permit_number ? `${human(i.detail)} · #${job.permit_number}` : human(i.detail)}</span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
              <span>
                {job.scheduled_start ? <b>{date(job.scheduled_start, { day: "numeric", month: "short" })}{job.scheduled_end && job.scheduled_end !== job.scheduled_start ? `–${date(job.scheduled_end, { day: "numeric", month: "short" })}` : ""}</b> : <b>No dates yet</b>}
                {" · "}{crew?.name ?? "No crew"}
              </span>
              <span className="ml-auto font-bold">{job.schedule_locked ? "Locked" : readiness.ready ? "Ready to lock" : "Tentative"}</span>
            </div>
          </section>
        )}

        {canSeeMoney && (
          <>
            <Card title={<span id="quotes">Quotes</span>} actions={<form action={createEstimate}><input type="hidden" name="job_id" value={job.id} /><SubmitButton variant="secondary">New quote</SubmitButton></form>}>
              {(estimates ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No quotes yet. Use <b>New quote</b> to measure the roof and build the options.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(estimates ?? []).map((e) => {
                    const total = one(e.estimate_totals as unknown as { total: number }[] | { total: number } | null)?.total;
                    return (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <Link href={`/app/estimates/${e.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold hover:text-brand-600">Quote #{e.number}</Link>
                        <span className="flex items-center gap-3 text-sm">
                          {e.status === "draft" && <Link href={`/app/measure/${e.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Measure on map</Link>}
                          {money(total)}
                          <Badge tone={STATUS_TONE[e.status]}>{e.status === "accepted" ? "Signed" : label(e.status)}</Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Invoices" actions={<form action={createInvoice}><input type="hidden" name="job_id" value={job.id} /><SubmitButton variant="secondary">New invoice</SubmitButton></form>}>
              {(invoices ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No invoices yet. A signed quote becomes an invoice in one click, or set up the payment schedule on <Link className="font-semibold text-brand-600" href={`/app/jobs/${job.id}/billing`}>Paid</Link>.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(invoices ?? []).map((v) => {
                    const tot = one(v.invoice_totals as unknown as { total: number; balance: number }[] | { total: number; balance: number } | null);
                    return (
                      <li key={v.id}>
                        <Link href={`/app/invoices/${v.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-brand-600">
                          <span className="text-sm font-semibold">Invoice #{v.number}</span>
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
          </>
        )}

        <Card title="Notes & activity">
          <ActionForm action={addNote} className="mb-4">
            <input type="hidden" name="job_id" value={job.id} />
            <Textarea name="body" placeholder="Inspection findings, calls with the assessor, crew notes…" required />
            <div className="mt-2"><SubmitButton variant="secondary">Add note</SubmitButton></div>
          </ActionForm>
          {activity.length === 0 ? <p className="text-sm text-slate-500">Nothing yet. Notes, field updates and approvals show up here.</p> : (
            <ul className="divide-y divide-slate-100" data-activity>
              {activity.map((a) => (
                <li key={a.id} className="py-3 text-sm">
                  <p className="whitespace-pre-wrap break-words text-slate-800">
                    {a.title && <b className="text-ink">{a.title}{a.body ? " · " : ""}</b>}
                    {a.body}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{[a.by, new Date(a.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canSeeMoney && (
          <Card title="Finance">
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
                      <Select name="status" defaultValue={f.status} aria-label="Finance status" className="w-36">
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
                  <Input name="lender" list="lenders" required placeholder="Brighte, Humm…" />
                  <datalist id="lenders">{lenders.map((l) => <option key={l.name} value={l.name} />)}</datalist>
                </Field>
                <Field label="Amount ($)"><Input name="amount" type="number" min={1} step="0.01" required /></Field>
                <Field label="Dealer fee %"><Input name="dealer_fee_pct" type="number" min={0} max={40} step="0.01" defaultValue={lenders[0]?.dealer_fee_pct ?? 0} /></Field>
                <Field label="Status">
                  <Select name="status" defaultValue="link_sent">{FIN_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                </Field>
              </div>
              <SubmitButton variant="secondary">Record finance</SubmitButton>
              <p className="text-xs text-slate-500">Mark an application <b>Funded</b> and its dealer fee is added to Job cost automatically, so margin stays honest.</p>
            </ActionForm>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <Card title="Lead" actions={job.lead_source ? <Badge>{label(job.lead_source)}</Badge> : undefined}>
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
                <form action={markContacted}><input type="hidden" name="id" value={job.id} /><SubmitButton>Mark contacted</SubmitButton></form>
              </>
            )}
          </div>
          <ActionForm action={saveLeadInfo} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="id" value={job.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {([["assigned_to", "Assigned to"], ["sales_rep_id", "Sales rep"], ["setter_id", "Setter / door knocker"]] as const).map(([k, l]) => (
                <Field key={k} label={l}>
                  <Select name={k} defaultValue={job[k] ?? ""}>
                    <option value="">Nobody</option>
                    {salesPeople.map((p) => <option key={p.user_id} value={p.user_id}>{displayName(p)}</option>)}
                  </Select>
                </Field>
              ))}
              <Field label="Lead source">
                <Input name="lead_source" list="lead-sources" defaultValue={job.lead_source ?? ""} placeholder="website, hipages…" />
                <datalist id="lead-sources">{SOURCE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Tender due (commercial)"><Input type="date" name="bid_due_on" defaultValue={job.bid_due_on ?? ""} /></Field>
            </div>
            <div className="mt-3"><SubmitButton variant="secondary">Save lead info</SubmitButton></div>
          </ActionForm>
        </Card>

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

        <Card title="Customer" actions={<Link href={`/app/customers/${c.id}`} className="text-sm font-semibold text-brand-600">Open record</Link>}>
          <dl className="space-y-1.5 text-sm">
            <div><dt className="sr-only">Name</dt><dd className="font-semibold text-ink">{c.name}</dd></div>
            {c.phone && <div><dt className="sr-only">Phone</dt><dd><a className="text-brand-600 hover:underline" href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a></dd></div>}
            {c.email && <div><dt className="sr-only">Email</dt><dd className="break-all"><a className="text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
            {c.insurance_company && <div className="pt-2 text-slate-600"><dt className="text-xs text-slate-400">Insurer</dt><dd>{c.insurance_company}{c.claim_number && ` · Claim ${c.claim_number}`}</dd></div>}
            {c.adjuster_name && <div className="text-slate-600"><dt className="text-xs text-slate-400">Assessor</dt><dd>{c.adjuster_name} {c.adjuster_phone}</dd></div>}
          </dl>
        </Card>

        <Card title={<span id="stage">Pipeline stage</span>} actions={<span className="text-xs text-slate-500">{daysSince(job.stage_changed_at)} days in stage</span>}>
          <form action={setStage} className="flex flex-wrap gap-1.5">
            <input type="hidden" name="id" value={job.id} />
            {JOB_STAGES.map((s) => (
              <button
                key={s}
                name="stage"
                value={s}
                aria-pressed={s === job.stage}
                className={cx(
                  "min-h-9 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition",
                  s === job.stage ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-slate-600 ring-slate-200 hover:ring-brand-500",
                )}
              >
                {STAGE_LABEL[s]}
              </button>
            ))}
          </form>
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
            <SubmitButton variant="danger" confirm="Delete this job and its quotes and invoices?">Delete job</SubmitButton>
          </form>
        )}
        <p className="text-right text-xs text-slate-400">Created {date(job.created_at)}</p>
      </div>
    </div>
  );
}
