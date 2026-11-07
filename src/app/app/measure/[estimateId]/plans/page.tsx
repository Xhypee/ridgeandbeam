import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, LinkButton } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireMoneyAccess } from "@/lib/dal";
import { date } from "@/lib/format";
import type { SavedPlans } from "@/lib/plans/takeoff";
import { PlansFlow } from "./plans-flow";

export const metadata: Metadata = { title: "Measure from plans" };

export default async function MeasureFromPlansPage({ params }: PageProps<"/app/measure/[estimateId]/plans">) {
  const { estimateId } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const { data: est } = await supabase
    .from("estimates")
    .select("id, number, status, measurements, measurement_source, job_id, jobs(id, title, site_address, state, zip, job_type, roof_material, customers(name, address, city, state, zip))")
    .eq("id", estimateId)
    .maybeSingle();
  if (!est) notFound();
  const job = est.jobs as unknown as { id: string; title: string; site_address: string | null; state: string | null; zip: string | null; job_type: string | null; roof_material: string | null; customers: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } };
  const cust = job.customers;
  const address = job.site_address || [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");
  const raw = (est.measurements ?? {}) as { plans?: SavedPlans };
  const saved = raw.plans?.v === 1 && Array.isArray(raw.plans.lines) ? raw.plans : null;
  let savedImageUrl: string | null = null;
  if (saved?.file.imagePath?.startsWith(`${org.id}/${job.id}/`)) {
    const { data } = await supabase.storage.from("job-files").createSignedUrl(saved.file.imagePath, 60 * 60);
    savedImageUrl = data?.signedUrl ?? null;
  }
  const locked = est.status === "accepted";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight text-ink">{saved ? "The roof" : "Measure the roof"}</h1>
          <p className="mt-1 text-slate-500">
            Quote #{est.number}{address ? ` · ${address}` : ""}
            {saved && <> · measured from {saved.file.name || "plans"} on {date(saved.saved_at)}</>}
            {locked && <Badge tone="green" className="ml-2">Accepted · view only</Badge>}
          </p>
        </div>
        <LinkButton variant="secondary" href={`/app/estimates/${est.id}`}>Back to quote</LinkButton>
      </div>
      <PlansFlow
        estimateId={est.id}
        orgId={org.id}
        jobId={job.id}
        locked={locked}
        aiEnabled={aiEnabled()}
        current={{
          customerName: cust.name,
          customerAddress: { address: cust.address, city: cust.city, state: cust.state, zip: cust.zip },
          siteAddress: job.site_address,
          jobState: job.state,
          jobZip: job.zip,
          jobType: job.job_type,
          roofMaterial: job.roof_material,
        }}
        saved={saved}
        savedImageUrl={savedImageUrl}
      />
    </>
  );
}
