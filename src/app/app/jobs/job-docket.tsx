// The job docket: everything about one job on one receipt, in the Jobs board's right sidebar.
// Big things open as full pages (plans & files, quote, invoices, payment plan…); the rest folds away.
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { formatAbn } from "@/lib/au";
import { label as human, money, STAGE_LABEL } from "@/lib/format";
import type { Docket } from "@/lib/job-docket-server";
import { avatarColour, JOB_ROLE_LABEL, JOB_ROLES } from "@/lib/job-team";
import { jobTypeLabel } from "@/lib/job-types";
import { PROFILE_SHORT } from "@/lib/docket";
import type { Organization } from "@/lib/types";
import { addNote } from "./actions";
import { initials } from "./people";
import { addJobMembers, removeJobMember } from "./team-actions";

const d2 = (iso: string | null | undefined) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }).toUpperCase() : "");
const dShort = (iso: string | null | undefined) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "");
const num = (n: number) => n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHEV = "M9 6l6 6-6 6";
const OPEN = "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6";
const STAMP: Record<string, string> = {
  lead: "border-red-600 text-red-700", inspection: "border-amber-600 text-amber-700", estimate_sent: "border-brand-600 text-brand-700",
  sold: "border-brand-600 text-brand-700", scheduled: "border-brand-600 text-brand-700", in_progress: "border-amber-600 text-amber-700",
  completed: "border-teal-600 text-teal-700", paid: "border-teal-600 text-teal-700", lost: "border-slate-400 text-slate-500",
};
const STAMP_TEXT: Record<string, string> = { estimate_sent: "Quoted", in_progress: "Building" };

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
function Fold({ id, title, summary, open, children }: { id: string; title: string; summary: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details id={`d-${id}`} open={open} data-fold={id} className="group border-t-2 border-dashed border-slate-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="w-[5.6rem] shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-ink">{summary}</span>
        <Icon d={CHEV} className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}
function L({ k, v, tone, strong }: { k: ReactNode; v?: ReactNode; tone?: "teal" | "amber" | "red" | "dim"; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-3 py-[3px]", tone === "dim" && "text-slate-300")}>
      <span className={cx("min-w-0", tone === "dim" ? "" : strong ? "font-semibold text-ink" : "text-slate-500")}>{k}</span>
      <span className={cx("min-w-0 text-right tabular-nums [overflow-wrap:anywhere]", tone === "teal" ? "text-teal-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "dim" ? "" : "text-ink", strong && "font-semibold")}>{v}</span>
    </div>
  );
}
function Stamp({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" | "slate" | "brand" }) {
  const t = { teal: "border-teal-600 text-teal-700", amber: "border-amber-600 text-amber-700", slate: "border-slate-300 text-slate-500", brand: "border-brand-600 text-brand-700" }[tone];
  return <span className={cx("inline-block rounded border px-1 font-sans text-[9px] font-bold uppercase leading-[14px] tracking-wider", t)}>{children}</span>;
}
function OpenTile({ href, title, meta, art, external }: { href: string; title: string; meta: string; art: ReactNode; external?: boolean }) {
  const cls = "group block overflow-hidden rounded-xl bg-white font-sans ring-1 ring-slate-200 hover:ring-ink focus-visible:ring-2 focus-visible:ring-brand-500";
  const body = (
    <>
      <span className="relative block h-[60px] overflow-hidden bg-slate-50">{art}<span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-white/90 text-ink ring-1 ring-slate-200"><Icon d={OPEN} className="h-3.5 w-3.5" /></span></span>
      <span className="block px-2.5 py-1.5"><span className="block truncate text-[12px] font-semibold text-ink">{title}</span><span className="block truncate text-[10.5px] text-slate-500">{meta}</span></span>
    </>
  );
  return external ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-open-tile={title}>{body}</a> : <Link href={href} className={cls} data-open-tile={title}>{body}</Link>;
}
const PlanArt = () => <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden><rect width="100" height="56" fill="#fbfcfd" /><g stroke="#475569" strokeWidth="1.3" fill="none"><rect x="16" y="9" width="48" height="32" /><rect x="64" y="23" width="18" height="24" /><path d="M16 9l11 11h26l11-11M16 41l11-11h26l11 11M27 20v10M53 20v10M64 23l9 9 9-9M73 32v15" /></g></svg>;
const LinesArt = () => <span className="flex h-full flex-col justify-center gap-1 px-3">{[80, 62, 72, 48].map((w) => <span key={w} className="h-1 rounded bg-slate-300" style={{ width: `${w}%` }} />)}<span className="mt-1 h-1.5 w-1/2 self-end rounded bg-ink" /></span>;
const IconArt = ({ d, cls = "text-slate-500" }: { d: string; cls?: string }) => <span className={cx("grid h-full place-items-center", cls)}><Icon d={d} className="h-7 w-7" /></span>;

export function JobDocket({ d, org, canSeeMoney, isCrewLead, closeHref }: { d: Docket; org: Organization; canSeeMoney: boolean; isCrewLead: boolean; closeHref: string }) {
  const j = d.job;
  const base = `/app/jobs/${j.id}`;
  const suburb = (j.site_address ?? d.customer.address ?? "").split(",").slice(-1)[0]?.replace(/\s+\d{4}\s*$/, "").trim();
  const licence = j.state ? org.licences?.[j.state]?.number : null;
  const stage = j.stage;
  const quote = d.quote;
  const signed = quote?.status === "accepted";
  const openKey = ["lead", "inspection"].includes(stage) ? "contact" : stage === "estimate_sent" ? "quote" : ["sold", "scheduled", "in_progress"].includes(stage) ? "build" : "payments";
  const tel = d.customer.phone ? `tel:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const sms = d.customer.phone ? `sms:${d.customer.phone.replace(/\s+/g, "")}` : null;
  const notOnTeam = d.people.filter((p) => !d.team.some((t) => t.user_id === p.user_id));
  const planned = d.invoices.some((i) => ["deposit", "progress", "final", "instalment"].includes(i.kind));
  const nextPart = d.invoices.find((i) => i.status !== "draft" && i.balance > 0);
  const m = d.roof?.m;

  return (
    <div className="flex h-full flex-col" data-job-docket={j.id}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-cream px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Job docket</p>
        <span className="flex items-center gap-1">
          <Link href={base} className="whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-ink">Open full page ↗</Link>
          <Link href={closeHref} scroll={false} aria-label="Close the docket" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-ink"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-cream px-4 pt-3" data-docket-scroll>
        <div className="rounded-t-[16px] bg-white px-4 pb-4 pt-4 font-mono text-[11.5px] leading-[1.5] text-slate-600 ring-1 ring-slate-200">
          <div className="flex justify-between gap-3 text-[10px] uppercase tracking-wider text-slate-400">
            <span>{org.name}{licence ? ` · ${j.state} ${licence}` : ""}<br />{quote ? `Job ${quote.number}` : "New job"}{org.abn ? ` · ABN ${formatAbn(org.abn)}` : ""}</span>
            <span className="text-right">Opened {new Date(j.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit" })}<br />{suburb}</span>
          </div>
          <div className="mt-3 flex items-center gap-3 border-t-2 border-dashed border-slate-200 pt-3 font-sans">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold leading-tight text-ink">{d.customer.name}</h2>
              <p className="text-xs text-slate-500">{[jobTypeLabel(j.job_type), quote?.roof_profile ? `${PROFILE_SHORT[quote.roof_profile as keyof typeof PROFILE_SHORT] ?? quote.roof_profile}${quote.roof_colour ? ` ${quote.roof_colour}` : ""}` : j.roof_material, j.is_insurance ? "insurance" : null].filter(Boolean).join(" · ")}</p>
            </div>
            <span className={cx("shrink-0 rotate-[-7deg] rounded border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", STAMP[stage] ?? STAMP.lead)}>{STAMP_TEXT[stage] ?? STAGE_LABEL[stage] ?? stage}</span>
          </div>

          {canSeeMoney && (d.money.contract !== null || quote) && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-cream font-sans ring-1 ring-slate-200" data-docket-money>
              {(d.money.contract !== null
                ? [["Contract", money(d.money.contract), ""], ["Paid", money(d.money.paid), "text-teal-700"], ["Owing", money(d.money.owing), d.money.owing > 0 ? "" : "text-teal-700"]]
                : [["Quote", money(quote!.total), ""], ["Status", quote!.status === "sent" ? "Sent" : human(quote!.status), ""], ["Paid", money(d.money.paid), "text-teal-700"]]
              ).map(([k, v, c]) => <div key={k} className="min-w-0 px-2.5 py-2"><p className="text-[10px] text-slate-500">{k}</p><p className={cx("truncate font-display text-[15px] font-bold tabular-nums text-ink", c)}>{v}</p></div>)}
            </div>
          )}

          {!isCrewLead && (
            <Link href={d.next.href} className="mt-2 block rounded-lg bg-ink px-3 py-2 font-sans text-white hover:bg-brand-800" data-docket-now>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Now · {d.next.actionLabel} →</span>
              <span className="block text-[13px] font-semibold leading-snug">{d.next.title}</span>
              {d.next.detail && <span className="block text-xs leading-snug text-white/70">{d.next.detail}</span>}
            </Link>
          )}

          {/* Team */}
          <section aria-label="Team on this job" className="mt-3 border-t-2 border-dashed border-slate-200 pt-3 font-sans" data-docket-team>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Team on this job</p>
              {!isCrewLead && notOnTeam.length > 0 && (
                <details className="relative" data-add-staff>
                  <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 [&::-webkit-details-marker]:hidden">+ Add staff</summary>
                  <div className="absolute right-0 top-8 z-20 w-[300px] rounded-2xl bg-white p-3.5 ring-2 ring-ink">
                    <p className="font-display text-sm font-bold text-ink">Add staff to this job</p>
                    <ActionForm action={addJobMembers}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">
                        {notOnTeam.map((p) => (
                          <li key={p.user_id} className="flex items-center gap-2 py-1.5">
                            <input type="checkbox" name="user_id" value={p.user_id} aria-label={`Add ${p.full_name ?? p.email}`} className="h-4 w-4 shrink-0 accent-[#1f5f3f]" />
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: avatarColour(p.user_id) }}>{initials(p)}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-ink">{p.full_name || p.email}</span><span className="block truncate text-[11px] text-slate-500">{human(p.role === "member" ? "office" : p.role)}</span></span>
                            <select name={`role_${p.user_id}`} defaultValue={p.suggested} aria-label="Role on this job" className="h-8 rounded-md bg-cream px-1 text-[11px] font-semibold text-ink ring-1 ring-slate-300">
                              {JOB_ROLES.map((r) => <option key={r} value={r}>{JOB_ROLE_LABEL[r]}</option>)}
                            </select>
                          </li>
                        ))}
                      </ul>
                      <label className="mt-2 flex items-center gap-2 rounded-lg bg-cream px-2.5 py-2 text-[12px] text-slate-700"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-[#1f5f3f]" />Tell them (email + in the app)</label>
                      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">Crew leads see the address, plans, photos and the work order. Not prices or invoices.</p>
                      <SubmitButton className="mt-2 min-h-10 w-full">Add to job</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              )}
            </div>
            {d.team.length === 0 ? (
              <p className="text-[12px] text-slate-500">{j.crew ? `${j.crew.name} is booked. ` : ""}No one added yet.</p>
            ) : (
              <ul className="space-y-1">
                {d.team.map((t) => (
                  <li key={t.user_id} className="group flex items-center gap-2.5" data-team-member={t.role}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColour(t.user_id) }}>{initials({ full_name: t.name })}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-ink">{t.name}</span><span className="block truncate text-[11px] text-slate-500">{JOB_ROLE_LABEL[t.role]}{t.phone ? ` · ${t.phone}` : ""}</span></span>
                    {!isCrewLead && (
                      <form action={removeJobMember}>
                        <input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="user_id" value={t.user_id} />
                        <button aria-label={`Take ${t.name} off this job`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-red-700">✕</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {j.crew && d.team.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Crew booked: {j.crew.name}</p>}
          </section>

          {/* Open as a full page */}
          <section aria-label="Open" className="mt-3 border-t-2 border-dashed border-slate-200 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Open</p>
            <div className="grid grid-cols-3 gap-2">
              <OpenTile href={`${base}/files`} title="Plans & files" meta={d.files.plans ? `${d.files.plans} plan${d.files.plans === 1 ? "" : "s"} · ${d.files.documents} docs` : `${d.files.documents} docs · upload plans`} art={<PlanArt />} />
              <OpenTile href={`${base}/files?tab=photos`} title="Photos" meta={`${d.files.photos} photo${d.files.photos === 1 ? "" : "s"}`} art={d.files.thumbs.length ? (
                // eslint-disable-next-line @next/next/no-img-element
                <span className="grid h-full grid-cols-2 gap-px">{d.files.thumbs.map((u) => <img key={u} src={u} alt="" className="h-full w-full object-cover" />)}</span>
              ) : <IconArt d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8" />} />
              {quote && canSeeMoney ? <OpenTile href={`/app/estimates/${quote.id}`} title={`Quote #${quote.number}`} meta={`${money(quote.total)} · ${signed ? "signed" : quote.status}`} art={<LinesArt />} />
                : canSeeMoney ? <OpenTile href={`${base}`} title="Quote" meta="Not started" art={<LinesArt />} /> : <OpenTile href={`${base}/production/work-order`} title="Work order" meta="For the crew" art={<LinesArt />} />}
              {canSeeMoney && <OpenTile href={`${base}/billing`} title="Invoices" meta={d.invoices.length ? `${d.invoices.length} · ${money(d.money.owing)} owing` : "None yet"} art={<span className="flex h-full items-center justify-center gap-1">{d.invoices.slice(0, 3).map((i) => <Stamp key={i.id} tone={i.status === "paid" ? "teal" : i.status === "draft" ? "slate" : i.status === "partial" ? "amber" : "brand"}>{i.status === "draft" ? "later" : i.status === "partial" ? "part" : i.status === "sent" ? "due" : i.status}</Stamp>)}{!d.invoices.length && <Icon d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z" className="h-7 w-7 text-slate-400" />}</span>} />}
              {canSeeMoney && signed && <OpenTile href={`${base}/billing/plan`} title="Payment plan" meta={planned ? `${d.invoices.filter((i) => i.balance <= 0).length} of ${d.invoices.length} paid` : "Split the price"} art={<span className="flex h-full items-center px-3"><span className="flex h-2.5 w-full overflow-hidden rounded-full">{["#1f5f3f", "#14b8a6", "#0f766e", "#99e2d8", "#d8eadd"].map((c) => <span key={c} className="flex-1 border-r border-white" style={{ background: c }} />)}</span></span>} />}
              {signed && quote && <OpenTile external href={`/q/${quote.public_token}`} title="Contract" meta={`Signed ${dShort(quote.accepted_at)}`} art={<svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden><path d="M16 36c8-14 14-18 17-14s-6 16-1 17 11-19 16-18-3 14 2 14 10-10 15-9 1 8 6 8 11-7 17-6" fill="none" stroke="#13221a" strokeWidth="2" strokeLinecap="round" /></svg>} />}
              {d.claim && canSeeMoney && <OpenTile href={`${base}/claim`} title="Insurance claim" meta={d.claim.carrier ?? "Claim"} art={<IconArt d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" cls="text-violet-700" />} />}
              {canSeeMoney && <OpenTile href={`${base}/compliance`} title="Compliance" meta={d.compliance ? `${d.compliance.done} of ${d.compliance.total} done` : "State rules"} art={<IconArt d="M5 12l5 5 9-10" cls="text-teal-700" />} />}
            </div>
          </section>

          {/* Folding sections */}
          <div className="mt-3">
            <Fold id="contact" title="Contact" summary={`${d.customer.name.split(" ")[0]}${d.customer.phone ? ` · ${d.customer.phone}` : ""}`} open={openKey === "contact"}>
              <L k={d.customer.name} v={d.customer.phone ? <a className="underline" href={tel!}>{d.customer.phone}</a> : "No phone"} />
              {d.customer.email && <L k="Email" v={<a className="underline" href={`mailto:${d.customer.email}`}>{d.customer.email}</a>} />}
              <L k="Site" v={j.site_address ?? d.customer.address ?? "—"} />
              {j.lead_source && <L k="Lead" v={`${human(j.lead_source)}${j.lead_received_at ? ` · ${dShort(j.lead_received_at)}` : ""}`} />}
              {j.lead_received_at && <L k="First contact" v={j.first_contacted_at ? `${Math.max(0, Math.round((new Date(j.first_contacted_at).getTime() - new Date(j.lead_received_at).getTime()) / 3600000))} h after the lead` : "Not yet"} tone={j.first_contacted_at ? undefined : "red"} />}
              {d.customer.notes && <p className="mt-1 rounded-md bg-cream px-2 py-1.5 font-sans text-[12px] text-ink">{d.customer.notes}</p>}
              <p className="mt-1.5 font-sans text-[12px]"><Link className="font-semibold text-brand-700" href={`/app/customers/${d.customer.id}`}>Customer record →</Link></p>
            </Fold>

            <Fold id="roof" title="Roof" summary={d.roof ? `${d.roof.summary.trueArea} m² · ${d.roof.summary.maxPitch}°` : "Not measured"}>
              {d.roof && m ? (
                <>
                  {m.sections.filter((s) => s.area > 0).map((s, i) => <L key={i} k={s.label || `Section ${i + 1}`} v={`${s.area} m² plan · ${s.pitch}°`} />)}
                  <L k="True area" v={`${d.roof.summary.trueArea} m²`} strong />
                  <L k="Ridge · hip · valley" v={`${m.ridge} · ${m.hip} · ${m.valley} m`} />
                  <L k="Eave · barge · apron" v={`${m.eave} · ${m.barge} · ${m.apron} m`} />
                  {quote?.measurement_source && <L k="Measured" v={human(quote.measurement_source)} />}
                </>
              ) : <p className="font-sans text-[12px] text-slate-500">Measure it on the quote: from the plans, the satellite map or by hand.</p>}
            </Fold>

            {quote && canSeeMoney && (
              <Fold id="quote" title="Quote" summary={`#${quote.number} · ${money(quote.total)}${signed ? ` · signed ${dShort(quote.accepted_at)}` : quote.status === "sent" ? ` · sent ${dShort(quote.sent_at)}` : " · draft"}`} open={openKey === "quote"}>
                {quote.lines.filter((l) => l.extra_status !== "offered").map((l, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-[2px]"><span className={cx("truncate", l.extra_status === "added" ? "text-slate-500" : "text-ink")}>{l.extra_status === "added" ? "+ " : ""}{l.description}</span><span className="tabular-nums text-ink">{num(l.amount)}</span></div>
                ))}
                {quote.lines.some((l) => l.extra_status === "offered") && <p className="py-[2px] text-slate-300">Not taken: {quote.lines.filter((l) => l.extra_status === "offered").map((l) => l.description.toLowerCase()).join(", ")}</p>}
                <div className="mt-1 border-t border-slate-200 pt-1"><L k="Total inc GST" v={money(quote.total)} strong /><L k="GST included" v={money(quote.gst)} />{signed && <L k={<>Signed {quote.accepted_name ? `by ${quote.accepted_name}` : ""} <Stamp>signed</Stamp></>} v={dShort(quote.accepted_at)} />}</div>
              </Fold>
            )}

            {d.claim && (
              <Fold id="claim" title="Claim" summary={`${d.claim.carrier ?? "Insurer"} · ${human(d.claim.stage)}`}>
                <L k="Insurer" v={d.claim.carrier ?? "—"} />{d.claim.claim_number && <L k="Claim" v={d.claim.claim_number} />}{d.claim.adjuster_name && <L k="Assessor" v={d.claim.adjuster_name} />}
                <L k="Excess" v={money(d.claim.excess)} />{d.claim.approved_amount !== null && <L k="Approved" v={money(d.claim.approved_amount)} />}
              </Fold>
            )}

            <Fold id="build" title="Build" summary={j.scheduled_start ? `${dShort(j.scheduled_start)}${j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${dShort(j.scheduled_end)}` : ""}${j.crew ? ` · ${j.crew.name}` : ""}` : "Not booked"} open={openKey === "build"}>
              <L k="Crew" v={j.crew ? `${j.crew.name}${j.crew.phone ? ` · ${j.crew.phone}` : ""}` : "Not booked"} />
              <L k="Materials" v={human(j.materials_status)} tone={j.materials_status === "delivered" ? "teal" : undefined} />
              <L k="Skip bin" v={human(j.dumpster_status)} />
              {j.delivery_type && <L k="Delivery" v={human(j.delivery_type)} />}
              {j.gate_code && <L k="Gate code" v={j.gate_code} />}
              {j.site_hazards && <L k="Hazards" v={j.site_hazards} tone="amber" />}
              {j.completed_at && <L k="Finished" v={dShort(j.completed_at)} tone="teal" />}
              <p className="mt-1.5 font-sans text-[12px]"><Link className="font-semibold text-brand-700" href={`${base}/production`}>Build page →</Link></p>
            </Fold>

            {canSeeMoney && (
              <Fold id="payments" title="Payments" summary={<span className={d.money.paid > 0 ? "text-teal-700" : ""}>{money(d.money.paid)} received</span>} open={openKey === "payments" || d.payments.length > 0}>
                {d.payments.map((p) => <div key={p.id} className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] gap-2 py-[2.5px]"><span className="text-slate-400">{d2(p.paid_on)}</span><span className="truncate text-ink">#{p.invoice_number} · {human(p.method)}</span><span className="tabular-nums text-ink">{num(p.amount)}</span></div>)}
                {d.invoices.filter((i) => i.balance > 0).map((i) => <div key={i.id} className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] gap-2 py-[2.5px] text-slate-300"><span>{i.due_date ? d2(i.due_date) : "—"}</span><span className="truncate">#{i.number} {i.label ?? human(i.kind)}{i.status === "draft" ? " · waiting" : " · due"}</span><span className="tabular-nums">{num(i.balance)}</span></div>)}
                {!d.payments.length && !d.invoices.length && <p className="font-sans text-[12px] text-slate-500">No invoices yet.</p>}
                {nextPart && <p className="mt-1.5 font-sans text-[12px]"><Link className="font-semibold text-brand-700" href={`/app/invoices/${nextPart.id}`}>Record a payment on #{nextPart.number} →</Link></p>}
              </Fold>
            )}

            {canSeeMoney && d.money.profit !== null && (
              <Fold id="profit" title="Profit" summary={<span className={d.money.profit >= 0 ? "text-teal-700" : "text-red-700"}>{money(d.money.profit)}{d.money.margin !== null ? ` · ${d.money.margin}%` : ""}</span>}>
                {d.costs.byCategory.map((c) => <L key={c.category} k={human(c.category)} v={num(c.amount)} />)}
                <div className="border-t border-slate-200 pt-1"><L k="Costs" v={num(d.costs.total)} /><L k="Sell ex GST" v={num(quote!.total - quote!.gst)} /><L k="Profit" v={`${money(d.money.profit)}${d.money.margin !== null ? ` · ${d.money.margin}%` : ""}`} strong tone={d.money.profit >= 0 ? "teal" : "red"} /></div>
                <p className="mt-1.5 font-sans text-[12px]"><Link className="font-semibold text-brand-700" href={`${base}/costs`}>Job cost →</Link></p>
              </Fold>
            )}

            <Fold id="notes" title="Notes" summary={`${d.notes.length} note${d.notes.length === 1 ? "" : "s"}${d.messages.length ? ` · ${d.messages.length} message${d.messages.length === 1 ? "" : "s"}` : ""}`}>
              <div className="space-y-1.5 font-sans text-[12px]">
                {d.notes.map((n) => <p key={n.id} className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-950"><b>{n.by ?? "Note"} · {dShort(n.at)}</b> {n.body}</p>)}
                {d.messages.map((x) => <p key={x.id} className={cx("rounded-2xl px-3 py-1.5", x.direction === "inbound" ? "mr-6 rounded-bl-sm bg-slate-100 text-ink" : "ml-6 rounded-br-sm bg-brand-500 text-white")}><b className={x.direction === "inbound" ? "text-slate-500" : "text-brand-200"}>{x.direction === "inbound" ? d.customer.name.split(" ")[0] : `You · ${x.channel}`} · {dShort(x.at)}</b> {x.body.length > 160 ? `${x.body.slice(0, 160)}…` : x.body}</p>)}
                <ActionForm action={addNote}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <div className="flex gap-1.5"><input name="body" placeholder="Add a note…" aria-label="Add a note" className="min-h-10 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-[13px] ring-1 ring-inset ring-slate-300" /><SubmitButton variant="secondary" className="min-h-10 px-3 text-xs">Save</SubmitButton></div>
                </ActionForm>
              </div>
            </Fold>

            {d.compliance && (
              <Fold id="compliance" title="Compliance" summary={d.compliance.done >= d.compliance.total ? <Stamp>all ✓</Stamp> : `${d.compliance.done} of ${d.compliance.total} done`}>
                <L k="State" v={d.compliance.state ?? "—"} /><L k="Licence on documents" v={d.compliance.licence ?? "Add it in Settings"} tone={d.compliance.licence ? undefined : "amber"} />
                <p className="mt-1.5 font-sans text-[12px]"><Link className="font-semibold text-brand-700" href={`${base}/compliance`}>Checklist →</Link></p>
              </Fold>
            )}
          </div>

          {canSeeMoney && d.money.contract !== null && (
            <div className="mt-1 border-t-2 border-ink pt-2 font-sans"><div className="flex items-baseline justify-between"><span className="font-display font-bold text-ink">Owing</span><span className="font-display text-2xl font-bold tabular-nums text-ink">{money(d.money.owing)}</span></div></div>
          )}
        </div>
        <svg viewBox="0 0 400 12" preserveAspectRatio="none" className="block h-3 w-full" aria-hidden><path d={`M0 0 ${Array.from({ length: 20 }, (_, i) => `L${i * 20 + 10} 11 L${i * 20 + 20} 0`).join(" ")} Z`} fill="#fff" /></svg>
        <div className="h-4" />
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
        {tel && <a href={tel} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50"><Icon d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />Call</a>}
        {sms && <a href={sms} className="inline-flex min-h-11 items-center rounded-xl bg-white px-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Text</a>}
        <Link href={d.next.href} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">{d.next.actionLabel}</Link>
      </div>
    </div>
  );
}
