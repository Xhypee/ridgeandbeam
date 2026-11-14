// The job summary in the Jobs board's right sidebar ("ticket"): who · NOW → NEXT stage (the board's five
// columns) · the one next step · contract / paid / owing · a few links · team. Everything else is one click away.
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { label as human, money } from "@/lib/format";
import type { Docket } from "@/lib/job-docket-server";
import { avatarColour, JOB_ROLE_LABEL, JOB_ROLES } from "@/lib/job-team";
import type { Organization } from "@/lib/types";
import { initials } from "./people";
import { addJobMembers, removeJobMember } from "./team-actions";
import { LeadPanel } from "./lead-panel";
import { SoldPanel } from "./sold-panel";
import { BuildPanel } from "./build-panel";
import { WrapPanel } from "./wrap-panel";
import { QuotingPanel } from "./quoting-panel";
import { JobContact, JobDocuments, JobNotes } from "./job-sections";
import { ClaudeBar } from "./claude-bar";

const STAGES = ["New lead", "Quoting", "Sold", "Building", "Wrapping up"];
const STAGE_INDEX: Record<string, number> = { lead: 0, inspection: 1, estimate_sent: 1, sold: 2, scheduled: 2, in_progress: 3, completed: 4, paid: 4 };
const shortDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const whole = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

function Row({ href, title, value, external }: { href: string; title: string; value?: ReactNode; external?: boolean }) {
  const body = (
    <>
      <span className="font-medium text-ink">{title}</span>
      <span className="ml-auto truncate pl-3 text-right text-sm text-slate-500">{value}</span>
      <Icon d="M9 6l6 6-6 6" className="h-4 w-4 text-slate-300 group-hover:text-ink" />
    </>
  );
  const cls = "group flex min-h-12 items-center gap-2 px-5 hover:bg-slate-50";
  return <li>{external ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-docket-row={title}>{body}</a> : <Link href={href} className={cls} data-docket-row={title}>{body}</Link>}</li>;
}

/** Top-right of the ticket: how long a new lead has waited, the start date, else nothing (no build-day counts). */
function stageClock(d: Docket, now = new Date()) {
  const j = d.job;
  if (j.stage === "in_progress") return null;
  if (j.stage === "lead" && !j.first_contacted_at && j.lead_received_at) {
    const h = Math.floor((now.getTime() - new Date(j.lead_received_at).getTime()) / 3600000);
    return h < 1 ? "Just in" : h < 48 ? `Waiting ${h} h` : `Waiting ${Math.floor(h / 24)} d`;
  }
  if (["inspection", "estimate_sent"].includes(j.stage)) {
    const ago = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
    if (d.quote?.status === "sent" && d.quote.sent_at) { const n = ago(d.quote.sent_at); return n === 0 ? "Sent today" : `Sent ${n} d ago`; }
    return `${ago(j.created_at)} d in quoting`;
  }
  if (["sold", "scheduled"].includes(j.stage) && j.scheduled_start) return `Starts ${shortDate(j.scheduled_start)}`;
  if (j.completed_at) return `Finished ${shortDate(j.completed_at)}`;
  return `Since ${shortDate(j.created_at)}`;
}

export function JobDocket({ d, canSeeMoney, isCrewLead, closeHref, previewHref, askHref, payHref, remindHref, aiReady }: { d: Docket; org: Organization; canSeeMoney: boolean; isCrewLead: boolean; closeHref: string; previewHref: string; askHref: string; payHref: (orderId: string) => string; remindHref: string; aiReady: boolean }) {
  const j = d.job;
  const base = `/app/jobs/${j.id}`;
  const lost = j.stage === "lost";
  const at = STAGE_INDEX[j.stage] ?? 0;
  const done = j.stage === "paid";
  const quote = d.quote;
  const signed = quote?.status === "accepted";
  const tel = d.customer.phone ? `tel:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const sms = d.customer.phone ? `sms:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const invPaid = d.invoices.filter((i) => i.balance <= 0).length;
  const notOnTeam = d.people.filter((p) => !d.team.some((t) => t.user_id === p.user_id));
  const tag = [quote ? `Job ${quote.number}` : "New job", j.is_insurance ? "Insurance" : null].filter(Boolean).join(" · ");
  const firstNames = d.team.map((t) => t.name.split(" ")[0]);
  const teamTime = (STAGE_INDEX[j.stage] ?? 0) >= 2 && j.stage !== "lost";
  const actionIsLink = !d.next.href.startsWith("tel:");

  return (
    <div className="flex h-full flex-col bg-cream p-4" data-job-docket={j.id}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <div className="min-h-0 flex-1 overflow-y-auto" data-docket-scroll>
          {/* Ticket top */}
          <div className={cx("px-5 pb-5 pt-4 text-white", lost ? "bg-slate-600" : "bg-brand-500")} data-docket-stages>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              <span className="min-w-0 flex-1 truncate">{tag}</span>
              {(lost || stageClock(d)) && <span className="shrink-0">{lost ? "Lost" : stageClock(d)}</span>}
              <Link href={base} aria-label="Open the full job" title="Open the full job" className="-my-1 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></Link>
              <Link href={closeHref} scroll={false} aria-label="Close" className="-my-1 -mr-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight">{d.customer.name}</h2>
            <p className="truncate text-sm text-white/70">{j.site_address ?? d.customer.address ?? j.title}</p>
            <div className="mt-5 flex items-end justify-between gap-2">
              <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Now</p><p className="truncate font-display text-[28px] font-bold leading-none">{lost ? "Lost" : done ? "Paid ✓" : STAGES[at]}</p></div>
              {!lost && !done && at <= 4 && (
                <>
                  <svg viewBox="0 0 80 20" className="mb-1 h-5 w-16 shrink-0 text-brand-300" aria-hidden><path d="M2 10h70M64 3l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" /></svg>
                  <div className="min-w-0 text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Next</p><p className="truncate font-display text-lg font-bold leading-none text-white/70">{STAGES[at + 1] ?? "Paid ✓"}</p></div>
                </>
              )}
            </div>
            {!lost && <div className="mt-4 flex gap-1" aria-label={`Stage ${at + 1} of 5`}>{STAGES.map((s, i) => <span key={s} title={s} className={cx("h-1 flex-1 rounded-full", i < at || done ? "bg-brand-300" : i === at ? "bg-white" : "bg-white/20")} />)}</div>}
          </div>

          {/* Tear line */}
          <div className="relative h-5" aria-hidden><span className="absolute -left-2.5 top-0 h-5 w-5 rounded-full bg-cream" /><span className="absolute -right-2.5 top-0 h-5 w-5 rounded-full bg-cream" /><span className="absolute inset-x-4 top-2.5 border-t-2 border-dashed border-slate-200" /></div>

          {d.lead && canSeeMoney ? <LeadPanel d={d} previewHref={previewHref} /> : d.quoting && canSeeMoney && !isCrewLead ? <QuotingPanel d={d} previewHref={previewHref} remindHref={remindHref} /> : d.build && !isCrewLead ? (<>
            {d.wrap ? <WrapPanel d={d} askHref={askHref} payHref={payHref} /> : <BuildPanel d={d} askHref={askHref} payHref={payHref} />}
            <JobContact d={d} />
            <JobNotes d={d} />
            <JobDocuments jobId={j.id} docs={d.docs} meta={d.build.invoiceDocs} />
          </>) : (<>
          <div className="px-5">
            {d.sold && !isCrewLead ? <div className="-mx-5"><SoldPanel d={d} /></div> : !isCrewLead && (
              <div data-docket-now>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Next step</p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold leading-snug text-ink">{d.next.title}</p>
                    {d.next.detail && <p className="text-sm leading-snug text-slate-500">{d.next.detail}</p>}
                  </div>
                  {actionIsLink
                    ? <Link href={d.next.href} className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">{d.next.actionLabel}</Link>
                    : <a href={d.next.href} className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Call</a>}
                </div>
              </div>
            )}

            {canSeeMoney && (d.money.contract !== null || quote) && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center" data-docket-money>
                {(d.money.contract !== null
                  ? [["Contract", whole(d.money.contract), "text-ink"], ["Paid", whole(d.money.paid), "text-teal-700"], ["Owing", whole(d.money.owing), d.money.owing > 0 ? "text-ink" : "text-teal-700"]]
                  : [["Quote", whole(quote!.total), "text-ink"], ["Status", quote!.status === "sent" ? "Sent" : human(quote!.status), "text-ink"], ["Paid", whole(d.money.paid), "text-teal-700"]]
                ).map(([k, v, c]) => <div key={k} className="rounded-xl bg-cream py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className={cx("font-display font-bold", c)} title={k === "Contract" || k === "Paid" || k === "Owing" ? money(k === "Contract" ? d.money.contract : k === "Paid" ? d.money.paid : d.money.owing) : undefined}>{v}</p></div>)}
              </div>
            )}
          </div>

          <ul className="mt-3 divide-y divide-slate-100" data-docket-links>
            {quote && canSeeMoney && <Row href={`/app/estimates/${quote.id}`} title="Quote" value={`#${quote.number} · ${signed ? "signed" : quote.status === "sent" ? "sent" : "draft"}`} />}
            {canSeeMoney && d.invoices.length > 0 && <Row href={`${base}/billing`} title="Invoices" value={`${invPaid} of ${d.invoices.length} paid`} />}
            {canSeeMoney && signed && <Row href={`${base}/billing/plan`} title="Payment plan" value={d.invoices.length > 1 ? `${d.invoices.length} payments` : "Split the price"} />}
            <Row href={`${base}/files`} title="Plans & photos" value={[d.files.plans ? `${d.files.plans} plan${d.files.plans === 1 ? "" : "s"}` : null, `${d.files.photos} photo${d.files.photos === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} />
            {d.claim && canSeeMoney && <Row href={`${base}/claim`} title="Insurance claim" value={human(d.claim.stage)} />}
            <Row href={base} title="Everything else" value="Notes, build, compliance" />
          </ul>
          {d.sold && !isCrewLead && <><JobContact d={d} /><JobNotes d={d} /><JobDocuments jobId={j.id} docs={d.docs} /></>}
          </>)}
        </div>

        {/* Team + call: only once it's sold (before that there's no crew to add, and Contact has text/call). */}
        {teamTime && <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3" data-docket-team>
          {d.team.length > 0 ? (
            <span className="flex -space-x-1.5">{d.team.map((t) => <span key={t.user_id} title={`${t.name} · ${JOB_ROLE_LABEL[t.role]}`} data-team-member={t.role} className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white" style={{ background: avatarColour(t.user_id) }}>{initials({ full_name: t.name })}</span>)}</span>
          ) : null}
          {isCrewLead ? (
            <span className="min-w-0 truncate text-sm text-slate-500">{firstNames.join(", ") || j.crew?.name || "No team yet"}</span>
          ) : (
            <details className="relative min-w-0" data-add-staff>
              <summary className="cursor-pointer list-none truncate rounded-lg px-1.5 py-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-ink [&::-webkit-details-marker]:hidden">
                {firstNames.length ? firstNames.join(", ") : <span className="font-semibold text-brand-700">+ Add team</span>}
              </summary>
              <div className="absolute bottom-10 left-0 z-20 w-[300px] rounded-2xl bg-white p-3.5 ring-2 ring-ink">
                <p className="font-display text-sm font-bold text-ink">Team on this job</p>
                {d.team.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {d.team.map((t) => (
                      <li key={t.user_id} className="flex items-center gap-2 text-[13px]">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: avatarColour(t.user_id) }}>{initials({ full_name: t.name })}</span>
                        <span className="min-w-0 flex-1 truncate"><b className="text-ink">{t.name}</b> <span className="text-slate-500">· {JOB_ROLE_LABEL[t.role]}</span></span>
                        <form action={removeJobMember}><input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="user_id" value={t.user_id} /><button aria-label={`Take ${t.name} off this job`} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-700">✕</button></form>
                      </li>
                    ))}
                  </ul>
                )}
                {notOnTeam.length > 0 ? (
                  <ActionForm action={addJobMembers}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Add</p>
                    <ul className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto">
                      {notOnTeam.map((p) => (
                        <li key={p.user_id} className="flex items-center gap-2 py-1.5">
                          <input type="checkbox" name="user_id" value={p.user_id} aria-label={`Add ${p.full_name ?? p.email}`} className="h-4 w-4 shrink-0 accent-[#1f5f3f]" />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{p.full_name || p.email}</span>
                          <select name={`role_${p.user_id}`} defaultValue={p.suggested} aria-label="Role on this job" className="h-8 rounded-md bg-cream px-1 text-[11px] font-semibold text-ink ring-1 ring-slate-300">
                            {JOB_ROLES.map((r) => <option key={r} value={r}>{JOB_ROLE_LABEL[r]}</option>)}
                          </select>
                        </li>
                      ))}
                    </ul>
                    <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#1f5f3f]" />Let them know</label>
                    <SubmitButton className="mt-2 min-h-10 w-full">Add to job</SubmitButton>
                  </ActionForm>
                ) : <p className="mt-2 text-xs text-slate-500">Everyone on your team is on this job. Invite more people in Settings → Team.</p>}
              </div>
            </details>
          )}
          <span className="ml-auto flex shrink-0 gap-2">
            {sms && <a href={sms} aria-label={`Text ${d.customer.name}`} title="Text" className="grid h-10 w-10 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d="M4 5h16v11H9l-5 4z" /></a>}
            {tel && <a href={tel} aria-label={`Call ${d.customer.name}`} title="Call" className="grid h-10 w-10 place-items-center rounded-xl text-ink ring-1 ring-slate-300 hover:bg-slate-50"><Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></a>}
          </span>
        </div>}
        {!isCrewLead && <ClaudeBar jobId={j.id} firstName={d.customer.name.split(" ")[0] || d.customer.name} ready={aiReady} />}
      </div>
    </div>
  );
}
