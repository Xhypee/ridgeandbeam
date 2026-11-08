import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPaths } from "./field-server";
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
};

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export async function loadDocket(supabase: SupabaseClient, org: Organization, jobId: string, opts: { canSeeMoney: boolean }): Promise<Docket | null> {
  const { canSeeMoney } = opts;
  const empty = Promise.resolve({ data: [] as never[] });
  const [{ data: row }, { data: members }, { data: people }, { data: ests }, { data: invs }, { data: costRows }, { data: claim }, { data: files }, { data: notes }, { data: msgs }] = await Promise.all([
    supabase.from("jobs").select(`${NEXT_STEP_JOB_COLS}, title, job_type, site_address, state, lead_source, created_at, completed_at, dumpster_status, gate_code, site_hazards, delivery_type, public_token, pay_methods, roof_material, crews(name, phone), customers(id, name, phone, email, address, city, state, zip, notes)`).eq("id", jobId).maybeSingle(),
    supabase.from("job_members").select("user_id, role, created_at").eq("job_id", jobId).order("created_at"),
    supabase.from("memberships").select("user_id, full_name, email, role, phone").eq("org_id", org.id).order("full_name"),
    supabase.from("estimates").select("id, number, status, public_token, sent_at, accepted_at, accepted_name, roof_profile, roof_colour, measurements, measurement_source, created_at, estimate_totals(total, tax), estimate_items(description, quantity, unit, unit_price, extra_status, position)").eq("job_id", jobId).neq("status", "declined").order("created_at", { ascending: false }).limit(5),
    canSeeMoney ? supabase.from("invoices").select("id, number, status, kind, milestone_label, due_date, bill_to, invoice_totals(total, paid, balance), payments(id, amount, method, paid_on, reference)").eq("job_id", jobId).neq("status", "void").order("number") : empty,
    canSeeMoney ? supabase.from("job_costs").select("category, amount").eq("job_id", jobId) : empty,
    supabase.from("claims").select("carrier, claim_number, stage, excess, approved_amount, adjuster_name").eq("job_id", jobId).maybeSingle(),
    supabase.from("job_files").select("kind, category, caption, storage_path, mime_type, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300),
    supabase.from("job_notes").select("id, body, created_at, author_name").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
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
  type F = { kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null };
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
  if (canSeeMoney) {
    const comp = await loadJobCompliance(supabase, org, jobId);
    if (comp?.rules) {
      const p = checklistProgress(comp.items);
      compliance = { state: comp.state, done: p.done, total: p.total, licence: comp.licenceNumber };
    }
  }

  const addr = [c.address, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    job: {
      id: row.id, title: row.title, stage: row.stage, job_type: row.job_type, site_address: row.site_address, state: row.state, is_insurance: row.is_insurance,
      lead_source: row.lead_source, lead_received_at: row.lead_received_at, first_contacted_at: row.first_contacted_at, created_at: row.created_at,
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
    money: { contract, invoiced, paid, owing: contract !== null ? Math.max(0, Math.round((contract - paid) * 100) / 100) : invoices.reduce((a, i) => a + i.balance, 0), costs: costs.total, profit, margin: profit !== null && exGst ? Math.round((profit / exGst) * 100) : null },
  };
}
