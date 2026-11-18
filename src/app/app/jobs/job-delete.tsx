"use client";
// Delete job: a bin icon at the top right of the job sidebar, next to close. It opens a small confirm card under the
// header. Jobs with a sent invoice or money received can't be deleted (those are tax records).
import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import { deleteJobForGood } from "./lead-actions";

const BIN = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

export function JobDelete({ jobId, name, blocked, hasQuote, onlyJob }: { jobId: string; name: string; blocked: "paid" | "invoiced" | null; hasQuote: boolean; hasInvoices?: boolean; onlyJob: boolean }) {
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
            <div className="rounded-2xl bg-white p-4 font-sans ring-1 ring-slate-300" data-delete-blocked={blocked}>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">Can&rsquo;t delete</p>
              <p className="mt-1 text-[13px] leading-snug text-slate-600">
                {blocked === "paid" ? "Money has come in on this job, and payments are tax records." : "An invoice has been sent, and sent invoices are tax records. Void it first if it was a mistake."}{" "}Use <b className="text-ink">Not going ahead</b> to close it instead.
              </p>
            </div>
          ) : (
            <ActionForm action={deleteJobForGood} className="rounded-2xl bg-white p-4 font-sans ring-1 ring-slate-300">
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="confirm" value="on" />
              <p className="font-display text-[17px] font-bold leading-tight text-ink">Delete {name.split(" ")[0] || name}&rsquo;s job?</p>
              <p className="mt-1 text-[13px] leading-snug text-slate-500">{hasQuote ? "The quote, notes" : "Notes"}, plans and photos go with it. This can&rsquo;t be undone.</p>
              {onlyJob && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" name="remove_contact" className="h-4 w-4 accent-ink" />Also remove {name} from Contacts</label>
              )}
              <div className="mt-4 flex items-center justify-end gap-1">
                <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-ink">Cancel</button>
                <SubmitButton variant="destroy" className="h-10 px-5">Delete</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
