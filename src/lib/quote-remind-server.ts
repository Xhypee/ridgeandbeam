import "server-only";
import type { requireMoneyAccess } from "./dal";
import { siteUrl } from "./format";
import { validDays } from "./quote-email";
import { quoteReminder, validUntil } from "./quote-remind";

type Ctx = Awaited<ReturnType<typeof requireMoneyAccess>>;
const me = (ctx: Ctx) => ctx.memberships.find((m) => m.org_id === ctx.org.id);

/** The reminder exactly as it will go (for the preview and the real send). */
export async function loadReminder(ctx: Ctx, estimateId: string) {
  const { supabase, org, user } = ctx;
  const { data: e } = await supabase.from("estimates").select("id, number, status, sent_at, terms, public_token, roof_profile, job_id, estimate_totals(total), jobs(job_type, customer_id, customers(name, email, phone))").eq("id", estimateId).maybeSingle();
  if (!e || e.status !== "sent") return null;
  const job = e.jobs as unknown as { job_type: string | null; customer_id: string | null; customers: { name: string; email: string | null; phone: string | null } };
  const t = (Array.isArray(e.estimate_totals) ? e.estimate_totals[0] : e.estimate_totals) as { total: number } | null;
  const m = me(ctx);
  const msg = quoteReminder({
    org: { name: org.name, phone: org.phone }, sender: { name: m?.full_name || user.fullName || org.name, phone: m?.phone ?? null }, customer: { name: job.customers.name },
    quote: { number: e.number, total: Number(t?.total ?? 0), validUntil: validUntil(e.sent_at, validDays(e.terms)), url: `${siteUrl()}/q/${e.public_token}`, title: [job.job_type === "repair" ? "Repair" : "Re-roof", e.roof_profile].filter(Boolean).join(", ") },
  });
  return { msg, jobId: e.job_id as string, customerId: job.customer_id, to: job.customers };
}

