// Quoting jobs in the Jobs sidebar. Quote sent: the price and how long it's good for, docket stamps (SENT, OPENED,
// SIGNED waiting), Call and Remind. Not quoted yet: inspection → measure → write the quote, one button.
// Then Contact · Notes · Documents, and "Heard back another way?" (signed on paper / didn't go ahead).
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket } from "@/lib/job-docket-server";
import { createEstimate } from "../estimates/actions";
import { EYE, Icon, JobContact, JobDocuments, JobNotes } from "./job-sections";
import { settleQuote } from "./quoting-actions";
import { sendQuoteEmail } from "./quote-actions";

const PEN = "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3";
const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const BELL = "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4";
const CHECK = "M5 12l5 5 9-10";
const QUOTE = "M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4";
const SEND = "M4 12l16-8-6 16-2.5-6.5z";
const tz = "Australia/Brisbane";
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const stampDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", timeZone: tz });
const wkday = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", timeZone: tz });
const longDay = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: tz });
const iconBtn = "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50";

function Stamp({ label, value, on, tilt }: { label: string; value: string; on: boolean; tilt?: string }) {
  return (
    <div className={cx("rounded-lg px-2 py-2.5 text-center font-mono", on ? cx("border-2 border-brand-500 text-brand-700", tilt) : "border-2 border-dashed border-slate-300 text-slate-400")} data-stamp={label.toLowerCase()} data-on={on ? "1" : "0"}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

export function QuotingPanel({ d, previewHref, remindHref }: { d: Docket; previewHref: string; remindHref: string }) {
  const q = d.quote;
  const qt = d.quoting!;
  const first = d.customer.name.split(" ")[0] || d.customer.name;
  const tel = d.customer.phone?.replace(/\s+/g, "");
  const sent = q && q.status === "sent" ? qt.sent : null;

  return (
    <div data-quoting-panel>
      {sent && q ? (
        <div className="px-5 pb-4" data-quote-sent>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Quote {q.number}{sent.title ? ` · ${sent.title}` : ""}</p>
              <p className="font-display text-[34px] font-bold leading-none tracking-tight text-ink" data-quote-total>{aud(q.total)}</p>
            </div>
            <span className="flex shrink-0 gap-1.5">
              <a href={`/q/${q.public_token}?office=1`} target="_blank" rel="noreferrer" title={`See it as ${first} does`} aria-label={`See it as ${first} does`} className={iconBtn}><Icon d={EYE} /></a>
              <Link href={`/app/estimates/${q.id}`} title="Edit the quote" aria-label="Edit the quote" className={iconBtn}><Icon d={PEN} /></Link>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            inc GST{sent.validUntil ? ` · good until ${longDay(sent.validUntil)}` : ""}
            {sent.daysLeft !== null && <span className={cx("ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", sent.daysLeft < 0 ? "bg-red-50 text-red-700" : sent.daysLeft <= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600")} data-days-left>{sent.daysLeft < 0 ? `ran out ${-sent.daysLeft} d ago` : sent.daysLeft === 0 ? "last day" : `${sent.daysLeft} day${sent.daysLeft === 1 ? "" : "s"} left`}</span>}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Where the quote is up to" data-stamps>
            <Stamp label="Sent" value={sent.at ? stampDay(sent.at) : "—"} on tilt="-rotate-2" />
            <Stamp label="Opened" value={sent.views > 0 && sent.lastViewed ? `×${sent.views} · ${wkday(sent.lastViewed)}` : "—"} on={sent.views > 0} tilt="rotate-[1.5deg]" />
            <Stamp label="Signed" value="—" on={false} />
          </div>
          <div className="mt-4 flex gap-2">
            {tel ? <a href={`tel:${tel}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600" data-call><Icon d={PHONE} />Call</a>
              : <span className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">No number</span>}
            <Link href={remindHref} scroll={false} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50" data-remind><Icon d={BELL} />Remind</Link>
          </div>
          {sent.remindedAt && <p className="mt-2 text-xs text-slate-500">Last reminder {wkday(sent.remindedAt)} {longDay(sent.remindedAt)}.</p>}
        </div>
      ) : (
        <GettingToQuote d={d} previewHref={previewHref} />
      )}

      <JobContact d={d} />
      <JobNotes d={d} leadNote={qt.intake} />
      <JobDocuments jobId={d.job.id} docs={d.docs} />

      {sent && q && (
        <div className="border-t border-slate-100 px-5 py-4" data-heard-back>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Heard back another way?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ActionForm action={settleQuote}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="accepted" />
              <SubmitButton variant="secondary" className="min-h-11 w-full gap-2" confirm={`Mark quote #${q.number} as signed on paper? ${first}'s job moves to Sold.`}><Icon d={PEN} />Signed on paper</SubmitButton></ActionForm>
            <ActionForm action={settleQuote}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="declined" />
              <SubmitButton variant="secondary" className="min-h-11 w-full text-slate-600" confirm={`Mark that ${first} didn't go ahead? The job moves to Lost.`}>Didn&apos;t go ahead</SubmitButton></ActionForm>
          </div>
        </div>
      )}
    </div>
  );
}

/** Not quoted yet: inspection → measure → write the quote (or finish and send the draft). */
function GettingToQuote({ d, previewHref }: { d: Docket; previewHref: string }) {
  const qt = d.quoting!;
  const draft = qt.draft;
  const measured = draft?.area ?? (d.roof ? Math.round(d.roof.summary.trueArea) : null);
  const steps = [
    qt.inspection.photos > 0
      ? { k: "inspect", label: "Inspection", detail: `${qt.inspection.at ? `Done ${wkday(qt.inspection.at)} ${longDay(qt.inspection.at)} · ` : ""}${qt.inspection.photos} photo${qt.inspection.photos === 1 ? "" : "s"}`, done: true, href: `/app/jobs/${d.job.id}/files` }
      : { k: "inspect", label: "Inspection", detail: "Get on the roof, take photos", done: false, href: `/app/jobs/${d.job.id}/field` },
    measured
      ? { k: "measure", label: "Measure the roof", detail: `${measured} m²${d.roof?.m ? "" : ""}${d.quote?.measurement_source ? ` from ${d.quote.measurement_source === "plans" ? "plans" : d.quote.measurement_source === "satellite" ? "satellite" : "the roof"}` : ""}`, done: true, href: draft ? `/app/estimates/${draft.id}` : undefined }
      : { k: "measure", label: "Measure the roof", detail: "From plans, satellite or by hand, in the quote", done: false, href: undefined },
    draft
      ? { k: "write", label: "Write the quote", detail: `Draft #${draft.number} · ${aud(draft.total)} · check it and send`, done: false, href: undefined }
      : { k: "write", label: "Write the quote", detail: "Starts from your price book", done: false, href: undefined },
  ];
  const nowIx = steps.findIndex((s) => !s.done);
  const ready = steps[0].done && steps[1].done;
  return (
    <div className="px-5 pb-4" data-getting-to-quote>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Getting to a quote</p>
      <p className="font-display text-[26px] font-bold leading-tight text-ink">{draft ? "Quote's drafted" : ready ? "Ready to write the quote" : `${steps.filter((s) => s.done).length} of 3 done`}</p>
      <ol className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {steps.map((s, n) => (
          <li key={s.k} className={cx("flex items-center gap-3 px-3.5 py-3", n > 0 && "border-t border-slate-100", n === nowIx && "bg-brand-50")} data-quote-step={s.k} data-done={s.done ? "1" : "0"}>
            <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", s.done ? "bg-brand-500 text-white" : n === nowIx ? "bg-white text-brand-700 ring-2 ring-brand-500" : "bg-white text-slate-400 ring-1 ring-slate-200")}>{s.done ? <Icon d={CHECK} className="h-3.5 w-3.5" /> : n + 1}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{s.label}</span><span className="block text-xs text-slate-500">{s.detail}</span></span>
            {s.href && <Link href={s.href} className="text-xs font-semibold text-brand-700">{s.done ? "View" : "Open"}</Link>}
          </li>
        ))}
      </ol>
      {draft ? (
        <ActionForm action={sendQuoteEmail} className="mt-3">
          <input type="hidden" name="estimate_id" value={draft.id} />
          <div className="flex gap-2">
            <SubmitButton className="min-h-12 flex-1 gap-2 text-[15px]"><Icon d={SEND} />Send quote</SubmitButton>
            <Link href={`/app/estimates/${draft.id}`} title="Edit the quote" aria-label="Edit the quote" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={PEN} className="h-5 w-5" /></Link>
            <Link href={previewHref} scroll={false} title="Preview the email" aria-label="Preview the email" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={EYE} className="h-5 w-5" /></Link>
          </div>
        </ActionForm>
      ) : (
        <form action={createEstimate} className="mt-3">
          <input type="hidden" name="job_id" value={d.job.id} />
          <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600" data-write-quote><Icon d={QUOTE} />Write the quote</button>
          <p className="mt-2 text-xs text-slate-500">Measure from plans, satellite or by hand, price it from your price book, then send it from here.</p>
        </form>
      )}
    </div>
  );
}
