import { EXPLAINER_FOOTNOTE, homeownerExplainer } from "@/lib/claims";

/**
 * Homeowner-facing explainer of the excess, cash settlement and complaints (insurer's internal dispute
 * resolution, then AFCA). General information only. Used on the public invoice for insurance jobs and
 * previewed on the claim page; the homeowner portal can render it too.
 */
export function ClaimExplainer({ excess, settlementPath, insurer, orgName, compact }: { excess?: number | string | null; settlementPath?: string | null; insurer?: string | null; orgName: string; compact?: boolean }) {
  const sections = homeownerExplainer({ excess, settlement_path: settlementPath, insurer, orgName });
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-testid="claim-explainer">
      <h2 className="font-display text-base font-semibold text-slate-900">Your insurance claim, in plain English</h2>
      <div className={compact ? "mt-3 grid gap-4 sm:grid-cols-2" : "mt-3 space-y-4"}>
        {sections.map((s) => (
          <div key={s.title}>
            <h3 className="text-sm font-semibold text-slate-800">{s.title}</h3>
            {s.body.map((p) => <p key={p} className="mt-1 text-sm text-slate-600">{p}</p>)}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">{EXPLAINER_FOOTNOTE}</p>
    </section>
  );
}
