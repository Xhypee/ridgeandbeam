import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Input, LinkButton, PageHeader, Table, cx, td, th } from "@/components/ui";
import { formatAbn } from "@/lib/au";
import { requireMoneyAccess } from "@/lib/dal";
import { date, money } from "@/lib/format";
import { fyFromStart } from "@/lib/tpar";
import { saveCrewAbn } from "../actions";
import { pickYear, tparData } from "./data";

export const metadata: Metadata = { title: "Taxable payments (TPAR)" };

export default async function TparPage({ searchParams }: PageProps<"/app/reports/tpar">) {
  const { supabase, org, isAdmin } = await requireMoneyAccess();
  const sp = await searchParams;
  const fy = pickYear(sp.fy);
  const { rows, crews } = await tparData(supabase, org.id, fy);
  const total = rows.reduce((s, r) => s + r.gross, 0);
  const missing = rows.filter((r) => !r.abn).length;
  const years = [fy.startYear + 1, fy.startYear, fy.startYear - 1, fy.startYear - 2].map(fyFromStart);

  return (
    <>
      <PageHeader
        title="Taxable payments (TPAR)"
        subtitle={<>Payments to contractors for building and construction services, financial year {fy.label} (1 Jul {fy.startYear} – 30 Jun {fy.startYear + 1}). Lodge with the ATO by <b>{date(fy.dueDate, { day: "numeric", month: "long", year: "numeric" })}</b>.</>}
        actions={
          <>
            <LinkButton variant="secondary" href="/app/reports">All reports</LinkButton>
            {isAdmin && <LinkButton href={`/app/reports/tpar/csv?fy=${fy.startYear}`} prefetch={false} data-testid="tpar-csv">Download CSV</LinkButton>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <Link key={y.startYear} href={`/app/reports/tpar?fy=${y.startYear}`} className={cx("inline-flex min-h-11 items-center rounded-full px-4 text-sm", y.startYear === fy.startYear ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
            {y.label}
          </Link>
        ))}
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Contractors paid</dt><dd className="text-lg font-semibold">{rows.length}</dd></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Total paid (inc GST)</dt><dd className="text-lg font-semibold tabular-nums">{money(total)}</dd></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">Missing ABN</dt><dd className={cx("text-lg font-semibold", missing > 0 ? "text-red-700" : "text-green-700")}>{missing}</dd></div>
      </dl>

      {rows.length === 0 ? (
        <Empty title="No contractor payments in this year">Crew pay posted to job costs, and labour costs from your crews, show up here.</Empty>
      ) : (
        <Table>
          <thead><tr><th className={th}>Contractor</th><th className={th}>ABN</th><th className={cx(th, "text-right")}>Payments</th><th className={cx(th, "text-right")}>GST</th><th className={cx(th, "text-right")}>Gross paid</th></tr></thead>
          <tbody className="divide-y divide-slate-100" data-testid="tpar-rows">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className={td}><span className="font-medium text-slate-900">{r.name}</span>{!r.crewId && <span className="block text-xs text-slate-500">Not set up as a crew</span>}</td>
                <td className={td}>{r.abn ? formatAbn(r.abn) : <Badge tone="red">ABN missing</Badge>}</td>
                <td className={cx(td, "text-right tabular-nums")}>{r.payments}</td>
                <td className={cx(td, "text-right tabular-nums")}>{money(r.gst)}</td>
                <td className={cx(td, "text-right font-medium tabular-nums")}>{money(r.gross)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">
        A working file to prepare your TPAR in your accounting software or ATO Online services. Job costs are recorded ex GST; GST is added for GST-registered contractors.
        Employee wages aren&apos;t included. Check the totals against what you actually paid before lodging.
      </p>

      {isAdmin && crews.length > 0 && (
        <Card title="Contractor ABNs" className="mt-6">
          <p className="mb-3 text-sm text-slate-600">Each contractor&apos;s ABN goes on the TPAR and on bills sent to Xero.</p>
          <ul className="divide-y divide-slate-100">
            {crews.map((c) => (
              <li key={c.id} className="py-3" data-crew={c.name}>
                <ActionForm action={saveCrewAbn} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
                  <input type="hidden" name="crew_id" value={c.id} />
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <Input name="abn" aria-label={`ABN for ${c.name}`} defaultValue={c.abn ? formatAbn(c.abn) : ""} inputMode="numeric" placeholder="11 digits" />
                  <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="gst_registered" defaultChecked={c.gst_registered} className="h-5 w-5 accent-brand-500" /> GST registered</label>
                  <SubmitButton variant="secondary" className="min-h-11">Save</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
