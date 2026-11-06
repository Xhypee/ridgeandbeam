import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireMoneyAccess } from "@/lib/dal";
import { closeoutBlockers } from "@/lib/field-closeout";
import { date, money } from "@/lib/format";

export const metadata: Metadata = { title: "Unconditional lien waiver" };

export default async function LienWaiver({ params }: PageProps<"/app/jobs/[id]/closeout/lien-waiver">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, site_address, completed_at, last_furnished_on, customers(name, address, city, state, zip), organizations(name, address, license_number)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const b = await closeoutBlockers(supabase, id);
  const c = job.customers as unknown as { name: string; address: string | null; city: string | null; state: string | null; zip: string | null };
  const o = job.organizations as unknown as { name: string; address: string | null; license_number: string | null };
  const address = job.site_address || [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const through = job.last_furnished_on ?? job.completed_at;
  const paidInFull = b.invoices.length > 0 && b.balance <= 0.005;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex gap-2">
        <Link href={`/app/jobs/${id}/closeout`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">← Close-out</Link>
        <PrintButton />
      </div>
      {!paidInFull && (
        <p className="no-print mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {money(b.balance)} is still due. Don&apos;t sign an <b>unconditional</b> waiver until payment has cleared — use a conditional waiver instead.
        </p>
      )}
      <article className="rounded-2xl bg-white p-6 text-sm leading-relaxed ring-1 ring-slate-200 sm:p-10 print:p-0 print:ring-0">
        <h1 className="text-center text-2xl font-black uppercase">Unconditional Waiver and Release on Final Payment</h1>
        <dl className="mt-6 space-y-1">
          <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Claimant (contractor)</dt><dd className="font-medium">{o.name}{o.license_number ? `, License #${o.license_number}` : ""}</dd></div>
          <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Property owner</dt><dd className="font-medium">{c.name}</dd></div>
          <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Job location</dt><dd className="font-medium">{address}</dd></div>
          <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Project</dt><dd className="font-medium">{job.title}</dd></div>
          <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Amount received</dt><dd className="font-medium">{money(b.paid)}</dd></div>
          {through && <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">Work through</dt><dd className="font-medium">{date(through)}</dd></div>}
        </dl>
        <p className="mt-6">
          The undersigned claimant has been paid in full, in the amount of <b>{money(b.paid)}</b>, for all labor, services, equipment and materials
          furnished to the job location described above. In exchange, the claimant waives and releases any and all mechanic&apos;s lien, stop
          payment notice, payment bond and similar rights it has on the job, unconditionally and without regard to whether any check or other
          payment has cleared, except for disputed claims for extra work listed here: ________________________________.
        </p>
        <p className="mt-3">
          This document waives rights unconditionally and states that the claimant has been paid for giving up those rights. It is binding on the
          claimant whether or not it has actually been paid. The claimant must not sign it unless it has been paid in full.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          <div className="border-t border-slate-900 pt-1"><p className="font-medium">Signature, authorized agent of {o.name}</p><p className="text-slate-500">Printed name / title: ____________________</p></div>
          <div className="border-t border-slate-900 pt-1"><p className="font-medium">Date</p></div>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-3 text-xs text-slate-500">
          Generic, state-neutral form. Several states (for example CA, TX, GA, FL, AZ, MI, UT, WY, MO, MS, NV) require their own statutory wording
          and some require notarization. Consult counsel or your state&apos;s statute before relying on this document.
        </p>
      </article>
    </div>
  );
}
