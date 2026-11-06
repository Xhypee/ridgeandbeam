import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type JobInvoice = { id: string; number: number; status: string; kind: string; public_token: string; milestone_label: string | null; total: number; paid: number; balance: number };

/** Invoices (non-void) with totals, plus open punch count. Drives the close-out readiness checklist and review gating. */
export async function closeoutBlockers(db: SupabaseClient, jobId: string) {
  const [{ data: inv }, { count }] = await Promise.all([
    db.from("invoices").select("id, number, status, kind, public_token, milestone_label").eq("job_id", jobId).neq("status", "void").order("created_at"),
    db.from("job_checklist_items").select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("kind", "punch").is("done_at", null),
  ]);
  // invoice_totals is a view: PostgREST can't embed it, so read it separately.
  const ids = (inv ?? []).map((v) => v.id);
  const { data: totals } = ids.length ? await db.from("invoice_totals").select("invoice_id, total, paid, balance").in("invoice_id", ids) : { data: [] };
  const byId = new Map((totals ?? []).map((t) => [t.invoice_id, t]));
  const invoices: JobInvoice[] = (inv ?? []).map((v) => {
    const t = byId.get(v.id);
    return { id: v.id, number: v.number, status: v.status, kind: v.kind, public_token: v.public_token, milestone_label: v.milestone_label, total: Number(t?.total ?? 0), paid: Number(t?.paid ?? 0), balance: Number(t?.balance ?? 0) };
  });
  const balance = invoices.reduce((s, v) => s + Math.max(0, v.balance), 0);
  const paid = invoices.reduce((s, v) => s + v.paid, 0);
  const contract = invoices.reduce((s, v) => s + v.total, 0);
  return { invoices, balance, paid, contract, openPunch: count ?? 0 };
}
