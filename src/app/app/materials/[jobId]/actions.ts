"use server";
// The Sold stage's material order page: one order per supplier, saved together, sent one email per supplier.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { sendEmail } from "@/lib/notify";
import { acceptedEstimate } from "@/lib/production-data";
import { buildSupplierEmail, groupFor, loadMaterials, orderCode } from "@/lib/supplier-orders-server";

const touch = (jobId: string) => { revalidatePath(`/app/materials/${jobId}`); revalidatePath("/app/jobs", "layout"); };
const senderName = (ctx: Awaited<ReturnType<typeof requireMoneyAccess>>) => ctx.memberships.find((m) => m.org_id === ctx.org.id)?.full_name || ctx.user.fullName || ctx.org.name;

/** Fill the order from the signed quote: every material line (and extras they added) under the main supplier. */
export async function fillFromQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const jobId = String(fd.get("job_id") ?? "");
  const { data: job } = await supabase.from("jobs").select("id, delivery_type, customers(name)").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const { data: existing } = await supabase.from("material_orders").select("id, material_order_items(id)").eq("job_id", jobId).neq("status", "cancelled");
  if ((existing ?? []).some((o) => (o.material_order_items as unknown[] | null)?.length)) return { error: "This job already has orders. Add items to them instead." };
  const est = await acceptedEstimate(supabase, jobId);
  if (!est) return { error: "There's no signed quote on this job yet." };
  const first = ((job.customers as unknown as { name: string } | null)?.name ?? "").split(" ")[0] || "Customer";
  const lines = est.items.filter((i) => i.category !== "labor" && i.quantity > 0);
  if (!lines.length) return { error: "The signed quote has no material lines." };
  // Main supplier: the one the quote was priced from, else the company default, else the first one they use.
  const { data: q } = await supabase.from("estimates").select("org_supplier_id").eq("job_id", jobId).eq("status", "accepted").order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const cols = "id, branch_name, branch_email, branch_phone, custom_name, suppliers(name)";
  const mainId = (q as { org_supplier_id?: string | null } | null)?.org_supplier_id ?? org.default_supplier_id ?? null;
  let { data: os } = mainId ? await supabase.from("org_suppliers").select(cols).eq("id", mainId).maybeSingle() : { data: null };
  if (!os) ({ data: os } = await supabase.from("org_suppliers").select(cols).eq("org_id", org.id).order("created_at").limit(1).maybeSingle());
  // Delivery details typed before the order existed.
  let dv: { date?: string | null; time?: string | null; type?: string; contact?: string | null; notes?: string | null } = {};
  try { dv = JSON.parse(String(fd.get("delivery") ?? "{}")) ?? {}; } catch { dv = {}; }
  const okType = ["roof_load", "ground_drop", "crane", "pickup"].includes(dv.type ?? "") ? dv.type! : job.delivery_type === "ground_drop" ? "ground_drop" : "crane";
  const name = (os?.suppliers as unknown as { name: string } | null)?.name ?? os?.custom_name ?? "Supplier";
  for (const o of existing ?? []) await supabase.from("material_orders").delete().eq("id", o.id).eq("status", "draft");
  const { data: order, error } = await supabase.from("material_orders").insert({
    org_id: org.id, job_id: jobId, org_supplier_id: os?.id ?? null, supplier: name, branch: os?.branch_name ?? null, branch_email: os?.branch_email ?? null,
    branch_phone: os?.branch_phone ?? null, po_number: orderCode(est.number, name), delivery_type: okType,
    delivery_date: dv.date && /^\d{4}-\d{2}-\d{2}$/.test(dv.date) ? dv.date : null, delivery_time: dv.time?.slice(0, 30) || "7 am",
    site_contact: dv.contact?.slice(0, 120) || null, ...(dv.notes ? { notes: dv.notes.slice(0, 2000) } : {}), attach_plans: true, attach_report: true, created_by: user.id,
  }).select("id").single();
  if (error || !order) return { error: friendly(error) };
  const ins = await supabase.from("material_order_items").insert(lines.map((i, n) => ({
    org_id: org.id, order_id: order.id, position: n, description: i.description, quantity: i.quantity, unit: i.unit, unit_cost: i.unit_cost,
    calc_key: i.calc_key, group_label: groupFor(i.calc_key, i.description, i.extra_status === "added", first),
  })));
  if (ins.error) return { error: friendly(ins.error) };
  touch(jobId);
  return { ok: `Filled ${lines.length} items from quote #${est.number}.` };
}

const Line = z.object({
  description: z.string().trim().min(1, "Every item needs a name.").max(300),
  spec: z.string().trim().max(160).nullable(),
  sku: z.string().trim().max(80).nullable(),
  quantity: z.coerce.number().finite().min(0).max(100000),
  unit: z.string().trim().max(20),
  length_m: z.coerce.number().positive().max(99).nullable(),
  unit_cost: z.coerce.number().finite().min(0).max(1000000),
  group_label: z.string().trim().max(60).nullable(),
  calc_key: z.string().max(40).nullable(),
  supplier_price_item_id: z.uuid().nullable(),
});
const Save = z.object({
  jobId: z.uuid(),
  delivery: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), time: z.string().trim().max(30).nullable(), type: z.enum(["roof_load", "ground_drop", "crane", "pickup"]), contact: z.string().trim().max(120).nullable(), notes: z.string().trim().max(2000).nullable() }),
  orders: z.array(z.object({ id: z.uuid().nullable(), key: z.string().max(60), orgSupplierId: z.uuid().nullable(), items: z.array(Line).max(300) })).max(20),
});
export type SaveMaterialsInput = z.input<typeof Save>;

/** Save every supplier's order at once (moving a line to another supplier moves it between orders). */
export async function saveMaterials(input: SaveMaterialsInput): Promise<ActionResult & { ids?: Record<string, string> }> {
  const p = Save.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the order." };
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const { jobId, delivery, orders } = p.data;
  const [{ data: current }, est] = await Promise.all([
    supabase.from("material_orders").select("id, status, org_supplier_id").eq("job_id", jobId).neq("status", "cancelled"),
    acceptedEstimate(supabase, jobId),
  ]);
  const cur = new Map((current ?? []).map((o) => [o.id, o]));
  const osIds = [...new Set(orders.map((o) => o.orgSupplierId).filter((x): x is string => Boolean(x)))];
  const { data: oss } = osIds.length ? await supabase.from("org_suppliers").select("id, branch_name, branch_email, branch_phone, custom_name, suppliers(name)").in("id", osIds) : { data: [] };
  const osById = new Map((oss ?? []).map((o) => [o.id, o]));
  const header = { delivery_date: delivery.date, delivery_time: delivery.time, delivery_type: delivery.type, site_contact: delivery.contact, notes: delivery.notes };
  const ids: Record<string, string> = {};
  const kept = new Set<string>();
  for (const o of orders) {
    const os = o.orgSupplierId ? osById.get(o.orgSupplierId) : null;
    if (o.orgSupplierId && !os) return { error: "Pick one of your suppliers." };
    const name = (os?.suppliers as unknown as { name: string } | null)?.name ?? os?.custom_name ?? "Supplier";
    let id = o.id && cur.has(o.id) ? o.id : null;
    if (id && cur.get(id)!.status === "delivered") { kept.add(id); ids[o.key] = id; continue; }
    const sup = os ? { org_supplier_id: os.id, supplier: name, branch: os.branch_name, branch_email: os.branch_email, branch_phone: os.branch_phone } : {};
    if (id) {
      const changed = (cur.get(id)!.org_supplier_id ?? null) !== (o.orgSupplierId ?? null);
      const { error } = await supabase.from("material_orders").update({ ...header, ...(changed ? { ...sup, po_number: orderCode(est?.number ?? null, name) } : {}) }).eq("id", id);
      if (error) return { error: friendly(error) };
    } else {
      if (!o.items.length) continue;
      const { data: row, error } = await supabase.from("material_orders").insert({
        org_id: org.id, job_id: jobId, ...sup, supplier: name, po_number: orderCode(est?.number ?? null, name), ...header,
        attach_plans: false, attach_report: false, created_by: user.id,
      }).select("id").single();
      if (error || !row) return { error: friendly(error) };
      id = row.id;
    }
    kept.add(id!); ids[o.key] = id!;
    const del = await supabase.from("material_order_items").delete().eq("order_id", id!);
    if (del.error) return { error: friendly(del.error) };
    if (o.items.length) {
      const ins = await supabase.from("material_order_items").insert(o.items.map((i, n) => ({ ...i, org_id: org.id, order_id: id!, position: n })));
      if (ins.error) return { error: friendly(ins.error) };
    }
  }
  // Orders no longer on the page: drafts go; sent/confirmed ones with no lines left are cancelled.
  for (const [id, o] of cur) {
    if (kept.has(id)) continue;
    if (o.status === "draft") await supabase.from("material_orders").delete().eq("id", id);
    else if (o.status !== "delivered") await supabase.from("material_orders").update({ status: "cancelled" }).eq("id", id);
  }
  // Not the order page itself: it already shows what was saved, and a refresh mid-typing would undo keystrokes.
  revalidatePath("/app/jobs", "layout");
  return { ok: "Saved.", ids };
}

/** Use a directory supplier (nearest branch) on this job, adding it to the business's suppliers if needed. */
export async function linkSupplier(input: { supplierId: string; branchId: string | null }): Promise<ActionResult & { orgSupplierId?: string; name?: string; branch?: string | null; email?: string | null }> {
  const { supabase, org } = await requireMoneyAccess();
  const { data: s } = await supabase.from("suppliers").select("id, name").eq("id", input.supplierId).maybeSingle();
  if (!s) return { error: "Supplier not found." };
  const { data: b } = input.branchId ? await supabase.from("supplier_branches").select("id, suburb, phone, supplier_id").eq("id", input.branchId).maybeSingle() : { data: null };
  if (b && b.supplier_id !== s.id) return { error: "That branch belongs to another supplier." };
  const { data: ex } = await supabase.from("org_suppliers").select("id, branch_name, branch_email").eq("org_id", org.id).eq("supplier_id", s.id).maybeSingle();
  if (ex) return { ok: "Linked.", orgSupplierId: ex.id, name: s.name, branch: ex.branch_name, email: ex.branch_email };
  const { data: row, error } = await supabase.from("org_suppliers").insert({ org_id: org.id, supplier_id: s.id, branch_id: b?.id ?? null, branch_name: b?.suburb ?? null, branch_phone: b?.phone ?? null }).select("id").single();
  if (error || !row) return { error: friendly(error) };
  return { ok: "Linked.", orgSupplierId: row.id, name: s.name, branch: b?.suburb ?? null, email: null };
}

/** The branch email to send this supplier's orders to (saved on the supplier too, for next time). */
export async function setSupplierEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const orderId = String(fd.get("order_id") ?? "");
  const email = String(fd.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the branch's email address." };
  const { data: o } = await supabase.from("material_orders").select("id, job_id, org_supplier_id").eq("id", orderId).maybeSingle();
  if (!o) return { error: "Order not found." };
  await supabase.from("material_orders").update({ branch_email: email }).eq("id", o.id);
  if (o.org_supplier_id) await supabase.from("org_suppliers").update({ branch_email: email }).eq("id", o.org_supplier_id);
  touch(o.job_id);
  return { ok: "Saved." };
}

/** Which files go with this supplier's email (plans, roof report, others from the job). */
export async function setOrderAttachments(input: { orderId: string; plans: boolean; report: boolean; fileIds: string[] }): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const { data: o } = await supabase.from("material_orders").select("id, job_id").eq("id", input.orderId).maybeSingle();
  if (!o) return { error: "Order not found." };
  const ids = z.array(z.uuid()).max(30).safeParse(input.fileIds);
  if (!ids.success) return { error: "Pick files from this job." };
  if (ids.data.length) {
    const { data: f } = await supabase.from("job_files").select("id").eq("job_id", o.job_id).in("id", ids.data);
    if ((f ?? []).length !== ids.data.length) return { error: "Pick files from this job." };
  }
  const { error } = await supabase.from("material_orders").update({ attach_plans: input.plans, attach_report: input.report, attach_file_ids: ids.data }).eq("id", o.id);
  if (error) return { error: friendly(error) };
  touch(o.job_id);
  return { ok: "Saved." };
}

async function sendOne(ctx: Awaited<ReturnType<typeof requireMoneyAccess>>, data: NonNullable<Awaited<ReturnType<typeof loadMaterials>>>, orderId: string): Promise<{ ok: boolean; msg: string }> {
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, msg: "Order not found." };
  if (!order.items.length) return { ok: false, msg: `${order.supplier}: add an item first.` };
  if (!order.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return { ok: false, msg: `${order.supplier}: add their email first.` };
  if (!data.delivery.date) return { ok: false, msg: "Set the delivery date first." };
  const { email, attachments } = await buildSupplierEmail(ctx.supabase, ctx.org, data, order, senderName(ctx), { withFiles: true });
  const r = await sendEmail(ctx.supabase, {
    orgId: ctx.org.id, jobId: data.job.id, to: order.email, subject: email.subject, html: email.html, text: email.text,
    replyTo: ctx.org.email, fromName: ctx.org.name, attachments,
  });
  if (r.status === "failed") return { ok: false, msg: `${order.supplier}: ${r.error ?? "email failed"}` };
  await ctx.supabase.from("material_orders").update({ status: order.status === "draft" ? "sent" : order.status, sent_at: new Date().toISOString() }).eq("id", order.id);
  await ctx.supabase.from("jobs").update({ materials_status: "ordered" }).eq("id", data.job.id).eq("materials_status", "not_ordered");
  return { ok: true, msg: r.status === "sent" ? `Sent to ${order.supplier}.` : r.status === "paused" ? `${order.supplier} marked sent (test mode: not emailed).` : `${order.supplier} marked sent (email isn't set up here).` };
}

/** Send one supplier's order. */
export async function sendSupplierOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const jobId = String(fd.get("job_id") ?? "");
  const data = await loadMaterials(ctx.supabase, ctx.org, jobId);
  if (!data) return { error: "Job not found." };
  const r = await sendOne(ctx, data, String(fd.get("order_id") ?? ""));
  touch(jobId);
  return r.ok ? { ok: r.msg } : { error: r.msg };
}

/** Send every order that's ready (has items and an email, not sent yet). */
export async function sendReadyOrders(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const jobId = String(fd.get("job_id") ?? "");
  const data = await loadMaterials(ctx.supabase, ctx.org, jobId);
  if (!data) return { error: "Job not found." };
  const ready = data.orders.filter((o) => o.status === "draft" && o.items.length && o.email);
  if (!ready.length) return { error: "Nothing ready to send. Add an email to a supplier first." };
  const out = [];
  for (const o of ready) out.push(await sendOne(ctx, data, o.id));
  touch(jobId);
  const bad = out.filter((x) => !x.ok);
  return bad.length ? { error: bad.map((x) => x.msg).join(" ") } : { ok: out.map((x) => x.msg).join(" ") };
}
