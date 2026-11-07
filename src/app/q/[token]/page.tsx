import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { DoorKnockSaleBanner } from "@/components/door-knock-banner";
import { QuoteBusiness } from "@/components/quote-business";
import { StateNotices, type StateNotice } from "@/components/state-notices";
import { date, money } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { AcceptForm, OptionCards } from "./accept-form";
import { CustomerDocket } from "./customer-docket";
import { colourHex, roofFacts, roofTitle, sectionsProfile } from "@/lib/docket";
import { GENERIC_ROOF, roofShapeFromPlan } from "@/lib/docket-shape";
import { abnText, licenceFor } from "@/lib/business";
import { AU_STATE_TZ } from "@/lib/au";
import { METAL_PROFILES, normalizeMeasurements, type MetalProfile } from "@/lib/roof";
import { DownloadPdfButton } from "./download-button";
import { auAddress, buildProposal, type PublicEstimate } from "./model";

export const metadata: Metadata = { title: "Your quote", robots: { index: false } };

const UNIT: Record<string, string> = { m2: "m²" };
const unit = (u: string) => UNIT[u] ?? u;

export default async function PublicEstimatePage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_estimate", { p_token: token });
  if (!data) notFound();
  const doc = data as PublicEstimate;
  const p = buildProposal(doc);
  const word = doc.option_label === "alternates" ? "alternate" : "option";
  const hasOptions = p.options.length > 0;
  const accepted = doc.status === "accepted";
  const chosen = p.options.find((o) => o.id === doc.selected_option_id) ?? null;
  const financingNote = doc.financing?.enabled
    ? `Estimated monthly repayment at ${Number(doc.financing.apr)}% p.a. over ${doc.financing.term_months} months, subject to the lender's approval. Not a loan offer.`
    : null;
  const total = chosen ? chosen.total : p.totals.total;
  const gstCharged = Number(doc.tax_rate) > 0;
  const customerAddress = auAddress(doc.customer);
  const orgAddress = [doc.org.address, [doc.org.state, doc.org.postcode].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const licences = p.state && doc.org.licence ? { [p.state]: doc.org.licence } : {};

  const notesAndNotices = (
    <>
      {(doc.notes || doc.terms) && (
        <section className="mt-6 grid gap-6 rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200 sm:grid-cols-2 sm:p-6">
          {doc.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Scope & notes</p><p className="whitespace-pre-wrap text-slate-700">{doc.notes}</p></div>}
          {doc.terms && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Terms</p><p className="whitespace-pre-wrap text-slate-700">{doc.terms}</p></div>}
        </section>
      )}
      {p.notices.length > 0 && (
        <section className="mt-6 space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6" data-testid="legal-notices">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Important notices</p>
          <StateNotices notices={p.notices as StateNotice[]} />
        </section>
      )}
    </>
  );

  if (!hasOptions) {
    // The receipt docket (single-price quotes).
    const m = normalizeMeasurements({ units: "metric", jobType: doc.roof?.job_type ?? undefined, sections: doc.roof?.sections ?? [] });
    const plan = roofShapeFromPlan(doc.roof?.plan);
    const metal = m.sections.some((x) => x.area > 0 && (x.system ?? "metal") === "metal");
    const profile = (METAL_PROFILES as string[]).includes(doc.roof_profile ?? "") ? (doc.roof_profile as MetalProfile) : sectionsProfile(m);
    const lic = licenceFor(licences, p.state);
    const firstName = doc.customer.name.split(" ")[0];
    return (
      <main className="min-h-screen px-4 py-6 sm:py-10">
        <div className="no-print mx-auto mb-4 flex max-w-3xl items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prepared for</p>
            <p className="font-display text-xl font-bold text-ink">{doc.customer.name}</p>
            {customerAddress && <p className="text-sm text-slate-500">{customerAddress}</p>}
          </div>
          <PrintButton />
        </div>
        <div className="mx-auto max-w-3xl">
          {doc.status === "sent" && <p className="no-print mb-4 text-slate-600">Hi {firstName}, here&apos;s your quote from {doc.org.name}. Add any extras you&apos;d like, then sign at the bottom.</p>}
          <DoorKnockSaleBanner
            className="mb-4"
            state={p.state}
            leadSource={doc.job.lead_source}
            doorKnockSale={doc.compliance?.door_knock_sale ?? undefined}
            disasterEmergencyRepair={doc.compliance?.disaster_emergency_repair ?? undefined}
            signedAt={doc.accepted_at}
            contractValueIncGst={p.totals.total}
          />
          <CustomerDocket
            token={token}
            orgName={doc.org.name}
            status={doc.status}
            header={{ name: doc.org.name, abn: abnText(doc.org.abn), licence: lic ? `${lic.state} ${lic.number}` : null, number: doc.number, date: date(doc.sent_at ?? doc.created_at, { day: "2-digit", month: "2-digit", year: "numeric" }) }}
            roof={{
              shape: plan ?? GENERIC_ROOF,
              hex: colourHex(doc.roof_colour) ?? "#a9adb0",
              title: roofTitle(m, metal ? profile : null),
              facts: `${roofFacts(m, plan ? plan.faces.length : null)}${metal && doc.roof_colour ? ` · ${doc.roof_colour}` : ""}`,
              address: doc.job.site_address || customerAddress || null,
            }}
            items={doc.items}
            discount={Number(doc.discount)}
            taxRate={Number(doc.tax_rate)}
            inclusive={Boolean(doc.gst_inclusive)}
          >
            {notesAndNotices}
            {doc.org.insurance_certificate_url && <p className="mt-4 text-sm"><a className="text-brand-600 underline" href={doc.org.insurance_certificate_url} target="_blank" rel="noreferrer">Certificate of insurance</a></p>}
          </CustomerDocket>

          {accepted && (
            <section className="mt-6 rounded-2xl bg-green-50 p-5 ring-1 ring-green-200 print:bg-white" data-testid="receipt">
              <h2 className="font-display text-lg font-bold text-green-900">Signed and accepted</h2>
              <p className="mt-1 text-sm text-green-900">
                <b>{money(p.totals.total)}</b>{gstCharged ? " inc GST" : ""} · accepted by <b>{doc.accepted_name}</b>{doc.accepted_at ? ` on ${date(doc.accepted_at, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: (p.state && AU_STATE_TZ[p.state]) || "Australia/Sydney" })}` : ""}.
              </p>
              {doc.signature_data && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doc.signature_data} alt={`Signature of ${doc.accepted_name ?? "customer"}`} className="mt-3 h-24 max-w-full rounded-lg bg-white p-2 ring-1 ring-green-200" />
              )}
            </section>
          )}
          {accepted && (
            <section className="no-print mt-6 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold">Thank you{doc.accepted_name ? `, ${doc.accepted_name.split(" ")[0]}` : ""}!</h2>
              <p className="mt-1 text-sm text-slate-600">Your acceptance has been recorded. {doc.org.name} will be in touch to book your job. Keep a copy for your records.</p>
              <div className="mt-4"><DownloadPdfButton /></div>
            </section>
          )}
          {doc.status === "declined" && (
            <p className="no-print mt-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">This quote was declined. Contact {doc.org.name} if you&apos;d like a revised quote.</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-4xl justify-end"><PrintButton /></div>

      <article className="mx-auto max-w-4xl space-y-8 bg-white p-5 ring-1 ring-slate-200 sm:rounded-2xl sm:p-10 print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <QuoteBusiness name={doc.org.name} abn={doc.org.abn} licences={licences} state={p.state} gstRegistered={doc.org.gst_registered} />
            <div className="mt-0.5 space-y-0.5 text-sm text-slate-500">
              {orgAddress && <p>{orgAddress}</p>}
              <p>{[doc.org.phone, doc.org.email, doc.org.website].filter(Boolean).join(" · ")}</p>
              {doc.org.insurance_certificate_url && <p><a className="text-brand-600 underline" href={doc.org.insurance_certificate_url} target="_blank" rel="noreferrer">Certificate of insurance</a></p>}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold uppercase tracking-wide text-brand-600">{hasOptions && !accepted ? "Proposal" : "Quote"}</p>
            <p className="text-sm text-slate-600">#{doc.number}</p>
            <p className="text-sm text-slate-500">{date(doc.sent_at ?? doc.created_at)}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prepared for</p>
            <p className="mt-1 font-medium text-slate-900">{doc.customer.name}</p>
            {customerAddress && <p className="text-sm text-slate-600">{customerAddress}</p>}
            <p className="text-sm text-slate-600">{[doc.customer.phone, doc.customer.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Job</p>
            <p className="mt-1 font-medium text-slate-900">{doc.job.title}</p>
            {doc.job.site_address && <p className="text-sm text-slate-600">{doc.job.site_address}</p>}
          </div>
        </section>

        <DoorKnockSaleBanner
          state={p.state}
          leadSource={doc.job.lead_source}
          doorKnockSale={doc.compliance?.door_knock_sale ?? undefined}
          disasterEmergencyRepair={doc.compliance?.disaster_emergency_repair ?? undefined}
          signedAt={doc.accepted_at}
          contractValueIncGst={total}
        />

        {/* Single-price quotes return the docket above; this page lays out Good / Better / Best. */}
        {p.shared.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Included with every {word}</h2>
            <ul className="grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
              {p.shared.map((i, k) => (
                <li key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                  <span>{i.description}</span><span className="shrink-0 tabular-nums text-slate-500">{Number(i.quantity)} {unit(i.unit)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {accepted ? (
          chosen && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your choice</h2>
              <OptionCards options={[chosen]} selected={chosen.id} word={word} financingNote={financingNote} gstCharged={gstCharged} />
            </section>
          )
        ) : doc.status !== "sent" ? (
          <OptionCards options={p.options} selected={null} word={word} financingNote={financingNote} gstCharged={gstCharged} />
        ) : null}
        <p className="text-xs text-slate-500" data-testid="price-basis">
          All prices are in Australian dollars{gstCharged ? " and include GST" : ""}{doc.discount > 0 ? `, after a ${money(doc.discount)} discount` : ""}.
        </p>

        {(doc.notes || doc.terms) && (
          <section className="grid gap-6 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
            {doc.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Scope & notes</p><p className="whitespace-pre-wrap text-slate-700">{doc.notes}</p></div>}
            {doc.terms && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Terms</p><p className="whitespace-pre-wrap text-slate-700">{doc.terms}</p></div>}
          </section>
        )}

        {p.notices.length > 0 && (
          <section className="space-y-3 border-t border-slate-200 pt-6" data-testid="legal-notices">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Important notices</p>
            <StateNotices notices={p.notices as StateNotice[]} />
          </section>
        )}

        {accepted && (
          <section className="rounded-xl bg-green-50 p-5 ring-1 ring-green-200 print:bg-white" data-testid="receipt">
            <h2 className="text-lg font-semibold text-green-900">Signed and accepted</h2>
            <p className="mt-1 text-sm text-green-900">
              {chosen ? <><b>{chosen.name}</b> · </> : null}<b>{money(total)}</b>{gstCharged ? " inc GST" : ""} · accepted by <b>{doc.accepted_name}</b>{doc.accepted_at ? ` on ${date(doc.accepted_at, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}.
            </p>
            {doc.signature_data && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.signature_data} alt={`Signature of ${doc.accepted_name ?? "customer"}`} className="mt-3 h-24 max-w-full rounded-lg bg-white p-2 ring-1 ring-green-200" />
            )}
          </section>
        )}
      </article>

      {doc.status === "sent" && (
        <div className="mx-auto mt-6 max-w-4xl">
          <AcceptForm token={token} orgName={doc.org.name} options={p.options} word={word} total={p.totals.total} financingNote={financingNote} gstCharged={gstCharged}
            items={doc.items} discount={Number(doc.discount)} taxRate={Number(doc.tax_rate)} inclusive={Boolean(doc.gst_inclusive)} />
        </div>
      )}
      {accepted && (
        <section className="no-print mx-auto mt-6 max-w-4xl rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Thank you{doc.accepted_name ? `, ${doc.accepted_name.split(" ")[0]}` : ""}!</h2>
          <p className="mt-1 text-sm text-slate-600">Your acceptance has been recorded. {doc.org.name} will be in touch to book your job. Keep a copy for your records.</p>
          <div className="mt-4"><DownloadPdfButton /></div>
        </section>
      )}
      {doc.status === "declined" && (
        <p className="no-print mx-auto mt-6 max-w-4xl rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">This quote was declined. Contact {doc.org.name} if you&apos;d like a revised quote.</p>
      )}
    </main>
  );
}
