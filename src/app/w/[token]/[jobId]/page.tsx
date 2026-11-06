import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient, hasAdminKey } from "@/lib/admin";
import { anonClient } from "@/lib/public";
import { crewStrings, materialLabel, unitLabel, workOrderMaterials, type Lang, type WorkOrderMaterial } from "@/lib/production-i18n";
import { EXISTING_ROOF_LABEL, normalizeMeasurements, summarize } from "@/lib/roof";
import { fmtDay, LangToggle } from "../crew-ui";
import { ProblemForm } from "../problem-form";

export const metadata: Metadata = { title: "Work order", robots: { index: false } };

type CrewJob = {
  crew: { id: string; name: string; language: Lang };
  org: { id: string; name: string; phone: string | null };
  job: {
    id: string; org_id: string; title: string; site_address: string | null; roof_material: string | null;
    scheduled_start: string | null; scheduled_end: string | null; schedule_locked: boolean; shingle_color: string | null;
    delivery_type: "roof_load" | "ground_drop"; delivery_notes: string | null; gate_code: string | null; site_hazards: string | null;
    permit_number: string | null; materials_status: "not_ordered" | "ordered" | "delivered"; dumpster_status: string;
    customer_name: string; customer_phone: string | null;
  };
  measurements: unknown;
  estimate_items: (WorkOrderMaterial & { category: string })[];
  orders: { supplier: string; status: string; delivery_date: string | null; delivery_type: string; color: string | null; items: WorkOrderMaterial[] }[];
  photos: { id: string; storage_path: string; caption: string | null; category: string }[];
};

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <section className={tone === "warn" ? "rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300" : "rounded-xl bg-white p-4 ring-1 ring-slate-200"}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export default async function CrewJobPage({ params, searchParams }: PageProps<"/w/[token]/[jobId]">) {
  const { token, jobId } = await params;
  const { lang: q } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(jobId)) notFound();
  const { data } = await anonClient().rpc("get_crew_job", { p_token: token, p_job: jobId });
  if (!data) notFound();
  const w = data as CrewJob;
  const lang: Lang = q === "es" || q === "en" ? q : w.crew.language;
  const t = crewStrings(lang);
  const j = w.job;
  const mats = workOrderMaterials(w.orders, w.estimate_items);
  const m = normalizeMeasurements(w.measurements);
  const s = summarize(m);
  const maxPitch = Math.max(...m.sections.map((x) => x.pitch));

  // Signed photo URLs, only for paths under the org/job the token resolved to.
  let photos: { url: string; caption: string | null }[] = [];
  const prefix = `${j.org_id}/${j.id}/`;
  const paths = w.photos.map((p) => p.storage_path).filter((p) => p.startsWith(prefix)).slice(0, 24);
  if (paths.length && hasAdminKey()) {
    const { data: signed } = await adminClient().storage.from("job-files").createSignedUrls(paths, 3600);
    photos = (signed ?? []).flatMap((x, i) => (x.signedUrl ? [{ url: x.signedUrl, caption: w.photos.find((p) => p.storage_path === paths[i])?.caption ?? null }] : []));
  }
  const mapUrl = j.site_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.site_address)}` : null;

  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-4 px-4 py-5" lang={lang}>
      <header className="flex items-center justify-between gap-3">
        <Link href={`/w/${token}?lang=${lang}`} className="flex min-h-11 items-center text-sm font-medium text-brand-600">{t.back}</Link>
        <LangToggle base={`/w/${token}/${jobId}`} lang={lang} />
      </header>

      <div>
        <p className="text-sm text-slate-500">{t.workOrder} · {w.crew.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{j.site_address ?? j.title}</h1>
        <p className="text-slate-600">{fmtDay(j.scheduled_start, lang)}{j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${fmtDay(j.scheduled_end, lang)}` : ""} · <span className={j.schedule_locked ? "text-green-700" : "text-amber-700"}>{j.schedule_locked ? t.locked : t.tentative}</span></p>
        {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-4 font-semibold text-white">📍 {t.openMap}</a>}
      </div>

      <ProblemForm token={token} jobId={jobId} t={t} />

      {(j.site_hazards || j.gate_code) && (
        <Block title={t.hazards} tone="warn">
          {j.site_hazards && <p className="whitespace-pre-wrap text-lg font-medium text-amber-950">{j.site_hazards}</p>}
          {j.gate_code && <p className="mt-2 text-lg"><span className="text-sm text-slate-600">{t.gateCode}:</span> <b className="tracking-wider">{j.gate_code}</b></p>}
        </Block>
      )}

      <Block title={t.roof}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">{t.squares}</dt><dd className="text-lg font-semibold">{s.trueArea ? `${s.trueArea} m²` : "—"}</dd></div>
          <div><dt className="text-slate-500">{t.pitch}</dt><dd className="text-lg font-semibold">{s.trueArea ? `${maxPitch}°` : "—"}</dd></div>
          <div><dt className="text-slate-500">{t.layers}</dt><dd className="text-lg font-semibold">{EXISTING_ROOF_LABEL[m.existingRoof]}</dd></div>
          <div><dt className="text-slate-500">{t.color}</dt><dd className="text-lg font-semibold">{j.shingle_color ?? "—"}</dd></div>
          {j.permit_number && <div><dt className="text-slate-500">{t.permit}</dt><dd className="font-semibold">{j.permit_number}</dd></div>}
        </dl>
      </Block>

      <Block title={t.materials}>
        {mats.items.length === 0 ? <p className="text-slate-500">{t.noMaterials}</p> : (
          <table className="w-full text-base">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1">{t.qty}</th><th className="pb-1">{t.item}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {mats.items.map((i, n) => (
                <tr key={n}><td className="w-28 py-2 align-top font-semibold">{i.quantity} <span className="text-sm font-normal text-slate-500">{unitLabel(i.unit, lang)}</span></td><td className="py-2">{materialLabel(i.description, lang)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-sm text-slate-500">{t[`status_${j.materials_status}`]}{w.orders[0]?.delivery_date ? ` · ${t.deliveryDate}: ${fmtDay(w.orders[0].delivery_date, lang)}` : ""}{w.orders[0] ? ` · ${t.orderedFrom}: ${w.orders[0].supplier}` : ""}</p>
      </Block>

      <Block title={t.delivery}>
        <p className="text-lg font-semibold">{t[j.delivery_type]}</p>
        {j.delivery_notes && <p className="mt-1 whitespace-pre-wrap">{j.delivery_notes}</p>}
      </Block>

      <Block title={t.homeowner}>
        <p className="font-medium">{j.customer_name}</p>
        {j.customer_phone && <a href={`tel:${j.customer_phone}`} className="mt-2 flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold text-slate-800 ring-1 ring-slate-300">📞 {t.call}</a>}
      </Block>

      <Block title={t.photos}>
        {photos.length === 0 ? <p className="text-slate-500">{t.noPhotos}</p> : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </Block>

      <p className="rounded-xl bg-slate-900 p-4 text-sm text-white">{t.safetyReminder}</p>
      {w.org.phone && <p className="text-center text-sm text-slate-500">{t.officePhone}: <a className="font-medium text-brand-600" href={`tel:${w.org.phone}`}>{w.org.phone}</a></p>}
    </main>
  );
}
