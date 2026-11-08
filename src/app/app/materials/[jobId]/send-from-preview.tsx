"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { sendSupplierOrder } from "./actions";

/** Send (or send again) from the supplier preview. */
export function SendFromPreview({ jobId, orderId, supplier, status, hasEmail }: { jobId: string; orderId: string; supplier: string; status: string; hasEmail: boolean }) {
  if (!hasEmail) return <span className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">Add {supplier}&apos;s email to send</span>;
  return (
    <ActionForm action={sendSupplierOrder}>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="order_id" value={orderId} />
      <SubmitButton className="min-h-11 px-4 text-sm">{status === "draft" ? `Send to ${supplier}` : "Send again"}</SubmitButton>
    </ActionForm>
  );
}
