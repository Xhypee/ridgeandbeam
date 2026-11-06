import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Empty, PageHeader, Table, td, th, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, label, money, STATUS_TONE } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

const FILTERS = ["all", "unpaid", "draft", "paid", "void"] as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/app/invoices">) {
  const { supabase } = await requireOrg();
  const { status } = await searchParams;
  const f = FILTERS.includes(status as (typeof FILTERS)[number]) ? (status as string) : "all";
  let q = supabase
    .from("invoices")
    .select("id, number, status, issue_date, due_date, invoice_totals(total, balance), jobs(title, customers(name))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (f === "unpaid") q = q.in("status", ["sent", "partial"]);
  else if (f !== "all") q = q.eq("status", f);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type T = { total: number; balance: number };
  const rows = (data ?? []) as unknown as {
    id: string; number: number; status: string; issue_date: string; due_date: string | null;
    invoice_totals: T[] | T | null; jobs: { title: string; customers: { name: string } };
  }[];
  const tot = (r: (typeof rows)[number]) => (Array.isArray(r.invoice_totals) ? r.invoice_totals[0] : r.invoice_totals);
  const today = isoDate(new Date());
  const outstanding = rows.filter((r) => ["sent", "partial"].includes(r.status)).reduce((s, r) => s + Number(tot(r)?.balance ?? 0), 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle={<>Outstanding on this list: <b className="text-slate-800">{money(outstanding)}</b></>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <Link key={x} href={x === "all" ? "/app/invoices" : `/app/invoices?status=${x}`}
            className={cx("rounded-full px-3 py-1 text-sm", f === x ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {label(x)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No invoices">Create one from a job or an accepted estimate.</Empty>
      ) : (
        <Table>
          <thead className="bg-slate-50"><tr><th className={th}>#</th><th className={th}>Customer / job</th><th className={th}>Issued</th><th className={th}>Due</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Balance</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const overdue = r.due_date && r.due_date < today && ["sent", "partial"].includes(r.status);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/app/invoices/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">#{r.number}</Link></td>
                  <td className={td}><div className="font-medium text-slate-800">{r.jobs.customers.name}</div><div className="text-xs text-slate-500">{r.jobs.title}</div></td>
                  <td className={td}>{date(r.issue_date)}</td>
                  <td className={cx(td, overdue && "font-medium text-red-600")}>{date(r.due_date)}</td>
                  <td className={td}><Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge></td>
                  <td className={`${td} text-right tabular-nums`}>{money(tot(r)?.total)}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.status === "void" ? "—" : money(tot(r)?.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
