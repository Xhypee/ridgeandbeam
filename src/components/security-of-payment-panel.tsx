// Security of payment (progress claims) for the job's state: does the SOP Act cover this customer,
// and how long does the other side have to answer a payment claim? General information, not legal advice.
import { Badge, cx } from "@/components/ui";
import { AU_STATE_NAME, asAuState } from "@/lib/au";
import { formatAuDate, rulesFor } from "@/lib/au-rules";

export type SecurityOfPaymentProps = {
  state: string | null | undefined;
  /** The customer lives (or will live) in the house. */
  ownerOccupier?: boolean;
  /** You are subcontracting to a builder / insurer's builder. */
  subcontract?: boolean;
  contractValueIncGst?: number;
  contractDate?: string | Date | null;
  className?: string;
};

export function SecurityOfPaymentPanel({ state, ownerOccupier = true, subcontract = false, contractValueIncGst = 20000, contractDate, className }: SecurityOfPaymentProps) {
  const st = asAuState(state);
  if (!st) {
    return (
      <section data-testid="sop-panel" data-sop-panel className={cx("rounded-2xl bg-white p-5 ring-1 ring-slate-200", className)}>
        <h2 className="text-[15px] font-bold text-ink">Security of payment</h2>
        <p className="mt-1 text-sm text-slate-600">Set the job&apos;s state to see the payment-claim rules.</p>
      </section>
    );
  }
  const r = rulesFor(st, {
    contractValueIncGst, contractDate: contractDate ?? new Date(), roofSystem: "metal", jobType: "re_roof", existingHouse: true, ownerOccupier, subcontract,
  });
  const s = r.securityOfPayment;
  const applies = s.appliesToThisJob;
  const unit = s.unit === "working_days" ? "working days" : "business days";
  return (
    <section data-testid="sop-panel" data-sop-panel={st} className={cx("rounded-2xl bg-white ring-1 ring-slate-200", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink">Getting paid (security of payment) · {AU_STATE_NAME[st]}</h2>
        <Badge tone={applies === true ? "teal" : applies === "depends" ? "violet" : "slate"}>
          {applies === true ? "Act applies to this job" : applies === "depends" ? "Depends on the customer" : "Doesn't apply to this job"}
        </Badge>
      </header>
      <div className="space-y-2 px-5 py-4 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-ink">Home owners living in the house: </span>
          {s.appliesToOwnerOccupier === true ? "covered" : s.appliesToOwnerOccupier === "unclear" ? "unclear for this kind of contract (treated as excluded)" : "excluded"}.
          {subcontract ? " You're subcontracting, so the Act covers your claims to the builder." : ""}
        </p>
        {s.scheduleDays !== null && (
          <p data-sop-days={s.scheduleDays}>
            <span className="font-semibold text-ink">Reply to a payment claim: </span>within {s.scheduleDays} {unit}{st === "NT" ? " (notice of dispute, if the contract is silent)" : " (or sooner if the contract says so)"}.
          </p>
        )}
        <p className="text-slate-600">{s.note}</p>
        <p className="text-xs text-slate-500">
          Source:{" "}
          {s.src.map((c, i) => <span key={c.url}>{i > 0 && " · "}<a className="text-brand-700 underline underline-offset-2" href={c.url} target="_blank" rel="noreferrer">{c.label}</a></span>)}
          {" · "}Verified {formatAuDate(r.verifiedOn)}. {r.disclaimer}
        </p>
      </div>
    </section>
  );
}
