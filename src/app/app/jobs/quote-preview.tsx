// "What Priya will get": the quote email exactly as it will land in their inbox, with Send / Edit.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { sendQuoteEmail } from "./quote-actions";

export function QuotePreview({ html, subject, toName, toEmail, fromName, estimateId, closeHref, sent }: {
  html: string; subject: string; toName: string; toEmail: string | null; fromName: string; estimateId: string; closeHref: string; sent: boolean;
}) {
  const first = toName.split(" ")[0] || "them";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`Preview of the quote email to ${toName}`} data-quote-preview>
      <Link href={closeHref} scroll={false} aria-label="Close preview" className="absolute inset-0 cursor-default" />
      <div className="relative flex h-full max-h-[1000px] w-full max-w-[760px] flex-col overflow-hidden rounded-3xl bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Preview</p>
            <p className="font-display text-xl font-bold text-ink">What {first} will get</p>
          </div>
          <Link href={`/app/estimates/${estimateId}`} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50">Edit quote</Link>
          <ActionForm action={sendQuoteEmail}>
            <input type="hidden" name="estimate_id" value={estimateId} />
            <SubmitButton className="min-h-11 px-4 text-sm">{sent ? "Send again" : `Send to ${first}`}</SubmitButton>
          </ActionForm>
          <Link href={closeHref} scroll={false} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        </div>
        <div className="space-y-1 border-b border-slate-100 px-6 py-3 text-sm">
          <p className="truncate"><span className="inline-block w-16 text-slate-500">From</span>{fromName}</p>
          <p className="truncate"><span className="inline-block w-16 text-slate-500">To</span>{toName}{toEmail ? ` <${toEmail}>` : <span className="font-semibold text-red-700"> · no email address yet</span>}</p>
          <p className="truncate"><span className="inline-block w-16 text-slate-500">Subject</span><b className="text-ink">{subject}</b></p>
        </div>
        <iframe title="Quote email" srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="min-h-0 w-full flex-1 bg-[#eef0ea]" />
      </div>
    </div>
  );
}
