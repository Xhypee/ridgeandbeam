import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import type { CatalogItem } from "@/lib/types";
import { deleteCatalogItem, saveCatalogItem } from "../actions";

export const metadata: Metadata = { title: "Price book" };

export default async function Page() {
  const { supabase } = await requireOrg();
  const { data: catalog } = await supabase.from("catalog_items").select("*").order("category").order("calc_key").order("name");
  return (
    <div className="space-y-6">
        <Card title="Price book">
          <p className="mb-4 text-sm text-slate-500">
            Items with a <span className="rounded bg-brand-50 px-1 text-brand-700">calculator</span> tag are filled in automatically from roof measurements. Set your real costs here.
          </p>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_6rem_7rem_7rem_auto] gap-2 px-1 text-xs font-medium text-slate-500 md:grid">
              <span>Item</span><span>Unit</span><span>Price</span><span>Category</span><span />
            </div>
            {((catalog ?? []) as CatalogItem[]).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <ActionForm action={saveCatalogItem} className="flex-1">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_6rem_7rem_7rem_auto]">
                    <div className="col-span-2 flex items-center gap-2 md:col-span-1">
                      <Input name="name" defaultValue={c.name} aria-label="Name" />
                      {c.calc_key && <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">calculator</span>}
                    </div>
                    <Input name="unit" defaultValue={c.unit} aria-label="Unit" />
                    <Input name="unit_price" type="number" step="0.01" min="0" defaultValue={c.unit_price} aria-label="Unit price" />
                    <Select name="category" defaultValue={c.category} aria-label="Category">
                      <option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option>
                    </Select>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </div>
                </ActionForm>
                <form action={deleteCatalogItem}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="ghost" confirm={`Remove ${c.name} from the price book?`}>✕</SubmitButton>
                </form>
              </div>
            ))}
          </div>
          <ActionForm action={saveCatalogItem} className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Add item</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_6rem_7rem_7rem_auto]">
              <Input name="name" placeholder="Skylight flashing kit" className="col-span-2 md:col-span-1" required />
              <Input name="unit" placeholder="ea" />
              <Input name="unit_price" type="number" step="0.01" min="0" placeholder="0.00" />
              <Select name="category" defaultValue="material"><option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option></Select>
              <SubmitButton>Add</SubmitButton>
            </div>
          </ActionForm>
        </Card>

    </div>
  );
}
