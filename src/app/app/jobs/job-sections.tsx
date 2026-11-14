// Contact · Notes · Documents: the same three sections on every stage's sidebar (New leads, Sold, Building).
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket, LeadDoc } from "@/lib/job-docket-server";
import { referrerHref } from "@/lib/referrals-server";
import { parseClaudeNote, type ClaudeNote } from "@/lib/claude-note";
import { addNote } from "./actions";
import { DocumentDrop } from "./document-drop";

export { EYE, Icon, Section } from "./job-section-ui";
import { EYE, Icon, Section } from "./job-section-ui";
import { ContactSection } from "./job-contact";

/** "Problem: Water in the kitchen\nRoof: Tile" → labelled lines; anything else stays a paragraph. */
export function noteFacts(body: string): [string, string][] | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const facts = lines.map((l) => /^([A-Za-z][\w &'/()-]{0,24}):\s+(.+)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m)).map((m) => [m[1], m[2]] as [string, string]);
  // Two or more labelled lines; or just "Needs: Re-roof (Full replacement)" from the New lead job cards.
  return (facts.length >= 2 || facts[0]?.[0] === "Needs") && facts.length === lines.length ? facts : null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });
const sizeText = (n: number | null) => (n === null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

const DOC = "M7 3h7l5 5v13H7zM14 3v5h5";
const TICK = "M5 12l5 5L20 7";

/** Claude's note after reading a file: the file, one line on what it is, then Added (ticks), Check (amber) and
 *  Details (small tags). */
function ClaudeNoteBody({ n }: { n: ClaudeNote }) {
  return (
    <div className="mt-1.5" data-claude-note>
      <div className="flex min-w-0 items-center gap-2">
        <Icon d={DOC} className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 truncate font-semibold text-ink" title={n.file}>{n.file}</span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{n.kind}</span>
      </div>
      {n.summary && <p className="mt-1 text-slate-600">{n.summary}</p>}
      {n.added.length > 0 && (
        <div className="mt-2.5" data-claude-added>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">Added</p>
          <ul className="mt-1 space-y-1">
            {n.added.map((t, i) => <li key={i} className="flex gap-2 text-ink"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Icon d={TICK} className="h-2.5 w-2.5" /></span><span className="[overflow-wrap:anywhere]">{t}</span></li>)}
          </ul>
        </div>
      )}
      {n.check.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-2" data-claude-check>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">Check</p>
          <ul className="mt-1 space-y-1">
            {n.check.map((t, i) => <li key={i} className="flex gap-2 text-amber-950"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">!</span><span className="[overflow-wrap:anywhere]">{t}</span></li>)}
          </ul>
        </div>
      )}
      {n.details.length > 0 && (
        <div className="mt-2.5" data-claude-details>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Details</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {n.details.map((t, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{t}</span>)}
          </div>
        </div>
      )}
      {n.nothing && <p className="mt-1 text-slate-500">Nothing new to add to the job.</p>}
    </div>
  );
}

export function NoteCard({ by, at, body, tone }: { by: string; at: string | null; body: string; tone: "lead" | "team" }) {
  const claude = parseClaudeNote(body);
  if (claude) {
    return (
      <li className="rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-slate-200" data-note>
        <p className="text-xs font-semibold text-slate-600">{by}{at && <> · <span className="font-normal">{when(at)}</span></>}</p>
        <ClaudeNoteBody n={claude} />
      </li>
    );
  }
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
  const r = d.job.referredBy;
  return <ContactSection jobId={d.job.id} customer={{ id: c.id, name: c.name, phone: c.phone, email: c.email }} site={d.job.site_address ?? c.address} state={d.job.state}
    referredBy={r ? { ...r, href: referrerHref(r) } : null} />;
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
        ) : null}
        <DocumentDrop jobId={jobId} />
      </Section>

    </>
  );
}
