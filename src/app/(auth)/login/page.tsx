import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { login } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextStr = typeof next === "string" ? next : "/app";
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-slate-500">Welcome back.</p>
      <ActionForm action={login} className="space-y-4">
        <input type="hidden" name="next" value={nextStr} />
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-500">
        New to Ridge & Beam? <Link className="font-medium text-brand-600 hover:underline" href={`/signup?next=${encodeURIComponent(nextStr)}`}>Create an account</Link>
      </p>
    </>
  );
}
