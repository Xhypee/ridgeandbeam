"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { money } from "@/lib/format";
import { sellIncGst } from "@/lib/price-sheet";
import { saveMarkup } from "./actions";

const CATS = [
  { key: "material", label: "Materials" },
  { key: "labor", label: "Labour" },
  { key: "other", label: "Other (hire, skip bins, asbestos)" },
] as const;

/** Markup per category with a live "cost $10.00 ex GST → sell $X inc GST" example. */
export function MarkupEditor({ initial, canEdit }: { initial: Record<string, number>; canEdit: boolean }) {
  const [m, setM] = useState<Record<string, string>>(Object.fromEntries(CATS.map((c) => [c.key, String(initial[c.key] ?? 0)])));
  return (
    <ActionForm action={saveMarkup} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {CATS.map((c) => {
          const pct = Number(m[c.key]) || 0;
          const sell = sellIncGst(10, pct);
          return (
            <div key={c.key} className="rounded-lg p-3 ring-1 ring-slate-200">
              <Field label={`${c.label} markup %`}>
                <Input name={c.key} type="number" inputMode="decimal" step="0.1" min="0" max="500" value={m[c.key]} disabled={!canEdit}
                  onChange={(e) => setM((x) => ({ ...x, [c.key]: e.target.value }))} className="min-h-11" />
              </Field>
              <p className="mt-2 text-xs text-slate-600" data-testid={`markup-example-${c.key}`}>
                Cost {money(10)} ex GST → sell <b className="text-slate-900">{money(sell)}</b> inc GST
                <span className="block text-slate-500">Includes GST of {money(Math.round((sell / 11) * 100) / 100)}</span>
              </p>
            </div>
          );
        })}
      </div>
      {canEdit ? <SubmitButton className="min-h-11">Save markup</SubmitButton> : <p className="text-xs text-slate-500">Only owners and admins can change markup.</p>}
    </ActionForm>
  );
}
