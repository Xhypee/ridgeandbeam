"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly, num, str } from "@/lib/form";
import { sendEmail } from "@/lib/notify";
import type { ActionResult } from "@/components/action-form";
import { acceptedEstimate } from "@/lib/production-data";
import { netCredit, orderEmail, orderTotal, RETURN_STATUSES, SUPPLIERS } from "@/lib/production-orders";

const isoRe = /^\d{4}-\d{2}-\d{2}$/;

function touch(jobId?: string | null, orderId?: string) {
  revalidatePath("/app/orders");
  if (orderId) revalidatePath(`/app/orders/${orderId}`);
  if (jobId) revalidatePath(`/app/jobs/${jobId}`, "layout");
  revalidatePath("/app/schedule");
}

/** New order for a job: lines from the accepted estimate's material takeoff, or blank. */
export async function createOrder(fd: FormData) {
  const { supabase, org, user } = await requireMoneyAccess();
  const jobId = String(fd.get("job_id"));
  const fromEstimate = fd.get("mode") !== "blank";
  const { data: job } = await supabase.from("jobs").select("id, shingle_color, delivery_type").eq("id", jobId).maybeSingle();
  if (!job) throw new Error("Job not found.");
  const est = fromEstimate ? await acceptedEstimate(supabase, jobId) : null;
  const { data: order, error } = await supabase.from("material_orders").insert({
    org_id: org.id, job_id: jobId, supplier: "ABC Supply", color: job.shingle_color, delivery_type: job.delivery_type, created_by: user.id,
  }).select("id").single();
  if (error) throw new Error(friendly(error));
  const lines = (est?.items ?? []).filter((i) => i.category === "material" && i.quantity > 0);
  if (lines.length) {
    const ins = await supabase.from("material_order_items").insert(lines.map((i, n) => ({
      org_id: org.id, order_id: order.id, position: n, description: i.description, quantity: i.quantity, unit: i.unit, unit_cost: i.unit_cost,
    })));
    if (ins.error) throw new Error(friendly(ins.error));
  }
  touch(jobId);
  redirect(`/app/orders/${order.id}${fromEstimate && !lines.length ? "?empty=1" : ""}`);
}

const LineSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description.").max(300),
  sku: z.string().trim().max(60).nullable().transform((v) => v || null),
  quantity: z.coerce.number().finite().min(0),
  unit: z.string().trim().max(20).default("ea"),
  unit_cost: z.coerce.number().finite().min(0),
});
const OrderSchema = z.object({
  id: z.uuid(),
  supplier: z.enum(SUPPLIERS),
  branch: z.string().trim().max(120).nullable(),
  branch_email: z.union([z.literal(""), z.email("Enter a valid branch email.")]).nullable(),
  branch_phone: z.string().trim().max(40).nullable(),
  po_number: z.string().trim().max(60).nullable(),
  color: z.string().trim().max(120).nullable(),
  delivery_date: z.string().regex(isoRe).nullable().or(z.literal("").transform(() => null)),
  delivery_type: z.enum(["roof_load", "ground_drop"]),
  notes: z.string().max(2000).nullable(),
  items: z.array(LineSchema).max(200),
});
export type SaveOrderInput = z.input<typeof OrderSchema>;

export async function saveOrder(input: SaveOrderInput): Promise<ActionResult> {
  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid order." };
  const { supabase, org } = await requireMoneyAccess();
  const o = parsed.data;
  const { data: existing } = await supabase.from("material_orders").select("id, job_id, status").eq("id", o.id).maybeSingle();
  if (!existing) return { error: "Order not found." };
  if (existing.status === "delivered") return { error: "Delivered orders are locked. Log leftovers as returns instead." };
  const { error } = await supabase.from("material_orders").update({
    supplier: o.supplier, branch: o.branch || null, branch_email: o.branch_email || null, branch_phone: o.branch_phone || null,
    po_number: o.po_number || null, color: o.color || null, delivery_date: o.delivery_date, delivery_type: o.delivery_type, notes: o.notes || null,
  }).eq("id", o.id);
  if (error) return { error: friendly(error) };
  const del = await supabase.from("material_order_items").delete().eq("order_id", o.id);
  if (del.error) return { error: friendly(del.error) };
  if (o.items.length) {
    const ins = await supabase.from("material_order_items").insert(o.items.map((it, i) => ({ ...it, org_id: org.id, order_id: o.id, position: i })));
    if (ins.error) return { error: friendly(ins.error) };
  }
  touch(existing.job_id, o.id);
  return { ok: "Order saved." };
}

async function loadOrder(supabase: Awaited<ReturnType<typeof requireMoneyAccess>>["supabase"], id: string) {
  const { data } = await supabase
    .from("material_orders")
    .select("*, material_order_items(*), jobs(id, title, site_address, materials_status, customers(name))")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** "Send to branch": emails a formatted order (no direct distributor API — partner credentials required). */
export async function sendOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const o = await loadOrder(supabase, id);
  if (!o) return { error: "Order not found." };
  const to = str(fd, "to") ?? o.branch_email;
  if (!to || !to.includes("@")) return { error: "Add the branch email address first." };
  const items = (o.material_order_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  if (!items.length) return { error: "Add at least one line before sending." };
  if (!o.delivery_date) return { error: "Set a delivery date before sending." };
  const job = o.jobs as { id: string; title: string; site_address: string | null; materials_status: string; customers: { name: string } | null };
  const email = orderEmail({ ...o, job: `${job.customers?.name ?? ""} — ${job.title}`, address: job.site_address, org: org.name, orgPhone: org.phone }, items);
  const res = await sendEmail(supabase, { orgId: org.id, jobId: job.id, to, subject: email.subject, html: email.html, text: email.text });
  if (res.status === "failed") return { error: `Email failed: ${res.error}` };
  await supabase.from("material_orders").update({ status: o.status === "draft" ? "sent" : o.status, sent_at: new Date().toISOString(), branch_email: to }).eq("id", id);
  if (job.materials_status === "not_ordered") await supabase.from("jobs").update({ materials_status: "ordered" }).eq("id", job.id);
  touch(job.id, id);
  return { ok: res.status === "sent" ? `Order emailed to ${to}.` : `Order logged as sent to ${to} (email provider not configured — print or download the sheet).` };
}

export async function setOrderStatus(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!["draft", "sent", "confirmed", "cancelled"].includes(status)) throw new Error("Invalid status.");
  const { data: o } = await supabase.from("material_orders").select("job_id, status").eq("id", id).maybeSingle();
  if (!o) throw new Error("Order not found.");
  if (o.status === "delivered") throw new Error("Delivered orders can't change status.");
  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  await supabase.from("material_orders").update(patch).eq("id", id);
  if (status === "sent" || status === "confirmed") await supabase.from("jobs").update({ materials_status: "ordered" }).eq("id", o.job_id).eq("materials_status", "not_ordered");
  touch(o.job_id, id);
}

/** Delivered: attach delivery photos, set the job's materials status, post the materials cost. */
export async function markDelivered(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const o = await loadOrder(supabase, id);
  if (!o) return { error: "Order not found." };
  if (o.status === "delivered") return { ok: "Already delivered." };
  const fileIds = fd.getAll("file_ids").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
  if (fileIds.length) {
    const { data: files } = await supabase.from("job_files").select("id").eq("job_id", o.job_id).in("id", fileIds);
    if ((files ?? []).length !== fileIds.length) return { error: "Pick photos from this job." };
  }
  const { error } = await supabase.from("material_orders").update({ status: "delivered", delivered_at: new Date().toISOString(), delivery_file_ids: fileIds }).eq("id", id);
  if (error) return { error: friendly(error) };
  await supabase.from("jobs").update({ materials_status: "delivered" }).eq("id", o.job_id);
  const amount = orderTotal(o.material_order_items ?? []);
  const { data: existing } = await supabase.from("job_costs").select("id").eq("source", "order").eq("source_id", id).maybeSingle();
  if (!existing && amount > 0) {
    const ins = await supabase.from("job_costs").insert({
      org_id: org.id, job_id: o.job_id, category: "materials", vendor: o.supplier, amount, source: "order", source_id: id, created_by: user.id,
      description: `Material order${o.po_number ? ` PO ${o.po_number}` : ""} delivered`,
    });
    if (ins.error) return { error: friendly(ins.error) };
  }
  touch(o.job_id, id);
  return { ok: `Marked delivered${amount > 0 ? ` — ${amount.toFixed(2)} posted to job cost` : ""}.` };
}

export async function deleteOrder(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const { data: o } = await supabase.from("material_orders").select("job_id, status").eq("id", id).maybeSingle();
  if (!o) return;
  if (o.status === "delivered") throw new Error("Delivered orders can't be deleted.");
  await supabase.from("material_orders").delete().eq("id", id);
  touch(o.job_id);
  redirect("/app/orders");
}

export async function addReturn(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireMoneyAccess();
  const orderId = String(fd.get("order_id"));
  const description = str(fd, "description");
  if (!description) return { error: "Describe what's going back." };
  const ends = str(fd, "credit_window_ends_on");
  if (ends && !isoRe.test(ends)) return { error: "Use a valid date." };
  const { data: o } = await supabase.from("material_orders").select("job_id").eq("id", orderId).maybeSingle();
  if (!o) return { error: "Order not found." };
  const { error } = await supabase.from("material_returns").insert({
    org_id: org.id, order_id: orderId, description, quantity: Math.max(0, num(fd, "quantity")),
    credit_amount: Math.max(0, num(fd, "credit_amount")), restocking_fee: Math.max(0, num(fd, "restocking_fee")), credit_window_ends_on: ends,
  });
  if (error) return { error: friendly(error) };
  touch(o.job_id, orderId);
  return { ok: "Return logged." };
}

/** Return status; "credited" posts a negative job cost (credit − restocking fee) once. */
export async function setReturnStatus(fd: FormData) {
  const { supabase, org, user } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!(RETURN_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status.");
  const { data: r } = await supabase.from("material_returns").select("*, material_orders(job_id, supplier, po_number)").eq("id", id).maybeSingle();
  if (!r) throw new Error("Return not found.");
  const order = r.material_orders as { job_id: string; supplier: string; po_number: string | null };
  await supabase.from("material_returns").update({ status }).eq("id", id);
  const { data: existing } = await supabase.from("job_costs").select("id").eq("source", "return").eq("source_id", id).maybeSingle();
  const credit = netCredit(r);
  if (status === "credited" && !existing && credit > 0) {
    await supabase.from("job_costs").insert({
      org_id: org.id, job_id: order.job_id, category: "materials", vendor: order.supplier, amount: -credit, source: "return", source_id: id,
      description: `Return credit: ${r.description}${Number(r.restocking_fee) > 0 ? ` (less ${Number(r.restocking_fee).toFixed(2)} restocking)` : ""}`, created_by: user.id,
    });
  } else if (status !== "credited" && existing) {
    await supabase.from("job_costs").delete().eq("id", existing.id);
  }
  touch(order.job_id, String(r.order_id));
}
