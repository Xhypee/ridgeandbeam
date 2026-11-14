"use client";

// "Referred by": a lookup over every contact (customer, builder, contractor, other) and supplier. Click in to see
// recent referrers, type to search, or "+ Add … as a new contact" when they aren't saved yet (created on save).
// Posts `${name}` (the id) and `${name}_type` ("contact" | "supplier"); a new one posts `${name}_new` + `${name}_kind`.
import { useEffect, useId, useRef, useState } from "react";
import { Input, cx } from "@/components/ui";
import { searchReferrers } from "@/app/app/contacts/referral-actions";
import type { Referrer } from "@/lib/referrals-server";

type Picked = Referrer | { id: ""; type: "new"; name: string; detail?: null };
const KINDS = [["builder", "Builder"], ["contractor", "Contractor"], ["customer", "Customer"], ["other", "Other"]] as const;
const SEARCH = "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3";
const PLUS = "M12 5v14M5 12h14";

function Svg({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function ContactPicker({ name, initial = null, placeholder = "Search contacts and suppliers", search = searchReferrers }: {
  name: string; initial?: Referrer | null; placeholder?: string; search?: (q: string) => Promise<Referrer[]>;
}) {
  const [picked, setPicked] = useState<Picked | null>(initial);
  const [kind, setKind] = useState<string>("other");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; items: Referrer[] } | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const term = q.trim();

  // Search as they type (2+ letters); with nothing typed, recent referrers once the box is opened.
  useEffect(() => {
    if (picked || (term.length > 0 && term.length < 2) || (!term && !open)) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const items = await search(term).catch(() => []);
      if (n === seq.current) { setRes({ q: term, items }); setActive(0); }
    }, term ? 200 : 0);
    return () => clearTimeout(t);
  }, [term, picked, open, search]);

  const ready = res?.q === term && (term.length >= 2 || term.length === 0);
  // The list sits in the page flow (not floating), so a sidebar's footer can't cover it; keep it in view.
  const shown = open && ready && Boolean(term || res?.items.length);
  useEffect(() => { if (shown) list.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [shown, res]);
  const items = ready ? res!.items : [];
  const canAdd = term.length >= 2 && ready && !items.some((c) => c.name.toLowerCase() === term.toLowerCase());
  const total = items.length + (canAdd ? 1 : 0);
  const choose = (c: Referrer) => { setPicked(c); setOpen(false); setQ(""); };
  const addNew = () => { setPicked({ id: "", type: "new", name: term.replace(/\s+/g, " ") }); setOpen(false); setQ(""); };

  if (picked) {
    const isNew = picked.type === "new";
    return (
      <div className="rounded-xl bg-brand-50 px-3 py-2.5 ring-1 ring-brand-200" data-contact-picker-picked>
        {isNew ? (<>
          <input type="hidden" name={`${name}_new`} value={picked.name} />
          <input type="hidden" name={`${name}_kind`} value={kind} />
        </>) : (<>
          <input type="hidden" name={name} value={picked.id} />
          <input type="hidden" name={`${name}_type`} value={picked.type} />
        </>)}
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{picked.name}</span>
            <span className="block truncate text-xs text-slate-500">{isNew ? "New contact · added to Contacts when you save" : picked.detail}</span>
          </span>
          <button type="button" onClick={() => setPicked(null)} aria-label={`Remove ${picked.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-ink">✕</button>
        </div>
        {isNew && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`What is ${picked.name}?`} data-referrer-kind>
            {KINDS.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cx("rounded-full px-3 py-1 text-[13px] font-semibold ring-1", kind === k ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-300 hover:ring-slate-400")}>{l}</button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
      <Input role="combobox" aria-expanded={open && total > 0} aria-controls={listId} aria-autocomplete="list" value={q} placeholder={placeholder} autoComplete="off" className="pl-9"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (items[active]) choose(items[active]); else if (canAdd && active === items.length) addNew(); }
          else if (e.key === "ArrowDown" && total) { e.preventDefault(); setActive((a) => (a + 1) % total); }
          else if (e.key === "ArrowUp" && total) { e.preventDefault(); setActive((a) => (a <= 0 ? total - 1 : a - 1)); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <Svg d={SEARCH} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {shown && (
        <ul ref={list} id={listId} role="listbox" className="mt-1 scroll-mb-4 overflow-hidden rounded-xl bg-white py-1 ring-1 ring-slate-300" data-contact-picker-list>
          {!term && <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent</li>}
          {items.map((c, i) => (
            <li key={`${c.type}-${c.id}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(c); }} onMouseEnter={() => setActive(i)}
              className={cx("cursor-pointer px-3 py-2.5", i === active && "bg-brand-50")}>
              <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
              <span className="block truncate text-xs text-slate-500">{c.detail}</span>
            </li>
          ))}
          {canAdd && (
            <li role="option" aria-selected={active === items.length} onMouseDown={(e) => { e.preventDefault(); addNew(); }} onMouseEnter={() => setActive(items.length)} data-contact-picker-add
              className={cx("flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-semibold text-brand-700", items.length > 0 && "border-t border-slate-100", active === items.length && "bg-brand-50")}>
              <Svg d={PLUS} />Add &ldquo;{term}&rdquo; as a new contact
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
