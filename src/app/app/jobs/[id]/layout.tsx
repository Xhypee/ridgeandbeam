import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { Tabs } from "@/components/tabs";
import { Badge, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { createEstimate } from "../../estimates/actions";
import { createInvoice } from "../../invoices/actions";

export default async function JobLayout({ children, params }: LayoutProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { supabase, canSeeMoney, isCrewLead, crewId } = await requireOrg();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, stage, site_address, is_insurance, crew_id, customers(id, name), claims(id, stage)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  // Crew leads only ever see jobs assigned to their own crew.
  if (isCrewLead && job.crew_id !== crewId) notFound();
  const customer = job.customers as unknown as { id: string; name: string };
  const claim = (Array.isArray(job.claims) ? job.claims[0] : job.claims) as { id: string; stage: string } | null;
  const base = `/app/jobs/${job.id}`;

  const allTabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/claim`, label: claim ? "Claim" : "Insurance" },
    { href: `${base}/field`, label: "Field" },
    { href: `${base}/production`, label: "Production" },
    ...(canSeeMoney ? [{ href: `${base}/change-orders`, label: "Change orders" }] : []),
    ...(canSeeMoney ? [{ href: `${base}/billing`, label: "Billing" }, { href: `${base}/costs`, label: "Job cost" }] : []),
    { href: `${base}/closeout`, label: "Close-out" },
  ];
  const tabs = isCrewLead ? allTabs.filter((t) => t.href.endsWith("/field") || t.href.endsWith("/production")) : allTabs;

  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/app/customers/${customer.id}`} className="font-medium text-slate-700 hover:text-brand-600">{customer.name}</Link>
            {job.site_address && <span>· {job.site_address}</span>}
            <Badge tone={STAGE_TONE[job.stage]}>{STAGE_LABEL[job.stage]}</Badge>
            {(job.is_insurance || claim) && <Badge tone="violet">Insurance</Badge>}
          </span>
        }
        actions={
          canSeeMoney ? (
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
          ) : undefined
        }
      />
      <Tabs tabs={tabs} />
      {children}
    </>
  );
}
