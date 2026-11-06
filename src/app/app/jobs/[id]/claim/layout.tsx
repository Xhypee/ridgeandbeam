import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { KeepForm } from "./_components/keep-form";
import { Card, Field, Input, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { isoDate } from "@/lib/format";
import { EVENT_LABEL, EVENT_TYPES } from "@/lib/claims";
import { getClaimForJob } from "@/lib/claims-server";
import { createClaim, markRetail } from "./actions";
import { ClaimNav, PolicySelect } from "./_components/client-bits";

export default async function ClaimLayout({ children, params }: LayoutProps<"/app/jobs/[id]/claim">) {
  const { id } = await params;
  const { supabase, canSeeMoney } = await requireOrg();
  const [{ data: job }, claim] = await Promise.all([
    supabase.from("jobs").select("id, is_insurance").eq("id", id).maybeSingle(),
    getClaimForJob(supabase, id),
  ]);
  if (!job) notFound();

  if (!claim) {
    return (
      <div className="max-w-2xl space-y-4">
        {!job.is_insurance && (
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <b>Private job.</b> The homeowner pays directly; there is no insurance claim. If that changes, start a claim below.
          </div>
        )}
        {canSeeMoney ? (
          <Card title="Is this an insurance job?">
            <p className="mb-4 text-sm text-slate-600">
              Start a claim to track the insurer, the assessor, the excess, how the insurer settles, and every payment you&apos;re owed. You can fill in the rest later.
            </p>
            <KeepForm action={createClaim} className="space-y-4">
              <input type="hidden" name="job_id" value={job.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Insurer"><Input name="carrier" placeholder="e.g. NRMA, Suncorp, Allianz" /></Field>
                <Field label="Claim number"><Input name="claim_number" /></Field>
                <Field label="What happened">
                  <Select name="event_type" defaultValue="hail">{EVENT_TYPES.map((e) => <option key={e} value={e}>{EVENT_LABEL[e]}</option>)}</Select>
                </Field>
                <Field label="Date of the event"><Input name="date_of_loss" type="date" max={isoDate(new Date())} /></Field>
                <Field label="Claim lodged on"><Input name="lodged_on" type="date" defaultValue={isoDate(new Date())} max={isoDate(new Date())} /></Field>
                <Field label="Excess" hint="The homeowner's share, from their policy"><Input name="excess" type="number" step="0.01" min="0" inputMode="decimal" placeholder="e.g. 500" /></Field>
                <Field label="Cover type" className="sm:col-span-2"><PolicySelect defaultValue="unknown" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="min-h-11">Start insurance claim</SubmitButton>
              </div>
            </KeepForm>
            {job.is_insurance && (
              <form action={markRetail} className="mt-4 border-t border-slate-100 pt-4">
                <input type="hidden" name="job_id" value={job.id} />
                <SubmitButton variant="secondary" className="min-h-11">This is a private job</SubmitButton>
                <span className="ml-3 text-xs text-slate-500">No insurance involved — the homeowner pays directly.</span>
              </form>
            )}
          </Card>
        ) : (
          <p className="text-sm text-slate-500">No insurance claim on this job.</p>
        )}
      </div>
    );
  }

  const [{ count: supplements }, { data: checks }] = await Promise.all([
    supabase.from("supplements").select("id", { count: "exact", head: true }).eq("claim_id", claim.id),
    supabase.from("claim_checks").select("expected_amount, received_amount").eq("claim_id", claim.id),
  ]);
  const openChecks = (checks ?? []).filter((c) => Number(c.received_amount) < Number(c.expected_amount)).length;
  return (
    <>
      <ClaimNav base={`/app/jobs/${id}/claim`} counts={{ supplements: supplements ?? 0, openChecks: canSeeMoney ? openChecks : 0 }} />
      {children}
    </>
  );
}
