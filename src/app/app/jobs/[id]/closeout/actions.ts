"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { friendly, str } from "@/lib/form";
import { sendEmail, sendSms } from "@/lib/notify";
import { closeoutBlockers } from "@/lib/field-closeout";

const path = (jobId: string) => `/app/jobs/${jobId}`;

export async function addPunch(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireOrg();
  const jobId = String(fd.get("job_id"));
  const text = str(fd, "label");
  if (!text) return { error: "Describe the punch item." };
  const { data: job } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const { error } = await supabase.from("job_checklist_items").insert({ org_id: job.org_id, job_id: jobId, kind: "punch", label: text.slice(0, 300) });
  if (error) return { error: friendly(error) };
  revalidatePath(path(jobId), "layout");
  return { ok: "Added." };
}

export async function togglePunch(fd: FormData) {
  const { supabase } = await requireOrg();
  const done = fd.get("done") === "1";
  const { data } = await supabase.from("job_checklist_items").update({ done_at: done ? new Date().toISOString() : null }).eq("id", String(fd.get("id"))).select("job_id").maybeSingle();
  if (data) revalidatePath(path(data.job_id), "layout");
}

export async function deletePunch(fd: FormData) {
  const { supabase } = await requireOrg();
  const { data } = await supabase.from("job_checklist_items").delete().eq("id", String(fd.get("id"))).select("job_id").maybeSingle();
  if (data) revalidatePath(path(data.job_id), "layout");
}

export async function signWalkthrough(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireOrg();
  const jobId = String(fd.get("job_id"));
  const name = str(fd, "name");
  const sig = str(fd, "signature");
  if (!name || name.length < 2) return { error: "Homeowner's full name is required." };
  if (!sig?.startsWith("data:image/png;base64,") || sig.length > 400000) return { error: "Have the homeowner sign in the box." };
  if (fd.get("agree") !== "on") return { error: "The homeowner needs to confirm the walkthrough." };
  const { data: job } = await supabase.from("jobs").select("id, org_id, stage, completed_at").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const now = new Date().toISOString();
  const upd: Record<string, unknown> = { walkthrough_signed_at: now, walkthrough_name: name.slice(0, 200), walkthrough_signature: sig };
  if (!job.completed_at) upd.completed_at = now;
  if (!["completed", "paid", "lost"].includes(job.stage)) upd.stage = "completed";
  const { error } = await supabase.from("jobs").update(upd).eq("id", job.id);
  if (error) return { error: friendly(error) };
  await supabase.from("job_events").insert({ org_id: job.org_id, job_id: job.id, kind: "walkthrough_signed", note: `Signed by ${name}`, created_by: user.id, created_by_name: user.fullName || user.email });
  revalidatePath(path(job.id), "layout");
  return { ok: "Walkthrough signed. Certificate of completion is ready." };
}

export async function saveWarranty(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireOrg();
  const jobId = String(fd.get("job_id"));
  const product = str(fd, "warranty_product_custom") ?? str(fd, "warranty_product");
  const number = str(fd, "warranty_registration_number");
  const on = str(fd, "warranty_registered_at");
  if (on && !/^\d{4}-\d{2}-\d{2}$/.test(on)) return { error: "Pick a valid registration date." };
  if (on && !number) return { error: "Enter the registration / confirmation number." };
  const { data: job } = await supabase.from("jobs").select("id, org_id, warranty_registered_at").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const registeredAt = on ? new Date(on + "T12:00:00").toISOString() : null;
  const { error } = await supabase.from("jobs").update({ warranty_product: product, warranty_registration_number: number, warranty_registered_at: registeredAt }).eq("id", job.id);
  if (error) return { error: friendly(error) };
  if (registeredAt && !job.warranty_registered_at) {
    await supabase.from("job_events").insert({ org_id: job.org_id, job_id: job.id, kind: "warranty_registered", note: product, created_by: user.id, created_by_name: user.fullName || user.email });
  }
  revalidatePath(path(job.id), "layout");
  return { ok: registeredAt ? "Warranty registration saved." : "Saved." };
}

export async function requestReview(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const jobId = String(fd.get("job_id"));
  const { data: job } = await supabase.from("jobs").select("id, org_id, public_token, customer_id, customers(name, phone, email)").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const { data: o } = await supabase.from("organizations").select("name, google_review_url").eq("id", job.org_id).single();
  const blockers = await closeoutBlockers(supabase, job.id);
  if (!o?.google_review_url) return { error: "Add your Google review link in Settings first." };
  if (blockers.balance > 0.005) return { error: "There's still a balance due — ask for a review after the final payment." };
  if (blockers.openPunch > 0) return { error: "Finish the punch list before asking for a review." };
  const c = job.customers as unknown as { name: string; phone: string | null; email: string | null } | null;
  const first = c?.name.split(" ")[0] ?? "there";
  const body = `Hi ${first}, thank you for choosing ${o.name ?? org.name}! If you're happy with your new roof, would you leave us a quick review? ${o.google_review_url}`;
  const out: string[] = [];
  if (c?.phone) {
    const r = await sendSms(supabase, { orgId: job.org_id, jobId: job.id, customerId: job.customer_id, to: c.phone, body });
    out.push(r.status === "sent" ? "texted" : r.status === "not_configured" ? "text logged (SMS not set up)" : `text failed: ${r.error}`);
  }
  if (c?.email) {
    const r = await sendEmail(supabase, { orgId: job.org_id, jobId: job.id, customerId: job.customer_id, to: c.email, subject: `How did we do, ${first}?`,
      html: `<p>Hi ${first},</p><p>Thank you for choosing ${o.name}! If you're happy with your new roof, a quick Google review helps a local business a lot.</p><p><a href="${o.google_review_url}">Leave a review</a></p>`, text: body });
    out.push(r.status === "sent" ? "emailed" : r.status === "not_configured" ? "email logged (email not set up)" : `email failed: ${r.error}`);
  }
  if (!out.length) return { error: "The customer has no phone or email on file." };
  await supabase.from("jobs").update({ review_requested_at: new Date().toISOString() }).eq("id", job.id);
  revalidatePath(path(job.id), "layout");
  revalidatePath("/app/jobs");
  return { ok: `Review request sent (${out.join(", ")}).` };
}
