// What each job record line opens to: the documents and records behind it (signed quote, invoices, change orders,
// plans, photos, messages …), each with a link to look at it and, for files, to download it. Pure.
import type { Docket } from "./job-docket-server";
import { recordDate, type RecordKey } from "./job-record";

export type RecordItemIcon = "doc" | "plan" | "photo" | "sign" | "cash" | "mail" | "shield" | "truck" | "crew" | "ruler";
export type RecordItem = { icon: RecordItemIcon; name: string; meta: string; href?: string | null; download?: string | null; tag?: string };
export type RecordItems = { items: RecordItem[]; thumbs?: string[]; more?: { label: string; href: string } };

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function recordItems(d: Docket): Partial<Record<RecordKey, RecordItems>> {
  const j = d.job;
  const day = (iso: string) => recordDate(iso, j.tz);
  const base = `/app/jobs/${j.id}`;
  const q = d.quote;
  const x = d.extra;
  const doc = (f: Docket["docs"][number], icon: RecordItemIcon = "doc", tag?: string): RecordItem => ({ icon, name: f.name, meta: [f.revision, f.superseded ? "superseded" : null, day(f.at)].filter(Boolean).join(" · "), href: f.viewUrl, download: f.downloadUrl, tag });
  const out: Partial<Record<RecordKey, RecordItems>> = {};

  const msg = d.lead?.message ?? d.quoting?.intake?.body ?? null;
  out.lead = { items: [{ icon: "mail", name: "What they sent", meta: msg ? clip(msg) : "No message with the lead", href: null }] };

  const planDocs = d.docs.filter((f) => f.category === "plans");
  const current = planDocs.find((f) => !f.superseded && !f.report);
  out.plans = {
    items: [
      ...planDocs.map((f) => {
        if (f.report) {
          const ours = d.roof?.summary.trueArea ?? 0;
          const diff = ours > 0 && f.report.area ? Math.abs(f.report.area - ours) / ours : null;
          const check = diff === null ? null : diff <= 0.02 ? `matches our measure within ${Math.max(1, Math.round(diff * 100))}%` : `differs from our ${Math.round(ours)} m² by ${Math.round(diff * 100)}%`;
          return { icon: "ruler" as const, name: f.name, meta: [`${f.report.source ?? "Roof"} report`, f.report.area ? `${Math.round(f.report.area * 10) / 10} m²` : null, f.report.pitch ? `${Math.round(f.report.pitch)}°` : null, check].filter(Boolean).join(" · "), href: f.viewUrl, download: f.downloadUrl, tag: "Full" };
        }
        return doc(f, "plan", f === current && !f.superseded ? (q?.measurement_source === "plans" || q?.measurement_source === "documents" ? "Used" : "Current") : undefined);
      }),
      ...(d.roof && q ? [{ icon: "ruler" as const, name: "Our roof report", meta: `${Math.round(d.roof.summary.trueArea * 10) / 10} m² · ${Math.round(d.roof.summary.maxPitch)}° · used for the quote`, href: q.measurement_source === "plans" ? `/app/measure/${q.id}/plans` : `/app/measure/${q.id}` }] : []),
    ],
    more: { label: "Plans in the job file", href: `${base}/file?r=plans` },
  };

  if (j.inspection_at) out.inspection = { items: [{ icon: "crew", name: `Inspection ${day(j.inspection_at)}`, meta: d.quoting?.inspection.photos ? `${d.quoting.inspection.photos} photos taken` : "Booked", href: base }] };

  if (q) {
    out.quote = { items: [
      { icon: "doc", name: `Quote #${q.number}`, meta: `${aud(q.total)} · ${q.status}${q.sent_at ? ` · sent ${day(q.sent_at)}` : ""}`, href: `/app/estimates/${q.id}` },
      ...(q.sent_at ? [{ icon: "mail" as const, name: "Quote email", meta: `Sent ${day(q.sent_at)}${d.quoting?.sent?.views ? ` · opened ${d.quoting.sent.views}×` : ""}`, href: `/q/${q.public_token}?office=1` }] : []),
    ] };
    if (q.status === "accepted") out.contract = { items: [
      { icon: "doc", name: `Signed contract · Quote #${q.number}`, meta: `${aud(q.total)}${q.accepted_at ? ` · signed ${day(q.accepted_at)}` : ""}`, href: `/q/${q.public_token}?office=1` },
      { icon: "sign", name: `${q.accepted_name ?? "Customer"}'s signature`, meta: "Signed online · name, signature and device kept", href: `/q/${q.public_token}?office=1` },
    ] };
  }

  if (d.compliance || d.sold) out.legal = { items: [{ icon: "shield", name: "State checklist", meta: d.compliance ? `${d.compliance.done} of ${d.compliance.total} done${d.compliance.state ? ` · ${d.compliance.state}` : ""}` : "Cooling-off, home warranty, notices", href: `${base}/compliance` }] };

  if (d.invoices.length) out.payments = { items: d.invoices.map((i) => ({ icon: "cash" as const, name: `${i.label ?? `Invoice #${i.number}`} · ${aud(i.total)}`, meta: i.balance <= 0 ? `Paid${(() => { const p = d.payments.filter((pp) => pp.invoice_number === i.number).at(-1); return p ? ` ${day(p.paid_on)} by ${p.method.replace(/_/g, " ")}` : ""; })()}` : `${aud(i.balance)} owing${i.due_date ? ` · due ${day(i.due_date)}` : ""}`, href: `/app/invoices/${i.id}` })), more: { label: "Billing", href: `${base}/billing` } };

  const supplierDocs = d.docs.filter((f) => f.category === "supplier_invoice");
  const dl = d.build?.deliveries ?? [];
  if (dl.length || supplierDocs.length) out.materials = { items: [
    ...dl.map((o) => ({ icon: "truck" as const, name: `${o.supplier.split(" (")[0]}${o.invoice?.no ? ` · invoice ${o.invoice.no}` : ""}`, meta: [o.what, o.deliveredAt ? `delivered ${day(o.deliveredAt)}` : null, o.paidAt ? "paid" : o.invoice ? "to pay" : "invoice not in"].filter(Boolean).join(" · "), href: `/app/materials/${j.id}` })),
    ...supplierDocs.map((f) => doc(f)),
  ], more: { label: "Material orders", href: `/app/materials/${j.id}` } };

  if (j.crew || j.scheduled_start) out.crew = { items: [{ icon: "crew", name: j.crew?.name ?? "Crew", meta: j.scheduled_start ? `${day(j.scheduled_start)}${j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${day(j.scheduled_end)}` : ""}` : "Not booked", href: "/app/schedule" }] };

  if (x?.swms || x?.siteDays.days) out.safety = { items: [
    ...(x.swms ? [{ icon: "shield" as const, name: "SWMS · working at heights", meta: x.swms.status === "done" ? `Done${x.swms.by ? ` by ${x.swms.by}` : ""}${x.swms.at ? ` · ${day(x.swms.at)}` : ""}` : "Not done yet", href: `${base}/compliance` }] : []),
    ...(x.siteDays.days ? [{ icon: "crew" as const, name: `${x.siteDays.days} day${x.siteDays.days === 1 ? "" : "s"} on site`, meta: x.siteDays.first ? `${day(x.siteDays.first)}${x.siteDays.last && x.siteDays.last !== x.siteDays.first ? ` – ${day(x.siteDays.last)}` : ""} · from the crew's updates` : "", href: `${base}/field` }] : []),
  ] };

  if (d.files.photos) out.photos = { items: [], thumbs: d.files.thumbs, more: { label: `All ${d.files.photos} photos`, href: `${base}/file?r=photos` } };

  if (x?.variations.length) out.variations = { items: x.variations.map((v) => ({ icon: "doc" as const, name: v.title, meta: `${v.amount >= 0 ? "+" : "−"}${aud(Math.abs(v.amount))} · ${v.status === "approved" ? `signed${v.approvedName ? ` by ${v.approvedName.split(" ")[0]}` : ""}${v.approvedAt ? ` ${day(v.approvedAt)}` : ""}` : v.status === "sent" ? "sent, not signed" : "draft"}`, href: `${base}/change-orders/${v.id}` })), more: { label: "All variations", href: `${base}/change-orders` } };

  out.signoff = { items: x?.signoff
    ? [{ icon: "sign", name: "Completion sign-off", meta: `Signed${x.signoff.name ? ` by ${x.signoff.name}` : ""} · ${day(x.signoff.at)}${x.defects.total ? ` · ${x.defects.open} of ${x.defects.total} touch-ups open` : ""}`, href: `${base}/closeout/certificate` }]
    : [{ icon: "sign", name: "Final walkthrough", meta: "Have them sign on site, or send the link", href: `${base}/closeout` }] };

  if (d.wrap?.handoverSentAt) out.warranty = { items: [{ icon: "shield", name: "Warranty & handover pack", meta: `Sent ${day(d.wrap.handoverSentAt)}${d.wrap.warrantyRegisteredAt ? ` · ${d.wrap.warrantyProduct ?? "manufacturer"} warranty registered` : ""}`, href: `${base}/closeout` }] };

  if (d.messages.length) out.messages = { items: d.messages.slice(0, 3).map((m) => ({ icon: m.channel === "sms" ? "mail" as const : "mail" as const, name: `${m.channel === "sms" ? "Text" : "Email"} · ${clip(m.body.replace(/\s+/g, " "), 44)}`, meta: `${m.direction === "inbound" ? "From" : "To"} ${d.customer.name.split(" ")[0]} · ${day(m.at)}`, href: m.channel === "email" ? "/app/inbox" : base })), more: { label: d.customer.email ? `Email ${d.customer.name.split(" ")[0]}` : "Inbox", href: d.customer.email ? `/app/inbox?compose=1&to=${encodeURIComponent(d.customer.email)}&job=${j.id}` : "/app/inbox" } };

  return out;
}
