// The job summary in the Jobs board's right sidebar. Kept simple on purpose:
// who · where it's up to (the board's five stages) · the one thing to do · money · a few links · team.
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { label as human, money } from "@/lib/format";
import type { Docket } from "@/lib/job-docket-server";
import { avatarColour, JOB_ROLE_LABEL, JOB_ROLES } from "@/lib/job-team";
import { jobTypeLabel } from "@/lib/job-types";
import type { Organization } from "@/lib/types";
import { initials } from "./people";
import { addJobMembers, removeJobMember } from "./team-actions";

const STAGES = ["New lead", "Quoting", "Sold", "Building", "Wrapping up"];
const STAGE_INDEX: Record<string, number> = { lead: 0, inspection: 1, estimate_sent: 1, sold: 2, scheduled: 2, in_progress: 3, completed: 4, paid: 4, lost: -1 };

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
  const cls = "group flex min-h-12 items-center gap-2 px-4 hover:bg-slate-50";
  return <li>{external ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-docket-row={title}>{body}</a> : <Link href={href} className={cls} data-docket-row={title}>{body}</Link>}</li>;
}

export function JobDocket({ d, canSeeMoney, isCrewLead, closeHref }: { d: Docket; org: Organization; canSeeMoney: boolean; isCrewLead: boolean; closeHref: string }) {
  const j = d.job;
  const base = `/app/jobs/${j.id}`;
  const at = STAGE_INDEX[j.stage] ?? 0;
  const suburb = (j.site_address ?? d.customer.address ?? "").split(",").slice(-1)[0]?.replace(/\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)?\s*\d{4}\s*$/, "").trim();
  const quote = d.quote;
  const signed = quote?.status === "accepted";
  const tel = d.customer.phone ? `tel:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const sms = d.customer.phone ? `sms:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const paidPct = d.money.contract ? Math.min(100, Math.round((d.money.paid / d.money.contract) * 100)) : 0;
  const invPaid = d.invoices.filter((i) => i.balance <= 0).length;
  const notOnTeam = d.people.filter((p) => !d.team.some((t) => t.user_id === p.user_id));

  return (
    <div className="flex h-full flex-col bg-white" data-job-docket={j.id}>
      <div className="min-h-0 flex-1 overflow-y-auto" data-docket-scroll>
        {/* Who */}
        <div className="flex items-start gap-2 px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold leading-tight text-ink">{d.customer.name}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{[jobTypeLabel(j.job_type), suburb, j.is_insurance ? "Insurance" : null].filter(Boolean).join(" · ")}</p>
          </div>
          <Link href={base} aria-label="Open the full job" title="Open the full job" className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink"><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></Link>
          <Link href={closeHref} scroll={false} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
        </div>

        {/* Where it's up to: the board's five columns */}
        <div className="px-5" data-docket-stages>
          <div className="flex gap-1">{STAGES.map((s, i) => <span key={s} className={cx("h-1.5 flex-1 rounded-full", i < at ? "bg-teal-500" : i === at ? "bg-brand-500" : "bg-slate-200")} />)}</div>
          <p className="mt-1.5 text-xs text-slate-500">{at >= 0 ? <><b className="text-ink">{STAGES[at]}</b>{at < 4 ? ` · next: ${STAGES[at + 1]}` : ""}</> : "Lost"}</p>
        </div>

        {/* The one thing to do */}
        {!isCrewLead && (
          <div className="mx-5 mt-4 rounded-2xl bg-ink p-4 text-white" data-docket-now>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">Next step</p>
            <p className="mt-0.5 font-display text-lg font-bold leading-snug">{d.next.title}</p>
            {d.next.detail && <p className="mt-0.5 text-sm text-white/65">{d.next.detail}</p>}
            <Link href={d.next.href} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-brand-300 text-sm font-bold text-ink hover:bg-brand-200">{d.next.actionLabel}</Link>
          </div>
        )}

        {/* Money */}
        {canSeeMoney && (d.money.contract !== null || quote) && (
          <div className="mx-5 mt-4" data-docket-money>
            {d.money.contract !== null ? (
              <>
                <div className="flex items-baseline justify-between text-sm"><span><b className="font-display text-lg text-teal-700">{money(d.money.paid)}</b> <span className="text-slate-500">paid of {money(d.money.contract)}</span></span><span className={d.money.owing > 0 ? "font-semibold text-ink" : "text-teal-700"}>{d.money.owing > 0 ? `${money(d.money.owing)} owing` : "Paid ✓"}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${paidPct}%` }} /></div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Quote <b className="font-display text-lg text-ink">{money(quote!.total)}</b> · {quote!.status === "sent" ? "waiting for them to sign" : "draft"}</p>
            )}
          </div>
        )}

        {/* A few links: everything else lives behind these */}
        <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100" data-docket-links>
          {quote && canSeeMoney && <Row href={`/app/estimates/${quote.id}`} title="Quote" value={`#${quote.number} · ${signed ? "signed" : quote.status === "sent" ? "sent" : "draft"}`} />}
          {canSeeMoney && d.invoices.length > 0 && <Row href={`${base}/billing`} title="Invoices" value={`${invPaid} of ${d.invoices.length} paid`} />}
          {canSeeMoney && signed && <Row href={`${base}/billing/plan`} title="Payment plan" value={d.invoices.length > 1 ? `${d.invoices.length} payments` : "Split the price"} />}
          <Row href={`${base}/files`} title="Plans & photos" value={[d.files.plans ? `${d.files.plans} plan${d.files.plans === 1 ? "" : "s"}` : null, `${d.files.photos} photo${d.files.photos === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} />
          {d.claim && canSeeMoney && <Row href={`${base}/claim`} title="Insurance claim" value={human(d.claim.stage)} />}
          <Row href={base} title="Everything else" value="Notes, build, compliance" />
        </ul>

        {/* Team */}
        <div className="px-5 py-4" data-docket-team>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Team</p>
            <div className="flex -space-x-1.5">
              {d.team.map((t) => (
                <span key={t.user_id} title={`${t.name} · ${JOB_ROLE_LABEL[t.role]}`} data-team-member={t.role} className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white" style={{ background: avatarColour(t.user_id) }}>{initials({ full_name: t.name })}</span>
              ))}
            </div>
            {d.team.length === 0 && <span className="text-sm text-slate-400">{j.crew ? j.crew.name : "No one yet"}</span>}
            {!isCrewLead && (notOnTeam.length > 0 || d.team.length > 0) && (
              <details className="relative ml-auto" data-add-staff>
                <summary className="cursor-pointer list-none rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 [&::-webkit-details-marker]:hidden">{d.team.length ? "Edit" : "+ Add"}</summary>
                <div className="absolute bottom-10 right-0 z-20 w-[300px] rounded-2xl bg-white p-3.5 ring-2 ring-ink">
                  {d.team.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {d.team.map((t) => (
                        <li key={t.user_id} className="flex items-center gap-2 text-[13px]">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: avatarColour(t.user_id) }}>{initials({ full_name: t.name })}</span>
                          <span className="min-w-0 flex-1"><b className="text-ink">{t.name}</b> <span className="text-slate-500">· {JOB_ROLE_LABEL[t.role]}</span></span>
                          <form action={removeJobMember}><input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="user_id" value={t.user_id} /><button aria-label={`Take ${t.name} off this job`} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-700">✕</button></form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {notOnTeam.length > 0 && (
                    <ActionForm action={addJobMembers}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add</p>
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
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {(tel || sms) && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-5 py-3">
          {tel && <a href={tel} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50"><Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />Call {d.customer.name.split(" ")[0]}</a>}
          {sms && <a href={sms} className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Text</a>}
        </div>
      )}
    </div>
  );
}
