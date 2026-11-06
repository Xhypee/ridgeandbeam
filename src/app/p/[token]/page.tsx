import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceWorkerRegister } from "@/components/field/sw-register";
import { adminClient, hasAdminKey } from "@/lib/admin";
import { EVENT_LABEL } from "@/lib/field";
import { CLAIM_STAGE_PLAIN, claimExplainer, deriveMilestones, headlineMilestone, type PublicJob } from "@/lib/field-milestones";
import { signPaths } from "@/lib/field-server";
import { date, money } from "@/lib/format";
import { anonClient } from "@/lib/public";

export const metadata: Metadata = { title: "Your roof project", robots: { index: false } };

const INVOICE_LABEL: Record<string, string> = { deposit: "Deposit invoice", progress: "Progress invoice", final: "Final invoice", change_order: "Change order invoice", supplement: "Supplement invoice", standard: "Invoice" };

export default async function Portal({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_job", { p_token: token });
  if (!data) notFound();
  const job = data as PublicJob;
  const milestones = deriveMilestones(job);
  const current = headlineMilestone(milestones);
  const doneCount = milestones.filter((m) => m.status === "done").length;

  // Signed photo URLs, only for objects inside this token's org/job folder.
  const prefix = `${job.org_id}/${job.id}/`;
  const paths = [...job.photos.map((p) => p.storage_path), ...job.events.map((e) => e.photo)].filter((p): p is string => Boolean(p?.startsWith(prefix)));
  const urls = hasAdminKey() && paths.length ? await signPaths(adminClient(), paths, 60 * 60 * 2) : new Map<string, string>();
  const ex = job.claim ? claimExplainer(job.claim) : null;
  const pendingCo = job.change_orders.filter((c) => c.status === "sent");
  const o = job.org;

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-slate-50 px-4 pb-16 pt-5 text-slate-900">
      <ServiceWorkerRegister />
      <header className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xl font-bold text-brand-700">{o.name}</p>
        <div className="mt-1 space-y-0.5 text-sm text-slate-600">
          {o.license_number && <p>License #{o.license_number}</p>}
          {o.certifications && o.certifications.length > 0 && <p>{o.certifications.join(" · ")}</p>}
          <p className="flex flex-wrap gap-x-3">
            {o.phone && <a className="font-medium text-brand-700 underline" href={`tel:${o.phone}`}>{o.phone}</a>}
            {o.email && <a className="font-medium text-brand-700 underline" href={`mailto:${o.email}`}>Email us</a>}
            {o.website && <a className="font-medium text-brand-700 underline" href={o.website} target="_blank" rel="noreferrer">Website</a>}
            {o.insurance_certificate_url && <a className="font-medium text-brand-700 underline" href={o.insurance_certificate_url} target="_blank" rel="noreferrer">Insurance certificate</a>}
          </p>
        </div>
        {(job.crew || job.rep?.name) && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {job.rep?.name && <>Your project manager: <b>{job.rep.name}</b>{job.rep.phone && <> · <a className="text-brand-700 underline" href={`tel:${job.rep.phone}`}>{job.rep.phone}</a></>}<br /></>}
            {job.crew && <>Your crew: <b>{job.crew.name}</b></>}
          </p>
        )}
      </header>

      <section className="mt-4">
        <h1 className="text-2xl font-bold">Hi {job.customer.first_name} — here&apos;s where your roof stands</h1>
        <p className="text-sm text-slate-600">{job.title}{job.site_address ? ` · ${job.site_address}` : ""}</p>
        {current && <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-base font-semibold text-brand-700" data-testid="current-milestone">Now: {current.label}</p>}
        {job.scheduled_start && !["completed", "paid"].includes(job.stage) && (
          <p className="mt-2 text-sm text-slate-700">Scheduled: <b>{date(job.scheduled_start)}</b>{job.scheduled_end && job.scheduled_end !== job.scheduled_start ? ` – ${date(job.scheduled_end)}` : ""} (weather permitting)</p>
        )}
      </section>

      {pendingCo.length > 0 && (
        <section className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300">
          <h2 className="font-bold text-amber-900">Needs your approval</h2>
          {pendingCo.map((c) => (
            <a key={c.public_token} href={`/c/${c.public_token}`} className="mt-2 flex min-h-12 items-center justify-between rounded-xl bg-white px-3 font-semibold ring-1 ring-amber-300">
              <span>{c.title}</span><span>{money(c.total)} →</span>
            </a>
          ))}
        </section>
      )}

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="ms-h">
        <h2 id="ms-h" className="mb-3 font-bold">Your project, step by step <span className="text-sm font-normal text-slate-500">({doneCount} of {milestones.length} done)</span></h2>
        <ol className="relative space-y-0" data-testid="milestones">
          {milestones.map((m, i) => (
            <li key={m.key} className="flex gap-3" data-status={m.status}>
              <div className="flex flex-col items-center">
                <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${m.status === "done" ? "bg-green-600 text-white" : m.status === "current" ? "bg-brand-500 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-500"}`}>
                  {m.status === "done" ? "✓" : i + 1}
                </span>
                {i < milestones.length - 1 && <span aria-hidden className={`w-0.5 flex-1 ${m.status === "done" ? "bg-green-600" : "bg-slate-200"}`} style={{ minHeight: 18 }} />}
              </div>
              <div className="pb-4">
                <p className={`font-semibold ${m.status === "upcoming" ? "text-slate-500" : ""}`}>
                  {m.label}
                  <span className="sr-only"> — {m.status === "done" ? "done" : m.status === "current" ? "in progress" : "coming up"}</span>
                </p>
                {(m.detail || m.date) && <p className="text-sm text-slate-600">{[m.detail, m.date && date(m.date)].filter(Boolean).join(" · ")}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {job.claim && ex && (
        <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="claim-h">
          <h2 id="claim-h" className="font-bold">Your insurance claim, in plain language</h2>
          <p className="text-sm text-slate-600">
            {[job.claim.carrier, job.claim.claim_number && `Claim #${job.claim.claim_number}`].filter(Boolean).join(" · ")} — {CLAIM_STAGE_PLAIN[job.claim.stage] ?? job.claim.stage}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Your deductible</dt><dd className="text-lg font-bold">{money(ex.deductible)}</dd><dd className="text-xs text-slate-500">You pay this</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Held back until we finish</dt><dd className="text-lg font-bold">{money(ex.heldBack)}</dd><dd className="text-xs text-slate-500">Released by your insurer</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Approved by insurer</dt><dd className="text-lg font-bold">{money(ex.rcv)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Insurance money received</dt><dd className="text-lg font-bold">{money(ex.receivedFromInsurer)}</dd></div>
          </dl>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800" data-testid="claim-explainer">
            {ex.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-4" aria-labelledby="up-h">
        <h2 id="up-h" className="mb-2 font-bold">Latest updates</h2>
        {job.events.length === 0 ? <p className="text-sm text-slate-500">Updates from the crew will show up here.</p> : (
          <ul className="space-y-2">
            {job.events.slice(0, 20).map((e, i) => (
              <li key={i} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <p className="font-semibold">{EVENT_LABEL[e.kind] ?? "Update"}</p>
                {e.note && <p className="text-sm text-slate-700">{e.note}</p>}
                <p className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</p>
                {e.photo && urls.get(e.photo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls.get(e.photo)} alt="" className="mt-2 max-h-64 w-full rounded-xl object-cover" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {job.photos.length > 0 && (
        <section className="mt-4" aria-labelledby="ph-h">
          <h2 id="ph-h" className="mb-2 font-bold">Photos of your roof</h2>
          <ul className="grid grid-cols-2 gap-2">
            {job.photos.map((p) => urls.get(p.storage_path) && (
              <li key={p.storage_path}>
                <a href={urls.get(p.storage_path)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls.get(p.storage_path)} alt={p.caption ?? "Roof photo"} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
                </a>
                {p.caption && <p className="mt-1 text-xs text-slate-600">{p.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="docs-h">
        <h2 id="docs-h" className="mb-2 font-bold">Documents</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {job.estimates.map((e) => (
            <li key={e.public_token}><a href={`/q/${e.public_token}`} className="flex min-h-12 items-center justify-between gap-2">
              <span>Estimate #{e.number}{e.status === "accepted" ? " (signed)" : ""}</span><span className="font-semibold">{money(e.total)} →</span></a></li>
          ))}
          {job.change_orders.map((c) => (
            <li key={c.public_token}><a href={`/c/${c.public_token}`} className="flex min-h-12 items-center justify-between gap-2">
              <span>Change order: {c.title} <span className="text-slate-500">({c.status === "sent" ? "needs approval" : c.status})</span></span><span className="font-semibold">{money(c.total)} →</span></a></li>
          ))}
          {job.invoices.map((v) => (
            <li key={v.public_token}><a href={`/i/${v.public_token}`} className="flex min-h-12 items-center justify-between gap-2">
              <span>{v.milestone_label || INVOICE_LABEL[v.kind] || "Invoice"} #{v.number}</span>
              <span className="text-right font-semibold">{Number(v.balance) > 0 ? `${money(v.balance)} due` : "Paid ✓"} →</span></a></li>
          ))}
          {job.estimates.length + job.invoices.length + job.change_orders.length === 0 && <li className="py-2 text-slate-500">Your estimate and invoices will appear here.</li>}
        </ul>
      </section>

      {job.warranty_product && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200">
          Warranty: <b>{job.warranty_product}</b> — {job.warranty_registered_at ? `registered ${date(job.warranty_registered_at)}` : "we'll register it with the manufacturer after install."}
        </p>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Questions? Reply to our text or call {o.phone ?? o.name}.</p>
    </main>
  );
}
