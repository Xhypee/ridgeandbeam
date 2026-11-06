import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeOrderBuilder } from "@/components/field/change-order-builder";
import { Badge, Card } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { signPaths } from "@/lib/field-server";
import { date, label, money, STATUS_TONE } from "@/lib/format";

export const metadata: Metadata = { title: "Change orders" };

export default async function ChangeOrdersPage({ params }: PageProps<"/app/jobs/[id]/change-orders">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const { data: job } = await supabase.from("jobs").select("id, org_id").eq("id", id).maybeSingle();
  if (!job) notFound();
  const [{ data: cos }, { data: deck }, { data: photos }] = await Promise.all([
    supabase.from("change_orders").select("id, title, status, created_at, approved_at, approved_name, approval_method, change_order_items(quantity, unit_price)").eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("catalog_items").select("name, unit, unit_price, unit_cost").eq("org_id", job.org_id).eq("calc_key", "tile_battens").order("tier", { nullsFirst: true }).limit(1).maybeSingle(),
    supabase.from("job_files").select("id, storage_path, caption").eq("job_id", id).eq("kind", "photo").order("created_at", { ascending: false }).limit(30),
  ]);
  const urls = await signPaths(supabase, (photos ?? []).map((p) => p.storage_path));
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3">
        <h2 className="mb-2 text-lg font-bold">New change order</h2>
        <ChangeOrderBuilder jobId={job.id} orgId={job.org_id}
          battens={deck ? { name: deck.name, unit: deck.unit, unit_price: Number(deck.unit_price), unit_cost: Number(deck.unit_cost) } : null}
          photos={(photos ?? []).map((p) => ({ id: p.id, url: urls.get(p.storage_path) ?? null, caption: p.caption }))} />
      </div>
      <div className="min-w-0 lg:col-span-2">
        <Card title="Change orders on this job">
          {(cos ?? []).length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {(cos ?? []).map((c) => {
                const total = (c.change_order_items as { quantity: number; unit_price: number }[]).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
                return (
                  <li key={c.id}>
                    <Link href={`/app/jobs/${id}/change-orders/${c.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-brand-600">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.title}</span>
                        <span className="text-xs text-slate-500">{c.approved_at ? `Approved ${date(c.approved_at)} by ${c.approved_name}${c.approval_method === "verbal" ? " (verbal)" : ""}` : date(c.created_at)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm">{money(total)}<Badge tone={STATUS_TONE[c.status]}>{c.status === "sent" ? "Awaiting homeowner" : label(c.status)}</Badge></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
