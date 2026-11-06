import { requireOrg } from "@/lib/dal";

/** CSV export of the company's data (owners/admins). GET /api/export/customers|jobs|estimates|invoices|payments */

const QUERIES: Record<string, { select: string; columns: string[]; flatten?: (r: Record<string, unknown>) => Record<string, unknown> }> = {
  customers: { select: "id, name, email, phone, address, city, state, zip, source, follow_up_on, notes, created_at", columns: ["id", "name", "email", "phone", "address", "city", "state", "zip", "source", "follow_up_on", "notes", "created_at"] },
  jobs: {
    select: "id, title, stage, job_type, site_address, is_insurance, lead_source, lead_received_at, first_contacted_at, scheduled_start, scheduled_end, created_at, customers(name)",
    columns: ["id", "title", "customer", "stage", "job_type", "site_address", "is_insurance", "lead_source", "lead_received_at", "first_contacted_at", "scheduled_start", "scheduled_end", "created_at"],
    flatten: (r) => ({ ...r, customer: (r.customers as { name?: string } | null)?.name }),
  },
  estimates: {
    select: "id, number, status, created_at, sent_at, accepted_at, accepted_name, jobs(title, customers(name)), estimate_totals(subtotal, tax, total)",
    columns: ["id", "number", "status", "customer", "job", "subtotal", "tax", "total", "created_at", "sent_at", "accepted_at", "accepted_name"],
    flatten: (r) => {
      const j = r.jobs as { title?: string; customers?: { name?: string } } | null;
      const t = (Array.isArray(r.estimate_totals) ? r.estimate_totals[0] : r.estimate_totals) as Record<string, unknown> | null;
      return { ...r, job: j?.title, customer: j?.customers?.name, ...t };
    },
  },
  invoices: {
    select: "id, number, status, kind, issue_date, due_date, jobs(title, customers(name)), invoice_totals(subtotal, tax, total, paid, balance)",
    columns: ["id", "number", "status", "kind", "customer", "job", "issue_date", "due_date", "subtotal", "tax", "total", "paid", "balance"],
    flatten: (r) => {
      const j = r.jobs as { title?: string; customers?: { name?: string } } | null;
      const t = (Array.isArray(r.invoice_totals) ? r.invoice_totals[0] : r.invoice_totals) as Record<string, unknown> | null;
      return { ...r, job: j?.title, customer: j?.customers?.name, ...t };
    },
  },
  payments: {
    select: "id, amount, fee_amount, method, paid_on, reference, provider, provider_ref, invoices(number)",
    columns: ["id", "invoice_number", "amount", "fee_amount", "method", "paid_on", "reference", "provider", "provider_ref"],
    flatten: (r) => ({ ...r, invoice_number: (r.invoices as { number?: number } | null)?.number }),
  },
};

function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_: Request, ctx: RouteContext<"/api/export/[entity]">) {
  const { entity } = await ctx.params;
  const { supabase, org, isAdmin } = await requireOrg();
  if (!isAdmin) return new Response("Only owners and admins can export data.", { status: 403 });
  const def = QUERIES[entity];
  if (!def) return new Response("Unknown export", { status: 404 });
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(entity).select(def.select).eq("org_id", org.id).order("created_at").range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  const lines = [def.columns.join(",")];
  for (const r of rows) {
    const f = def.flatten ? def.flatten(r) : r;
    lines.push(def.columns.map((c) => csvCell(f[c])).join(","));
  }
  const name = `${org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
