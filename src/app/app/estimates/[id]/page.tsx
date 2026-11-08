import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { QuoteBusiness } from "@/components/quote-business";
import { DoorKnockSaleBanner } from "@/components/door-knock-banner";
import { StateCompliancePanel } from "@/components/state-compliance-panel";
import { Badge, Card, LinkButton, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { resolveJobState } from "@/lib/estimate-notices";
import { effectiveOptionId, estimateTotals, itemsForOption } from "@/lib/estimate-totals";
import { isDoorKnockSource } from "@/lib/au-rules";
import { type CatalogRow, type DraftItem, type DraftOption } from "@/lib/estimating";
import { date, label, siteUrl, STATUS_TONE } from "@/lib/format";
import { AU_STATE_TZ } from "@/lib/au";
import { listOrgSuppliers } from "@/lib/suppliers";
import { roofShape } from "@/lib/docket-shape";
import { quotePriceBook, usableCatalog } from "@/lib/docket-server";
import { abnText, licenceFor } from "@/lib/business";
import { PrintButton } from "@/components/print-button";
import { auAddress } from "@/app/q/[token]/model";
import { createInvoiceFromEstimate } from "../../invoices/actions";
import { deleteEstimate, duplicateEstimate, setEstimateStatus } from "../actions";
import { DocketEditor } from "./docket-editor";
import { QuoteEngine } from "./quote-engine";
import { loadSupplierChoices, RoofPlanPanel, RulesLine } from "./engine-data";
import { QuotePreview } from "../../jobs/quote-preview";
import { loadQuoteEmail } from "@/lib/quote-email-server";
import { normaliseStages, type PaymentPlan } from "@/lib/quote-pricing";
import { EstimateEditor } from "./estimate-editor";

type ItemRow = DraftItem & { id: string; position: number; option_id: string | null };
type OptionRow = { id: string; position: number; name: string; tier: DraftOption["tier"]; description: string | null; warranty: string | null; recommended: boolean };

export default async function EstimatePage({ params, searchParams }: PageProps<"/app/estimates/[id]">) {
  const { id } = await params;
  const { view, preview: previewParam } = await searchParams;
  const { supabase, org, user, memberships, isAdmin } = await requireMoneyAccess();
  const [{ data: e }, { data: catalog }, suppliers] = await Promise.all([
    supabase
      .from("estimates")
      .select("*, estimate_items(*), estimate_options!estimate_options_estimate_id_fkey(*), jobs(id, title, state, site_address, is_insurance, roof_material, job_type, lead_source, customers(name, email, state, address, city, zip))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("catalog_items").select("*").order("category").order("calc_key").order("name"),
    listOrgSuppliers(supabase, org.id).catch(() => []),
  ]);
  const { data: profile } = e ? await supabase.from("job_compliance_profiles").select("*").eq("job_id", e.job_id).maybeSingle() : { data: null };
  if (!e) notFound();
  const items = ((e.estimate_items ?? []) as ItemRow[]).sort((a, b) => a.position - b.position);
  const options = ((e.estimate_options ?? []) as OptionRow[]).sort((a, b) => a.position - b.position);
  const job = e.jobs as { id: string; title: string; state: string | null; site_address: string | null; is_insurance: boolean; roof_material: string | null; job_type: string | null; lead_source: string | null; customers: { name: string; email: string | null; state: string | null; address: string | null; city: string | null; zip: string | null } };
  const publicUrl = `${siteUrl()}/q/${e.public_token}`;
  const status = e.status as string;
  const word = e.option_label === "alternates" ? "alternate" : "option";
  const resolved = resolveJobState(job.state, job.customers.state, org.state);
  const effOption = effectiveOptionId(options, e.selected_option_id);
  // Contract value for the state rules: the chosen option once accepted, else the dearest option (worst case for thresholds).
  const totalFor = (optionId: string | null) => estimateTotals(itemsForOption(items, optionId), Number(e.discount), Number(e.tax_rate), Boolean(e.gst_inclusive)).total;
  const contractValue = status === "accepted" || !options.length ? totalFor(effOption) : Math.max(...options.map((o) => totalFor(o.id)));
  const extra = org as typeof org & { calc_defaults?: unknown };
  // AU price book only: legacy (US-keyed) and certification-gated items stay out of the editor.
  const offered = usableCatalog((catalog ?? []) as CatalogRow[], org);
  // The docket is the quote's default view; quotes with Good / Better / Best options open in the detailed editor.
  const docket = !options.length && view !== "editor";
  // The quoting engine is the default for single-price quotes that aren't signed; ?view=docket / editor keep the older views.
  const engine = !options.length && status !== "accepted" && view !== "editor" && view !== "docket";

  const statusBtn = (s: string, text: string, variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", confirm?: string) => (
    <form action={setEstimateStatus}>
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton variant={variant} confirm={confirm}>{text}</SubmitButton>
    </form>
  );

  const selectedName = options.find((o) => o.id === e.selected_option_id)?.name;
  const hasPlans = Boolean((e.measurements as { plans?: { v?: number } } | null)?.plans?.v);
  const drawing = roofShape(e.measurements);
  const lic = licenceFor(org.licences, resolved.state);
  const priced = docket && status !== "accepted" ? await quotePriceBook(supabase, org, offered, (e.org_supplier_id as string | null) ?? null) : { book: offered };
  const draftItems: DraftItem[] = items.map((i) => ({
    id: i.id, required: Boolean(i.required), customer_removed: Boolean(i.customer_removed), variants: (i.variants as DraftItem["variants"]) ?? null,
    description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price), unit_cost: Number(i.unit_cost ?? 0),
    category: i.category, calc_key: i.calc_key ?? null, option_key: i.option_id, supplier_price_item_id: i.supplier_price_item_id ?? null,
    extra_status: i.extra_status ?? null, blurb: i.blurb ?? null, customer_added: Boolean(i.customer_added),
  }));

  let engineNode: React.ReactNode = null;
  let previewNode: React.ReactNode = null;
  if (engine) {
    const sup = await loadSupplierChoices(supabase, org, (e.org_supplier_id as string | null) ?? null);
    const site = job.site_address || auAddress({ street: job.customers.address, suburb: job.customers.city, state: job.customers.state, postcode: job.customers.zip }) || "";
    const plan: PaymentPlan = { mode: e.payment_mode === "instalments" ? "instalments" : "full", when: (["signed", "delivered", "completed"].includes(e.payment_when) ? e.payment_when : "completed") as PaymentPlan["when"], stages: normaliseStages(e.payment_stages as never) };
    const previewHref = `/app/estimates/${e.id}?preview=1`;
    engineNode = (
      <QuoteEngine
        id={e.id} number={e.number} status={status} firstName={job.customers.name.split(" ")[0] || job.customers.name}
        party={{ name: job.customers.name, email: job.customers.email ?? "", site, title: job.title }}
        notes={e.notes ?? ""} terms={e.terms ?? ""}
        items={draftItems}
        base={{ measurements: (e.measurements ?? {}) as Record<string, unknown>, measurement_source: e.measurement_source ?? null, option_label: e.option_label === "alternates" ? "alternates" : "options", tax_rate: Number(e.tax_rate), gst_inclusive: Boolean(e.gst_inclusive), discount: Number(e.discount), org_supplier_id: (e.org_supplier_id as string | null) ?? null }}
        marginPct={e.margin_pct === null || e.margin_pct === undefined ? null : Number(e.margin_pct)}
        payment={plan}
        supplier={sup.current} suppliers={sup.choices} nearLabel={sup.nearLabel} canSetDefault={isAdmin}
        previewHref={previewHref}
        roofPlan={<RoofPlanPanel estimateId={e.id} measurements={e.measurements} source={e.measurement_source ?? null} />}
        rules={<RulesLine state={resolved.state} total={contractValue} roofMaterial={profile?.roof_system ?? job.roof_material} jobType={profile?.au_job_type ?? job.job_type} />}
      />
    );
  }
  if (previewParam === "1" && status !== "accepted") {
    const me = memberships.find((m) => m.org_id === org.id);
    const q = await loadQuoteEmail(supabase, org, e.id, { senderName: me?.full_name || user.fullName || org.name, senderPhone: me?.phone ?? org.phone, asSent: true });
    if (q) previewNode = (
      <QuotePreview html={q.email.html} subject={q.email.subject} toName={q.to.name} toEmail={q.to.email}
        fromName={`${org.name} <${(process.env.EMAIL_FROM ?? "hello@ridgeandbeam.com").replace(/^.*<([^>]+)>.*$/, "$1")}>`}
        estimateId={e.id} closeHref={`/app/estimates/${e.id}`} sent={status === "sent"} />
    );
  }

  return (
    <>
      {/* Full-screen quoting engine: its own top bar instead of the app menu. */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white" data-quote-bar>
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href={`/app/jobs?job=${job.id}`} aria-label="Back to the job" title="Back to the job" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2"><span className="truncate font-display text-lg font-bold text-ink">{job.customers.name}</span><Badge tone={STATUS_TONE[status]}>{label(status)}</Badge></p>
            <p className="truncate text-xs text-slate-500">Quote #{e.number} · {job.title} · Created {date(e.created_at)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {docket && <span className="hidden sm:inline-flex"><PrintButton /></span>}
            {!docket && !options.length && <LinkButton variant="secondary" href={`/app/estimates/${e.id}?view=docket`} data-testid="docket-view">Docket view</LinkButton>}
            {status === "draft" && !docket && statusBtn("sent", "Mark as sent", "primary")}
            {status !== "draft" && !docket && <CopyLink url={publicUrl} />}
            {status !== "draft" && <LinkButton variant="secondary" href={`/q/${e.public_token}?office=1`} target="_blank">Customer view</LinkButton>}
            {status === "sent" && (
              <form action={setEstimateStatus} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="accepted" />
                {options.length > 0 && (
                  <Select name="option_id" defaultValue={effOption ?? ""} className="w-auto" aria-label={`Accepted ${word}`}>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                )}
                <SubmitButton variant="secondary">Mark accepted</SubmitButton>
              </form>
            )}
            {status === "sent" && statusBtn("declined", "Mark declined", "ghost")}
            {status === "accepted" && (
              <form action={createInvoiceFromEstimate}>
                <input type="hidden" name="estimate_id" value={e.id} />
                <SubmitButton>Create invoice</SubmitButton>
              </form>
            )}
          
            {status !== "accepted" && (
              <Link href={`/app/estimates/${e.id}?preview=1`} scroll={false} title="Preview the email the customer gets" aria-label="Preview the email the customer gets" className="grid h-10 w-10 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6" /></svg>
              </Link>
            )}
            <Link href={`/app/jobs?job=${job.id}`} aria-label="Close" title="Close" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </Link>
          </div>
        </div>
      </header>
      {engine ? engineNode : (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {!docket && (
        <>
          {status === "draft" && (
            <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Draft. When it&apos;s ready, <b>Mark as sent</b> to get a link the customer can open, compare {word}s, and sign online.
            </p>
          )}
          {status === "sent" && (
            <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Send this link to {job.customers.name}{job.customers.email ? ` (${job.customers.email})` : ""}: <span className="break-all font-mono text-xs">{publicUrl}</span>.
              They can review{options.length ? `, pick an ${word},` : ""} and sign it online.
            </p>
          )}
          {status === "accepted" && (
            <div className="mb-6 flex flex-wrap items-start gap-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="flex-1">
                Accepted {e.accepted_at ? date(e.accepted_at) : ""}{e.accepted_name ? ` by ${e.accepted_name}` : ""}{selectedName ? ` · chose ${selectedName}` : ""}
                {e.accepted_ip ? ` · IP ${e.accepted_ip}` : ""}. This quote is locked; duplicate it to make a variation.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.signature_data && <img src={e.signature_data} alt="Customer signature" className="h-14 rounded bg-white px-2 ring-1 ring-green-200" />}
            </div>
          )}

        </>
      )}

      <DoorKnockSaleBanner
        className="mb-6"
        state={resolved.state}
        leadSource={job.lead_source}
        doorKnockSale={profile?.door_knock_sale ?? undefined}
        disasterEmergencyRepair={profile?.disaster_emergency_repair ?? undefined}
        signedAt={e.accepted_at}
        contractValueIncGst={contractValue}
      />

      {docket ? (
        <>
          <DocketEditor
            id={e.id}
            status={status as "draft" | "sent" | "accepted" | "declined"}
            publicUrl={publicUrl}
            header={{
              name: org.name,
              abn: abnText(org.abn),
              licence: lic ? `${lic.state} ${lic.number}` : null,
              number: e.number,
              date: date(e.sent_at ?? e.created_at, { day: "2-digit", month: "2-digit", year: "numeric" }),
            }}
            address={job.site_address || auAddress({ street: job.customers.address, suburb: job.customers.city, state: job.customers.state, postcode: job.customers.zip }) || null}
            customer={{ name: job.customers.name, email: job.customers.email }}
            shape={drawing.shape}
            panels={drawing.panels}
            hasPlans={hasPlans}
            book={priced.book}
            defaultWaste={Number(org.default_waste_pct)}
            calcDefaults={extra.calc_defaults ?? {}}
            initial={{
              measurements: e.measurements,
              measurement_source: e.measurement_source,
              items: draftItems,
              roof_profile: (e.roof_profile as never) ?? null,
              roof_colour: (e.roof_colour as string | null) ?? null,
              customer_colour: e.customer_colour !== false,
              colour_by_customer: Boolean(e.colour_by_customer),
              tax_rate: org.gst_registered !== false ? Number(e.tax_rate) : 0,
              gst_inclusive: Boolean(e.gst_inclusive),
              org_supplier_id: (e.org_supplier_id as string | null) ?? null,
              discount: Number(e.discount),
              notes: e.notes,
              terms: e.terms,
            }}
            accepted={status === "accepted" ? { name: e.accepted_name, at: e.accepted_at ? date(e.accepted_at, { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: AU_STATE_TZ[resolved.state ?? "NSW"] ?? "Australia/Sydney" }) : null, ip: e.accepted_ip, signature: e.signature_data } : null}
          />
          <div className="no-print mx-auto mt-8 max-w-3xl">
            <StateCompliancePanel
              summary
              state={resolved.state}
              source={resolved.source}
              contractValueIncGst={contractValue > 0 ? contractValue : null}
              contractDate={e.accepted_at ?? new Date()}
              roofSystem={profile?.roof_system ?? job.roof_material}
              jobType={profile?.au_job_type ?? job.job_type}
              doorKnockSale={profile?.door_knock_sale ?? isDoorKnockSource(job.lead_source)}
              ownerOccupier={profile?.owner_occupier ?? undefined}
              existingHouse={profile?.existing_house ?? undefined}
              licenceNumber={resolved.state ? org.licences?.[resolved.state]?.number ?? null : null}
            />
          </div>
        </>
      ) : (
        <>
          {options.length > 0 && (
            <p className="no-print mb-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700" data-testid="options-note">
              This quote offers {word}s, so it opens in the detailed editor. The receipt docket is for single-price quotes: turn off <b>Offer options</b> to use it.
            </p>
          )}
        <div className="mb-6 grid items-start gap-4 lg:grid-cols-2">
          <Card title="Quote header">
            <QuoteBusiness name={org.name} abn={org.abn} licences={org.licences} state={resolved.state} gstRegistered={org.gst_registered} warnMissing />
          </Card>
          <StateCompliancePanel
            summary
            state={resolved.state}
            source={resolved.source}
            contractValueIncGst={contractValue > 0 ? contractValue : null}
            contractDate={e.accepted_at ?? new Date()}
            roofSystem={profile?.roof_system ?? job.roof_material}
            jobType={profile?.au_job_type ?? job.job_type}
            doorKnockSale={profile?.door_knock_sale ?? isDoorKnockSource(job.lead_source)}
            ownerOccupier={profile?.owner_occupier ?? undefined}
            existingHouse={profile?.existing_house ?? undefined}
            licenceNumber={resolved.state ? org.licences?.[resolved.state]?.number ?? null : null}
          />
        </div>

        <EstimateEditor
          id={e.id}
          locked={status === "accepted"}
          catalog={offered}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, hasSheet: Boolean(s.active_list) }))}
          defaultWaste={Number(org.default_waste_pct)}
          calcDefaults={extra.calc_defaults ?? {}}
          minMarginPct={Number(org.min_margin_pct) || 0}
          gstRegistered={org.gst_registered !== false}
          financing={{ enabled: Boolean(org.financing?.enabled), apr: Number(org.financing?.apr) || 0, term_months: Number(org.financing?.term_months) || 0 }}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
          roofColour={(e.roof_colour as string | null) ?? null}
          initial={{
            measurements: e.measurements,
            measurement_source: e.measurement_source,
            option_label: e.option_label === "alternates" ? "alternates" : "options",
            options: options.map((o) => ({ key: o.id, id: o.id, name: o.name, tier: o.tier, description: o.description ?? "", warranty: o.warranty ?? "", recommended: o.recommended })),
            items: draftItems,
            tax_rate: Number(e.tax_rate),
            gst_inclusive: Boolean(e.gst_inclusive),
            org_supplier_id: (e.org_supplier_id as string | null) ?? null,
            discount: Number(e.discount),
            notes: e.notes,
            terms: e.terms,
          }}
        />
        </>
      )}

      <Card className="no-print mt-6" title="More">
        <div className="flex flex-wrap gap-2">
          <form action={duplicateEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="secondary">Duplicate</SubmitButton>
          </form>
          {status !== "draft" && statusBtn("draft", "Revert to draft", "ghost", "Move this quote back to draft? The customer link stops working until you send it again, and any signature is cleared.")}
          <form action={deleteEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="danger" confirm="Delete this quote?">Delete</SubmitButton>
          </form>
        </div>
      </Card>
      </div>
      )}
      {previewNode}
    </>
  );
}
