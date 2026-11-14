"use client";

// The New lead sidebar's "Next up": Call, then four icon buttons (Spoke to them · No answer · Book the
// inspection · Not going ahead, labels on hover), then Who's looking after it. Server actions: lead-actions.ts.
import { useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { INSPECTION_TIMES, LOST_REASONS } from "@/lib/lead-steps";
import { bookInspection, logLeadCall, markLeadLost, setLeadOwner } from "./lead-actions";
import { LeadTimer } from "./lead-timer";

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const SMS = "M4 5h16v11H9l-5 4z";
const CHECK = "M5 12l5 5L20 7";
const CAL = "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5";
const MISSED = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2M15 3l6 6M21 3l-6 6";
const XCIRCLE = "M12 21a9 9 0 100-18 9 9 0 000 18M9 9l6 6M15 9l-6 6";

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
  const [open, setOpen] = useState<"book" | "lost" | null>(null);
  const [reason, setReason] = useState<string>("");
  const tel = p.phone ? `tel:${p.phone.replace(/\s+/g, "")}` : null;
  const sms = p.phone ? `sms:${p.phone.replace(/\s+/g, "")}` : null;
  const headline = !p.contacted ? `Call ${p.first}` : "Book the inspection";
  const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold";
  const booking = (
    <ActionForm action={bookInspection} className="space-y-2">
      <input type="hidden" name="job_id" value={p.jobId} />
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Day</span>
          <input type="date" name="date" required min={p.dates.min} defaultValue={p.dates.suggested} className="h-11 w-full rounded-xl bg-white px-3 text-sm text-ink ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500" />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Time</span>
          <select name="time" defaultValue="09:00" className="h-11 w-full rounded-xl bg-white px-3 text-sm text-ink ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500">
            {INSPECTION_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      {p.phone && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="text_customer" defaultChecked className="h-4 w-4 accent-brand-500" />Text {p.first} the time
        </label>
      )}
      <SubmitButton className="min-h-11 w-full gap-2"><Icon d={CAL} />Book inspection</SubmitButton>
    </ActionForm>
  );

  const status = p.contacted
    ? `Spoke ${p.contacted.label}${p.contacted.by ? ` · ${p.contacted.by.split(" ")[0]}` : ""}`
    : p.noAnswer.count ? `${p.noAnswer.count} ${p.noAnswer.count === 1 ? "try" : "tries"}, no answer${p.noAnswer.lastLabel ? ` · last ${p.noAnswer.lastLabel}` : ""}`
    : "The first roofer to call usually wins the job.";

  return (
    <div className="px-5 pb-4" data-lead-steps>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Next up</p>
        {!p.contacted && p.receivedAt && <span className="ml-auto"><LeadTimer since={p.receivedAt} /></span>}
      </div>
      <p className="font-display text-[26px] font-bold leading-tight text-ink">{headline}</p>
      <p className="text-sm text-slate-500" data-lead-status>{status}</p>

      {!p.contacted && (
        <div className="mt-3 flex gap-2">
          {tel ? <a href={tel} className={cx(btn, "flex-1 bg-brand-500 text-white hover:bg-brand-600")} data-lead-call><Icon d={PHONE} />Call {p.first}</a>
            : <span className={cx(btn, "flex-1 bg-slate-100 text-slate-400")}>No mobile</span>}
          {sms && <a href={sms} aria-label={`Text ${p.first}`} title={`Text ${p.first}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={SMS} /></a>}
        </div>
      )}

      {/* Four actions as icon buttons; the label shows on hover (and keyboard focus). */}
      <ActionForm action={logLeadCall} className="mt-3">
        <input type="hidden" name="job_id" value={p.jobId} />
        <div className="grid grid-cols-4 gap-2" data-lead-actions>
          <SubmitButton name="outcome" value="spoke" variant={p.contacted ? "primary" : "secondary"} className="group relative h-12 w-full px-0">
            <Icon d={CHECK} className="h-5 w-5" /><Tip align="start">{p.contacted ? `Spoke ${p.contacted.label}` : "Spoke to them"}</Tip>
          </SubmitButton>
          <SubmitButton name="outcome" value="no_answer" variant="secondary" className="group relative h-12 w-full px-0">
            <Icon d={MISSED} className="h-5 w-5" /><Tip>No answer</Tip>
            {p.noAnswer.count > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-white" aria-hidden>{p.noAnswer.count}</span>}
          </SubmitButton>
          <IconToggle on={open === "book"} onClick={() => setOpen(open === "book" ? null : "book")} label="Book the inspection" d={CAL} />
          <IconToggle on={open === "lost"} onClick={() => setOpen(open === "lost" ? null : "lost")} label="Not going ahead" d={XCIRCLE} tone="red" align="end" />
        </div>
      </ActionForm>

      {open === "book" && (
        <div className="mt-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-200" data-lead-book>
          <p className="mb-2 text-sm font-semibold text-ink">Book the inspection <span className="font-normal text-slate-500">· it moves to Quoting</span></p>
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
