// Delete job, at the bottom of the job sidebar: a red button that opens a confirm panel. Jobs with a sent invoice
// or money received can't be deleted (those are tax records).
import { ActionForm, SubmitButton } from "@/components/action-form";
import { deleteJobForGood } from "./lead-actions";

export function JobDelete({ jobId, name, blocked, hasQuote, hasInvoices, onlyJob }: { jobId: string; name: string; blocked: "paid" | "invoiced" | null; hasQuote: boolean; hasInvoices: boolean; onlyJob: boolean }) {
  return (
    <details className="group/del mt-4 border-t-2 border-dashed border-slate-200 pt-4" data-delete-job>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-white font-mono text-xs font-semibold uppercase tracking-wider text-red-700 ring-1 ring-red-300 hover:bg-red-50 group-open/del:bg-red-50 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        Delete job
      </summary>
      {blocked ? (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-700 ring-1 ring-slate-200" data-delete-blocked={blocked}>
          {blocked === "paid" ? <>Money has been received on this job, so it can&rsquo;t be deleted (the payments are tax records).</> : <>An invoice has been sent on this job, so it can&rsquo;t be deleted (sent invoices are tax records). Void the invoice first if it was a mistake.</>}{" "}Use <b>Not going ahead</b> to close it instead.
        </p>
      ) : (
        <ActionForm action={deleteJobForGood} className="mt-2 rounded-xl bg-red-50 p-3.5 ring-1 ring-red-200">
          <input type="hidden" name="job_id" value={jobId} />
          <p className="text-sm font-semibold text-red-800">Delete {name.split(" ")[0] || name}&rsquo;s job for good?</p>
          <p className="mt-0.5 text-[13px] text-red-700">The job, {hasQuote ? "its quote, " : ""}{hasInvoices ? "draft invoices, " : ""}notes, plans, photos and messages all go. This can&rsquo;t be undone.</p>
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-red-800"><input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-600" />I understand it can&rsquo;t be undone</label>
          {onlyJob && (
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-red-800"><input type="checkbox" name="remove_contact" className="h-4 w-4 accent-red-600" />Also delete {name} from Contacts</label>
          )}
          <SubmitButton variant="destroy" className="mt-3 min-h-11 w-full">Delete job for good</SubmitButton>
        </ActionForm>
      )}
    </details>
  );
}
