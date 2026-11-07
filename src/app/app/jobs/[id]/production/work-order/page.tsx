import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireOrg } from "@/lib/dal";
import { date } from "@/lib/format";
import { CREW_STRINGS as T, crewRoofFacts, skipBinLabel, unitLabel, workOrderMaterials } from "@/lib/production-i18n";
import { crewLeadCanSee } from "@/lib/production-server";

export const metadata: Metadata = { title: "Work order" };

const L = ({ k }: { k: keyof typeof T }) => <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{T[k]}</span>;

/** Printable work order for the office to hand to the crew. Metric, plain English, no prices. */
export default async function WorkOrderPage({ params }: PageProps<"/app/jobs/[id]/production/work-order">) {
  const { id } = await params;
  const ctx = await requireOrg();
  const { supabase, org } = ctx;
  const { data: job } = await supabase.from("jobs").select("*, customers(name, phone), crews(name)").eq("id", id).maybeSingle();
  if (!job || !crewLeadCanSee(ctx, job)) notFound();
  const [{ data: est }, { data: orders }] = await Promise.all([
    supabase.from("estimates").select("measurements, selected_option_id, estimate_items(description, quantity, unit, category, option_id, position, extra_status)")
      .eq("job_id", id).eq("status", "accepted").order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("material_orders").select("status, supplier, delivery_date, material_order_items(description, quantity, unit, position)").eq("job_id", id).order("created_at"),
  ]);
  const estItems = ((est?.estimate_items ?? []) as { description: string; quantity: number; unit: string; category: string; option_id: string | null; position: number; extra_status: string | null }[])
    .filter((i) => (i.option_id === null || i.option_id === est?.selected_option_id) && i.extra_status !== "offered")
    .sort((a, b) => a.position - b.position);
  const mats = workOrderMaterials(
    (orders ?? []).map((o) => ({ status: o.status, items: (o.material_order_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position) })),
    estItems,
  );
  const roof = est ? crewRoofFacts(est.measurements) : null;
  const customer = job.customers as { name: string; phone: string | null } | null;
  const crew = job.crews as { name: string } | null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="space-y-5 bg-white p-6 ring-1 ring-slate-200 sm:rounded-2xl print:p-0 print:ring-0" data-testid="work-order">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xl font-semibold">{org.name}</p>
            <p className="text-sm text-slate-500">{org.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase text-brand-600">{T.workOrder}</p>
            <p className="text-sm text-slate-600">{crew?.name ?? "—"}</p>
          </div>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <div><L k="address" /><p className="font-medium">{job.site_address ?? "—"}</p><p className="text-sm text-slate-600">{job.title}</p></div>
          <div><L k="homeowner" /><p className="font-medium">{customer?.name}</p><p className="text-sm text-slate-600">{customer?.phone}</p></div>
          <div><L k="dates" /><p className="font-medium">{date(job.scheduled_start) || "—"}{job.scheduled_end && job.scheduled_end !== job.scheduled_start ? ` – ${date(job.scheduled_end)}` : ""}</p></div>
          <div><L k="color" /><p className="font-medium">{job.shingle_color ?? "—"}</p></div>
          <div><L k="permit" /><p className="font-medium">{job.permit_number ?? "—"}</p></div>
          <div><L k="skipBin" /><p className="font-medium">{skipBinLabel(job.dumpster_status)}</p></div>
        </section>
        {roof?.hasMeasurements && (
          <section className="rounded-xl bg-slate-50 p-4" data-testid="work-order-roof">
            <p className="mb-2 font-semibold">{T.roof} · {roof.jobType}</p>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div><L k="area" /><p className="text-lg font-semibold">{roof.area} m²</p></div>
              <div><L k="pitch" /><p className="text-lg font-semibold">{roof.pitch}</p></div>
              <div><L k="oldRoof" /><p className="text-lg font-semibold">{roof.oldRoof ?? "Nothing to strip"}</p></div>
              <div><L k="roofType" /><p className="text-lg font-semibold">{roof.newRoof}</p></div>
            </div>
            {roof.includes.length > 0 && <p className="mt-2 text-sm text-slate-700">Includes: {roof.includes.join(" · ")}</p>}
            {roof.asbestos && <p className="mt-2 text-sm font-semibold text-red-800">Asbestos: removal by a licensed asbestos removalist only.</p>}
          </section>
        )}
        <section>
          <L k="materials" />
          {mats.items.length === 0 ? <p className="text-sm text-slate-500">{T.noMaterials}</p> : (
            <table className="mt-1 w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1">{T.qty}</th><th className="py-1">{T.item}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {mats.items.map((i, n) => (
                  <tr key={n}><td className="w-32 py-1.5 font-medium tabular-nums">{i.quantity} {unitLabel(i.unit)}</td><td className="py-1.5">{i.description}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div><L k="delivery" /><p className="font-medium">{T[job.delivery_type as "roof_load" | "ground_drop"] ?? T.roof_load}</p>{job.delivery_notes && <p className="whitespace-pre-wrap text-sm">{job.delivery_notes}</p>}</div>
          <div><L k="gateCode" /><p className="font-medium">{job.gate_code ?? "—"}</p></div>
          <div className="sm:col-span-2"><L k="hazards" /><p className="whitespace-pre-wrap font-medium">{job.site_hazards ?? "—"}</p></div>
        </section>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="work-order-safety"><b>{T.safetyTitle}:</b> {T.safetyReminder}</p>
      </article>
    </div>
  );
}
