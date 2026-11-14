// New lead: what the job is, as small one-tap cards (a radio group; no typing). "Other" opens a one-line box.
import { JOB_CARDS } from "@/lib/job-types";

export function JobTypeCards() {
  return (
    <fieldset data-job-cards className="group">
      <legend className="mb-2 text-sm font-medium text-slate-700">What do they need?</legend>
      <div className="grid grid-cols-2 gap-2">
        {JOB_CARDS.map((c) => (
          <label key={c.type} data-job-card-type={c.type}
            className={`${c.type === "other" ? "col-span-2 " : ""}flex cursor-pointer flex-col rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 hover:ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink`}>
            <input type="radio" name="job_type" value={c.type} className="sr-only" />
            <span className="text-sm font-semibold text-ink">{c.title}</span>
            <span className="text-xs text-slate-500">{c.hint}</span>
          </label>
        ))}
      </div>
      <input name="job_title" aria-label="What's the job?" placeholder="What's the job?" maxLength={120} data-job-other
        className="mt-2 hidden h-11 w-full rounded-xl bg-white px-3 text-[15px] text-ink ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 group-has-[input[value=other]:checked]:block" />
    </fieldset>
  );
}
