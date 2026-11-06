import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireOrg } from "@/lib/dal";
import { date } from "@/lib/format";
import { CREW_STRINGS, materialLabel, unitLabel, workOrderMaterials } from "@/lib/production-i18n";
import { crewLeadCanSee } from "@/lib/production-server";
import { EXISTING_ROOF_LABEL, normalizeMeasurements, summarize } from "@/lib/roof";

export const metadata: Metadata = { title: "Work order" };

const EN = CREW_STRINGS.en;
const ES = CREW_STRINGS.es;
const L = ({ k }: { k: keyof typeof EN }) => (
  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{EN[k]} <span className="text-slate-400">/ {ES[k]}</span></span>
);

/** Printable bilingual (EN/ES) work order for the office to hand to the crew. No prices. */
export default async function WorkOrderPage({ params }: PageProps<"/app/jobs/[id]/production/work-order">) {
  const { id } = await params;
  const ctx = await requireOrg();
  const { supabase, org } = ctx;
  const { data: job } = await supabase.from("jobs").select("*, customers(name, phone), crews(name, language)").eq("id", id).maybeSingle();
  if (!job || !crewLeadCanSee(ctx, job)) notFound();
  const [{ data: est }, { data: orders }] = await Promise.all([
    supabase.from("estimates").select("measurements, selected_option_id, estimate_items(description, quantity, unit, category, option_id, position)")
      .eq("job_id", id).eq("status", "accepted").order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("material_orders").select("status, supplier, delivery_date, material_order_items(description, quantity, unit, position)").eq("job_id", id).order("created_at"),
  ]);
  const estItems = ((est?.estimate_items ?? []) as { description: string; quantity: number; unit: string; category: string; option_id: string | null; position: number }[])
    .filter((i) => i.option_id === null || i.option_id === est?.selected_option_id)
    .sort((a, b) => a.position - b.position);
  const mats = workOrderMaterials(
    (orders ?? []).map((o) => ({ status: o.status, items: (o.material_order_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position) })),
    estItems,
  );
  const m = est ? normalizeMeasurements(est.measurements) : null;
  const s = m ? summarize(m) : null;
  const customer = job.customers as { name: string; phone: string | null } | null;
  const crew = job.crews as { name: string; language: string } | null;
  const maxPitch = m ? Math.max(...m.sections.map((x) => x.pitch)) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="space-y-5 bg-white p-6 ring-1 ring-slate-200 sm:rounded-2xl print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xl font-semibold">{org.name}</p>
            <p className="text-sm text-slate-500">{org.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase text-brand-600">{EN.workOrder} / {ES.workOrder}</p>
            <p className="text-sm text-slate-600">{crew?.name ?? "—"}</p>
          </div>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <div><L k="address" /><p className="font-medium">{job.site_address ?? "—"}</p><p className="text-sm text-slate-600">{job.title}</p></div>
          <div><L k="homeowner" /><p className="font-medium">{customer?.name}</p><p className="text-sm text-slate-600">{customer?.phone}</p></div>
          <div><L k="start" /><p className="font-medium">{date(job.scheduled_start) || "—"}{job.scheduled_end && job.scheduled_end !== job.scheduled_start ? ` – ${date(job.scheduled_end)}` : ""}</p></div>
          <div><L k="color" /><p className="font-medium">{job.shingle_color ?? "—"}</p></div>
          {s && <div><L k="roof" /><p className="font-medium">{s.trueArea} m² · {maxPitch}° · {EXISTING_ROOF_LABEL[m!.existingRoof]}</p></div>}
          <div><L k="permit" /><p className="font-medium">{job.permit_number ?? "—"}</p></div>
        </section>
        <section>
          <L k="materials" />
          {mats.items.length === 0 ? <p className="text-sm text-slate-500">{EN.noMaterials} / {ES.noMaterials}</p> : (
            <table className="mt-1 w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1">{EN.qty} / {ES.qty}</th><th className="py-1">{EN.item} / {ES.item}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {mats.items.map((i, n) => (
                  <tr key={n}><td className="w-36 py-1.5 font-medium">{i.quantity} {i.unit} <span className="text-slate-400">/ {unitLabel(i.unit, "es")}</span></td><td className="py-1.5">{i.description}{materialLabel(i.description, "es") !== i.description && <span className="block text-slate-500">{materialLabel(i.description, "es")}</span>}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div><L k="delivery" /><p className="font-medium">{EN[job.delivery_type as "roof_load"]} / {ES[job.delivery_type as "roof_load"]}</p>{job.delivery_notes && <p className="whitespace-pre-wrap text-sm">{job.delivery_notes}</p>}</div>
          <div><L k="gateCode" /><p className="font-medium">{job.gate_code ?? "—"}</p></div>
          <div className="sm:col-span-2"><L k="hazards" /><p className="whitespace-pre-wrap font-medium">{job.site_hazards ?? "—"}</p></div>
        </section>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{EN.safetyReminder}<br />{ES.safetyReminder}</p>
      </article>
    </div>
  );
}
