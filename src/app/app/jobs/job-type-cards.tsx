// New lead: what the job is, as small one-tap cards (a radio group; no typing).
import { JOB_CARDS } from "@/lib/job-types";

export function JobTypeCards() {
  return (
    <fieldset data-job-cards>
      <legend className="mb-2 text-sm font-medium text-slate-700">What do they need?</legend>
      <div className="grid grid-cols-2 gap-2">
        {JOB_CARDS.map((c) => (
          <label key={c.type} data-job-card-type={c.type}
            className="flex cursor-pointer flex-col rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 hover:ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink">
            <input type="radio" name="job_type" value={c.type} className="sr-only" />
            <span className="text-sm font-semibold text-ink">{c.title}</span>
            <span className="text-xs text-slate-500">{c.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
