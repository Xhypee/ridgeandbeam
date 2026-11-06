import Link from "next/link";
import type { Metadata } from "next";
import { Empty, Input, LinkButton, PageHeader, Table, td, th } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, label } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  const { supabase } = await requireOrg();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  let req = supabase.from("customers").select("*, jobs(count)").order("created_at", { ascending: false }).limit(200);
  if (query) {
    const safe = query.replace(/[%,()]/g, " ");
    req = req.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const customers = (data ?? []) as (Customer & { jobs: { count: number }[] })[];
  const today = isoDate(new Date());

  return (
    <>
      <PageHeader title="Customers" subtitle="Homeowners, property managers, and leads." actions={<LinkButton href="/app/customers/new">New customer</LinkButton>} />
      <form className="mb-4 max-w-sm">
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
              <tr key={c.id} className="hover:bg-slate-50">
                <td className={td}>
                  <Link href={`/app/customers/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">{c.name}</Link>
                  {c.claim_number && <span className="ml-2 text-xs text-violet-700">Insurance</span>}
                </td>
                <td className={td}><div>{c.phone}</div><div className="text-xs text-slate-500">{c.email}</div></td>
                <td className={td}>{[c.city, c.state].filter(Boolean).join(", ")}</td>
                <td className={td}>{label(c.source)}</td>
                <td className={td}>{c.jobs?.[0]?.count ?? 0}</td>
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
    </>
  );
}
