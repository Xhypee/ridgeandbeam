import Link from "next/link";
import type { Metadata } from "next";
import { Empty, Input, LinkButton, PageHeader, Table, td, th } from "@/components/ui";
import { NewLeadPanel } from "../jobs/new-lead-panel";
import { CustomerDocket, loadCustomerDocket } from "./customer-docket";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, label } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = { title: "Customers" };

const PER_PAGE = 100;

export default async function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  const { supabase, org, canSeeMoney } = await requireOrg();
  const { q, page: pageParam, new: adding, customer: customerParam } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const from = (page - 1) * PER_PAGE;

  let req = supabase.from("customers").select("*, jobs(id, is_insurance, claims(id))", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, from + PER_PAGE - 1);
  if (query) {
    const safe = query.replace(/[%,()]/g, " ");
    req = req.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  const { data, error, count } = await req;
  if (error) throw new Error(error.message);
  const customers = (data ?? []) as (Customer & { jobs: { id: string; is_insurance: boolean; claims: { id: string } | { id: string }[] | null }[] })[];
  const today = isoDate(new Date());
  const total = count ?? customers.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number, extra: Record<string, string> = {}) => `/app/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(n > 1 ? { page: String(n) } : {}), ...extra })}`.replace(/\?$/, "");
  // ?customer=<id> opens that customer's docket in a right sidebar; ?new=1 opens the New customer form there.
  const openId = typeof customerParam === "string" && /^[0-9a-f-]{36}$/i.test(customerParam) ? customerParam : null;
  const docket = openId ? await loadCustomerDocket(supabase, openId, { canSeeMoney }) : null;
  const open = !docket && adding === "1";

  const list = (
    <>
      <PageHeader title="Customers" subtitle={total ? `${total} ${total === 1 ? "customer" : "customers"}${query ? ` matching “${query}”` : ""}` : "Homeowners, property managers, and leads."} actions={<LinkButton href={pageHref(page, { new: "1" })} scroll={false} aria-current={open ? "true" : undefined}>New customer</LinkButton>} />
      <form action="/app/customers" className="mb-4 max-w-sm">
        <Input name="q" defaultValue={query} placeholder="Search name, phone, email, address…" />
      </form>
      {customers.length === 0 ? (
        <Empty title={query ? "No matches" : "No customers yet"}>
          {query ? "Try a different search." : "Add your first lead to get started."}
        </Empty>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr><th className={th}>Name</th><th className={th}>Contact</th><th className={th}>Location</th><th className={th}>Source</th><th className={th}>Jobs</th><th className={th}>Follow up</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c.id} aria-current={docket?.customer.id === c.id ? "true" : undefined} className="relative cursor-pointer hover:bg-slate-50 aria-[current]:bg-brand-50">
                <td className={td}>
                  <Link href={pageHref(page, { customer: c.id })} scroll={false} className="font-medium text-slate-900 before:absolute before:inset-0 hover:text-brand-600">{c.name}</Link>
                  {c.jobs?.some((j) => j.is_insurance || (Array.isArray(j.claims) ? j.claims.length > 0 : Boolean(j.claims))) && <span className="ml-2 text-xs text-violet-700">Insurance</span>}
                </td>
                <td className={td}><div>{c.phone}</div><div className="text-xs text-slate-500">{c.email}</div></td>
                <td className={td}>{[c.city, c.state].filter(Boolean).join(", ")}</td>
                <td className={td}>{label(c.source)}</td>
                <td className={td}>{c.jobs?.length ?? 0}</td>
                <td className={td}>
                  {c.follow_up_on && (
                    <span className={c.follow_up_on <= today ? "font-medium text-red-600" : ""}>{date(c.follow_up_on, { month: "short", day: "numeric" })}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Showing {from + 1}–{Math.min(from + PER_PAGE, total)} of {total}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-full px-4 py-2 font-semibold ring-1 ring-slate-300 hover:ring-slate-400">Previous</Link>}
            {page < pages && <Link href={pageHref(page + 1)} className="rounded-full px-4 py-2 font-semibold ring-1 ring-slate-300 hover:ring-slate-400">Next</Link>}
          </span>
        </nav>
      )}
    </>
  );

  if (!open && !docket) return list;
  return (
    <div className="lg:flex lg:h-screen">
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-7">
        {list}
      </div>
      <aside aria-label={docket ? `Customer: ${docket.customer.name}` : "New customer"} className="fixed inset-0 z-30 flex flex-col bg-cream lg:static lg:z-auto lg:h-screen lg:w-[440px] lg:shrink-0 lg:border-l lg:border-slate-200 xl:w-[460px]">
        {docket
          ? <CustomerDocket key={docket.customer.id} d={docket} closeHref={pageHref(page)} canSeeMoney={canSeeMoney} today={today} />
          : <NewLeadPanel variant="customer" closeHref={pageHref(page)} defaultState={org.state ?? null} />}
      </aside>
    </div>
  );
}
