// The job record in the Jobs sidebar: one line per record (lead, plans, inspection, quote, contract, legal steps,
// payments, materials, crew, photos, warranty, messages) that fills in as the job moves along. Pure (no DB) so the
// rules are unit-tested. A line is "done" once there is something on file, "now" when it's the one the job is
// waiting on (it matches the task at the top), and "later" until then.
import type { Docket } from "./job-docket-server";

export type RecordState = "done" | "now" | "later";
export type RecordRow = { key: RecordKey; label: string; value: string; state: RecordState; href?: string };
export type RecordKey = "lead" | "plans" | "inspection" | "quote" | "contract" | "legal" | "payments" | "materials" | "crew" | "safety" | "photos" | "variations" | "signoff" | "warranty" | "messages";

export type RecordInput = Pick<Docket, "job" | "quote" | "roof" | "invoices" | "files" | "messages" | "compliance" | "sold" | "build" | "quoting" | "wrap" | "team"> & { column: Docket["column"]; extra?: Docket["extra"]; docs?: Docket["docs"] };

export const LABEL: Record<RecordKey, string> = {
  lead: "Lead", plans: "Plans", inspection: "Inspection", quote: "Quote", contract: "Contract", legal: "Legal steps",
  payments: "Payments", materials: "Materials", crew: "Crew", safety: "Site safety", photos: "Photos", variations: "Variations", signoff: "Sign-off", warranty: "Warranty", messages: "Messages",
};
const SOURCE: Record<string, string> = { website: "Website", instant_quote: "Instant quote", gmail: "Gmail", email: "Email", manual: "Added by hand", phone: "Phone", referral: "Referral", door_knock: "Door knock" };
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function recordDate(iso: string, tz: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: tz });
}

/** Which line the job is waiting on, from where it's up to. Null when nothing is (closed, lost). */
export function focusKey(d: RecordInput, now = new Date()): RecordKey | null {
  const j = d.job;
  if (j.stage === "lost" || j.stage === "paid") return null;
  const measured = Boolean(d.roof) || d.files.plans > 0;
  if (["lead", "inspection"].includes(j.stage) && !d.quote) {
    if (j.inspection_at && new Date(j.inspection_at).getTime() > now.getTime() - 3 * 3600_000) return "inspection";
    return measured ? "quote" : "plans";
  }
  if (!d.quote || d.quote.status === "draft") return "quote";
  if (d.quote.status === "sent") return "contract";
  if (["sold", "scheduled"].includes(j.stage) && d.sold) {
    const s = d.sold;
    if ((s.coolingOff.applies && !s.coolingOff.over) || (s.insurance.required && !s.insurance.done)) return "legal";
    if (!s.deposit) return "payments";
    if (s.orders.total === 0 || s.orders.confirmed + s.orders.delivered < s.orders.total) return "materials";
    return "crew";
  }
  if (d.quote.status === "accepted" && d.column === "quoted") return "payments"; // signed, deposit not in yet
  if (j.stage === "in_progress" && !d.extra?.variations.some((v) => v.status === "draft" || v.status === "sent")) return d.files.photos > 0 ? "payments" : "photos";
  if (j.stage === "in_progress" && d.extra?.variations.some((v) => v.status === "draft" || v.status === "sent")) return "variations";
  if (j.stage === "completed") {
    if (d.invoices.some((i) => i.balance > 0)) return "payments";
    if (d.build?.deliveries.some((o) => !o.paidAt)) return "materials";
    if (d.extra && !d.extra.signoff) return "signoff";
    if (!d.wrap?.handoverSentAt) return "warranty";
  }
  return null;
}

export function jobRecord(d: RecordInput, now = new Date()): RecordRow[] {
  const j = d.job;
  const tz = j.tz;
  const day = (iso: string) => recordDate(iso, tz);
  const base = `/app/jobs/${j.id}`;
  const q = d.quote;
  const rows: Omit<RecordRow, "state">[] = [];
  const has = new Set<RecordKey>();
  const add = (key: RecordKey, value: string | null, href?: string) => {
    if (value) has.add(key);
    rows.push({ key, label: LABEL[key], value: value ?? "", href });
  };

  // Lead
  const received = j.lead_received_at ?? j.created_at;
  add("lead", [SOURCE[j.lead_source ?? ""] ?? (j.lead_source ? j.lead_source.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Lead"), day(received)].join(" · "), base);

  // Plans: what the quote was measured from.
  const area = d.roof?.summary.trueArea ?? 0;
  const planDocs = (d.docs ?? []).filter((f) => f.category === "plans");
  const currentPlan = planDocs.find((f) => !f.superseded && !f.report);
  const report = planDocs.find((f) => f.report);
  const plans = [
    currentPlan?.revision ?? (d.files.plans ? plural(d.files.plans - (report ? 1 : 0) || d.files.plans, "plan") : null),
    report ? `${report.report?.source ?? "Roof"} report` : null,
    area > 0 ? `${Math.round(area * 10) / 10} m²` : null,
    d.roof && d.roof.summary.maxPitch > 0 ? `${Math.round(d.roof.summary.maxPitch)}°` : null,
    !d.files.plans && area > 0 ? (q?.measurement_source === "satellite" ? "satellite" : "measured") : null,
  ].filter(Boolean).join(" · ");
  add("plans", plans || null, `${base}/files`);

  // Inspection: booked, done, or not needed because the roof was measured another way.
  const insp = j.inspection_at;
  add("inspection", insp
    ? (new Date(insp).getTime() > now.getTime() ? `Booked ${day(insp)}` : `Done ${day(insp)}`)
    : (area > 0 || d.files.plans > 0) && q ? "Not needed · measured" : null, base);

  // Quote
  const views = d.quoting?.sent?.views ?? 0;
  add("quote", !q ? null
    : q.status === "draft" ? `Draft · ${aud(q.total)} · not sent`
    : q.status === "accepted" ? `${aud(q.total)} · accepted`
    : `${aud(q.total)} · sent${q.sent_at ? ` ${day(q.sent_at)}` : ""}${views ? ` · viewed ${views}×` : ""}`,
    q ? `/app/estimates/${q.id}` : undefined);

  // Contract
  add("contract", q?.status === "accepted" ? `Signed${q.accepted_name ? ` by ${q.accepted_name.split(" ")[0]}` : ""}${q.accepted_at ? ` · ${day(q.accepted_at)}` : ""}` : null, q ? `/app/estimates/${q.id}` : undefined);

  // Legal steps (state rules: cooling-off, home warranty insurance, notices)
  const s = d.sold;
  const legalBits = s ? [
    s.coolingOff.applies ? (s.coolingOff.over ? "Cooling-off ended" : `Cooling-off to ${s.coolingOff.ends ? day(s.coolingOff.ends) : "—"}`) : null,
    s.insurance.required ? (s.insurance.done ? "home warranty paid" : "home warranty to pay") : null,
  ].filter(Boolean).join(" · ") : "";
  const legal = legalBits || (d.compliance && d.compliance.total > 0 && q?.status === "accepted" ? `${d.compliance.done} of ${d.compliance.total} done` : "");
  add("legal", legal ? legal.replace(/^./, (c) => c.toUpperCase()) : null, `${base}/compliance`);

  // Payments
  const invs = d.invoices;
  const paidCount = invs.filter((i) => i.balance <= 0 && i.total > 0).length;
  const paid = invs.reduce((t, i) => t + i.paid, 0);
  add("payments", invs.length ? `${paidCount} of ${invs.length} · ${aud(paid)} paid` : s?.deposit ? `Deposit ${aud(s.deposit.amount)} paid` : null, `${base}/billing`);

  // Materials
  const dl = d.build?.deliveries ?? [];
  const o = s?.orders;
  add("materials", dl.length
    ? `${dl[0].supplier.split(" (")[0]}${dl.length > 1 ? ` +${dl.length - 1}` : ""} · ${dl.every((x) => x.paidAt) ? "invoices paid" : dl.every((x) => x.deliveredAt) ? "delivered" : "ordered"}`
    : o && o.total > 0 ? `${o.suppliers[0] ?? "Supplier"} · ${plural(o.items, "item")} · ${o.delivered === o.total ? "delivered" : o.confirmed + o.delivered === o.total ? "confirmed" : "ordered"}`
    : null, `/app/materials/${j.id}`);

  // Crew
  const crewName = j.crew?.name ?? s?.crew.name ?? null;
  const start = j.scheduled_start ?? s?.crew.start ?? null;
  const end = j.scheduled_end ?? s?.crew.end ?? null;
  add("crew", crewName || start ? [crewName, start ? `${day(start)}${end && end !== start ? ` – ${day(end)}` : ""}` : null].filter(Boolean).join(" · ") : null, "/app/schedule");

  // Site safety: the SWMS (compliance item) and the days the crew logged on site.
  const x = d.extra;
  const swmsDone = x?.swms?.status === "done";
  const days = x?.siteDays.days ?? 0;
  add("safety", swmsDone || days ? [swmsDone ? `SWMS${x?.swms?.by ? ` by ${x.swms.by.split(" ")[0]}` : " done"}` : null, days ? `${plural(days, "day")} logged` : null].filter(Boolean).join(" · ") : null, `${base}/compliance`);

  // Photos, by stage when they're sorted.
  const ps = x?.photoStages;
  add("photos", d.files.photos ? (ps && ps.before + ps.during + ps.after > 0 ? [ps.before ? `Before ${ps.before}` : null, ps.during ? `during ${ps.during}` : null, ps.after ? `after ${ps.after}` : null].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase()) : plural(d.files.photos, "photo")) : null, `${base}/files`);

  // Variations (change orders)
  const vs = x?.variations ?? [];
  const signedV = vs.filter((v) => v.status === "approved");
  const extraTotal = signedV.reduce((t, v) => t + v.amount, 0);
  const waitingV = vs.length - signedV.length;
  add("variations", vs.length ? [plural(vs.length, "variation"), signedV.length ? `+${aud(extraTotal)}` : null, waitingV ? `${waitingV} not signed` : signedV.length ? "all signed" : null].filter(Boolean).join(" · ") : null, `${base}/change-orders`);

  // Sign-off: the homeowner's final walkthrough signature; open touch-ups (punch list) show here too.
  const so = x?.signoff;
  const open = x?.defects.open ?? 0;
  add("signoff", so ? `Signed${so.name ? ` by ${so.name.split(" ")[0]}` : ""} · ${day(so.at)}${open ? ` · ${plural(open, "touch-up")} open` : ""}` : null, `${base}/closeout`);

  // Warranty & handover
  const w = d.wrap;
  add("warranty", w?.handoverSentAt ? `Handover sent ${day(w.handoverSentAt)}${w.warrantyRegisteredAt ? " · registered" : ""}` : null, `${base}/closeout`);

  // Messages
  const m = d.messages;
  const mc = x?.messageCount ?? m.length;
  add("messages", m.length ? `${plural(mc, "message")} · latest ${day(m[0].at)}` : null, base);

  const focus = focusKey(d, now);
  return rows.map((r) => ({ ...r, state: r.key === focus ? "now" : has.has(r.key) ? "done" : "later" }));
}

/** What the "now" line says when there's nothing on file yet. */
export const NOW_EMPTY: Partial<Record<RecordKey, string>> = {
  plans: "Not measured · plans, satellite or inspection",
  quote: "Not started",
  contract: "Waiting for them to sign",
  legal: "To do before work starts",
  payments: "Deposit not in yet",
  materials: "Not ordered yet",
  crew: "Not booked yet",
  photos: "No photos yet",
  variations: "Not sent to sign yet",
  signoff: "Not signed yet",
  safety: "SWMS not done yet",
  warranty: "Handover pack not sent",
};
