"use client";
// New contact / Edit details: pick what they are, and the form shows the fields for that type.
import Link from "next/link";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AddressLookup } from "@/components/address-lookup";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import { AU_STATES } from "@/lib/au";
import { CONTACT_TYPES, TYPE_LABEL, type ContactType } from "@/lib/contacts";
import { label } from "@/lib/format";
import { CUSTOMER_SOURCES, type Customer } from "@/lib/types";
import { createContact, updateContact, updateSupplierContact } from "./actions";
import { ClaudeBar } from "../jobs/claude-bar";

export type SupplierEdit = { id: string; name: string; fromDirectory: boolean; branch_name: string | null; branch_phone: string | null; branch_email: string | null; account_number: string | null; abn: string | null; rep_name: string | null; rep_phone: string | null; bank_name: string | null; bank_bsb: string | null; bank_account: string | null; notes: string | null };

const v = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));

function Address({ c }: { c?: Partial<Customer> }) {
  // New contacts get the Google address lookup (falls back to the four fields without a Maps key).
  if (!c?.id) return <AddressLookup defaultState={c?.state ?? null} />;
  return (
    <>
      <Field label="Street address"><Input name="address" defaultValue={v(c?.address)} /></Field>
      <div className="grid grid-cols-[1fr_88px_96px] gap-2">
        <Field label="Suburb"><Input name="city" defaultValue={v(c?.city)} /></Field>
        <Field label="State"><Select name="state" defaultValue={v(c?.state)}><option value="">–</option>{AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Postcode"><Input name="zip" defaultValue={v(c?.zip)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></Field>
      </div>
    </>
  );
}
function Bank({ c }: { c?: { bank_name?: string | null; bank_bsb?: string | null; bank_account?: string | null } }) {
  return (
    <div className="grid grid-cols-[1fr_96px_1fr] gap-2">
      <Field label="Bank"><Input name="bank_name" defaultValue={v(c?.bank_name)} /></Field>
      <Field label="BSB"><Input name="bank_bsb" defaultValue={v(c?.bank_bsb)} inputMode="numeric" placeholder="000-000" /></Field>
      <Field label="Account"><Input name="bank_account" defaultValue={v(c?.bank_account)} inputMode="numeric" /></Field>
    </div>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{children}</p>;

function ContactFields({ type, c }: { type: Exclude<ContactType, "supplier">; c?: Partial<Customer> }) {
  const phoneEmail = (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Mobile"><Input name="phone" type="tel" defaultValue={v(c?.phone)} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={v(c?.email)} /></Field>
    </div>
  );
  if (type === "customer") return (
    <>
      <Field label="Name"><Input name="name" defaultValue={v(c?.name)} required /></Field>
      {phoneEmail}<Address c={c} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Lead source"><Select name="source" defaultValue={c?.source ?? "other"}>{CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Follow up on"><Input name="follow_up_on" type="date" defaultValue={v(c?.follow_up_on)} /></Field>
      </div>
      <Field label="Notes"><Textarea name="notes" defaultValue={v(c?.notes)} rows={3} /></Field>
    </>
  );
  if (type === "builder") return (
    <>
      <Field label="Company name"><Input name="name" defaultValue={v(c?.name)} required placeholder="Harbour Homes Pty Ltd" /></Field>
      <Field label="ABN" hint="Optional"><Input name="abn" defaultValue={v(c?.abn)} inputMode="numeric" /></Field>
      {phoneEmail}<Address c={c} />
      <H>Getting paid</H>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <Field label="Payment terms"><Input name="payment_terms" defaultValue={v(c?.payment_terms)} placeholder="30 days end of month" /></Field>
        <Field label="Retention %"><Input name="retention_pct" defaultValue={v(c?.retention_pct)} inputMode="decimal" placeholder="5" /></Field>
      </div>
      <Field label="Notes"><Textarea name="notes" defaultValue={v(c?.notes)} rows={3} /></Field>
    </>
  );
  if (type === "contractor") return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name"><Input name="name" defaultValue={v(c?.name)} required /></Field>
        <Field label="Trade"><Input name="trade" defaultValue={v(c?.trade)} placeholder="Plumber" list="trades" /></Field>
      </div>
      <datalist id="trades">{["Plumber", "Electrician", "Scaffolder", "Carpenter", "Roof plumber", "Labourer", "Crane hire", "Skip bins", "Asbestos removal"].map((t) => <option key={t} value={t} />)}</datalist>
      <Field label="Business name" hint="Optional"><Input name="company" defaultValue={v(c?.company)} /></Field>
      {phoneEmail}
      <H>Licence &amp; insurance</H>
      <div className="grid grid-cols-[1fr_1fr_140px] gap-2">
        <Field label="QBCC / licence no."><Input name="licence_no" defaultValue={v(c?.licence_no)} /></Field>
        <Field label="Licence class"><Input name="licence_class" defaultValue={v(c?.licence_class)} placeholder="Plumbing & drainage" /></Field>
        <Field label="Expires"><Input name="licence_expiry" type="date" defaultValue={v(c?.licence_expiry)} /></Field>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <Field label="Public liability cover"><Input name="pl_cover" defaultValue={v(c?.pl_cover)} placeholder="$20m" /></Field>
        <Field label="Expires"><Input name="pl_expiry" type="date" defaultValue={v(c?.pl_expiry)} /></Field>
      </div>
      <Field label="WorkCover expires" hint="Optional"><Input name="workcover_expiry" type="date" defaultValue={v(c?.workcover_expiry)} /></Field>
      <H>Paying them</H>
      <div className="grid grid-cols-[1fr_1fr_120px] gap-2">
        <Field label="ABN"><Input name="abn" defaultValue={v(c?.abn)} inputMode="numeric" /></Field>
        <Field label="Rate"><Input name="rate" defaultValue={v(c?.rate)} placeholder="$95/hr + parts" /></Field>
        <Field label="GST"><Select name="gst_registered" defaultValue={c?.gst_registered === true ? "yes" : c?.gst_registered === false ? "no" : ""}><option value="">–</option><option value="yes">Registered</option><option value="no">Not registered</option></Select></Field>
      </div>
      <Bank c={c} />
      <Field label="Notes"><Textarea name="notes" defaultValue={v(c?.notes)} rows={3} /></Field>
    </>
  );
  return (
    <>
      <Field label="Name"><Input name="name" defaultValue={v(c?.name)} required /></Field>
      <Field label="Organisation" hint="Optional"><Input name="company" defaultValue={v(c?.company)} placeholder="Council, certifier, insurer…" /></Field>
      {phoneEmail}<Address c={c} />
      <Field label="Notes"><Textarea name="notes" defaultValue={v(c?.notes)} rows={3} /></Field>
    </>
  );
}

function SupplierFields({ s, fromDirectory }: { s?: Partial<SupplierEdit>; fromDirectory?: boolean }) {
  return (
    <>
      {fromDirectory ? <Field label="Supplier"><Input value={v(s?.name)} disabled readOnly /></Field>
        : <Field label="Supplier name"><Input name={s?.id ? "custom_name" : "name"} defaultValue={v(s?.name)} required placeholder="Steeline Wacol" /></Field>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Branch"><Input name="branch_name" defaultValue={v(s?.branch_name)} placeholder="Wacol" /></Field>
        <Field label="Account number"><Input name="account_number" defaultValue={v(s?.account_number)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Branch phone"><Input name="branch_phone" type="tel" defaultValue={v(s?.branch_phone)} /></Field>
        <Field label="Ordering email"><Input name="branch_email" type="email" defaultValue={v(s?.branch_email)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rep"><Input name="rep_name" defaultValue={v(s?.rep_name)} /></Field>
        <Field label="Rep mobile"><Input name="rep_phone" type="tel" defaultValue={v(s?.rep_phone)} /></Field>
      </div>
      <Field label="ABN" hint="Optional"><Input name="abn" defaultValue={v(s?.abn)} inputMode="numeric" /></Field>
      <H>Paying their invoices</H>
      <Bank c={s} />
      <Field label="Notes"><Textarea name="notes" defaultValue={v(s?.notes)} rows={3} /></Field>
    </>
  );
}

/** Right-sidebar New contact form. */
export function NewContactPanel({ closeHref, initial, defaultState, aiReady = false }: { closeHref: string; initial: ContactType; defaultState?: string | null; aiReady?: boolean }) {
  const [type, setType] = useState<ContactType>(initial);
  return (
    <div className="flex h-full flex-col bg-cream p-4" data-new-contact>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h2 className="font-display text-xl font-bold text-ink">New contact</h2>
          <Link href={closeHref} scroll={false} aria-label="Close" className="-mr-2 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-ink"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg></Link>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          <p className="text-sm font-semibold text-ink">What are they?</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Contact type">
            {CONTACT_TYPES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} data-type={t} onClick={() => setType(t)}
                className={cx("min-h-11 rounded-xl text-sm font-semibold", type === t ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <ActionForm action={createContact} className="mt-5 space-y-3" key={type}>
            <input type="hidden" name="type" value={type} />
            {type === "supplier" ? <SupplierFields /> : <ContactFields type={type} c={defaultState ? { state: defaultState } : undefined} />}
            {type === "supplier" && <p className="text-xs text-slate-500">Suppliers are shared with Materials: you can order from them straight away. Upload their price list from the supplier&apos;s page.</p>}
            <SubmitButton className="min-h-12 w-full text-[15px]">Save {TYPE_LABEL[type].toLowerCase()}</SubmitButton>
          </ActionForm>
        </div>
        <ClaudeBar ready={aiReady} />
      </div>
    </div>
  );
}

/** Edit details inside a contact's sidebar (type can be changed between customer / builder / contractor / other). */
export function EditContact({ c }: { c: Customer }) {
  const [type, setType] = useState<Exclude<ContactType, "supplier">>(c.kind);
  return (
    <ActionForm action={updateContact} className="space-y-3">
      <input type="hidden" name="id" value={c.id} />
      <Field label="Type">
        <Select name="kind" value={type} onChange={(e) => setType(e.target.value as Exclude<ContactType, "supplier">)}>
          {(["customer", "builder", "contractor", "other"] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
      </Field>
      <ContactFields type={type} c={c} key={type} />
      <SubmitButton className="min-h-12 w-full text-[15px]">Save changes</SubmitButton>
    </ActionForm>
  );
}

export function EditSupplier({ s }: { s: SupplierEdit }) {
  return (
    <ActionForm action={updateSupplierContact} className="space-y-3">
      <input type="hidden" name="id" value={s.id} />
      <SupplierFields s={s} fromDirectory={s.fromDirectory} />
      <SubmitButton className="min-h-12 w-full text-[15px]">Save changes</SubmitButton>
    </ActionForm>
  );
}
