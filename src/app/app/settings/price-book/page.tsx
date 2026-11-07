import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { isLegacyItem, TIER_LABEL, TIERS, type CatalogRow } from "@/lib/estimating";
import { calcKeyLabel, calcKeyUnit, CALCULATOR_KEYS, coverWidthMm, DEFAULT_SETTINGS, METAL_PROFILE_INFO, METAL_PROFILES, normalizeCalcSettings, type CalcSettings } from "@/lib/roof";
import { IconSheet, ItemIcon } from "@/components/item-icons";
import { blurbFor, isExtraItem } from "@/lib/docket";
import { addAustralianItems, deletePriceBookItem, saveCalcDefaults, saveInstantQuoteRates, savePriceBookItem } from "./actions";

export const metadata: Metadata = { title: "Price book" };

const UNIT: Record<string, string> = { m2: "m²" };
const unitLabel = (u: string) => UNIT[u] ?? u;

const ASSUMPTIONS: { key: Exclude<keyof CalcSettings, "coverWidthMm">; label: string; step?: string; hint?: string }[] = [
  { key: "tilesPerM2", label: "Tiles per m²", step: "0.1", hint: "Monier Elabana-type concrete ≈ 9.9" },
  { key: "ridgeTilesPerLm", label: "Ridge tiles per lm", step: "0.1" },
  { key: "battenGaugeMm", label: "Batten gauge (mm)" },
  { key: "pointingLmPerBag", label: "Pointing: lm per bag", step: "0.5" },
  { key: "sarkingRollM2", label: "Sarking roll (m²)", step: "0.1", hint: "1350 mm × 30 m = 40.5" },
  { key: "safetyMeshRollM2", label: "Safety mesh roll (m²)", step: "0.1", hint: "Check your supplier's roll" },
  { key: "supportSpacingMm", label: "Batten / purlin spacing (mm)" },
  { key: "screwsPerSheetPerSupport", label: "Screws per sheet per support", hint: "Lysaght PAB04 method" },
  { key: "screwsPerBox", label: "Screws per box" },
  { key: "overhangMm", label: "Sheet overhang (mm)" },
  { key: "lapPct", label: "Laps on capping (%)", step: "0.5" },
  { key: "steepAboveDeg", label: "Steep allowance above (°)", step: "0.5" },
  { key: "skipBinM3", label: "Skip bin size (m³)", step: "0.5" },
];

export default async function Page({ searchParams }: PageProps<"/app/settings/price-book">) {
  const { legacy } = await searchParams;
  const showLegacy = legacy === "1";
  const { supabase, org, isAdmin } = await requireMoneyAccess();
  const { data } = await supabase.from("catalog_items").select("*").order("calc_key", { nullsFirst: false }).order("tier", { nullsFirst: true }).order("name");
  const all = (data ?? []) as CatalogRow[];
  const legacyItems = all.filter(isLegacyItem);
  const catalog = all.filter((c) => !isLegacyItem(c));
  const floor = Number(org.min_margin_pct) || 0;
  const inc = org.prices_include_gst !== false && org.gst_registered !== false;
  const priceLabel = org.gst_registered === false ? "Price" : inc ? "Price inc GST" : "Price ex GST";
  const marginPct = (price: number, cost: number) => {
    const ex = inc ? price / 1.1 : price;
    return ex > 0 ? Math.round(((ex - cost) / ex) * 1000) / 10 : null;
  };
  const auItems = catalog.filter((c) => c.calc_key);
  const unpriced = auItems.filter((c) => !(Number(c.unit_price) > 0)).length;
  const settings = normalizeCalcSettings((org as typeof org & { calc_defaults?: unknown }).calc_defaults);
  const iq = (org.instant_quote ?? {}) as unknown as Record<string, number | undefined>;

  const groups = new Map<string, CatalogRow[]>();
  for (const c of catalog) {
    const k = c.calc_key ?? "__custom";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "__custom" ? 1 : b === "__custom" ? -1 : (CALCULATOR_KEYS.indexOf(a) + 1 || 99) - (CALCULATOR_KEYS.indexOf(b) + 1 || 99)));
  const rowsFor = (k: string) => groups.get(k) ?? [];

  const ItemRow = ({ c }: { c: CatalogRow }) => {
    const mp = marginPct(Number(c.unit_price), Number(c.unit_cost));
    const sheet = c.calc_key === "metal_sheet";
    return (
      <div className="rounded-lg p-2 ring-1 ring-slate-100" data-testid="price-row">
        <div className="flex items-start gap-2">
          <ActionForm action={savePriceBookItem} className="min-w-0 flex-1">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1fr_7.5rem_4.5rem_6.5rem_6.5rem_4rem_8rem_auto]">
              <Input name="name" defaultValue={c.name} aria-label="Name" className="col-span-2 sm:col-span-4 lg:col-span-1" />
              <Select name="tier" defaultValue={c.tier ?? ""} aria-label="Tier">
                <option value="">Any option</option>
                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </Select>
              <Input name="unit" defaultValue={c.unit} aria-label="Unit" />
              <Input name="unit_price" type="number" step="0.01" min="0" defaultValue={c.unit_price} aria-label={priceLabel} />
              <Input name="unit_cost" type="number" step="0.01" min="0" defaultValue={c.unit_cost} aria-label="Cost ex GST" />
              <span className={`self-center text-right text-sm tabular-nums ${mp != null && mp < floor ? "font-semibold text-red-700" : "text-slate-600"}`} title="Margin on the ex-GST price">
                {mp == null ? "—" : `${mp}%`}
              </span>
              <Select name="category" defaultValue={c.category} aria-label="Category">
                <option value="material">Material</option><option value="labor">Labour</option><option value="other">Other</option>
              </Select>
              <SubmitButton variant="secondary">Save</SubmitButton>
              <label className="col-span-2 flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-slate-700 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500 sm:col-span-1 lg:col-span-1 lg:justify-self-start lg:pr-5" title="Extras show under “Often added” on the docket: the customer can tap to add them">
                <input type="hidden" name="extra_present" value="1" />
                <input type="checkbox" name="is_extra" defaultChecked={isExtraItem(c)} className="h-4 w-4 accent-brand-500" aria-label="Extra" data-testid="extra-flag" />
                Extra
              </label>
              <Input name="blurb" defaultValue={c.blurb ?? ""} placeholder={isExtraItem(c) ? blurbFor(c.calc_key, []) ?? "Why add it (shown to the customer)" : "Why add it (shown to the customer)"} aria-label="Why add it" maxLength={200} className="col-span-2 sm:col-span-3 lg:col-span-7" />
              {sheet && (
                <>
                  <Select name="profile" defaultValue={c.profile ?? ""} aria-label="Sheet profile" className="col-span-2 lg:col-span-1">
                    <option value="">Profile…</option>
                    {METAL_PROFILES.map((p) => <option key={p} value={p}>{METAL_PROFILE_INFO[p].label}</option>)}
                  </Select>
                  <Input name="finish" defaultValue={c.finish ?? ""} placeholder="COLORBOND / ZINCALUME" aria-label="Finish" className="col-span-2 lg:col-span-2" />
                  <Input name="cover_width_mm" type="number" min="100" max="2000" defaultValue={c.cover_width_mm ?? ""} placeholder="Cover mm" aria-label="Cover width mm" />
                  <Input name="warranty" defaultValue={c.warranty ?? ""} placeholder="Warranty text for this option (optional)" aria-label="Warranty" className="col-span-2 lg:col-span-4" />
                </>
              )}
            </div>
          </ActionForm>
          <form action={deletePriceBookItem}>
            <input type="hidden" name="id" value={c.id} />
            <SubmitButton variant="ghost" confirm={`Remove ${c.name} from the price book?`}>✕</SubmitButton>
          </form>
        </div>
        {c.supplier_price_item_id && <p className="mt-1 px-1 text-xs text-teal-700">Linked to a supplier price sheet row</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {auItems.length > 0 && unpriced === auItems.length ? (
        <section className="rounded-xl bg-ink p-5 text-white sm:p-6" data-testid="price-empty-state">
          <h2 className="text-xl font-semibold">Set your prices or import a supplier price sheet</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/80">
            Your price book lists every item the roof calculator measures, from COLORBOND sheet to skip bins, all at $0. Trade prices are different for every roofer, so we don&apos;t guess them.
            Import your supplier&apos;s price sheet, or type your own sell price and cost for each item below.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/app/settings/suppliers" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-ink">Import a supplier price sheet</Link>
            <a href="#items" className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white ring-1 ring-white/40">Enter prices below</a>
          </div>
        </section>
      ) : (
        <Card title="Price book">
          <p className="text-sm text-slate-500">
            Calculator items are filled in from roof measurements. Sell prices are {inc ? "GST-inclusive" : "ex GST"}; costs are always ex GST.
            Give a sheet item an option (Good / Better / Best) to swap it per option, e.g. ZINCALUME Custom Orb in Good and COLORBOND Klip-Lok in Best.
            Tick <b>Extra</b> to offer an item under “Often added” on the docket instead of always including it (sarking, gutters, fascia, safety mesh, edge protection, whirlybirds and skip bins are extras to start with).
            Margins below your {floor}% minimum are flagged. {unpriced > 0 && <b className="text-amber-700">{unpriced} calculator item{unpriced === 1 ? " is" : "s are"} still $0.</b>}
          </p>
        </Card>
      )}

      {auItems.length === 0 && (
        <Card title="Australian price book">
          <p className="mb-3 text-sm text-slate-600">Your company was set up before the Australian price book. Add the items the roof calculator uses (metal sheet, capping, tiles, sarking, labour, skip bins…) at $0, then set your prices.</p>
          {isAdmin ? (
            <ActionForm action={addAustralianItems}><SubmitButton>Add Australian items</SubmitButton></ActionForm>
          ) : <p className="text-sm text-slate-500">Ask an owner or admin to add them.</p>}
        </Card>
      )}

      <div id="items" className="space-y-6">
        {keys.map((k) => (
          <Card key={k} title={k === "__custom" ? <span className="flex items-center gap-3"><ItemIcon calcKey={null} size={20} />Other items (not from the calculator)</span> : <span className="flex flex-wrap items-center gap-3"><ItemIcon calcKey={k} size={20} />{calcKeyLabel(k)} <Badge tone="slate">per {unitLabel(calcKeyUnit(k))}</Badge>{rowsFor(k).some(isExtraItem) && <Badge tone="teal">Extra</Badge>}</span>}>
            <div className="space-y-3">
              <div className="hidden grid-cols-[1fr_7.5rem_4.5rem_6.5rem_6.5rem_4rem_8rem_auto] gap-2 px-1 text-xs font-medium text-slate-500 lg:grid">
                <span>Item</span><span>Option</span><span>Unit</span><span>{priceLabel}</span><span>Cost ex GST</span><span className="text-right">Margin</span><span>Category</span><span />
              </div>
              {rowsFor(k).map((c) => <ItemRow key={c.id} c={c} />)}
            </div>
          </Card>
        ))}
      </div>

      <Card title="Add item">
        <ActionForm action={savePriceBookItem}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1fr_11rem_6.5rem_4.5rem_6.5rem_6.5rem_7rem_auto]">
            <Input name="name" placeholder="Skylight flashing kit" className="col-span-2 sm:col-span-4 lg:col-span-1" required aria-label="New item name" />
            <Select name="calc_key" defaultValue="" aria-label="Calculator item">
              <option value="">Not from calculator</option>
              {CALCULATOR_KEYS.map((k) => <option key={k} value={k}>{calcKeyLabel(k)}</option>)}
            </Select>
            <Select name="tier" defaultValue="" aria-label="Tier"><option value="">Any option</option>{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</Select>
            <Input name="unit" placeholder="ea" aria-label="New unit" />
            <Input name="unit_price" type="number" step="0.01" min="0" placeholder={priceLabel} aria-label="New price" required />
            <Input name="unit_cost" type="number" step="0.01" min="0" placeholder="Cost ex GST" aria-label="New cost" />
            <Select name="category" defaultValue="material" aria-label="New category"><option value="material">Material</option><option value="labor">Labour</option><option value="other">Other</option></Select>
            <SubmitButton>Add</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title="Item icons">
        <p className="mb-4 text-sm text-slate-500">Each line on the docket gets the icon of its calculator item. Lines you add yourself get the parcel.</p>
        <IconSheet />
      </Card>

      <Card title="Calculator assumptions">
        <ActionForm action={saveCalcDefaults}>
          <fieldset disabled={!isAdmin}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ASSUMPTIONS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input name={f.key} type="number" min="0" step={f.step ?? "1"} defaultValue={settings[f.key] ?? DEFAULT_SETTINGS[f.key]} aria-label={f.label} />
                </Field>
              ))}
              {METAL_PROFILES.map((p) => (
                <Field key={p} label={`${METAL_PROFILE_INFO[p].label} cover (mm)`} hint={METAL_PROFILE_INFO[p].verified ? undefined : "Not verified: check the spec"}>
                  <Input name={`cover_${p}`} type="number" min="100" max="2000" defaultValue={coverWidthMm(p, settings)} aria-label={`${METAL_PROFILE_INFO[p].label} cover width`} />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">New quotes start with these. Each quote can still change them under “Calculator assumptions for this quote”.</p>
            {isAdmin && <SubmitButton className="mt-3">Save assumptions</SubmitButton>}
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Instant quote rates (website widget)">
        <ActionForm action={saveInstantQuoteRates}>
          <fieldset disabled={!isAdmin}>
            <p className="mb-3 text-sm text-slate-500">Installed price per m² of roof, including GST, for the price range homeowners see. Leave at $0 to collect the enquiry without showing a range.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Metal re-roof: low $/m²"><Input name="metal_m2_low" type="number" min="0" step="1" defaultValue={iq.metal_m2_low ?? 0} /></Field>
              <Field label="Metal re-roof: high $/m²"><Input name="metal_m2_high" type="number" min="0" step="1" defaultValue={iq.metal_m2_high ?? 0} /></Field>
              <Field label="Tile re-roof: low $/m²"><Input name="tile_m2_low" type="number" min="0" step="1" defaultValue={iq.tile_m2_low ?? 0} /></Field>
              <Field label="Tile re-roof: high $/m²"><Input name="tile_m2_high" type="number" min="0" step="1" defaultValue={iq.tile_m2_high ?? 0} /></Field>
            </div>
            {isAdmin && <SubmitButton className="mt-3">Save rates</SubmitButton>}
          </fieldset>
        </ActionForm>
      </Card>

      {legacyItems.length > 0 && (
        <Card title={<span className="flex items-center gap-2">Legacy items <Badge tone="slate">{legacyItems.length}</Badge></span>}
          actions={<Link href={showLegacy ? "/app/settings/price-book" : "/app/settings/price-book?legacy=1"} className="text-sm font-medium text-brand-700 hover:underline" data-testid="legacy-toggle">{showLegacy ? "Hide legacy items" : "Show legacy items"}</Link>}>
          {showLegacy ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">These were set up before the Australian calculator (for example shingles or permits). The calculator no longer uses them; delete them or keep them for old quotes.</p>
              {legacyItems.map((c) => <ItemRow key={c.id} c={c} />)}
            </div>
          ) : <p className="text-sm text-slate-500">Items from the old price book are hidden.</p>}
        </Card>
      )}
    </div>
  );
}
