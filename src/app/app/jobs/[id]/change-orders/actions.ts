"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import { money, siteUrl } from "@/lib/format";
import { sendEmail, sendSms } from "@/lib/notify";

const ItemSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description.").max(300),
  quantity: z.coerce.number().finite().positive("Quantity must be more than 0."),
  unit: z.string().trim().min(1).max(20).default("ea"),
  unit_price: z.coerce.number().finite().min(0),
  unit_cost: z.coerce.number().finite().min(0).default(0),
  category: z.enum(["material", "labor", "other"]).catch("material"),
});

const CreateSchema = z.object({
  jobId: z.uuid(),
  title: z.string().trim().min(2, "Give the change order a title.").max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  fileIds: z.array(z.uuid()).max(40).default([]),
  items: z.array(ItemSchema).min(1, "Add at least one line.").max(50),
  send: z.enum(["none", "sms", "email", "both"]).default("none"),
});

async function deliver(db: Awaited<ReturnType<typeof requireMoneyAccess>>["supabase"], orgName: string, co: { id: string; org_id: string; job_id: string; title: string; public_token: string }, how: "sms" | "email" | "both") {
  const { data: job } = await db.from("jobs").select("customer_id, customers(name, phone, email)").eq("id", co.job_id).single();
  const c = job?.customers as unknown as { name: string; phone: string | null; email: string | null } | null;
  const { data: items } = await db.from("change_order_items").select("quantity, unit_price").eq("change_order_id", co.id);
  const total = (items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const link = `${siteUrl()}/c/${co.public_token}`;
  const first = c?.name.split(" ")[0] ?? "there";
  const notes: string[] = [];
  if (how !== "email") {
    if (!c?.phone) notes.push("no phone on file");
    else {
      const r = await sendSms(db, { orgId: co.org_id, jobId: co.job_id, customerId: job?.customer_id, to: c.phone,
        body: `Hi ${first}, ${orgName} needs your OK on a change to your roof job: ${co.title} (${money(total)}). Review and sign: ${link}` });
      notes.push(r.status === "sent" ? "texted" : (r.status === "not_configured" || r.status === "paused") ? "text logged (SMS not set up)" : `text failed: ${r.error}`);
    }
  }
  if (how !== "sms") {
    if (!c?.email) notes.push("no email on file");
    else {
      const r = await sendEmail(db, { orgId: co.org_id, jobId: co.job_id, customerId: job?.customer_id, to: c.email,
        subject: `Change order for your approval: ${co.title}`,
        html: `<p>Hi ${first},</p><p>We found something during your roof project that needs your approval: <b>${co.title}</b> (${money(total)}).</p><p><a href="${link}">Review photos and approve</a></p><p>— ${orgName}</p>`,
        text: `Hi ${first}, please review and approve this change order: ${co.title} (${money(total)}). ${link}` });
      notes.push(r.status === "sent" ? "emailed" : (r.status === "not_configured" || r.status === "paused") ? "email logged (email not set up)" : `email failed: ${r.error}`);
    }
  }
  await db.from("change_orders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", co.id).eq("status", "draft");
  return notes.join(", ");
}

export async function createChangeOrder(input: z.input<typeof CreateSchema>): Promise<{ error?: string; id?: string; ok?: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid change order." };
  const p = parsed.data;
  const { supabase, org, user } = await requireMoneyAccess();
  const { data: job } = await supabase.from("jobs").select("id, org_id").eq("id", p.jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  if (p.fileIds.length) {
    const { data: f } = await supabase.from("job_files").select("id").eq("job_id", job.id).in("id", p.fileIds);
    if ((f ?? []).length !== p.fileIds.length) return { error: "One of the photos isn't on this job." };
  }
  const { data: co, error } = await supabase.from("change_orders")
    .insert({ org_id: job.org_id, job_id: job.id, title: p.title, description: p.description || null, file_ids: p.fileIds, created_by: user.id })
    .select("id, org_id, job_id, title, public_token").single();
  if (error) return { error: friendly(error) };
  const ins = await supabase.from("change_order_items").insert(p.items.map((it, i) => ({ ...it, org_id: job.org_id, change_order_id: co.id, position: i })));
  if (ins.error) {
    await supabase.from("change_orders").delete().eq("id", co.id);
    return { error: friendly(ins.error) };
  }
  let ok = "Saved as draft.";
  if (p.send !== "none") ok = `Sent to homeowner (${await deliver(supabase, org.name, co, p.send)}).`;
  revalidatePath(`/app/jobs/${job.id}`, "layout");
  return { id: co.id, ok };
}

export async function sendChangeOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireMoneyAccess();
  const how = z.enum(["sms", "email", "both"]).catch("both").parse(fd.get("how"));
  const { data: co } = await supabase.from("change_orders").select("id, org_id, job_id, title, public_token, status").eq("id", String(fd.get("id"))).maybeSingle();
  if (!co) return { error: "Change order not found." };
  if (!["draft", "sent"].includes(co.status)) return { error: "This change order is already " + co.status + "." };
  const notes = await deliver(supabase, org.name, co, how);
  revalidatePath(`/app/jobs/${co.job_id}`, "layout");
  return { ok: `Sent: ${notes}.` };
}

export async function approveOnSite(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const id = String(fd.get("id"));
  const method = fd.get("method") === "verbal" ? "verbal" : "in_person_signature";
  const name = str(fd, "name");
  const signature = str(fd, "signature");
  if (!name || name.length < 2) return { error: "Enter the homeowner's full name." };
  if (method === "in_person_signature" && !signature) return { error: "Have the homeowner sign in the box." };
  if (method === "verbal" && fd.get("confirm") !== "on") return { error: "Confirm the homeowner approved verbally." };
  const { data, error } = await supabase.rpc("approve_change_order_on_site", { p_co: id, p_name: name, p_signature: signature, p_method: method });
  if (error) return { error: friendly(error) };
  if (!data) return { error: "This change order can't be approved any more." };
  revalidatePath("/app", "layout");
  return { ok: "Approved — added to the final invoice and job cost." };
}

export async function deleteChangeOrder(fd: FormData) {
  const { supabase } = await requireMoneyAccess();
  const { data: co } = await supabase.from("change_orders").select("id, job_id, status").eq("id", String(fd.get("id"))).maybeSingle();
  if (!co) return;
  if (co.status === "approved") throw new Error("Approved change orders can't be deleted.");
  await supabase.from("change_orders").delete().eq("id", co.id);
  revalidatePath(`/app/jobs/${co.job_id}`, "layout");
  redirect(`/app/jobs/${co.job_id}/change-orders`);
}
