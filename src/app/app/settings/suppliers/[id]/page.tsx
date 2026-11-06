import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, LinkButton, Select, cx } from "@/components/ui";
import { CALC_KEY_MAP } from "@/lib/calc-keys";
import { requireMoneyAccess } from "@/lib/dal";
import { date, money } from "@/lib/format";
import { conversionProblem, UNIT_SHORT } from "@/lib/price-sheet";
import { orgSupplierName, priceListItems, SUPPLIER_CATEGORY_LABEL } from "@/lib/suppliers";
import { activateList, bulkMapItems, deleteList, updateSupplier } from "../actions";
import { CalcKeyOptions, ItemKeySelect } from "./item-mapper";

export const metadata: Metadata = { title: "Supplier" };

const dmy = (d: string | null) => (d ? date(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const PAGE = 100;
const SHOW = ["all", "unmapped", "problems"] as const;

export default async function SupplierPage({ params, searchParams }: PageProps<"/app/settings/suppliers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org, isAdmin, role } = await requireMoneyAccess();
  const canEdit = isAdmin || role === "member";
  const { data: os } = await supabase
    .from("org_suppliers")
    .select("id, supplier_id, custom_name, account_number, branch_name, branch_email, branch_phone, is_default, suppliers(name, category, website, states, notes)")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!os) notFound();
  const dir = os.suppliers as unknown as { name: string; category: string; website: string | null; states: string[]; notes: string | null } | null;
  const name = orgSupplierName({ custom_name: os.custom_name, suppliers: dir });

  const { data: lists } = await supabase
    .from("supplier_price_lists")
    .select("id, name, effective_date, prices_include_gst, source_filename, is_active, created_at, supplier_price_items(count)")
    .eq("org_supplier_id", id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  type L = { id: string; name: string; effective_date: string | null; prices_include_gst: boolean; source_filename: string | null; is_active: boolean; created_at: string; supplier_price_items: { count: number }[] };
  const versions = (lists ?? []) as unknown as L[];
  const active = versions.find((l) => l.is_active) ?? null;

  const show = (SHOW as readonly string[]).includes(String(sp.show)) ? (String(sp.show) as (typeof SHOW)[number]) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const all = active ? await priceListItems(supabase, active.id, false) : [];
  const withIssue = all.map((i) => ({ ...i, problem: conversionProblem({ unit: i.unit, cost_ex_gst: i.cost_ex_gst, length_mm: i.length_mm, cover_width_mm: i.cover_width_mm, pack_qty: i.pack_qty }, i.calc_key) }));
  withIssue.sort((a, b) => a.description.localeCompare(b.description));
  const unmappedCount = withIssue.filter((i) => !i.calc_key).length;
  const problemCount = withIssue.filter((i) => i.problem).length;
  const filtered = withIssue.filter((i) =>
    (show === "all" || (show === "unmapped" ? !i.calc_key : Boolean(i.problem))) &&
    (!q || `${i.description} ${i.product_code ?? ""} ${i.profile ?? ""} ${i.finish ?? ""}`.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const href = (p: Record<string, string | number>) => {
    const u = new URLSearchParams({ show, ...(q ? { q } : {}), page: "1", ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) });
    return `/app/settings/suppliers/${id}?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/settings/suppliers" className="text-sm text-slate-500 hover:text-brand-600">← Suppliers</Link>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">{name} {os.is_default && <Badge tone="teal">Default</Badge>}</h2>
          <p className="text-xs text-slate-500">{[dir && SUPPLIER_CATEGORY_LABEL[dir.category], dir?.states?.length ? dir.states.join(", ") : null].filter(Boolean).join(" · ")}</p>
        </div>
        {canEdit && <LinkButton href={`/app/settings/suppliers/${id}/import`} className="min-h-11">{active ? "Import new price sheet" : "Import price sheet"}</LinkButton>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Account & branch" className="min-w-0 lg:col-span-1">
          <ActionForm action={updateSupplier} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            {!os.supplier_id && <Field label="Supplier name"><Input name="custom_name" defaultValue={os.custom_name ?? ""} required disabled={!canEdit} /></Field>}
            <Field label="Account number"><Input name="account_number" defaultValue={os.account_number ?? ""} disabled={!canEdit} /></Field>
            <Field label="Branch"><Input name="branch_name" defaultValue={os.branch_name ?? ""} disabled={!canEdit} /></Field>
            <Field label="Branch email" hint="“Send to branch” on orders goes here"><Input name="branch_email" type="email" defaultValue={os.branch_email ?? ""} disabled={!canEdit} /></Field>
            <Field label="Branch phone"><Input name="branch_phone" type="tel" defaultValue={os.branch_phone ?? ""} disabled={!canEdit} /></Field>
            {canEdit && <SubmitButton className="min-h-11">Save</SubmitButton>}
          </ActionForm>
          {dir?.notes && <p className="mt-3 text-xs text-slate-500">{dir.notes}</p>}
        </Card>

        <Card title="Price list versions" className="min-w-0 lg:col-span-2">
          {versions.length === 0 ? <p className="text-sm text-slate-500">No price sheet imported yet.</p> : (
            <ul className="divide-y divide-slate-100" data-testid="versions">
              {versions.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{l.name} {l.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</span>
                    <span className="block text-xs text-slate-500">
                      Effective {dmy(l.effective_date)} · imported {dmy(l.created_at)} · {l.supplier_price_items?.[0]?.count ?? 0} items · {l.prices_include_gst ? "prices were inc GST" : "prices ex GST"}
                      {l.source_filename && ` · ${l.source_filename}`}
                    </span>
                  </span>
                  {canEdit && !l.is_active && (
                    <span className="flex gap-1">
                      <form action={activateList}><input type="hidden" name="list_id" value={l.id} /><SubmitButton variant="secondary" className="min-h-10">Make active</SubmitButton></form>
                      <form action={deleteList}><input type="hidden" name="list_id" value={l.id} /><SubmitButton variant="ghost" className="min-h-10" confirm="Delete this old price list?">Delete</SubmitButton></form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {active && (
        <Card title={`Prices (${all.length})`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {([["all", `All ${all.length}`], ["unmapped", `Unmapped ${unmappedCount}`], ["problems", `Can't price ${problemCount}`]] as const).map(([k, l]) => (
              <Link key={k} href={href({ show: k })} className={cx("min-h-10 rounded-full px-3 py-2 ring-1", show === k ? "bg-ink text-white ring-ink" : "bg-white text-slate-600 ring-slate-300")}>{l}</Link>
            ))}
            <form method="get" className="ml-auto flex gap-2">
              <input type="hidden" name="show" value={show} />
              <Input type="search" name="q" defaultValue={q} placeholder="Search rows" aria-label="Search rows" className="w-44" />
            </form>
          </div>

          {canEdit && (
            <ActionForm action={bulkMapItems} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <input type="hidden" name="list_id" value={active.id} />
              <Field label="Map all rows containing" className="min-w-40 flex-1"><Input name="needle" placeholder="e.g. quad gutter" required /></Field>
              <Field label="to" className="min-w-48 flex-1"><Select name="calc_key" defaultValue=""><CalcKeyOptions /></Select></Field>
              <SubmitButton variant="secondary" className="min-h-10">Map rows</SubmitButton>
            </ActionForm>
          )}

          <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
            <table className="min-w-[720px] w-full text-sm" data-testid="price-items">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Cost ex GST</th><th className="px-3 py-2">Estimating item</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr key={i.id} className={cx(!i.calc_key && "bg-amber-50/60")}>
                    <td className="px-3 py-2 text-xs text-slate-500">{i.product_code}</td>
                    <td className="px-3 py-2">
                      {i.description}
                      <span className="block text-xs text-slate-500">{[i.profile, i.finish, i.thickness_mm && `${Number(i.thickness_mm)} BMT`, i.cover_width_mm && `${Number(i.cover_width_mm)} cover`, i.length_mm && `${Number(i.length_mm) / 1000} m`, i.pack_qty && `pack ${Number(i.pack_qty)}`].filter(Boolean).join(" · ")}</span>
                      {i.problem && <span className="block text-xs text-red-700">{i.problem}</span>}
                    </td>
                    <td className="px-3 py-2">{UNIT_SHORT[i.unit] ?? i.unit}</td>
                    <td className="px-3 py-2 text-right">{money(i.cost_ex_gst)}</td>
                    <td className="px-3 py-2">{canEdit ? <ItemKeySelect key={`${i.id}:${i.calc_key}`} itemId={i.id} value={i.calc_key} /> : (i.calc_key ? CALC_KEY_MAP[i.calc_key]?.label : "—")}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{show === "unmapped" ? "Every row is mapped." : "No rows."}</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              {page > 1 ? <Link href={href({ page: page - 1 })} className="text-brand-600 hover:underline">← Previous</Link> : <span />}
              <span className="text-slate-500">Page {page} of {pages}</span>
              {page < pages ? <Link href={href({ page: page + 1 })} className="text-brand-600 hover:underline">Next →</Link> : <span />}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
