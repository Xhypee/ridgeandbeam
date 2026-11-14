"use client";

// The New lead sidebar's "Next up". People ring a few roofers and get told "send us your plans", so the first
// step is the plans: a big drop box (Claude reads them, makes the draft quote and measures the roof). Once
// they're in: check / write the quote. Under it six icon buttons (Call · Text · Spoke to them · Book the
// inspection · Not going ahead · Delete lead, labels on hover), then Who's looking after it. Server actions: lead-actions.ts.
import Link from "next/link";
import { useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { LOST_REASONS, type ScheduleItem } from "@/lib/lead-steps";
import { createEstimate } from "../estimates/actions";
import { BookingCalendar } from "./booking-calendar";
import { DocumentDrop } from "./document-drop";
import { deleteLead, logLeadCall, markLeadLost, setLeadOwner } from "./lead-actions";
import { LeadTimer } from "./lead-timer";

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const SMS = "M4 5h16v11H9l-5 4z";
const CHECK = "M5 12l5 5L20 7";
const CAL = "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5";
const DOC = "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6";
const XCIRCLE = "M12 21a9 9 0 100-18 9 9 0 000 18M9 9l6 6M15 9l-6 6";
const BIN = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

/** Hover / focus label above an icon button (the button needs `group relative`). */
function Tip({ children, align = "center" }: { children: React.ReactNode; align?: "start" | "center" | "end" }) {
  const pos = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span role="tooltip" className={`pointer-events-none absolute bottom-full z-20 mb-2 ${pos} whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}>
      {children}
      <span className="sr-only">.</span>
    </span>
  );
}

function IconToggle({ on, onClick, label, d, tone, align }: { on: boolean; onClick: () => void; label: string; d: string; tone?: "red"; align?: "start" | "center" | "end" }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-expanded={on}
      className={cx("group relative grid h-12 w-full place-items-center rounded-xl ring-1 ring-inset transition",
        on ? (tone === "red" ? "bg-red-50 text-red-700 ring-red-300" : "bg-brand-50 text-brand-700 ring-brand-400") : (tone === "red" ? "bg-white text-red-700 ring-slate-300 hover:bg-red-50" : "bg-white text-ink ring-slate-300 hover:bg-slate-50"))}>
      <Icon d={d} className="h-5 w-5" /><Tip align={align}>{label}</Tip>
    </button>
  );
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

/** Call / Text as a square icon link in the action row (greyed out with no mobile). */
function IconLink({ href, label, d, align }: { href: string | null; label: string; d: string; align?: "start" | "center" | "end" }) {
  const cls = "group relative grid h-12 w-full place-items-center rounded-xl ring-1 ring-inset ring-slate-300";
  return href
    ? <a href={href} aria-label={label} className={cx(cls, "bg-white text-ink hover:bg-slate-50")}><Icon d={d} className="h-5 w-5" /><Tip align={align}>{label}</Tip></a>
    : <span aria-label="No mobile" className={cx(cls, "bg-slate-50 text-slate-300")}><Icon d={d} className="h-5 w-5" /><Tip align={align}>No mobile</Tip></span>;
}

export type LeadStepsProps = {
  jobId: string;
  first: string;
  phone: string | null;
  receivedAt: string | null;
  contacted: { at: string; label: string; by: string | null } | null;
  noAnswer: { count: number; lastLabel: string | null };
  owner: string;
  people: { user_id: string; name: string }[];
  meId: string;
  dates: { min: string; suggested: string };
  tz: string;
  /** For previews: a stand-in for the staff schedule lookup. */
  loadSchedule?: (staffId: string, from: string, to: string, tz: string) => Promise<ScheduleItem[]>;
  /** Full name, for the delete confirmation; `otherJobs` > 0 means the contact stays. */
  name: string;
  otherJobs: number;
  /** Documents on the job so far (plans, reports…). */
  plans: number;
  /** The lead's quote, if there is one; `measured` e.g. "214 m² of roof" once the roof is measured. */
  quote: { id: string; status: string; measured: string | null; fromPlans: boolean } | null;
};

function OwnerPicker({ jobId, owner, people, meId }: { jobId: string; owner: string; people: LeadStepsProps["people"]; meId: string }) {
  const form = useRef<HTMLDivElement>(null);
  const submit = () => form.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.click();
  return (
    <div ref={form}>
      <ActionForm action={setLeadOwner}>
        <input type="hidden" name="job_id" value={jobId} />
        <select name="assigned_to" defaultValue={owner} onChange={submit} aria-label="Who's looking after this lead"
          className="h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500">
          {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.user_id === meId ? `${p.name} (me)` : p.name}</option>)}
        </select>
        <span className="sr-only"><SubmitButton>Save</SubmitButton></span>
      </ActionForm>
    </div>
  );
}

export function LeadSteps(p: LeadStepsProps) {
  const [open, setOpen] = useState<"book" | "lost" | "delete" | null>(null);
  const [reason, setReason] = useState<string>("");
  const tel = p.phone ? `tel:${p.phone.replace(/\s+/g, "")}` : null;
  const sms = p.phone ? `sms:${p.phone.replace(/\s+/g, "")}` : null;
  const planless = p.plans === 0 && !p.quote?.measured;
  const headline = planless ? `Upload ${p.first}\u2019s plans` : p.quote ? `Check ${p.first}\u2019s quote` : `Write ${p.first}\u2019s quote`;
  const sub = planless ? null
    : p.quote?.measured ? `Claude measured ${p.quote.measured}${p.quote.fromPlans ? " from the plans" : ""}. Check it, add your prices and send it.`
    : p.quote ? "The plans are in. Measure the roof and price it." : "The plans are in. Start the quote and measure from them.";
  const btn = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold";
  const booking = (
    <BookingCalendar jobId={p.jobId} first={p.first} phone={p.phone} people={p.people} defaultStaff={p.owner} meId={p.meId}
      today={p.dates.min} suggested={p.dates.suggested} tz={p.tz} load={p.loadSchedule} />
  );

  return (
    <div className="px-5 pb-4" data-lead-steps data-lead-plans={planless ? "none" : "in"}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Next up</p>
        {planless && !p.contacted && p.receivedAt && <span className="ml-auto"><LeadTimer since={p.receivedAt} /></span>}
      </div>
      <p className="font-display text-[26px] font-bold leading-tight text-ink" data-lead-headline>{headline}</p>
      {sub && <p className="text-sm text-slate-500" data-lead-status>{sub}</p>}

      {/* The plans drop box keeps its place in both states, so Claude's summary survives the refresh. */}
      {!planless && (
        <div className="mt-3">
          {p.quote
            ? <Link href={`/app/estimates/${p.quote.id}`} className={cx(btn, "bg-brand-500 text-white hover:bg-brand-600")} data-lead-quote><Icon d={DOC} className="h-5 w-5" />Open the quote</Link>
            : <form action={createEstimate}><input type="hidden" name="job_id" value={p.jobId} /><button className={cx(btn, "bg-brand-500 text-white hover:bg-brand-600")} data-lead-quote><Icon d="M12 5v14M5 12h14" className="h-5 w-5" />Start the quote</button></form>}
        </div>
      )}
      <div className="mt-3" data-lead-drop>
        <DocumentDrop jobId={p.jobId} variant="plans" compact={!planless} measured={Boolean(p.quote?.measured)}
          estimateId={p.quote?.status === "draft" ? p.quote.id : undefined} />
      </div>

      {/* Six actions as icon buttons; the label shows on hover (and keyboard focus). */}
      <ActionForm action={logLeadCall} className="mt-3">
        <input type="hidden" name="job_id" value={p.jobId} />
        <div className="grid grid-cols-6 gap-2" data-lead-actions>
          <IconLink href={tel} label={`Call ${p.first}`} d={PHONE} align="start" />
          <IconLink href={sms} label={`Text ${p.first}`} d={SMS} />
          <SubmitButton name="outcome" value="spoke" variant={p.contacted ? "primary" : "secondary"} className="group relative h-12 w-full px-0">
            <Icon d={CHECK} className="h-5 w-5" /><Tip>{p.contacted ? `Spoke ${p.contacted.label}${p.contacted.by ? ` \u00b7 ${p.contacted.by.split(" ")[0]}` : ""}` : "Spoke to them"}</Tip>
          </SubmitButton>
          <IconToggle on={open === "book"} onClick={() => setOpen(open === "book" ? null : "book")} label="No plans? Book an inspection" d={CAL} />
          <IconToggle on={open === "lost"} onClick={() => setOpen(open === "lost" ? null : "lost")} label="Not going ahead" d={XCIRCLE} tone="red" align="end" />
          <IconToggle on={open === "delete"} onClick={() => setOpen(open === "delete" ? null : "delete")} label="Delete lead" d={BIN} tone="red" align="end" />
        </div>
      </ActionForm>

      {open === "book" && (
        <div className="mt-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-200" data-lead-book>
          <p className="mb-2 text-sm font-semibold text-ink">Book the inspection <span className="font-normal text-slate-500">· then write the quote</span></p>
          {booking}
        </div>
      )}
      {open === "lost" && (
        <ActionForm action={markLeadLost} className="mt-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
          <input type="hidden" name="job_id" value={p.jobId} />
          <p className="text-sm font-semibold text-ink">Why isn&rsquo;t it going ahead?</p>
          <div className="mt-2 flex flex-wrap gap-1.5" data-lead-lost>
            {LOST_REASONS.map((r) => (
              <label key={r.key} className={cx("cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1", reason === r.key ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>
                <input type="radio" name="reason" value={r.key} required className="sr-only" checked={reason === r.key} onChange={() => setReason(r.key)} />{r.label}
              </label>
            ))}
          </div>
          <input name="detail" placeholder="Anything to remember (optional)" className="mt-2 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500" />
          <div className="mt-2 flex gap-2">
            <SubmitButton variant="danger" className="min-h-10 flex-1">Mark as not going ahead</SubmitButton>
            <button type="button" onClick={() => setOpen(null)} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-white">Cancel</button>
          </div>
        </ActionForm>
      )}

      {open === "delete" && (
        // Delete: gone for good (spam, a test, a double-up). Red, and says exactly what goes.
        <ActionForm action={deleteLead} className="mt-3 rounded-xl bg-red-50 p-3.5 ring-1 ring-red-200">
          <input type="hidden" name="job_id" value={p.jobId} />
          <div data-lead-delete-confirm>
            <p className="text-sm font-semibold text-red-800">Delete {p.first}&rsquo;s lead?</p>
            <p className="mt-0.5 text-[13px] text-red-700">The lead, its notes and files go for good. This can&rsquo;t be undone.</p>
            {p.otherJobs === 0 && (
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-red-800">
                <input type="checkbox" name="remove_contact" defaultChecked className="h-4 w-4 accent-red-600" />Also delete {p.name} from Contacts
              </label>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <SubmitButton variant="danger" className="min-h-10 flex-1">Delete lead</SubmitButton>
            <button type="button" onClick={() => setOpen(null)} className="min-h-10 rounded-xl bg-white px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">Cancel</button>
          </div>
        </ActionForm>
      )}

      <div className="mt-4 rounded-xl px-3.5 py-3 ring-1 ring-slate-200" data-lead-step="owner">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Icon d={CHECK} className="h-3.5 w-3.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Who&rsquo;s looking after it</span>
            <span className="block text-xs text-slate-500">They get the reminders for this lead</span>
          </span>
        </div>
        <div className="mt-3 pl-10"><OwnerPicker jobId={p.jobId} owner={p.owner} people={p.people} meId={p.meId} /></div>
      </div>
    </div>
  );
}
