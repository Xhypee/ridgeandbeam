"use client";
// The Contact section on every job sidebar: mobile (text / call), email, site (Google Maps). "Edit" in the
// header swaps the rows for a small form — mobile, email and site address (lookup first) — saved in one go.
import { startTransition, useActionState, useState, type FormEvent, type MouseEvent } from "react";
import { AddressLookup } from "@/components/address-lookup";
import { Field, Input, Button } from "@/components/ui";
import { parseAuAddress } from "@/lib/address-parse";
import type { ActionResult } from "@/components/action-form";
import { updateJobContact } from "./actions";
import { ContactRow, Icon, MAIL, PHONE, PIN, Section, iconBtn } from "./job-section-ui";

type Customer = { id: string; name: string; phone: string | null; email: string | null };
const PENCIL = "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4";

export function ContactSection({ jobId, customer: c, site, state }: { jobId: string; customer: Customer; site: string | null; state: string | null }) {
  const [editing, setEditing] = useState(false);
  const [res, save, pending] = useActionState<ActionResult, FormData>(async (prev, fd) => {
    const r = await updateJobContact(prev, fd);
    if (r?.ok) setEditing(false); // saved: back to the rows, now showing the new details
    return r;
  }, undefined);

  const phone = c.phone?.replace(/\s+/g, "");
  const maps = site ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site)}` : null;
  const startEdit = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // the button sits in the section's <summary>: don't fold the section
    const details = e.currentTarget.closest("details");
    if (details) details.open = true;
    setEditing(true);
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => save(fd));
  };
  const initial = site ? { ...parseAuAddress(site), lat: null, lng: null } : null;

  const edit = !editing && (
    <button type="button" onClick={startEdit} data-contact-edit className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
      <Icon d={PENCIL} className="h-3.5 w-3.5" />Edit
    </button>
  );

  return (
    <Section title="Contact" action={edit}>
      {editing ? (
        <form onSubmit={onSubmit} className="space-y-3" data-contact-form>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="customer_id" value={c.id} />
          <Field label="Mobile"><Input name="phone" type="tel" inputMode="tel" defaultValue={c.phone ?? ""} placeholder="04xx xxx xxx" autoComplete="off" /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={c.email ?? ""} placeholder="name@email.com" autoComplete="off" /></Field>
          <AddressLookup initial={initial} defaultState={state} />
          {res?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={pending} className="flex-1">{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
          </div>
        </form>
      ) : (<>
        <ContactRow icon={PHONE} label="Mobile" value={c.phone ?? <span className="text-slate-400">No number</span>}>
          {phone && <span className="flex gap-1.5">
            <a href={`sms:${phone}`} aria-label={`Text ${c.name}`} title="Text" className={iconBtn}><Icon d="M4 5h16v11H9l-5 4z" /></a>
            <a href={`tel:${phone}`} aria-label={`Call ${c.name}`} title="Call" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"><Icon d={PHONE} /></a>
          </span>}
        </ContactRow>
        <ContactRow icon={MAIL} label="Email" value={c.email ?? <span className="text-slate-400">No email</span>}>
          {c.email && <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} title="Email" className={iconBtn}><Icon d="M5 12h14M13 6l6 6-6 6" /></a>}
        </ContactRow>
        <ContactRow icon={PIN} label="Site" value={site ?? <span className="text-slate-400">No address yet</span>}>
          {maps && <a href={maps} target="_blank" rel="noreferrer" aria-label="Open in Google Maps" title="Open in Google Maps" className={iconBtn}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" fill="#ea4335" /><circle cx="12" cy="9" r="2.6" fill="#fff" /></svg>
          </a>}
        </ContactRow>
      </>)}
    </Section>
  );
}
