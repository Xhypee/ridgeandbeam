"use client";

// The New lead sidebar's "Next up": 1 First call · 2 Who's looking after it · 3 Book the inspection,
// plus "Not going ahead?" at the bottom. Server actions live in lead-actions.ts.
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

function Step({ n, state, title, detail, children, k }: { n: number; state: "done" | "now" | "todo"; title: string; detail?: React.ReactNode; children?: React.ReactNode; k: string }) {
  return (
    <li className={cx("px-3.5 py-3", n > 1 && "border-t border-slate-100", state === "now" && "bg-brand-50")} data-lead-step={k} data-state={state}>
      <div className="flex items-center gap-3">
        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
          state === "done" ? "bg-brand-500 text-white" : state === "now" ? "bg-white text-brand-700 ring-2 ring-brand-500" : "bg-white text-slate-400 ring-1 ring-slate-200")}>
          {state === "done" ? <Icon d={CHECK} className="h-3.5 w-3.5" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {detail && <span className="block text-xs text-slate-500">{detail}</span>}
        </span>
      </div>
      {children && <div className="mt-3 pl-10">{children}</div>}
    </li>
  );
}

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
  const [lostOpen, setLostOpen] = useState(false);
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

  return (
    <div className="px-5 pb-4" data-lead-steps>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Next up</p>
        {!p.contacted && p.receivedAt && <span className="ml-auto"><LeadTimer since={p.receivedAt} /></span>}
      </div>
      <p className="font-display text-[26px] font-bold leading-tight text-ink">{headline}</p>
      {!p.contacted && <p className="text-sm text-slate-500">The first roofer to call usually wins the job.</p>}

      <ol className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <Step k="call" n={1} state={p.contacted ? "done" : "now"} title="First call"
          detail={p.contacted
            ? `Spoke ${p.contacted.label}${p.contacted.by ? ` · ${p.contacted.by.split(" ")[0]}` : ""}`
            : p.noAnswer.count ? `${p.noAnswer.count} ${p.noAnswer.count === 1 ? "try" : "tries"}, no answer${p.noAnswer.lastLabel ? ` · last ${p.noAnswer.lastLabel}` : ""}` : p.phone ?? "No mobile on file"}>
          {!p.contacted && (
            <div className="space-y-2">
              <div className="flex gap-2">
                {tel ? <a href={tel} className={cx(btn, "flex-1 bg-brand-500 text-white hover:bg-brand-600")} data-lead-call><Icon d={PHONE} />Call {p.first}</a>
                  : <span className={cx(btn, "flex-1 bg-slate-100 text-slate-400")}>No mobile</span>}
                {sms && <a href={sms} aria-label={`Text ${p.first}`} title={`Text ${p.first}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-white"><Icon d={SMS} /></a>}
              </div>
              <ActionForm action={logLeadCall}>
                <input type="hidden" name="job_id" value={p.jobId} />
                <p className="mb-1.5 text-xs font-medium text-slate-600">After the call</p>
                <div className="grid grid-cols-2 gap-2">
                  <SubmitButton name="outcome" value="spoke" variant="secondary" className="min-h-11 gap-1.5"><Icon d={CHECK} />Spoke to them</SubmitButton>
                  <SubmitButton name="outcome" value="no_answer" variant="secondary" className="min-h-11">No answer</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </Step>

        <Step k="owner" n={2} state="done" title="Who's looking after it" detail="They get the reminders for this lead">
          <OwnerPicker jobId={p.jobId} owner={p.owner} people={p.people} meId={p.meId} />
        </Step>

        <Step k="inspect" n={3} state={p.contacted ? "now" : "todo"} title="Book the inspection"
          detail={p.contacted ? "Pick a time that suits them. It moves to Quoting." : "Once you've spoken to them"}>
          {p.contacted ? booking : (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-semibold text-brand-700 [&::-webkit-details-marker]:hidden group-open:hidden">Book it now anyway</summary>
              {booking}
            </details>
          )}
        </Step>
      </ol>

      <div className="mt-3" data-lead-lost>
        {!lostOpen ? (
          <button type="button" onClick={() => setLostOpen(true)} className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-ink hover:underline">Not going ahead?</button>
        ) : (
          <ActionForm action={markLeadLost} className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
            <input type="hidden" name="job_id" value={p.jobId} />
            <p className="text-sm font-semibold text-ink">Why isn&rsquo;t it going ahead?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LOST_REASONS.map((r) => (
                <label key={r.key} className={cx("cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1", reason === r.key ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>
                  <input type="radio" name="reason" value={r.key} required className="sr-only" checked={reason === r.key} onChange={() => setReason(r.key)} />{r.label}
                </label>
              ))}
            </div>
            <input name="detail" placeholder="Anything to remember (optional)" className="mt-2 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-brand-500" />
            <div className="mt-2 flex gap-2">
              <SubmitButton variant="danger" className="min-h-10 flex-1">Mark as not going ahead</SubmitButton>
              <button type="button" onClick={() => setLostOpen(false)} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-white">Cancel</button>
            </div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
