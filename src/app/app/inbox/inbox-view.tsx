// Inbox: conversations with customers on the left, the open one on the right with a reply box (receipt style).
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx, Input, Textarea } from "@/components/ui";
import type { Thread } from "@/lib/inbox";
import { checkMail, newEmail, replyEmail } from "./actions";

const lab = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-400";
const when = (iso: string, now: Date) => {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Australia/Sydney" };
  const same = d.toLocaleDateString("en-AU", opts) === now.toLocaleDateString("en-AU", opts);
  return same ? d.toLocaleTimeString("en-AU", { ...opts, hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-AU", { ...opts, day: "numeric", month: "short" });
};
const full = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export type MailboxState = { configured: boolean; connected: boolean; broken: boolean; email: string | null; lastChecked: string | null; canConnect: boolean };

export function InboxView({ threads, open, compose, filter, box, now = new Date() }: { threads: Thread[]; open: Thread | null; compose: { to?: string; job?: string } | null; filter: "all" | "unread" | "contacts"; box: MailboxState; now?: Date }) {
  const shown = filter === "unread" ? threads.filter((t) => t.unread) : filter === "contacts" ? threads.filter((t) => t.customerId) : threads;
  const unread = threads.filter((t) => t.unread).length;
  return (
    <div data-inbox>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className={lab}>{box.connected ? `Gmail · ${box.email}` : "Email"}</p>
          <h1 className="font-display text-[26px] font-bold leading-tight text-ink">Inbox{unread ? <span className="ml-2 align-middle font-mono text-[13px] font-semibold text-slate-500">{unread} unread</span> : null}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {box.connected && <ActionForm action={checkMail} className="flex items-center gap-2"><SubmitButton variant="secondary" className="min-h-10">Check now</SubmitButton></ActionForm>}
          <Link href="/app/inbox?compose=1" className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white" data-compose>New email</Link>
        </div>
      </div>

      {!box.connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[22px] bg-cream p-4 ring-1 ring-slate-200" data-gmail-banner>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-slate-300"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold text-ink">{box.broken ? "Gmail needs reconnecting" : "Connect your Gmail"}</p>
            <p className="font-mono text-[11.5px] text-slate-500">{box.broken ? "Google stopped the connection (password change or access removed). Emails are going out from the app's address meanwhile." : "Send from your own address and see every email here. Ones with your contacts land on the right job."}</p>
          </div>
          {box.canConnect && box.configured
            ? <a href="/api/integrations/gmail/connect" className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">{box.broken ? "Reconnect" : "Connect Gmail"}</a>
            : <span className="font-mono text-[11px] text-slate-500">{box.configured ? "Ask an owner or admin to connect it" : "Not set up on this server yet"}</span>}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className={cx("min-w-0", (open || compose) && "hidden lg:block")} aria-label="Conversations">
          <div className="mb-2 flex gap-1.5">
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
                  <Link href={`/app/inbox?t=${encodeURIComponent(t.key)}${filter !== "all" ? `&f=${filter}` : ""}`} data-thread={t.key} aria-current={open?.key === t.key ? "true" : undefined}
                    className={cx("flex gap-3 px-4 py-3", open?.key === t.key ? "bg-slate-100" : "bg-white hover:bg-slate-50")}>
                    <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.unread ? "bg-ink" : "bg-transparent")} aria-label={t.unread ? "Unread" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cx("min-w-0 flex-1 truncate font-display text-[14.5px] text-ink", t.unread ? "font-bold" : "font-semibold")}>{t.who}{t.count > 1 && <span className="ml-1 font-mono text-[11px] font-normal text-slate-400">{t.count}</span>}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">{when(t.last.created_at, now)}</span>
                      </span>
                      <span className={cx("block truncate text-[13px]", t.unread ? "font-semibold text-ink" : "text-slate-700")}>{t.subject}</span>
                      <span className="block truncate font-mono text-[11px] text-slate-500">{t.last.direction === "outbound" ? "You: " : ""}{t.last.body.replace(/\s+/g, " ").slice(0, 90)}</span>
                      {t.jobTitle && <span className="mt-1 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 ring-1 ring-slate-300">{t.jobTitle}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cx("min-w-0", !(open || compose) && "hidden lg:block")} aria-label={compose ? "New email" : "Conversation"}>
          {compose ? (
            <div className="rounded-[22px] p-5 ring-1 ring-slate-200" data-compose-form>
              <Link href="/app/inbox" className="mb-2 inline-block font-mono text-[11px] uppercase tracking-wider text-slate-500 lg:hidden">← Inbox</Link>
              <h2 className="border-b-2 border-ink pb-2 font-display text-[18px] font-bold text-ink">New email</h2>
              <ActionForm action={newEmail} className="mt-3 space-y-3">
                {compose.job && <input type="hidden" name="job" value={compose.job} />}
                <label className="block"><span className={lab}>To</span><Input name="to" type="email" defaultValue={compose.to ?? ""} required placeholder="customer@example.com" className="mt-1" /></label>
                <label className="block"><span className={lab}>Subject</span><Input name="subject" required className="mt-1" /></label>
                <label className="block"><span className={lab}>Message</span><Textarea name="body" rows={10} required className="mt-1" /></label>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-slate-500">{box.connected ? `From ${box.email}` : "From the app's address"}</span>
                  <SubmitButton className="min-h-11">Send</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : open ? (
            <div className="rounded-[22px] ring-1 ring-slate-200" data-conversation>
              <div className="border-b-2 border-ink px-5 pb-3 pt-4">
                <Link href="/app/inbox" className="mb-2 inline-block font-mono text-[11px] uppercase tracking-wider text-slate-500 lg:hidden">← Inbox</Link>
                <h2 className="font-display text-[19px] font-bold leading-snug text-ink">{open.subject}</h2>
                <p className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[11.5px] text-slate-500">
                  <span>{open.who}{open.email && open.email !== open.who ? ` · ${open.email}` : ""}</span>
                  {open.jobId && <Link href={`/app/jobs?job=${open.jobId}`} className="font-semibold text-ink underline underline-offset-2">{open.jobTitle ?? "Open job"} →</Link>}
                </p>
              </div>
              <ol className="divide-y-2 divide-dashed divide-slate-200 px-5">
                {open.messages.map((m) => {
                  const mine = m.direction === "outbound";
                  return (
                    <li key={m.id} className="py-4" data-message={m.direction}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-[14px] font-bold text-ink">{mine ? "You" : open.who}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">{full(m.created_at)}{mine && m.status !== "sent" ? ` · ${m.status.replace(/_/g, " ")}` : ""}</span>
                      </div>
                      <div className={cx("mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]", mine && m.body.length > 600 && "line-clamp-[8]")}>{m.body}</div>
                    </li>
                  );
                })}
              </ol>
              <ActionForm action={replyEmail} className="border-t-2 border-ink p-4">
                <input type="hidden" name="thread" value={open.key} />
                <label className={lab} htmlFor="reply">Reply to {open.who.split(" ")[0]}</label>
                <Textarea id="reply" name="body" rows={5} required className="mt-1" placeholder="Write your reply…" />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-slate-500">{box.connected ? `From ${box.email} · stays in the same Gmail thread` : "From the app's address"}</span>
                  <SubmitButton className="min-h-11">Send reply</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : (
            <p className="grid min-h-60 place-items-center rounded-[22px] font-mono text-[12px] text-slate-400 ring-1 ring-dashed ring-slate-300">Pick a conversation</p>
          )}
        </section>
      </div>
    </div>
  );
}
