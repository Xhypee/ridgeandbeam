// "Referred": the jobs a contact or supplier sent us, what's won and signed, and a button to log another.
// On every contact's and supplier's sidebar.
import Link from "next/link";
import { label, STAGE_LABEL } from "@/lib/format";
import { referralsWon, type Referrals, type ReferrerType } from "@/lib/referrals-server";
import { Icon, Section } from "../jobs/job-sections";

const GIFT = "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1";
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function ReferralsSection({ who, r, canSeeMoney }: { who: { id: string; type: ReferrerType; name: string }; r: Referrals; canSeeMoney: boolean }) {
  const first = who.type === "supplier" ? who.name : who.name.split(" ")[0] || who.name;
  const won = referralsWon(r.referred);
  return (
    <Section title="Referred" count={r.referred.length}>
      {r.referred.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs from {first} yet. Log one when they send someone your way.</p>
      ) : (
        <>
          <p className="mb-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700" data-referral-summary>
            <b>{r.referred.length}</b> {r.referred.length === 1 ? "job" : "jobs"} referred · <b>{won}</b> won{canSeeMoney && r.referredSigned > 0 ? <> · <b>{aud(r.referredSigned)}</b> signed</> : null}
          </p>
          <ul className="-mx-2 divide-y divide-slate-100" data-referred-jobs>
            {r.referred.map((j) => (
              <li key={j.id}>
                <Link href={`/app/jobs?job=${j.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{j.customer}</span>
                    <span className="block truncate text-xs text-slate-500">{j.title} · {STAGE_LABEL[j.stage] ?? label(j.stage)}</span>
                  </span>
                  {canSeeMoney && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{j.value === null ? <span className="font-normal text-slate-400">Not quoted</span> : aud(j.value)}</span>}
                  <Icon d="M9 6l6 6-6 6" className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={`/app/jobs?new=1&referred_by=${who.id}&referred_type=${who.type}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700" data-log-referral>
        <Icon d={GIFT} className="h-4 w-4" />Log a referral from {first}
      </Link>
    </Section>
  );
}
