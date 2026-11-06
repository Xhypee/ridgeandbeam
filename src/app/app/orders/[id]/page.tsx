import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, label, money } from "@/lib/format";
import { daysUntil } from "@/lib/production";
import { netCredit, RETURN_STATUSES } from "@/lib/production-orders";
import { addReturn, deleteOrder, markDelivered, sendOrder, setOrderStatus, setReturnStatus } from "../actions";
import { OrderEditor } from "./order-editor";

export const metadata: Metadata = { title: "Material order" };

const ORDER_TONE = { draft: "slate", sent: "amber", confirmed: "blue", delivered: "green", cancelled: "red" } as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/app/orders/[id]">) {
  const { id } = await params;
  const { empty } = await searchParams;
  const { supabase } = await requireMoneyAccess();
  const { data: o } = await supabase
    .from("material_orders")
    .select("*, material_order_items(*), material_returns(*), jobs(id, title, site_address, customers(name))")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const job = o.jobs as { id: string; title: string; site_address: string | null; customers: { name: string } | null };
  const items = ((o.material_order_items ?? []) as { position: number; description: string; sku: string | null; quantity: number; unit: string; unit_cost: number }[])
    .sort((a, b) => a.position - b.position)
    .map(({ description, sku, quantity, unit, unit_cost }) => ({ description, sku, quantity: Number(quantity), unit, unit_cost: Number(unit_cost) }));
  const returns = (o.material_returns ?? []) as { id: string; description: string; quantity: number; credit_amount: number; restocking_fee: number; credit_window_ends_on: string | null; status: string; created_at: string }[];
  const today = isoDate(new Date());
  const locked = o.status === "delivered";

  const { data: files } = await supabase.from("job_files").select("id, storage_path, caption, category, kind").eq("job_id", job.id).eq("kind", "photo").order("created_at", { ascending: false }).limit(24);
  const { data: signed } = (files ?? []).length
    ? await supabase.storage.from("job-files").createSignedUrls((files ?? []).map((f) => f.storage_path), 3600)
    : { data: [] };
  const thumbs = (files ?? []).map((f, i) => ({ ...f, url: signed?.[i]?.signedUrl ?? null }));
  const deliveredIds = new Set<string>(o.delivery_file_ids ?? []);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{o.supplier} order {o.po_number && <span className="text-slate-500">PO {o.po_number}</span>} <Badge tone={ORDER_TONE[o.status as keyof typeof ORDER_TONE]}>{label(o.status)}</Badge></span>}
        subtitle={<Link href={`/app/jobs/${job.id}/production`} className="hover:text-brand-600">{job.customers?.name} · {job.title}{job.site_address ? ` · ${job.site_address}` : ""}</Link>}
        actions={
          <>
            <LinkButton variant="secondary" href={`/app/orders/${id}/print`}>Order sheet</LinkButton>
            <LinkButton variant="secondary" href={`/app/orders/${id}/csv`} prefetch={false}>CSV</LinkButton>
          </>
        }
      />
      {empty && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The job has no accepted estimate with material lines, so this order started blank.</p>}
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Direct ordering through ABC Supply, SRS Roof Hub or QXO needs partner API credentials. Until then, “Send to branch” emails this structured order to the branch and you can print or export it.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Order">
            <OrderEditor
              locked={locked}
              items={items}
              initial={{ id, supplier: o.supplier, branch: o.branch, branch_email: o.branch_email, branch_phone: o.branch_phone, po_number: o.po_number, color: o.color, delivery_date: o.delivery_date, delivery_type: o.delivery_type, notes: o.notes }}
            />
          </Card>

          <Card title={`Returns & credits (${returns.length})`}>
            {returns.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100">
                {returns.map((r) => {
                  const left = daysUntil(r.credit_window_ends_on, today);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{r.quantity} × {r.description}</span>
                        <span className="block text-xs text-slate-500">
                          Credit {money(r.credit_amount)}{Number(r.restocking_fee) > 0 && ` − ${money(r.restocking_fee)} restocking`} = <b>{money(netCredit(r))}</b>
                          {r.credit_window_ends_on && r.status !== "credited" && (
                            <span className={cx("ml-2 font-medium", left !== null && left < 0 ? "text-red-700" : left !== null && left <= 7 ? "text-amber-700" : "text-slate-600")}>
                              {left !== null && left >= 0 ? `${left} days left to return (by ${date(r.credit_window_ends_on, { month: "short", day: "numeric" })})` : `credit window closed ${date(r.credit_window_ends_on, { month: "short", day: "numeric" })}`}
                            </span>
                          )}
                        </span>
                      </span>
                      <form action={setReturnStatus} className="flex gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        {RETURN_STATUSES.map((s) => (
                          <button key={s} name="status" value={s} className={cx("min-h-9 rounded-md px-2 text-xs font-medium ring-1", s === r.status ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300")}>{label(s)}</button>
                        ))}
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
            <ActionForm action={addReturn} className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="order_id" value={id} />
              <Field label="Item" className="sm:col-span-2"><Input name="description" placeholder="Leftover bundles" required /></Field>
              <Field label="Qty"><Input name="quantity" type="number" step="any" defaultValue={1} /></Field>
              <Field label="Credit $"><Input name="credit_amount" type="number" step="0.01" defaultValue={0} /></Field>
              <Field label="Restocking $"><Input name="restocking_fee" type="number" step="0.01" defaultValue={0} /></Field>
              <Field label="Return by"><Input name="credit_window_ends_on" type="date" /></Field>
              <div className="sm:col-span-6"><SubmitButton variant="secondary">Log return</SubmitButton></div>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">Marking a return “Credited” posts a negative materials cost (credit minus restocking fee) to the job.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status">
            <ol className="mb-4 flex flex-wrap gap-1 text-xs">
              {["draft", "sent", "confirmed", "delivered"].map((s, i, arr) => (
                <li key={s} className={cx("rounded-full px-2.5 py-1", arr.indexOf(o.status) >= i ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500")}>{label(s)}</li>
              ))}
            </ol>
            {!locked && (
              <>
                <ActionForm action={sendOrder} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <Field label="Send to branch email"><Input name="to" type="email" defaultValue={o.branch_email ?? ""} placeholder="orders@branch.com" /></Field>
                  <SubmitButton>Send to branch</SubmitButton>
                </ActionForm>
                <form action={setOrderStatus} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={id} />
                  {o.status !== "confirmed" && <SubmitButton variant="secondary" name="status" value="confirmed">Mark confirmed</SubmitButton>}
                  {o.status === "draft" && <SubmitButton variant="ghost" name="status" value="sent">Mark sent (phoned in)</SubmitButton>}
                  {o.status !== "cancelled" && <SubmitButton variant="ghost" name="status" value="cancelled" confirm="Cancel this order?">Cancel</SubmitButton>}
                </form>
              </>
            )}
            {o.sent_at && <p className="mt-3 text-xs text-slate-500">Sent {new Date(o.sent_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>}
            {o.delivered_at && <p className="text-xs text-slate-500">Delivered {new Date(o.delivered_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>}
          </Card>

          <Card title={locked ? "Delivery photos" : "Mark delivered"}>
            {!locked ? (
              <ActionForm action={markDelivered} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                {thumbs.length === 0 ? <p className="text-sm text-slate-500">No job photos yet. Take a delivery photo from the Field tab, or mark delivered without one.</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {thumbs.map((f) => (
                      <label key={f.id} className="relative block cursor-pointer overflow-hidden rounded-lg ring-1 ring-slate-200 has-checked:ring-2 has-checked:ring-brand-500">
                        <input type="checkbox" name="file_ids" value={f.id} defaultChecked={f.category === "delivery"} className="absolute left-1 top-1 h-5 w-5 accent-brand-500" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {f.url ? <img src={f.url} alt={f.caption ?? ""} className="aspect-square w-full object-cover" /> : <span className="block aspect-square bg-slate-100" />}
                      </label>
                    ))}
                  </div>
                )}
                <SubmitButton>Mark delivered</SubmitButton>
                <p className="text-xs text-slate-500">Sets the job&apos;s materials to delivered and posts this order&apos;s cost to the job.</p>
              </ActionForm>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {thumbs.filter((f) => deliveredIds.has(f.id)).map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  f.url ? <img key={f.id} src={f.url} alt={f.caption ?? ""} className="aspect-square w-full rounded-lg object-cover" /> : null
                ))}
                {deliveredIds.size === 0 && <p className="col-span-3 text-sm text-slate-500">No delivery photo attached.</p>}
              </div>
            )}
          </Card>

          {!locked && (
            <form action={deleteOrder} className="text-right">
              <input type="hidden" name="id" value={id} />
              <SubmitButton variant="danger" confirm="Delete this order?">Delete order</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
