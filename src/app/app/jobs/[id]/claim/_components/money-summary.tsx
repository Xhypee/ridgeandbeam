import { Card, cx } from "@/components/ui";
import { claimMoney, DEDUCTIBLE_WAIVER_STATES, POLICY_LABEL, type ClaimMoneyInput } from "@/lib/claims";
import { money } from "@/lib/format";

function Row({ label, value, strong, minus, hint }: { label: string; value: number; strong?: boolean; minus?: boolean; hint?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-slate-200 pt-2 font-semibold text-slate-900")}>
      <dt className="text-sm">
        {label}
        {hint && <span className="block text-xs font-normal text-slate-500">{hint}</span>}
      </dt>
      <dd className="shrink-0 tabular-nums">{minus && value > 0 ? "− " : ""}{money(value)}</dd>
    </div>
  );
}

export function MoneySummary({ claim, state, received }: { claim: ClaimMoneyInput & { o_and_p_included: boolean }; state?: string | null; received?: { expected: number; received: number } }) {
  const m = claimMoney(claim);
  const waiver = state ? DEDUCTIBLE_WAIVER_STATES[state.toUpperCase()] : undefined;
  return (
    <Card title="Money summary" actions={<span className="text-xs text-slate-500">{POLICY_LABEL[claim.policy_type]}</span>}>
      <dl className="text-slate-700">
        <Row label="Replacement cost (RCV)" value={m.rcv} hint={claim.o_and_p_included ? "Includes overhead & profit" : "No overhead & profit included"} />
        <Row label="Depreciation held back" value={m.depreciation} minus />
        <Row label="Deductible (homeowner pays)" value={m.deductible} minus />
        <Row label="First check (ACV payable)" value={m.acvPayable} strong />
      </dl>
      <div
        className={cx(
          "mt-3 rounded-lg px-3 py-2 text-sm",
          m.recoverable === "yes" ? "bg-green-50 text-green-800" : m.recoverable === "no" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900",
        )}
      >
        {m.recoverable === "yes" && (
          <>Depreciation of <b>{money(m.depreciation)}</b> is recoverable: the carrier pays it after the roof is built and you send the certificate of completion and final invoice.</>
        )}
        {m.recoverable === "no" && (
          <><b>Depreciation is NOT recoverable</b> on this policy. {money(m.depreciation)} will not be paid by the carrier.</>
        )}
        {m.recoverable === "maybe" && (
          <><b>Policy type unknown.</b> {money(m.depreciation)} of depreciation may not be paid back. Get the declarations page from the homeowner.</>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Carrier should pay</dt>
          <dd className="font-semibold tabular-nums">{money(m.carrierTotal)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Homeowner owes</dt>
          <dd className="font-semibold tabular-nums">{money(m.homeownerDeductible + m.depreciationLost)}</dd>
          {m.depreciationLost > 0 && <dd className="text-[11px] text-slate-500">deductible + lost depreciation</dd>}
        </div>
      </dl>
      {received && received.expected > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Ledger: <b className="tabular-nums">{money(received.received)}</b> received of <span className="tabular-nums">{money(received.expected)}</span> expected.
        </p>
      )}
      {m.warnings.filter((w) => !/policy does not pay|Policy type is unknown/.test(w)).map((w) => (
        <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>
      ))}
      {waiver && <p className="mt-2 text-xs text-slate-500">{waiver} Collect the full deductible.</p>}
    </Card>
  );
}
