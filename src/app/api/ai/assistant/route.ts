import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { AiError, chatReply } from "@/lib/ai";
import { loadDocket } from "@/lib/job-docket-server";
import { STAGE_LABEL } from "@/lib/format";

const Body = z.object({
  jobId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const day = (iso: string | null | undefined) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "");
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/**
 * POST { jobId?, messages } -> { text }: Claude, with the whole business as context (every open job, recent
 * quotes and prices, the schedule, the team) and the open job in full. Read-only: it suggests, the user acts.
 */
export async function POST(req: Request) {
  const { supabase, org, user, memberships, isCrewLead } = await requireOrg();
  if (isCrewLead) return Response.json({ error: "Ask the office to turn this on for you." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say something first." }, { status: 400 });
  const { jobId, contactId, supplierId, messages } = parsed.data;
  if (messages.at(-1)?.role !== "user") return Response.json({ error: "Say something first." }, { status: 400 });

  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  const [{ data: jobs }, { data: people }, { data: crews }, docket] = await Promise.all([
    supabase.from("jobs")
      .select("id, title, stage, site_address, lead_source, lead_received_at, first_contacted_at, scheduled_start, scheduled_end, is_insurance, roof_material, job_type, stage_changed_at, customers(name, phone), crews(name), estimates(number, status, sent_at, accepted_at, estimate_totals(total))")
      .or(`stage.not.in.(paid,lost),stage_changed_at.gte.${since}`)
      .order("stage_changed_at", { ascending: false }).limit(200),
    supabase.from("memberships").select("full_name, email, role").eq("org_id", org.id),
    supabase.from("crews").select("name").eq("org_id", org.id),
    jobId ? loadDocket(supabase, org, jobId, { canSeeMoney: true }) : Promise.resolve(null),
  ]);

  type J = { id: string; title: string; stage: string; site_address: string | null; lead_source: string | null; lead_received_at: string | null; first_contacted_at: string | null; scheduled_start: string | null; scheduled_end: string | null; is_insurance: boolean; roof_material: string | null; job_type: string | null; customers: unknown; crews: unknown; estimates: { number: number; status: string; sent_at: string | null; accepted_at: string | null; estimate_totals: unknown }[] };
  const jobLines = ((jobs ?? []) as J[]).map((j) => {
    const c = one(j.customers as { name: string; phone: string | null });
    const crew = one(j.crews as { name: string });
    const est = [...(j.estimates ?? [])].sort((a, b) => b.number - a.number)[0];
    const total = est ? Number(one(est.estimate_totals as { total: number })?.total ?? 0) : null;
    return [
      `- ${c?.name ?? j.title} · ${j.title} · ${j.site_address ?? "no address"}`,
      `stage: ${STAGE_LABEL[j.stage] ?? j.stage}`,
      j.job_type ? `type: ${j.job_type}` : null, j.roof_material ? `roof: ${j.roof_material}` : null, j.is_insurance ? "insurance" : null,
      est ? `quote #${est.number} ${est.status} ${total !== null ? aud(total) : ""}` : "no quote",
      j.stage === "lead" ? (j.first_contacted_at ? "contacted" : `NOT CALLED YET (lead in ${day(j.lead_received_at)})`) : null,
      j.scheduled_start ? `booked ${day(j.scheduled_start)}${j.scheduled_end ? `–${day(j.scheduled_end)}` : ""}` : null,
      crew ? `crew: ${crew.name}` : null, j.lead_source ? `source: ${j.lead_source}` : null,
    ].filter(Boolean).join(" · ");
  });

  const me = memberships.find((m) => m.org_id === org.id);
  const licences = Object.entries(org.licences ?? {}).map(([s, l]) => `${s} ${l?.number ?? ""} ${(l?.classes ?? []).join(", ")}`.trim()).join("; ");
  let thisJob = "";
  if (docket) {
    const d = docket;
    thisJob = [
      `THE JOB OPEN ON SCREEN: ${d.customer.name} · ${d.job.title} · ${d.job.site_address ?? d.customer.address ?? ""}`,
      `Stage: ${STAGE_LABEL[d.job.stage] ?? d.job.stage}. Next step: ${d.next.title}${d.next.detail ? ` (${d.next.detail})` : ""}.`,
      `Contact: ${[d.customer.phone, d.customer.email].filter(Boolean).join(" · ") || "none"}.`,
      d.lead?.message ? `What they sent us (${d.lead.source ?? "lead"}):\n${d.lead.message}` : null,
      d.notes.length ? `Notes:\n${d.notes.map((n) => `- ${n.by ?? "Team"} (${day(n.at)}): ${n.body}`).join("\n")}` : null,
      d.lead?.docs.length ? `Documents: ${d.lead.docs.map((f) => f.name).join(", ")}` : null,
      d.quote ? `Quote #${d.quote.number} (${d.quote.status}) ${aud(d.quote.total)} inc GST:\n${d.quote.lines.map((l) => `- ${l.description}: ${l.quantity} ${l.unit} = ${aud(l.amount)}${l.extra_status === "offered" ? " (optional extra)" : ""}`).join("\n")}` : "No quote yet.",
      d.roof ? `Roof: ${Math.round(d.roof.summary.trueArea)} m² measured.` : null,
      d.invoices.length ? `Invoices: ${d.invoices.map((i) => `#${i.number} ${i.label ?? i.kind} ${aud(i.total)} (${i.balance > 0 ? `${aud(i.balance)} owing` : "paid"})`).join("; ")}` : null,
      d.team.length ? `Team on the job: ${d.team.map((t) => `${t.name} (${t.role})`).join(", ")}` : null,
      d.messages.length ? `Recent messages:\n${d.messages.map((m) => `- ${m.direction} ${m.channel} ${day(m.at)}: ${m.body.slice(0, 200)}`).join("\n")}` : null,
    ].filter(Boolean).join("\n");
  }

  const system = [
    `You are Claude, the assistant inside Ridge & Beam, the job software ${org.name} (an Australian roofing business) uses. You're talking with ${me?.full_name || user.fullName || "a team member"} (${me?.role ?? "team"}).`,
    "Be brief and practical, in plain Australian English, like a sharp office manager who knows every job. Short paragraphs or a few bullets; no headings, no tables, no markdown symbols other than simple dashes for lists.",
    "Use only the business data below. If something isn't there, say you can't see it rather than guessing. Never invent prices, dates, measurements, licence details or what a customer said.",
    "When asked what to charge, base it on similar jobs and quotes below and show the range you used. Flag anything that matters legally for the job's state (licences, written contracts, cooling-off, deposits, home warranty) but don't give legal advice.",
    "You can't take actions yet (send, book, text, edit). Suggest exactly what to do and where in the app (e.g. 'Send quote' in this sidebar, the Schedule page).",
    "If the user is speaking (a call), keep replies to 2–4 short sentences.",
    "",
    `Today is ${day(new Date().toISOString())}.`,
    `BUSINESS: ${org.name} · state ${org.state ?? "?"} · ABN ${org.abn ?? "not set"} · licences: ${licences || "none on file"} · phone ${org.phone ?? "?"} · GST ${org.gst_registered ? "registered" : "not registered"}.`,
    `Payment schedule: ${(org.payment_schedule ?? []).map((s) => `${s.label} ${s.pct}% (${s.trigger})`).join(", ") || "not set"}. Quote terms: ${org.estimate_terms}`,
    `Team: ${(people ?? []).map((p) => `${p.full_name || p.email} (${p.role})`).join(", ")}. Crews: ${(crews ?? []).map((c) => c.name).join(", ") || "none"}.`,
    "",
    `JOBS (open, plus anything that moved in the last 6 months; ${jobLines.length}):`,
    ...jobLines,
    "",
    thisJob,
    contactId ? await contactContext(supabase, contactId) : "",
    supplierId ? await supplierContext(supabase, supplierId) : "",
  ].join("\n");

  try {
    const text = await chatReply({ system, messages });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof AiError ? e.message : "Claude couldn't answer right now." }, { status: e instanceof AiError ? 200 : 500 });
  }
}

type Db = Awaited<ReturnType<typeof requireOrg>>["supabase"];

/** The contact open on Contacts (customer, builder, contractor or other): who they are and their jobs. */
async function contactContext(supabase: Db, id: string): Promise<string> {
  const [{ data: c }, { data: people }, { data: jobs }, { data: onJobs }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("contact_people").select("name, role, phone, email").eq("contact_id", id),
    supabase.from("jobs").select("title, stage, site_address").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("job_contacts").select("role, jobs(title, stage, site_address)").eq("contact_id", id).limit(20),
  ]);
  if (!c) return "";
  const x = c as Record<string, unknown>;
  const f = (k: string, label: string) => (x[k] ? `${label}: ${x[k]}` : null);
  return [
    `THE CONTACT OPEN ON SCREEN (${x.kind}): ${x.name}`,
    [f("company", "Business"), f("trade", "Trade"), f("phone", "Phone"), f("email", "Email"), [x.address, x.city, x.state, x.zip].filter(Boolean).join(" ") || null].filter(Boolean).join(" · "),
    [f("abn", "ABN"), f("payment_terms", "Terms"), x.retention_pct ? `Retention ${x.retention_pct}%` : null, f("rate", "Rate")].filter(Boolean).join(" · ") || null,
    x.kind === "contractor" ? `Licence ${x.licence_no ?? "?"} ${x.licence_class ?? ""} expires ${day(x.licence_expiry as string) || "?"}; public liability ${x.pl_cover ?? ""} expires ${day(x.pl_expiry as string) || "?"}; WorkCover expires ${day(x.workcover_expiry as string) || "?"}.` : null,
    people?.length ? `People: ${people.map((p) => [p.name, p.role, p.phone, p.email].filter(Boolean).join(", ")).join("; ")}` : null,
    jobs?.length ? `Their jobs: ${jobs.map((j) => `${j.title} (${STAGE_LABEL[j.stage] ?? j.stage})`).join("; ")}` : null,
    onJobs?.length ? `On jobs: ${onJobs.map((l) => { const j = one(l.jobs as unknown as { title: string; stage: string }); return j ? `${j.title} (${STAGE_LABEL[j.stage] ?? j.stage}${l.role ? `, ${l.role}` : ""})` : ""; }).filter(Boolean).join("; ")}` : null,
    x.notes ? `Notes: ${x.notes}` : null,
  ].filter(Boolean).join("\n");
}

/** The supplier open on Contacts: account details and recent orders / invoices. */
async function supplierContext(supabase: Db, id: string): Promise<string> {
  const [{ data: s }, { data: orders }] = await Promise.all([
    supabase.from("org_suppliers").select("custom_name, branch_name, branch_phone, branch_email, account_number, rep_name, rep_phone, notes, suppliers(name)").eq("id", id).maybeSingle(),
    supabase.from("material_orders").select("status, created_at, invoice_no, invoice_ex, invoice_gst, invoice_due, paid_at, jobs(title, customers(name))").eq("org_supplier_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  if (!s) return "";
  const name = one(s.suppliers as unknown as { name: string })?.name ?? s.custom_name ?? "Supplier";
  return [
    `THE SUPPLIER OPEN ON SCREEN: ${name}${s.branch_name ? ` (${s.branch_name})` : ""}`,
    [s.account_number ? `Account ${s.account_number}` : null, s.rep_name ? `Rep ${s.rep_name} ${s.rep_phone ?? ""}` : null, s.branch_phone, s.branch_email].filter(Boolean).join(" · ") || null,
    orders?.length ? `Recent orders:\n${orders.map((o) => { const j = one(o.jobs as unknown as { title: string; customers: unknown }); const who = one(j?.customers as { name: string })?.name ?? j?.title ?? "job"; const tot = o.invoice_no ? aud(Number(o.invoice_ex ?? 0) + Number(o.invoice_gst ?? 0)) : null; return `- ${who}: ${o.status}${tot ? `, invoice ${o.invoice_no} ${tot} ${o.paid_at ? `paid ${day(o.paid_at)}` : `unpaid${o.invoice_due ? `, due ${day(o.invoice_due)}` : ""}`}` : ""}`; }).join("\n")}` : "No orders yet.",
    s.notes ? `Notes: ${s.notes}` : null,
  ].filter(Boolean).join("\n");
}
