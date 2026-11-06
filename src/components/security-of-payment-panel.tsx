import { Card } from "@/components/ui";
import { AU_STATE_NAME, asAuState } from "@/lib/au";

/**
 * Placeholder slot for state security-of-payment information (payment claims, payment schedules,
 * adjudication). Australia has no US-style mechanic's lien; each state's SOP Act is the closest equivalent.
 * The compliance builder fills this in from src/lib/au-rules.ts — keep the props stable.
 */
export function SecurityOfPaymentPanel({ state }: { state?: string | null }) {
  const st = asAuState(state);
  return (
    <Card title="Getting paid (security of payment)">
      <p className="text-sm text-slate-600" data-testid="sop-panel">
        {st ? `Security of payment rules for ${AU_STATE_NAME[st]} appear here.` : "Security of payment rules for this job's state appear here once the job has a state."}
      </p>
    </Card>
  );
}
