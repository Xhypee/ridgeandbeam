import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Card, Input, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { label, siteUrl } from "@/lib/format";
import { inviteMember, removeMember, revokeInvite } from "../actions";

export const metadata: Metadata = { title: "Team" };

export default async function Page() {
  const { supabase, org, isAdmin, user } = await requireOrg();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, full_name, email").eq("org_id", org.id).order("created_at"),
    isAdmin ? supabase.from("invites").select("*").is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="space-y-6">
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
                  <Select name="role" defaultValue="member" className="w-auto"><option value="member">Office</option><option value="sales_rep">Sales rep</option><option value="crew_lead">Crew lead</option><option value="admin">Admin</option></Select>
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
  );
}
