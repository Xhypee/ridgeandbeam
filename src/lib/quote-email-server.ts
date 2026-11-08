import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEstimate } from "@/app/q/[token]/model";
import { buildProposal } from "@/app/q/[token]/model";
import { asAuState } from "./au";
import { auJobTypeFrom, isDoorKnockSource, roofSystemFrom, rulesFor } from "./au-rules";
import { validateSchedule } from "./claims-billing";
import { siteUrl } from "./format";
import { depositLimit } from "./pay-plan";
import { effectiveMethods } from "./pay-plan-server";
import { buildQuoteEmail, type QuoteEmail } from "./quote-email";
import type { Organization } from "./types";

export type QuoteEmailContext = {
  email: QuoteEmail;
  estimate: { id: string; jobId: string; customerId: string | null; status: string; number: number; itemCount: number };
  to: { name: string; email: string | null; phone: string | null };
};

/** The quote email for an estimate, as it would go out now (drafts too). Null when the user can't see it. */
export async function loadQuoteEmail(
  supabase: SupabaseClient, org: Organization, estimateId: string,
  opts: { senderName: string; senderPhone?: string | null; message?: string | null; asSent?: boolean },
): Promise<QuoteEmailContext | null> {
  const [{ data: raw }, { data: est }] = await Promise.all([
    supabase.rpc("get_estimate_doc", { p_id: estimateId }),
    supabase.from("estimates").select("id, number, status, public_token, job_id, jobs(customer_id, pay_methods)").eq("id", estimateId).maybeSingle(),
  ]);
  if (!raw || !est) return null;
  const doc = raw as PublicEstimate;
  // Preview a draft as it will look once sent (issued today).
  const sentDoc: PublicEstimate = opts.asSent && !doc.sent_at ? { ...doc, sent_at: new Date().toISOString() } : doc;
  const job = (Array.isArray(est.jobs) ? est.jobs[0] : est.jobs) as { customer_id: string | null; pay_methods: string[] | null } | null;

  // Deposit limit for this price in this state (rules engine).
  const p = buildProposal(sentDoc);
  const chosen = p.options.find((o) => o.id === p.effective);
  const total = chosen ? chosen.total : p.totals.total;
  const state = asAuState(doc.state);
  let depositCap: number | null = null;
  if (state) {
    const c = doc.compliance ?? {};
    const rules = rulesFor(state, {
      contractValueIncGst: total, contractDate: new Date(),
      roofSystem: roofSystemFrom(c.roof_system ?? doc.job.roof_material), jobType: auJobTypeFrom(c.au_job_type ?? doc.job.job_type),
      existingHouse: c.existing_house ?? true, ownerOccupier: c.owner_occupier ?? undefined, subcontract: c.subcontract ?? undefined,
      doorKnockSale: c.door_knock_sale ?? isDoorKnockSource(doc.job.lead_source),
    });
    depositCap = depositLimit(rules.deposit);
  }
  const sched = validateSchedule(org.payment_schedule);
  const methods = effectiveMethods(job?.pay_methods ?? ["bank"], Boolean(org.stripe_charges_enabled));
  const email = buildQuoteEmail({
    doc: sentDoc,
    url: `${siteUrl()}/q/${est.public_token}`,
    logoUrl: `${siteUrl()}/email/mark.png`,
    sender: { name: opts.senderName, phone: opts.senderPhone ?? null },
    payMethods: methods.length ? methods : ["bank"],
    schedule: sched.ok ? sched.steps : [],
    depositCap,
    message: opts.message,
  });
  return {
    email,
    estimate: { id: est.id, jobId: est.job_id, customerId: job?.customer_id ?? null, status: est.status, number: est.number, itemCount: doc.items.filter((i) => i.extra_status !== "offered").length },
    to: { name: doc.customer.name, email: doc.customer.email, phone: doc.customer.phone },
  };
}
