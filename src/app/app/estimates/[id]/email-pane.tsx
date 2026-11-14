"use client";
// The customer's email beside the quoting engine. The section matching the step being edited lights up and
// scrolls into view (the email carries data-rb markers). Reloads after each save land back on that section.
import { useCallback, useEffect, useRef } from "react";

export type EmailPreview = { html: string; subject: string; toName: string; toEmail: string | null; fromName: string };
const SECTION: Record<number, string | null> = { 1: null, 2: "who", 3: "job", 4: "price", 5: "payment", 6: "terms" };
const TITLE: Record<number, string> = { 1: "Roof plan", 2: "Who it's for", 3: "The job", 4: "Price", 5: "Payment", 6: "Terms" };
const GLOW = ["who", "job", "price", "payment", "terms"].map((k) => `body[data-rb-on="${k}"] [data-rb="${k}"]`).join(",");
const STYLE = `<style>[data-rb]{outline:3px solid transparent;outline-offset:6px;border-radius:14px;transition:outline-color .25s}${GLOW}{outline-color:#f2b705}</style>`;

export function EmailPane({ email, active }: { email: EmailPreview; active: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const sec = SECTION[active] ?? null;
  const first = email.toName.split(" ")[0] || "them";
  const html = email.html.includes("</head>") ? email.html.replace("</head>", `${STYLE}</head>`) : STYLE + email.html;

  const apply = useCallback((smooth: boolean) => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.dataset.rbOn = sec ?? "";
    const el = sec ? doc.querySelector(`[data-rb="${sec}"]`) : null;
    el?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  }, [sec]);
  useEffect(() => { apply(true); }, [apply]);

  return (
    <div className="flex h-full flex-col bg-white" data-quote-email-pane>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preview · updates as you type</p>
          <p className="font-display text-lg font-bold text-ink">What {first} will get</p>
        </div>
        {active > 0 && (sec
          ? <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-editing><span className="h-2 w-2 rounded-full bg-amber-500" />Editing: {TITLE[active]}</span>
          : <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600" data-editing>The roof plan isn&apos;t in the email</span>)}
      </div>
      <div className="space-y-0.5 border-b border-slate-100 px-5 py-2.5 text-[13px]">
        <p className="truncate"><span className="inline-block w-16 text-slate-500">From</span>{email.fromName}</p>
        <p className="truncate"><span className="inline-block w-16 text-slate-500">To</span>{email.toName}{email.toEmail ? ` <${email.toEmail}>` : <span className="font-semibold text-red-700"> · no email address yet</span>}</p>
        <p className="truncate"><span className="inline-block w-16 text-slate-500">Subject</span><b className="text-ink">{email.subject}</b></p>
      </div>
      {/* allow-same-origin (never scripts) so the pane can light up and scroll to the section being edited. */}
      <iframe ref={frame} title="Quote email preview" srcDoc={html} onLoad={() => apply(false)} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" className="min-h-0 w-full flex-1 bg-[#eef0ea]" />
    </div>
  );
}
