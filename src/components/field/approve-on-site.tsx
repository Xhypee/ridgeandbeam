"use client";

import { useState } from "react";
import { approveOnSite } from "@/app/app/jobs/[id]/change-orders/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignaturePad } from "@/components/signature-pad";
import { cx, Input } from "@/components/ui";

/** Homeowner signs on the rep's phone, or the rep records a verbal / on-site approval. */
export function ApproveOnSite({ id }: { id: string }) {
  const [method, setMethod] = useState<"in_person_signature" | "verbal">("in_person_signature");
  return (
    <ActionForm action={approveOnSite} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="method" value={method === "verbal" ? "verbal" : "in_person"} />
      <div className="flex gap-2">
        {(["in_person_signature", "verbal"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)}
            className={cx("min-h-12 flex-1 rounded-xl text-sm font-bold", method === m ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-300")}>
            {m === "verbal" ? "Approved verbally / on site" : "Sign on this phone"}
          </button>
        ))}
      </div>
      <Input name="name" placeholder="Homeowner's full name" autoComplete="off" required className="min-h-12 text-base" />
      {method === "in_person_signature" ? (
        <SignaturePad name="signature" required height={180} />
      ) : (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 accent-brand-500" required />
          The homeowner approved this change and its price verbally / in person. (Check your contract allows verbal approval; get a signature when you can.)
        </label>
      )}
      <SubmitButton className="min-h-14 w-full text-base">Record approval</SubmitButton>
    </ActionForm>
  );
}
