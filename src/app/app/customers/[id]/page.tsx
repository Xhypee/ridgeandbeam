import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, daysSince, money, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { claimBalancesFor } from "@/lib/claims-server";
import { agingTone, CLAIM_STAGE_LABEL, type ClaimStage } from "@/lib/claims";
import type { Customer, Job } from "@/lib/types";
import { deleteCustomer, updateCustomer } from "../actions";
import { CustomerFields } from "../customer-fields";

export default async function CustomerPage({ params }: PageProps<"/app/customers/[id]">) {
  const { id } = await params;
  const { supabase, isAdmin } = await requireOrg();
  const [{ data: c }, { data: jobs }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("jobs").select("*, claims(id, carrier, claim_number, stage, stage_changed_at)").eq("customer_id", id).order("created_at", { ascending: false }),
  ]);
  if (!c) notFound();
  const customer = c as Customer;
  type ClaimRow = { id: string; carrier: string | null; claim_number: string | null; stage: ClaimStage; stage_changed_at: string };
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const claims = ((jobs ?? []) as (Job & { claims: ClaimRow | ClaimRow[] | null })[])
    .map((j) => ({ job: j, claim: one(j.claims) }))
    .filter((x): x is { job: Job & { claims: ClaimRow | ClaimRow[] | null }; claim: ClaimRow } => x.claim !== null);
  const balances = await claimBalancesFor(supabase, claims.map((x) => x.claim.id));
  const legacy = claims.length === 0 && (customer.insurance_company || customer.claim_number);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(" · ")}
        actions={<LinkButton href={`/app/jobs/new?customer=${customer.id}`}>New job</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Details">
          <ActionForm action={updateCustomer} className="space-y-6">
            <input type="hidden" name="id" value={customer.id} />
            <CustomerFields c={customer} />
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card title="Jobs">
            {(jobs ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No jobs yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(jobs as Job[]).map((j) => (
                  <li key={j.id} className="py-2">
                    <Link href={`/app/jobs/${j.id}`} className="flex items-center justify-between gap-2 hover:text-brand-600">
                      <span className="truncate text-sm font-medium">{j.title}</span>
                      <Badge tone={STAGE_TONE[j.stage]}>{STAGE_LABEL[j.stage]}</Badge>
                    </Link>
                    <p className="text-xs text-slate-500">Created {date(j.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Insurance claims">
            {claims.length === 0 ? (
              <p className="text-sm text-slate-500">No insurance claims. Start one from a job&apos;s Claim tab.</p>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="customer-claims">
                {claims.map(({ job, claim }) => {
                  const days = daysSince(claim.stage_changed_at);
                  const owed = balances.get(claim.id)?.outstanding ?? 0;
                  return (
                    <li key={claim.id} className="py-2">
                      <Link href={`/app/jobs/${job.id}/claim`} className="flex items-center justify-between gap-2 hover:text-brand-600">
                        <span className="truncate text-sm font-medium">{claim.carrier ?? "Carrier not set"}{claim.claim_number ? ` · #${claim.claim_number}` : ""}</span>
                        <Badge tone={agingTone(days)}>{CLAIM_STAGE_LABEL[claim.stage]}</Badge>
                      </Link>
                      <p className="text-xs text-slate-500">{job.title} · {days}d in stage{owed > 0 ? ` · ${money(owed)} owed` : ""}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {legacy && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Older record: {[customer.insurance_company, customer.claim_number && `claim ${customer.claim_number}`, customer.adjuster_name, customer.adjuster_phone].filter(Boolean).join(" · ")}
              </p>
            )}
          </Card>
          {isAdmin && (
            <Card title="Danger zone">
              <form action={deleteCustomer}>
                <input type="hidden" name="id" value={customer.id} />
                <p className="mb-3 text-sm text-slate-500">Deleting a customer also deletes their jobs, estimates, and invoices.</p>
                <SubmitButton variant="danger" confirm={`Delete ${customer.name} and all of their jobs?`}>Delete customer</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
