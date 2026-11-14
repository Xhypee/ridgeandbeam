import { Field, Input, Select, Textarea } from "@/components/ui";
import { AddressLookup } from "@/components/address-lookup";
import { label } from "@/lib/format";
import { CUSTOMER_SOURCES, type Customer } from "@/lib/types";

export function CustomerFields({ c }: { c?: Partial<Customer> }) {
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={c?.name ?? ""} required /></Field>
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={c?.phone ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
        <div className="sm:col-span-2">
          <AddressLookup label="Address" defaultState={c?.state ?? null}
            initial={c?.address ? { address: c.address, city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "", lat: null, lng: null } : null} />
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
