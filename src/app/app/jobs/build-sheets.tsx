// The Building sidebar's two pop-ups, sliding up over the sidebar: what the customer gets when you request the
// next payment, and paying a supplier's invoice.
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requestPayment } from "./build-actions";
import { Icon } from "./job-sections";
export { SupplierPayForm } from "./supplier-pay-form";

const SEND = "M4 12l16-8-6 16-2.5-6.5z";

export function Sheet({ title, kicker, closeHref, children, footer, data }: { title: string; kicker: string; closeHref: string; children: ReactNode; footer: ReactNode; data: string }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" role="dialog" aria-modal="true" aria-label={title} data-sheet={data}>
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 cursor-default" />
      <div className="relative flex h-full w-full flex-col lg:w-[440px] xl:w-[460px] lg:p-4">
        <div className="mt-auto flex max-h-[94%] flex-col overflow-hidden rounded-t-[22px] bg-cream lg:rounded-[22px]">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{kicker}</p><p className="font-display text-xl font-bold leading-tight text-ink">{title}</p></div>
            <Link href={closeHref} scroll={false} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-ink"><Icon d="M6 6l12 12M18 6L6 18" className="h-5 w-5" /></Link>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

export function PaymentRequestSheet({ jobId, closeHref, title, asked, toEmail, toPhone, subject, html, sms }: {
  jobId: string; closeHref: string; title: string; asked: boolean; toEmail: string | null; toPhone: string | null; subject: string; html: string; sms: string;
}) {
  return (
    <Sheet data="request" kicker={asked ? "Remind about the payment" : "Request the next payment"} title={title} closeHref={closeHref}
      footer={
        <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <span className="min-w-0 flex-1 text-xs text-slate-500">{asked ? "Sends a reminder with the same pay link" : "Sends the tax invoice by email and text"}</span>
          <ActionForm action={requestPayment}><input type="hidden" name="job_id" value={jobId} /><input type="hidden" name="back" value={closeHref} /><SubmitButton className="min-h-12 gap-2 px-5"><Icon d={SEND} />{asked ? "Send reminder" : "Send request"}</SubmitButton></ActionForm>
        </div>
      }>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <div className="space-y-1 text-sm">
          <p className="[overflow-wrap:anywhere]"><span className="inline-block w-16 text-slate-500">To</span>{[toEmail, toPhone].filter(Boolean).join(" · ") || <span className="font-semibold text-red-700">no email or mobile yet</span>}</p>
          <p><span className="inline-block w-16 text-slate-500">Subject</span><b className="text-ink">{subject}</b></p>
        </div>
        <iframe title="Payment email" srcDoc={html} sandbox="" className="h-[440px] w-full rounded-2xl bg-[#eef0ea] ring-1 ring-slate-200" />
        <div className="rounded-xl bg-white px-3.5 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200"><p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Icon d="M4 5h16v11H9l-5 4z" className="h-3.5 w-3.5" />Text message</p><p className="[overflow-wrap:anywhere]">{sms}</p></div>
      </div>
    </Sheet>
  );
}
