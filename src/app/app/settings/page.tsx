import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { CERTIFICATIONS } from "@/lib/estimating";
import { rulesFor } from "@/lib/state-rules";
import { updateCompanySettings } from "./company-actions";

export const metadata: Metadata = { title: "Company settings" };

export default async function Page() {
  const { org, isAdmin } = await requireOrg();
  const certs = org.certifications ?? [];
  const known = new Set<string>(CERTIFICATIONS);
  const custom = certs.filter((c) => !known.has(c));
  const rule = rulesFor(org.state);

  return (
    <div className="space-y-6">
      <ActionForm action={updateCompanySettings} className="space-y-6">
        <fieldset disabled={!isAdmin} className="space-y-6">
          <Card title="Company">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name"><Input name="name" defaultValue={org.name} required /></Field>
              <Field label="License #"><Input name="license_number" defaultValue={org.license_number ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" type="tel" defaultValue={org.phone ?? ""} /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={org.email ?? ""} /></Field>
              <Field label="Street address" className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" hint={org.state ? `Contract rules: ${rule.name}` : "Used when a job has no state"}>
                  <Input name="state" maxLength={2} defaultValue={org.state ?? ""} placeholder="TX" className="uppercase" />
                </Field>
                <Field label="ZIP"><Input name="zip" inputMode="numeric" defaultValue={org.zip ?? ""} /></Field>
              </div>
              <Field label="Website"><Input name="website" inputMode="url" defaultValue={org.website ?? ""} placeholder="https://yourroofing.com" /></Field>
              <Field label="Google review link" hint="Sent with review requests after the job"><Input name="google_review_url" inputMode="url" defaultValue={org.google_review_url ?? ""} /></Field>
              <Field label="Insurance certificate link" hint="Shown to homeowners on estimates"><Input name="insurance_certificate_url" inputMode="url" defaultValue={org.insurance_certificate_url ?? ""} /></Field>
            </div>
          </Card>

          <Card title="Manufacturer certifications">
            <p className="mb-3 text-sm text-slate-500">Warranty tiers that need a certification (for example GAF Golden Pledge needs Master Elite) are only offered on estimates when you hold it.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CERTIFICATIONS.map((c) => (
                <label key={c} className="flex min-h-11 items-center gap-3 rounded-lg px-3 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500">
                  <input type="checkbox" name="certifications" value={c} defaultChecked={c === "Other" ? custom.length > 0 : certs.includes(c)} className="h-5 w-5 accent-brand-500" />
                  <span className="text-sm text-slate-800">{c}</span>
                </label>
              ))}
            </div>
            <Field label="Other certification (name)" className="mt-3 max-w-md">
              <Input name="certification_other" defaultValue={custom[0] ?? ""} placeholder="e.g. Atlas Pro Plus" />
            </Field>
          </Card>

          <Card title="Estimating defaults">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Default sales tax %"><Input name="tax_rate" type="number" step="0.001" min="0" defaultValue={org.tax_rate} /></Field>
              <Field label="Default waste %"><Input name="default_waste_pct" type="number" step="1" min="0" max="50" defaultValue={org.default_waste_pct} /></Field>
              <Field label="Minimum margin %" hint="Estimates below this show a warning"><Input name="min_margin_pct" type="number" step="0.5" min="0" max="90" defaultValue={org.min_margin_pct} /></Field>
              <Field label="Bundles per square" hint="Usually 3 for architectural"><Input name="bundles_per_square" type="number" step="0.5" min="1" max="6" defaultValue={org.bundles_per_square} /></Field>
              <Field label="Default estimate terms" className="sm:col-span-2"><Textarea name="estimate_terms" defaultValue={org.estimate_terms} /></Field>
              <Field label="Default invoice terms" className="sm:col-span-2"><Textarea name="invoice_terms" defaultValue={org.invoice_terms} /></Field>
            </div>
          </Card>
        </fieldset>
        {isAdmin ? <SubmitButton className="min-h-11">Save company</SubmitButton> : <p className="text-sm text-slate-500">Only owners and admins can edit company settings.</p>}
      </ActionForm>
    </div>
  );
}
