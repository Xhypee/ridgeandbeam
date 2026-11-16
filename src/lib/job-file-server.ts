import "server-only";
// The job file: every document and record on a job in one dated list (plans and roof reports, the quote and the
// signed contract, variations, invoices and payments, supplier invoices, compliance evidence, sign-off, photos,
// messages), each tagged with the job record line it belongs to. Feeds /app/jobs/[id]/file and its print view.
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPaths } from "./field-server";
import type { RecordKey } from "./job-record";
import { normalizeMeasurements, summarize } from "./roof";

export type FileEntry = {
  id: string; at: string; record: RecordKey; icon: "doc" | "plan" | "photo" | "sign" | "cash" | "mail" | "shield" | "truck" | "ruler";
  name: string; detail: string; view: string | null; download: string | null; tag?: string;
};
export type JobFile = {
  job: { id: string; title: string; site: string | null; customer: string; created_at: string; completed_at: string | null };
  entries: FileEntry[];
  plans: { id: string; name: string; revision: string | null; superseded: boolean; view: string | null; download: string | null; at: string; isReport: boolean; source: string | null; area: number | null; pitch: number | null }[];
  photos: { id: string; url: string; caption: string; stage: "before" | "during" | "after" | "other"; at: string }[];
  measured: { area: number; pitch: number; ridgeHip: number; valley: number; eave: number; barge: number } | null;
};

const BEFORE = ["overview", "damage", "broken_tiles", "ridge_capping", "sheet_damage", "hail_dents", "gutter_damage", "internal_water", "test_square"];
const DURING = ["decking", "progress", "delivery"];
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const nameOf = (f: { caption: string | null; storage_path: string }) => f.caption?.trim() || f.storage_path.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export async function loadJobFile(supabase: SupabaseClient, jobId: string, opts: { canSeeMoney: boolean }): Promise<JobFile | null> {
  const empty = Promise.resolve({ data: [] as never[] });
  const [{ data: job }, { data: files }, { data: ests }, { data: invs }, { data: cos }, { data: msgs }, { data: events }] = await Promise.all([
    supabase.from("jobs").select("id, title, site_address, created_at, completed_at, walkthrough_signed_at, walkthrough_name, handover_sent_at, customers(name)").eq("id", jobId).maybeSingle(),
    supabase.from("job_files").select("id, kind, category, caption, storage_path, mime_type, created_at, taken_at, revision, superseded_at, meta").eq("job_id", jobId).order("created_at", { ascending: false }).limit(800),
    opts.canSeeMoney ? supabase.from("estimates").select("id, number, status, public_token, sent_at, accepted_at, accepted_name, created_at, measurements, estimate_totals(total)").eq("job_id", jobId).neq("status", "declined").order("created_at") : empty,
    opts.canSeeMoney ? supabase.from("invoices").select("id, number, status, milestone_label, issue_date, created_at, invoice_totals(total, balance), payments(id, amount, method, paid_on)").eq("job_id", jobId).neq("status", "void").order("number") : empty,
    supabase.from("change_orders").select("id, title, status, approved_at, approved_name, created_at, change_order_items(quantity, unit_price)").eq("job_id", jobId).order("created_at"),
    supabase.from("messages").select("id, channel, direction, body, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(200),
    supabase.from("job_events").select("id, kind, note, created_at, created_by_name").eq("job_id", jobId).in("kind", ["walkthrough_signed", "warranty_registered", "permit_approved"]).order("created_at"),
  ]);
  if (!job) return null;
  type F = { id: string; kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null; created_at: string; taken_at: string | null; revision: string | null; superseded_at: string | null; meta: { kind?: string; source?: string | null; roof?: { area_m2?: number | null; pitch_deg?: number | null } | null } | null };
  const fs = (files ?? []) as F[];
  const docs = fs.filter((f) => f.kind !== "photo" && f.kind !== "voice");
  const photos = fs.filter((f) => f.kind === "photo");
  const views = await signPaths(supabase, [...docs.map((f) => f.storage_path), ...photos.slice(0, 120).map((f) => f.storage_path)], 3600);
  const downloads = new Map<string, string>();
  await Promise.all(docs.slice(0, 200).map(async (f) => {
    const { data } = await supabase.storage.from("job-files").createSignedUrl(f.storage_path, 3600, { download: nameOf(f) });
    if (data?.signedUrl) downloads.set(f.id, data.signedUrl);
  }));

  const entries: FileEntry[] = [];
  const recordOf = (f: F): RecordKey => f.category === "plans" ? "plans" : f.category === "supplier_invoice" ? "materials" : f.kind === "signature" ? "signoff" : "lead";
  for (const f of docs) {
    const isReport = f.meta?.kind === "roof_report";
    entries.push({
      id: `f-${f.id}`, at: f.created_at, record: recordOf(f), icon: isReport ? "ruler" : f.category === "plans" ? "plan" : "doc",
      name: nameOf(f), detail: [isReport ? `${f.meta?.source ?? "Roof"} roof report` : null, f.revision, f.superseded_at ? "superseded" : null, (f.mime_type ?? "").includes("pdf") ? "PDF" : null].filter(Boolean).join(" · ") || "Document",
      view: views.get(f.storage_path) ?? null, download: downloads.get(f.id) ?? null, tag: isReport ? "Full" : undefined,
    });
  }
  type E = { id: string; number: number; status: string; public_token: string; sent_at: string | null; accepted_at: string | null; accepted_name: string | null; created_at: string; measurements: unknown; estimate_totals: unknown };
  const est = (ests ?? []) as unknown as E[];
  for (const e of est) {
    const total = Number(one(e.estimate_totals as { total: number })?.total ?? 0);
    entries.push({ id: `q-${e.id}`, at: e.sent_at ?? e.created_at, record: "quote", icon: "doc", name: `Quote #${e.number}`, detail: `${aud(total)} · ${e.status}`, view: `/app/estimates/${e.id}`, download: null });
    if (e.status === "accepted" && e.accepted_at) entries.push({ id: `c-${e.id}`, at: e.accepted_at, record: "contract", icon: "sign", name: `Signed contract · Quote #${e.number}`, detail: `Signed by ${e.accepted_name ?? "the customer"} online · ${aud(total)}`, view: `/q/${e.public_token}?office=1`, download: null });
  }
  type I = { id: string; number: number; status: string; milestone_label: string | null; issue_date: string | null; created_at: string; invoice_totals: unknown; payments: { id: string; amount: number; method: string; paid_on: string }[] };
  for (const i of (invs ?? []) as unknown as I[]) {
    const t = one(i.invoice_totals as { total: number; balance: number });
    entries.push({ id: `i-${i.id}`, at: i.issue_date ?? i.created_at, record: "payments", icon: "cash", name: `${i.milestone_label ?? "Invoice"} · #${i.number}`, detail: `${aud(Number(t?.total ?? 0))} · ${Number(t?.balance ?? 0) <= 0 ? "paid" : `${aud(Number(t?.balance ?? 0))} owing`}`, view: `/app/invoices/${i.id}`, download: null });
    for (const p of i.payments ?? []) entries.push({ id: `p-${p.id}`, at: p.paid_on, record: "payments", icon: "cash", name: `Payment received · ${aud(Number(p.amount))}`, detail: `${p.method.replace(/_/g, " ")} · invoice #${i.number}`, view: `/app/invoices/${i.id}`, download: null });
  }
  type CO = { id: string; title: string; status: string; approved_at: string | null; approved_name: string | null; created_at: string; change_order_items: { quantity: number; unit_price: number }[] };
  for (const c of (cos ?? []) as unknown as CO[]) {
    const amount = (c.change_order_items ?? []).reduce((t, x) => t + Number(x.quantity) * Number(x.unit_price), 0);
    entries.push({ id: `v-${c.id}`, at: c.approved_at ?? c.created_at, record: "variations", icon: "doc", name: `Variation · ${c.title}`, detail: `${aud(amount)} · ${c.status === "approved" ? `signed by ${c.approved_name ?? "the customer"}` : c.status}`, view: `/app/jobs/${jobId}/change-orders/${c.id}`, download: null });
  }
  for (const m of (msgs ?? []) as { id: string; channel: string; direction: string; body: string; created_at: string }[]) {
    entries.push({ id: `m-${m.id}`, at: m.created_at, record: "messages", icon: "mail", name: `${m.channel === "sms" ? "Text" : "Email"} ${m.direction === "inbound" ? "from" : "to"} the customer`, detail: m.body.replace(/\s+/g, " ").slice(0, 120), view: null, download: null });
  }
  for (const ev of (events ?? []) as { id: string; kind: string; note: string | null; created_at: string; created_by_name: string | null }[]) {
    entries.push({ id: `e-${ev.id}`, at: ev.created_at, record: ev.kind === "walkthrough_signed" ? "signoff" : "warranty", icon: ev.kind === "walkthrough_signed" ? "sign" : "shield", name: ev.kind === "walkthrough_signed" ? "Completion sign-off" : ev.kind === "warranty_registered" ? "Warranty registered" : "Approval granted", detail: ev.note ?? "", view: ev.kind === "walkthrough_signed" ? `/app/jobs/${jobId}/closeout/certificate` : null, download: null });
  }
  if ((job as { handover_sent_at?: string | null }).handover_sent_at) entries.push({ id: "handover", at: (job as { handover_sent_at: string }).handover_sent_at, record: "warranty", icon: "shield", name: "Warranty & handover pack", detail: "Sent to the customer", view: `/app/jobs/${jobId}/closeout`, download: null });
  const photoGroups = new Map<string, number>();
  for (const p of photos) { const k = p.created_at.slice(0, 10); photoGroups.set(k, (photoGroups.get(k) ?? 0) + 1); }
  for (const [day, n] of photoGroups) entries.push({ id: `ph-${day}`, at: `${day}T12:00:00Z`, record: "photos", icon: "photo", name: `${n} photo${n === 1 ? "" : "s"}`, detail: "Taken on site", view: `/app/jobs/${jobId}/files?tab=photos`, download: null });
  entries.sort((a, b) => b.at.localeCompare(a.at));

  const accepted = est.find((e) => e.status === "accepted") ?? est.at(-1);
  const s = accepted ? summarize(normalizeMeasurements(accepted.measurements)) : null;
  const m = accepted ? normalizeMeasurements(accepted.measurements) : null;
  return {
    job: { id: job.id, title: job.title, site: job.site_address, customer: one(job.customers as unknown as { name: string })?.name ?? "", created_at: job.created_at, completed_at: job.completed_at },
    entries,
    plans: docs.filter((f) => f.category === "plans").map((f) => ({ id: f.id, name: nameOf(f), revision: f.revision, superseded: Boolean(f.superseded_at), view: views.get(f.storage_path) ?? null, download: downloads.get(f.id) ?? null, at: f.created_at, isReport: f.meta?.kind === "roof_report", source: f.meta?.source ?? null, area: f.meta?.roof?.area_m2 ?? null, pitch: f.meta?.roof?.pitch_deg ?? null })),
    photos: photos.slice(0, 120).map((p) => ({ id: p.id, url: views.get(p.storage_path) ?? "", caption: p.caption ?? "", stage: BEFORE.includes(p.category) ? "before" : DURING.includes(p.category) ? "during" : p.category === "completion" ? "after" : "other", at: p.taken_at ?? p.created_at })),
    measured: s && s.trueArea > 0 && m ? { area: s.trueArea, pitch: s.maxPitch, ridgeHip: s.ridgeHip, valley: m.valley, eave: m.eave, barge: m.barge } : null,
  };
}
