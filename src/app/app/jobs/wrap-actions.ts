"use server";
// Wrapping up: send the customer their handover pack (workmanship warranty + photos), and close the job.
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { formatAbn } from "@/lib/au";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { handoverEmail, workmanshipPdf, type HandoverDoc } from "@/lib/handover";
import { sendEmail } from "@/lib/notify";
import { isRealEmail } from "@/lib/pay-plan-notify";

const touch = (jobId: string) => { revalidatePath("/app/jobs"); revalidatePath(`/app/jobs/${jobId}`, "layout"); };

export async function sendHandover(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireMoneyAccess();
  const { supabase, org, user } = ctx;
  const jobId = String(fd.get("job_id") ?? "");
  const { data: job } = await supabase.from("jobs").select("id, title, site_address, state, completed_at, scheduled_end, warranty_product, customer_id, customers(name, email, address, city, state, zip)").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const c = job.customers as unknown as { name: string; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
  if (!c.email) return { error: `Add ${c.name.split(" ")[0]}'s email first.` };
  const [{ data: o }, { data: est }, { data: photos }] = await Promise.all([
    supabase.from("organizations").select("name, phone, email, abn, license_number, licences, workmanship_years").eq("id", org.id).single(),
    supabase.from("estimates").select("number").eq("job_id", jobId).eq("status", "accepted").order("accepted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("job_files").select("storage_path, mime_type, category, created_at").eq("job_id", jobId).eq("kind", "photo").order("created_at", { ascending: false }).limit(60),
  ]);
  const st = (job.state ?? c.state ?? "").toUpperCase();
  const licences = (o?.licences ?? {}) as Record<string, { number?: string }>;
  // The finished roof first: completion photos, then progress, then the rest; at most 8 attached.
  const rank = (cat: string) => (cat === "completion" ? 0 : cat === "progress" ? 1 : 2);
  const picks = [...(photos ?? [])].sort((a, b) => rank(a.category) - rank(b.category)).slice(0, 8);
  const site = job.site_address || [c.address, [c.city, c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const doc: HandoverDoc = {
    org: { name: o?.name ?? org.name, phone: o?.phone ?? null, email: o?.email ?? null, abn: o?.abn ? formatAbn(o.abn) : null, licence: (st && licences[st]?.number) || o?.license_number || null },
    customer: { name: c.name }, site,
    job: { title: job.title, completedOn: job.completed_at ?? job.scheduled_end, quoteNo: est?.number ?? null },
    workmanshipYears: o?.workmanship_years ?? 7, product: job.warranty_product, photoCount: picks.length,
  };
  const pdf = await workmanshipPdf(doc);
  // File the certificate with the job's documents.
  const name = `Workmanship warranty · ${doc.workmanshipYears} years.pdf`;
  const path = `${org.id}/${jobId}/files/${crypto.randomUUID()}-workmanship-warranty.pdf`;
  const up = await supabase.storage.from("job-files").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (!up.error) await supabase.from("job_files").insert({ org_id: org.id, job_id: jobId, kind: "document", category: "document", storage_path: path, mime_type: "application/pdf", size_bytes: pdf.length, caption: name, uploaded_by: user.id });
  const signed = await Promise.all(picks.map(async (p, i) => {
    const { data } = await supabase.storage.from("job-files").createSignedUrl(p.storage_path, 7 * 86400);
    return data?.signedUrl ? { filename: `Photo ${i + 1}.${(p.mime_type ?? "image/jpeg").split("/")[1]?.replace("jpeg", "jpg") ?? "jpg"}`, path: data.signedUrl } : null;
  }));
  const email = handoverEmail(doc);
  // Made-up (demo / test) addresses are never emailed; the pack is still filed and recorded.
  const r = !isRealEmail(c.email) ? { status: "not_configured" as const, error: null } : await sendEmail(supabase, {
    orgId: org.id, jobId, customerId: job.customer_id, to: c.email, subject: email.subject, html: email.html, text: email.text,
    replyTo: org.email, fromName: org.name,
    attachments: [{ filename: name, content: Buffer.from(pdf).toString("base64") }, ...signed.filter((x): x is { filename: string; path: string } => Boolean(x))],
  });
  if (r.status === "failed") return { error: r.error ?? "The email didn't send." };
  const { error } = await supabase.from("jobs").update({ handover_sent_at: new Date().toISOString() }).eq("id", jobId);
  if (error) return { error: friendly(error) };
  const me = ctx.memberships.find((m) => m.org_id === org.id)?.full_name || user.fullName || user.email;
  await supabase.from("job_notes").insert({ org_id: org.id, job_id: jobId, body: `Sent the handover pack to ${c.name.split(" ")[0]}: ${doc.workmanshipYears}-year workmanship warranty${picks.length ? ` and ${picks.length} photos` : ""}.`, author_id: user.id, author_name: me });
  touch(jobId);
  return { ok: r.status === "sent" ? `Handover pack sent to ${c.name.split(" ")[0]}.` : r.status === "paused" ? "Handover pack saved (test mode: not emailed)." : "Handover pack saved (email isn't set up here)." };
}

/** Close the job: marked paid and off the Jobs board. */
export async function closeJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMoneyAccess();
  const jobId = String(fd.get("job_id") ?? "");
  const { data: job } = await supabase.from("jobs").select("id, stage").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const { error } = await supabase.from("jobs").update({ stage: "paid", closed_at: new Date().toISOString() }).eq("id", jobId);
  if (error) return { error: friendly(error) };
  touch(jobId);
  return { ok: "Job closed." };
}
