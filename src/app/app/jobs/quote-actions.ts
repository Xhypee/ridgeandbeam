"use server";
// Send the quote email from the job sidebar: marks the quote sent (moves the job to Quoting) and emails it.
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { sendEmail } from "@/lib/notify";
import { isRealEmail } from "@/lib/pay-plan-notify";
import { loadQuoteEmail } from "@/lib/quote-email-server";
import { setEstimateStatus } from "../estimates/actions";

export async function sendQuoteEmail(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, memberships } = await requireMoneyAccess();
  const id = String(fd.get("estimate_id") ?? "");
  const me = memberships.find((m) => m.org_id === org.id);
  const sender = { senderName: me?.full_name || user.fullName || org.name, senderPhone: me?.phone ?? org.phone };
  const before = await loadQuoteEmail(supabase, org, id, { ...sender, asSent: true });
  if (!before) return { error: "Quote not found." };
  const first = before.to.name.split(" ")[0] || "the customer";
  if (before.estimate.itemCount === 0) return { error: "Add at least one line to the quote before sending it." };
  if (before.estimate.status === "accepted") return { error: "This quote is already signed." };
  if (before.estimate.status !== "sent") {
    const s = new FormData();
    s.set("id", id);
    s.set("status", "sent");
    try { await setEstimateStatus(s); } catch (e) { return { error: (e as Error).message }; }
  }
  if (!isRealEmail(before.to.email)) {
    revalidatePath("/app", "layout");
    return { ok: `Marked sent. ${first} has no email address on file, so copy the link and text it.` };
  }
  const q = await loadQuoteEmail(supabase, org, id, { ...sender, message: String(fd.get("message") ?? "") || null });
  if (!q) return { error: "Quote not found." };
  const r = await sendEmail(supabase, {
    orgId: org.id, jobId: q.estimate.jobId, customerId: q.estimate.customerId, to: q.to.email,
    subject: q.email.subject, html: q.email.html, text: q.email.text, replyTo: org.email, fromName: org.name,
  });
  revalidatePath("/app/jobs", "layout");
  if (r.status === "sent") return { ok: `Quote sent to ${q.to.email}.` };
  if (r.status === "paused") return { ok: "Quote marked sent. Test mode is on, so it wasn't emailed." };
  if (r.status === "not_configured") return { ok: "Quote marked sent. Email isn't set up here, so it wasn't emailed." };
  return { error: `Couldn't email it: ${r.error ?? "unknown error"}. The quote is marked sent; copy the link from the quote page.` };
}
