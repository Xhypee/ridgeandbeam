import Link from "next/link";
import type { Metadata } from "next";
import { Empty, Input, LinkButton, cx } from "@/components/ui";
import { complianceAlert, CONTACT_TYPES, isContactType, TYPE_BADGE, TYPE_LABEL, TYPE_PLURAL, type ContactType } from "@/lib/contacts";
import { aiEnabled } from "@/lib/ai";
import { requireOrg } from "@/lib/dal";
import { date, isoDate } from "@/lib/format";
import { orgSupplierName } from "@/lib/suppliers";
import { ContactDocket, loadContactDocket, loadSupplierDocket, SupplierDocket } from "./contact-docket";
import { NewContactPanel } from "./contact-form";

export const metadata: Metadata = { title: "Contacts" };

const PER_PAGE = 100;
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type Row = { key: string; href: string; type: ContactType; name: string; sub: string | null; phone: string | null; email: string | null; where: string; now: string; tone: "red" | "amber" | null; created_at: string; current: boolean };

export default async function ContactsPage({ searchParams }: PageProps<"/app/contacts">) {
  const { supabase, org, canSeeMoney, role, isAdmin } = await requireOrg();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const type: ContactType | null = isContactType(sp.type) ? sp.type : null;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const from = (page - 1) * PER_PAGE;
  const today = isoDate(new Date());
  const href = (extra: Record<string, string> = {}, keepPage = true) => `/app/contacts?${new URLSearchParams({ ...(type ? { type } : {}), ...(query ? { q: query } : {}), ...(keepPage && page > 1 ? { page: String(page) } : {}), ...extra })}`.replace(/\?$/, "");

  const openContact = typeof sp.contact === "string" && /^[0-9a-f-]{36}$/i.test(sp.contact) ? sp.contact : null;
  const openSupplier = !openContact && typeof sp.supplier === "string" && /^[0-9a-f-]{36}$/i.test(sp.supplier) ? sp.supplier : null;
  const adding = !openContact && !openSupplier && sp.new === "1";
  const safe = query.replace(/[%,()]/g, " ");

  // People (customers, builders, contractors, others).
  const wantPeople = type !== "supplier";
  let req = supabase.from("customers")
    .select("id, name, kind, company, trade, phone, email, city, state, follow_up_on, licence_expiry, pl_expiry, workcover_expiry, created_at, jobs(id, is_insurance), job_contacts(job_id), contact_people(name, role)", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, from + PER_PAGE - 1);
  if (type) req = req.eq("kind", type);
  if (query) req = req.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%,company.ilike.%${safe}%,trade.ilike.%${safe}%`);
  // Suppliers come from Materials (org_suppliers), listed on the first page.
  const wantSuppliers = (type === null || type === "supplier") && page === 1;
  const kindCount = (k: string) => supabase.from("customers").select("id", { count: "exact", head: true }).eq("kind", k);
  const [people, sups, owed, ...counts] = await Promise.all([
    wantPeople ? req : Promise.resolve({ data: [], count: 0, error: null }),
    supabase.from("org_suppliers").select("id, custom_name, branch_name, branch_phone, branch_email, account_number, rep_name, rep_phone, created_at, suppliers(name)").order("created_at", { ascending: false }),
    canSeeMoney ? supabase.from("material_orders").select("org_supplier_id, invoice_no, invoice_ex, invoice_gst, paid_at").not("org_supplier_id", "is", null).limit(3000) : Promise.resolve({ data: [] }),
    kindCount("customer"), kindCount("builder"), kindCount("contractor"), kindCount("other"),
  ]);
  if (people.error) throw new Error(people.error.message);

  type P = { id: string; name: string; kind: Exclude<ContactType, "supplier">; company: string | null; trade: string | null; phone: string | null; email: string | null; city: string | null; state: string | null; follow_up_on: string | null; licence_expiry: string | null; pl_expiry: string | null; workcover_expiry: string | null; created_at: string; jobs: { id: string; is_insurance: boolean }[] | null; job_contacts: { job_id: string }[] | null; contact_people: { name: string; role: string | null }[] | null };
  const rows: Row[] = ((people.data ?? []) as unknown as P[]).map((c) => {
    const jobs = c.jobs?.length ?? 0, on = c.job_contacts?.length ?? 0;
    const where = [c.city, c.state].filter(Boolean).join(", ");
    const base = { key: `c-${c.id}`, href: href({ contact: c.id }), type: c.kind as ContactType, name: c.name, phone: c.phone, email: c.email, where, created_at: c.created_at, current: openContact === c.id };
    if (c.kind === "contractor") {
      const alert = complianceAlert(c, today);
      return { ...base, sub: [c.trade, c.company].filter(Boolean).join(" · ") || null, now: alert?.text ?? (on ? `On ${on} job${on === 1 ? "" : "s"}` : "No jobs yet"), tone: alert?.tone ?? null };
    }
    if (c.kind === "builder") {
      const p = c.contact_people?.[0];
      return { ...base, sub: p ? [p.name, p.role].filter(Boolean).join(" · ") : null, now: jobs ? `${jobs} job${jobs === 1 ? "" : "s"}` : "No jobs yet", tone: null };
    }
    if (c.kind === "other") return { ...base, sub: c.company, now: on ? `On ${on} job${on === 1 ? "" : "s"}` : "–", tone: null };
    const due = c.follow_up_on && c.follow_up_on <= today;
    const insurance = c.jobs?.some((j) => j.is_insurance);
    return { ...base, sub: insurance ? "Insurance" : null, now: [jobs ? `${jobs} job${jobs === 1 ? "" : "s"}` : "No jobs yet", c.follow_up_on ? `follow up ${date(c.follow_up_on, { month: "short", day: "numeric" })}` : null].filter(Boolean).join(" · "), tone: due ? "red" : null };
  });

  type S = { id: string; custom_name: string | null; branch_name: string | null; branch_phone: string | null; branch_email: string | null; account_number: string | null; rep_name: string | null; rep_phone: string | null; created_at: string; suppliers: unknown };
  const toPay = new Map<string, number>(), orders = new Map<string, number>();
  for (const o of (owed.data ?? []) as { org_supplier_id: string; invoice_no: string | null; invoice_ex: number | null; invoice_gst: number | null; paid_at: string | null }[]) {
    orders.set(o.org_supplier_id, (orders.get(o.org_supplier_id) ?? 0) + 1);
    if (o.invoice_no && !o.paid_at) toPay.set(o.org_supplier_id, (toPay.get(o.org_supplier_id) ?? 0) + Number(o.invoice_ex ?? 0) + Number(o.invoice_gst ?? 0));
  }
  const allSuppliers = ((sups.data ?? []) as S[]).map((s) => ({ ...s, name: orgSupplierName({ custom_name: s.custom_name, suppliers: one(s.suppliers as { name: string }) }) }));
  const q = query.toLowerCase();
  const supplierRows: Row[] = allSuppliers
    .filter((s) => !q || [s.name, s.branch_name, s.branch_email, s.branch_phone, s.rep_name, s.account_number].some((x) => x?.toLowerCase().includes(q)))
    .map((s) => {
      const owe = toPay.get(s.id) ?? 0, n = orders.get(s.id) ?? 0;
      return { key: `s-${s.id}`, href: href({ supplier: s.id }), type: "supplier", name: s.name, sub: [s.account_number ? `Acc ${s.account_number}` : null, s.rep_name ? `${s.rep_name} (rep)` : null].filter(Boolean).join(" · ") || null, phone: s.rep_phone ?? s.branch_phone, email: s.branch_email, where: s.branch_name ?? "", now: canSeeMoney && owe > 0 ? `${aud(owe)} to pay` : n ? `${n} order${n === 1 ? "" : "s"}` : "No orders yet", tone: canSeeMoney && owe > 0 ? "amber" : null, created_at: s.created_at, current: openSupplier === s.id };
    });
  const list = [...rows, ...(wantSuppliers ? supplierRows : [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const [cCustomer, cBuilder, cContractor, cOther] = counts.map((r) => (r as { count: number | null }).count ?? 0);
  const countOf: Record<ContactType, number> = { customer: cCustomer, builder: cBuilder, supplier: allSuppliers.length, contractor: cContractor, other: cOther };
  const all = Object.values(countOf).reduce((a, b) => a + b, 0);
  const peopleTotal = people.count ?? rows.length;
  const pages = Math.max(1, Math.ceil(peopleTotal / PER_PAGE));
  const chip = (t: ContactType | null, n: number) => {
    const on = type === t;
    const h = `/app/contacts?${new URLSearchParams({ ...(t ? { type: t } : {}), ...(query ? { q: query } : {}) })}`.replace(/\?$/, "");
    return <Link key={t ?? "all"} href={h} aria-current={on ? "page" : undefined} data-type-filter={t ?? "all"} className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold", on ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-slate-300 hover:ring-slate-400")}>{t ? TYPE_PLURAL[t] : "All"}<span className={on ? "text-white/60" : "text-slate-400"}>{n}</span></Link>;
  };

  const docket = openContact ? await loadContactDocket(supabase, openContact, { canSeeMoney }) : null;
  const supplier = openSupplier ? await loadSupplierDocket(supabase, openSupplier) : null;
  const closeHref = href();

  const content = (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">{all} contact{all === 1 ? "" : "s"} · customers, builders, suppliers, contractors{query ? ` · matching “${query}”` : ""}</p>
        </div>
        <LinkButton href={href({ new: "1" })} scroll={false} aria-current={adding ? "true" : undefined} className="h-11 px-5 text-[15px]">+ New contact</LinkButton>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Contact type" className="flex flex-wrap gap-2">{chip(null, all)}{CONTACT_TYPES.map((t) => chip(t, countOf[t]))}</nav>
        <form action="/app/contacts" className="ml-auto w-full sm:w-64">
          {type && <input type="hidden" name="type" value={type} />}
          <Input name="q" defaultValue={query} placeholder="Search name, phone, email…" className="h-9 rounded-full" />
        </form>
      </div>
      {list.length === 0 ? (
        <Empty title={query ? "No matches" : type ? `No ${TYPE_PLURAL[type].toLowerCase()} yet` : "No contacts yet"}>{query ? "Try a different search." : "Add one with + New contact."}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-sm" data-contacts>
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Where</th><th className="px-4 py-3">Right now</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.key} data-contact-row={r.type} aria-current={r.current ? "true" : undefined} className="relative cursor-pointer hover:bg-slate-50 aria-[current]:bg-brand-50">
                  <td className="px-4 py-3">
                    <Link href={r.href} scroll={false} className="block font-semibold text-ink before:absolute before:inset-0">{r.name}</Link>
                    {r.sub && <span className={cx("text-xs", r.sub === "Insurance" ? "text-violet-700" : "text-slate-500")}>{r.sub}</span>}
                  </td>
                  <td className="px-4 py-3"><span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", TYPE_BADGE[r.type])}>{TYPE_LABEL[r.type]}</span></td>
                  <td className="px-4 py-3"><div className="text-ink">{r.phone}</div><div className="max-w-[220px] truncate text-xs text-slate-500">{r.email}</div></td>
                  <td className="px-4 py-3 text-slate-600">{r.where}</td>
                  <td className={cx("px-4 py-3", r.tone === "red" ? "font-semibold text-red-700" : r.tone === "amber" ? "font-semibold text-amber-700" : "text-slate-600")} data-right-now>{r.now}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={href({ page: String(page - 1) }, false)} className="rounded-full px-4 py-2 font-semibold ring-1 ring-slate-300 hover:ring-slate-400">Previous</Link>}
            {page < pages && <Link href={href({ page: String(page + 1) }, false)} className="rounded-full px-4 py-2 font-semibold ring-1 ring-slate-300 hover:ring-slate-400">Next</Link>}
          </span>
        </nav>
      )}
    </>
  );

  const side = docket ? <ContactDocket key={docket.customer.id} d={docket} closeHref={closeHref} canSeeMoney={canSeeMoney} today={today} aiReady={aiEnabled()} />
    : supplier ? <SupplierDocket key={supplier.s.id} d={supplier} closeHref={closeHref} canSeeMoney={canSeeMoney} canEdit={isAdmin || role === "member"} aiReady={aiEnabled()} />
    : adding ? <NewContactPanel closeHref={closeHref} initial={type ?? "customer"} defaultState={org.state ?? null} aiReady={aiEnabled()} /> : null;
  if (!side) return content;
  return (
    <div className="lg:flex lg:h-screen">
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-7">{content}</div>
      <aside aria-label={docket ? `Contact: ${docket.customer.name}` : supplier ? `Supplier: ${supplier.s.name}` : "New contact"} className="fixed inset-0 z-30 flex flex-col bg-cream lg:static lg:z-auto lg:h-screen lg:w-[440px] lg:shrink-0 lg:border-l lg:border-slate-200 xl:w-[460px]">
        {side}
      </aside>
    </div>
  );
}
