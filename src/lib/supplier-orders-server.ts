import "server-only";
// A job's material orders, one per supplier (Sold stage), and what each supplier's email looks like.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSupplierChoices } from "@/app/app/estimates/[id]/engine-data";
import { formatAbn } from "./au";
import { roofShape } from "./docket-shape";
import { siteUrl } from "./format";
import { acceptedEstimate } from "./production-data";
import { normalizeMeasurements, summarize } from "./roof";
import { roofReportPdf, supplierOrderEmail, supplierOrderPdf, type OrderLineDoc, type RoofReportDoc, type SupplierOrderDoc } from "./supplier-order-doc";
import type { Organization } from "./types";

export type MatLine = { id?: string; description: string; spec: string | null; sku: string | null; quantity: number; unit: string; length_m: number | null; unit_cost: number; group_label: string | null; calc_key: string | null; supplier_price_item_id: string | null };
export type MatOrder = {
  id: string; status: string; orgSupplierId: string | null; supplierId: string | null; supplier: string; branch: string | null; email: string | null; account: string | null;
  code: string; sentAt: string | null; confirmedAt: string | null; openedAt: string | null; supplierRef: string | null; supplierNote: string | null; supplierDate: string | null;
  attachPlans: boolean; attachReport: boolean; attachFileIds: string[]; publicToken: string; items: MatLine[];
};
export type MatFile = { id: string; name: string; kind: string; category: string; storage_path: string; mime: string | null };

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
import { orderCode } from "./supplier-order-doc";
export { orderCode };

/** Group a line under a small heading on the order (by calc key, else by words in the description). */
export function groupFor(calcKey: string | null, description: string, extra: boolean, first: string): string {
  if (extra) return `Extras ${first} added`;
  const k = calcKey ?? "", d = description.toLowerCase();
  if (k === "metal_sheet" || /custom orb|trimdek|klip|spandek|corrugated|sheet/.test(d)) return "Roof sheets";
  if (/capping|flashing|valley|barge|apron|ridge|hip/.test(k + " " + d)) return "Capping & flashings";
  if (/sarking|anticon|blanket|mesh|batten/.test(k + " " + d)) return "Underlay, mesh & battens";
  if (/screw|rivet|silicone|seal|closure|fix/.test(k + " " + d)) return "Fixings & sealants";
  if (/gutter|downpipe|bracket|stop end|outlet|pipe clip/.test(k + " " + d)) return "Gutters & downpipes";
  if (/tile|bedding|pointing/.test(k + " " + d)) return "Tiles & bedding";
  if (/skip|bin|hire|scaffold|edge protection/.test(k + " " + d)) return "Hire & site";
  return "Other";
}

export async function loadMaterials(supabase: SupabaseClient, org: Organization, jobId: string) {
  const [{ data: job }, { data: orders }, { data: files }, est] = await Promise.all([
    supabase.from("jobs").select("id, title, stage, site_address, gate_code, site_hazards, delivery_type, scheduled_start, customers(name, phone)").eq("id", jobId).maybeSingle(),
    supabase.from("material_orders")
      .select("*, material_order_items(*), org_suppliers(id, supplier_id, account_number, branch_name, branch_email, branch_phone, custom_name, suppliers(name))")
      .eq("job_id", jobId).neq("status", "cancelled").order("created_at"),
    supabase.from("job_files").select("id, kind, category, caption, storage_path, mime_type").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300),
    acceptedEstimate(supabase, jobId),
  ]);
  if (!job) return null;
  const quoteNo = est?.number ?? null;
  type OS = { id: string; supplier_id: string | null; account_number: string | null; branch_name: string | null; branch_email: string | null; custom_name: string | null; suppliers: unknown };
  type OI = { id: string; position: number; description: string; spec: string | null; sku: string | null; quantity: number; unit: string; length_m: number | null; unit_cost: number; group_label: string | null; calc_key: string | null; supplier_price_item_id: string | null };
  type OR = { id: string; status: string; supplier: string; branch: string | null; branch_email: string | null; po_number: string | null; sent_at: string | null; confirmed_at: string | null; opened_at: string | null; supplier_ref: string | null; supplier_note: string | null; supplier_delivery_date: string | null; attach_plans: boolean; attach_report: boolean; attach_file_ids: string[]; public_token: string; delivery_date: string | null; delivery_time: string | null; delivery_type: string; site_contact: string | null; notes: string | null; org_suppliers: unknown; material_order_items: OI[] };
  const rows = (orders ?? []) as unknown as OR[];
  const list: MatOrder[] = rows.map((o) => {
    const os = one(o.org_suppliers as OS | OS[]);
    return {
      id: o.id, status: o.status, orgSupplierId: os?.id ?? null, supplierId: os?.supplier_id ?? null, supplier: o.supplier,
      branch: o.branch ?? os?.branch_name ?? null, email: o.branch_email ?? os?.branch_email ?? null, account: os?.account_number ?? null,
      code: o.po_number || orderCode(quoteNo, o.supplier), sentAt: o.sent_at, confirmedAt: o.confirmed_at, openedAt: o.opened_at,
      supplierRef: o.supplier_ref, supplierNote: o.supplier_note, supplierDate: o.supplier_delivery_date,
      attachPlans: o.attach_plans, attachReport: o.attach_report, attachFileIds: o.attach_file_ids ?? [], publicToken: o.public_token,
      items: [...(o.material_order_items ?? [])].sort((a, b) => a.position - b.position).map((i) => ({
        id: i.id, description: i.description, spec: i.spec, sku: i.sku, quantity: Number(i.quantity), unit: i.unit, length_m: i.length_m === null ? null : Number(i.length_m),
        unit_cost: Number(i.unit_cost), group_label: i.group_label, calc_key: i.calc_key, supplier_price_item_id: i.supplier_price_item_id,
      })),
    };
  });
  const first = rows[0];
  const delivery = {
    date: first?.delivery_date ?? null, time: first?.delivery_time ?? "7 am", type: first?.delivery_type ?? (job.delivery_type === "ground_drop" ? "ground_drop" : "crane"),
    contact: first?.site_contact ?? null, notes: first?.notes ?? ([job.site_hazards, job.gate_code ? `Gate code ${job.gate_code}` : null].filter(Boolean).join(". ") || null),
  };
  const fileRows: MatFile[] = ((files ?? []) as { id: string; kind: string; category: string; caption: string | null; storage_path: string; mime_type: string | null }[])
    .filter((f) => f.kind === "document" || f.category === "plans")
    .map((f) => ({ id: f.id, name: (f.caption?.trim() || f.storage_path.split("/").pop() || "File").slice(0, 120), kind: f.kind, category: f.category, storage_path: f.storage_path, mime: f.mime_type }));
  const plans = fileRows.filter((f) => f.category === "plans" || /plan/i.test(f.name));
  const quoted = est ? est.items.filter((i) => i.category !== "labor").reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0) : null;
  const choices = await loadSupplierChoices(supabase, org, org.default_supplier_id ?? null);
  const c = one(job.customers as unknown as { name: string; phone: string | null });
  return {
    job: { id: job.id, title: job.title, stage: job.stage, address: job.site_address, customer: c?.name ?? "", firstName: (c?.name ?? "").split(" ")[0] || "the customer", scheduledStart: job.scheduled_start },
    quoteNo, orders: list, delivery, files: fileRows, plans, roof: roofFrom(est?.measurements), quotedCost: quoted === null ? null : Math.round(quoted * 100) / 100,
    choices: choices.choices, nearLabel: choices.nearLabel, mainOrgSupplierId: org.default_supplier_id ?? null,
  };
}

export function roofFrom(measurements: unknown): RoofReportDoc | null {
  if (!measurements) return null;
  const m = normalizeMeasurements(measurements);
  const s = summarize(m);
  if (!(s.trueArea > 0)) return null;
  const { panels } = roofShape(measurements);
  return {
    area: s.trueArea, planArea: s.planArea, pitch: s.maxPitch, faces: panels ?? m.sections.filter((x) => x.area > 0).length,
    lengths: [["Ridges", m.ridge, "m"], ["Hips", m.hip, "m"], ["Valleys", m.valley, "m"], ["Gutter", m.eave, "m"], ["Barge", m.barge, "m"], ["Apron", m.apron, "m"], ["Downpipes", m.downpipes, ""]],
  };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadMaterials>>>;

/** One supplier's email + attachments, exactly as it will be sent. */
export async function buildSupplierEmail(supabase: SupabaseClient, org: Organization, data: Loaded, order: MatOrder, sender: string, opts: { withFiles: boolean }) {
  const plansOn = order.attachPlans && data.plans.length > 0;
  const reportOn = order.attachReport && Boolean(data.roof);
  const extra = data.files.filter((f) => order.attachFileIds.includes(f.id) && !(plansOn && data.plans.some((p) => p.id === f.id)));
  const pdfName = `Order ${order.code}.pdf`;
  const names = [pdfName, ...(plansOn ? data.plans.map((p) => p.name) : []), ...(reportOn ? ["Roof report.pdf"] : []), ...extra.map((f) => f.name)];
  const doc: SupplierOrderDoc = {
    code: order.code, supplier: order.supplier, branch: order.branch, account: order.account,
    org: { name: org.name, phone: org.phone, email: org.email, abn: org.abn ? formatAbn(org.abn) : null }, sender,
    job: { customer: data.job.customer, title: data.job.title, address: data.job.address },
    delivery: data.delivery, confirmUrl: `${siteUrl()}/o/${order.publicToken}`, logoUrl: `${siteUrl()}/email/mark.png`,
    attachNames: names, withPlans: plansOn || reportOn,
    items: order.items.map((i): OrderLineDoc => ({ description: i.description, spec: i.spec, sku: i.sku, quantity: i.quantity, unit: i.unit, length_m: i.length_m, group_label: i.group_label })),
  };
  const email = supplierOrderEmail(doc);
  if (!opts.withFiles) return { email, names, attachments: [] as { filename: string; content?: string; path?: string }[] };
  const attachments: { filename: string; content?: string; path?: string }[] = [{ filename: pdfName, content: Buffer.from(await supplierOrderPdf(doc)).toString("base64") }];
  if (reportOn && data.roof) attachments.push({ filename: "Roof report.pdf", content: Buffer.from(await roofReportPdf(doc, data.roof)).toString("base64") });
  const fileList = [...(plansOn ? data.plans : []), ...extra];
  if (fileList.length) {
    const { data: signed } = await supabase.storage.from("job-files").createSignedUrls(fileList.map((f) => f.storage_path), 60 * 60 * 24 * 7);
    const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const f of fileList) { const u = urls.get(f.storage_path); if (u) attachments.push({ filename: f.name.includes(".") ? f.name : `${f.name}.pdf`, path: u }); }
  }
  return { email, names, attachments };
}
