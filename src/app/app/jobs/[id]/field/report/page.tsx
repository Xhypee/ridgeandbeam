import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiPhotoSummary } from "@/components/field/ai-photo-summary";
import { PrintButton } from "@/components/print-button";
import { ServiceWorkerRegister } from "@/components/field/sw-register";
import { requireOrg } from "@/lib/dal";
import { formatAbn } from "@/lib/au";
import { CATEGORY_LABEL, COUNT_CATEGORY, DAMAGE_CATEGORIES, SLOPES, SLOPE_LABEL } from "@/lib/field";
import { loadFieldData } from "@/lib/field-server";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Storm damage photo report" };

export default async function PhotoReport({ params, searchParams }: PageProps<"/app/jobs/[id]/field/report">) {
  const { id } = await params;
  const sp = await searchParams;
  const sharedOnly = sp.shared === "1";
  const { supabase, org } = await requireOrg();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, site_address, state, customers(name, address, city, state, zip), claims(carrier, claim_number, date_of_loss, cause_of_loss, event_type)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const c = job.customers as unknown as { name: string; address: string | null; city: string | null; state: string | null; zip: string | null };
  const claim = (Array.isArray(job.claims) ? job.claims[0] : job.claims) as { carrier: string | null; claim_number: string | null; date_of_loss: string | null; cause_of_loss: string | null; event_type: string | null } | null;
  const st = (job.state ?? c.state ?? "").toUpperCase();
  const licence = st ? org.licences?.[st]?.number : null;
  const { files } = await loadFieldData(supabase, job.id);
  const photos = files.filter((f) => f.kind === "photo" && (!sharedOnly || f.shared)).reverse();
  const groups = [...SLOPES, null].map((s) => ({
    slope: s,
    photos: photos.filter((p) => (s === null ? !p.slope || !SLOPES.includes(p.slope as (typeof SLOPES)[number]) : p.slope === s)),
  })).filter((g) => g.photos.length);
  // Broken tiles per slope: each tile photo carries the slope's running tally, so the slope's count is the highest.
  const tileCounts = SLOPES.map((s) => {
    const ts = photos.filter((p) => p.slope === s && p.category === COUNT_CATEGORY && p.hits != null);
    return { slope: s, count: ts.length ? Math.max(...ts.map((p) => p.hits ?? 0)) : null };
  }).filter((t): t is { slope: (typeof SLOPES)[number]; count: number } => t.count !== null);
  const totalTiles = tileCounts.reduce((n, t) => n + t.count, 0);
  const damage = DAMAGE_CATEGORIES.map((k) => ({ k, n: photos.filter((p) => p.category === k).length })).filter((d) => d.n > 0);
  const aiOn = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="mx-auto max-w-4xl">
      <ServiceWorkerRegister />
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/app/jobs/${job.id}/field`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">← Field</Link>
        <Link href={`?shared=${sharedOnly ? "0" : "1"}`} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">
          {sharedOnly ? "Show all photos" : "Only photos shared with homeowner"}
        </Link>
        <PrintButton />
      </div>
      {aiOn && <div className="no-print mb-4"><AiPhotoSummary jobId={job.id} /></div>}
      <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 print:p-0 print:ring-0">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-sm font-semibold text-brand-700">{org.name}{org.abn ? ` · ABN ${formatAbn(org.abn)}` : ""}{licence ? ` · ${st} licence ${licence}` : ""}</p>
          <h1 className="text-2xl font-bold">Storm damage photo report</h1>
          <p className="text-sm text-slate-600">Prepared for the insurer&apos;s assessor. Dated photos, grouped by roof slope.</p>
          <p className="text-sm text-slate-600">{c.name} · {job.site_address || [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}</p>
          {claim && (
            <p className="text-sm text-slate-600">
              {[claim.carrier, claim.claim_number && `Claim #${claim.claim_number}`, claim.date_of_loss && `Date of event ${date(claim.date_of_loss)}`, claim.cause_of_loss].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-xs text-slate-500">{photos.length} photo{photos.length === 1 ? "" : "s"} · prepared {date(new Date().toISOString())}</p>
        </header>

        {(damage.length > 0 || tileCounts.length > 0) && (
          <section className="grid gap-6 border-b border-slate-200 py-4 sm:grid-cols-2" data-testid="damage-summary">
            {damage.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold">Damage photographed</h2>
                <ul className="space-y-1 text-sm">
                  {damage.map((d) => <li key={d.k} className="flex justify-between gap-4"><span>{CATEGORY_LABEL[d.k]}</span><span className="font-semibold tabular-nums">{d.n} photo{d.n === 1 ? "" : "s"}</span></li>)}
                </ul>
              </div>
            )}
            {tileCounts.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold">Broken / cracked tiles counted</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {tileCounts.map((t) => (
                      <tr key={t.slope}><td className="py-0.5 text-slate-600">{SLOPE_LABEL[t.slope]} slope</td><td className="py-0.5 text-right font-semibold tabular-nums">{t.count}</td></tr>
                    ))}
                    <tr className="border-t border-slate-200"><td className="py-1 font-semibold">Total</td><td className="py-1 text-right font-semibold tabular-nums" data-testid="tile-total">{totalTiles}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {groups.length === 0 && <p className="py-8 text-center text-slate-500">No photos yet.</p>}
        {groups.map((g) => (
          <section key={g.slope ?? "none"} className="break-inside-avoid-page py-4">
            <h2 className="mb-2 text-lg font-semibold">{g.slope ? `${SLOPE_LABEL[g.slope]} slope` : "Other / untagged"} <span className="text-sm font-normal text-slate-500">({g.photos.length})</span></h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {g.photos.map((p) => (
                <figure key={p.id} className="break-inside-avoid">
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.caption ?? ""} className="aspect-[4/3] w-full rounded-lg bg-slate-100 object-cover" />
                  )}
                  <figcaption className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">{CATEGORY_LABEL[p.category] ?? p.category}</span>
                    {p.hits != null && p.category === COUNT_CATEGORY ? ` · ${p.hits} broken on this slope` : ""}
                    {p.caption ? ` — ${p.caption}` : ""}
                    <span className="block text-slate-500">{date(p.taken_at ?? p.created_at, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
