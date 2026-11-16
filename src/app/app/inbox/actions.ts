"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { syncMailbox } from "@/lib/gmail";
import { replySubject, textToHtml } from "@/lib/inbox";
import { sendEmail } from "@/lib/notify";

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_TOTAL = 18 * 1024 * 1024; // Gmail's limit is 25 MB after encoding

type Upload = { path: string; name: string; mime: string | null; size: number };
/** Files the browser uploaded to this company's mail folder, read back to attach to the email. */
async function attachmentsFrom(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, fd: FormData): Promise<{ files: { filename: string; content: string; contentType?: string; size: number; storagePath: string }[] } | { error: string }> {
  let list: Upload[] = [];
  try { list = JSON.parse(String(fd.get("files") || "[]")); } catch { return { error: "Couldn't read the attachments. Try adding them again." }; }
  if (!Array.isArray(list) || list.length > 10) return { error: "Attach up to 10 files." };
  if (list.reduce((t, f) => t + Number(f.size || 0), 0) > MAX_TOTAL) return { error: "Attachments are over 18 MB in total. Send big files as a link instead." };
  const files = [];
  for (const f of list) {
    if (typeof f.path !== "string" || !f.path.startsWith(`${orgId}/mail/`) || f.path.includes("..")) return { error: "That attachment isn't one of yours." };
    const { data, error } = await supabase.storage.from("job-files").download(f.path);
    if (error || !data) return { error: `Couldn't attach ${f.name}.` };
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > MAX_TOTAL) return { error: `${f.name} is too big to email.` };
    files.push({ filename: String(f.name).slice(0, 200), content: buf.toString("base64"), contentType: f.mime ?? undefined, size: buf.length, storagePath: f.path });
  }
  return { files };
}
const addr = (s: string | null) => (/<([^>]+)>/.exec(s ?? "")?.[1] ?? s ?? "").split(",")[0].trim().toLowerCase();

/** Reply in a conversation: goes to whoever wrote last from their side, threaded in Gmail when connected. */
export async function replyEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const thread = String(fd.get("thread") ?? "");
  const text = String(fd.get("body") ?? "").trim();
  const att = await attachmentsFrom(supabase, org.id, fd);
  if ("error" in att) return { error: att.error };
  if (!text && !att.files.length) return { error: "Write a reply first." };
  if (text.length > 20000) return { error: "That reply is too long." };
  const q = supabase.from("messages").select("id, direction, from_address, to_address, subject, thread_ref, rfc_message_id, job_id, customer_id, customers(email)").eq("org_id", org.id).eq("channel", "email").order("created_at", { ascending: false }).limit(20);
  const { data: rows } = thread.startsWith("m:") ? await q.eq("id", thread.slice(2)) : await q.eq("thread_ref", thread);
  if (!rows?.length) return { error: "That conversation is gone." };
  const theirs = rows.find((r) => r.direction === "inbound");
  const cust = rows.map((r) => (Array.isArray(r.customers) ? r.customers[0] : r.customers) as { email: string | null } | null).find((c) => c?.email);
  const to = theirs ? addr(theirs.from_address) : addr(rows[0].to_address) || cust?.email || "";
  if (!EMAIL.test(to)) return { error: "No email address to reply to." };
  const last = rows[0];
  const r = await sendEmail(supabase, {
    orgId: org.id, jobId: rows.find((x) => x.job_id)?.job_id ?? null, customerId: rows.find((x) => x.customer_id)?.customer_id ?? null,
    to, subject: replySubject(last.subject), html: textToHtml(text), text, fromName: org.name, attachments: att.files,
    threadId: rows.find((x) => x.thread_ref)?.thread_ref ?? null, inReplyTo: rows.find((x) => x.rfc_message_id)?.rfc_message_id ?? null,
  });
  revalidatePath("/app/inbox");
  if (r.status === "failed") return { error: r.error ?? "Couldn't send." };
  if (r.status === "not_configured") return { error: "Email isn't set up yet. Connect Gmail in Settings → Integrations." };
  return { ok: r.status === "redirected" ? "Test mode: sent to you instead." : r.status === "paused" ? "Test mode: not sent." : "Sent." };
}

/** A new email to anyone; linked to the contact (and their latest job) when the address is one of yours. */
export async function newEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org } = await requireOrg();
  const to = String(fd.get("to") ?? "").trim().toLowerCase();
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("body") ?? "").trim();
  if (!EMAIL.test(to)) return { error: "Enter one email address." };
  if (!subject) return { error: "Add a subject." };
  const att = await attachmentsFrom(supabase, org.id, fd);
  if ("error" in att) return { error: att.error };
  if (!text && !att.files.length) return { error: "Write the email first." };
  const { data: cust } = await supabase.from("customers").select("id").eq("org_id", org.id).ilike("email", to).limit(1).maybeSingle();
  const jobId = String(fd.get("job") ?? "") || (cust ? (await supabase.from("jobs").select("id").eq("customer_id", cust.id).neq("stage", "lost").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? null : null);
  const r = await sendEmail(supabase, { orgId: org.id, jobId, customerId: cust?.id ?? null, to, subject: subject.slice(0, 300), html: textToHtml(text), text, fromName: org.name, attachments: att.files });
  revalidatePath("/app/inbox");
  if (r.status === "failed") return { error: r.error ?? "Couldn't send." };
  if (r.status === "not_configured") return { error: "Email isn't set up yet. Connect Gmail in Settings → Integrations." };
  return { ok: r.status === "redirected" ? "Test mode: sent to you instead." : "Sent." };
}

export async function checkMail(): Promise<ActionResult> {
  const { org } = await requireOrg();
  const r = await syncMailbox(org.id);
  revalidatePath("/app/inbox");
  return r.error ? { error: r.error } : { ok: r.added ? `${r.added} new` : "Up to date" };
}

/** Where the browser uploads a file to attach (the company's folder comes from the server). */
export async function prepareMailUpload(name: string): Promise<{ path?: string; error?: string }> {
  const { org, isCrewLead } = await requireOrg();
  if (isCrewLead) return { error: "Not allowed." };
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
  return { path: `${org.id}/mail/${crypto.randomUUID()}-${safe}` };
}
