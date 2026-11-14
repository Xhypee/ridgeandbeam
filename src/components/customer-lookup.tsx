"use client";

// Contact on New lead / New customer: one search box that finds existing customers by name, mobile or email.
// Pick one and the job goes on that customer (posts customer_id). No match, or "Add as new", shows the usual
// Name / Mobile / Email fields filled from what was typed, with "Look up an existing customer" to go back.
import { useEffect, useId, useRef, useState } from "react";
import { Field, Input, cx } from "@/components/ui";
import { searchCustomers, type CustomerMatch } from "@/app/app/customers/actions";

/** What they typed → which new-customer field it belongs in. Exported for tests. */
export function prefillFrom(q: string): { name: string; phone: string; email: string } {
  const t = q.trim();
  if (/@/.test(t)) return { name: "", phone: "", email: t };
  if (/^[+\d][\d\s()-]{5,}$/.test(t)) return { name: "", phone: t, email: "" };
  return { name: t, phone: "", email: "" };
}

/** Looks like a whole name ("Priya Sh"), an email or a full mobile: worth switching to new-customer fields on no match. */
export function looksComplete(q: string): boolean {
  const t = q.trim();
  return /\S+@\S+\.\S+/.test(t) || t.replace(/\D/g, "").length >= 8 || (/\s/.test(t) && t.length >= 4 && !/\d/.test(t));
}

const PERSON = "M12 12a4 4 0 100-8 4 4 0 000 8M4 21a8 8 0 0116 0";
const PLUS = "M12 5v14M5 12h14";
function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
const linkCls = "text-sm font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline";

/** `search` defaults to the real customer search; a preview or test can pass its own server action. */
export function CustomerLookup({ search = searchCustomers }: { search?: (q: string) => Promise<CustomerMatch[]> }) {
  const [mode, setMode] = useState<"search" | "picked" | "new">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: CustomerMatch[] } | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CustomerMatch | null>(null);
  const [fields, setFields] = useState({ name: "", phone: "", email: "" });
  const [focusKey, setFocusKey] = useState<"name" | "phone" | "email" | null>(null);
  const seq = useRef(0);
  const listId = useId();
  const term = q.trim();

  useEffect(() => {
    if (mode !== "search" || term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const items = await search(term).catch(() => []);
      if (n !== seq.current) return;
      // Nobody matches a whole name / email / mobile: go straight to the new-customer fields, keep typing there.
      if (!items.length && looksComplete(term)) {
        const f = prefillFrom(term);
        setFields(f); setFocusKey(f.email ? "email" : f.phone ? "phone" : "name"); setMode("new"); setOpen(false);
        return;
      }
      setResults({ q: term, items }); setActive(0); setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [term, mode, search]);

  // Only results for what's in the box now; the last row is always "Add … as a new customer".
  const items = term.length >= 2 && results?.q === term ? results.items : [];
  const searched = term.length >= 2 && results?.q === term;
  const rows = searched ? items.length + 1 : 0;

  const pick = (c: CustomerMatch) => { setPicked(c); setMode("picked"); setOpen(false); };
  const addNew = () => {
    const f = prefillFrom(q);
    setFields(f);
    setFocusKey(f.email ? "email" : f.phone ? "phone" : "name");
    setMode("new"); setOpen(false);
  };
  // Focus the field that got what they typed, caret at the end, so typing carries on.
  const focusRef = (k: "name" | "phone" | "email") => (el: HTMLInputElement | null) => {
    if (!el || focusKey !== k) return;
    el.focus();
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch { /* email inputs don't support selection */ }
    setFocusKey(null);
  };
  const backToSearch = () => { setPicked(null); setMode("search"); setQ(""); setResults(null); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // never submit the whole form from the search box
      if (!searched) return;
      if (active < items.length) pick(items[active]); else addNew();
      return;
    }
    if (!open || !rows) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % rows); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? rows - 1 : a - 1)); }
    else if (e.key === "Escape") setOpen(false);
  };

  if (mode === "picked" && picked) {
    const addr = [picked.address, [picked.city, picked.state, picked.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return (
      <div className="space-y-2" data-contact-mode="picked">
        <input type="hidden" name="customer_id" value={picked.id} />
        <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-3.5 py-3 ring-1 ring-brand-200" data-contact-picked>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-brand-200"><Icon d={PERSON} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">{picked.name}</span>
            <span className="block truncate text-xs text-slate-600">{[picked.phone, picked.email].filter(Boolean).join(" · ") || "No contact details"}</span>
            {addr && <span className="block truncate text-xs text-slate-500">{addr}</span>}
            <span className="mt-1 block text-xs font-medium text-brand-700">Existing customer · {picked.jobs} {picked.jobs === 1 ? "job" : "jobs"}. The new job goes on their record.</span>
          </span>
        </div>
        <button type="button" onClick={backToSearch} className={linkCls}>Choose someone else</button>
      </div>
    );
  }

  if (mode === "new") {
    const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));
    return (
      <div className="space-y-3" data-contact-mode="new">
        <Field label="Name"><Input ref={focusRef("name")} name="name" required value={fields.name} onChange={set("name")} autoComplete="off" placeholder="e.g. Priya Sharma" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile"><Input ref={focusRef("phone")} name="phone" type="tel" inputMode="tel" value={fields.phone} onChange={set("phone")} placeholder="04xx xxx xxx" /></Field>
          <Field label="Email"><Input ref={focusRef("email")} name="email" type="email" value={fields.email} onChange={set("email")} /></Field>
        </div>
        <button type="button" onClick={backToSearch} className={linkCls}>Look up an existing customer</button>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-contact-mode="search">
      <Field label="Customer">
        <div className="relative">
          <Input role="combobox" aria-expanded={open && rows > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && rows ? `${listId}-${active}` : undefined}
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => rows && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoFocus autoComplete="off" placeholder="Search name, mobile or email" className="pl-9" />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          {open && rows > 0 && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 ring-1 ring-slate-300">
              {items.map((c, i) => (
                <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}
                  className={cx("flex cursor-pointer items-center gap-2.5 px-3 py-2.5", i === active && "bg-brand-50")}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream text-slate-500 ring-1 ring-slate-200"><Icon d={PERSON} className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.name}</span><span className="block truncate text-xs text-slate-500">{[c.phone, c.email, c.city].filter(Boolean).join(" · ")}</span></span>
                  <span className="shrink-0 text-[11px] text-slate-400">{c.jobs} {c.jobs === 1 ? "job" : "jobs"}</span>
                </li>
              ))}
              <li id={`${listId}-${items.length}`} role="option" aria-selected={active === items.length} onMouseDown={(e) => { e.preventDefault(); addNew(); }} onMouseEnter={() => setActive(items.length)}
                className={cx("flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm", items.length > 0 && "border-t border-slate-100", active === items.length && "bg-brand-50")}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Icon d={PLUS} className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1 truncate">{items.length ? <>Add <b className="text-ink">&ldquo;{term}&rdquo;</b> as a new customer</> : <>No customer matches <b className="text-ink">&ldquo;{term}&rdquo;</b>. Add them as new</>}</span>
              </li>
            </ul>
          )}
        </div>
      </Field>
      <button type="button" onClick={addNew} className={linkCls}>New customer, enter their details</button>
    </div>
  );
}
