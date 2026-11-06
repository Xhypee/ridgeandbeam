import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextStr = typeof next === "string" ? next : "/app";
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-slate-500">Set up your roofing company in a couple of minutes.</p>
      <ActionForm action={signup} className="space-y-4">
        <input type="hidden" name="next" value={nextStr} />
        <Field label="Your name"><Input name="full_name" autoComplete="name" required /></Field>
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" hint="At least 8 characters."><Input name="password" type="password" minLength={8} autoComplete="new-password" required /></Field>
        <SubmitButton className="w-full">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account? <Link className="font-medium text-brand-600 hover:underline" href={`/login?next=${encodeURIComponent(nextStr)}`}>Sign in</Link>
      </p>
    </>
  );
}
