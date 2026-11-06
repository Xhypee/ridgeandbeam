import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { updateCompany } from "./actions";

export const metadata: Metadata = { title: "Company settings" };

export default async function Page() {
  const { org, isAdmin } = await requireOrg();

  return (
    <div className="space-y-6">
        <Card title="Company">
          <ActionForm action={updateCompany} className="space-y-4">
            <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name"><Input name="name" defaultValue={org.name} required /></Field>
              <Field label="License #"><Input name="license_number" defaultValue={org.license_number ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={org.phone ?? ""} /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={org.email ?? ""} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
              <Field label="Default sales tax %"><Input name="tax_rate" type="number" step="0.001" min="0" defaultValue={org.tax_rate} /></Field>
              <Field label="Default waste %"><Input name="default_waste_pct" type="number" step="1" min="0" max="50" defaultValue={org.default_waste_pct} /></Field>
              <Field label="Default estimate terms"><Textarea name="estimate_terms" defaultValue={org.estimate_terms} /></Field>
              <Field label="Default invoice terms"><Textarea name="invoice_terms" defaultValue={org.invoice_terms} /></Field>
            </fieldset>
            {isAdmin ? <SubmitButton>Save company</SubmitButton> : <p className="text-sm text-slate-500">Only owners and admins can edit company settings.</p>}
          </ActionForm>
        </Card>

    </div>
  );
}
