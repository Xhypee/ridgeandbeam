// A contact's right sidebar on Contacts. Customers keep their existing docket; builders add People and
// payment terms; contractors show licence & insurance with expiry warnings and the jobs they're on;
// suppliers (from Materials) show the account, orders and invoices to pay, and the price list.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input, Select, cx } from "@/components/ui";
import { complianceAlert, contractorCompliance, TYPE_LABEL, type ExpiryState } from "@/lib/contacts";
import type { createClient } from "@/lib/supabase/server";
import { label, STAGE_LABEL } from "@/lib/format";
import { orgSupplierName, SUPPLIER_CATEGORY_LABEL } from "@/lib/suppliers";
import { Icon, Section } from "../jobs/job-sections";
import { CustomerDocket, loadCustomerDocket, ReferralsSection, type CustomerDocketData } from "../customers/customer-docket";
import { ClaudeBar } from "../jobs/claude-bar";
import { aiEnabled } from "@/lib/ai";
import { addPerson, addToJob, removeFromJob, removePerson } from "./actions";
import { EditContact, EditSupplier, type SupplierEdit } from "./contact-form";

type DB = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const SMS = "M4 5h16v11H8l-4 4z";
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const PIN = "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5";
const DOC = "M7 3h7l5 5v13H7zM14 3v5h5";
const SHIELD = "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z";
const BANK = "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18";
const CHEV = "M9 6l6 6-6 6";
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const since = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "Australia/Brisbane" });
const dmy = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const paidAt = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }).replace(/\s?([ap]m)/i, (m) => m.trim().toLowerCase());
const tel = (p: string) => `tel:${p.replace(/\s+/g, "")}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export type Person = { id: string; name: string; role: string | null; phone: string | null; email: string | null };
export type OnJob = { job_id: string; title: string; stage: string; who: string | null; where: string | null; role: string | null };
export type ContactDocketData = CustomerDocketData & { people: Person[]; onJobs: OnJob[]; openJobs: { id: string; label: string }[] };

export async function loadContactDocket(supabase: DB, id: string, opts: { canSeeMoney: boolean }): Promise<ContactDocketData | null> {
  const base = await loadCustomerDocket(supabase, id, opts);
  if (!base) return null;
  const kind = base.customer.kind;
  const [{ data: people }, { data: links }, { data: open }] = await Promise.all([
    kind === "builder" ? supabase.from("contact_people").select("id, name, role, phone, email").eq("contact_id", id).order("created_at") : Promise.resolve({ data: [] }),
    kind === "contractor" || kind === "other" ? supabase.from("job_contacts").select("job_id, role, jobs(title, stage, site_address, customers(name))").eq("contact_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    kind === "contractor" || kind === "other" ? supabase.from("jobs").select("id, title, customers(name)").not("stage", "in", "(paid,lost)").is("closed_at", null).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
  ]);
  type L = { job_id: string; role: string | null; jobs: unknown };
  const onJobs = ((links ?? []) as L[]).map((l) => {
    const j = one(l.jobs as { title: string; stage: string; site_address: string | null; customers: unknown });
    return { job_id: l.job_id, role: l.role, title: j?.title ?? "Job", stage: j?.stage ?? "", who: one(j?.customers as { name: string })?.name ?? null, where: j?.site_address?.split(",").slice(-2, -1)[0]?.trim() ?? null };
  });
  const taken = new Set(onJobs.map((j) => j.job_id));
  const openJobs = ((open ?? []) as { id: string; title: string; customers: unknown }[]).filter((j) => !taken.has(j.id)).map((j) => ({ id: j.id, label: [one(j.customers as { name: string })?.name, j.title].filter(Boolean).join(" · ") }));
  return { ...base, people: (people ?? []) as Person[], onJobs, openJobs };
}

function Row({ icon, k, v, href }: { icon: string; k: string; v: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream text-slate-600 ring-1 ring-slate-200"><Icon d={icon} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] text-slate-500">{k}</span><span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{v}</span></span>
    </>
  );
  return href ? <a href={href} className="flex items-center gap-3 rounded-lg py-1.5 hover:bg-slate-50">{inner}</a> : <div className="flex items-center gap-3 py-1.5">{inner}</div>;
}

function Shell({ id, tag, sinceIso, name, sub, stats, fullHref, closeHref, phone, email, children, claude }: { id: string; tag: string; sinceIso: string; name: string; sub: string; stats: { k: string; v: string; warn?: boolean }[]; fullHref?: string; closeHref: string; phone: string | null; email: string | null; children: React.ReactNode; claude?: React.ReactNode }) {
  const btn = "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold";
  return (
    <div className="flex h-full flex-col bg-cream p-4" data-contact-docket={id}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="bg-brand-500 px-5 pb-5 pt-4 text-white">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              <span className="min-w-0 flex-1 truncate" data-contact-tag>{tag}</span>
              <span className="shrink-0">Since {since(sinceIso)}</span>
              {fullHref && <Link href={fullHref} aria-label="Open the full page" title="Open the full page" className="-my-1 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></Link>}
              <Link href={closeHref} scroll={false} aria-label="Close" className="-my-1 -mr-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight">{name}</h2>
            <p className="truncate text-sm text-white/70">{sub}</p>
            {stats.length > 0 && <dl className={cx("mt-5 grid gap-2", stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1")} data-contact-stats>
              {stats.map((s) => <div key={s.k}><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">{s.k}</dt><dd className={cx("font-display text-[22px] font-bold leading-tight", s.warn && "text-amber-200")}>{s.v}</dd></div>)}
            </dl>}
          </div>
          <div className="flex gap-2 px-5 py-4">
            {phone ? <a href={tel(phone)} className={cx(btn, "bg-brand-500 text-white hover:bg-brand-600")}><Icon d={PHONE} />Call</a> : <span className={cx(btn, "bg-slate-100 text-slate-400")}><Icon d={PHONE} />No number</span>}
            {phone && <a href={`sms:${phone.replace(/\s+/g, "")}`} className={cx(btn, "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}><Icon d={SMS} />Text</a>}
            {email && <a href={`mailto:${email}`} className={cx(btn, "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}><Icon d={MAIL} />Email</a>}
          </div>
          {children}
        </div>
        {claude}
      </div>
    </div>
  );
}

function EditDetails({ children }: { children: React.ReactNode }) {
  return (
    <details className="group border-t border-slate-100" data-contact-edit>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-ink">Edit details</span>
        <Icon d="M6 9l6 6 6-6" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
const Notes = ({ notes }: { notes: string | null }) => (
  <Section title="Notes">{notes ? <p className="whitespace-pre-wrap rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-ink [overflow-wrap:anywhere]">{notes}</p> : <p className="text-sm text-slate-500">No notes. Add some under Edit details.</p>}</Section>
);
const fullAddress = (c: { address: string | null; city: string | null; state: string | null; zip: string | null }) => [c.address, [c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

function JobList({ d, canSeeMoney, newHref, newLabel }: { d: ContactDocketData; canSeeMoney: boolean; newHref: string; newLabel: string }) {
  return (
    <Section title="Jobs" count={d.jobs.length}>
      {d.jobs.length === 0 ? <p className="text-sm text-slate-500">No jobs yet.</p> : (
        <ul className="-mx-2 divide-y divide-slate-100" data-contact-jobs>
          {d.jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/app/jobs?job=${j.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{j.title}</span>
                  <span className="block text-xs text-slate-500">{STAGE_LABEL[j.stage] ?? label(j.stage)}{canSeeMoney && j.owing > 0 ? <span className="font-semibold text-amber-700"> · {aud(j.owing)} owing</span> : null}</span>
                </span>
                {canSeeMoney && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{j.value === null ? <span className="font-normal text-slate-400">Not quoted</span> : aud(j.value)}</span>}
                <Icon d={CHEV} className="h-4 w-4 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={newHref} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">{newLabel}</Link>
    </Section>
  );
}

function BuilderDocket({ d, closeHref, canSeeMoney }: { d: ContactDocketData; closeHref: string; canSeeMoney: boolean }) {
  const c = d.customer;
  const address = fullAddress(c);
  return (
    <Shell claude={<ClaudeBar contactId={c.id} firstName={c.name.split(" ")[0] || c.name} ready={aiEnabled()} />} id={c.id} tag={TYPE_LABEL.builder} sinceIso={c.created_at} name={c.name} sub={[c.abn ? `ABN ${c.abn}` : null, c.city].filter(Boolean).join(" · ") || address || "Builder"}
      stats={canSeeMoney ? [{ k: "Jobs", v: String(d.jobs.length) }, { k: "Signed", v: aud(d.contract) }, { k: "Owing", v: aud(d.owing), warn: d.owing > 0 }] : [{ k: "Jobs", v: String(d.jobs.length) }]}
      fullHref={`/app/customers/${c.id}`} closeHref={closeHref} phone={c.phone ?? d.people.find((p) => p.phone)?.phone ?? null} email={c.email ?? d.people.find((p) => p.email)?.email ?? null}>
      <Section title="People" count={d.people.length}>
        {d.people.length > 0 && (
          <ul className="-mx-2 divide-y divide-slate-100" data-contact-people>
            {d.people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{initials(p.name)}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ink">{p.name}</b><span className="block truncate text-xs text-slate-500">{[p.role, p.phone, !p.phone ? p.email : null].filter(Boolean).join(" · ")}</span></span>
                {p.phone && <a href={tel(p.phone)} aria-label={`Call ${p.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"><Icon d={PHONE} /></a>}
                {p.email && <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"><Icon d={MAIL} /></a>}
                <form action={removePerson}><input type="hidden" name="id" value={p.id} /><button aria-label={`Remove ${p.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-red-700">✕</button></form>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-1" data-add-person>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-brand-600 hover:text-brand-700 [&::-webkit-details-marker]:hidden">+ Add a person</summary>
          <ActionForm action={addPerson} className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
            <input type="hidden" name="contact_id" value={c.id} />
            <Input name="name" placeholder="Name" required aria-label="Name" />
            <Input name="role" placeholder="Role (site super)" aria-label="Role" />
            <Input name="phone" type="tel" placeholder="Mobile" aria-label="Mobile" />
            <Input name="email" type="email" placeholder="Email" aria-label="Email" />
            <SubmitButton className="col-span-2 min-h-11">Add person</SubmitButton>
          </ActionForm>
        </details>
      </Section>
      <JobList d={d} canSeeMoney={canSeeMoney} newHref={`/app/jobs/new?customer=${c.id}`} newLabel={`+ New job for ${c.name}`} />
      <Section title="Contact">
        {c.phone && <Row icon={PHONE} k="Office" v={c.phone} href={tel(c.phone)} />}
        {c.email && <Row icon={MAIL} k="Email" v={c.email} href={`mailto:${c.email}`} />}
        {address && <Row icon={PIN} k="Address" v={address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} />}
        <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm" data-payment-terms>
          <div><dt className="text-[11px] text-slate-500">Payment terms</dt><dd className="font-medium text-ink">{c.payment_terms ?? "Not set"}</dd></div>
          <div><dt className="text-[11px] text-slate-500">Retention</dt><dd className="font-medium text-ink">{c.retention_pct ? `${Number(c.retention_pct)}%` : "None"}</dd></div>
        </dl>
      </Section>
      <ReferralsSection d={d} canSeeMoney={canSeeMoney} />
      <Notes notes={c.notes} />
      <EditDetails><EditContact c={c} /></EditDetails>
    </Shell>
  );
}

const TONE: Record<ExpiryState, { box: string; icon: string; text: string }> = {
  ok: { box: "bg-brand-50", icon: "text-brand-600", text: "text-slate-600" },
  soon: { box: "bg-amber-50", icon: "text-amber-700", text: "font-semibold text-amber-800" },
  expired: { box: "bg-red-50", icon: "text-red-700", text: "font-semibold text-red-800" },
  missing: { box: "bg-slate-50", icon: "text-slate-400", text: "text-slate-500" },
};

function ContractorDocket({ d, closeHref, today, canSeeMoney }: { d: ContactDocketData; closeHref: string; today: string; canSeeMoney: boolean }) {
  const c = d.customer;
  const items = contractorCompliance(c, today);
  const alert = complianceAlert(c, today);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  const when = (i: (typeof items)[number]) => (i.state === "missing" ? "No expiry date on file" : i.state === "expired" ? `Expired ${dmy(i.date!)}` : i.state === "soon" ? `Expires in ${i.days} day${i.days === 1 ? "" : "s"} · ask for the new one` : `Expires ${dmy(i.date!)}`);
  const lines = [
    { key: "licence", title: c.licence_no ? `Licence ${c.licence_no}` : "Licence", sub: c.licence_class },
    { key: "pl", title: c.pl_cover ? `Public liability ${c.pl_cover}` : "Public liability", sub: null },
    { key: "workcover", title: "WorkCover", sub: null },
  ] as const;
  const okCount = items.filter((i) => i.state === "ok").length;
  return (
    <Shell claude={<ClaudeBar contactId={c.id} firstName={c.name.split(" ")[0] || c.name} ready={aiEnabled()} />} id={c.id} tag={[TYPE_LABEL.contractor, c.trade].filter(Boolean).join(" · ")} sinceIso={c.created_at} name={c.name} sub={[c.company, c.city].filter(Boolean).join(" · ") || c.trade || "Contractor"}
      stats={[{ k: "On jobs", v: String(d.onJobs.length) }, { k: "Licence & ins.", v: alert ? (alert.tone === "red" ? "Expired" : "Due soon") : okCount ? "Current" : "Not set", warn: Boolean(alert) }, { k: "GST", v: c.gst_registered === true ? "Yes" : c.gst_registered === false ? "No" : "–" }]}
      closeHref={closeHref} phone={c.phone} email={c.email}>
      <Section title="Licence & insurance">
        <ul className="space-y-2" data-compliance>
          {lines.map((l) => { const i = byKey[l.key]!; const t = TONE[i.state]; return (
            <li key={l.key} data-state={i.state} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5", t.box)}>
              <Icon d={SHIELD} className={cx("h-5 w-5", t.icon)} />
              <span className="min-w-0 flex-1 text-sm"><b className="block text-ink">{l.title}</b><span className={t.text}>{[l.sub, when(i)].filter(Boolean).join(" · ")}</span></span>
            </li>
          ); })}
        </ul>
      </Section>
      <Section title="Jobs" count={d.onJobs.length}>
        {d.onJobs.length > 0 && (
          <ul className="-mx-2 divide-y divide-slate-100" data-contact-onjobs>
            {d.onJobs.map((j) => (
              <li key={j.job_id} className="flex items-center gap-2">
                <Link href={`/app/jobs?job=${j.job_id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{[j.who, j.where].filter(Boolean).join(" · ") || j.title}</span><span className="block text-xs text-slate-500">{[STAGE_LABEL[j.stage] ?? label(j.stage), j.role].filter(Boolean).join(" · ")}</span></span>
                  <Icon d={CHEV} className="h-4 w-4 text-slate-400" />
                </Link>
                <form action={removeFromJob}><input type="hidden" name="job_id" value={j.job_id} /><input type="hidden" name="contact_id" value={c.id} /><button aria-label="Take off this job" className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-red-700">✕</button></form>
              </li>
            ))}
          </ul>
        )}
        {d.openJobs.length > 0 ? (
          <ActionForm action={addToJob} className="mt-2 flex gap-2">
            <input type="hidden" name="contact_id" value={c.id} />
            <Select name="job_id" defaultValue="" aria-label="Add to a job" className="min-w-0 flex-1"><option value="" disabled>Add to a job…</option>{d.openJobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</Select>
            <SubmitButton variant="secondary" className="shrink-0">Add</SubmitButton>
          </ActionForm>
        ) : d.onJobs.length === 0 ? <p className="text-sm text-slate-500">No open jobs to add them to.</p> : null}
      </Section>
      <Section title="Paying them">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm" data-paying>
          <div><dt className="text-[11px] text-slate-500">ABN</dt><dd className="font-medium text-ink">{c.abn ?? "–"}</dd></div>
          <div><dt className="text-[11px] text-slate-500">Rate</dt><dd className="font-medium text-ink">{c.rate ?? "–"}</dd></div>
          <div><dt className="text-[11px] text-slate-500">GST</dt><dd className="font-medium text-ink">{c.gst_registered === true ? "Registered" : c.gst_registered === false ? "Not registered" : "–"}</dd></div>
          <div><dt className="text-[11px] text-slate-500">Bank</dt><dd className="font-medium text-ink">{c.bank_account ? `${c.bank_bsb ? `${c.bank_bsb} · ` : ""}Acc ••• ${c.bank_account.slice(-4)}` : "–"}</dd></div>
        </dl>
      </Section>
      <ReferralsSection d={d} canSeeMoney={canSeeMoney} />
      <Notes notes={c.notes} />
      <EditDetails><EditContact c={c} /></EditDetails>
    </Shell>
  );
}

function OtherDocket({ d, closeHref, canSeeMoney }: { d: ContactDocketData; closeHref: string; canSeeMoney: boolean }) {
  const c = d.customer;
  const address = fullAddress(c);
  return (
    <Shell claude={<ClaudeBar contactId={c.id} firstName={c.name.split(" ")[0] || c.name} ready={aiEnabled()} />} id={c.id} tag={TYPE_LABEL.other} sinceIso={c.created_at} name={c.name} sub={[c.company, c.city].filter(Boolean).join(" · ") || "Contact"} stats={[]} closeHref={closeHref} phone={c.phone} email={c.email}>
      <Section title="Contact">
        {c.phone && <Row icon={PHONE} k="Phone" v={c.phone} href={tel(c.phone)} />}
        {c.email && <Row icon={MAIL} k="Email" v={c.email} href={`mailto:${c.email}`} />}
        {address && <Row icon={PIN} k="Address" v={address} />}
        {!c.phone && !c.email && !address && <p className="text-sm text-slate-500">No details yet. Add them under Edit details.</p>}
      </Section>
      <ReferralsSection d={d} canSeeMoney={canSeeMoney} />
      <Notes notes={c.notes} />
      <EditDetails><EditContact c={c} /></EditDetails>
    </Shell>
  );
}

/** Customers keep their docket (with the type picker in Edit details); other kinds get their own. */
export function ContactDocket({ d, closeHref, canSeeMoney, today }: { d: ContactDocketData; closeHref: string; canSeeMoney: boolean; today: string }) {
  if (d.customer.kind === "builder") return <BuilderDocket d={d} closeHref={closeHref} canSeeMoney={canSeeMoney} />;
  if (d.customer.kind === "contractor") return <ContractorDocket d={d} closeHref={closeHref} today={today} canSeeMoney={canSeeMoney} />;
  if (d.customer.kind === "other") return <OtherDocket d={d} closeHref={closeHref} canSeeMoney={canSeeMoney} />;
  return <CustomerDocket d={d} closeHref={closeHref} canSeeMoney={canSeeMoney} today={today} edit={<EditContact c={d.customer} />} />;
}

// ---------- suppliers ----------
export type SupplierOrder = { id: string; who: string; status: string; total: number | null; invoiced: boolean; paid_at: string | null; created_at: string; job_id: string };
export type SupplierDocketData = { s: SupplierEdit & { category: string | null; created_at: string; is_default: boolean }; orders: SupplierOrder[]; toPay: number; thisMonth: number; orderCount: number; priceList: { name: string | null; effective_date: string | null } | null };

export async function loadSupplierDocket(supabase: DB, id: string): Promise<SupplierDocketData | null> {
  const [{ data: row }, { data: orders, count }, { data: list }] = await Promise.all([
    supabase.from("org_suppliers").select("*, suppliers(name, category)").eq("id", id).maybeSingle(),
    supabase.from("material_orders").select("id, status, invoice_no, invoice_ex, invoice_gst, paid_at, created_at, job_id, jobs(site_address, customers(name))", { count: "exact" }).eq("org_supplier_id", id).order("created_at", { ascending: false }).limit(12),
    supabase.from("supplier_price_lists").select("name, effective_date").eq("org_supplier_id", id).eq("is_active", true).eq("status", "ready").maybeSingle(),
  ]);
  if (!row) return null;
  const r = row as Record<string, unknown> & { suppliers: { name: string; category: string } | null };
  type O = { id: string; status: string; invoice_no: string | null; invoice_ex: number | null; invoice_gst: number | null; paid_at: string | null; created_at: string; job_id: string; jobs: unknown };
  const month = new Date().toISOString().slice(0, 7);
  let toPay = 0, thisMonth = 0;
  const list2 = ((orders ?? []) as O[]).map((o) => {
    const j = one(o.jobs as { site_address: string | null; customers: unknown });
    const total = o.invoice_no ? Number(o.invoice_ex ?? 0) + Number(o.invoice_gst ?? 0) : null;
    if (total && !o.paid_at) toPay += total;
    if (total && (o.paid_at ?? o.created_at).slice(0, 7) === month) thisMonth += total;
    const suburb = j?.site_address?.split(",").slice(-2, -1)[0]?.trim().replace(/\s+(QLD|NSW|VIC|WA|SA|TAS|ACT|NT)\b.*$/, "");
    return { id: o.id, who: [one(j?.customers as { name: string })?.name, suburb].filter(Boolean).join(" · ") || "Order", status: o.status, total, invoiced: Boolean(o.invoice_no), paid_at: o.paid_at, created_at: o.created_at, job_id: o.job_id };
  });
  const s = {
    id: String(r.id), name: orgSupplierName(r as { custom_name?: string | null; suppliers?: { name: string } | null }), fromDirectory: Boolean(r.supplier_id), category: r.suppliers?.category ?? null,
    branch_name: (r.branch_name as string) ?? null, branch_phone: (r.branch_phone as string) ?? null, branch_email: (r.branch_email as string) ?? null, account_number: (r.account_number as string) ?? null,
    abn: (r.abn as string) ?? null, rep_name: (r.rep_name as string) ?? null, rep_phone: (r.rep_phone as string) ?? null, bank_name: (r.bank_name as string) ?? null, bank_bsb: (r.bank_bsb as string) ?? null,
    bank_account: (r.bank_account as string) ?? null, notes: (r.notes as string) ?? null, created_at: String(r.created_at), is_default: Boolean(r.is_default),
  };
  return { s, orders: list2, toPay, thisMonth, orderCount: count ?? list2.length, priceList: (list as { name: string | null; effective_date: string | null } | null) ?? null };
}

const ORDER_STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", confirmed: "Confirmed", delivered: "Delivered", cancelled: "Cancelled" };

export function SupplierDocket({ d, closeHref, canSeeMoney, canEdit }: { d: SupplierDocketData; closeHref: string; canSeeMoney: boolean; canEdit: boolean }) {
  const s = d.s;
  const phone = s.rep_phone ?? s.branch_phone;
  return (
    <Shell claude={<ClaudeBar supplierId={s.id} firstName={s.name} ready={aiEnabled()} />} id={s.id} tag={[TYPE_LABEL.supplier, s.is_default ? "Default" : null].filter(Boolean).join(" · ")} sinceIso={s.created_at} name={s.name}
      sub={[s.category ? SUPPLIER_CATEGORY_LABEL[s.category] ?? null : null, s.branch_name].filter(Boolean).join(" · ") || "Supplier"}
      stats={canSeeMoney ? [{ k: "Orders", v: String(d.orderCount) }, { k: "This month", v: aud(d.thisMonth) }, { k: "To pay", v: aud(d.toPay), warn: d.toPay > 0 }] : [{ k: "Orders", v: String(d.orderCount) }]}
      fullHref={canSeeMoney ? `/app/settings/suppliers/${s.id}` : undefined} closeHref={closeHref} phone={phone} email={s.branch_email}>
      <Section title="Account">
        {s.account_number && <Row icon={DOC} k="Account number" v={s.account_number} />}
        {s.rep_name && <Row icon={PHONE} k="Rep" v={[s.rep_name, s.rep_phone].filter(Boolean).join(" · ")} href={s.rep_phone ? tel(s.rep_phone) : undefined} />}
        {s.branch_phone && <Row icon={PHONE} k="Branch" v={s.branch_phone} href={tel(s.branch_phone)} />}
        {s.branch_email && <Row icon={MAIL} k="Orders go to" v={s.branch_email} href={`mailto:${s.branch_email}`} />}
        {canSeeMoney && s.bank_account && <Row icon={BANK} k="Bank (for paying invoices)" v={`${s.bank_bsb ? `BSB ${s.bank_bsb} · ` : ""}Acc ••• ${s.bank_account.slice(-4)}`} />}
        {!s.account_number && !s.rep_name && !s.branch_phone && !s.branch_email && <p className="text-sm text-slate-500">No account details yet. Add them under Edit details.</p>}
      </Section>
      <Section title="Orders" count={d.orderCount}>
        {d.orders.length === 0 ? <p className="text-sm text-slate-500">No orders yet. Order from a job&apos;s materials list.</p> : (
          <ul className="-mx-2 divide-y divide-slate-100" data-supplier-orders>
            {d.orders.map((o) => {
              const owe = o.invoiced && !o.paid_at;
              return (
                <li key={o.id}>
                  <Link href={`/app/jobs?job=${o.job_id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{o.who}</span>
                      <span className={cx("block text-xs", owe ? "font-semibold text-amber-700" : "text-slate-500")}>{o.paid_at ? `Paid ${paidAt(o.paid_at)}` : owe ? `${ORDER_STATUS[o.status] ?? label(o.status)} · invoice to pay` : ORDER_STATUS[o.status] ?? label(o.status)}</span>
                    </span>
                    {canSeeMoney && o.total !== null && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{aud(o.total)}</span>}
                    <Icon d={CHEV} className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {canSeeMoney && (
        <Section title="Price list">
          <p className="text-sm text-slate-600" data-price-list>{d.priceList ? <>Using <b className="text-ink">{d.priceList.name ?? "their price list"}</b>{d.priceList.effective_date ? ` · from ${dmy(d.priceList.effective_date)}` : ""}</> : "No price list yet. Quotes use the standard price guide."}</p>
          <Link href={`/app/settings/suppliers/${s.id}/import`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:text-brand-700">{d.priceList ? "Upload a new price list" : "Upload their price list"}</Link>
        </Section>
      )}
      <Notes notes={s.notes} />
      {canEdit && <EditDetails><EditSupplier s={s} /></EditDetails>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Suppliers you order from in Materials show up here automatically.</p>
    </Shell>
  );
}
