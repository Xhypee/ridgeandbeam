import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Card, Field, Input, Select } from "@/components/ui";
import { requireOrg, ROLE_LABEL } from "@/lib/dal";
import { label, siteUrl } from "@/lib/format";
import { inviteMember, removeMember, revokeInvite, updateMember } from "../actions";

export const metadata: Metadata = { title: "Team" };

type Member = { user_id: string; role: string; full_name: string | null; email: string | null; phone: string | null; crew_id: string | null; commission_plan_id: string | null };

export default async function Page() {
  const { supabase, org, isAdmin, user } = await requireOrg();
  const [{ data: members }, { data: invites }, { data: crews }, { data: plans }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, full_name, email, phone, crew_id, commission_plan_id").eq("org_id", org.id).order("created_at"),
    isAdmin ? supabase.from("invites").select("*").is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("crews").select("id, name").order("name"),
    supabase.from("commission_plans").select("id, name").order("name"),
  ]);
  const crewName = new Map((crews ?? []).map((c) => [c.id, c.name]));
  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
          <Card title="Team">
            <ul className="mb-4 divide-y divide-slate-100">
              {((members ?? []) as Member[]).map((m) => (
                <li key={m.user_id} className="py-2" data-testid="member">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.full_name || m.email}{m.user_id === user.id && " (you)"}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {ROLE_LABEL[m.role] ?? label(m.role)} · {m.email}
                        {m.crew_id && ` · ${crewName.get(m.crew_id) ?? "crew"}`}
                        {m.commission_plan_id && ` · ${planName.get(m.commission_plan_id) ?? "plan"}`}
                        {m.phone && ` · ${m.phone}`}
                      </span>
                    </span>
                    {isAdmin && m.role !== "owner" && m.user_id !== user.id && (
                      <form action={removeMember}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <SubmitButton variant="ghost" confirm={`Remove ${m.full_name || m.email} from ${org.name}?`}>Remove</SubmitButton>
                      </form>
                    )}
                  </div>
                  {isAdmin && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-brand-600">Role, crew & commission</summary>
                      <ActionForm action={updateMember} className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <Field label="Role">
                          {m.role === "owner" || m.user_id === user.id ? (
                            <Input value={ROLE_LABEL[m.role] ?? m.role} disabled />
                          ) : (
                            <Select name="role" defaultValue={m.role}>
                              <option value="member">Office</option><option value="sales_rep">Sales rep</option><option value="crew_lead">Crew lead</option><option value="admin">Admin</option>
                            </Select>
                          )}
                        </Field>
                        <Field label="Crew" hint="Crew leads see only this crew's jobs">
                          <Select name="crew_id" defaultValue={m.crew_id ?? ""}>
                            <option value="">None</option>
                            {(crews ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </Field>
                        <Field label="Commission plan">
                          <Select name="commission_plan_id" defaultValue={m.commission_plan_id ?? ""}>
                            <option value="">None</option>
                            {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </Select>
                        </Field>
                        <Field label="Mobile phone"><Input name="phone" type="tel" defaultValue={m.phone ?? ""} /></Field>
                        <div className="flex items-end"><SubmitButton variant="secondary">Save</SubmitButton></div>
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {isAdmin && (
              <>
                <ActionForm action={inviteMember} className="flex flex-wrap gap-2">
                  <Input name="email" type="email" placeholder="teammate@company.com" className="min-w-48 flex-1" required />
                  <Select name="role" defaultValue="member" className="w-auto"><option value="member">Office</option><option value="sales_rep">Sales rep</option><option value="crew_lead">Crew lead</option><option value="admin">Admin</option></Select>
                  <SubmitButton variant="secondary">Invite</SubmitButton>
                </ActionForm>
                <p className="mt-2 text-xs text-slate-500">Crew leads see the schedule and Field/Production for their crew&apos;s jobs, without prices. Sales reps see only their own commissions.</p>
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
  );
}
