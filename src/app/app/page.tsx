import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, money, STAGE_LABEL, STAGE_TONE } from "@/lib/format";
import { JOB_STAGES } from "@/lib/types";
import { LeadTimer } from "./jobs/lead-timer";
import { displayName, initials, mineFilter, orgPeople } from "./jobs/people";
import { markContacted } from "./jobs/lead-actions";
import { SubmitButton } from "@/components/action-form";

export const metadata: Metadata = { title: "Dashboard" };

type MyJob = {
  id: string; title: string; stage: string; scheduled_start: string | null; scheduled_end: string | null; bid_due_on: string | null;
  first_contacted_at: string | null; lead_received_at: string; site_address: string | null;
  customers: { id: string; name: string; phone: string | null; follow_up_on: string | null } | null;
  crews: { name: string; color: string } | null;
};
type WaitingLead = { id: string; title: string; lead_received_at: string; lead_source: string | null; assigned_to: string | null; customers: { name: string; phone: string | null } | null };

export default async function Dashboard() {
  const { supabase, org, user, memberships, canSeeMoney, isSalesRep, crewId } = await requireOrg();
  const now = new Date();
  const today = isoDate(now);
  const in7 = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const in14 = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const me = memberships.find((m) => m.org_id === org.id);
  const firstName = (me?.full_name || user.fullName || "").split(" ")[0];

  // Crew leads get a schedule-only dashboard (no money, no leads).
  if (!canSeeMoney) {
    let cq = supabase.from("jobs").select("id, title, site_address, scheduled_start, scheduled_end, customers(name), crews(name, color)").gte("scheduled_end", today).lte("scheduled_start", in14).order("scheduled_start").limit(20);
    if (crewId) cq = cq.eq("crew_id", crewId);
    const { data } = await cq;
    const rows = (data ?? []) as unknown as { id: string; title: string; site_address: string | null; scheduled_start: string; scheduled_end: string | null; customers: { name: string } | null; crews: { name: string; color: string } | null }[];
    const todays = rows.filter((j) => j.scheduled_start <= today && (j.scheduled_end ?? j.scheduled_start) >= today);
    return (
      <>
        <PageHeader title={firstName ? `Hi, ${firstName}` : "Today"} subtitle={org.name} actions={<LinkButton href="/app/schedule">Schedule</LinkButton>} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Today">
            {todays.length === 0 ? <p className="text-sm text-slate-500">No jobs on the roof today.</p> : (
              <ul className="space-y-2">{todays.map((j) => (
                <li key={j.id}><Link href={`/app/jobs/${j.id}`} className="block min-h-11 rounded-lg bg-slate-50 p-3 hover:bg-slate-100"><span className="block font-medium">{j.customers?.name} · {j.title}</span>{j.site_address && <span className="block text-sm text-slate-500">{j.site_address}</span>}</Link></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Next two weeks">
            {rows.length === 0 ? <p className="text-sm text-slate-500">Nothing scheduled.</p> : (
              <ul className="space-y-2">{rows.map((j) => (
                <li key={j.id}><Link href={`/app/jobs/${j.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-slate-50">
                  <span className="w-12 shrink-0 text-center text-xs font-medium text-slate-500">{date(j.scheduled_start, { month: "short", day: "numeric" })}</span>
                  <span className="h-8 w-1 shrink-0 rounded" style={{ background: j.crews?.color ?? "#cbd5e1" }} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{j.customers?.name}</span><span className="block truncate text-xs text-slate-500">{j.title}</span></span>
                </Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </>
    );
  }

  let waitingQ = supabase.from("jobs").select("id, title, lead_received_at, lead_source, assigned_to, customers(name, phone)").eq("stage", "lead").is("first_contacted_at", null).order("lead_received_at").limit(10);
  if (isSalesRep) waitingQ = waitingQ.or(`${mineFilter(user.id)},assigned_to.is.null`);

  const [jobsRes, upcomingRes, followRes, openInvRes, paymentsRes, estRes, waitingRes, myRes, people] = await Promise.all([
    supabase.from("jobs").select("stage"),
    supabase.from("jobs").select("id, title, scheduled_start, scheduled_end, customers(name), crews(name, color)").gte("scheduled_end", today).lte("scheduled_start", in14).order("scheduled_start").limit(8),
    supabase.from("customers").select("id, name, phone, follow_up_on").not("follow_up_on", "is", null).lte("follow_up_on", today).order("follow_up_on").limit(8),
    supabase.from("invoices").select("id, number, due_date, invoice_totals(balance), jobs(customers(name))").in("status", ["sent", "partial"]).order("due_date"),
    supabase.from("payments").select("amount").gte("paid_on", monthStart),
    supabase.from("estimates").select("status, estimate_totals(total)").eq("status", "sent"),
    waitingQ,
    supabase.from("jobs").select("id, title, stage, scheduled_start, scheduled_end, bid_due_on, first_contacted_at, lead_received_at, site_address, customers(id, name, phone, follow_up_on), crews(name, color)").or(mineFilter(user.id)).not("stage", "in", "(paid,lost)").limit(200),
    orgPeople(supabase, org.id),
  ]);

  const stageCounts = Object.fromEntries(JOB_STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const j of jobsRes.data ?? []) stageCounts[j.stage] = (stageCounts[j.stage] ?? 0) + 1;

  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x);
  const openInvoices = (openInvRes.data ?? []) as unknown as { id: string; number: number; due_date: string | null; invoice_totals: { balance: number } | { balance: number }[]; jobs: { customers: { name: string } } }[];
  const receivable = openInvoices.reduce((s, v) => s + Number(one(v.invoice_totals)?.balance ?? 0), 0);
  const overdue = openInvoices.filter((v) => v.due_date && v.due_date < today);
  const collected = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const pipeline = ((estRes.data ?? []) as unknown as { estimate_totals: { total: number } | { total: number }[] }[]).reduce((s, e) => s + Number(one(e.estimate_totals)?.total ?? 0), 0);
  const waiting = (waitingRes.data ?? []) as unknown as WaitingLead[];

  const mine = (myRes.data ?? []) as unknown as MyJob[];
  const myToday = mine.filter((j) => j.scheduled_start && j.scheduled_start <= today && (j.scheduled_end ?? j.scheduled_start) >= today);
  const myLeads = mine.filter((j) => j.stage === "lead" && !j.first_contacted_at);
  const myFollowUps = mine.filter((j) => j.customers?.follow_up_on && j.customers.follow_up_on <= today);
  const myBids = mine.filter((j) => j.bid_due_on && j.bid_due_on >= today && j.bid_due_on <= in7);
  const myDayEmpty = !myToday.length && !myLeads.length && !myFollowUps.length && !myBids.length;

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

      {waiting.length > 0 && (
        <Card className="mb-6 ring-2 ring-red-200" title={<span className="text-red-800">New leads waiting · {waiting.length}</span>} actions={<Link href="/app/jobs" className="text-xs font-medium text-brand-600">Board →</Link>}>
          <ul className="divide-y divide-slate-100" data-waiting-leads>
            {waiting.map((l) => {
              const owner = people.byId.get(l.assigned_to ?? "");
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/app/jobs/${l.id}`} className="flex min-w-0 items-center gap-2 hover:text-brand-600">
                    <LeadTimer since={l.lead_received_at} compact />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.customers?.name}</span>
                      <span className="block truncate text-xs text-slate-500">{[l.lead_source, owner ? `→ ${displayName(owner)}` : "unassigned"].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    {l.customers?.phone && <a href={`tel:${l.customers.phone}`} className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Call</a>}
                    <form action={markContacted}><input type="hidden" name="id" value={l.id} /><SubmitButton variant="secondary" className="min-h-11">Contacted</SubmitButton></form>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mb-6" title="My day" actions={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">{initials(me ?? { email: user.email })}</span>}>
        {myDayEmpty ? (
          <p className="text-sm text-slate-500">Nothing assigned to you today. Leads and jobs assigned to you show up here.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DayList title="On the schedule today" items={myToday.map((j) => ({ id: j.id, top: j.customers?.name ?? j.title, sub: j.crews?.name ? `${j.title} · ${j.crews.name}` : j.title }))} />
            <DayList title="Call these leads" items={myLeads.map((j) => ({ id: j.id, top: j.customers?.name ?? j.title, sub: j.customers?.phone ?? j.title, timer: j.lead_received_at }))} />
            <DayList title="Follow-ups due" items={myFollowUps.map((j) => ({ id: j.id, top: j.customers?.name ?? j.title, sub: j.customers?.follow_up_on === today ? "Today" : `Since ${date(j.customers?.follow_up_on)}` }))} />
            <DayList title="Bids due this week" items={myBids.map((j) => ({ id: j.id, top: j.title, sub: `Due ${date(j.bid_due_on)}` }))} />
          </div>
        )}
      </Card>

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

function DayList({ title, items }: { title: string; items: { id: string; top: string; sub?: string; timer?: string }[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title} · {items.length}</p>
      {items.length === 0 ? <p className="text-sm text-slate-400">None</p> : (
        <ul className="space-y-1">
          {items.slice(0, 6).map((i) => (
            <li key={i.id}>
              <Link href={`/app/jobs/${i.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                {i.timer && <LeadTimer since={i.timer} compact />}
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{i.top}</span>{i.sub && <span className="block truncate text-xs text-slate-500">{i.sub}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
