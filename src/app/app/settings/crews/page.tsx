import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { siteUrl } from "@/lib/format";
import { addCrew, deleteCrew, resetCrewLink, updateCrew } from "../actions";

export const metadata: Metadata = { title: "Crews & pay" };

type CrewRow = {
  id: string; name: string; color: string; phone: string | null; language: "en" | "es"; public_token: string; is_subcontractor: boolean;
  rate_per_square: number; steep_adder: number; high_steep_adder: number; layer_adder: number; low_slope_rate: number;
};

const RATES: [keyof CrewRow, string, string][] = [
  ["rate_per_square", "Install rate / sq", "Base pay per installed square"],
  ["steep_adder", "Steep adder / sq", "8/12 – 9/12 sections"],
  ["high_steep_adder", "High-steep adder / sq", "10/12 and steeper"],
  ["layer_adder", "Extra layer / sq", "Per layer beyond the first"],
  ["low_slope_rate", "Low-slope rate / sq", "Under 3/12 (replaces base rate)"],
];

export default async function Page() {
  const { supabase, isAdmin } = await requireMoneyAccess();
  const { data } = await supabase.from("crews").select("*").order("name");
  const crews = (data ?? []) as CrewRow[];
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Crew pay is computed from the accepted estimate&apos;s measurements: each roof section&apos;s installed squares (sloped area, no waste) × the rates below.
        Each crew gets a private work-order link that shows their jobs in their language — materials and quantities, never prices.
      </p>
      {crews.map((c) => (
        <Card key={c.id} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name} {c.is_subcontractor ? <Badge>Subcontractor</Badge> : <Badge tone="blue">Employees</Badge>}</span>}>
          <ActionForm action={updateCrew} className="space-y-4" >
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
              <Field label="Crew phone" hint="Gets rain-day texts"><Input name="phone" type="tel" defaultValue={c.phone ?? ""} /></Field>
              <Field label="Work order language">
                <Select name="language" defaultValue={c.language}><option value="en">English</option><option value="es">Español</option></Select>
              </Field>
              <Field label="Color"><input name="color" type="color" defaultValue={c.color} className="h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_subcontractor" defaultChecked={c.is_subcontractor} className="h-4 w-4 accent-brand-500" />Subcontractor (paid per square)</label>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pay sheet</legend>
              <div className="grid gap-3 sm:grid-cols-5">
                {RATES.map(([k, l, hint]) => (
                  <Field key={k} label={l} hint={hint}><Input name={k} type="number" step="0.01" min="0" defaultValue={Number(c[k])} /></Field>
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
          <Input name="name" placeholder="Crew name (e.g. Miguel's crew)" required />
          <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label="Crew color" />
          <SubmitButton variant="secondary">Add</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
