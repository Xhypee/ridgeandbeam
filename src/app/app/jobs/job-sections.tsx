// Contact · Notes · Documents: the same three sections on every stage's sidebar (New leads, Sold, Building).
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket, LeadDoc } from "@/lib/job-docket-server";
import { addNote } from "./actions";

export const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6";
const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const PIN = "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5";

export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details open className="group border-t border-slate-100" data-lead-section={title}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-ink">{title}</span>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{count}</span>}
        <Icon d="M6 9l6 6 6-6" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

function ContactRow({ icon, label, value, children }: { icon: string; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream text-slate-600 ring-1 ring-slate-200"><Icon d={icon} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] text-slate-500">{label}</span><span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{value}</span></span>
      {children}
    </div>
  );
}
const iconBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50";

/** "Problem: Water in the kitchen\nRoof: Tile" → labelled lines; anything else stays a paragraph. */
export function noteFacts(body: string): [string, string][] | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const facts = lines.map((l) => /^([A-Za-z][\w &'/()-]{0,24}):\s+(.+)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m)).map((m) => [m[1], m[2]] as [string, string]);
  return facts.length >= 2 && facts.length === lines.length ? facts : null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });
const sizeText = (n: number | null) => (n === null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function NoteCard({ by, at, body, tone }: { by: string; at: string | null; body: string; tone: "lead" | "team" }) {
  const facts = noteFacts(body);
  return (
    <li className={cx("rounded-xl px-3 py-2.5 text-sm", tone === "lead" ? "bg-slate-50 ring-1 ring-slate-200" : "bg-amber-50")} data-note>
      <p className="text-xs font-semibold text-slate-600">{by}{at && <> · <span className="font-normal">{when(at)}</span></>}</p>
      {facts ? (
        <dl className="mt-1.5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
          {facts.map(([k, v], i) => [<dt key={`k${i}`} className="text-slate-500">{k}</dt>, <dd key={`v${i}`} className="text-ink [overflow-wrap:anywhere]">{v}</dd>])}
        </dl>
      ) : <p className="mt-1 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{body}</p>}
    </li>
  );
}


export function JobContact({ d }: { d: Docket }) {
  const c = d.customer;
  const phone = c.phone?.replace(/\s+/g, "");
  const site = d.job.site_address ?? c.address;
  const maps = site ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site)}` : null;
  return (
    <>
      <Section title="Contact">
        <ContactRow icon={PHONE} label="Mobile" value={c.phone ?? <span className="text-slate-400">No number</span>}>
          {phone && <span className="flex gap-1.5">
            <a href={`sms:${phone}`} aria-label={`Text ${c.name}`} title="Text" className={iconBtn}><Icon d="M4 5h16v11H9l-5 4z" /></a>
            <a href={`tel:${phone}`} aria-label={`Call ${c.name}`} title="Call" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"><Icon d={PHONE} /></a>
          </span>}
        </ContactRow>
        <ContactRow icon={MAIL} label="Email" value={c.email ?? <Link href={`/app/customers/${c.id}`} className="font-semibold text-brand-700">Add email</Link>}>
          {c.email && <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} title="Email" className={iconBtn}><Icon d="M5 12h14M13 6l6 6-6 6" /></a>}
        </ContactRow>
        <ContactRow icon={PIN} label="Site" value={site ?? <span className="text-slate-400">No address yet</span>}>
          {maps && <a href={maps} target="_blank" rel="noreferrer" aria-label="Open in Google Maps" title="Open in Google Maps" className={iconBtn}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" fill="#ea4335" /><circle cx="12" cy="9" r="2.6" fill="#fff" /></svg>
          </a>}
        </ContactRow>
      </Section>

    </>
  );
}

/** Notes: what the lead sent (new leads), then the team's notes, newest first, and a box to add one. */
export function JobNotes({ d, leadNote }: { d: Docket; leadNote?: { by: string; at: string | null; body: string } | null }) {
  const notesCount = d.notes.length + (leadNote ? 1 : 0);
  return (
    <>
      <Section title="Notes" count={notesCount}>
        {notesCount > 0 && (
          <ul className="space-y-2">
            {leadNote && <NoteCard by={leadNote.by} at={leadNote.at} body={leadNote.body} tone="lead" />}
            {d.notes.map((n) => <NoteCard key={n.id} by={n.by ?? "Team"} at={n.at} body={n.body} tone="team" />)}
          </ul>
        )}
        <ActionForm action={addNote} className="mt-2">
          <input type="hidden" name="job_id" value={d.job.id} />
          <div className="flex gap-2">
            <input name="body" aria-label="Add a note" placeholder="Add a note…" className="min-h-10 min-w-0 flex-1 rounded-lg px-3 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <SubmitButton variant="secondary" className="min-h-10 px-3 text-sm">Add</SubmitButton>
          </div>
        </ActionForm>
      </Section>

    </>
  );
}

/** Documents: every document on the job (quote, plans, supplier invoices…), each to preview or download. */
export function JobDocuments({ jobId, docs, meta }: { jobId: string; docs: LeadDoc[]; meta?: Record<string, { meta: string; paid: boolean }> }) {
  return (
    <>
      <Section title="Documents" count={docs.length}>
        {docs.length ? (
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {docs.map((f) => {
              const pdf = f.mime === "application/pdf" || /\.pdf$/i.test(f.name);
              return (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2.5" data-lead-doc>
                  <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", pdf ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600")}>
                    {pdf ? <span className="text-[9px] font-bold">PDF</span> : <Icon d="M6 3h8l4 4v14H6zM14 3v4h4" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{f.name}</span><span className={cx("block truncate text-xs", meta?.[f.id]?.paid ? "font-medium text-brand-700" : "text-slate-500")} data-doc-meta>{meta?.[f.id]?.meta ?? [sizeText(f.size), new Date(f.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")}</span></span>
                  {f.viewUrl && <a href={f.viewUrl} target="_blank" rel="noreferrer" title="Preview" aria-label={`Preview ${f.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"><Icon d={EYE} /></a>}
                  {f.downloadUrl && <a href={f.downloadUrl} title="Download" aria-label={`Download ${f.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"><Icon d="M12 4v11M7 10l5 5 5-5M5 20h14" /></a>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-slate-500">Nothing yet. <Link href={`/app/jobs/${jobId}/files`} className="font-semibold text-brand-700">Add plans or documents</Link></p>}
      </Section>

    </>
  );
}
