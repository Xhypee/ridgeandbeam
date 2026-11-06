import type { SupabaseClient } from "@supabase/supabase-js";
import { money } from "@/lib/format";
import { UNIT_SHORT } from "@/lib/price-sheet";
import { compareSuppliers, type PriceBookOptions, type SupplierComparison } from "@/lib/suppliers";

/**
 * Side-by-side unit cost (ex GST) per calc key for each supplier with an active price sheet,
 * cheapest highlighted. Trade costs: only render for people who can see money (never crew leads
 * or homeowners).
 */
export function SupplierCompare({ data, emptyText }: { data: SupplierComparison; emptyText?: string }) {
  if (data.suppliers.length === 0 || data.rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText ?? "Import a price sheet for two or more suppliers to compare their costs side by side."}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200" data-testid="supplier-compare">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            {data.suppliers.map((s) => <th key={s.id} className="px-3 py-2 text-right font-medium">{s.name}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.rows.map((r) => (
            <tr key={r.calc_key}>
              <td className="px-3 py-2">
                <span className="font-medium text-slate-800">{r.label}</span>
                <span className="block text-xs text-slate-500">per {UNIT_SHORT[r.per] ?? r.per}{r.per !== r.unit ? ` (${UNIT_SHORT[r.unit] ?? r.unit} price ÷ pack)` : ""}, ex GST</span>
              </td>
              {data.suppliers.map((s) => {
                const c = r.cells[s.id];
                const best = r.cheapest === s.id;
                return (
                  <td key={s.id} className="px-3 py-2 text-right align-top" title={c ? `${c.product_code ? c.product_code + " · " : ""}${c.name}` : undefined}>
                    {c ? (
                      <span className={best ? "inline-flex flex-col items-end rounded-md bg-green-50 px-2 py-0.5 font-semibold text-green-800" : "text-slate-700"}>
                        {r.per !== r.unit ? "$" + c.cost.toFixed(c.cost < 1 ? 3 : 2) : money(c.cost)}
                        {best && <span className="text-[11px] font-medium">Cheapest</span>}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Server panel E can mount on the estimate: `<SupplierComparePanel supabase={supabase} orgId={org.id} calcKeys={[…]} />`. */
export async function SupplierComparePanel({ supabase, orgId, calcKeys, profile, finish }: { supabase: SupabaseClient; orgId: string; calcKeys?: string[] } & PriceBookOptions) {
  const data = await compareSuppliers(supabase, orgId, calcKeys, { profile, finish });
  return <SupplierCompare data={data} />;
}
