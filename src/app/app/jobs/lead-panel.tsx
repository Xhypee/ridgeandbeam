// New leads in the Jobs sidebar: under the ticket top, Contact · Notes · Documents (all open), then
// Send quote + a preview button that opens the quote email exactly as the customer will get it.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { Docket } from "@/lib/job-docket-server";
import { label as human } from "@/lib/format";
import { sendQuoteEmail } from "./quote-actions";
import { createEstimate } from "../estimates/actions";
import { EYE, Icon, JobContact, JobDocuments, JobNotes } from "./job-sections";
import { LeadSteps } from "./lead-steps";
import { dateIn } from "@/lib/lead-steps";

export { EYE, noteFacts } from "./job-sections";
const SEND = "M4 12l16-8-6 16-2.5-6.5z";
const PEN = "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3";
const SOURCE: Record<string, string> = { website: "From your website", instant_quote: "From your instant quote", gmail: "From Gmail", email: "From email", manual: "Added by hand" };

export function LeadPanel({ d, previewHref, meId }: { d: Docket; previewHref: string; meId: string }) {
  const lead = d.lead!;
  const first = d.customer.name.split(" ")[0] || "them";
  const q = d.quote;
  const sourceLabel = SOURCE[lead.source ?? ""] ?? (lead.source ? `From ${human(lead.source)}` : "Lead");

  const tz = d.job.tz;
  const when = (iso: string) => {
    const t = new Date(iso);
    const sameDay = t.toLocaleDateString("en-CA", { timeZone: tz }) === dateIn(tz);
    const time = t.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).replace(/\s?(am|pm)$/i, (m) => m.trim().toLowerCase());
    return sameDay ? `today ${time}` : `${t.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: tz })} ${time}`;
  };
  // Tomorrow, or Monday if tomorrow is a weekend.
  const tomorrow = dateIn(tz, 1);
  const dow = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
  const suggested = dow === 6 ? dateIn(tz, 3) : dow === 0 ? dateIn(tz, 2) : tomorrow;

  return (
    <>
      <LeadSteps
        jobId={d.job.id} first={first} phone={d.customer.phone} receivedAt={d.job.first_contacted_at ? null : d.job.lead_received_at}
        contacted={d.job.first_contacted_at ? { at: d.job.first_contacted_at, label: when(d.job.first_contacted_at), by: lead.contactedBy } : null}
        noAnswer={{ count: lead.noAnswer.count, lastLabel: lead.noAnswer.last ? when(lead.noAnswer.last) : null }}
        owner={d.job.assigned_to ?? d.people.find((p) => p.role === "owner")?.user_id ?? meId} meId={meId}
        people={d.people.filter((p) => p.role !== "crew_lead").map((p) => ({ user_id: p.user_id, name: p.full_name || p.email || "Someone" }))}
        dates={{ min: dateIn(tz), suggested }} tz={tz}
      />
      <JobContact d={d} />
      <JobNotes d={d} leadNote={lead.message ? { by: sourceLabel, at: lead.receivedAt, body: lead.message } : null} />
      <JobDocuments jobId={d.job.id} docs={lead.docs} />

      <div className="border-t border-slate-100 px-5 py-4" data-send-quote>
        {q ? (
          <>
            <ActionForm action={sendQuoteEmail}>
              <input type="hidden" name="estimate_id" value={q.id} />
              <div className="flex gap-2">
                <SubmitButton className="min-h-12 flex-1 gap-2 text-[15px]"><Icon d={SEND} />{q.status === "sent" ? "Send quote again" : "Send quote"}</SubmitButton>
                <Link href={`/app/estimates/${q.id}`} title="Edit the quote" aria-label="Edit the quote" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={PEN} className="h-5 w-5" /></Link>
                <Link href={previewHref} scroll={false} title={`Preview what ${first} will get`} aria-label={`Preview what ${first} will get`} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={EYE} className="h-5 w-5" /></Link>
              </div>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">
              Quote #{q.number} · {q.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} · {q.status === "sent" ? "sent" : "draft, check it before you send"}.
            </p>
          </>
        ) : (
          <form action={createEstimate}>
            <input type="hidden" name="job_id" value={d.job.id} />
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600"><Icon d="M12 5v14M5 12h14" />Start a quote</button>
            <p className="mt-2 text-xs text-slate-500">No inspection needed? Measure from plans or satellite, then send it from here.</p>
          </form>
        )}
      </div>
    </>
  );
}
