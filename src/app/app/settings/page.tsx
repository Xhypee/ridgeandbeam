import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { AU_STATE_NAME, AU_STATES, formatAbn } from "@/lib/au";
import { licenceFor } from "@/lib/business";
import { requireOrg } from "@/lib/dal";
import { AbnInput } from "./abn-input";
import { updateCompanySettings } from "./company-actions";

export const metadata: Metadata = { title: "Company settings" };

const toggle = "flex min-h-11 items-center gap-3 rounded-lg px-3 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500";

export default async function Page() {
  const { org, isAdmin } = await requireOrg();
  const service = new Set(org.service_states ?? []);

  return (
    <div className="space-y-6">
      <ActionForm action={updateCompanySettings} className="space-y-6">
        <fieldset disabled={!isAdmin} className="space-y-6">
          <Card title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" hint="Shown on quotes and invoices"><Input name="name" defaultValue={org.name} required /></Field>
              <Field label="ABN" hint={org.abn ? `On file: ${formatAbn(org.abn)}` : "11 digits, e.g. 51 824 753 556"}>
                <AbnInput defaultValue={org.abn ? formatAbn(org.abn) : ""} />
              </Field>
              <Field label="Phone"><Input name="phone" type="tel" defaultValue={org.phone ?? ""} placeholder="0412 345 678" /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={org.email ?? ""} /></Field>
              <Field label="Business address" className="sm:col-span-2" hint="Street and suburb"><Input name="address" defaultValue={org.address ?? ""} placeholder="12 Industrial Dr, Smithfield" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" hint="Used when a job has no state">
                  <Select name="state" defaultValue={org.state ?? ""} aria-label="Company state">
                    <option value="">Choose…</option>
                    {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Postcode"><Input name="zip" inputMode="numeric" maxLength={4} defaultValue={org.zip ?? ""} /></Field>
              </div>
              <Field label="Website"><Input name="website" inputMode="url" defaultValue={org.website ?? ""} placeholder="https://yourroofing.com.au" /></Field>
              <Field label="Google review link" hint="Sent with review requests after the job"><Input name="google_review_url" inputMode="url" defaultValue={org.google_review_url ?? ""} /></Field>
              <Field label="Insurance certificate link" hint="Public liability certificate shown on quotes"><Input name="insurance_certificate_url" inputMode="url" defaultValue={org.insurance_certificate_url ?? ""} /></Field>
            </div>
          </Card>

          <Card title="GST">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={toggle}>
                <input type="checkbox" name="gst_registered" defaultChecked={org.gst_registered !== false} className="h-5 w-5 accent-brand-500" />
                <span className="text-sm text-slate-800"><b>Registered for GST</b><br /><span className="text-slate-500">Quotes add or include 10% GST and invoices are tax invoices.</span></span>
              </label>
              <label className={toggle}>
                <input type="checkbox" name="prices_include_gst" defaultChecked={org.prices_include_gst !== false} className="h-5 w-5 accent-brand-500" />
                <span className="text-sm text-slate-800"><b>Prices include GST</b><br /><span className="text-slate-500">Price-book sell prices and new quotes are GST-inclusive (homeowners see one price).</span></span>
              </label>
            </div>
          </Card>

          <Card title="Licences">
            <p className="mb-3 text-sm text-slate-500">Your licence number in each state you work in. Quotes show the licence for the job&apos;s state.</p>
            <div className="space-y-2">
              <div className="hidden grid-cols-[13rem_1fr_1.4fr] gap-3 px-1 text-xs font-medium text-slate-500 sm:grid"><span>State</span><span>Licence number</span><span>Classes (comma separated)</span></div>
              {AU_STATES.map((s) => {
                const l = licenceFor(org.licences, s);
                return (
                  <div key={s} className="grid grid-cols-2 items-center gap-2 rounded-lg p-1 sm:grid-cols-[13rem_1fr_1.4fr] sm:gap-3" data-testid="licence-row">
                    <span className="col-span-2 text-sm font-medium text-slate-800 sm:col-span-1">{AU_STATE_NAME[s]} <span className="text-slate-400">{s}</span></span>
                    <Input name={`licence_${s}`} defaultValue={l?.number ?? ""} placeholder="Licence #" aria-label={`${s} licence number`} />
                    <Input name={`licence_classes_${s}`} defaultValue={l?.classes ?? ""} placeholder="e.g. Roof plumbing, Roof tiling" aria-label={`${s} licence classes`} />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Where you work">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AU_STATES.map((s) => (
                <label key={s} className={toggle}>
                  <input type="checkbox" name="service_states" value={s} defaultChecked={service.has(s)} className="h-5 w-5 accent-brand-500" aria-label={`Service state ${s}`} />
                  <span className="text-sm text-slate-800">{s}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Quoting defaults">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Default waste %"><Input name="default_waste_pct" type="number" step="1" min="0" max="50" defaultValue={org.default_waste_pct} /></Field>
              <Field label="Minimum margin %" hint="Quotes below this show a warning"><Input name="min_margin_pct" type="number" step="0.5" min="0" max="90" defaultValue={org.min_margin_pct} /></Field>
              <Field label="Default quote terms" className="sm:col-span-2"><Textarea name="estimate_terms" defaultValue={org.estimate_terms} /></Field>
              <Field label="Default invoice terms" className="sm:col-span-4"><Textarea name="invoice_terms" defaultValue={org.invoice_terms} /></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">Calculator assumptions (tiles per m², sarking roll size, sheet cover widths) are in Settings → Price book.</p>
          </Card>
        </fieldset>
        {isAdmin ? <SubmitButton className="min-h-11">Save company</SubmitButton> : <p className="text-sm text-slate-500">Only owners and admins can edit company settings.</p>}
      </ActionForm>
    </div>
  );
}
