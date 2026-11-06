// Door-knocking mode: the ACL unsolicited-agreement window for canvass-sourced jobs.
// Mount on estimates/invoices for jobs whose lead_source is "door_knock" (or any unsolicited sale).
// General information, not legal advice.
import { cx } from "@/components/ui";
import { ACL_THRESHOLD, canTakePayment, formatAuDate, isDoorKnockSource } from "@/lib/au-rules";
import { ACL_CALLING_HOURS, SRC } from "@/lib/au-rules-data";

export type DoorKnockSaleBannerProps = {
  state: string | null | undefined;
  /** jobs.lead_source — the banner shows for "door_knock" (also canvass / storm). */
  leadSource?: string | null;
  /** Force on for any other unsolicited sale (cold call, returned missed call). */
  doorKnockSale?: boolean;
  /** When the homeowner signed (estimates.accepted_at). */
  signedAt?: string | Date | null;
  contractValueIncGst?: number | null;
  /** Relying on the ACL disaster emergency-repair exemption. */
  disasterEmergencyRepair?: boolean;
  /** Override "today" (tests / previews). */
  today?: string | Date;
  className?: string;
};

export function DoorKnockSaleBanner({ state, leadSource, doorKnockSale, signedAt, contractValueIncGst, disasterEmergencyRepair, today, className }: DoorKnockSaleBannerProps) {
  const unsolicited = Boolean(doorKnockSale) || isDoorKnockSource(leadSource);
  if (!unsolicited) return null;
  if (contractValueIncGst != null && contractValueIncGst < ACL_THRESHOLD) return null;
  const check = canTakePayment(
    { state: state ?? null, lead_source: leadSource, door_knock_sale: unsolicited, signed_at: signedAt ?? null, contract_value_inc_gst: contractValueIncGst ?? null, disaster_emergency_repair: disasterEmergencyRepair },
    today ?? new Date(),
  );
  const blocked = !check.allowed;
  return (
    <aside
      data-door-knock-banner={blocked ? "blocked" : "clear"}
      data-acl-until={check.until ?? ""}
      role="status"
      className={cx("rounded-2xl px-5 py-4 ring-1", blocked ? "bg-red-50 ring-red-200" : "bg-teal-50 ring-teal-200", className)}
    >
      <p className={cx("text-[13px] font-semibold uppercase tracking-[0.06em]", blocked ? "text-red-700" : "text-teal-800")}>Door-knock sale · Australian Consumer Law</p>
      {disasterEmergencyRepair ? (
        <p className="mt-1 text-[15px] font-semibold text-ink">Emergency-repair exemption: payment allowed only if a state of emergency is declared, the work is only disaster repairs to remove a hazard or prevent damage, and you hold the licence.</p>
      ) : !signedAt ? (
        <p className="mt-1 text-[15px] font-semibold text-ink">Once the homeowner signs, you can&apos;t start work or take any payment for 10 business days.</p>
      ) : blocked ? (
        <p className="mt-1 text-[15px] font-semibold text-ink">No payment and no work until after <span data-acl-end>{formatAuDate(check.until!)}</span>. First payment day: {formatAuDate(check.firstPaymentDay!)}.</p>
      ) : (
        <p className="mt-1 text-[15px] font-semibold text-ink">The 10-business-day cancellation period ended on {formatAuDate(check.until!)}. You can take payment.</p>
      )}
      <p className="mt-1 text-sm text-slate-600">
        Counted from the day after signing, without weekends and national public holidays (add a day for any state-only public holiday). Visiting hours: {ACL_CALLING_HOURS}{" "}
        <a href={SRC.acccDoor.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">ACCC guide ↗</a>
      </p>
    </aside>
  );
}
