"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignaturePad } from "@/components/signature-pad";
import { Input, cx } from "@/components/ui";
import { estimateTotals, itemsForOption } from "@/lib/estimate-totals";
import { money } from "@/lib/format";
import { acceptEstimate } from "./actions";
import { withChosen, type OptionView, type PublicItem } from "./model";

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

/** Draw a signature, type the name, agree, Accept. `extras` = ids of the offered extras the customer added. */
export function SignForm({ token, orgName, optionId, optionName, total, gstCharged, extras }: {
  token: string; orgName: string; optionId: string | null; optionName?: string | null; total: number; gstCharged: boolean; extras: string[];
}) {
  return (
    <section className="no-print rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6" data-testid="sign-form">
      <h2 className="text-lg font-semibold">Accept and sign</h2>
      <p className="mb-4 text-sm text-slate-500">
        {optionName ? <>You&apos;re accepting <b className="text-slate-800">{optionName}</b> for <b className="text-slate-800" data-testid="sign-total">{money(total)}</b>{gstCharged ? " inc GST" : ""}.</> : <>Total <b className="text-slate-800" data-testid="sign-total">{money(total)}</b>{gstCharged ? " inc GST" : ""}.</>}
        {" "}Draw your signature, type your name, and tap Accept.
      </p>
      <ActionForm action={acceptEstimate} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="option_id" value={optionId ?? ""} />
        <input type="hidden" name="extras" value={extras.join(",")} />
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
          <span>I accept this quote and authorise {orgName} to do the work described{optionName ? ` in ${optionName}` : ""} for {money(total)}{gstCharged ? " (including GST)" : ""}, on the terms above.</span>
        </label>
        <SubmitButton className="min-h-12 w-full px-6 text-base sm:w-auto">Accept & sign</SubmitButton>
      </ActionForm>
    </section>
  );
}

/** Homeowner picks an option (and any extras on offer), draws a signature, types their name and agrees. */
export function AcceptForm({ token, orgName, options, word, total, financingNote, gstCharged, items, discount, taxRate, inclusive }: Props & {
  items: PublicItem[]; discount: number; taxRate: number; inclusive: boolean;
}) {
  const rec = options.find((o) => o.recommended)?.id ?? options[0]?.id ?? null;
  const [selected, setSelected] = useState<string | null>(rec);
  const [chosen, setChosen] = useState<string[]>([]);
  const option = options.find((o) => o.id === selected);
  const offered = items.filter((i) => i.extra_status === "offered" && i.id && (!i.option_id || i.option_id === selected) && Number(i.unit_price) > 0);
  const picks = chosen.filter((id) => offered.some((i) => i.id === id));
  const shownTotal = picks.length || options.length
    ? estimateTotals(itemsForOption(withChosen(items, picks), selected).map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), discount, taxRate, inclusive).total
    : total;
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
      {offered.length > 0 && (
        <section className="rounded-[24px] border-2 border-dashed border-slate-300 px-5 py-4" data-testid="often-added">
          <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-500">Often added</p>
          {offered.map((i) => (
            <label key={i.id} className="flex min-h-11 items-center gap-3 py-1.5 text-slate-600" data-testid="offered-extra">
              <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={picks.includes(i.id!)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, i.id!] : c.filter((x) => x !== i.id)))} />
              <span className="min-w-0 flex-1">{i.description}{i.blurb ? <span className="text-sm text-slate-400"> · {i.blurb}</span> : null}</span>
              <span className="tabular-nums">+{money(Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100)}</span>
            </label>
          ))}
        </section>
      )}
      <SignForm token={token} orgName={orgName} optionId={selected} optionName={option?.name} total={shownTotal} gstCharged={gstCharged} extras={picks} />
    </div>
  );
}
