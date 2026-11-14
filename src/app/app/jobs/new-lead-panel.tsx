// "+ New lead" on the Jobs board and "New customer" on Customers: a right sidebar (same frame as the job docket)
// instead of a full page. A lead always gets a job and opens that job's docket on the board; a customer can skip
// the job (then their customer page opens).
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { AddressLookup } from "@/components/address-lookup";
import { CustomerLookup } from "@/components/customer-lookup";
import { ContactPicker } from "@/components/contact-picker";
import type { Referrer } from "@/lib/referrals-server";
import { label } from "@/lib/format";
import { CUSTOMER_SOURCES } from "@/lib/types";
import { createCustomer } from "../customers/actions";
import { JobKind } from "../customers/new/job-kind";
import { ClaudeBar } from "./claude-bar";
import { aiEnabled } from "@/lib/ai";

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-slate-100 px-5 py-5 first:border-t-0">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="mb-3 text-[15px] font-bold text-ink">{title}</p>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

const COPY = {
  lead: { kicker: "New lead", title: "Who\u2019s the lead?", sub: "It lands in New leads. Call within 5 minutes.", save: "Add lead" },
  customer: { kicker: "New customer", title: "Add a customer", sub: "Homeowner, property manager or lead.", save: "Save customer" },
};

export function NewLeadPanel({ closeHref, filter = null, defaultState, variant = "lead", referrer = null }: { closeHref: string; filter?: string | null; defaultState: string | null; variant?: "lead" | "customer"; referrer?: Referrer | null }) {
  const t = COPY[variant];
  return (
    <div className="flex h-full flex-col bg-cream p-4" data-new-lead={variant}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <ActionForm action={createCustomer} className="flex min-h-0 flex-1 flex-col">
          {variant === "lead" && <input type="hidden" name="create_job" value="on" />}
          <input type="hidden" name="return_to" value="board" />
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="bg-brand-500 px-5 pb-5 pt-4 text-white">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
                <span className="min-w-0 flex-1 truncate">{t.kicker}</span>
                <Link href={closeHref} scroll={false} aria-label="Close" className="-my-1 -mr-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight">{t.title}</h2>
              <p className="text-sm text-white/70">{t.sub}</p>
            </div>

            <Section title="Contact">
              <CustomerLookup />
            </Section>

            <Section title="Site">
              <AddressLookup defaultState={defaultState} />
            </Section>

            <Section title="The job">
              {variant === "customer" && (
                <label className="flex min-h-11 items-center gap-2.5 rounded-xl bg-slate-50 px-3 text-sm font-medium text-ink">
                  <input type="checkbox" name="create_job" defaultChecked className="h-4 w-4 accent-brand-500" />
                  Also open a job for this customer
                </label>
              )}
              <Field label="What do they need?"><Input name="job_title" placeholder="Roof inspection" /></Field>
              <div className="-mt-1"><JobKind /></div>
            </Section>

            <Section title="Notes">
              {variant === "lead" && (
                <div data-referred-by>
                  <span className="mb-1 block text-xs font-medium text-slate-600">Referred by <span className="font-normal text-slate-400">(optional)</span></span>
                  <ContactPicker name="referred_by" initial={referrer} placeholder="A customer, builder, contractor or supplier" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lead source">
                  <Select name="source" defaultValue={referrer ? "referral" : "other"}>
                    {CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </Select>
                </Field>
                <Field label="Follow up on"><Input name="follow_up_on" type="date" /></Field>
              </div>
              <Field label="Anything else"><Textarea name="notes" placeholder="Leaking over the back bedroom, home after 3pm…" /></Field>
            </Section>
          </div>

          <div className="flex gap-2 border-t border-slate-200 bg-white p-4">
            <SubmitButton className="min-h-12 flex-1 text-[15px]">{t.save}</SubmitButton>
            <Link href={closeHref} scroll={false} className="inline-flex min-h-12 items-center rounded-xl px-5 text-[15px] font-semibold text-slate-600 ring-1 ring-slate-300 hover:ring-slate-400">Cancel</Link>
          </div>
        </ActionForm>
        <ClaudeBar ready={aiEnabled()} />
      </div>
    </div>
  );
}
