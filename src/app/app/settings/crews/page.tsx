import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, Field, Input } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { siteUrl } from "@/lib/format";
import { HIGH_STEEP_FROM_DEG, LOW_SLOPE_BELOW_DEG, type CrewPaySheet } from "@/lib/production";
import { DEFAULT_SETTINGS } from "@/lib/roof";
import { addCrew, deleteCrew, resetCrewLink, updateCrew } from "../actions";

export const metadata: Metadata = { title: "Crews & pay" };

type CrewRow = CrewPaySheet & {
  id: string; name: string; color: string; phone: string | null; public_token: string; is_subcontractor: boolean;
};

const STEEP = DEFAULT_SETTINGS.steepAboveDeg;
/** Pay sheet fields: [column, label, unit, hint]. */
const RATES: [keyof CrewPaySheet, string, string, string][] = [
  ["pay_rate_m2", "Install rate", "$/m²", "Base pay per m² of true (sloped) roof area"],
  ["pay_low_slope_m2", "Low-slope rate", "$/m²", `Under ${LOW_SLOPE_BELOW_DEG}° — replaces the base rate (blank = base)`],
  ["pay_steep_m2", "Steep adder", "$/m²", `Sections over ${STEEP}° (the estimate's steep setting)`],
  ["pay_high_steep_m2", "Very steep adder", "$/m²", `${HIGH_STEEP_FROM_DEG}° and over (instead of the steep adder)`],
  ["pay_strip_m2", "Strip old roof", "$/m²", "Re-roofs: strip and remove tiles or sheets (not asbestos)"],
  ["pay_gutter_lm", "New gutter", "$/lm", "Per lineal metre of eave when gutters are replaced"],
];

export default async function Page() {
  const { supabase, isAdmin } = await requireMoneyAccess();
  const { data } = await supabase.from("crews").select("*").order("name");
  const crews = (data ?? []) as CrewRow[];
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Crew pay is worked out from the accepted estimate&apos;s measurements: each roof section&apos;s true (sloped) area in m², no waste, × the rates below (ex GST).
        Each crew gets a private work-order link that shows their jobs in plain English — roof size, pitch, materials and quantities, never prices.
      </p>
      {crews.map((c) => (
        <Card key={c.id} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name} {c.is_subcontractor ? <Badge>Subcontractor</Badge> : <Badge tone="blue">Employees</Badge>}</span>}>
          <ActionForm action={updateCrew} className="space-y-4" >
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
              <Field label="Crew mobile" hint="Gets rain-day texts"><Input name="phone" type="tel" defaultValue={c.phone ?? ""} placeholder="04xx xxx xxx" /></Field>
              <Field label="Colour"><input name="color" type="color" defaultValue={c.color} className="h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_subcontractor" defaultChecked={c.is_subcontractor} className="h-4 w-4 accent-brand-500" />Subcontractor (paid from the pay sheet, reported on the TPAR)</label>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pay sheet (ex GST)</legend>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {RATES.map(([k, l, unit, hint]) => (
                  <Field key={k} label={`${l} (${unit})`} hint={hint}>
                    <div className="relative">
                      <Input name={k} type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(c[k]) || ""} placeholder="0.00" className="pr-12" aria-label={`${l} ${unit}`} />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{unit}</span>
                    </div>
                  </Field>
                ))}
              </div>
            </fieldset>
            <SubmitButton variant="secondary">Save crew</SubmitButton>
          </ActionForm>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title="Crew portal">Crew portal: /w/{c.public_token.slice(0, 6)}…</span>
            <CopyLink url={`${siteUrl()}/w/${c.public_token}`} label="Copy crew portal link" />
            <a href={`/w/${c.public_token}`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm text-brand-600 hover:bg-brand-50">Open</a>
            {isAdmin && (
              <form action={resetCrewLink}><input type="hidden" name="id" value={c.id} /><SubmitButton variant="ghost" confirm="Make a new link? The old one stops working.">New link</SubmitButton></form>
            )}
            <form action={deleteCrew}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton variant="ghost" confirm={`Delete crew ${c.name}? Jobs assigned to it become unassigned.`}>Delete</SubmitButton>
            </form>
          </div>
        </Card>
      ))}
      <Card title="Add a crew">
        {crews.length === 0 && <p className="mb-3 text-sm text-slate-500">No crews yet.</p>}
        <ActionForm action={addCrew} className="flex gap-2">
          <Input name="name" placeholder="Crew name (e.g. Dave's crew)" required />
          <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label="Crew colour" />
          <SubmitButton variant="secondary">Add</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
