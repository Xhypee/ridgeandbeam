import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { gmailConfigured, syncIfStale } from "@/lib/gmail";
import { threadsOf, type MailRow } from "@/lib/inbox";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Inbox" };
export const maxDuration = 60;

export default async function InboxPage({ searchParams }: PageProps<"/app/inbox">) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, isCrewLead } = await requireOrg();
  // The company mailbox is for the office, not crew leads.
  if (isCrewLead) redirect("/app/schedule");
  // New mail from Gmail, at most every couple of minutes; never holds the page up for long.
  await Promise.race([syncIfStale(org.id).catch(() => null), new Promise((r) => setTimeout(r, 8000))]);
  const [{ data: rows }, { data: gm }] = await Promise.all([
    supabase.from("messages").select("id, direction, from_address, to_address, subject, body, full_body, attachments, status, created_at, read_at, thread_ref, job_id, customer_id, customer:customers(name, email), job:jobs(title)").eq("org_id", org.id).eq("channel", "email").order("created_at", { ascending: false }).limit(1500),
    supabase.from("integrations").select("status, external_name, last_synced_at").eq("org_id", org.id).eq("provider", "gmail").maybeSingle(),
  ]);
  const threads = threadsOf((rows ?? []) as unknown as MailRow[]);
  const key = typeof sp.t === "string" ? sp.t : null;
  const open = key ? threads.find((t) => t.key === key) ?? null : null;
  if (open?.unread) {
    const ids = open.messages.filter((m) => m.direction === "inbound" && !m.read_at).map((m) => m.id);
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", ids);
  }
  const compose = sp.compose === "1" ? { to: typeof sp.to === "string" ? sp.to : undefined, job: typeof sp.job === "string" ? sp.job : undefined } : null;
  return (
    <InboxView threads={threads} open={open} compose={compose} filter={sp.f === "unread" ? "unread" : sp.f === "contacts" ? "contacts" : "all"}
      box={{ configured: gmailConfigured(), connected: gm?.status === "connected", broken: gm?.status === "error", email: gm?.external_name ?? null, lastChecked: gm?.last_synced_at ?? null, canConnect: isAdmin }} />
  );
}
