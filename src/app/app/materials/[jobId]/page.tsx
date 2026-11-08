import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AU_STATE_TZ, asAuState } from "@/lib/au";
import { requireMoneyAccess } from "@/lib/dal";
import { loadJobCompliance } from "@/lib/job-compliance-server";
import { buildSupplierEmail, loadMaterials } from "@/lib/supplier-orders-server";
import { AttachmentPanel, OrderBoard } from "./order-board";
import { SendFromPreview } from "./send-from-preview";

export const metadata: Metadata = { title: "Material orders" };

export default async function MaterialsPage({ params, searchParams }: PageProps<"/app/materials/[jobId]">) {
  const { jobId } = await params;
  const sp = await searchParams;
  const ctx = await requireMoneyAccess();
  const { supabase, org, user, memberships } = ctx;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();
  const [data, comp] = await Promise.all([loadMaterials(supabase, org, jobId), loadJobCompliance(supabase, org, jobId)]);
  if (!data) notFound();
  const cool = comp?.items.find((i) => i.key === "cooling_off");
  const coolingOffEnds = cool && cool.status !== "done" && cool.status !== "not_needed" ? cool.due : null;
  const sent = data.orders.filter((o) => o.status !== "draft").length;
  const withItems = data.orders.filter((o) => o.items.length).length;
  const base = `/app/materials/${jobId}`;

  // ?preview=<order id>: that supplier's email exactly as it will go, with what's attached.
  const pv = typeof sp.preview === "string" ? data.orders.find((o) => o.id === sp.preview) : null;
  const me = memberships.find((m) => m.org_id === org.id);
  const preview = pv ? await buildSupplierEmail(supabase, org, data, pv, me?.full_name || user.fullName || org.name, { withFiles: false }) : null;

  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white" data-materials-top>
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href={`/app/jobs?job=${jobId}`} aria-label="Back to the job" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2"><span className="truncate font-display text-lg font-bold text-ink">Material order · {data.job.customer}</span>
              <span className={sent && sent === withItems ? "rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700" : sent ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"}>
                {withItems ? (sent ? `${sent} of ${withItems} sent` : "Draft") : "Not started"}
              </span></p>
            <p className="truncate text-xs text-slate-500">{data.quoteNo ? `Job ${data.quoteNo} · ` : ""}{data.job.title}{data.job.address ? ` · ${data.job.address}` : ""}</p>
          </div>
          <Link href={`/app/jobs?job=${jobId}`} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        </div>
      </header>

      <OrderBoard tz={AU_STATE_TZ[asAuState(org.state) ?? "QLD"]}
        jobId={jobId} address={data.job.address} firstName={data.job.firstName} quoteNo={data.quoteNo} orders={data.orders} delivery={data.delivery}
        choices={data.choices} quotedCost={data.quotedCost} coolingOffEnds={coolingOffEnds} previewBase={base} />

      {pv && preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`What ${pv.supplier} will get`} data-supplier-preview>
          <Link href={base} scroll={false} aria-label="Close preview" className="absolute inset-0 cursor-default" />
          <div className="relative flex h-full max-h-[1000px] w-full max-w-[1080px] flex-col overflow-hidden rounded-3xl bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Preview</p><p className="font-display text-xl font-bold text-ink">What {pv.supplier}{pv.branch ? ` ${pv.branch}` : ""} will get</p></div>
              <SendFromPreview jobId={jobId} orderId={pv.id} supplier={pv.supplier} status={pv.status} hasEmail={Boolean(pv.email)} />
              <Link href={base} scroll={false} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </Link>
            </div>
            <div className="space-y-1 border-b border-slate-100 px-6 py-3 text-sm">
              <p className="truncate"><span className="inline-block w-16 text-slate-500">From</span>{org.name}</p>
              <p className="truncate"><span className="inline-block w-16 text-slate-500">To</span>{pv.email ?? <span className="font-semibold text-red-700">add their email first</span>}</p>
              <p className="truncate"><span className="inline-block w-16 text-slate-500">Subject</span><b className="text-ink">{preview.email.subject}</b></p>
            </div>
            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_300px]">
              <iframe title="Supplier email" srcDoc={preview.email.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-full min-h-[50vh] w-full bg-[#eef0ea]" />
              <aside className="min-h-0 overflow-y-auto border-l border-slate-100 p-5">
                <AttachmentPanel orderId={pv.id} plans={pv.attachPlans} report={pv.attachReport} supplier={pv.supplier} hasRoof={Boolean(data.roof)}
                  planNames={data.plans.map((f) => f.name)} files={data.files.map((f) => ({ id: f.id, name: f.name, on: pv.attachFileIds.includes(f.id) }))} />
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
