"use server";
// Quoting stage: remind the customer about a sent quote (email + text, previewed first); record a quote signed on
// paper; or mark that they didn't go ahead.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { sendEmail, sendSms } from "@/lib/notify";
import { isRealEmail } from "@/lib/pay-plan-notify";
import { setEstimateStatus } from "../estimates/actions";
import { loadReminder } from "@/lib/quote-remind-server";

type Ctx = Awaited<ReturnType<typeof requireMoneyAccess>>;
const touch = (jobId: string) => { revalidatePath("/app/jobs"); revalidatePath(`/app/jobs/${jobId}`, "layout"); };
const back = (fd: FormData) => { const b = String(fd.get("back") ?? ""); if (/^\/app\/jobs(\?[\w=&%-]*)?$/.test(b)) redirect(b); };
const me = (ctx: Ctx) => ctx.memberships.find((m) => m.org_id === ctx.org.id);

export async function sendQuoteReminder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const r = await loadReminder(ctx, String(fd.get("estimate_id") ?? ""));
  if (!r) return { error: "That quote isn't out with the customer." };
  const first = r.to.name.split(" ")[0] || r.to.name;
  if (!r.to.email && !r.to.phone) return { error: `Add ${first}'s email or mobile first.` };
  const base = { orgId: ctx.org.id, jobId: r.jobId, customerId: r.customerId };
  const out: string[] = [];
  if (r.to.email) {
    // Made-up (demo / test) addresses are logged, never emailed.
    const s = isRealEmail(r.to.email) ? await sendEmail(ctx.supabase, { ...base, to: r.to.email, subject: r.msg.subject, html: r.msg.html, text: r.msg.text, replyTo: ctx.org.email, fromName: ctx.org.name }) : { status: "not_configured" as const, error: null };
    if (s.status === "failed") return { error: s.error ?? "The email didn't send." };
    out.push("email");
  }
  if (r.to.phone) { await sendSms(ctx.supabase, { ...base, to: r.to.phone, body: r.msg.sms }); out.push("text"); }
  await ctx.supabase.from("estimates").update({ reminded_at: new Date().toISOString() }).eq("id", String(fd.get("estimate_id")));
  await ctx.supabase.from("job_notes").insert({ org_id: ctx.org.id, job_id: r.jobId, body: `Reminded ${first} about the quote (${out.join(" and ")}).`, author_id: ctx.user.id, author_name: me(ctx)?.full_name || ctx.user.fullName || ctx.user.email });
  touch(r.jobId);
  back(fd);
  return { ok: `Reminder sent to ${first}.` };
}

/** "Signed on paper" / "Didn't go ahead": the quote is accepted or declined by the office (moves the job to Sold / Lost). */
export async function settleQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!["accepted", "declined"].includes(status)) return { error: "Pick signed or didn't go ahead." };
  const { data: e } = await supabase.from("estimates").select("job_id").eq("id", id).maybeSingle();
  if (!e) return { error: "Quote not found." };
  try { await setEstimateStatus(fd); } catch (err) { return { error: (err as Error).message }; }
  touch(e.job_id);
  return { ok: status === "accepted" ? "Marked signed. It's in Sold now." : "Marked as not going ahead." };
}
