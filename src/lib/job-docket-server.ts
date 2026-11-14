import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBuild, type BuildData } from "./build-stage-server";
import { asAuState, AU_STATE_TZ } from "./au";
import { calendarDate } from "./au-business-days";
import { signPaths } from "./field-server";
import { validDays } from "./quote-email";
import { daysLeft, validUntil } from "./quote-remind";
import { checklistProgress } from "./job-compliance";
import { loadJobCompliance } from "./job-compliance-server";
import { defaultJobRole, type JobRole } from "./job-team";
import { nextStep, type NextStep } from "./next-step";
import { asNextStepJob, loadNextStepCtx, NEXT_STEP_JOB_COLS } from "./next-step-server";
import { normalizeMeasurements, summarize, type Measurements, type RoofSummary } from "./roof";
import type { Organization } from "./types";

type Person = { user_id: string; full_name: string | null; email: string | null; role: string; phone: string | null };

export type Docket = {
  job: {
    id: string; title: string; stage: string; job_type: string; site_address: string | null; state: string | null; is_insurance: boolean;
    lead_source: string | null; lead_received_at: string | null; first_contacted_at: string | null; created_at: string;
    assigned_to: string | null; inspection_at: string | null; lost_reason: string | null; tz: string;
    referredBy: { id: string; name: string } | null;
    scheduled_start: string | null; scheduled_end: string | null; completed_at: string | null; materials_status: string; dumpster_status: string;
    gate_code: string | null; site_hazards: string | null; delivery_type: string | null; public_token: string; pay_methods: string[]; roof_material: string | null;
    crew: { name: string; phone: string | null } | null;
  };
  customer: { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null };
  next: NextStep;
  team: { user_id: string; role: JobRole; name: string; email: string | null; phone: string | null; memberRole: string }[];
  people: (Person & { suggested: JobRole })[];
  quote: {
    id: string; number: number; status: string; public_token: string; sent_at: string | null; accepted_at: string | null; accepted_name: string | null;
    roof_profile: string | null; roof_colour: string | null; measurement_source: string | null; total: number; gst: number;
    lines: { description: string; quantity: number; unit: string; amount: number; extra_status: string | null }[];
  } | null;
  roof: { summary: RoofSummary; m: Measurements } | null;
  invoices: { id: string; number: number; status: string; kind: string; label: string | null; due_date: string | null; bill_to: string; total: number; paid: number; balance: number }[];
  payments: { id: string; amount: number; method: string; paid_on: string; reference: string | null; invoice_number: number }[];
  costs: { total: number; byCategory: { category: string; amount: number }[] };
  claim: { carrier: string | null; claim_number: string | null; stage: string; excess: number; approved_amount: number | null; adjuster_name: string | null } | null;
  files: { photos: number; plans: number; documents: number; planName: string | null; thumbs: string[] };
  notes: { id: string; body: string; at: string; by: string | null }[];
  messages: { id: string; channel: string; direction: string; body: string; at: string; status: string }[];
  compliance: { state: string | null; done: number; total: number; licence: string | null } | null;
  money: { contract: number | null; invoiced: number; paid: number; owing: number; costs: number; profit: number | null; margin: number | null };
  /** Sold / scheduled only: what's left before the crew can start. */
  sold: SoldReady | null;
  /** New leads only: what they sent us and the documents on the job. */
  lead: { message: string | null; source: string | null; receivedAt: string | null; docs: LeadDoc[]; noAnswer: { count: number; last: string | null }; contactedBy: string | null } | null;
  /** Every document on the job (quote, plans, supplier invoices…), newest first. */
  docs: LeadDoc[];
  /** Building + Wrapping up: the quote's payments and each supplier's delivery + invoice. */
  build: BuildData | null;
  /** Quoting only: where the quote is up to, and what's left before there is one. */
  quoting: {
    intake: { by: string; at: string | null; body: string } | null;
    sent: { at: string | null; validUntil: string | null; daysLeft: number | null; views: number; lastViewed: string | null; firstViewed: string | null; remindedAt: string | null; title: string | null } | null;
    draft: { id: string; number: number; total: number; area: number | null } | null;
    inspection: { photos: number; at: string | null };
  } | null;
  /** Wrapping up only: what's left to close the job out. */
  wrap: { handoverSentAt: string | null; reviewRequestedAt: string | null; reviewUrl: string | null; warrantyRegisteredAt: string | null; warrantyProduct: string | null; finishedOn: string | null; quotedMargin: number | null; workmanshipYears: number } | null;
};
export type SoldReady = {
  signedAt: string | null; deposit: { amount: number; on: string; method: string } | null;
  coolingOff: { applies: boolean; ends: string | null; over: boolean };
  insurance: { required: boolean; done: boolean; scheme: string | null };
  orders: { suppliers: string[]; items: number; cost: number; sent: number; confirmed: number; delivered: number; total: number };
  crew: { name: string | null; start: string | null; end: string | null; locked: boolean };
  rule: string | null;
};
export type LeadDoc = { id: string; name: string; mime: string | null; size: number | null; at: string; viewUrl: string | null; downloadUrl: string | null };

const docName = (f: { caption: string | null; storage_path: string }) => (f.caption?.trim() || f.storage_path.split("/").pop() || "Document").slice(0, 120);
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export async function loadDocket(supabase: SupabaseClient, org: Organization, jobId: string, opts: { canSeeMoney: boolean }): Promise<Docket | null> {
  const { canSeeMoney } = opts;
  const empty = Promise.resolve({ data: [] as never[] });
  const [{ data: row }, { data: members }, { data: people }, { data: ests }, { data: invs }, { data: costRows }, { data: claim }, { data: files }, { data: notes }, { data: msgs }] = await Promise.all([
    supabase.from("jobs").select(`${NEXT_STEP_JOB_COLS}, title, job_type, site_address, state, lead_source, notes, created_at, assigned_to, inspection_at, lost_reason, referred_by, completed_at, dumpster_status, gate_code, site_hazards, delivery_type, public_token, pay_methods, roof_material, crews(name, phone), customers(id, name, phone, email, address, city, state, zip, notes)`).eq("id", jobId).maybeSingle(),
    supabase.from("job_members").select("user_id, role, created_at").eq("job_id", jobId).order("created_at"),
    supabase.from("memberships").select("user_id, full_name, email, role, phone").eq("org_id", org.id).order("full_name"),
    supabase.from("estimates").select("id, number, status, public_token, sent_at, accepted_at, accepted_name, roof_profile, roof_colour, measurements, measurement_source, created_at, estimate_totals(total, tax), estimate_items(description, quantity, unit, unit_price, extra_status, position)").eq("job_id", jobId).neq("status", "declined").order("created_at", { ascending: false }).limit(5),
    canSeeMoney ? supabase.from("invoices").select("id, number, status, kind, milestone_label, due_date, bill_to, invoice_totals(total, paid, balance), payments(id, amount, method, paid_on, reference)").eq("job_id", jobId).neq("status", "void").order("number") : empty,
    canSeeMoney ? supabase.from("job_costs").select("category, amount").eq("job_id", jobId) : empty,
    supabase.from("claims").select("carrier, claim_number, stage, excess, approved_amount, adjuster_name").eq("job_id", jobId).maybeSingle(),
    supabase.from("job_files").select("id, kind, category, caption, storage_path, mime_type, size_bytes, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300),
    supabase.from("job_notes").select("id, body, created_at, author_name").eq("job_id", jobId).order("created_at", { ascending: false }).limit(20),
    supabase.from("messages").select("id, channel, direction, body, created_at, status").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
  ]);
  if (!row) return null;
  const j = { ...row, ...asNextStepJob(row as never) } as typeof row & ReturnType<typeof asNextStepJob>;
  const ctx = (await loadNextStepCtx(supabase, [j as never], {})).get(jobId)!;
  type C = { id: string; name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; notes: string | null };
  const c = one(row.customers as unknown as C | C[])!;
  const crew = one(row.crews as unknown as { name: string; phone: string | null });

  // Quote: the signed one, else the latest sent, else the latest draft.
  type E = { id: string; number: number; status: string; public_token: string; sent_at: string | null; accepted_at: string | null; accepted_name: string | null; roof_profile: string | null; roof_colour: string | null; measurements: unknown; measurement_source: string | null; estimate_totals: unknown; estimate_items: { description: string; quantity: number; unit: string; unit_price: number; extra_status: string | null; position: number }[] };
  const list = (ests ?? []) as unknown as E[];
  const e = list.find((x) => x.status === "accepted") ?? list.find((x) => x.status === "sent") ?? list[0] ?? null;
  const et = e ? one(e.estimate_totals as { total: number; tax: number }) : null;
  const quote = e ? {
    id: e.id, number: e.number, status: e.status, public_token: e.public_token, sent_at: e.sent_at, accepted_at: e.accepted_at, accepted_name: e.accepted_name,
    roof_profile: e.roof_profile, roof_colour: e.roof_colour, measurement_source: e.measurement_source, total: Number(et?.total ?? 0), gst: Number(et?.tax ?? 0),
    lines: [...(e.estimate_items ?? [])].sort((a, b) => a.position - b.position).map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, amount: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100, extra_status: i.extra_status })),
  } : null;
  let roof: Docket["roof"] = null;
  if (e?.measurements) {
    const m = normalizeMeasurements(e.measurements);
    const s = summarize(m);
    if (s.trueArea > 0) roof = { summary: s, m };
  }

  // Money.
  type I = { id: string; number: number; status: string; kind: string; milestone_label: string | null; due_date: string | null; bill_to: string; invoice_totals: unknown; payments: { id: string; amount: number; method: string; paid_on: string; reference: string | null }[] };
  const invoices = ((invs ?? []) as unknown as I[]).map((i) => {
    const t = one(i.invoice_totals as { total: number; paid: number; balance: number });
    return { id: i.id, number: i.number, status: i.status, kind: i.kind, label: i.milestone_label, due_date: i.due_date, bill_to: i.bill_to, total: Number(t?.total ?? 0), paid: Number(t?.paid ?? 0), balance: Number(t?.balance ?? 0) };
  });
  const payments = ((invs ?? []) as unknown as I[]).flatMap((i) => (i.payments ?? []).map((p) => ({ ...p, amount: Number(p.amount), invoice_number: i.number }))).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  const byCat = new Map<string, number>();
  for (const r of (costRows ?? []) as { category: string; amount: number }[]) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));
  const costs = { total: [...byCat.values()].reduce((a, b) => a + b, 0), byCategory: [...byCat].map(([category, amount]) => ({ category, amount })) };
  const contract = quote && quote.status === "accepted" ? quote.total : null;
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const invoiced = invoices.filter((i) => i.status !== "draft").reduce((a, i) => a + i.total, 0);
  const exGst = quote && quote.status === "accepted" ? quote.total - quote.gst : null;
  const profit = exGst !== null ? Math.round((exGst - costs.total) * 100) / 100 : null;

  // Files: counts + two thumbnails.
  type F = { id: string; kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string };
  const fileRows = (files ?? []) as F[];
  const photos = fileRows.filter((f) => f.kind === "photo");
  const plans = fileRows.filter((f) => f.category === "plans");
  const thumbsPaths = photos.slice(0, 2).map((f) => f.storage_path);
  const signed = thumbsPaths.length ? await signPaths(supabase, thumbsPaths, 3600) : new Map<string, string>();

  // Team + everyone in the company (for the picker).
  const peopleList = (people ?? []) as Person[];
  const byId = new Map(peopleList.map((p) => [p.user_id, p]));
  const team = ((members ?? []) as { user_id: string; role: JobRole }[]).map((m) => {
    const p = byId.get(m.user_id);
    return { user_id: m.user_id, role: m.role, name: p?.full_name || p?.email || "Someone", email: p?.email ?? null, phone: p?.phone ?? null, memberRole: p?.role ?? "" };
  });

  let compliance: Docket["compliance"] = null;
  let compFull: Awaited<ReturnType<typeof loadJobCompliance>> = null;
  if (canSeeMoney) {
    const comp = await loadJobCompliance(supabase, org, jobId);
    compFull = comp;
    if (comp?.rules) {
      const p = checklistProgress(comp.items);
      compliance = { state: comp.state, done: p.done, total: p.total, licence: comp.licenceNumber };
    }
  }

  // Sold: the getting-ready checklist (signed + deposit, cooling-off, home warranty, materials, crew).
  let sold: Docket["sold"] = null;
  if ((row.stage === "sold" || row.stage === "scheduled") && canSeeMoney) {
    const { data: mo } = await supabase.from("material_orders").select("status, supplier, material_order_items(quantity, unit, unit_cost, length_m)").eq("job_id", jobId).neq("status", "cancelled").order("created_at");
    type MO = { status: string; supplier: string; material_order_items: { quantity: number; unit: string; unit_cost: number; length_m: number | null }[] };
    const orders = ((mo ?? []) as unknown as MO[]).filter((o) => o.material_order_items?.length);
    const cool = compFull?.items.find((i) => i.key === "cooling_off");
    const ins = compFull?.items.find((i) => i.key === "insurance_certificate");
    const r = compFull?.rules;
    const dep = payments[0] ?? null;
    sold = {
      signedAt: quote?.accepted_at ?? null,
      deposit: dep ? { amount: dep.amount, on: dep.paid_on, method: dep.method } : null,
      coolingOff: { applies: Boolean(cool), ends: cool?.due ?? null, over: !cool || cool.status === "done" || cool.status === "not_needed" },
      insurance: { required: Boolean(ins) && ins!.status !== "not_needed", done: !ins || ins.status === "done" || ins.status === "not_needed", scheme: r?.insurance.scheme ?? null },
      orders: {
        suppliers: orders.map((o) => o.supplier), items: orders.reduce((a, o) => a + o.material_order_items.length, 0),
        cost: Math.round(orders.reduce((a, o) => a + o.material_order_items.reduce((b, i) => b + Number(i.quantity) * (i.length_m && ["lm", "m"].includes(i.unit) ? Number(i.length_m) : 1) * Number(i.unit_cost), 0), 0)),
        sent: orders.filter((o) => o.status !== "draft").length, confirmed: orders.filter((o) => o.status === "confirmed" || o.status === "delivered").length,
        delivered: orders.filter((o) => o.status === "delivered").length, total: orders.length,
      },
      crew: { name: crew?.name ?? null, start: row.scheduled_start, end: row.scheduled_end, locked: Boolean((row as { schedule_locked?: boolean }).schedule_locked) },
      rule: r && compFull?.value ? `${r.state}, ${compFull.value.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })}${r.writtenContract.tier ? ` (${r.writtenContract.tier.split(" (")[0]})` : ""}.${r.insurance.required === true ? " Home warranty paid before work starts." : ""}${cool ? " Don't start before cooling-off ends." : ""}` : null,
    };
  }

  // Documents (every stage), with short-lived links to look at or download each one.
  const docRows = fileRows.filter((f) => f.kind === "document").slice(0, 30);
  const views = docRows.length ? await signPaths(supabase, docRows.map((f) => f.storage_path), 3600) : new Map<string, string>();
  const downloads = await Promise.all(docRows.map(async (f) => {
    const { data } = await supabase.storage.from("job-files").createSignedUrl(f.storage_path, 3600, { download: docName(f) });
    return data?.signedUrl ?? null;
  }));
  const docs: LeadDoc[] = docRows.map((f, i) => ({ id: f.id, name: docName(f), mime: f.mime_type, size: f.size_bytes === null ? null : Number(f.size_bytes), at: f.created_at, viewUrl: views.get(f.storage_path) ?? null, downloadUrl: downloads[i] }));
  let lead: Docket["lead"] = null;
  if (row.stage === "lead") {
    // "No answer" tries (job_events) and who made the first contact (its job note), for the First call step.
    const [{ data: tries }, { data: firstNote }] = await Promise.all([
      supabase.from("job_events").select("created_at").eq("job_id", jobId).eq("kind", "call_no_answer").order("created_at", { ascending: false }).limit(50),
      row.first_contacted_at ? supabase.from("job_notes").select("author_name").eq("job_id", jobId).like("body", "First contact made%").order("created_at").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    lead = {
      message: ((row as { notes?: string | null }).notes ?? c.notes ?? null)?.trim() || null,
      source: row.lead_source, receivedAt: row.lead_received_at,
      docs: docs.slice(0, 20),
      noAnswer: { count: tries?.length ?? 0, last: tries?.[0]?.created_at ?? null },
      contactedBy: (firstNote as { author_name?: string | null } | null)?.author_name ?? null,
    };
  }
  let quoting: Docket["quoting"] = null;
  if (row.stage === "inspection" || row.stage === "estimate_sent") {
    const SRC: Record<string, string> = { website: "From your website", instant_quote: "From your instant quote", gmail: "From Gmail", email: "From email", manual: "Added by hand" };
    const intakeBody = ((row as { notes?: string | null }).notes ?? c.notes ?? null)?.trim() || null;
    const firstPhoto = [...photos].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    let sent: NonNullable<Docket["quoting"]>["sent"] = null;
    let draft: NonNullable<Docket["quoting"]>["draft"] = null;
    if (e && e.status === "sent") {
      const { data: v } = await supabase.from("estimates").select("terms, view_count, first_viewed_at, last_viewed_at, reminded_at, roof_profile").eq("id", e.id).single();
      const tz = AU_STATE_TZ[asAuState(row.state) ?? asAuState(org.state) ?? "NSW"];
      const until = validUntil(e.sent_at, validDays((v as { terms?: string | null } | null)?.terms));
      sent = {
        at: e.sent_at, validUntil: until, daysLeft: daysLeft(until, calendarDate(new Date(), tz)),
        views: Number(v?.view_count ?? 0), lastViewed: v?.last_viewed_at ?? null, firstViewed: v?.first_viewed_at ?? null, remindedAt: v?.reminded_at ?? null,
        title: [row.job_type === "repair" ? "Repair" : "Re-roof", e.roof_profile].filter(Boolean).join(", "),
      };
    } else if (e && e.status === "draft") {
      draft = { id: e.id, number: e.number, total: quote?.total ?? 0, area: roof ? Math.round(roof.summary.trueArea) : null };
    }
    quoting = {
      intake: intakeBody ? { by: SRC[row.lead_source ?? ""] ?? "When they got in touch", at: row.lead_received_at, body: intakeBody } : null,
      sent, draft, inspection: { photos: photos.length, at: firstPhoto?.created_at ?? null },
    };
  }
  const wrapping = row.stage === "completed" || row.stage === "paid";
  const build = (row.stage === "in_progress" || wrapping) && canSeeMoney
    ? await loadBuild(supabase, org, jobId, { state: row.state, scheduled_end: row.scheduled_end, completed_at: row.completed_at, stage: row.stage }, contract)
    : null;
  let wrap: Docket["wrap"] = null;
  if (wrapping && canSeeMoney) {
    const [{ data: wj }, { data: wo }, { data: we }] = await Promise.all([
      supabase.from("jobs").select("handover_sent_at, review_requested_at, warranty_registered_at, warranty_product, completed_at, scheduled_end").eq("id", jobId).single(),
      supabase.from("organizations").select("google_review_url, workmanship_years").eq("id", org.id).single(),
      e?.status === "accepted" ? supabase.from("estimates").select("margin_pct").eq("id", e.id).single() : Promise.resolve({ data: null }),
    ]);
    wrap = {
      handoverSentAt: wj?.handover_sent_at ?? null, reviewRequestedAt: wj?.review_requested_at ?? null, reviewUrl: wo?.google_review_url ?? null,
      warrantyRegisteredAt: wj?.warranty_registered_at ?? null, warrantyProduct: wj?.warranty_product ?? null, finishedOn: wj?.completed_at ?? wj?.scheduled_end ?? null,
      quotedMargin: (we as { margin_pct: number | null } | null)?.margin_pct ?? null, workmanshipYears: wo?.workmanship_years ?? 7,
    };
  }

  const refId = (row as { referred_by?: string | null }).referred_by ?? null;
  const { data: refRow } = refId ? await supabase.from("customers").select("id, name").eq("id", refId).maybeSingle() : { data: null };
  const referredBy = refRow ? { id: refRow.id as string, name: refRow.name as string } : null;
  const addr = [c.address, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    job: {
      id: row.id, title: row.title, stage: row.stage, job_type: row.job_type, site_address: row.site_address, state: row.state, is_insurance: row.is_insurance,
      lead_source: row.lead_source, lead_received_at: row.lead_received_at, first_contacted_at: row.first_contacted_at, created_at: row.created_at,
      assigned_to: (row as { assigned_to?: string | null }).assigned_to ?? null, inspection_at: (row as { inspection_at?: string | null }).inspection_at ?? null,
      referredBy,
      lost_reason: (row as { lost_reason?: string | null }).lost_reason ?? null, tz: AU_STATE_TZ[asAuState(row.state) ?? asAuState(org.state) ?? "NSW"],
      scheduled_start: row.scheduled_start, scheduled_end: row.scheduled_end, completed_at: row.completed_at, materials_status: row.materials_status, dumpster_status: row.dumpster_status,
      gate_code: row.gate_code, site_hazards: row.site_hazards, delivery_type: row.delivery_type, public_token: row.public_token, pay_methods: row.pay_methods ?? [], roof_material: row.roof_material, crew,
    },
    customer: { id: c.id!, name: c.name ?? "", phone: c.phone, email: c.email, address: addr || null, notes: c.notes },
    next: nextStep(j as never, ctx),
    team,
    people: peopleList.map((p) => ({ ...p, suggested: defaultJobRole(p.role) })),
    quote,
    roof,
    invoices,
    payments,
    costs,
    claim: claim ? { carrier: claim.carrier, claim_number: claim.claim_number, stage: claim.stage, excess: Number(claim.excess ?? 0), approved_amount: claim.approved_amount === null ? null : Number(claim.approved_amount), adjuster_name: claim.adjuster_name } : null,
    files: { photos: photos.length, plans: plans.length, documents: fileRows.filter((f) => f.kind === "document" && f.category !== "plans").length, planName: plans[0]?.caption ?? null, thumbs: thumbsPaths.map((p) => signed.get(p)).filter((u): u is string => Boolean(u)) },
    notes: ((notes ?? []) as { id: string; body: string; created_at: string; author_name: string | null }[]).map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: n.author_name })),
    messages: ((msgs ?? []) as { id: string; channel: string; direction: string; body: string; created_at: string; status: string }[]).map((m) => ({ id: m.id, channel: m.channel, direction: m.direction, body: m.body, at: m.created_at, status: m.status })),
    compliance,
    lead,
    sold,
    docs,
    build,
    wrap,
    quoting,
    money: { contract, invoiced, paid, owing: contract !== null ? Math.max(0, Math.round((contract - paid) * 100) / 100) : invoices.reduce((a, i) => a + i.balance, 0), costs: costs.total, profit, margin: profit !== null && exGst ? Math.round((profit / exGst) * 100) : null },
  };
}
