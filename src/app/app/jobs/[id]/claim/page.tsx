import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { KeepForm } from "./_components/keep-form";
import { Badge, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { daysSince } from "@/lib/format";
import { agingTone, CLAIM_FLOW, CLAIM_STAGE_HINT, CLAIM_STAGE_LABEL, CLAIM_STAGES, nextClaimStage, POLICY_LABEL } from "@/lib/claims";
import { getClaimForJob } from "@/lib/claims-server";
import { deleteClaim, setClaimStage, updateClaim } from "./actions";
import { DateTimeInput, LocalDateTime, PolicySelect } from "./_components/client-bits";
import { MoneySummary } from "./_components/money-summary";

export const metadata: Metadata = { title: "Insurance claim" };

export default async function ClaimPage({ params }: PageProps<"/app/jobs/[id]/claim">) {
  const { id } = await params;
  const { supabase, canSeeMoney, isAdmin, org } = await requireOrg();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const [{ data: job }, { data: bal }] = await Promise.all([
    supabase.from("jobs").select("state").eq("id", id).maybeSingle(),
    supabase.from("claim_balances").select("expected, received").eq("claim_id", claim.id).maybeSingle(),
  ]);
  const days = daysSince(claim.stage_changed_at);
  const next = nextClaimStage(claim.stage);
  const flowIdx = CLAIM_FLOW.indexOf(claim.stage);
  const ended = claim.stage === "closed" || claim.stage === "denied";

  return (
    <div className="space-y-6">
      {/* Stage stepper */}
      <Card>
        <ol className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1" aria-label="Claim stages">
          {CLAIM_FLOW.map((s, i) => {
            const done = claim.stage === "closed" || (flowIdx >= 0 && i < flowIdx);
            const current = s === claim.stage;
            return (
              <li key={s} className="flex shrink-0 flex-col items-center gap-1 px-1" aria-current={current ? "step" : undefined}>
                <span
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    current ? "bg-brand-500 text-white" : done ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cx("w-20 text-center text-[11px] leading-tight", current ? "font-semibold text-slate-900" : "text-slate-500")}>{CLAIM_STAGE_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
              {CLAIM_STAGE_LABEL[claim.stage]}
              <Badge tone={claim.stage === "denied" ? "red" : agingTone(days)}>{days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} in stage`}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-slate-600">{CLAIM_STAGE_HINT[claim.stage]}</p>
          </div>
          {canSeeMoney && (
            <div className="flex flex-wrap items-center gap-2">
              {next && (
                <form action={setClaimStage}>
                  <input type="hidden" name="id" value={claim.id} />
                  <input type="hidden" name="stage" value={next} />
                  <SubmitButton className="min-h-11">Advance to: {CLAIM_STAGE_LABEL[next]} →</SubmitButton>
                </form>
              )}
              <form key={claim.stage} action={setClaimStage} className="flex gap-1">
                <input type="hidden" name="id" value={claim.id} />
                <Select name="stage" defaultValue={claim.stage} aria-label="Move claim to stage" className="min-h-11 w-44">
                  {CLAIM_STAGES.map((s) => <option key={s} value={s}>{CLAIM_STAGE_LABEL[s]}</option>)}
                </Select>
                <SubmitButton variant="secondary" className="min-h-11">Move</SubmitButton>
              </form>
            </div>
          )}
        </div>
        {ended && claim.stage === "denied" && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">This claim was denied. Move it back to a stage if the carrier re-opens it.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canSeeMoney ? (
            <Card title="Claim details">
              <KeepForm action={updateClaim} className="space-y-6">
                <input type="hidden" name="id" value={claim.id} />
                <fieldset className="grid gap-4 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Policy</legend>
                  <Field label="Insurance company"><Input name="carrier" defaultValue={claim.carrier ?? ""} /></Field>
                  <Field label="Claim #"><Input name="claim_number" defaultValue={claim.claim_number ?? ""} /></Field>
                  <Field label="Policy #"><Input name="policy_number" defaultValue={claim.policy_number ?? ""} /></Field>
                  <Field label="Policy type"><PolicySelect defaultValue={claim.policy_type} /></Field>
                  <Field label="Date of loss"><Input name="date_of_loss" type="date" defaultValue={claim.date_of_loss ?? ""} /></Field>
                  <Field label="Cause of loss"><Input name="cause_of_loss" defaultValue={claim.cause_of_loss ?? ""} placeholder="Hail, wind, fallen tree…" /></Field>
                </fieldset>
                <fieldset className="grid gap-4 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Adjuster</legend>
                  <Field label="Adjuster name"><Input name="adjuster_name" defaultValue={claim.adjuster_name ?? ""} /></Field>
                  <Field label="Adjuster phone"><Input name="adjuster_phone" type="tel" defaultValue={claim.adjuster_phone ?? ""} /></Field>
                  <Field label="Adjuster email"><Input name="adjuster_email" type="email" defaultValue={claim.adjuster_email ?? ""} /></Field>
                  <Field label="Adjuster meeting"><DateTimeInput name="adjuster_meeting_at" defaultValue={claim.adjuster_meeting_at} aria-label="Adjuster meeting" /></Field>
                </fieldset>
                <fieldset className="grid gap-4 sm:grid-cols-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Carrier numbers <span className="font-normal text-slate-400">(from the carrier&apos;s scope)</span></legend>
                  <Field label="RCV (replacement cost)"><Input name="rcv_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(claim.rcv_amount) || ""} /></Field>
                  <Field label="Depreciation"><Input name="depreciation_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(claim.depreciation_amount) || ""} /></Field>
                  <Field label="Deductible"><Input name="deductible" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(claim.deductible) || ""} /></Field>
                  <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
                    <input type="checkbox" name="o_and_p_included" defaultChecked={claim.o_and_p_included} className="h-5 w-5 accent-brand-500" />
                    Carrier included overhead &amp; profit (O&amp;P)
                  </label>
                </fieldset>
                <fieldset className="grid gap-4 sm:grid-cols-2">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Mortgage company <span className="font-normal text-slate-400">(checks are often made out to them too)</span></legend>
                  <Field label="Mortgage company"><Input name="mortgagee_name" defaultValue={claim.mortgagee_name ?? ""} /></Field>
                  <Field label="Loan #"><Input name="mortgage_loan_number" defaultValue={claim.mortgage_loan_number ?? ""} /></Field>
                  <Field label="Loss-draft department contact" className="sm:col-span-2" hint="Who endorses the checks: phone, email, fax, mailing address.">
                    <Input name="loss_draft_contact" defaultValue={claim.loss_draft_contact ?? ""} />
                  </Field>
                </fieldset>
                <Field label="Notes"><Textarea name="notes" defaultValue={claim.notes ?? ""} /></Field>
                <SubmitButton className="min-h-11">Save claim</SubmitButton>
              </KeepForm>
            </Card>
          ) : (
            <Card title="Claim">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Insurance company</dt><dd>{claim.carrier ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Claim #</dt><dd>{claim.claim_number ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Policy</dt><dd>{POLICY_LABEL[claim.policy_type]}</dd></div>
                <div><dt className="text-xs text-slate-500">Adjuster</dt><dd>{[claim.adjuster_name, claim.adjuster_phone].filter(Boolean).join(" · ") || "—"}</dd></div>
              </dl>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {(claim.adjuster_name || claim.adjuster_meeting_at) && (
            <Card title="Adjuster">
              <p className="font-medium text-slate-900">{claim.adjuster_name ?? "Adjuster"}</p>
              {claim.adjuster_phone && <a className="block text-sm text-brand-700" href={`tel:${claim.adjuster_phone}`}>{claim.adjuster_phone}</a>}
              {claim.adjuster_email && <a className="block truncate text-sm text-brand-700" href={`mailto:${claim.adjuster_email}`}>{claim.adjuster_email}</a>}
              {claim.adjuster_meeting_at && (
                <p className="mt-2 text-sm text-slate-700">Meeting: <b><LocalDateTime iso={claim.adjuster_meeting_at} /></b></p>
              )}
            </Card>
          )}
          {canSeeMoney && <MoneySummary claim={claim} state={job?.state ?? org.state} received={bal ? { expected: Number(bal.expected), received: Number(bal.received) } : undefined} />}
          {canSeeMoney && Number(claim.rcv_amount) === 0 && (
            <p className="text-sm text-slate-500">Enter the RCV, depreciation and deductible when the carrier&apos;s scope arrives to see the money summary.</p>
          )}
          {isAdmin && (
            <Card title="Danger zone">
              <form action={deleteClaim}>
                <input type="hidden" name="id" value={claim.id} />
                <p className="mb-3 text-sm text-slate-500">Deletes the claim, its checks, paperwork, supplements and scope lines.</p>
                <SubmitButton variant="danger" confirm="Delete this insurance claim and everything on it?">Delete claim</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
