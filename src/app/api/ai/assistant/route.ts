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

  // A contact or supplier open in a sidebar: who they are, their jobs, the jobs they referred, people, notes.
  let thisRecord = "";
  if (contactId) {
    const [{ data: c }, { data: own }, { data: sent }, { data: ppl }, { data: on }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", contactId).maybeSingle(),
      supabase.from("jobs").select("title, stage, site_address, created_at, estimates(status, estimate_totals(total))").eq("customer_id", contactId).order("created_at", { ascending: false }).limit(30),
      supabase.from("jobs").select("title, stage, created_at, customers(name), estimates(status, estimate_totals(total))").eq("referred_by", contactId).eq("referred_by_type", "contact").order("created_at", { ascending: false }).limit(30),
      supabase.from("contact_people").select("name, role, phone, email").eq("contact_id", contactId),
      supabase.from("job_contacts").select("role, jobs(title, stage, customers(name))").eq("contact_id", contactId).limit(30),
    ]);
    if (c) {
      type JR = { title: string; stage: string; site_address?: string | null; created_at: string; customers?: unknown; estimates?: { status: string; estimate_totals: unknown }[] };
      const val = (j: JR) => { const e = (j.estimates ?? []).find((x) => x.status === "accepted") ?? (j.estimates ?? []).find((x) => x.status === "sent"); return e ? `${e.status === "accepted" ? "signed" : "quoted"} ${aud(Number(one(e.estimate_totals as { total: number })?.total ?? 0))}` : "not quoted"; };
      thisRecord = [
        `THE CONTACT OPEN ON SCREEN: ${c.name} (${c.kind ?? "customer"})${c.company ? ` · ${c.company}` : ""}${c.trade ? ` · ${c.trade}` : ""}`,
        `Contact: ${[c.phone, c.email, [c.address, c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "none"}. Lead source: ${c.source ?? "?"}. Follow up: ${c.follow_up_on ? day(c.follow_up_on) : "none"}. Customer since ${day(c.created_at)}.`,
        c.abn || c.licence_no || c.licence_expiry || c.pl_expiry || c.workcover_expiry ? `Business: ${[c.abn ? `ABN ${c.abn}` : null, c.licence_no ? `licence ${c.licence_no} ${c.licence_class ?? ""}`.trim() : null, c.licence_expiry ? `licence expires ${day(c.licence_expiry)}` : null, c.pl_expiry ? `public liability expires ${day(c.pl_expiry)}` : null, c.workcover_expiry ? `WorkCover expires ${day(c.workcover_expiry)}` : null, c.payment_terms ? `terms ${c.payment_terms}` : null, c.rate ? `rate ${c.rate}` : null].filter(Boolean).join(" · ")}` : null,
        `Their own jobs (${own?.length ?? 0}):${(own ?? []).length ? "\n" + (own as JR[]).map((j) => `- ${j.title} · ${STAGE_LABEL[j.stage] ?? j.stage} · ${val(j)} · ${day(j.created_at)}`).join("\n") : " none"}`,
        `Jobs they referred to us (${sent?.length ?? 0}):${(sent ?? []).length ? "\n" + (sent as JR[]).map((j) => `- ${one(j.customers as { name: string })?.name ?? "?"} · ${j.title} · ${STAGE_LABEL[j.stage] ?? j.stage} · ${val(j)} · ${day(j.created_at)}`).join("\n") : " none"}`,
        (ppl ?? []).length ? `People there: ${(ppl ?? []).map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}${x.phone ? ` ${x.phone}` : ""}`).join("; ")}` : null,
        (on ?? []).length ? `Working on: ${(on as { role: string | null; jobs: unknown }[]).map((x) => { const j = one(x.jobs as { title: string; stage: string; customers: unknown }); return j ? `${one(j.customers as { name: string })?.name ?? ""} ${j.title} (${STAGE_LABEL[j.stage] ?? j.stage})${x.role ? ` as ${x.role}` : ""}` : null; }).filter(Boolean).join("; ")}` : null,
        c.notes ? `Notes: ${c.notes}` : null,
      ].filter(Boolean).join("\n");
    }
  } else if (supplierId) {
    const [{ data: sup }, { data: orders }, { data: sent }] = await Promise.all([
      supabase.from("org_suppliers").select("*, suppliers(name, category), supplier_branches(name, phone)").eq("id", supplierId).maybeSingle(),
      supabase.from("material_orders").select("status, created_at, delivery_date, paid_at, invoice_ex, invoice_gst, jobs(title, customers(name))").eq("org_supplier_id", supplierId).order("created_at", { ascending: false }).limit(20),
      supabase.from("jobs").select("title, stage, created_at, customers(name)").eq("referred_by", supplierId).eq("referred_by_type", "supplier").order("created_at", { ascending: false }).limit(30),
    ]);
    if (sup) {
      const sp = one(sup.suppliers as { name: string; category: string | null });
      const br = one(sup.supplier_branches as { name: string; phone: string | null });
      thisRecord = [
        `THE SUPPLIER OPEN ON SCREEN: ${sp?.name ?? "Supplier"}${br ? ` · ${br.name} branch` : ""}${sup.account_number ? ` · account ${sup.account_number}` : ""}${sup.rep_name ? ` · rep ${sup.rep_name} ${sup.rep_phone ?? ""}` : ""}`,
        `Recent orders (${orders?.length ?? 0}):${(orders ?? []).length ? "\n" + (orders as { status: string; created_at: string; delivery_date: string | null; paid_at: string | null; invoice_ex: number | null; invoice_gst: number | null; jobs: unknown }[]).map((o) => { const j = one(o.jobs as { title: string; customers: unknown }); return `- ${one(j?.customers as { name: string })?.name ?? ""} ${j?.title ?? ""} · ${o.status} · ordered ${day(o.created_at)}${o.delivery_date ? ` · delivery ${day(o.delivery_date)}` : ""}${o.invoice_ex ? ` · invoice ${aud(Number(o.invoice_ex) + Number(o.invoice_gst ?? 0))} ${o.paid_at ? "paid" : "to pay"}` : ""}`; }).join("\n") : " none"}`,
        `Jobs they referred to us (${sent?.length ?? 0}):${(sent ?? []).length ? "\n" + (sent as { title: string; stage: string; created_at: string; customers: unknown }[]).map((j) => `- ${one(j.customers as { name: string })?.name ?? "?"} · ${j.title} · ${STAGE_LABEL[j.stage] ?? j.stage} · ${day(j.created_at)}`).join("\n") : " none"}`,
        sup.notes ? `Notes: ${sup.notes}` : null,
      ].filter(Boolean).join("\n");
    }
  }

  const system = [
    `You are Claude, the assistant inside Ridge & Beam, the job software ${org.name} (an Australian roofing business) uses. You're talking with ${me?.full_name || user.fullName || "a team member"} (${me?.role ?? "team"}).`,
    "HOW TO REPLY (always): super short, simple and guided, in plain Australian English, like a sharp office manager.",
    "- Start with the one thing to do next, as a short instruction (about 10 words). If they asked a question, answer it in that first line instead.",
    "- Then, only if it really helps, up to 3 short dash points (under 12 words each): what to check or say.",
    "- End by saying where to tap in the app when there's an action (e.g. 'Tap Call Ahmed above.').",
    "- 60 words at most. No greeting, no using their name, no sign-off, no repeating what's already on screen (address, job type, phone number) unless they ask.",
    "- No headings, no tables, no bold, no markdown other than simple dashes for points.",
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
    thisRecord,
  ].join("\n");

  try {
    const text = await chatReply({ system, messages, maxTokens: 600 });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof AiError ? e.message : "Claude couldn't answer right now." }, { status: e instanceof AiError ? 200 : 500 });
  }
}
