import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { Field, Input } from "@/components/ui";
import { getUser } from "@/lib/dal";
import { createCompany } from "./actions";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const user = await getUser();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">Set up your roofing company</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          We&apos;ll load a starter price book (shingles, underlayment, labor and more) that you can edit later.
          Joining an existing company? Ask your admin for an invite link instead.
        </p>
        <ActionForm action={createCompany} className="space-y-4">
          <Field label="Company name"><Input name="name" placeholder="Summit Roofing LLC" required /></Field>
          <Field label="Your name"><Input name="full_name" defaultValue={user.fullName} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input name="phone" type="tel" /></Field>
            <Field label="Sales tax %"><Input name="tax_rate" type="number" step="0.001" min="0" defaultValue="0" /></Field>
          </div>
          <SubmitButton className="w-full">Create company</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
