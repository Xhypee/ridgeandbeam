import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, money, STAGE_LABEL, STAGE_TONE, STATUS_TONE, label } from "@/lib/format";
import { JOB_STAGES, type Crew, type Customer, type Job } from "@/lib/types";
import { createEstimate } from "../../estimates/actions";
import { createInvoice } from "../../invoices/actions";
import { addNote, deleteJob, scheduleJob, setStage, updateJob } from "../actions";
import { JobFields } from "../job-fields";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { supabase, isAdmin } = await requireOrg();
  const [{ data: j }, { data: crews }, { data: notes }, { data: estimates }, { data: invoices }] = await Promise.all([
    supabase.from("jobs").select("*, customers(*)").eq("id", id).maybeSingle(),
    supabase.from("crews").select("id, name, color").order("name"),
    supabase.from("job_notes").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("estimates").select("id, number, status, created_at, estimate_totals(total)").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, number, status, issue_date, invoice_totals(total, balance)").eq("job_id", id).order("created_at", { ascending: false }),
  ]);
  if (!j) notFound();
  const job = j as Job & { customers: Customer };
  const c = job.customers;

  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/app/customers/${c.id}`} className="font-medium text-slate-700 hover:text-brand-600">{c.name}</Link>
            {job.site_address && <span>· {job.site_address}</span>}
            <Badge tone={STAGE_TONE[job.stage]}>{STAGE_LABEL[job.stage]}</Badge>
            {job.is_insurance && <Badge tone="violet">Insurance</Badge>}
          </span>
        }
        actions={
          <>
            <form action={createEstimate}>
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton>New estimate</SubmitButton>
            </form>
            <form action={createInvoice}>
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton variant="secondary">New invoice</SubmitButton>
            </form>
          </>
        }
      />

      <Card className="mb-6" title="Pipeline stage">
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
        <div className="space-y-6 lg:col-span-2">
          <Card title="Estimates">
            {(estimates ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No estimates yet. Use <b>New estimate</b> to measure the roof and build a quote.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(estimates ?? []).map((e) => {
                  const t = (e.estimate_totals as unknown as { total: number }[] | { total: number } | null);
                  const total = Array.isArray(t) ? t[0]?.total : t?.total;
                  return (
                    <li key={e.id}>
                      <Link href={`/app/estimates/${e.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-brand-600">
                        <span className="text-sm font-medium">Estimate #{e.number}</span>
                        <span className="flex items-center gap-3 text-sm">
                          {money(total)}
                          <Badge tone={STATUS_TONE[e.status]}>{label(e.status)}</Badge>
                        </span>
                      </Link>
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
                  const t = v.invoice_totals as unknown as { total: number; balance: number }[] | { total: number; balance: number } | null;
                  const tot = Array.isArray(t) ? t[0] : t;
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

          <Card title="Notes & activity">
            <ActionForm action={addNote} className="mb-4">
              <input type="hidden" name="job_id" value={job.id} />
              <Textarea name="body" placeholder="Inspection findings, calls with the adjuster, crew notes…" required />
              <div className="mt-2"><SubmitButton variant="secondary">Add note</SubmitButton></div>
            </ActionForm>
            <ul className="space-y-3">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{n.author_name} · {new Date(n.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
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
              {(crews ?? []).length === 0 && <p className="text-xs text-slate-500">Add crews in <Link className="underline" href="/app/settings">Settings</Link>.</p>}
              <SubmitButton variant="secondary">Save schedule</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Customer">
            <dl className="space-y-1.5 text-sm">
              {c.phone && <div><dt className="sr-only">Phone</dt><dd><a className="text-brand-600 hover:underline" href={`tel:${c.phone}`}>{c.phone}</a></dd></div>}
              {c.email && <div><dt className="sr-only">Email</dt><dd><a className="text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
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
