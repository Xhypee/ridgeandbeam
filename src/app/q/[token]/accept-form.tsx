"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignaturePad } from "@/components/signature-pad";
import { Input, cx } from "@/components/ui";
import { money } from "@/lib/format";
import { acceptEstimate } from "./actions";
import type { OptionView } from "./model";

type Props = {
  token: string;
  orgName: string;
  options: OptionView[];
  word: string;
  total: number;
  financingNote: string | null;
  gstCharged: boolean;
};

export function OptionCards({ options, selected, onSelect, word, financingNote, gstCharged = true }: {
  options: OptionView[];
  selected: string | null;
  onSelect?: (id: string) => void;
  word: string;
  financingNote: string | null;
  gstCharged?: boolean;
}) {
  return (
    <div className={cx("grid gap-4", options.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")} role={onSelect ? "radiogroup" : undefined} aria-label={`Choose an ${word}`}>
      {options.map((o) => {
        const isSel = selected === o.id;
        return (
          <label
            key={o.id}
            data-testid="public-option"
            className={cx(
              "relative flex flex-col rounded-2xl bg-white p-5 ring-1 transition print:break-inside-avoid",
              onSelect && "cursor-pointer hover:ring-brand-500",
              isSel ? "ring-2 ring-brand-500" : o.recommended ? "ring-2 ring-brand-100" : "ring-slate-200",
            )}
          >
            {o.recommended && (
              <span className="absolute -top-3 left-5 rounded-full bg-brand-500 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">Recommended</span>
            )}
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold text-slate-900">{o.name}</p>
              {onSelect && (
                <input type="radio" name="option_pick" value={o.id} checked={isSel} onChange={() => onSelect(o.id)} className="mt-1 h-6 w-6 shrink-0 accent-brand-500" aria-label={`Choose ${o.name}`} />
              )}
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{money(o.total)}</p>
            {gstCharged && <p className="text-xs text-slate-500">Includes GST of {money(o.gst)}</p>}
            {o.monthly > 0 && <p className="text-sm font-medium text-brand-700">about {money(o.monthly)} per month{financingNote ? "*" : ""}</p>}
            {o.description && <p className="mt-3 text-sm text-slate-600">{o.description}</p>}
            {o.items.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {o.items.map((i, k) => <li key={k} className="flex gap-2"><span className="text-brand-500">✓</span><span>{i.description}</span></li>)}
              </ul>
            )}
            {o.warranty && <p className="mt-auto pt-4 text-sm"><span className="font-medium text-slate-900">Warranty:</span> <span className="text-slate-600">{o.warranty}</span></p>}
          </label>
        );
      })}
    </div>
  );
}

/** Homeowner picks an option, draws a signature, types their name and agrees. */
export function AcceptForm({ token, orgName, options, word, total, financingNote, gstCharged }: Props) {
  const rec = options.find((o) => o.recommended)?.id ?? options[0]?.id ?? null;
  const [selected, setSelected] = useState<string | null>(rec);
  const chosen = options.find((o) => o.id === selected);
  const shownTotal = chosen ? chosen.total : total;
  return (
    <div className="space-y-6">
      {options.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose your {word}</h2>
          <p className="mb-5 text-sm text-slate-500">Tap the one you want. Everything in “Included with every {word}” comes with each.</p>
          <OptionCards options={options} selected={selected} onSelect={setSelected} word={word} financingNote={financingNote} gstCharged={gstCharged} />
          {financingNote && <p className="mt-3 text-xs text-slate-500">* {financingNote}</p>}
        </section>
      )}
      <section className="no-print rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <h2 className="text-lg font-semibold">Accept and sign</h2>
        <p className="mb-4 text-sm text-slate-500">
          {chosen ? <>You&apos;re accepting <b className="text-slate-800">{chosen.name}</b> for <b className="text-slate-800">{money(shownTotal)}</b>{gstCharged ? " inc GST" : ""}.</> : <>Total <b className="text-slate-800">{money(shownTotal)}</b>{gstCharged ? " inc GST" : ""}.</>}
          {" "}Draw your signature, type your name, and tap Accept.
        </p>
        <ActionForm action={acceptEstimate} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="option_id" value={selected ?? ""} />
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Signature</p>
            <SignaturePad name="signature" required />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Your full name</span>
            <Input name="name" placeholder="Your full name" autoComplete="name" required className="max-w-sm py-3 text-base" />
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" name="agree" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" required />
            <span>I accept this quote and authorise {orgName} to do the work described{chosen ? ` in ${chosen.name}` : ""} for {money(shownTotal)}{gstCharged ? " (including GST)" : ""}, on the terms above.</span>
          </label>
          <SubmitButton className="min-h-12 w-full px-6 text-base sm:w-auto">Accept & sign</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
