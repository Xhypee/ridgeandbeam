import { Field, Input, Select, Textarea } from "@/components/ui";
import { AU_JOB_TYPES, AU_JOB_TYPE_LABEL } from "@/lib/job-types";
import type { Job } from "@/lib/types";
import { AddressLookup } from "@/components/address-lookup";

export function JobFields({ j, defaultAddress }: { j?: Partial<Job>; defaultAddress?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" className="sm:col-span-2"><Input name="title" defaultValue={j?.title ?? ""} placeholder="Tile-to-metal re-roof, Trimdek" required /></Field>
      <Field label="Job type">
        <Select name="job_type" defaultValue={j?.job_type ?? "replacement"}>
          {AU_JOB_TYPES.map((t) => <option key={t} value={t}>{AU_JOB_TYPE_LABEL[t]}</option>)}
        </Select>
      </Field>
      <Field label="Roof material"><Input name="roof_material" defaultValue={j?.roof_material ?? ""} placeholder="COLORBOND Trimdek, concrete tile, terracotta…" /></Field>
      <div className="sm:col-span-2"><AddressLookup label="Job site address" line="site_address" initialLine={j?.site_address ?? defaultAddress ?? null} /></div>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="is_insurance" defaultChecked={j?.is_insurance ?? false} className="h-4 w-4 accent-brand-500" />
        Insurance claim job
      </label>
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={j?.notes ?? ""} /></Field>
    </div>
  );
}
