import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Join your team" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/signup?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">You&apos;ve been invited</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Signed in as {String(data.claims.email ?? "")}. The invite must match this email.</p>
        <ActionForm action={acceptInvite}>
          <input type="hidden" name="token" value={token} />
          <SubmitButton className="w-full">Join the team</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
