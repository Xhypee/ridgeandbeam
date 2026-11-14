import Link from "next/link";
import type { Metadata } from "next";
import { Badge, LinkButton, cx } from "@/components/ui";
import { SubmitButton } from "@/components/action-form";
import { WaitTimer } from "@/components/wait-timer";
import { requireOrg } from "@/lib/dal";
import { AU_STATE_TZ, asAuState } from "@/lib/au";
import { STAGE_LABEL, STAGE_TONE, type Tone } from "@/lib/format";
import { EVENT_LABEL } from "@/lib/field";
import { dollars, firstName, lastName, nextStep, type NextStep, type NextStepJob, type NextStepTag } from "@/lib/next-step";
import { asNextStepJob, loadNextStepCtx, NEXT_STEP_JOB_COLS } from "@/lib/next-step-server";
import { markContacted } from "./jobs/lead-actions";
import { displayName, orgPeople } from "./jobs/people";

export const metadata: Metadata = { title: "Today" };

type Crew = { name: string; color: string } | null;
type OpenJob = NextStepJob & {
  title: string; site_address: string | null; bid_due_on: string | null; lead_source: string | null;
  assigned_to: string | null; sales_rep_id: string | null; setter_id: string | null;
  customers: { id: string; name: string; phone: string | null; follow_up_on: string | null } | null; crews: Crew;
};

const TAG_TONE: Record<NextStepTag | "Follow-up", Tone> = { Lead: "slate", Quote: "blue", Insurance: "violet", Money: "green", Build: "cyan", "Close-out": "amber", Done: "slate", "Follow-up": "slate" };
const TAG_ORDER: (NextStepTag | "Follow-up")[] = ["Quote", "Insurance", "Money", "Build", "Lead", "Follow-up", "Close-out", "Done"];

/** Calendar parts in the company's own time zone (servers run in UTC). */
function localNow(tz: string) {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const dateLine = now.toLocaleDateString("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  return { now, today: ymd, monthStart: ymd.slice(0, 8) + "01", hour, dateLine };
}
const shiftIso = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const street = (a: string | null | undefined) => (a ?? "").split(",")[0];

function Section({ id, title, hint, children, actions }: { id: string; title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="text-lg font-bold text-ink">{title}</h2>
        {hint && <span className="text-sm text-slate-500">{hint}</span>}
        {actions && <span className="ml-auto">{actions}</span>}
      </div>
      {children}
    </section>
  );
}

function SearchBox({ q }: { q: string }) {
  return (
    <form action="/app" role="search" className="flex h-12 min-w-0 flex-1 basis-72 items-center gap-2 rounded-xl bg-white px-3.5 ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-brand-500 lg:max-w-md">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <label htmlFor="today-search" className="sr-only">Search customers and jobs</label>
      <input id="today-search" type="search" name="q" defaultValue={q} placeholder="Name, address, phone or claim #" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
    </form>
  );
}

export default async function Today({ searchParams }: PageProps<"/app">) {
  const { supabase, org, user, memberships, canSeeMoney, isSalesRep, crewId } = await requireOrg();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const tz = AU_STATE_TZ[asAuState(org.state) ?? "NSW"];
  const { now, today, monthStart, hour, dateLine } = localNow(tz);
  const me = memberships.find((m) => m.org_id === org.id);
  const first = firstName(me?.full_name || user.fullName);
  const greeting = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}${first ? `, ${first}` : ""}`;

  const header = (withActions: boolean) => (
    <header className="mb-7 flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <p data-today-date className="text-sm text-slate-500">{dateLine}</p>
        <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-ink">{greeting}</h1>
      </div>
      {withActions && (
        <>
          <SearchBox q={q} />
          <LinkButton href="/app/jobs?new=1" className="h-12 rounded-xl px-5 text-[15px]">+ New lead</LinkButton>
        </>
      )}
    </header>
  );

  // Crew leads: schedule only (no money, no leads).
  if (!canSeeMoney) {
    let cq = supabase.from("jobs").select("id, title, site_address, stage, scheduled_start, scheduled_end, customers(name), crews(name, color)")
      .not("stage", "in", "(lost,paid)").gte("scheduled_end", today).lte("scheduled_start", shiftIso(today, 14)).order("scheduled_start").limit(30);
    if (crewId) {
      // Their crew's jobs, plus jobs they've been put on.
      const { data: mine } = await supabase.from("job_members").select("job_id").eq("user_id", user.id);
      const extra = (mine ?? []).map((m) => m.job_id as string);
      cq = extra.length ? cq.or(`crew_id.eq.${crewId},id.in.(${extra.join(",")})`) : cq.eq("crew_id", crewId);
    }
    const { data } = await cq;
    const rows = (data ?? []) as unknown as { id: string; title: string; site_address: string | null; stage: string; scheduled_start: string; scheduled_end: string | null; customers: { name: string } | null; crews: Crew }[];
    const todays = rows.filter((j) => j.scheduled_start <= today && (j.scheduled_end ?? j.scheduled_start) >= today);
    const later = rows.filter((j) => j.scheduled_start > today);
    return (
      <>
        {header(false)}
        <div className="flex flex-col gap-7">
          <Section id="h-roofs" title="On roofs today">
            {todays.length === 0 ? <EmptyLine>No jobs on the roof today.</EmptyLine> : (
              <div className="grid gap-4 md:grid-cols-2" data-on-roofs>
                {todays.map((j) => <RoofCard key={j.id} href={`/app/jobs/${j.id}/field`} name={j.customers?.name ?? j.title} address={j.site_address} crew={j.crews} status={j.title} />)}
              </div>
            )}
          </Section>
          <Section id="h-next" title="Coming up" hint="The next two weeks" actions={<Link href="/app/schedule" className="text-sm font-semibold text-brand-600">Schedule →</Link>}>
            {later.length === 0 ? <EmptyLine>Nothing else booked.</EmptyLine> : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                {later.map((j) => (
                  <li key={j.id}>
                    <Link href={`/app/jobs/${j.id}/field`} className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <span className="w-24 shrink-0 whitespace-nowrap text-sm font-semibold text-slate-600">{new Date(j.scheduled_start + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="h-9 w-1 shrink-0 rounded" style={{ background: j.crews?.color ?? "#cbd5e1" }} />
                      <span className="min-w-0"><span className="block truncate font-semibold text-ink">{j.customers?.name} · {street(j.site_address)}</span><span className="block truncate text-sm text-slate-500">{j.title}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- office view
  const openQ = supabase.from("jobs")
    .select(`${NEXT_STEP_JOB_COLS}, title, site_address, bid_due_on, lead_source, assigned_to, sales_rep_id, setter_id, customers(id, name, phone, follow_up_on), crews(name, color)`)
    .neq("stage", "lost").or(`stage.neq.paid,stage_changed_at.gte.${shiftIso(today, -30)}`)
    .order("stage_changed_at").limit(400);

  const [openRes, openInvRes, paymentsRes, sentEstRes, carrierRes, people, followRes] = await Promise.all([
    openQ,
    supabase.from("invoices").select("id, due_date").in("status", ["sent", "partial"]),
    supabase.from("payments").select("amount").gte("paid_on", monthStart),
    supabase.from("estimates").select("id").eq("status", "sent"),
    supabase.from("claim_checks").select("expected_amount, received_amount, claims!inner(stage)").eq("payer", "carrier").not("claims.stage", "in", "(closed,denied)"),
    orgPeople(supabase, org.id),
    supabase.from("customers").select("id, name, phone, follow_up_on, jobs(id)").not("follow_up_on", "is", null).lte("follow_up_on", today).order("follow_up_on").limit(10),
  ]);
  // Sales reps see their own jobs plus unassigned ones (everyone else's stay on the Jobs board).
  const isMine = (j: OpenJob) => [j.assigned_to, j.sales_rep_id, j.setter_id].includes(user.id) || (!j.assigned_to && !j.sales_rep_id);
  const openJobs = ((openRes.data ?? []) as unknown as OpenJob[]).map((j) => ({ ...j, ...asNextStepJob(j) }) as OpenJob).filter((j) => !isSalesRep || isMine(j));
  const invIds = (openInvRes.data ?? []).map((v) => v.id);
  const sentIds = (sentEstRes.data ?? []).map((e) => e.id);
  const [invTotals, estTotals, ctxMap] = await Promise.all([
    invIds.length ? supabase.from("invoice_totals").select("invoice_id, balance").in("invoice_id", invIds.slice(0, 300)) : Promise.resolve({ data: [] as { invoice_id: string; balance: number }[] }),
    sentIds.length ? supabase.from("estimate_totals").select("estimate_id, total").in("estimate_id", sentIds.slice(0, 300)) : Promise.resolve({ data: [] as { estimate_id: string; total: number }[] }),
    loadNextStepCtx(supabase, openJobs),
  ]);

  // Money tiles
  const payments = paymentsRes.data ?? [];
  const collected = payments.reduce((s, p) => s + Number(p.amount), 0);
  const owed = (invTotals.data ?? []).reduce((s, t) => s + Math.max(0, Number(t.balance)), 0);
  const overdue = (openInvRes.data ?? []).filter((v) => v.due_date && v.due_date < today).length;
  const onInsurers = (carrierRes.data ?? []).reduce((s, k) => s + Math.max(0, Number(k.expected_amount) - Number(k.received_amount)), 0);
  const quotesOut = (estTotals.data ?? []).reduce((s, t) => s + Number(t.total), 0);
  const tiles = [
    { label: "Collected this month", value: dollars(collected), sub: `${payments.length} payment${payments.length === 1 ? "" : "s"}`, subCls: "text-green-700", href: "/app/invoices?status=paid" },
    {
      label: "Owed to you", value: dollars(owed), href: "/app/invoices?status=unpaid",
      sub: onInsurers > 0 ? `${dollars(onInsurers)} waiting on insurers` : overdue ? `${overdue} invoice${overdue === 1 ? "" : "s"} overdue` : `${invIds.length} invoice${invIds.length === 1 ? "" : "s"} open`,
      subCls: onInsurers > 0 || overdue ? "text-amber-700" : "text-slate-500",
    },
    { label: "Quotes out", value: dollars(quotesOut), sub: `${sentIds.length} homeowner${sentIds.length === 1 ? "" : "s"} deciding`, subCls: "text-slate-500", href: "/app/estimates?status=sent" },
  ];

  // Call now: new leads nobody has called yet, oldest first (they're losing money).
  const callNow = openJobs.filter((j) => j.stage === "lead" && !j.first_contacted_at).sort((a, b) => (a.lead_received_at ?? "").localeCompare(b.lead_received_at ?? "")).slice(0, 10);

  // Waiting on you: one next step per job (+ customer follow-ups and bids due from "My day").
  type Task = { id: string; jobId: string | null; tag: NextStepTag | "Follow-up"; title: string; detail: string; actionLabel: string; href: string; age: number };
  const tasks: Task[] = [];
  for (const j of openJobs) {
    if (j.stage === "lead" && !j.first_contacted_at) continue;
    const c = ctxMap.get(j.id);
    if (!c) continue;
    const s: NextStep = nextStep(j, { ...c, now });
    if (!s.waiting) continue;
    tasks.push({ id: j.id, jobId: j.id, tag: s.tag, title: s.listTitle, detail: [s.detail, street(j.site_address)].filter(Boolean).join(" · "), actionLabel: s.actionLabel, href: s.href, age: now.getTime() - new Date(j.stage_changed_at ?? now).getTime() });
  }
  const jobsByCustomer = new Map(openJobs.map((j) => [j.customers?.id, j]));
  for (const c of (followRes.data ?? []) as { id: string; name: string; phone: string | null; follow_up_on: string; jobs: { id: string }[] }[]) {
    const job = jobsByCustomer.get(c.id) ?? null;
    tasks.push({
      id: `fu-${c.id}`, jobId: job?.id ?? null, tag: "Follow-up", title: `Call back ${c.name}`, detail: c.follow_up_on === today ? "Follow-up due today" : `Follow-up was due ${new Date(c.follow_up_on + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
      actionLabel: c.phone ? `Call ${c.phone}` : "Open customer", href: c.phone ? `tel:${c.phone.replace(/\s+/g, "")}` : `/app/customers/${c.id}`, age: 0,
    });
  }
  for (const j of openJobs.filter((j) => j.bid_due_on && j.bid_due_on >= today && j.bid_due_on <= shiftIso(today, 7) && ["lead", "inspection", "estimate_sent"].includes(j.stage))) {
    tasks.push({ id: `bid-${j.id}`, jobId: j.id, tag: "Quote", title: `Bid due ${new Date(j.bid_due_on + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}: ${j.title}`, detail: j.customers?.name ?? "", actionLabel: "Open job", href: `/app/jobs/${j.id}`, age: 0 });
  }
  tasks.sort((a, b) => TAG_ORDER.indexOf(a.tag) - TAG_ORDER.indexOf(b.tag) || b.age - a.age);
  const shownTasks = tasks.slice(0, 10);

  // On roofs today
  const onRoofs = openJobs.filter((j) => ["sold", "scheduled", "in_progress"].includes(j.stage) && j.scheduled_start && j.scheduled_start <= today && (j.scheduled_end ?? j.scheduled_start) >= today);
  const { data: events } = onRoofs.length
    ? await supabase.from("job_events").select("job_id, kind, created_at").in("job_id", onRoofs.map((j) => j.id)).gte("created_at", new Date(now.getTime() - 36 * 3600000).toISOString()).order("created_at", { ascending: false })
    : { data: [] as { job_id: string; kind: string; created_at: string }[] };
  const lastEvent = new Map<string, { kind: string; created_at: string }>();
  for (const e of events ?? []) if (!lastEvent.has(e.job_id) && e.kind !== "note") lastEvent.set(e.job_id, e);

  // Search
  const results = q ? await search(supabase, q) : null;

  return (
    <>
      {header(true)}
      <div className="flex flex-col gap-8">
        {results && (
          <Section id="h-search" title={`Results for "${q}"`} actions={<Link href="/app" className="text-sm font-semibold text-brand-600">Clear</Link>}>
            <div data-search-results className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              {results.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No customers or jobs match. Try a surname, street or phone number.</p> : (
                <ul className="divide-y divide-slate-100">
                  {results.map((r) => (
                    <li key={r.key}>
                      <Link href={r.href} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{r.name}</span><span className="block truncate text-sm text-slate-500">{r.sub}</span></span>
                        {r.stage && <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}

        <section aria-label="Money at a glance" className="grid gap-4 sm:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} data-money-tile className="block rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:ring-brand-400">
              <p className="text-[13px] text-slate-500">{t.label}</p>
              <p className="font-display mt-1.5 text-[28px] font-bold leading-none tracking-tight text-ink">{t.value}</p>
              <p className={cx("mt-2 text-[13px]", t.subCls)}>{t.sub}</p>
            </Link>
          ))}
        </section>

        <Section id="h-call" title="Call now" hint="New leads. The first roofer to call usually wins.">
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {callNow.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No new leads waiting. Nice work.</p> : (
              <ul className="divide-y divide-slate-100" data-waiting-leads>
                {callNow.map((l) => {
                  const owner = people.byId.get(l.assigned_to ?? "");
                  const phone = l.customers?.phone;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
                      <WaitTimer since={l.lead_received_at ?? new Date().toISOString()} className="min-w-[4.5rem]" />
                      <Link href={`/app/jobs/${l.id}`} className="min-w-0 flex-1 basis-56 hover:text-brand-600">
                        <span className="block truncate text-[17px] font-semibold text-ink">{l.customers?.name}</span>
                        <span className="block truncate text-sm text-slate-500">{[l.title, street(l.site_address), l.lead_source && `from ${l.lead_source.replace(/_/g, " ")}`, owner ? `→ ${displayName(owner)}` : "unassigned"].filter(Boolean).join(" · ")}</span>
                      </Link>
                      <span className="flex flex-wrap items-center gap-3">
                        {phone && <a href={`tel:${phone.replace(/\s+/g, "")}`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Call {phone}</a>}
                        <form action={markContacted}><input type="hidden" name="id" value={l.id} /><SubmitButton>Mark contacted</SubmitButton></form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>

        <Section id="h-waiting" title="Waiting on you" hint={tasks.length ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"} to move jobs forward` : undefined}
          actions={tasks.length > shownTasks.length ? <Link href="/app/jobs" className="text-sm font-semibold text-brand-600">All jobs →</Link> : undefined}>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {shownTasks.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">Nothing waiting on you. Every open job is with the homeowner, the insurer or the crew.</p> : (
              <ul className="divide-y divide-slate-100" data-waiting-on-you>
                {shownTasks.map((t) => (
                  <li key={t.id} data-task={t.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
                    <Badge tone={TAG_TONE[t.tag]} className="min-w-[5.5rem] justify-center py-1">{t.tag}</Badge>
                    <span className="min-w-0 flex-1 basis-64">
                      <span className="block font-semibold text-ink">{t.title}</span>
                      <span className="block text-sm text-slate-500">{t.detail}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      {t.jobId && <Link href={`/app/jobs/${t.jobId}`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-600 hover:text-brand-700">Open job</Link>}
                      {!(t.jobId && t.href === `/app/jobs/${t.jobId}`) && (
                        <a href={t.href} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50">{t.actionLabel}</a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section id="h-roofs" title="On roofs today" actions={<Link href="/app/schedule" className="text-sm font-semibold text-brand-600">Schedule →</Link>}>
          {onRoofs.length === 0 ? <EmptyLine>No crews on a roof today.</EmptyLine> : (
            <div className="grid gap-4 md:grid-cols-2" data-on-roofs>
              {onRoofs.map((j) => {
                const e = lastEvent.get(j.id);
                const status = e
                  ? `${EVENT_LABEL[e.kind] ?? e.kind.replace(/_/g, " ")} ${new Date(e.created_at).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`
                  : j.stage === "in_progress" ? "On the roof" : j.schedule_locked ? "Booked, not started" : "Tentative";
                return <RoofCard key={j.id} href={`/app/jobs/${j.id}`} name={lastName(j.customers?.name) || j.title} address={j.site_address} crew={j.crews} status={status} />;
              })}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}


function RoofCard({ href, name, address, crew, status }: { href: string; name: string; address: string | null; crew: Crew; status: string }) {
  return (
    <Link href={href} data-roof-job className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:ring-brand-400">
      <span className="w-1.5 shrink-0 rounded-full" style={{ background: crew?.color ?? "#cbd5e1" }} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-semibold text-ink">{name}{address ? ` · ${street(address)}` : ""}</span>
        <span className="block truncate text-sm text-slate-500">{[crew?.name ?? "No crew yet", status].join(" · ")}</span>
      </span>
    </Link>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-white px-5 py-4 text-sm text-slate-500 ring-1 ring-slate-200">{children}</p>;
}

type Hit = { key: string; name: string; sub: string; href: string; stage?: string };
/** Customers and jobs by name, address, phone or claim number. */
async function search(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], q: string): Promise<Hit[]> {
  const safe = q.replace(/[%,()*\\]/g, " ").trim();
  if (!safe) return [];
  const like = `%${safe}%`;
  const [cust, jobs, claims] = await Promise.all([
    supabase.from("customers").select("id, name, phone, address, city, jobs(id, title, stage, site_address)")
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like},address.ilike.${like},city.ilike.${like},claim_number.ilike.${like}`).limit(15),
    supabase.from("jobs").select("id, title, stage, site_address, customers(name)").or(`title.ilike.${like},site_address.ilike.${like}`).limit(15),
    supabase.from("claims").select("claim_number, jobs(id, title, stage, site_address, customers(name))").ilike("claim_number", like).limit(10),
  ]);
  const hits = new Map<string, Hit>();
  type J = { id: string; title: string; stage: string; site_address: string | null; customers?: { name: string } | { name: string }[] | null };
  const name = (j: J) => (Array.isArray(j.customers) ? j.customers[0]?.name : j.customers?.name) ?? j.title;
  const addJob = (j: J, who?: string, extra?: string) => {
    if (!hits.has(j.id)) hits.set(j.id, { key: j.id, name: who ?? name(j), sub: [j.title, j.site_address, extra].filter(Boolean).join(" · "), href: `/app/jobs/${j.id}`, stage: j.stage });
  };
  for (const c of (claims.data ?? []) as unknown as { claim_number: string; jobs: J | J[] | null }[]) {
    const j = Array.isArray(c.jobs) ? c.jobs[0] : c.jobs;
    if (j) addJob(j, undefined, `Claim ${c.claim_number}`);
  }
  for (const c of (cust.data ?? []) as unknown as { id: string; name: string; phone: string | null; address: string | null; city: string | null; jobs: J[] }[]) {
    if (c.jobs?.length) for (const j of c.jobs) addJob(j, c.name, c.phone ?? undefined);
    else hits.set(`c-${c.id}`, { key: `c-${c.id}`, name: c.name, sub: [c.phone, [c.address, c.city].filter(Boolean).join(", ")].filter(Boolean).join(" · "), href: `/app/customers/${c.id}` });
  }
  for (const j of (jobs.data ?? []) as unknown as J[]) addJob(j);
  return [...hits.values()].slice(0, 20);
}
