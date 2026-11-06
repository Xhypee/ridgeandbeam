"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Input, cx } from "@/components/ui";
import { addSupplier } from "./actions";

export type DirectorySupplier = { id: string; name: string; category: string; website: string | null; states: string[]; notes: string | null; verified: boolean };

const CATEGORY: Record<string, string> = {
  metal_roofing: "Metal roofing", tiles: "Roof tiles", roof_plumbing: "Roof plumbing", general_trade: "General trade",
  sarking_insulation: "Sarking & insulation", fasteners: "Fasteners", coatings: "Coatings", hire: "Hire",
};

export function DirectoryPicker({ directory, serviceStates, addedIds }: { directory: DirectorySupplier[]; serviceStates: string[]; addedIds: string[] }) {
  const [q, setQ] = useState("");
  const [allStates, setAllStates] = useState(serviceStates.length === 0);
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const added = useMemo(() => new Set(addedIds), [addedIds]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return directory.filter((s) => {
      if (n && !`${s.name} ${CATEGORY[s.category] ?? s.category} ${s.notes ?? ""}`.toLowerCase().includes(n)) return false;
      // Suppliers with no published coverage stay visible (coverage unknown, not "doesn't serve you").
      if (!allStates && s.states.length > 0 && !s.states.some((st) => serviceStates.includes(st))) return false;
      return true;
    });
  }, [directory, q, allStates, serviceStates]);

  const choice = directory.find((s) => s.id === picked) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Search Australian suppliers" className="min-w-0 flex-1">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lysaght, Stramit, Reece, tiles…" aria-label="Search suppliers" />
        </Field>
        {serviceStates.length > 0 && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={allStates} onChange={(e) => setAllStates(e.target.checked)} className="h-5 w-5 accent-brand-500" />
            Show suppliers outside {serviceStates.join(", ")}
          </label>
        )}
      </div>

      <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200" data-testid="directory">
        {list.map((s) => {
          const isAdded = added.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={isAdded}
                onClick={() => { setPicked(s.id); setCustom(false); }}
                className={cx("flex min-h-14 w-full items-start justify-between gap-3 px-3 py-2.5 text-left", picked === s.id ? "bg-brand-50" : "hover:bg-slate-50", isAdded && "opacity-60")}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{s.name}</span>
                  <span className="block text-xs text-slate-500">
                    {CATEGORY[s.category] ?? s.category}
                    {" · "}
                    {s.states.length ? s.states.join(", ") : "Coverage not confirmed"}
                    {s.states.length > 0 && !s.verified && " (unverified)"}
                  </span>
                </span>
                {isAdded ? <Badge tone="green">Added</Badge> : picked === s.id ? <Badge tone="teal">Selected</Badge> : null}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">No suppliers match. Add yours as a custom supplier below.</li>}
      </ul>

      <button type="button" className="min-h-11 text-sm font-medium text-brand-600 hover:underline" onClick={() => { setCustom(true); setPicked(null); }}>
        My supplier isn&apos;t listed — add a custom supplier
      </button>

      {(choice || custom) && (
        <ActionForm key={choice?.id ?? "custom"} action={addSupplier} className="space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          {choice ? (
            <>
              <input type="hidden" name="supplier_id" value={choice.id} />
              <p className="text-sm"><b>{choice.name}</b>{choice.website && <> · <a href={choice.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">website</a></>}</p>
              {choice.notes && <p className="text-xs text-slate-500">{choice.notes}</p>}
            </>
          ) : (
            <Field label="Supplier name"><Input name="custom_name" required placeholder="e.g. No.1 Roofing Parramatta" /></Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your account number"><Input name="account_number" placeholder="Optional" /></Field>
            <Field label="Branch"><Input name="branch_name" placeholder="e.g. Smithfield" /></Field>
            <Field label="Branch email" hint="Orders are sent here"><Input name="branch_email" type="email" placeholder="orders@branch.com.au" /></Field>
            <Field label="Branch phone"><Input name="branch_phone" type="tel" placeholder="02 9xxx xxxx" /></Field>
          </div>
          <SubmitButton className="min-h-11 w-full sm:w-auto">Add supplier</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
