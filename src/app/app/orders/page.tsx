import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Select, Table, cx, td, th } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, label, money } from "@/lib/format";
import { ORDER_STATUSES, orderTotal } from "@/lib/production-orders";
import { listOrgSuppliers } from "@/lib/suppliers";
import { createOrder } from "./actions";

export const metadata: Metadata = { title: "Orders" };

const TONE = { draft: "slate", sent: "amber", confirmed: "blue", delivered: "green", cancelled: "red" } as const;
const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function OrdersPage({ searchParams }: PageProps<"/app/orders">) {
  const { supabase, org } = await requireMoneyAccess();
  const sp = await searchParams;
  const status = (ORDER_STATUSES as readonly string[]).includes(String(sp.status)) ? String(sp.status) : null;
  const suppliers = await listOrgSuppliers(supabase, org.id);
  const supplier = suppliers.some((s) => s.id === String(sp.supplier)) ? String(sp.supplier) : null;
  const from = iso(sp.from);
  const to = iso(sp.to);

  let q = supabase
    .from("material_orders")
    .select("id, supplier, branch, po_number, status, delivery_date, delivery_type, created_at, material_order_items(quantity, unit_cost), material_returns(status, credit_window_ends_on), jobs(id, title, customers(name))")
    .eq("org_id", org.id)
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  else q = q.neq("status", "cancelled");
  if (supplier) q = q.eq("org_supplier_id", supplier);
  if (from) q = q.gte("delivery_date", from);
  if (to) q = q.lte("delivery_date", to);
  const [{ data: orders }, { data: jobs }] = await Promise.all([
    q,
    supabase.from("jobs").select("id, title, customers(name)").eq("org_id", org.id).in("stage", ["sold", "scheduled", "in_progress"]).order("updated_at", { ascending: false }).limit(100),
  ]);
  type O = { id: string; supplier: string; branch: string | null; po_number: string | null; status: keyof typeof TONE; delivery_date: string | null; delivery_type: string;
    material_order_items: { quantity: number; unit_cost: number }[]; material_returns: { status: string; credit_window_ends_on: string | null }[]; jobs: { id: string; title: string; customers: { name: string } | null } | null };
  const list = (orders ?? []) as unknown as O[];
  const openReturns = list.reduce((n, o) => n + o.material_returns.filter((r) => r.status === "pending" || r.status === "returned").length, 0);

  return (
    <>
      <PageHeader title="Material orders" subtitle={`${list.length} order${list.length === 1 ? "" : "s"}${openReturns ? ` · ${openReturns} open return${openReturns === 1 ? "" : "s"}` : ""}`} />

      <Card className="mb-6" title="New order">
        <form action={createOrder} className="flex flex-wrap items-end gap-2">
          <Field label="Job" className="min-w-56 flex-1">
            <Select name="job_id" required defaultValue="">
              <option value="" disabled>Choose a signed job…</option>
              {((jobs ?? []) as unknown as { id: string; title: string; customers: { name: string } | null }[]).map((j) => <option key={j.id} value={j.id}>{j.customers?.name} — {j.title}</option>)}
            </Select>
          </Field>
          <Field label="Supplier" className="min-w-44">
            <Select name="org_supplier_id" defaultValue={org.default_supplier_id ?? ""}>
              <option value="">{suppliers.length ? "No supplier yet" : "Add suppliers in Settings"}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active_list ? "" : " (no price sheet)"}</option>)}
            </Select>
          </Field>
          <Select name="mode" defaultValue="estimate" className="w-auto" aria-label="Start from">
            <option value="estimate">From accepted estimate</option>
            <option value="blank">Blank</option>
          </Select>
          <SubmitButton>Create order</SubmitButton>
        </form>
      </Card>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <Field label="Status"><Select name="status" defaultValue={status ?? ""} className="w-auto"><option value="">Open (not cancelled)</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Supplier"><Select name="supplier" defaultValue={supplier ?? ""} className="w-auto"><option value="">All</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Delivery from"><Input type="date" name="from" defaultValue={from ?? ""} /></Field>
        <Field label="to"><Input type="date" name="to" defaultValue={to ?? ""} /></Field>
        <button className="min-h-9 rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-slate-300">Filter</button>
        {(status || supplier || from || to) && <LinkButton variant="ghost" href="/app/orders">Clear</LinkButton>}
      </form>

      {list.length === 0 ? <Empty title="No orders match">Create one from a job&apos;s Production tab or above.</Empty> : (
        <Table>
          <thead><tr><th className={th}>Delivery</th><th className={th}>Job</th><th className={th}>Supplier</th><th className={th}>Status</th><th className={cx(th, "text-right")}>Cost ex GST</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className={cx(td, "whitespace-nowrap")}><Link href={`/app/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.delivery_date ? date(o.delivery_date, { weekday: "short", day: "2-digit", month: "2-digit" }) : "No date"}</Link><span className="block text-xs text-slate-500">{label(o.delivery_type)}</span></td>
                <td className={td}><Link href={`/app/orders/${o.id}`} className="hover:text-brand-600">{o.jobs?.customers?.name}<span className="block text-xs text-slate-500">{o.jobs?.title}</span></Link></td>
                <td className={td}>{o.supplier}<span className="block text-xs text-slate-500">{[o.branch, o.po_number && `PO ${o.po_number}`].filter(Boolean).join(" · ")}</span></td>
                <td className={td}><Badge tone={TONE[o.status]}>{label(o.status)}</Badge></td>
                <td className={cx(td, "text-right")}>{money(orderTotal(o.material_order_items))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
