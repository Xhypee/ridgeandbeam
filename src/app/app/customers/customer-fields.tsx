import { Field, Input, Select, Textarea } from "@/components/ui";
import { label } from "@/lib/format";
import { CUSTOMER_SOURCES, type Customer } from "@/lib/types";

export function CustomerFields({ c }: { c?: Partial<Customer> }) {
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={c?.name ?? ""} required /></Field>
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={c?.phone ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
        <Field label="Street address" className="sm:col-span-2"><Input name="address" defaultValue={c?.address ?? ""} /></Field>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label="City"><Input name="city" defaultValue={c?.city ?? ""} /></Field>
          <Field label="State"><Input name="state" defaultValue={c?.state ?? ""} maxLength={2} /></Field>
          <Field label="ZIP"><Input name="zip" defaultValue={c?.zip ?? ""} /></Field>
        </div>
        <Field label="Lead source">
          <Select name="source" defaultValue={c?.source ?? "other"}>
            {CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        </Field>
        <Field label="Follow up on"><Input name="follow_up_on" type="date" defaultValue={c?.follow_up_on ?? ""} /></Field>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-slate-800">Insurance claim <span className="font-normal text-slate-400">(optional)</span></legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Insurance company"><Input name="insurance_company" defaultValue={c?.insurance_company ?? ""} /></Field>
          <Field label="Claim #"><Input name="claim_number" defaultValue={c?.claim_number ?? ""} /></Field>
          <Field label="Adjuster"><Input name="adjuster_name" defaultValue={c?.adjuster_name ?? ""} /></Field>
          <Field label="Adjuster phone"><Input name="adjuster_phone" type="tel" defaultValue={c?.adjuster_phone ?? ""} /></Field>
        </div>
      </fieldset>
      <Field label="Notes"><Textarea name="notes" defaultValue={c?.notes ?? ""} /></Field>
    </div>
  );
}
