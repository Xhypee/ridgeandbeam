"use client";

import { useState } from "react";
import { Field, Input, cx } from "@/components/ui";

/** Retail vs insurance choice for the new-customer flow; insurance opens the job's claim with the basics. */
export function JobKind() {
  const [kind, setKind] = useState<"retail" | "insurance">("retail");
  const opt = (v: "retail" | "insurance", title: string, hint: string) => (
    <label className={cx("flex min-h-11 flex-1 cursor-pointer items-start gap-2 rounded-lg bg-white p-3 ring-1", kind === v ? "ring-2 ring-brand-500" : "ring-slate-200")}>
      <input type="radio" name="job_kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="mt-0.5 h-4 w-4 accent-brand-500" />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
  // Typing claim details means it's an insurance job.
  const auto = () => setKind("insurance");
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        {opt("retail", "Retail", "Homeowner pays us directly.")}
        {opt("insurance", "Insurance claim", "Storm or damage claim; the carrier pays most of it.")}
      </div>
      <fieldset className={cx("grid gap-3 rounded-lg p-3 sm:grid-cols-2", kind === "insurance" ? "bg-violet-50" : "bg-transparent")}>
        <legend className="px-1 text-xs font-medium text-slate-600">Insurance claim details {kind === "retail" && <span className="font-normal text-slate-400">(only for insurance jobs)</span>}</legend>
        <Field label="Insurance company"><Input name="insurance_company" onInput={auto} placeholder="State Farm" /></Field>
        <Field label="Claim #"><Input name="claim_number" onInput={auto} /></Field>
        <Field label="Adjuster"><Input name="adjuster_name" onInput={auto} /></Field>
        <Field label="Adjuster phone"><Input name="adjuster_phone" type="tel" onInput={auto} /></Field>
      </fieldset>
    </div>
  );
}
