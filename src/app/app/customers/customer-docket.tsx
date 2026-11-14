// Clicking a customer on Customers: their docket in the right sidebar (same frame as a job's docket).
// Who they are, what they've signed and still owe, their jobs (each opens on the Jobs board), notes, and an edit form.
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { createClient } from "@/lib/supabase/server";
import { label, STAGE_LABEL } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { Icon, Section } from "../jobs/job-sections";
import { updateCustomer } from "./actions";
import { ClaudeBar } from "../jobs/claude-bar";
import { loadReferrals, type Referrals } from "@/lib/referrals-server";
import { ReferralsSection } from "../contacts/referrals-section";
import { aiEnabled } from "@/lib/ai";
import { CustomerFields } from "./customer-fields";

type DB = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type CustomerDocketJob = { id: string; title: string; stage: string; is_insurance: boolean; created_at: string; value: number | null; owing: number };
export type CustomerDocketData = { customer: Customer; jobs: CustomerDocketJob[]; contract: number; paid: number; owing: number } & Referrals;

export async function loadCustomerDocket(supabase: DB, id: string, { canSeeMoney }: { canSeeMoney: boolean }): Promise<CustomerDocketData | null> {
  const money = canSeeMoney ? ", estimates(status, created_at, estimate_totals(total)), invoices(status, invoice_totals(total, paid, balance))" : "";
  const [{ data: c }, { data: rows }, refs] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("jobs").select(`id, title, stage, is_insurance, created_at${money}`).eq("customer_id", id).order("created_at", { ascending: false }),
    // Jobs this contact sent us.
    loadReferrals(supabase, "contact", id, { canSeeMoney }),
  ]);
  if (!c) return null;
  type E = { status: string; created_at: string; estimate_totals: unknown };
  type I = { status: string; invoice_totals: unknown };
  type R = { id: string; title: string; stage: string; is_insurance: boolean; created_at: string; estimates?: E[]; invoices?: I[] };
  let contract = 0, paid = 0, owing = 0;
  const jobs = ((rows ?? []) as unknown as R[]).map((j) => {
    const ests = (j.estimates ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = (e?: E) => (e ? Number(one(e.estimate_totals as { total: number })?.total ?? 0) : null);
    const accepted = ests.find((e) => e.status === "accepted");
    const value = accepted ? total(accepted) : total(ests.find((e) => e.status === "sent"));
    if (accepted) contract += value ?? 0;
    let jobOwing = 0;
    for (const inv of j.invoices ?? []) {
      if (inv.status === "void" || inv.status === "draft") continue;
      const t = one(inv.invoice_totals as { total: number; paid: number; balance: number });
      paid += Number(t?.paid ?? 0);
      jobOwing += Math.max(0, Number(t?.balance ?? 0));
    }
    owing += jobOwing;
    return { id: j.id, title: j.title, stage: j.stage, is_insurance: j.is_insurance, created_at: j.created_at, value, owing: jobOwing };
  });
  return { customer: c as Customer, jobs, contract, paid, owing, ...refs };
}

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2";
const SMS = "M4 5h16v11H8l-4 4z";
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const PIN = "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5";
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const since = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "Australia/Brisbane" });
const dayMonth = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

function Row({ icon, k, v, href }: { icon: string; k: string; v: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cream text-slate-600 ring-1 ring-slate-200"><Icon d={icon} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] text-slate-500">{k}</span><span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{v}</span></span>
    </>
  );
  return href ? <a href={href} className="flex items-center gap-3 rounded-lg py-1.5 hover:bg-slate-50">{inner}</a> : <div className="flex items-center gap-3 py-1.5">{inner}</div>;
}

export function CustomerDocket({ d, closeHref, canSeeMoney, today, edit }: { d: CustomerDocketData; closeHref: string; canSeeMoney: boolean; today: string; edit?: React.ReactNode }) {
  const c = d.customer;
  const address = [c.address, [c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const insurance = d.jobs.some((j) => j.is_insurance);
  const tag = ["Customer", insurance ? "Insurance" : null].filter(Boolean).join(" · ");
  const btn = "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold";
  const overdue = c.follow_up_on && c.follow_up_on <= today;

  return (
    <div className="flex h-full flex-col bg-cream p-4" data-customer-docket={c.id}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="bg-brand-500 px-5 pb-5 pt-4 text-white">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              <span className="min-w-0 flex-1 truncate">{tag}</span>
              <span className="shrink-0">Since {since(c.created_at)}</span>
              <Link href={`/app/customers/${c.id}`} aria-label="Open the full customer page" title="Open the full customer page" className="-my-1 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></Link>
              <Link href={closeHref} scroll={false} aria-label="Close" className="-my-1 -mr-2 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></Link>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight">{c.name}</h2>
            <p className="truncate text-sm text-white/70">{address || c.email || c.phone || "No address yet"}</p>
            <dl className={cx("mt-5 grid gap-2", canSeeMoney ? "grid-cols-3" : "grid-cols-1")} data-customer-stats>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Jobs</dt><dd className="font-display text-[22px] font-bold leading-tight">{d.jobs.length}</dd></div>
              {canSeeMoney && <>
                <div><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Signed</dt><dd className="font-display text-[22px] font-bold leading-tight">{aud(d.contract)}</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Owing</dt><dd className={cx("font-display text-[22px] font-bold leading-tight", d.owing > 0 ? "text-amber-200" : "")}>{aud(d.owing)}</dd></div>
              </>}
            </dl>
          </div>

          <div className="flex gap-2 px-5 py-4">
            {c.phone ? <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className={cx(btn, "bg-brand-500 text-white hover:bg-brand-600")}><Icon d={PHONE} />Call</a>
              : <span className={cx(btn, "bg-slate-100 text-slate-400")}><Icon d={PHONE} />No mobile</span>}
            {c.phone && <a href={`sms:${c.phone.replace(/\s+/g, "")}`} className={cx(btn, "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}><Icon d={SMS} />Text</a>}
            {c.email && <a href={`mailto:${c.email}`} className={cx(btn, "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50")}><Icon d={MAIL} />Email</a>}
          </div>

          <Section title="Contact">
            {c.phone && <Row icon={PHONE} k="Mobile" v={c.phone} href={`tel:${c.phone.replace(/\s+/g, "")}`} />}
            {c.email && <Row icon={MAIL} k="Email" v={c.email} href={`mailto:${c.email}`} />}
            {address && <Row icon={PIN} k="Address" v={address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} />}
            <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <div><dt className="text-[11px] text-slate-500">Lead source</dt><dd className="font-medium text-ink">{label(c.source)}</dd></div>
              <div><dt className="text-[11px] text-slate-500">Follow up</dt><dd className={cx("font-medium", overdue ? "text-red-700" : "text-ink")}>{c.follow_up_on ? `${dayMonth(c.follow_up_on)}${overdue ? " · due" : ""}` : "None set"}</dd></div>
            </dl>
          </Section>

          <Section title="Jobs" count={d.jobs.length}>
            {d.jobs.length === 0 ? <p className="text-sm text-slate-500">No jobs yet.</p> : (
              <ul className="-mx-2 divide-y divide-slate-100" data-customer-jobs>
                {d.jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/app/jobs?job=${j.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{j.title}</span>
                        <span className="block text-xs text-slate-500">
                          {STAGE_LABEL[j.stage] ?? label(j.stage)}{j.is_insurance ? " · Insurance" : ""}
                          {canSeeMoney && j.owing > 0 ? <span className="font-semibold text-amber-700"> · {aud(j.owing)} owing</span> : null}
                        </span>
                      </span>
                      {canSeeMoney && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{j.value === null ? <span className="font-normal text-slate-400">Not quoted</span> : aud(j.value)}</span>}
                      <Icon d="M9 6l6 6-6 6" className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/app/jobs/new?customer=${c.id}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">+ New job for {c.name.split(" ")[0]}</Link>
          </Section>

          <ReferralsSection who={{ id: c.id, type: "contact", name: c.name }} r={d} canSeeMoney={canSeeMoney} />

          <Section title="Notes">
            {c.notes ? <p className="whitespace-pre-wrap rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-ink [overflow-wrap:anywhere]">{c.notes}</p> : <p className="text-sm text-slate-500">No notes. Add some under Edit details.</p>}
          </Section>

          <details className="group border-t border-slate-100" data-customer-edit>
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 [&::-webkit-details-marker]:hidden">
              <span className="font-semibold text-ink">Edit details</span>
              <Icon d="M6 9l6 6 6-6" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5">
              {edit ?? (
                <ActionForm action={updateCustomer} className="space-y-4">
                  <input type="hidden" name="id" value={c.id} />
                  <CustomerFields c={c} />
                  <SubmitButton className="min-h-12 w-full text-[15px]">Save changes</SubmitButton>
                </ActionForm>
              )}
            </div>
          </details>
        </div>
        <ClaudeBar contactId={c.id} firstName={c.name.split(" ")[0] || c.name} ready={aiEnabled()} />
      </div>
    </div>
  );
}
