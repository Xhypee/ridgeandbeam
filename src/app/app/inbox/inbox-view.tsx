// Inbox: one conversation per email thread, shown as a chat. Every bubble carries a dashed "email stub" (envelope,
// subject, time, Sent / Replied) so it's clear these are emails, and tapping a bubble opens the whole email:
// from / to, the full text with signature, attachments, and the quoted history.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx, Input, Textarea } from "@/components/ui";
import { splitQuoted } from "@/lib/gmail-mime";
import { fileSize, initials, replySubject, stubStatus, type MailRow, type Thread } from "@/lib/inbox";
import { checkMail, newEmail, replyEmail } from "./actions";

const lab = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400";
const TZ = { timeZone: "Australia/Sydney" } as const;
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const CLIP = "M15 7l-6.5 6.5a2 2 0 003 3L18 10a4 4 0 00-6-6l-6.5 6.5a6 6 0 008.5 8.5L20 13";
const UP = "M6 15l6-6 6 6";
const I = ({ d, className = "h-3.5 w-3.5" }: { d: string; className?: string }) => <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { ...TZ, weekday: "short", day: "numeric", month: "short" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { ...TZ, hour: "numeric", minute: "2-digit" });
const when = (iso: string, now: Date) => (new Date(iso).toLocaleDateString("en-AU", TZ) === now.toLocaleDateString("en-AU", TZ) ? timeOf(iso) : new Date(iso).toLocaleDateString("en-AU", { ...TZ, day: "numeric", month: "short" }));
const addr = (s: string | null) => s ?? "";

export type MailboxState = { configured: boolean; connected: boolean; broken: boolean; email: string | null; lastChecked: string | null; canConnect: boolean };

/** One email as a chat bubble with its stub; tap to open the full email. */
function Bubble({ m, t, box }: { m: MailRow; t: Thread; box: MailboxState }) {
  const mine = m.direction === "outbound";
  const failed = mine && ["failed", "not_configured"].includes(m.status);
  const full = m.full_body ?? m.body;
  const { main, quoted } = splitQuoted(full);
  const files = m.attachments ?? [];
  const short = (m.body || (files.length ? "" : "(no text)")).replace(/\n\s*\n+/g, "\n").trim(); // blank lines take too much room in a bubble
  return (
    <details className={cx("group/mail max-w-[78%] open:w-[78%] open:overflow-hidden open:rounded-2xl open:bg-white open:ring-2 open:ring-ink", mine ? "self-end" : "self-start")} data-message={m.direction}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className={cx("rounded-2xl group-open/mail:hidden", mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-slate-100 text-ink", failed && "ring-2 ring-red-400")}>
        {short && <p className="line-clamp-[9] whitespace-pre-wrap px-4 pt-3 text-[14px] leading-relaxed [overflow-wrap:anywhere]">{short}</p>}
        {files.length > 0 && <p className={cx("flex flex-wrap gap-x-3 px-4 pt-2 font-mono text-[11.5px]", mine ? "text-white/80" : "text-slate-600")}>{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1"><I d={CLIP} className="h-3 w-3" />{f.name}</span>)}</p>}
        <div className={cx("mx-3 mt-2.5 border-t-2 border-dashed", mine ? "border-white/25" : "border-slate-300")} />
        <div className={cx("flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-wider", mine ? "text-white/65" : "text-slate-500")} data-stub>
          <I d={MAIL} className="h-3 w-3" /><span className="truncate">{m.subject ?? t.subject}</span>
          <span className={cx("ml-auto shrink-0", failed && "font-semibold text-red-300")}>{timeOf(m.created_at)} · {stubStatus(m, t.messages)}</span>
        </div>
        </div>
        <div className="hidden items-center gap-2 bg-slate-100 px-4 py-2.5 group-open/mail:flex" title="Close">
          <I d={MAIL} /><span className="min-w-0 flex-1 font-display text-[14px] font-bold leading-snug text-ink">{m.subject ?? t.subject}</span>
          <span className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 ring-1 ring-slate-300" aria-label="Close"><I d={UP} /></span>
        </div>
      </summary>

      <div data-mail-open>
        <div className="space-y-0.5 border-b-2 border-dashed border-slate-200 px-4 py-2 font-mono text-[11px] text-slate-500">
          <p className="[overflow-wrap:anywhere]">From {mine ? (box.email ?? addr(m.from_address)) || "you" : addr(m.from_address)}</p>
          <p className="[overflow-wrap:anywhere]">To {addr(m.to_address)} · {dayOf(m.created_at)}, {timeOf(m.created_at)}</p>
          {mine && <p>{stubStatus(m, t.messages)}</p>}
        </div>
        <div className="whitespace-pre-wrap px-4 py-3 text-[14px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{main || "(no text)"}</div>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {files.map((f, i) => {
              const can = Boolean(f.id);
              const inner = <><I d={CLIP} /><span className="max-w-[220px] truncate">{f.name}</span>{f.size ? <span className="text-slate-400">{fileSize(f.size)}</span> : null}</>;
              return can
                ? <a key={i} href={`/api/inbox/attachment?m=${m.id}&a=${i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-cream px-2.5 py-2 font-mono text-[11px] text-ink ring-1 ring-slate-300 hover:bg-white">{inner}</a>
                : <span key={i} className="inline-flex items-center gap-2 rounded-lg bg-cream px-2.5 py-2 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">{inner}</span>;
            })}
          </div>
        )}
        {quoted && (
          <details className="border-t-2 border-dashed border-slate-200">
            <summary className="cursor-pointer list-none px-4 py-2 font-mono text-[11px] text-slate-500 [&::-webkit-details-marker]:hidden">▸ Show the quoted email</summary>
            <div className="whitespace-pre-wrap px-4 pb-3 font-mono text-[11.5px] leading-relaxed text-slate-500 [overflow-wrap:anywhere]">{quoted}</div>
          </details>
        )}
      </div>
    </details>
  );
}

export function InboxView({ threads, open, compose, filter, box, now = new Date() }: { threads: Thread[]; open: Thread | null; compose: { to?: string; job?: string } | null; filter: "all" | "unread" | "contacts"; box: MailboxState; now?: Date }) {
  const shown = filter === "unread" ? threads.filter((t) => t.unread) : filter === "contacts" ? threads.filter((t) => t.customerId) : threads;
  const unread = threads.filter((t) => t.unread).length;
  const q = filter !== "all" ? `&f=${filter}` : "";
  return (
    <div data-inbox>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className={lab}>{box.connected ? `Gmail · ${box.email}` : "Email"}</p>
          <h1 className="font-display text-[26px] font-bold leading-tight text-ink">Inbox{unread ? <span className="ml-2 align-middle font-mono text-[13px] font-semibold text-slate-500">{unread} unread</span> : null}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {box.connected && <ActionForm action={checkMail} className="flex items-center gap-2"><SubmitButton variant="secondary" className="min-h-10">Check now</SubmitButton></ActionForm>}
          <Link href="/app/inbox?compose=1" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white" data-compose><I d={MAIL} />New email</Link>
        </div>
      </div>

      {!box.connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[22px] bg-cream p-4 ring-1 ring-slate-200" data-gmail-banner>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-slate-300"><I d={MAIL} className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold text-ink">{box.broken ? "Gmail needs reconnecting" : "Connect your Gmail"}</p>
            <p className="font-mono text-[11.5px] text-slate-500">{box.broken ? "Google stopped the connection (password change or access removed). Emails are going out from the app's address meanwhile." : "Send from your own address and see every email here. Ones with your contacts land on the right job."}</p>
          </div>
          {box.canConnect && box.configured
            ? <a href="/api/integrations/gmail/connect" className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">{box.broken ? "Reconnect" : "Connect Gmail"}</a>
            : <span className="font-mono text-[11px] text-slate-500">{box.configured ? "Ask an owner or admin to connect it" : "Not set up on this server yet"}</span>}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={cx("min-w-0", (open || compose) && "hidden lg:block")} aria-label="Email threads">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(["all", "unread", "contacts"] as const).map((f) => (
              <Link key={f} href={f === "all" ? "/app/inbox" : `/app/inbox?f=${f}`} data-filter={f} className={cx("rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider", filter === f ? "bg-ink text-white" : "text-slate-600 ring-1 ring-slate-300")}>{f === "all" ? `All · ${threads.length}` : f === "unread" ? `Unread · ${unread}` : `Contacts · ${threads.filter((t) => t.customerId).length}`}</Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-[22px] p-6 text-center font-mono text-[12px] text-slate-500 ring-1 ring-slate-200">{filter === "unread" ? "Nothing unread." : filter === "contacts" ? "No emails with your contacts yet." : box.connected ? "No emails yet." : "Emails you send to customers show up here."}</p>
          ) : (
            <ul className="overflow-hidden rounded-[22px] ring-1 ring-slate-200">
              {shown.map((t) => (
                <li key={t.key} className="border-b-2 border-dashed border-slate-200 last:border-0">
                  <Link href={`/app/inbox?t=${encodeURIComponent(t.key)}${q}`} data-thread={t.key} aria-current={open?.key === t.key ? "true" : undefined}
                    className={cx("flex gap-3 px-3.5 py-3", open?.key === t.key ? "bg-slate-100" : "bg-white hover:bg-slate-50")}>
                    <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[12.5px] font-bold ring-1", t.unread ? "bg-ink text-white ring-ink" : "bg-cream text-ink ring-slate-300")}>{initials(t.who)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cx("min-w-0 flex-1 truncate font-display text-[14px] leading-snug text-ink", t.unread ? "font-bold" : "font-semibold")}>{t.subject}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">{when(t.last.created_at, now)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-slate-500"><I d={MAIL} className="h-3 w-3" /><span className="truncate">{t.who}{t.count > 1 ? ` · ${t.count} emails` : ""}</span></span>
                      <span className={cx("mt-0.5 block truncate text-[12.5px]", t.unread ? "font-semibold text-ink" : "text-slate-600")}>{t.last.direction === "outbound" ? "You: " : ""}{(t.last.body || (t.last.attachments?.length ? `📎 ${t.last.attachments[0].name}` : "")).replace(/\s+/g, " ").slice(0, 90)}</span>
                      {t.jobTitle && <span className="mt-1 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 ring-1 ring-slate-300">{t.jobTitle}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cx("min-w-0", !(open || compose) && "hidden lg:block")} aria-label={compose ? "New email" : "Email thread"}>
          {compose ? (
            <div className="rounded-[22px] p-5 ring-1 ring-slate-200" data-compose-form>
              <Link href="/app/inbox" className="mb-2 inline-block font-mono text-[11px] uppercase tracking-wider text-slate-500 lg:hidden">← Inbox</Link>
              <h2 className="flex items-center gap-2 border-b-2 border-ink pb-2 font-display text-[18px] font-bold text-ink"><I d={MAIL} className="h-4 w-4" />New email</h2>
              <ActionForm action={newEmail} className="mt-3 space-y-3">
                {compose.job && <input type="hidden" name="job" value={compose.job} />}
                <label className="block"><span className={lab}>To</span><Input name="to" type="email" defaultValue={compose.to ?? ""} required placeholder="customer@example.com" className="mt-1" /></label>
                <label className="block"><span className={lab}>Subject</span><Input name="subject" required className="mt-1" /></label>
                <label className="block"><span className={lab}>Message</span><Textarea name="body" rows={10} required className="mt-1" /></label>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-slate-500">{box.connected ? `From ${box.email}` : "From the app's address"}</span>
                  <SubmitButton className="min-h-11">Send email</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : open ? (
            <div className="flex flex-col rounded-[22px] ring-1 ring-slate-200" data-conversation>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink px-5 pb-3 pt-4">
                <div className="min-w-0">
                  <Link href={`/app/inbox${filter !== "all" ? `?f=${filter}` : ""}`} className="mb-2 inline-block font-mono text-[11px] uppercase tracking-wider text-slate-500 lg:hidden">← Inbox</Link>
                  <h2 className="flex items-start gap-2 font-display text-[19px] font-bold leading-snug text-ink"><I d={MAIL} className="mt-1.5 h-4 w-4" />{open.subject}</h2>
                  <p className="mt-0.5 font-mono text-[11.5px] text-slate-500 [overflow-wrap:anywhere]">{open.who}{open.email && open.email !== open.who ? ` · ${open.email}` : ""} · {open.count} email{open.count === 1 ? "" : "s"}</p>
                </div>
                {open.jobId && <Link href={`/app/jobs?job=${open.jobId}`} className="inline-flex min-h-9 items-center rounded-xl px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink ring-1 ring-slate-300">{open.jobTitle ?? "Open job"} →</Link>}
              </div>
              <div className="flex flex-col gap-3 px-4 py-4">
                {open.messages.map((m, i) => (
                  <div key={m.id} className="contents">
                    {(i === 0 || dayOf(m.created_at) !== dayOf(open.messages[i - 1].created_at)) && <p className="text-center font-mono text-[10.5px] uppercase tracking-wider text-slate-400">{dayOf(m.created_at)}</p>}
                    <Bubble m={m} t={open} box={box} />
                  </div>
                ))}
                <p className="text-center font-mono text-[10.5px] text-slate-400">Tap an email to open it in full</p>
              </div>
              <ActionForm action={replyEmail} className="border-t-2 border-ink p-3">
                <input type="hidden" name="thread" value={open.key} />
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 rounded-xl ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-ink">
                    <Textarea name="body" rows={2} required aria-label={`Email ${open.who.split(" ")[0]}`} placeholder={`Email ${open.who.split(" ")[0]}…`} className="border-0 ring-0 focus:ring-0" />
                    <p className="flex items-center gap-1.5 border-t-2 border-dashed border-slate-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 [overflow-wrap:anywhere]"><I d={MAIL} className="h-3 w-3" /><span className="min-w-0 truncate">{replySubject(open.last.subject ?? open.subject)}</span><span className="hidden shrink-0 sm:inline">· to {open.email ?? "them"}{box.connected ? ` · from ${box.email}` : ""}</span></p>
                  </div>
                  <SubmitButton className="min-h-11 shrink-0">Send email</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : (
            <p className="grid min-h-60 place-items-center rounded-[22px] font-mono text-[12px] text-slate-400 ring-1 ring-dashed ring-slate-300">Pick an email thread</p>
          )}
        </section>
      </div>
    </div>
  );
}
