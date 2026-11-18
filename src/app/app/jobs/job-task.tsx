// The one task at the top of a job's sidebar. New leads: get the roof measured (upload plans, satellite or an
// inspection) with calling as a strip underneath. Every other stage: the job's next step (lib/next-step), shown
// loud when somebody has to act and calm when it's just waiting. Lost: why, with Reopen. Closed: nothing left.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { WaitTimer } from "@/components/wait-timer";
import type { Docket } from "@/lib/job-docket-server";
import { focusKey } from "@/lib/job-record";
import { LOST_REASON_LABEL } from "@/lib/lead-steps";
import { label as human, siteUrl } from "@/lib/format";
import { createEstimate } from "../estimates/actions";
import { DocumentDrop } from "./document-drop";
import { markContacted, reopenLead } from "./lead-actions";
import { Icon } from "./job-section-ui";
import { TaskQuote } from "./task-quote";

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const SMS = "M4 5h16v11H9l-5 4z";
const SAT = "M4 20l4-4M14 4l6 6-4 4-6-6zM10 8l-3 3 6 6 3-3M17 3l4 4";
const CAL = "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5";
const CHECK = "M5 12l5 5 9-10";
const ARROW = "M5 12h14M13 6l6 6-6 6";
const X = "M6 6l12 12M18 6L6 18";
const kicker = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400";
const solid = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-ink/90";
const outline = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 font-mono text-xs font-semibold uppercase tracking-wider text-ink ring-1 ring-slate-300 hover:bg-slate-50";

function Box({ calm, children }: { calm?: boolean; children: React.ReactNode }) {
  return <div className={cx("mx-5 rounded-[18px] p-4", calm ? "bg-cream ring-1 ring-slate-200" : "bg-white ring-2 ring-ink")} data-job-task>{children}</div>;
}

/** Not called yet: a strip under the task (calling isn't the goal, but it's urgent). */
function CallStrip({ d }: { d: Docket }) {
  const j = d.job;
  if (j.stage !== "lead" || j.first_contacted_at) return null;
  const tel = d.customer.phone?.replace(/\s+/g, "");
  return (
    <div className="mt-3 flex items-center gap-2 border-t-2 border-dashed border-slate-200 pt-3" data-call-strip>
      <span className="min-w-0 flex-1 font-mono text-[11px] leading-snug text-slate-500">
        <span className="font-semibold text-red-700">Not called yet{j.lead_received_at ? " · " : ""}</span>
        {j.lead_received_at && <WaitTimer since={j.lead_received_at} className="!bg-transparent !p-0 font-mono text-[11px] font-semibold !text-red-700" />}
        <span className="block">Ask for plans when you call.</span>
      </span>
      {tel && <a href={`tel:${tel}`} className={cx(outline, "min-h-9 px-3")}><Icon d={PHONE} className="h-3.5 w-3.5" />Call</a>}
      {tel && <a href={`sms:${tel}`} aria-label="Text" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={SMS} className="h-3.5 w-3.5" /></a>}
      <form action={markContacted}><input type="hidden" name="id" value={j.id} /><button className="min-h-9 rounded-xl px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 hover:text-ink" title="Mark as called">Called</button></form>
    </div>
  );
}

export function JobTask({ d, bookHref, canSeeMoney, previewHref }: { d: Docket; bookHref: string; canSeeMoney: boolean; previewHref?: string }) {
  const j = d.job;
  const first = d.customer.name.split(" ")[0] || d.customer.name;

  if (j.stage === "lost") {
    return (
      <Box calm>
        <p className={kicker}>Not going ahead</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-slate-300"><Icon d={X} /></span>
          <p className="font-display text-[18px] font-bold leading-tight text-ink">{j.lost_reason ? LOST_REASON_LABEL[j.lost_reason] ?? human(j.lost_reason) : "Marked as lost"}</p>
        </div>
        <ActionForm action={reopenLead} className="mt-3"><input type="hidden" name="job_id" value={j.id} /><SubmitButton variant="secondary" className="w-full">Reopen</SubmitButton></ActionForm>
      </Box>
    );
  }
  if (j.stage === "paid") {
    return (
      <Box calm>
        <p className={kicker}>Nothing left to do</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white"><Icon d={CHECK} /></span>
          <div className="min-w-0"><p className="font-display text-[18px] font-bold leading-tight text-ink">Paid in full</p><p className="font-mono text-xs text-slate-500">The job is closed. Everything is in the record below.</p></div>
        </div>
      </Box>
    );
  }

  // New lead with nothing measured: three ways to get the roof measured.
  if (canSeeMoney && focusKey(d) === "plans") {
    const q = d.quote;
    return (
      <Box>
        <p className={kicker}>First · get the roof measured</p>
        <p className="mt-1 font-display text-[19px] font-bold leading-tight text-ink">How will you measure {first}&apos;s roof?</p>
        <div className="mt-3" data-measure-plans><DocumentDrop jobId={j.id} variant="plans" simple anywhere estimateId={q?.status === "draft" ? q.id : undefined} /></div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {q ? (
            <Link href={`/app/measure/${q.id}`} className="rounded-xl p-3 text-left ring-1 ring-slate-300 hover:bg-slate-50" data-measure-satellite>
              <span className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-slate-300"><Icon d={SAT} /></span>
              <span className="mt-2 block font-display text-[14px] font-bold text-ink">Measure on satellite</span>
              <span className="block font-mono text-[11px] leading-snug text-slate-500">Trace the roof on the map</span>
            </Link>
          ) : (
            <form action={createEstimate} className="contents"><input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="next" value="measure" />
              <button className="rounded-xl p-3 text-left normal-case ring-1 ring-slate-300 hover:bg-slate-50" data-measure-satellite>
                <span className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-slate-300"><Icon d={SAT} /></span>
                <span className="mt-2 block font-display text-[14px] font-bold text-ink">Measure on satellite</span>
                <span className="block font-mono text-[11px] leading-snug text-slate-500">Trace the roof on the map</span>
              </button>
            </form>
          )}
          <Link href={bookHref} scroll={false} className="rounded-xl p-3 text-left ring-1 ring-slate-300 hover:bg-slate-50" data-measure-book>
            <span className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-slate-300"><Icon d={CAL} /></span>
            <span className="mt-2 block font-display text-[14px] font-bold text-ink">Book an inspection</span>
            <span className="block font-mono text-[11px] leading-snug text-slate-500">See the week · pick a time</span>
          </Link>
        </div>
        <CallStrip d={d} />
      </Box>
    );
  }

  // Finished: get the homeowner to sign the roof off (text them the project page link, or sign on site).
  if (focusKey(d) === "signoff") {
    const link = `${siteUrl()}/p/${j.public_token}`;
    const tel = d.customer.phone?.replace(/\s+/g, "");
    const body = encodeURIComponent(`Hi ${first}, your new roof is finished. Could you sign it off here when you have a minute? ${link}`);
    return (
      <Box>
        <p className={kicker}>One thing left</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-slate-300"><Icon d="M3 17c3-6 5-6 6-2s3 2 4-1 3-3 4 0 2 2 4 1M3 21h18" /></span>
          <div className="min-w-0"><p className="font-display text-[19px] font-bold leading-tight text-ink" data-task-title>Get {first} to sign off the roof</p><p className="font-mono text-xs leading-snug text-slate-500">They sign on their project page, or with you on site</p></div>
        </div>
        <div className="mt-3 flex gap-2">
          {tel ? <a href={`sms:${tel}?&body=${body}`} className={cx(solid, "flex-1")} data-signoff-text>Text the sign-off link</a> : <span className={cx(outline, "flex-1 text-slate-400")}>No mobile on file</span>}
          <Link href={`/app/jobs/${j.id}/closeout`} className={outline}>Sign on site</Link>
        </div>
      </Box>
    );
  }

  // Every other stage: the job's next step.
  const n = d.next;
  // A drafted quote: show what it says (the measured roof and the quote) before it goes, not just a button.
  if (n.key === "send_quote" && canSeeMoney && previewHref && d.quote?.status === "draft") return <TaskQuote d={d} previewHref={previewHref} />;
  const calm = !n.waiting;
  const main = n.form === "create_estimate"
    ? <form action={createEstimate} className="flex-1"><input type="hidden" name="job_id" value={j.id} /><button className={cx(solid, "w-full")}>{n.actionLabel}<Icon d={ARROW} className="h-3.5 w-3.5" /></button></form>
    : n.href.startsWith("tel:") || n.href.startsWith("sms:") || n.href.startsWith("mailto:")
      ? <a href={n.href} className={cx(calm ? outline : solid, "flex-1")}>{n.actionLabel}</a>
      : <Link href={n.href} className={cx(calm ? outline : solid, "flex-1")}>{n.actionLabel}<Icon d={ARROW} className="h-3.5 w-3.5" /></Link>;
  return (
    <Box calm={calm}>
      <p className={kicker}>{calm ? "Coming up" : "Do this now"}</p>
      <p className="mt-1 font-display text-[19px] font-bold leading-tight text-ink" data-task-title>{n.title}</p>
      {n.detail && <p className="mt-0.5 font-mono text-xs leading-snug text-slate-500">{n.detail}</p>}
      <div className="mt-3 flex gap-2">{main}</div>
      <CallStrip d={d} />
    </Box>
  );
}
