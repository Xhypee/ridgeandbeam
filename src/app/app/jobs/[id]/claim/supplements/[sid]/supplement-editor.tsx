"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { money } from "@/lib/format";
import { CODE_CITATIONS } from "@/lib/claims";
import { saveSupplement } from "../../actions";

export type EditorItem = {
  description: string;
  xact_code: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  code_citation: string | null;
  justification: string | null;
  file_ids: string[];
  status: "requested" | "approved" | "denied";
  approved_amount: number;
};
export type Photo = { id: string; url: string | null; caption: string | null; category: string };

const BLANK: EditorItem = { description: "", xact_code: null, quantity: 1, unit: "EA", unit_price: 0, code_citation: null, justification: null, file_ids: [], status: "requested", approved_amount: 0 };

const CITATION_PRESETS = Object.entries(CODE_CITATIONS);

export function SupplementEditor({ id, locked, initial, notes: initialNotes, photos }: { id: string; locked: boolean; initial: EditorItem[]; notes: string | null; photos: Photo[] }) {
  const [items, setItems] = useState<EditorItem[]>(initial);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const [pickFor, setPickFor] = useState<number | null>(null);
  const total = useMemo(() => Math.round(items.reduce((s, i) => s + Math.round(i.quantity * i.unit_price * 100) / 100, 0) * 100) / 100, [items]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const set = (i: number, patch: Partial<EditorItem>) => { setItems((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it))); touch(); };
  const togglePhoto = (i: number, fid: string) => set(i, { file_ids: items[i].file_ids.includes(fid) ? items[i].file_ids.filter((x) => x !== fid) : [...items[i].file_ids, fid] });
  const photoById = new Map(photos.map((p) => [p.id, p]));

  function save() {
    start(async () => {
      const r = await saveSupplement({ id, notes: notes || null, items });
      setMsg(r ?? null);
      if (!r?.error) setDirty(false);
    });
  }

  return (
    <Card title="Line items" actions={<span className="text-sm font-semibold tabular-nums text-slate-900">Requested {money(total)}</span>}>
      {items.length === 0 && <p className="mb-3 text-sm text-slate-500">No lines yet. Add each item the carrier missed or under-paid.</p>}
      <ol className="space-y-4">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg p-3 ring-1 ring-slate-200" data-testid="supp-line">
            <div className="grid gap-3 sm:grid-cols-6">
              <Field label="Description" className="sm:col-span-4"><Input aria-label="Description" value={it.description} disabled={locked} onChange={(e) => set(i, { description: e.target.value })} /></Field>
              <Field label="Xactimate code" className="sm:col-span-2"><Input aria-label="Xactimate code" value={it.xact_code ?? ""} disabled={locked} placeholder="RFG DRIP" onChange={(e) => set(i, { xact_code: e.target.value || null })} /></Field>
              <Field label="Qty"><Input aria-label="Quantity" type="number" step="0.01" inputMode="decimal" value={it.quantity} disabled={locked} onChange={(e) => set(i, { quantity: Number(e.target.value) })} /></Field>
              <Field label="Unit"><Input aria-label="Unit" value={it.unit} disabled={locked} onChange={(e) => set(i, { unit: e.target.value.toUpperCase() })} /></Field>
              <Field label="Unit price"><Input aria-label="Unit price" type="number" step="0.01" min="0" inputMode="decimal" value={it.unit_price} disabled={locked} onChange={(e) => set(i, { unit_price: Number(e.target.value) })} /></Field>
              <div className="flex items-end justify-between gap-2 sm:col-span-3">
                <span className="pb-2 text-sm font-medium tabular-nums">{money(Math.round(it.quantity * it.unit_price * 100) / 100)}</span>
                {!locked && <Button type="button" variant="ghost" onClick={() => { setItems((p) => p.filter((_, j) => j !== i)); touch(); }} aria-label="Remove line">Remove</Button>}
              </div>
              <Field label="Code citation" className="sm:col-span-3">
                <Input aria-label="Code citation" list="citations" value={it.code_citation ?? ""} disabled={locked} placeholder="IRC R905.2.8.5" onChange={(e) => set(i, { code_citation: e.target.value || null })} />
              </Field>
              <Field label="Line status" className="sm:col-span-3">
                <Select aria-label="Line status" value={it.status} disabled={locked} onChange={(e) => set(i, { status: e.target.value as EditorItem["status"] })}>
                  <option value="requested">Requested</option><option value="approved">Approved</option><option value="denied">Denied</option>
                </Select>
              </Field>
              <Field label="Why the carrier owes this" className="sm:col-span-6">
                <Textarea aria-label="Justification" value={it.justification ?? ""} disabled={locked} rows={2} onChange={(e) => set(i, { justification: e.target.value || null })} />
              </Field>
            </div>
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {it.file_ids.map((fid) => {
                  const p = photoById.get(fid);
                  return p?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={fid} src={p.url} alt={p.caption ?? "Photo"} className="h-14 w-14 rounded object-cover ring-1 ring-slate-200" />
                  ) : (
                    <span key={fid} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{p?.caption ?? "Photo"}</span>
                  );
                })}
                {!locked && photos.length > 0 && (
                  <Button type="button" variant="secondary" className="min-h-11" onClick={() => setPickFor(pickFor === i ? null : i)}>
                    {pickFor === i ? "Done picking" : `Photos (${it.file_ids.length})`}
                  </Button>
                )}
                {photos.length === 0 && <span className="text-xs text-slate-500">No job photos to attach yet.</span>}
              </div>
              {pickFor === i && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {photos.map((p) => {
                    const on = it.file_ids.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => togglePhoto(i, p.id)} aria-pressed={on}
                        className={cx("relative overflow-hidden rounded-lg ring-2", on ? "ring-brand-500" : "ring-transparent")}>
                        {p.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt={p.caption ?? p.category} className="aspect-square w-full object-cover" />
                        ) : (
                          <span className="flex aspect-square items-center justify-center bg-slate-100 text-xs">{p.caption ?? p.category}</span>
                        )}
                        {on && <span className="absolute right-1 top-1 rounded-full bg-brand-500 px-1.5 text-xs text-white">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <datalist id="citations">{CITATION_PRESETS.map(([k, v]) => <option key={k} value={v} />)}</datalist>
      {!locked && (
        <Button type="button" variant="secondary" className="mt-4 min-h-11" onClick={() => { setItems((p) => [...p, { ...BLANK }]); touch(); }}>+ Add line</Button>
      )}
      <Field label="Notes to the carrier" className="mt-4">
        <Textarea value={notes} disabled={locked} onChange={(e) => { setNotes(e.target.value); touch(); }} />
      </Field>
      {!locked && (
        <div className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-3 border-t border-slate-100 bg-white/95 px-4 py-3">
          <Button type="button" onClick={save} disabled={pending} className="min-h-11">{pending ? "Saving…" : "Save supplement"}</Button>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          {msg?.error && <span role="alert" className="text-sm text-red-700">{msg.error}</span>}
          {msg?.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
        </div>
      )}
    </Card>
  );
}
