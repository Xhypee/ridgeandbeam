"use client";
// Delete job: a bin icon at the top right of the job sidebar, next to close. It opens a small confirm card under the
// header. Jobs with a sent invoice or money received can't be deleted (those are tax records).
import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { deleteJobForGood } from "./lead-actions";

const BIN = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

export function JobDelete({ jobId, name, blocked, hasQuote, hasInvoices, onlyJob }: { jobId: string; name: string; blocked: "paid" | "invoiced" | null; hasQuote: boolean; hasInvoices: boolean; onlyJob: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="static" data-delete-job>
      <button type="button" onClick={() => setOpen(!open)} aria-label="Delete job" title="Delete job" aria-expanded={open}
        className={cx("-my-1 grid h-8 w-8 place-items-center rounded-lg hover:bg-red-50 hover:text-red-700", open ? "bg-red-50 text-red-700" : "text-slate-400")}>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={BIN} /></svg>
      </button>
      {open && (
        <div className="absolute inset-x-5 top-12 z-30 normal-case tracking-normal" data-delete-card>
          {blocked ? (
            <p className="rounded-xl bg-white p-3.5 font-sans text-[13px] text-slate-700 ring-1 ring-slate-300" data-delete-blocked={blocked}>
              {blocked === "paid" ? <>Money has been received on this job, so it can&rsquo;t be deleted (the payments are tax records).</> : <>An invoice has been sent on this job, so it can&rsquo;t be deleted (sent invoices are tax records). Void the invoice first if it was a mistake.</>}{" "}Use <b>Not going ahead</b> to close it instead.
            </p>
          ) : (
            <ActionForm action={deleteJobForGood} className="rounded-xl bg-red-50 p-3.5 font-sans ring-1 ring-red-300">
              <input type="hidden" name="job_id" value={jobId} />
              <p className="text-sm font-semibold text-red-800">Delete {name.split(" ")[0] || name}&rsquo;s job for good?</p>
              <p className="mt-0.5 text-[13px] text-red-700">The job, {hasQuote ? "its quote, " : ""}{hasInvoices ? "draft invoices, " : ""}notes, plans, photos and messages all go. This can&rsquo;t be undone.</p>
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-red-800"><input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-600" />I understand it can&rsquo;t be undone</label>
              {onlyJob && (
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-red-800"><input type="checkbox" name="remove_contact" className="h-4 w-4 accent-red-600" />Also delete {name} from Contacts</label>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="min-h-11 flex-1 rounded-xl bg-white font-mono text-xs font-semibold uppercase tracking-wider text-ink ring-1 ring-slate-300 hover:bg-slate-50">Keep it</button>
                <SubmitButton variant="destroy" className="min-h-11 flex-1">Delete for good</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
