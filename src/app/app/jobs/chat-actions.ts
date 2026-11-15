"use server";

// Claude chat history (table ai_chats): save a conversation as it goes, list a person's past chats for where they
// are (a job, a contact, a supplier, or general), and open one again. Each person only ever sees their own.
import { z } from "zod";
import { requireOrg } from "@/lib/dal";

export type ChatContext = { jobId?: string; contactId?: string; supplierId?: string };
export type ChatSummary = { id: string; title: string; updatedAt: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };

const Ctx = z.object({ jobId: z.uuid().optional(), contactId: z.uuid().optional(), supplierId: z.uuid().optional() });
const Turns = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(200);

/** The chat's title: its first question, cut to a line. */
function chatTitle(turns: ChatTurn[]): string {
  const q = turns.find((t) => t.role === "user")?.content.replace(/\s+/g, " ").trim() ?? "Chat";
  return q.length > 60 ? `${q.slice(0, 57).trimEnd()}…` : q;
}

/** Save the conversation so far: a new chat the first time (returns its id), then the same chat each turn. */
export async function saveChat(input: { id: string | null; context: ChatContext; turns: ChatTurn[] }): Promise<{ id?: string }> {
  const ctx = Ctx.safeParse(input.context), turns = Turns.safeParse(input.turns);
  if (!ctx.success || !turns.success) return {};
  const { supabase, org, user, isCrewLead } = await requireOrg();
  if (isCrewLead) return {};
  const title = chatTitle(turns.data);
  if (input.id && /^[0-9a-f-]{36}$/i.test(input.id)) {
    const { data } = await supabase.from("ai_chats").update({ messages: turns.data, title, updated_at: new Date().toISOString() }).eq("id", input.id).select("id");
    if (data?.length) return { id: input.id };
  }
  const { data } = await supabase.from("ai_chats").insert({
    org_id: org.id, user_id: user.id, job_id: ctx.data.jobId ?? null, contact_id: ctx.data.contactId ?? null, supplier_id: ctx.data.supplierId ?? null,
    title, messages: turns.data,
  }).select("id").single();
  return { id: (data?.id as string | undefined) ?? undefined };
}

/** Past chats for where you are, newest first (general chats when there's no job, contact or supplier). */
export async function listChats(context: ChatContext): Promise<ChatSummary[]> {
  const ctx = Ctx.safeParse(context);
  if (!ctx.success) return [];
  const { supabase, org, user } = await requireOrg();
  let q = supabase.from("ai_chats").select("id, title, updated_at").eq("org_id", org.id).eq("user_id", user.id);
  const c = ctx.data;
  q = c.jobId ? q.eq("job_id", c.jobId) : q.is("job_id", null);
  q = c.contactId ? q.eq("contact_id", c.contactId) : q.is("contact_id", null);
  q = c.supplierId ? q.eq("supplier_id", c.supplierId) : q.is("supplier_id", null);
  const { data } = await q.order("updated_at", { ascending: false }).limit(50);
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: r.updated_at as string }));
}

/** One past chat's messages. */
export async function loadChat(id: string): Promise<ChatTurn[] | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase } = await requireOrg();
  const { data } = await supabase.from("ai_chats").select("messages").eq("id", id).maybeSingle();
  const turns = Turns.safeParse(data?.messages);
  return turns.success ? turns.data : null;
}

/** Remove a chat from your history. */
export async function deleteChat(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase } = await requireOrg();
  await supabase.from("ai_chats").delete().eq("id", id);
}
