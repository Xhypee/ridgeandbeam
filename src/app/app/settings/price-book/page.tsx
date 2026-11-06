import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Input, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { CERTIFICATIONS, TIER_LABEL, TIERS, type CatalogRow } from "@/lib/estimating";
import { CALC_KEY_LABEL, PRICE_BOOK_KEYS } from "@/lib/roof";
import { deletePriceBookItem, savePriceBookItem } from "./actions";

export const metadata: Metadata = { title: "Price book" };

const marginPct = (price: number, cost: number) => (price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null);

export default async function Page() {
  const { supabase, org } = await requireMoneyAccess();
  const { data } = await supabase.from("catalog_items").select("*").order("calc_key", { nullsFirst: false }).order("tier", { nullsFirst: true }).order("name");
  const catalog = (data ?? []) as CatalogRow[];
  const floor = Number(org.min_margin_pct) || 0;
  const certs = new Set((org.certifications ?? []).map((c) => c.toLowerCase()));

  const order = [...PRICE_BOOK_KEYS] as string[];
  const groups = new Map<string, CatalogRow[]>();
  for (const c of catalog) {
    const k = c.calc_key ?? "__custom";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "__custom" ? 1 : b === "__custom" ? -1 : (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)));

  return (
    <div className="space-y-6">
      <Card title="Price book">
        <p className="text-sm text-slate-500">
          Calculator items are filled in from roof measurements. Give an item a <b>tier</b> (Good / Better / Best) to swap it per option — for example a designer shingle in Better.
          Items needing a manufacturer certification are only offered once you add that certification in Company settings.
          Margins below your {floor}% floor are flagged.
        </p>
      </Card>

      {keys.map((k) => (
        <Card key={k} title={k === "__custom" ? "Other items (not from the calculator)" : <span className="flex items-center gap-2">{CALC_KEY_LABEL[k] ?? k} <code className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{k}</code></span>}>
          <div className="space-y-3">
            <div className="hidden grid-cols-[1fr_6.5rem_4.5rem_6rem_6rem_4rem_7rem_auto] gap-2 px-1 text-xs font-medium text-slate-500 lg:grid">
              <span>Item</span><span>Tier</span><span>Unit</span><span>Price</span><span>Cost</span><span className="text-right">Margin</span><span>Category</span><span />
            </div>
            {groups.get(k)!.map((c) => {
              const mp = marginPct(Number(c.unit_price), Number(c.unit_cost));
              const locked = c.requires_certification && !certs.has(c.requires_certification.toLowerCase());
              return (
                <div key={c.id} className="rounded-lg p-2 ring-1 ring-slate-100" data-testid="price-row">
                  <div className="flex items-start gap-2">
                    <ActionForm action={savePriceBookItem} className="min-w-0 flex-1">
                      <input type="hidden" name="id" value={c.id} />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1fr_6.5rem_4.5rem_6rem_6rem_4rem_7rem_auto]">
                        <Input name="name" defaultValue={c.name} aria-label="Name" className="col-span-2 sm:col-span-4 lg:col-span-1" />
                        <Select name="tier" defaultValue={c.tier ?? ""} aria-label="Tier">
                          <option value="">Any tier</option>
                          {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                        </Select>
                        <Input name="unit" defaultValue={c.unit} aria-label="Unit" />
                        <Input name="unit_price" type="number" step="0.01" min="0" defaultValue={c.unit_price} aria-label="Unit price" />
                        <Input name="unit_cost" type="number" step="0.01" min="0" defaultValue={c.unit_cost} aria-label="Unit cost" />
                        <span className={`self-center text-right text-sm tabular-nums ${mp != null && mp < floor ? "font-semibold text-red-700" : "text-slate-600"}`} title="(price − cost) / price">
                          {mp == null ? "—" : `${mp}%`}
                        </span>
                        <Select name="category" defaultValue={c.category} aria-label="Category">
                          <option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option>
                        </Select>
                        <SubmitButton variant="secondary">Save</SubmitButton>
                        <Input name="warranty" defaultValue={c.warranty ?? ""} placeholder="Warranty text shown on the option (optional)" aria-label="Warranty" className="col-span-2 sm:col-span-2 lg:col-span-4" />
                        <Select name="requires_certification" defaultValue={c.requires_certification ?? ""} aria-label="Requires certification" className="col-span-2 lg:col-span-4">
                          <option value="">No certification needed</option>
                          {CERTIFICATIONS.filter((x) => x !== "Other").map((x) => <option key={x} value={x}>Requires {x}</option>)}
                          {c.requires_certification && !(CERTIFICATIONS as readonly string[]).includes(c.requires_certification) && <option value={c.requires_certification}>Requires {c.requires_certification}</option>}
                        </Select>
                      </div>
                    </ActionForm>
                    <form action={deletePriceBookItem}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton variant="ghost" confirm={`Remove ${c.name} from the price book?`}>✕</SubmitButton>
                    </form>
                  </div>
                  {locked && <p className="mt-1 px-1 text-xs"><Badge tone="amber">Not offered</Badge> <span className="text-slate-500">You haven&apos;t added {c.requires_certification} in Company settings.</span></p>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="Add item">
        <ActionForm action={savePriceBookItem}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1fr_9rem_6.5rem_4.5rem_6rem_6rem_7rem_auto]">
            <Input name="name" placeholder="Skylight flashing kit" className="col-span-2 sm:col-span-4 lg:col-span-1" required aria-label="New item name" />
            <Select name="calc_key" defaultValue="" aria-label="Calculator key">
              <option value="">Not from calculator</option>
              {PRICE_BOOK_KEYS.map((k) => <option key={k} value={k}>{CALC_KEY_LABEL[k] ?? k}</option>)}
            </Select>
            <Select name="tier" defaultValue="" aria-label="Tier"><option value="">Any tier</option>{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</Select>
            <Input name="unit" placeholder="ea" aria-label="New unit" />
            <Input name="unit_price" type="number" step="0.01" min="0" placeholder="Price" aria-label="New price" required />
            <Input name="unit_cost" type="number" step="0.01" min="0" placeholder="Cost" aria-label="New cost" />
            <Select name="category" defaultValue="material" aria-label="New category"><option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option></Select>
            <SubmitButton>Add</SubmitButton>
            <Input name="warranty" placeholder="Warranty text (optional)" className="col-span-2 lg:col-span-4" />
            <Select name="requires_certification" defaultValue="" className="col-span-2 lg:col-span-4" aria-label="New requires certification">
              <option value="">No certification needed</option>
              {CERTIFICATIONS.filter((x) => x !== "Other").map((x) => <option key={x} value={x}>Requires {x}</option>)}
            </Select>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
