import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, money, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { JOB_STAGES } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { supabase, org, user, memberships } = await requireOrg();
  const now = new Date();
  const today = isoDate(now);
  const in14 = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

  const [jobsRes, upcomingRes, followRes, openInvRes, paymentsRes, estRes] = await Promise.all([
    supabase.from("jobs").select("stage"),
    supabase.from("jobs").select("id, title, scheduled_start, scheduled_end, customers(name), crews(name, color)").gte("scheduled_end", today).lte("scheduled_start", in14).order("scheduled_start").limit(8),
    supabase.from("customers").select("id, name, phone, follow_up_on").not("follow_up_on", "is", null).lte("follow_up_on", today).order("follow_up_on").limit(8),
    supabase.from("invoices").select("id, number, due_date, invoice_totals(balance), jobs(customers(name))").in("status", ["sent", "partial"]).order("due_date"),
    supabase.from("payments").select("amount").gte("paid_on", monthStart),
    supabase.from("estimates").select("status, estimate_totals(total)").eq("status", "sent"),
  ]);

  const stageCounts = Object.fromEntries(JOB_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const j of jobsRes.data ?? []) stageCounts[j.stage] = (stageCounts[j.stage] ?? 0) + 1;

  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x);
  const openInvoices = (openInvRes.data ?? []) as unknown as { id: string; number: number; due_date: string | null; invoice_totals: { balance: number } | { balance: number }[]; jobs: { customers: { name: string } } }[];
  const receivable = openInvoices.reduce((s, v) => s + Number(one(v.invoice_totals)?.balance ?? 0), 0);
  const overdue = openInvoices.filter((v) => v.due_date && v.due_date < today);
  const collected = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const pipeline = ((estRes.data ?? []) as unknown as { estimate_totals: { total: number } | { total: number }[] }[]).reduce((s, e) => s + Number(one(e.estimate_totals)?.total ?? 0), 0);
  const me = memberships.find((m) => m.org_id === org.id);
  const firstName = (me?.full_name || user.fullName || "").split(" ")[0];

  const stats = [
    { label: "Collected this month", value: money(collected), href: "/app/invoices?status=paid" },
    { label: "Accounts receivable", value: money(receivable), sub: overdue.length ? `${overdue.length} overdue` : undefined, alert: overdue.length > 0, href: "/app/invoices?status=unpaid" },
    { label: "Estimates awaiting answer", value: money(pipeline), sub: `${estRes.data?.length ?? 0} sent`, href: "/app/estimates?status=sent" },
    { label: "Open jobs", value: String((jobsRes.data ?? []).filter((j) => !["paid", "lost"].includes(j.stage)).length), href: "/app/jobs" },
  ];

  return (
    <>
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : "Dashboard"}
        subtitle={org.name}
        actions={<><LinkButton variant="secondary" href="/app/schedule">Schedule</LinkButton><LinkButton href="/app/customers/new">New lead</LinkButton></>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-500">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{s.value}</p>
            {s.sub && <p className={`mt-0.5 text-xs ${"alert" in s && s.alert ? "text-red-600" : "text-slate-500"}`}>{s.sub}</p>}
          </Link>
        ))}
      </div>

      <Card className="mb-6" title="Pipeline">
        <div className="flex flex-wrap gap-2">
          {JOB_STAGES.filter((s) => s !== "lost").map((s) => (
            <Link key={s} href="/app/jobs" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100">
              <Badge tone={STAGE_TONE[s]}>{STAGE_LABEL[s]}</Badge>
              <span className="text-sm font-semibold tabular-nums">{stageCounts[s]}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Next two weeks" actions={<Link href="/app/schedule" className="text-xs font-medium text-brand-600">Calendar →</Link>}>
          {(upcomingRes.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {((upcomingRes.data ?? []) as unknown as { id: string; title: string; scheduled_start: string; customers: { name: string }; crews: { name: string; color: string } | null }[]).map((j) => (
                <li key={j.id}>
                  <Link href={`/app/jobs/${j.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-slate-50">
                    <span className="w-12 shrink-0 text-center text-xs font-medium text-slate-500">{date(j.scheduled_start, { month: "short", day: "numeric" })}</span>
                    <span className="h-8 w-1 shrink-0 rounded" style={{ background: j.crews?.color ?? "#cbd5e1" }} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{j.customers.name}</span><span className="block truncate text-xs text-slate-500">{j.title}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Follow-ups due">
          {(followRes.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(followRes.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/app/customers/${c.id}`} className="min-w-0 hover:text-brand-600">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-red-600">{c.follow_up_on === today ? "Today" : date(c.follow_up_on)}</span>
                  </Link>
                  {c.phone && <a href={`tel:${c.phone}`} className="text-xs font-medium text-brand-600">Call</a>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Unpaid invoices">
          {openInvoices.length === 0 ? (
            <p className="text-sm text-slate-500">No open invoices.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {openInvoices.slice(0, 8).map((v) => (
                <li key={v.id}>
                  <Link href={`/app/invoices/${v.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">#{v.number} · {v.jobs.customers.name}</span>
                      <span className={`text-xs ${v.due_date && v.due_date < today ? "text-red-600" : "text-slate-500"}`}>Due {date(v.due_date)}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{money(one(v.invoice_totals)?.balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
