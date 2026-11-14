import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { createJob } from "../actions";
import { JobFields } from "../job-fields";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: PageProps<"/app/jobs/new">) {
  const { supabase } = await requireOrg();
  const { customer } = await searchParams;
  const { data: customers } = await supabase.from("customers").select("id, name, address, city, state, zip").order("name");
  const selected = (customers ?? []).find((c) => c.id === customer);

  if (!customers?.length) {
    return (
      <>
        <PageHeader title="New job" />
        <Empty title="Add a customer first">
          <LinkButton href="/app/contacts?new=1" className="mt-3">New customer</LinkButton>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New job" />
      <Card className="max-w-3xl">
        <ActionForm action={createJob} className="space-y-6">
          <Field label="Customer">
            <Select name="customer_id" defaultValue={selected?.id ?? ""} required>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <JobFields defaultAddress={selected ? [selected.address, selected.city, selected.state, selected.zip].filter(Boolean).join(", ") : ""} />
          <div className="flex gap-2">
            <SubmitButton>Create job</SubmitButton>
            <LinkButton href="/app/jobs" variant="ghost">Cancel</LinkButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
