import { AU_STATE_NAME, asAuState } from "@/lib/au";

/**
 * Placeholder slot for state-by-state rules on a quote (contracts, deposits, cooling-off, home warranty
 * insurance, licences, permits). The compliance builder fills this in from src/lib/au-rules.ts.
 */
export function StateCompliancePanel({ state, source }: { state: string | null | undefined; source?: "job" | "customer" | "company" | "none" }) {
  const s = asAuState(state);
  const name = s ? AU_STATE_NAME[s] : null;
  return (
    <section data-testid="state-compliance-panel" className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">State rules</h2>
        <span className="text-sm font-medium text-slate-700" data-testid="compliance-state">{name ?? "No state set"}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {name ? `State rules for ${name} will appear here.` : "Set the job's state (or the customer's) to see the rules that apply."}
      </p>
      {s && source && source !== "job" && <p className="mt-1 text-xs text-slate-500">Using the {source}&apos;s state because the job has none.</p>}
    </section>
  );
}
