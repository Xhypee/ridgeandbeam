import { Card, cx } from "@/components/ui";
import { claimMoney, PAYER_GROUP_LABEL, PAYER_GROUPS, SETTLEMENT_SHORT, type ClaimMoneyInput, type SettlementPath } from "@/lib/claims";
import { money } from "@/lib/format";

/** Who should pay us what on this claim, from the settlement path, approved amount and excess. */
export function MoneySummary({ claim, contractTotal, received }: { claim: ClaimMoneyInput; contractTotal: number | null; received?: { expected: number; received: number } }) {
  const m = claimMoney(claim, contractTotal);
  return (
    <Card title="Who pays what" actions={<span className="text-xs text-slate-500">{SETTLEMENT_SHORT[claim.settlement_path as SettlementPath] ?? ""}</span>}>
      <dl className="text-sm text-slate-700">
        <div className="flex justify-between gap-3 py-1"><dt>Insurer&apos;s approved amount</dt><dd className="tabular-nums">{m.approved > 0 ? money(m.approved) : "—"}</dd></div>
        <div className="flex justify-between gap-3 py-1"><dt>Excess (homeowner&apos;s share)</dt><dd className="tabular-nums">{money(m.excess)}</dd></div>
        {contractTotal != null && <div className="flex justify-between gap-3 py-1"><dt>Our accepted price (inc GST)</dt><dd className="tabular-nums">{money(contractTotal)}</dd></div>}
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center" data-testid="who-pays">
        {PAYER_GROUPS.filter((g) => m.byGroup[g] > 0).map((g) => (
          <div key={g} className="rounded-lg bg-slate-50 p-2">
            <dt className="text-xs text-slate-500">{PAYER_GROUP_LABEL[g]}</dt>
            <dd className="font-semibold tabular-nums">{money(m.byGroup[g])}</dd>
          </div>
        ))}
        {m.total === 0 && <p className="col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Choose the settlement path and enter the insurer&apos;s approved amount to see who pays what.</p>}
      </dl>
      {received && received.expected > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Ledger: <b className="tabular-nums">{money(received.received)}</b> received of <span className="tabular-nums">{money(received.expected)}</span> expected.
        </p>
      )}
      {m.warnings.map((w) => (
        <p key={w} className={cx("mt-2 rounded-lg px-3 py-2 text-sm", "bg-amber-50 text-amber-900")}>{w}</p>
      ))}
    </Card>
  );
}
