import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { Field, Input, Select } from "@/components/ui";
import { AU_STATES, AU_STATE_NAME } from "@/lib/au";
import { AbnInput } from "@/app/app/settings/abn-input";
import { getUser } from "@/lib/dal";
import { createCompany } from "./actions";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const user = await getUser();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">Set up your roofing company</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          We&apos;ll load a starter price book (sheeting, tiles, flashings, labour and more) that you can edit later, and tailor quotes and contracts to your state.
          Joining an existing company? Ask your admin for an invite link instead.
        </p>
        <ActionForm action={createCompany} className="space-y-4">
          <Field label="Company name"><Input name="name" placeholder="Summit Roofing Pty Ltd" required /></Field>
          <Field label="Your name"><Input name="full_name" defaultValue={user.fullName} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input name="phone" type="tel" placeholder="04xx xxx xxx" /></Field>
            <Field label="State"><Select name="state" defaultValue="NSW" required>{AU_STATES.map((s) => <option key={s} value={s}>{AU_STATE_NAME[s]}</option>)}</Select></Field>
          </div>
          <Field label="ABN" hint="Shown on every quote and tax invoice. You can add it later in Settings."><AbnInput defaultValue="" /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="gst_registered" defaultChecked className="h-5 w-5 accent-brand-500" />
            Registered for GST (quotes and tax invoices include 10% GST)
          </label>
          <SubmitButton className="w-full">Create company</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
