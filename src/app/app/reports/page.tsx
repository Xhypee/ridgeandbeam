import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { isAdmin, isSalesRep } = await requireMoneyAccess();
  const reports = [
    { href: "/app/reports/profitability", title: "Job profitability", body: isSalesRep ? "Contract value, costs, gross profit and margin on your jobs." : "Contract value, costs, gross profit and margin per job. Sort and filter by date and rep." },
    { href: "/app/reports/commissions", title: isAdmin ? "Commissions" : "My commission statement", body: isAdmin ? "Every rep's statement: earned, paid, pending supplements and payable now. Record payouts and chargebacks." : "Every cost line, commission earned, paid to date and payable now on your jobs." },
    { href: "/app/reports/leads", title: "Lead sources", body: "Cost per lead and per sold job by source." },
  ];
  return (
    <>
      <PageHeader title="Reports" />
      <div className="grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <Link key={r.href} href={r.href} className="block rounded-xl bg-white p-5 ring-1 ring-slate-200 transition hover:ring-brand-500">
            <p className="font-semibold text-slate-900">{r.title}</p>
            <p className="mt-1 text-sm text-slate-500">{r.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
