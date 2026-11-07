import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Empty, PageHeader, Table, td, th, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, label, money, STATUS_TONE } from "@/lib/format";

export const metadata: Metadata = { title: "Quotes" };

const FILTERS = ["all", "draft", "sent", "accepted", "declined"] as const;

export default async function EstimatesPage({ searchParams }: PageProps<"/app/estimates">) {
  const { supabase } = await requireMoneyAccess();
  const { status } = await searchParams;
  const f = FILTERS.includes(status as (typeof FILTERS)[number]) ? (status as string) : "all";
  let q = supabase
    .from("estimates")
    .select("id, number, status, created_at, sent_at, estimate_totals(total), estimate_options!estimate_options_estimate_id_fkey(id, name), selected_option_id, jobs(id, title, customers(name))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (f !== "all") q = q.eq("status", f);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    id: string; number: number; status: string; created_at: string;
    estimate_totals: { total: number }[] | { total: number } | null;
    estimate_options: { id: string; name: string }[] | null;
    selected_option_id: string | null;
    jobs: { id: string; title: string; customers: { name: string } };
  }[];
  // Totals come from estimate_totals: shared lines + the selected (else recommended) option.
  const optionNote = (r: (typeof rows)[number]) => {
    const opts = r.estimate_options ?? [];
    if (!opts.length) return null;
    const sel = opts.find((o) => o.id === r.selected_option_id);
    return sel ? `Chose ${sel.name}` : `${opts.length} options · recommended shown`;
  };
  const totalOf = (r: (typeof rows)[number]) => (Array.isArray(r.estimate_totals) ? r.estimate_totals[0]?.total : r.estimate_totals?.total) ?? 0;

  return (
    <>
      <PageHeader title="Quotes" subtitle="Start a quote from a job so it’s tied to the customer and the site." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <Link key={x} href={x === "all" ? "/app/estimates" : `/app/estimates?status=${x}`}
            className={cx("rounded-full px-3 py-1 text-sm", f === x ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {label(x)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No quotes yet">Open a job and click <b>New quote</b>.</Empty>
      ) : (
        <Table>
          <thead className="bg-slate-50"><tr><th className={th}>#</th><th className={th}>Customer / job</th><th className={th}>Created</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className={td}><Link href={`/app/estimates/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">#{r.number}</Link></td>
                <td className={td}><div className="font-medium text-slate-800">{r.jobs.customers.name}</div><div className="text-xs text-slate-500">{r.jobs.title}{optionNote(r) ? ` · ${optionNote(r)}` : ""}</div></td>
                <td className={td}>{date(r.created_at)}</td>
                <td className={td}><Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge></td>
                <td className={`${td} text-right tabular-nums`}>{money(totalOf(r))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
