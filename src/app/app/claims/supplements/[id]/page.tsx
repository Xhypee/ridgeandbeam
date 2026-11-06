import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintButton } from "@/components/print-button";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, money } from "@/lib/format";
import { formatAbn } from "@/lib/au";
import { jobFilesWithUrls, type Claim, type Supplement, type SupplementItem } from "@/lib/claims-server";

export const metadata: Metadata = { title: "Variation request" };

export default async function SupplementPrintPage({ params }: PageProps<"/app/claims/supplements/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const { data } = await supabase
    .from("supplements")
    .select("*, supplement_items(*), claims!inner(*, jobs!inner(id, title, site_address, customers(name, phone, email, address, city, state, zip)))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const s = data as Supplement & { supplement_items: SupplementItem[] };
  const claim = data.claims as unknown as Claim & { jobs: { id: string; title: string; site_address: string | null; customers: { name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null } } };
  const job = claim.jobs;
  const cust = job.customers;
  const items = [...s.supplement_items].sort((a, b) => a.position - b.position);
  const fileIds = [...new Set(items.flatMap((i) => i.file_ids ?? []))];
  const files = fileIds.length ? await jobFilesWithUrls(supabase, job.id, { ids: fileIds }) : [];
  const fileById = new Map(files.map((f) => [f.id, f]));
  const total = items.reduce((t, i) => t + Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100, 0);
  const address = job.site_address || [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/app/jobs/${job.id}/claim/supplements/${s.id}`} className="text-sm text-slate-500 hover:text-slate-800">← Back to variation request</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:rounded-2xl sm:p-10 print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xl font-semibold text-slate-900">{org.name}</p>
            <div className="mt-1 space-y-0.5 text-sm text-slate-500">
              {org.address && <p>{org.address}</p>}
              <p>{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
              {org.abn && <p>ABN {formatAbn(org.abn)}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold uppercase tracking-wide text-brand-600">Variation request</p>
            <p className="text-sm text-slate-600">No. {s.round}</p>
            <p className="text-sm text-slate-500">{date(s.submitted_on ?? isoDate(new Date()))}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Policyholder / property</p>
            <p className="mt-1 font-medium text-slate-900">{cust.name}</p>
            {address && <p className="text-slate-600">{address}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Claim</p>
            <p className="mt-1 font-medium text-slate-900">{claim.carrier ?? "Insurer"}</p>
            <p className="text-slate-600">Claim no. {claim.claim_number ?? "—"}{claim.policy_number ? ` · Policy no. ${claim.policy_number}` : ""}</p>
            {claim.date_of_loss && <p className="text-slate-600">Date of event {date(claim.date_of_loss)}{claim.cause_of_loss ? ` · ${claim.cause_of_loss}` : ""}</p>}
            {claim.adjuster_name && <p className="text-slate-600">Assessor {claim.adjuster_name}{claim.adjuster_email ? ` · ${claim.adjuster_email}` : ""}</p>}
            {claim.panel_job_ref && <p className="text-slate-600">Work order {claim.panel_job_ref}</p>}
          </div>
        </section>

        <p className="mb-4 text-sm text-slate-700">
          We request the following variations to the scope of works for this claim. Each item lists its quantity, price (including GST), the standard or manufacturer requirement it relates to, and supporting photos.
        </p>

        <ol className="space-y-4">
          {items.map((it, n) => (
            <li key={it.id} className="break-inside-avoid rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-slate-900">{n + 1}. {it.description}{it.xact_code && <span className="ml-2 font-mono text-xs text-slate-500">{it.xact_code}</span>}</p>
                <p className="tabular-nums text-sm text-slate-700">
                  {Number(it.quantity)} {it.unit} × {money(it.unit_price)} = <b>{money(Math.round(Number(it.quantity) * Number(it.unit_price) * 100) / 100)}</b>
                </p>
              </div>
              {it.code_citation && <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Standard / requirement:</span> {it.code_citation}</p>}
              {it.justification && <p className="mt-1 text-sm text-slate-700">{it.justification}</p>}
              {(it.file_ids ?? []).length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(it.file_ids ?? []).map((fid) => {
                    const f = fileById.get(fid);
                    return f?.url ? (
                      <figure key={fid}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.caption ?? "Photo"} className="aspect-[4/3] w-full rounded object-cover" />
                        {f.caption && <figcaption className="mt-0.5 text-[11px] text-slate-500">{f.caption}</figcaption>}
                      </figure>
                    ) : null;
                  })}
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
          <p className="text-lg font-semibold text-slate-900">Total requested (inc GST): <span className="tabular-nums">{money(total)}</span></p>
        </div>
        {s.notes && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{s.notes}</p>}
        <p className="mt-8 text-xs text-slate-400">References are to Australian Standards, the NCC and manufacturer instructions; check the current edition.</p>
      </article>
    </>
  );
}
