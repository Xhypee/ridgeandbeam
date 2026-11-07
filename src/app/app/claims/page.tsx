import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Empty, PageHeader, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, daysSince, isoDate, money } from "@/lib/format";
import { notifyUser } from "@/lib/notify";
import { claimBalancesFor } from "@/lib/claims-server";
import { agingTone, auStage, CLAIM_STAGE_LABEL, CLAIM_STAGES, codeTimeframes, SETTLEMENT_SHORT, type ClaimStage, type SettlementPath } from "@/lib/claims";

export const metadata: Metadata = { title: "Claims" };

type Row = {
  id: string;
  stage: ClaimStage;
  stage_changed_at: string;
  carrier: string | null;
  claim_number: string | null;
  adjuster_meeting_at: string | null;
  settlement_path: SettlementPath;
  lodged_on: string | null;
  info_complete_on: string | null;
  last_insurer_update_on: string | null;
  decision_on: string | null;
  catastrophe: string;
  jobs: { id: string; title: string; customers: { name: string } | null };
  supplements: { id: string; round: number; status: string; next_follow_up_on: string | null }[];
};

export default async function ClaimsPage({ searchParams }: PageProps<"/app/claims">) {
  const { supabase, org } = await requireMoneyAccess();
  const sp = await searchParams;
  const onlyFollowUp = sp.filter === "follow_up";
  const showClosed = sp.closed === "1";

  const { data, error } = await supabase
    .from("claims")
    .select("id, stage, stage_changed_at, carrier, claim_number, adjuster_meeting_at, settlement_path, lodged_on, info_complete_on, last_insurer_update_on, decision_on, catastrophe, jobs!inner(id, title, customers(name)), supplements(id, round, status, next_follow_up_on)")
    .eq("org_id", org.id)
    .order("stage_changed_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const all = ((data ?? []) as unknown as Row[]).map((c) => ({ ...c, stage: auStage(c.stage) as ClaimStage }));
  const today = isoDate(new Date());

  // In-app reminders for supplement follow-ups due today or earlier (once per supplement per day).
  const due = all.flatMap((c) =>
    c.supplements
      .filter((s) => s.status === "submitted" && s.next_follow_up_on && s.next_follow_up_on <= today)
      .map((s) => ({ claim: c, s, url: `/app/jobs/${c.jobs.id}/claim/supplements/${s.id}` })),
  );
  if (due.length) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: sent } = await supabase
      .from("notifications")
      .select("url")
      .eq("org_id", org.id)
      .eq("kind", "supplement_follow_up")
      .gte("created_at", startOfDay.toISOString())
      .in("url", due.map((d) => d.url));
    const already = new Set((sent ?? []).map((n) => n.url));
    for (const d of due) {
      if (already.has(d.url)) continue;
      already.add(d.url);
      await notifyUser(supabase, {
        orgId: org.id,
        kind: "supplement_follow_up",
        title: `Follow up variation request ${d.s.round}: ${d.claim.jobs.customers?.name ?? d.claim.jobs.title}`,
        body: `${d.claim.carrier ?? "Insurer"}${d.claim.claim_number ? ` · claim ${d.claim.claim_number}` : ""} · due ${date(d.s.next_follow_up_on)}`,
        url: d.url,
      });
    }
  }

  const balances = await claimBalancesFor(supabase, all.map((c) => c.id));
  const info = all.map((c) => {
    const bal = balances.get(c.id);
    const days = daysSince(c.stage_changed_at);
    const followUps = c.supplements.filter((s) => s.status === "submitted" && s.next_follow_up_on).map((s) => s.next_follow_up_on!).sort();
    const nextFollowUp = followUps[0] ?? null;
    const active = c.stage !== "closed" && c.stage !== "declined";
    const followUpDue = Boolean(nextFollowUp && nextFollowUp <= today);
    const stale = active && days > 14;
    const codeDue = codeTimeframes(c, today).find((r) => r.status !== "ok") ?? null;
    return { c, days, outstanding: Number(bal?.outstanding ?? 0), nextFollowUp, followUpDue, codeDue, needs: followUpDue || stale || Boolean(codeDue), stale };
  });
  const visible = info.filter((x) => (!onlyFollowUp || x.needs) && (showClosed || (x.c.stage !== "closed" && x.c.stage !== "declined")));
  const stages = CLAIM_STAGES.filter((s) => showClosed || (s !== "closed" && s !== "declined"));
  const needsCount = info.filter((x) => x.needs).length;
  const outstanding = visible.reduce((s, x) => s + x.outstanding, 0);

  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { filter: onlyFollowUp ? "follow_up" : null, closed: showClosed ? "1" : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/app/claims?${s}` : "/app/claims";
  };

  return (
    <>
      <PageHeader
        title="Claims"
        subtitle={<>Insurance jobs by claim stage · <b className="text-slate-800">{money(outstanding)}</b> still owed by insurers, panel builders and homeowners</>}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={q({ filter: null })} className={cx("inline-flex min-h-11 items-center rounded-full px-4 text-sm", !onlyFollowUp ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>All open</Link>
        <Link href={q({ filter: "follow_up" })} className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm", onlyFollowUp ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
          Needs follow-up {needsCount > 0 && <span className={cx("rounded-full px-1.5 text-xs", onlyFollowUp ? "bg-white/20" : "bg-red-100 text-red-700")}>{needsCount}</span>}
        </Link>
        <Link href={q({ closed: showClosed ? null : "1" })} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm text-slate-600 ring-1 ring-slate-200">
          {showClosed ? "Hide closed & declined" : "Show closed & declined"}
        </Link>
      </div>

      {all.length === 0 ? (
        <Empty title="No insurance claims yet">Open a job and use its Insurance tab to start one, or choose &ldquo;Insurance claim&rdquo; when adding a customer.</Empty>
      ) : visible.length === 0 ? (
        <Empty title="Nothing needs follow-up">Every claim is moving. Check back tomorrow.</Empty>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" data-testid="claims-board">
          {stages.map((stage) => {
            const cards = visible.filter((x) => x.c.stage === stage);
            if (onlyFollowUp && cards.length === 0) return null;
            return (
              <section key={stage} className="w-72 shrink-0 snap-start rounded-xl bg-slate-100/70 p-2" aria-label={CLAIM_STAGE_LABEL[stage]}>
                <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {CLAIM_STAGE_LABEL[stage]} <span className="font-normal">{cards.length}</span>
                </h2>
                <ul className="space-y-2">
                  {cards.map(({ c, days, outstanding, nextFollowUp, followUpDue, codeDue, stale }) => (
                    <li key={c.id}>
                      <Link href={`/app/jobs/${c.jobs.id}/claim`} className="block rounded-lg bg-white p-3 ring-1 ring-slate-200 hover:ring-brand-500" data-testid="claim-card">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-medium text-slate-900">{c.jobs.customers?.name ?? c.jobs.title}</p>
                          <Badge tone={agingTone(days)}>{days}d</Badge>
                        </div>
                        <p className="truncate text-xs text-slate-500">{c.carrier ?? "Insurer not set"}{c.claim_number ? ` · #${c.claim_number}` : ""} · {SETTLEMENT_SHORT[c.settlement_path] ?? ""}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {nextFollowUp && (
                            <span className={followUpDue ? "font-semibold text-red-700" : "text-slate-600"}>Follow up {date(nextFollowUp, { month: "short", day: "numeric" })}</span>
                          )}
                          {!nextFollowUp && c.adjuster_meeting_at && new Date(c.adjuster_meeting_at) > new Date() && (
                            <span className="text-slate-600">Assessor {new Date(c.adjuster_meeting_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                          )}
                          {stale && !followUpDue && <span className="font-medium text-red-700">Stalled</span>}
                          {outstanding > 0 && <span className="ml-auto font-medium tabular-nums text-slate-800">{money(outstanding)} owed</span>}
                        </div>
                        {codeDue && <p className={cx("mt-1 text-xs", codeDue.status === "overdue" ? "font-medium text-red-700" : "text-amber-700")}>{codeDue.label} {codeDue.status === "overdue" ? "overdue" : `by ${date(codeDue.due, { day: "numeric", month: "short" })}`} (Code guide)</p>}
                      </Link>
                    </li>
                  ))}
                  {cards.length === 0 && <li className="px-1 py-3 text-center text-xs text-slate-400">—</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
