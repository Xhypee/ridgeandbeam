"use client";

// "Referred by" on New lead: search any contact (customer, builder, contractor, other) and pick one.
// Posts the contact's id under `name`. Starts filled when the lead came from "Log a referral" on a contact.
import { useEffect, useId, useRef, useState } from "react";
import { Input, cx } from "@/components/ui";
import { searchCustomers, type CustomerMatch } from "@/app/app/customers/actions";

type Picked = { id: string; name: string; detail?: string | null };

export function ContactPicker({ name, initial = null, placeholder = "Search contacts", search = searchCustomers }: {
  name: string; initial?: Picked | null; placeholder?: string; search?: (q: string) => Promise<CustomerMatch[]>;
}) {
  const [picked, setPicked] = useState<Picked | null>(initial);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; items: CustomerMatch[] } | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const listId = useId();
  const term = q.trim();

  useEffect(() => {
    if (picked || term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const items = await search(term).catch(() => []);
      if (n === seq.current) { setRes({ q: term, items }); setActive(0); setOpen(true); }
    }, 200);
    return () => clearTimeout(t);
  }, [term, picked, search]);

  const items = term.length >= 2 && res?.q === term ? res.items : [];
  const choose = (c: CustomerMatch) => { setPicked({ id: c.id, name: c.name, detail: [c.phone, c.city].filter(Boolean).join(" · ") }); setOpen(false); setQ(""); };

  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5 ring-1 ring-brand-200" data-contact-picker-picked>
        <input type="hidden" name={name} value={picked.id} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{picked.name}</span>{picked.detail && <span className="block truncate text-xs text-slate-500">{picked.detail}</span>}</span>
        <button type="button" onClick={() => setPicked(null)} aria-label={`Remove ${picked.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-ink">✕</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list" value={q} placeholder={placeholder} autoComplete="off"
        onChange={(e) => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (items[active]) choose(items[active]); }
          else if (e.key === "ArrowDown" && items.length) { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && term.length >= 2 && res?.q === term && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 ring-1 ring-slate-300">
          {items.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">No contact matches &ldquo;{term}&rdquo;. Add them in Contacts first.</li>}
          {items.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(c); }} onMouseEnter={() => setActive(i)}
              className={cx("cursor-pointer px-3 py-2.5", i === active && "bg-brand-50")}>
              <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
              <span className="block truncate text-xs text-slate-500">{[c.phone, c.email, c.city].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
