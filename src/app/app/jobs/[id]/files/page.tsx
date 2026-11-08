import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { signPaths } from "@/lib/field-server";
import { label as human } from "@/lib/format";
import { normalizeMeasurements, summarize } from "@/lib/roof";
import { PdfViewer } from "./pdf-viewer";
import { FileUpload } from "./upload";
import { deleteJobFile } from "./actions";

export const metadata: Metadata = { title: "Plans & files" };

type F = { id: string; kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string; taken_at: string | null; slope: string | null };
const isPdf = (f: F) => (f.mime_type ?? "").includes("pdf") || f.storage_path.toLowerCase().endsWith(".pdf");
const isImg = (f: F) => (f.mime_type ?? "").startsWith("image/") || f.kind === "photo";
const nameOf = (f: F) => f.caption || f.storage_path.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export default async function FilesPage({ params, searchParams }: PageProps<"/app/jobs/[id]/files">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org, isCrewLead } = await requireOrg();
  const [{ data: rows }, { data: ests }] = await Promise.all([
    supabase.from("job_files").select("id, kind, category, caption, storage_path, mime_type, size_bytes, created_at, taken_at, slope").eq("job_id", id).order("created_at", { ascending: false }).limit(500),
    supabase.from("estimates").select("id, number, status, measurements, measurement_source").eq("job_id", id).neq("status", "declined").order("created_at", { ascending: false }).limit(5),
  ]);
  const files = (rows ?? []) as F[];
  const tab = sp.tab === "photos" ? "photos" : "plans";
  const plans = files.filter((f) => f.category === "plans");
  const docs = files.filter((f) => f.kind === "document" && f.category !== "plans");
  const photos = files.filter((f) => f.kind === "photo");
  const sheets = [...plans, ...docs];
  const selected = (tab === "photos" ? photos : sheets).find((f) => f.id === sp.file) ?? (tab === "photos" ? photos[0] : sheets[0]) ?? null;
  const urls = await signPaths(supabase, tab === "photos" ? photos.map((p) => p.storage_path) : [selected?.storage_path, ...sheets.filter(isImg).map((f) => f.storage_path)], 3600);
  if (sp.file && !selected) notFound();

  const est = ((ests ?? []) as { id: string; number: number; status: string; measurements: unknown; measurement_source: string | null }[]);
  const e = est.find((x) => x.status === "accepted") ?? est[0] ?? null;
  const m = e?.measurements ? normalizeMeasurements(e.measurements) : null;
  const s = m ? summarize(m) : null;
  const base = `/app/jobs/${id}/files`;
  const tabCls = (on: boolean) => cx("rounded-full px-4 py-2 text-sm font-semibold ring-1", on ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400");

  return (
    <div className="space-y-4" data-files-page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Files" className="flex gap-2">
          <Link href={base} className={tabCls(tab === "plans")}>Plans &amp; documents <span className="opacity-60">{sheets.length}</span></Link>
          <Link href={`${base}?tab=photos`} className={tabCls(tab === "photos")}>Photos <span className="opacity-60">{photos.length}</span></Link>
        </nav>
        {!isCrewLead && tab === "plans" && (
          <div className="flex flex-wrap gap-2">
            <FileUpload orgId={org.id} jobId={id} category="plans" label="Upload plans" />
            <FileUpload orgId={org.id} jobId={id} category="document" label="Upload a document" />
          </div>
        )}
        {tab === "photos" && <Link href={`/app/jobs/${id}/field`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Take photos on site</Link>}
      </div>

      {tab === "photos" ? (
        photos.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No photos yet. The crew adds them from the job&apos;s Field page on their phone.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-200">
              {selected && urls.get(selected.storage_path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.get(selected.storage_path)} alt={selected.caption ?? "Job photo"} className="mx-auto max-h-[70vh] w-auto object-contain" />
              )}
              {selected && <p className="bg-white px-4 py-2 text-sm text-slate-600">{[selected.caption, human(selected.category), selected.slope, when(selected.taken_at ?? selected.created_at)].filter(Boolean).join(" · ")}</p>}
            </div>
            <ul className="grid max-h-[75vh] grid-cols-3 gap-1.5 overflow-y-auto lg:grid-cols-2" data-photo-grid>
              {photos.map((p) => urls.get(p.storage_path) && (
                <li key={p.id}>
                  <Link href={`${base}?tab=photos&file=${p.id}`} scroll={false} className={cx("block overflow-hidden rounded-lg", p.id === selected?.id ? "ring-2 ring-ink" : "ring-1 ring-slate-200")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls.get(p.storage_path)} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_17rem]">
          <ul className="space-y-1.5" data-sheet-list>
            {sheets.length === 0 && <li className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200">No plans or documents yet. Upload the architect&apos;s PDF to measure from it.</li>}
            {sheets.map((f) => (
              <li key={f.id}>
                <Link href={`${base}?file=${f.id}`} scroll={false} className={cx("flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5", f.id === selected?.id ? "ring-2 ring-ink" : "ring-1 ring-slate-200 hover:ring-slate-400")}>
                  <span className={cx("grid h-9 w-8 shrink-0 place-items-center rounded text-[10px] font-bold", f.category === "plans" ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700")}>{f.category === "plans" ? "PLAN" : isPdf(f) ? "PDF" : "DOC"}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{nameOf(f)}</span><span className="block truncate text-xs text-slate-500">{when(f.created_at)}{f.size_bytes ? ` · ${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ""}</span></span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="min-h-[60vh] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200" data-sheet-viewer>
            {selected && urls.get(selected.storage_path) ? (
              isPdf(selected) ? (
                <PdfViewer key={selected.id} url={urls.get(selected.storage_path)!} name={nameOf(selected)} />
              ) : isImg(selected) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.get(selected.storage_path)} alt={nameOf(selected)} className="mx-auto max-h-[75vh] w-auto object-contain" />
              ) : (
                <div className="grid h-[60vh] place-items-center p-6 text-center"><p className="text-slate-600">No preview for this file type. <a className="font-semibold text-brand-700 underline" href={urls.get(selected.storage_path)} target="_blank" rel="noreferrer">Download it</a>.</p></div>
              )
            ) : (
              <div className="grid h-[60vh] place-items-center p-6 text-center text-slate-500">Upload plans to see them here, full size.</div>
            )}
            {selected && urls.get(selected.storage_path) && (
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-sm">
                <span className="truncate text-slate-600">{nameOf(selected)}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {!isCrewLead && (
                    <form action={deleteJobFile}>
                      <input type="hidden" name="id" value={selected.id} />
                      <button className="font-semibold text-slate-500 hover:text-red-700">Delete</button>
                    </form>
                  )}
                  <a href={urls.get(selected.storage_path)} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">Open / download ↗</a>
                </span>
              </div>
            )}
          </div>

          <aside className="space-y-3 lg:col-span-2 xl:col-span-1" data-roof-panel>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Roof</p>
              {s && m && s.trueArea > 0 ? (
                <dl className="mt-2 divide-y divide-slate-100 text-sm">
                  {m.sections.filter((x) => x.area > 0).map((x, i) => <div key={i} className="flex justify-between gap-3 py-1.5"><dt className="text-slate-500">{x.label || `Section ${i + 1}`}</dt><dd className="font-medium text-ink">{x.area} m² · {x.pitch}°</dd></div>)}
                  <div className="flex justify-between gap-3 py-1.5"><dt className="text-slate-500">True area</dt><dd className="font-semibold text-ink">{s.trueArea} m²</dd></div>
                  <div className="flex justify-between gap-3 py-1.5"><dt className="text-slate-500">Ridge · hip · valley</dt><dd className="font-medium text-ink">{m.ridge} · {m.hip} · {m.valley} m</dd></div>
                  <div className="flex justify-between gap-3 py-1.5"><dt className="text-slate-500">Eave / gutter</dt><dd className="font-medium text-ink">{m.eave} m</dd></div>
                  {e?.measurement_source && <div className="flex justify-between gap-3 py-1.5"><dt className="text-slate-500">Measured</dt><dd className="font-medium text-ink">{human(e.measurement_source)} · quote #{e.number}</dd></div>}
                </dl>
              ) : <p className="mt-1 text-sm text-slate-600">Not measured yet.</p>}
            </div>
            {e && !isCrewLead && (
              <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
                <p className="font-semibold">{plans.length ? "Measure from these plans" : "Got the architect's plans?"}</p>
                <p className="mt-0.5 text-brand-800">{plans.length ? "Read the roof plan, check the scale and pitch, and fill the quote." : "Upload the PDF, then measure from it: ridges, hips, valleys and gutters."}</p>
                <Link href={`/app/measure/${e.id}/plans`} className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-brand-500 px-4 font-semibold text-white hover:bg-brand-600">Measure from plans</Link>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
