import { AU_STATE_NAME } from "@/lib/au";
import { abnText, licenceFor } from "@/lib/business";

/** Business name, ABN and the licence for the job's state, for quote headers (internal and public). */
export function QuoteBusiness({ name, abn, licences, state, gstRegistered, warnMissing = false, className }: {
  name: string;
  abn: string | null | undefined;
  licences: unknown;
  state: string | null | undefined;
  gstRegistered?: boolean;
  /** Office view: say when the ABN or the state's licence is missing. */
  warnMissing?: boolean;
  className?: string;
}) {
  const lic = licenceFor(licences, state);
  const abnLine = abnText(abn);
  return (
    <div className={className} data-testid="quote-business">
      <p className="text-xl font-semibold text-slate-900">{name}</p>
      <div className="mt-1 space-y-0.5 text-sm text-slate-600">
        {abnLine && <p data-testid="quote-abn">{abnLine}{gstRegistered === false ? " · not registered for GST" : ""}</p>}
        {lic && <p data-testid="quote-licence">{lic.state} licence {lic.number}{lic.classes ? ` (${lic.classes})` : ""}</p>}
        {warnMissing && !abnLine && <p className="text-amber-700">No ABN on file. Add it in Settings → Company.</p>}
        {warnMissing && !lic && state && AU_STATE_NAME[state as keyof typeof AU_STATE_NAME] && (
          <p className="text-amber-700">No {state} licence number on file. Add it in Settings → Company.</p>
        )}
      </div>
    </div>
  );
}
