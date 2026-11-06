// What the law says for THIS job in THIS state: plain-language panel for the estimate/quote page.
// Server-renderable (no hooks); uses <details> for progressive disclosure so it works without JS.
// This is general information, not legal advice.
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui";
import { asAuState, AU_STATE_TZ } from "@/lib/au";
import { calendarDate } from "@/lib/au-business-days";
import {
  $, auJobTypeFrom, coolingOffEnd, aclTerminationEnd, formatAuDate, HOLIDAY_NOTE, roofSystemFrom, rulesFor, SHOW_ON_LABEL, stateReference,
  type AuJobType, type Cite, type RoofSystem, type RulesResult, type Tri,
} from "@/lib/au-rules";

export type StateComplianceProps = {
  state: string | null | undefined;
  /** Where the state came from (estimate page resolves job → customer → company). */
  source?: "job" | "customer" | "company" | "none";
  /** Total contract price incl. GST. Omit before pricing: the panel then shows the state's key thresholds. */
  contractValueIncGst?: number | null;
  /** Contract (signing) date; defaults to today. Picks the effective-dated rules. */
  contractDate?: string | Date | null;
  /** A RoofSystem, or the job's free-text roof material. */
  roofSystem?: RoofSystem | string | null;
  /** An AU job type, or the stored jobs.job_type value. */
  jobType?: AuJobType | string | null;
  doorKnockSale?: boolean;
  ownerOccupier?: boolean;
  buildingApprovalRequired?: boolean;
  existingHouse?: boolean;
  urgentWork?: boolean;
  paintOrCoatOnly?: boolean;
  mixedWork?: boolean;
  subcontract?: boolean;
  disasterEmergencyRepair?: boolean;
  builtBefore1990?: boolean;
  /** When the owner got (or will get) the signed copy: starts most cooling-off periods. Defaults to the contract date. */
  copyGivenOn?: string | Date | null;
  /** Your licence number in this state (organizations.licences[state].number). */
  licenceNumber?: string | null;
  /** Hide the sources/unverified sections (e.g. narrow sidebars). */
  compact?: boolean;
  className?: string;
};

const ROOF_VALUES = ["metal", "concrete_tile", "terracotta_tile", "membrane"];
const JOB_VALUES = ["re_roof", "restoration", "repair", "gutters", "asbestos_replacement", "new_build", "other"];

/** Normalise loose props into rule input; exported for other server code that wants the same defaults. */
export function rulesFromProps(p: StateComplianceProps): RulesResult | null {
  const state = asAuState(p.state);
  if (!state || p.contractValueIncGst == null) return null;
  const roofSystem = ROOF_VALUES.includes(String(p.roofSystem)) ? (p.roofSystem as RoofSystem) : roofSystemFrom(p.roofSystem);
  const jobType = JOB_VALUES.includes(String(p.jobType)) ? (p.jobType as AuJobType) : auJobTypeFrom(p.jobType);
  return rulesFor(state, {
    contractValueIncGst: Number(p.contractValueIncGst),
    contractDate: p.contractDate ?? new Date(),
    roofSystem,
    jobType,
    existingHouse: p.existingHouse ?? jobType !== "new_build",
    doorKnockSale: p.doorKnockSale,
    ownerOccupier: p.ownerOccupier,
    buildingApprovalRequired: p.buildingApprovalRequired,
    urgentWork: p.urgentWork,
    paintOrCoatOnly: p.paintOrCoatOnly,
    mixedWork: p.mixedWork,
    subcontract: p.subcontract,
    disasterEmergencyRepair: p.disasterEmergencyRepair,
    builtBefore1990: p.builtBefore1990,
  });
}

const triTone = (t: Tri) => (t === true ? "amber" : t === "depends" ? "violet" : "slate");
const triText = (t: Tri, yes = "Required", no = "Not required") => (t === true ? yes : t === "depends" ? "Depends — see note" : no);

function Row({ label, badge, children }: { label: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-slate-100 py-3 first:border-t-0 @2xl:grid-cols-[11rem_1fr] @2xl:gap-4">
      <div className="text-[13px] font-semibold text-slate-500">{label}</div>
      <div className="min-w-0 text-sm text-slate-700">
        {badge && <div className="mb-1">{badge}</div>}
        {children}
      </div>
    </div>
  );
}

function Sources({ src }: { src: Cite[] }) {
  if (!src.length) return null;
  return (
    <span className="mt-1 block text-xs text-slate-500">
      Source:{" "}
      {src.slice(0, 3).map((s, i) => (
        <span key={s.url}>
          {i > 0 && " · "}
          <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2 hover:text-brand-600">{s.label}</a>
        </span>
      ))}
    </span>
  );
}

function SourceNote({ source }: { source?: StateComplianceProps["source"] }) {
  if (!source || source === "job" || source === "none") return null;
  return <p className="mt-1 text-xs text-slate-500">Using the {source}&apos;s state because the job has none.</p>;
}

/** Before a price is known: the state's key thresholds with sources. */
function ReferenceView({ props }: { props: StateComplianceProps }) {
  const ref = stateReference(props.state!, props.contractDate ?? new Date());
  return (
    <section data-testid="state-compliance-panel" data-state-compliance={ref.state} data-mode="reference" aria-label={`${ref.stateName} rules`} className={cx("@container rounded-2xl bg-white ring-1 ring-slate-200", props.className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink"><span data-testid="compliance-state">{ref.stateName}</span> rules</h2>
          <p className="mt-0.5 text-xs text-slate-500">Add a price to see exactly what applies to this job.</p>
          <SourceNote source={props.source} />
        </div>
        <a href={ref.regulator.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-600">{ref.regulator.name} ↗</a>
      </header>
      <div className="px-5 pb-2">
        {ref.rows.slice(0, props.compact ? 6 : undefined).map((row) => (
          <Row key={row.topic} label={row.topic}><p>{row.text}</p><Sources src={row.src} /></Row>
        ))}
        {ref.changes.map((c) => <p key={c} className="border-t border-slate-100 py-3 text-sm font-semibold text-amber-800">Coming change: {c}</p>)}
        <p className="border-t border-slate-100 py-3 text-xs text-slate-500">Rules last verified {formatAuDate(ref.verifiedOn)}. {ref.disclaimer}</p>
      </div>
    </section>
  );
}

export function StateCompliancePanel(props: StateComplianceProps) {
  const rules = rulesFromProps(props);
  if (!rules && asAuState(props.state)) return <ReferenceView props={props} />;
  if (!rules) {
    return (
      <section data-testid="state-compliance-panel" data-state-compliance className={cx("rounded-2xl bg-white p-5 ring-1 ring-slate-200", props.className)}>
        <h2 className="text-[15px] font-bold text-ink">State rules</h2>
        <p className="mt-1 text-sm text-slate-600">Set the job&apos;s state (NSW, VIC, QLD, WA, SA, TAS, ACT or NT) to see the licence, contract, deposit, cooling-off and insurance rules that apply.</p>
      </section>
    );
  }
  const r = rules;
  const copyOn = calendarDate(props.copyGivenOn ?? r.contractDate, AU_STATE_TZ[r.state]);
  const coolEnd = coolingOffEnd(r, copyOn);
  const aclEnd = r.acl.applies ? aclTerminationEnd(r.contractDate, r.state) : null;
  const showLicence = r.licence.showOn.includes("quote") || r.licence.showOn.includes("contract") || r.licence.showOnRecommended.includes("quote");
  const whereLicence = [...r.licence.showOn.map((s) => SHOW_ON_LABEL[s]), ...r.licence.showOnRecommended.map((s) => `${SHOW_ON_LABEL[s]} (recommended)`)];

  return (
    <section data-testid="state-compliance-panel" data-state-compliance={r.state} aria-label={`${r.stateName} rules`} className={cx("@container rounded-2xl bg-white ring-1 ring-slate-200", props.className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">What applies in <span data-testid="compliance-state">{r.stateName}</span></h2>
          <p className="mt-0.5 text-xs text-slate-500">{r.regime} · contract date {formatAuDate(r.contractDate)} · {$(Number(props.contractValueIncGst))} incl. GST</p>
          <SourceNote source={props.source} />
        </div>
        <a href={r.regulator.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-600">{r.regulator.name} ↗</a>
      </header>
      <div className="px-5 pb-2">
        <p className="pt-3 text-sm text-slate-700">{r.scope.summary}</p>

        <Row label="Licence" badge={<Badge tone={triTone(r.licence.required)}>{triText(r.licence.required, "Licence needed", "No licence needed")}</Badge>}>
          {r.licence.required !== false && showLicence && (
            <p className="font-semibold text-ink">
              {props.licenceNumber ? <>Show licence no. <span data-licence-number>{props.licenceNumber}</span> on this quote and the contract.</> : <>Add your {r.state} licence number in Settings → Company so it prints on quotes and contracts.</>}
            </p>
          )}
          <p>{r.licence.thresholdText}</p>
          {r.licence.classes.length > 0 && <p className="mt-1 text-slate-600">Classes: {r.licence.classes.join("; ")}.</p>}
          {whereLicence.length > 0 && <p className="mt-1 text-slate-600">Show the number on: {whereLicence.join(", ")}.</p>}
          <Sources src={r.licence.src} />
        </Row>

        <Row label="Written contract" badge={<Badge tone={triTone(r.writtenContract.required)}>{r.writtenContract.tier ?? triText(r.writtenContract.required, "Written contract", "Not required by law")}</Badge>}>
          <p>{r.writtenContract.note}</p>
          {r.writtenContract.mustInclude.length > 0 && (
            <details className="mt-1">
              <summary className="inline-flex min-h-9 cursor-pointer items-center font-semibold text-brand-700">What the contract must include ({r.writtenContract.mustInclude.length})</summary>
              <ul className="ml-5 list-disc text-slate-600">{r.writtenContract.mustInclude.map((m) => <li key={m}>{m}</li>)}</ul>
            </details>
          )}
          <Sources src={r.writtenContract.src} />
        </Row>

        <Row label="Maximum deposit" badge={r.deposit.isLegalLimit ? <Badge tone="amber" className="text-sm">{r.deposit.maxAud !== null ? $(r.deposit.maxAud) : "—"}{r.deposit.maxPct !== null ? ` (${r.deposit.maxPct}%)` : ""}</Badge> : <Badge>No legal cap</Badge>}>
          <p data-deposit-max={r.deposit.maxAud ?? ""}>{r.deposit.note}</p>
          <Sources src={r.deposit.src} />
        </Row>

        <Row label="Cooling-off" badge={<Badge tone={r.coolingOff.applies ? "amber" : "slate"}>{r.coolingOff.applies ? `${r.coolingOff.length} business days` : "None under state law"}</Badge>}>
          {r.coolingOff.applies && coolEnd && (
            <p className="font-semibold text-ink" data-cooling-off-end={coolEnd}>
              Owner can withdraw until the end of {formatAuDate(coolEnd)} (if they get the signed copy on {formatAuDate(copyOn)}).
            </p>
          )}
          {r.coolingOff.applies && <p>{r.coolingOff.startsWhen}</p>}
          <p>{r.coolingOff.note}</p>
          {r.coolingOff.applies && r.coolingOff.exceptions.length > 0 && (
            <details className="mt-1">
              <summary className="inline-flex min-h-9 cursor-pointer items-center font-semibold text-brand-700">Exceptions</summary>
              <ul className="ml-5 list-disc text-slate-600">{r.coolingOff.exceptions.map((m) => <li key={m}>{m}</li>)}</ul>
            </details>
          )}
          {r.coolingOff.applies && <p className="mt-1 text-xs text-slate-500">{HOLIDAY_NOTE}</p>}
          <Sources src={r.coolingOff.src} />
        </Row>

        <Row label="Home warranty insurance" badge={<Badge tone={triTone(r.insurance.required)}>{triText(r.insurance.required, r.insurance.mustBeBefore === "deposit" ? "Needed before the deposit" : r.insurance.mustBeBefore === "work" ? "Needed before work starts" : "Needed", "Not needed")}</Badge>}>
          {r.insurance.scheme && <p className="font-medium text-ink">{r.insurance.scheme}</p>}
          <p>{r.insurance.note}</p>
          <Sources src={r.insurance.src} />
        </Row>

        {r.documents.length > 0 && (
          <Row label="Give the owner">
            <ul className="space-y-1">
              {r.documents.map((d) => (
                <li key={d.name}>
                  <a href={d.link} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-600">{d.name}</a>
                  <span className="text-slate-500"> — {d.when}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}

        <Row label="Warranties">
          {r.statutoryWarranty.length > 0 ? (
            <ul className="space-y-0.5">{r.statutoryWarranty.map((w) => <li key={w.type}><span className="font-semibold text-ink">{w.years < 1 ? `${Math.round(w.years * 12)} months` : `${w.years} years`}</span> — {w.type}</li>)}</ul>
          ) : null}
          <p className="text-slate-600">{r.warrantyNote}</p>
        </Row>

        {r.acl.applies && (
          <Row label="Door-knock sale (ACL)" badge={<Badge tone="red">{r.acl.exemptionClaimed ? "Emergency-repair exemption" : "No payment for 10 business days"}</Badge>}>
            {aclEnd && !r.acl.exemptionClaimed && <p className="font-semibold text-ink" data-acl-end={aclEnd}>No work and no payment until after {formatAuDate(aclEnd)} (if signed {formatAuDate(r.contractDate)}).</p>}
            <ul className="ml-5 list-disc text-slate-600">{r.acl.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <p className="mt-1 text-slate-600">{r.acl.callingHours}</p>
            <Sources src={r.acl.src} />
          </Row>
        )}

        <Row label="Pricing">
          <ul className="ml-5 list-disc text-slate-600">{r.national.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Row>

        {r.unverified.length > 0 && (
          <Row label="Check with your regulator">
            <ul className="space-y-1" data-unverified>
              {r.unverified.map((u) => (
                <li key={u.topic}>
                  <span className="font-semibold text-ink">{u.topic}:</span> {u.note}{" "}
                  <a href={u.regulator.url} target="_blank" rel="noreferrer" className="whitespace-nowrap font-semibold text-brand-700 underline underline-offset-2">Check with {u.regulator.name} ↗</a>
                </li>
              ))}
            </ul>
          </Row>
        )}

        {!props.compact && (
          <details className="border-t border-slate-100 py-3">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-brand-700">All sources ({r.sources.length})</summary>
            <ul className="mt-1 space-y-0.5 text-xs">
              {r.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="break-words text-brand-700 underline underline-offset-2">{s.label}</a></li>)}
            </ul>
          </details>
        )}
        <p className="border-t border-slate-100 py-3 text-xs text-slate-500">
          Rules last verified {formatAuDate(r.verifiedOn)}. {r.disclaimer} If something looks wrong, check with {r.regulator.name}.
        </p>
      </div>
    </section>
  );
}
