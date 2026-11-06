import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
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
            <b>Retail job.</b> The homeowner pays directly; there is no insurance claim. If that changes, start a claim below.
          </div>
        )}
        {canSeeMoney ? (
          <Card title="Is this an insurance job?">
            <p className="mb-4 text-sm text-slate-600">
              Start a claim to track the carrier, adjuster, the checks you&apos;re owed and any supplements. You can fill in the rest later.
            </p>
            <ActionForm action={createClaim} className="space-y-4">
              <input type="hidden" name="job_id" value={job.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Insurance company"><Input name="carrier" placeholder="State Farm" /></Field>
                <Field label="Claim #"><Input name="claim_number" /></Field>
                <Field label="Adjuster"><Input name="adjuster_name" /></Field>
                <Field label="Adjuster phone"><Input name="adjuster_phone" type="tel" /></Field>
                <Field label="Date of loss"><Input name="date_of_loss" type="date" /></Field>
                <Field label="Policy type"><PolicySelect defaultValue="unknown" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="min-h-11">Start insurance claim</SubmitButton>
              </div>
            </ActionForm>
            {job.is_insurance && (
              <form action={markRetail} className="mt-4 border-t border-slate-100 pt-4">
                <input type="hidden" name="job_id" value={job.id} />
                <SubmitButton variant="secondary" className="min-h-11">This is a retail job</SubmitButton>
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
