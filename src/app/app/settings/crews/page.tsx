import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Input } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import type { Crew } from "@/lib/types";
import { addCrew, deleteCrew } from "../actions";

export const metadata: Metadata = { title: "Crews" };

export default async function Page() {
  const { supabase } = await requireOrg();
  const { data: crews } = await supabase.from("crews").select("*").order("name");
  return (
    <div className="space-y-6">
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

    </div>
  );
}
