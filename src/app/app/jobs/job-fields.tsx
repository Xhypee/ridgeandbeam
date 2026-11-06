import { Field, Input, Select, Textarea } from "@/components/ui";
import { label } from "@/lib/format";
import { JOB_TYPES, type Job } from "@/lib/types";

export function JobFields({ j, defaultAddress }: { j?: Partial<Job>; defaultAddress?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" className="sm:col-span-2"><Input name="title" defaultValue={j?.title ?? ""} placeholder="Full tear-off & replacement" required /></Field>
      <Field label="Job type">
        <Select name="job_type" defaultValue={j?.job_type ?? "replacement"}>
          {JOB_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Field>
      <Field label="Roof material"><Input name="roof_material" defaultValue={j?.roof_material ?? ""} placeholder="Architectural shingle, metal, TPO…" /></Field>
      <Field label="Job site address" className="sm:col-span-2"><Input name="site_address" defaultValue={j?.site_address ?? defaultAddress ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="is_insurance" defaultChecked={j?.is_insurance ?? false} className="h-4 w-4 accent-brand-500" />
        Insurance claim job
      </label>
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={j?.notes ?? ""} /></Field>
    </div>
  );
}
