import { Field, Input, Select, Textarea } from "@/components/ui";
import { AU_STATES } from "@/lib/au";
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
          <Field label="Suburb"><Input name="city" defaultValue={c?.city ?? ""} /></Field>
          <Field label="State">
            <Select name="state" defaultValue={c?.state ?? ""}>
              <option value="">Choose…</option>
              {AU_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
            </Select>
          </Field>
          <Field label="Postcode"><Input name="zip" defaultValue={c?.zip ?? ""} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></Field>
        </div>
        <Field label="Lead source">
          <Select name="source" defaultValue={c?.source ?? "other"}>
            {CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        </Field>
        <Field label="Follow up on"><Input name="follow_up_on" type="date" defaultValue={c?.follow_up_on ?? ""} /></Field>
      </fieldset>
      <Field label="Notes"><Textarea name="notes" defaultValue={c?.notes ?? ""} /></Field>
    </div>
  );
}
