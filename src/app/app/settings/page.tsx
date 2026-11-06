import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { label, siteUrl } from "@/lib/format";
import type { CatalogItem, Crew } from "@/lib/types";
import { addCrew, deleteCatalogItem, deleteCrew, inviteMember, removeMember, revokeInvite, saveCatalogItem, updateCompany } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, org, isAdmin, user } = await requireOrg();
  const [{ data: catalog }, { data: crews }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("catalog_items").select("*").order("category").order("name"),
    supabase.from("crews").select("*").order("name"),
    supabase.from("memberships").select("user_id, role, full_name, email").eq("org_id", org.id).order("created_at"),
    isAdmin ? supabase.from("invites").select("*").is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle={org.name} />
      <div className="space-y-6">
        <Card title="Company">
          <ActionForm action={updateCompany} className="space-y-4">
            <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name"><Input name="name" defaultValue={org.name} required /></Field>
              <Field label="License #"><Input name="license_number" defaultValue={org.license_number ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={org.phone ?? ""} /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={org.email ?? ""} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
              <Field label="Default sales tax %"><Input name="tax_rate" type="number" step="0.001" min="0" defaultValue={org.tax_rate} /></Field>
              <Field label="Default waste %"><Input name="default_waste_pct" type="number" step="1" min="0" max="50" defaultValue={org.default_waste_pct} /></Field>
              <Field label="Default estimate terms"><Textarea name="estimate_terms" defaultValue={org.estimate_terms} /></Field>
              <Field label="Default invoice terms"><Textarea name="invoice_terms" defaultValue={org.invoice_terms} /></Field>
            </fieldset>
            {isAdmin ? <SubmitButton>Save company</SubmitButton> : <p className="text-sm text-slate-500">Only owners and admins can edit company settings.</p>}
          </ActionForm>
        </Card>

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

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Crews">
            <ul className="mb-4 space-y-2">
              {((crews ?? []) as Crew[]).map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}</span>
                  <form action={deleteCrew}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant="ghost" confirm={`Delete crew ${c.name}? Jobs assigned to it become unassigned.`}>✕</SubmitButton>
                  </form>
                </li>
              ))}
              {(crews ?? []).length === 0 && <li className="text-sm text-slate-500">No crews yet.</li>}
            </ul>
            <ActionForm action={addCrew} className="flex gap-2">
              <Input name="name" placeholder="Crew name (e.g. Miguel's crew)" required />
              <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label="Crew color" />
              <SubmitButton variant="secondary">Add</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Team">
            <ul className="mb-4 divide-y divide-slate-100">
              {(members ?? []).map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{m.full_name || m.email}{m.user_id === user.id && " (you)"}</span>
                    <span className="text-xs text-slate-500">{label(m.role)} · {m.email}</span>
                  </span>
                  {isAdmin && m.role !== "owner" && m.user_id !== user.id && (
                    <form action={removeMember}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <SubmitButton variant="ghost" confirm={`Remove ${m.full_name || m.email} from ${org.name}?`}>Remove</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {isAdmin && (
              <>
                <ActionForm action={inviteMember} className="flex flex-wrap gap-2">
                  <Input name="email" type="email" placeholder="teammate@company.com" className="min-w-48 flex-1" required />
                  <Select name="role" defaultValue="member" className="w-auto"><option value="member">Member</option><option value="admin">Admin</option></Select>
                  <SubmitButton variant="secondary">Invite</SubmitButton>
                </ActionForm>
                {(invites ?? []).length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {(invites ?? []).map((i: { id: string; email: string; role: string; token: string }) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span>{i.email} <span className="text-xs text-slate-500">· {label(i.role)} · pending</span></span>
                        <span className="flex gap-1">
                          <CopyLink url={`${siteUrl()}/invite/${i.token}`} label="Copy invite link" />
                          <form action={revokeInvite}>
                            <input type="hidden" name="id" value={i.id} />
                            <SubmitButton variant="ghost">Revoke</SubmitButton>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
