import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireOrg } from "@/lib/dal";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Certificate of Completion" };

export default async function Certificate({ params }: PageProps<"/app/jobs/[id]/closeout/certificate">) {
  const { id } = await params;
  const { supabase } = await requireOrg();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, site_address, roof_material, scheduled_start, completed_at, walkthrough_signed_at, walkthrough_name, walkthrough_signature, warranty_product, shingle_color, customers(name, address, city, state, zip, phone), organizations(name, address, phone, email, license_number), claims(carrier, claim_number, policy_number, date_of_loss, cause_of_loss, mortgagee_name, mortgage_loan_number)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const c = job.customers as unknown as { name: string; address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null };
  const o = job.organizations as unknown as { name: string; address: string | null; phone: string | null; email: string | null; license_number: string | null };
  const cl = (Array.isArray(job.claims) ? job.claims[0] : job.claims) as { carrier: string | null; claim_number: string | null; policy_number: string | null; date_of_loss: string | null; cause_of_loss: string | null; mortgagee_name: string | null; mortgage_loan_number: string | null } | null;
  const address = job.site_address || [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const row = (k: string, v: string | null | undefined) => v ? <div className="flex gap-3 border-b border-slate-100 py-1.5"><dt className="w-40 shrink-0 text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div> : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex gap-2">
        <Link href={`/app/jobs/${id}/closeout`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">← Close-out</Link>
        <PrintButton />
      </div>
      <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-10 print:p-0 print:ring-0">
        <header className="border-b-2 border-slate-900 pb-4 text-center">
          <p className="text-lg font-bold">{o.name}</p>
          <p className="text-sm text-slate-600">{[o.address, o.phone, o.email].filter(Boolean).join(" · ")}</p>
          {o.license_number && <p className="text-sm text-slate-600">License #{o.license_number}</p>}
          <h1 className="mt-4 text-3xl font-black uppercase tracking-wide">Certificate of Completion</h1>
        </header>
        <dl className="mt-6 text-sm">
          {row("Property owner", c.name)}
          {row("Property address", address)}
          {row("Project", job.title)}
          {row("Roof system", [job.warranty_product ?? job.roof_material, job.shingle_color].filter(Boolean).join(" · "))}
          {row("Work started", job.scheduled_start ? date(job.scheduled_start) : null)}
          {row("Work completed", job.completed_at ? date(job.completed_at) : null)}
          {cl && row("Insurance carrier", cl.carrier)}
          {cl && row("Claim number", cl.claim_number)}
          {cl && row("Policy number", cl.policy_number)}
          {cl && row("Date of loss", cl.date_of_loss ? date(cl.date_of_loss) : null)}
          {cl && row("Cause of loss", cl.cause_of_loss)}
          {cl && row("Mortgage company", [cl.mortgagee_name, cl.mortgage_loan_number && `Loan #${cl.mortgage_loan_number}`].filter(Boolean).join(" · "))}
        </dl>
        <p className="mt-6 text-sm leading-relaxed">
          {o.name} certifies that the roofing work described above at {address || "the property"} has been completed in accordance with the
          contract{cl ? " and the insurance scope of loss" : ""}, and that the work area has been cleaned up. The property owner has inspected the
          completed work and accepts it as complete{cl ? ", and asks the insurer to finalise the claim and pay any remaining approved amount" : ""}.
        </p>
        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <div>
            {job.walkthrough_signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={job.walkthrough_signature} alt="Homeowner signature" className="h-20 object-contain" />
            ) : <div className="h-20" />}
            <div className="border-t border-slate-900 pt-1 text-sm">
              <p className="font-medium">{job.walkthrough_name ?? c.name}, Property owner</p>
              <p className="text-slate-500">{job.walkthrough_signed_at ? `Signed ${date(job.walkthrough_signed_at)}` : "Date: ____________"}</p>
            </div>
          </div>
          <div>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 text-sm">
              <p className="font-medium">Authorized representative, {o.name}</p>
              <p className="text-slate-500">Date: ____________</p>
            </div>
          </div>
        </div>
        {!job.walkthrough_signed_at && <p className="no-print mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Not signed yet — have the homeowner sign on the Close-out tab.</p>}
      </article>
    </div>
  );
}
