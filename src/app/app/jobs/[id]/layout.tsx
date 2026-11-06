import Link from "next/link";
import { notFound } from "next/navigation";
import { JobTimeline } from "@/components/job-timeline";
import { Badge } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { dollars, jobSteps, nextStep, type NextStepJob } from "@/lib/next-step";
import { asNextStepJob, loadNextStepCtx, NEXT_STEP_JOB_COLS } from "@/lib/next-step-server";
import { createEstimate } from "../../estimates/actions";
import { jobTypeLabel } from "@/lib/job-types";


const btn = "inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50";
const primary = "inline-flex min-h-13 items-center rounded-xl bg-brand-300 px-6 text-base font-bold text-ink hover:bg-brand-200";

type Row = NextStepJob & { title: string; site_address: string | null; job_type: string; crew_id: string | null; public_token: string; customers: { id: string; name: string; phone: string | null } };

export default async function JobLayout({ children, params }: LayoutProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { supabase, canSeeMoney, isCrewLead, crewId } = await requireOrg();
  const { data } = await supabase
    .from("jobs")
    .select(`${NEXT_STEP_JOB_COLS}, title, site_address, job_type, crew_id, public_token, customers(id, name, phone)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const row = data as unknown as Row;
  // Crew leads only ever see jobs assigned to their own crew.
  if (isCrewLead && row.crew_id !== crewId) notFound();
  const job = { ...row, ...asNextStepJob(row) };
  const customer = row.customers;
  const ctx = (await loadNextStepCtx(supabase, [job], { photos: true })).get(job.id)!;
  const steps = jobSteps(job, ctx, { crewLead: isCrewLead });
  const next = nextStep(job, ctx);
  const base = `/app/jobs/${job.id}`;
  const est = ctx.estimate;
  const value = canSeeMoney && est && ["accepted", "sent"].includes(est.status) ? est.total : null;
  const insurer = ctx.claim?.carrier;
  const extras = canSeeMoney ? [{ href: `${base}/compliance`, label: "Compliance" }, { href: `${base}/change-orders`, label: "Change orders" }, { href: `${base}/costs`, label: "Job cost" }] : [];
  const tel = customer.phone ? `tel:${customer.phone.replace(/\s+/g, "")}` : null;

  return (
    <>
      <Link href={isCrewLead ? "/app/schedule" : "/app/jobs"} className="no-print mb-3 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
        <span aria-hidden>←</span> {isCrewLead ? "Schedule" : "Jobs"}
      </Link>
      <header data-job-header className="mb-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {(job.is_insurance || ctx.claim) && <Badge tone="violet" className="px-3 py-1 text-[13px]">{insurer ? `Insurance · ${insurer}` : "Insurance"}</Badge>}
              <Badge tone={STAGE_TONE[job.stage]} className="py-1 text-[13px]">{STAGE_LABEL[job.stage]}</Badge>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[15px] text-slate-600">
            {job.site_address && <><span>{job.site_address}</span><span aria-hidden>·</span></>}
            <span>{jobTypeLabel(row.job_type)}</span>
            <span aria-hidden>·</span>
            <h2 className="text-[15px] font-normal text-slate-600" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{row.title}</h2>
            {value !== null && <><span aria-hidden>·</span><span className="font-semibold text-ink">{dollars(value)}{est?.status === "sent" ? " quoted" : ""}</span></>}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {tel && <a href={tel} className={btn}>Call</a>}
          {!isCrewLead && <a href={`/p/${row.public_token}`} target="_blank" rel="noreferrer" className={btn}>Homeowner view</a>}
          {!isCrewLead && <Link href={`/app/customers/${customer.id}`} className={btn}>Customer</Link>}
        </div>
      </header>

      <JobTimeline steps={steps} extras={extras} />

      {!isCrewLead && (
        <section data-next-step-bar aria-label="Next step" className="no-print mb-6 flex flex-wrap items-center gap-4 rounded-[18px] bg-ink px-6 py-5 text-white">
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-brand-300">Next step</p>
            <p className="font-display mt-1 text-[22px] font-bold leading-snug">{next.title}</p>
            <p className="mt-1 text-[15px] text-slate-300">{next.detail}</p>
          </div>
          {next.form === "create_estimate" && canSeeMoney ? (
            <form action={createEstimate}>
              <input type="hidden" name="job_id" value={job.id} />
              <button type="submit" className={primary}>{next.actionLabel}</button>
            </form>
          ) : (
            <a href={next.href} className={primary}>{next.actionLabel}</a>
          )}
        </section>
      )}
      {children}
    </>
  );
}
