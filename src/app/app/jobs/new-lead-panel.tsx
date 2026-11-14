// "+ New lead" on the Jobs board: a right sidebar (same frame as the job docket) instead of a full page.
// Saving creates the customer and their job, then opens that job's docket in the same spot.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { AU_STATES } from "@/lib/au";
import { label } from "@/lib/format";
import { CUSTOMER_SOURCES } from "@/lib/types";
import { createCustomer } from "../customers/actions";
import { JobKind } from "../customers/new/job-kind";

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

export function NewLeadPanel({ closeHref, filter, defaultState }: { closeHref: string; filter: string | null; defaultState: string | null }) {
  return (
    <div className="flex h-full flex-col bg-cream p-4" data-new-lead>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <ActionForm action={createCustomer} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="create_job" value="on" />
          <input type="hidden" name="return_to" value="board" />
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="bg-brand-500 px-5 pb-5 pt-4 text-white">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
                <span className="min-w-0 flex-1 truncate">New lead</span>
                <Link href={closeHref} scroll={false} aria-label="Close" className="-my-1 -mr-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight">Who&rsquo;s the lead?</h2>
              <p className="text-sm text-white/70">It lands in New leads. Call within 5 minutes.</p>
            </div>

            <Section title="Contact">
              <Field label="Name"><Input name="name" required autoFocus autoComplete="off" placeholder="e.g. Priya Sharma" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mobile"><Input name="phone" type="tel" inputMode="tel" placeholder="04xx xxx xxx" /></Field>
                <Field label="Email"><Input name="email" type="email" /></Field>
              </div>
            </Section>

            <Section title="Site">
              <Field label="Street address"><Input name="address" placeholder="9 Bay Tce" /></Field>
              <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-3">
                <Field label="Suburb"><Input name="city" /></Field>
                <Field label="State">
                  <Select name="state" defaultValue={defaultState ?? ""}>
                    <option value="">–</option>
                    {AU_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </Select>
                </Field>
                <Field label="Postcode"><Input name="zip" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></Field>
              </div>
            </Section>

            <Section title="The job">
              <Field label="What do they need?"><Input name="job_title" placeholder="Roof inspection" /></Field>
              <div className="-mt-1"><JobKind /></div>
            </Section>

            <Section title="Notes">
              <Field label="Lead source">
                <Select name="source" defaultValue="other">
                  {CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select>
              </Field>
              <Field label="Anything else"><Textarea name="notes" placeholder="Leaking over the back bedroom, home after 3pm…" /></Field>
            </Section>
          </div>

          <div className="flex gap-2 border-t border-slate-200 bg-white p-4">
            <SubmitButton className="min-h-12 flex-1 text-[15px]">Add lead</SubmitButton>
            <Link href={closeHref} scroll={false} className="inline-flex min-h-12 items-center rounded-xl px-5 text-[15px] font-semibold text-slate-600 ring-1 ring-slate-300 hover:ring-slate-400">Cancel</Link>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
