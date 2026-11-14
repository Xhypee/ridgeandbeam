import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, LinkButton, PageHeader } from "@/components/ui";
import { createCustomer } from "../actions";
import { CustomerFields } from "../customer-fields";
import { JobKind } from "./job-kind";

export const metadata: Metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="New customer" />
      <Card className="max-w-3xl">
        <ActionForm action={createCustomer} className="space-y-6">
          <CustomerFields />
          <div className="rounded-lg bg-slate-50 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" name="create_job" defaultChecked className="h-4 w-4 accent-brand-500" />
              Also open a job for this customer
            </label>
            <Field label="Job title" className="mt-3 max-w-sm"><Input name="job_title" placeholder="Roof inspection" /></Field>
            <JobKind />
          </div>
          <div className="flex gap-2">
            <SubmitButton>Save customer</SubmitButton>
            <LinkButton href="/app/contacts" variant="ghost">Cancel</LinkButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
