import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { ClaimExplainer } from "@/components/claim-explainer";
import { KeepForm } from "./_components/keep-form";
import { Badge, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, daysSince, isoDate, money } from "@/lib/format";
import {
  agingTone, auStage, CATASTROPHE_LABEL, CATASTROPHES, CLAIM_FLOW, CLAIM_STAGE_HINT, CLAIM_STAGE_LABEL, CLAIM_STAGES, CODE_GUIDE_LABEL, codeTimeframes,
  EVENT_LABEL, EVENT_TYPES, MAKE_SAFE_AUTHORISERS, MAKE_SAFE_PAYERS, nextClaimStage, PARTY_LABEL, POLICY_LABEL, SETTLEMENT_SHORT, type EventType,
} from "@/lib/claims";
import { getClaimForJob } from "@/lib/claims-server";
import { acceptedEstimateTotal } from "@/lib/estimate-totals";
import { deleteClaim, logInsurerUpdate, setClaimStage, updateClaim } from "./actions";
import { DateTimeInput, LocalDateTime, PolicySelect, SettlementSelect } from "./_components/client-bits";
import { MoneySummary } from "./_components/money-summary";

export const metadata: Metadata = { title: "Insurance claim" };

const num = (n: number | null | undefined) => (Number(n) ? Number(n) : "");

export default async function ClaimPage({ params }: PageProps<"/app/jobs/[id]/claim">) {
  const { id } = await params;
  const { supabase, canSeeMoney, isAdmin, org } = await requireOrg();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const [{ data: bal }, est] = await Promise.all([
    supabase.from("claim_balances").select("expected, received").eq("claim_id", claim.id).maybeSingle(),
    canSeeMoney ? acceptedEstimateTotal(supabase, id) : Promise.resolve(null),
  ]);
  const stage = auStage(claim.stage);
  const days = daysSince(claim.stage_changed_at);
  const next = nextClaimStage(stage);
  const flowIdx = CLAIM_FLOW.indexOf(stage);
  const today = isoDate(new Date());
  const reminders = codeTimeframes(claim, today);
  const outcome = stage === "declined" || stage === "cash_settlement_offered";

  return (
    <div className="space-y-6">
      <Card>
        <ol className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1" aria-label="Claim stages">
          {CLAIM_FLOW.map((s, i) => {
            const done = stage === "closed" || (flowIdx >= 0 && i < flowIdx) || (outcome && i < CLAIM_FLOW.indexOf("approved"));
            const current = s === stage || (outcome && s === "approved");
            return (
              <li key={s} className="flex shrink-0 flex-col items-center gap-1 px-1" aria-current={current ? "step" : undefined}>
                <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", current ? "bg-brand-500 text-white" : done ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500")}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={cx("w-20 text-center text-[11px] leading-tight", current ? "font-semibold text-slate-900" : "text-slate-500")}>
                  {current && outcome ? CLAIM_STAGE_LABEL[stage] : CLAIM_STAGE_LABEL[s]}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900" data-testid="claim-stage">
              {CLAIM_STAGE_LABEL[stage]}
              <Badge tone={stage === "declined" ? "red" : agingTone(days)}>{days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} in stage`}</Badge>
              <Badge tone="violet">{SETTLEMENT_SHORT[claim.settlement_path]}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-slate-600">{CLAIM_STAGE_HINT[stage]}</p>
          </div>
          {canSeeMoney && (
            <div className="flex flex-wrap items-center gap-2">
              {next && (
                <form action={setClaimStage}>
                  <input type="hidden" name="id" value={claim.id} />
                  <input type="hidden" name="stage" value={next} />
                  <SubmitButton className="min-h-11">Move to: {CLAIM_STAGE_LABEL[next]} →</SubmitButton>
                </form>
              )}
              <form key={stage} action={setClaimStage} className="flex gap-1">
                <input type="hidden" name="id" value={claim.id} />
                <Select name="stage" defaultValue={stage} aria-label="Move claim to stage" className="min-h-11 w-48">
                  {CLAIM_STAGES.map((s) => <option key={s} value={s}>{CLAIM_STAGE_LABEL[s]}</option>)}
                </Select>
                <SubmitButton variant="secondary" className="min-h-11">Move</SubmitButton>
              </form>
            </div>
          )}
        </div>
      </Card>

      {reminders.length > 0 && (
        <Card title="Insurer timeframes" actions={<span className="text-xs font-medium text-amber-800">{CODE_GUIDE_LABEL}</span>}>
          <ul className="space-y-2" data-testid="code-reminders">
            {reminders.map((r) => (
              <li key={r.key} className={cx("flex flex-wrap items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm", r.status === "overdue" ? "bg-red-50 text-red-900" : r.status === "soon" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700")}>
                <span className="min-w-0"><b>{r.label}</b><span className="block text-xs opacity-80">{r.detail}</span></span>
                <span className="shrink-0 text-right tabular-nums">
                  by {date(r.due)}
                  <span className="block text-xs">{r.daysLeft < 0 ? `${-r.daysLeft} days ago` : r.daysLeft === 0 ? "today" : `in ${r.daysLeft} days`}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">General Insurance Code of Practice timeframes as reported in our research. Check the current Code before relying on them. Public holidays aren&apos;t counted.</p>
            {canSeeMoney && (
              <form action={logInsurerUpdate}>
                <input type="hidden" name="id" value={claim.id} />
                <SubmitButton variant="secondary" className="min-h-11">Insurer gave an update today</SubmitButton>
              </form>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {canSeeMoney ? (
            <Card title="Claim details">
              <KeepForm action={updateClaim} className="space-y-6">
                <input type="hidden" name="id" value={claim.id} />
                <fieldset className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Insurer &amp; policy</legend>
                  <Field label="Insurer"><Input name="carrier" defaultValue={claim.carrier ?? ""} /></Field>
                  <Field label="Claim number"><Input name="claim_number" defaultValue={claim.claim_number ?? ""} /></Field>
                  <Field label="Policy number"><Input name="policy_number" defaultValue={claim.policy_number ?? ""} /></Field>
                  <Field label="Sum insured (building)" hint="From the policy schedule"><Input name="sum_insured" type="number" step="1" min="0" inputMode="decimal" defaultValue={num(claim.sum_insured)} /></Field>
                  <Field label="Cover type" className="sm:col-span-2"><PolicySelect defaultValue={claim.policy_type} /></Field>
                  <Field label="Excess" hint="The homeowner's share of the claim, set by their policy.">
                    <Input name="excess" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={num(claim.excess)} />
                  </Field>
                </fieldset>
                <fieldset className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">The event</legend>
                  <Field label="What happened">
                    <Select name="event_type" defaultValue={claim.event_type ?? ""}>
                      <option value="">Not set</option>
                      {EVENT_TYPES.map((e) => <option key={e} value={e}>{EVENT_LABEL[e]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date of the event"><Input name="date_of_loss" type="date" max={today} defaultValue={claim.date_of_loss ?? ""} /></Field>
                  <Field label="Claim lodged on"><Input name="lodged_on" type="date" max={today} defaultValue={claim.lodged_on ?? ""} /></Field>
                  <Field label="Catastrophe" hint="Declared by the Insurance Council of Australia (ICA) for big events">
                    <Select name="catastrophe" defaultValue={claim.catastrophe}>{CATASTROPHES.map((c) => <option key={c} value={c}>{CATASTROPHE_LABEL[c]}</option>)}</Select>
                  </Field>
                  <Field label="Catastrophe name / code"><Input name="catastrophe_name" defaultValue={claim.catastrophe_name ?? ""} placeholder="e.g. CAT 251" /></Field>
                  <Field label="Damage notes"><Input name="cause_of_loss" defaultValue={claim.cause_of_loss ?? ""} placeholder="Hail damage to north-facing sheets…" /></Field>
                </fieldset>
                <fieldset className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Assessor / loss adjuster</legend>
                  <Field label="Name"><Input name="adjuster_name" defaultValue={claim.adjuster_name ?? ""} /></Field>
                  <Field label="Phone"><Input name="adjuster_phone" type="tel" defaultValue={claim.adjuster_phone ?? ""} /></Field>
                  <Field label="Email"><Input name="adjuster_email" type="email" defaultValue={claim.adjuster_email ?? ""} /></Field>
                  <Field label="Inspection"><DateTimeInput name="adjuster_meeting_at" defaultValue={claim.adjuster_meeting_at} aria-label="Inspection date and time" /></Field>
                </fieldset>
                <fieldset className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">How the insurer settles</legend>
                  <Field label="Settlement path" className="sm:col-span-2"><SettlementSelect defaultValue={claim.settlement_path} /></Field>
                  <Field label="Insurer's builder / repair network" hint="If you are their subcontractor"><Input name="panel_builder_name" defaultValue={claim.panel_builder_name ?? ""} /></Field>
                  <Field label="Their contact"><Input name="panel_builder_contact" defaultValue={claim.panel_builder_contact ?? ""} placeholder="Name, phone, email" /></Field>
                  <Field label="Their job / work order no."><Input name="panel_job_ref" defaultValue={claim.panel_job_ref ?? ""} /></Field>
                  <Field label="Scope of works received"><Input name="scope_received_on" type="date" defaultValue={claim.scope_received_on ?? ""} /></Field>
                  <Field label="Insurer's approved amount (inc GST)"><Input name="approved_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={num(claim.approved_amount)} /></Field>
                  <Field label="Decision date"><Input name="decision_on" type="date" defaultValue={claim.decision_on ?? ""} /></Field>
                  <Field label="Cash settlement offered (to homeowner)"><Input name="cash_settlement_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={num(claim.cash_settlement_amount)} /></Field>
                  <Field label="Offered on"><Input name="cash_settlement_offered_on" type="date" defaultValue={claim.cash_settlement_offered_on ?? ""} /></Field>
                  <Field label="Insurer has all information on" hint="Starts the 10-business-day decision guide"><Input name="info_complete_on" type="date" defaultValue={claim.info_complete_on ?? ""} /></Field>
                  <Field label="Last update from insurer"><Input name="last_insurer_update_on" type="date" defaultValue={claim.last_insurer_update_on ?? ""} /></Field>
                </fieldset>
                <fieldset className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Make-safe / temporary repairs (tarp)</legend>
                  <Field label="Done on"><Input name="make_safe_done_on" type="date" defaultValue={claim.make_safe_done_on ?? ""} /></Field>
                  <Field label="Authorised by">
                    <Select name="make_safe_authorised_by" defaultValue={claim.make_safe_authorised_by ?? ""}>
                      <option value="">Not set</option>
                      {MAKE_SAFE_AUTHORISERS.map((p) => <option key={p} value={p}>{PARTY_LABEL[p]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Who pays for it">
                    <Select name="make_safe_payer" defaultValue={claim.make_safe_payer ?? ""}>
                      <option value="">Not set</option>
                      {MAKE_SAFE_PAYERS.map((p) => <option key={p} value={p}>{PARTY_LABEL[p]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Make-safe amount (inc GST)"><Input name="make_safe_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={num(claim.make_safe_amount)} /></Field>
                  <Field label="Make-safe notes" className="sm:col-span-2"><Input name="make_safe_notes" defaultValue={claim.make_safe_notes ?? ""} placeholder="Tarped north side, 2 sheets lifted…" /></Field>
                </fieldset>
                <Field label="Notes"><Textarea name="notes" defaultValue={claim.notes ?? ""} /></Field>
                <SubmitButton className="min-h-11">Save claim</SubmitButton>
              </KeepForm>
            </Card>
          ) : (
            <Card title="Claim">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Insurer</dt><dd>{claim.carrier ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Claim number</dt><dd>{claim.claim_number ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Cover</dt><dd>{POLICY_LABEL[claim.policy_type] ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Event</dt><dd>{claim.event_type ? EVENT_LABEL[claim.event_type as EventType] : "—"}{claim.date_of_loss ? ` · ${date(claim.date_of_loss)}` : ""}</dd></div>
                <div><dt className="text-xs text-slate-500">Assessor</dt><dd>{[claim.adjuster_name, claim.adjuster_phone].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Make-safe</dt><dd>{claim.make_safe_done_on ? `Done ${date(claim.make_safe_done_on)}` : "—"}{claim.make_safe_notes ? ` · ${claim.make_safe_notes}` : ""}</dd></div>
              </dl>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          {(claim.adjuster_name || claim.adjuster_meeting_at) && (
            <Card title="Assessor">
              <p className="font-medium text-slate-900">{claim.adjuster_name ?? "Assessor"}</p>
              {claim.adjuster_phone && <a className="block min-h-11 py-2 text-sm text-brand-700" href={`tel:${claim.adjuster_phone}`}>{claim.adjuster_phone}</a>}
              {claim.adjuster_email && <a className="block truncate text-sm text-brand-700" href={`mailto:${claim.adjuster_email}`}>{claim.adjuster_email}</a>}
              {claim.adjuster_meeting_at && <p className="mt-2 text-sm text-slate-700">Inspection: <b><LocalDateTime iso={claim.adjuster_meeting_at} /></b></p>}
            </Card>
          )}
          {canSeeMoney && (
            <MoneySummary claim={claim} contractTotal={est?.total ?? null} received={bal ? { expected: Number(bal.expected), received: Number(bal.received) } : undefined} />
          )}
          {Number(claim.make_safe_amount) > 0 && (
            <p className="text-sm text-slate-600">Make-safe {money(claim.make_safe_amount)} · paid by {PARTY_LABEL[claim.make_safe_payer ?? ""] ?? "not set"}</p>
          )}
          <details className="group rounded-2xl bg-white ring-1 ring-slate-200">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-slate-800">What the homeowner sees ▸</summary>
            <div className="px-2 pb-2">
              <ClaimExplainer excess={claim.excess} settlementPath={claim.settlement_path} insurer={claim.carrier} orgName={org.name} />
            </div>
          </details>
          {isAdmin && (
            <Card title="Danger zone">
              <form action={deleteClaim}>
                <input type="hidden" name="id" value={claim.id} />
                <p className="mb-3 text-sm text-slate-500">Deletes the claim, its payments ledger, paperwork, variation requests and scope lines.</p>
                <SubmitButton variant="danger" confirm="Delete this insurance claim and everything on it?">Delete claim</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
