import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocumentView } from "@/components/document-view";
import { PrintButton } from "@/components/print-button";
import { Input } from "@/components/ui";
import { anonClient } from "@/lib/public";
import type { PublicDocument } from "@/lib/types";
import { acceptEstimate } from "./actions";

export const metadata: Metadata = { title: "Your estimate", robots: { index: false } };

export default async function PublicEstimate({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_document", { p_kind: "estimate", p_token: token });
  if (!data) notFound();
  const doc = data as PublicDocument;
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4 sm:px-0"><PrintButton /></div>
      <DocumentView doc={doc} />
      {doc.status === "sent" && (
        <section className="no-print mx-auto mt-6 max-w-3xl rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Accept this estimate</h2>
          <p className="mb-4 text-sm text-slate-500">Typing your name below acts as your signature.</p>
          <ActionForm action={acceptEstimate} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <Input name="name" placeholder="Your full name" autoComplete="name" required className="max-w-sm" />
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="agree" className="mt-0.5 accent-brand-500" required />
              I authorize {doc.org.name} to perform the work described above for the total shown, under the stated terms.
            </label>
            <SubmitButton>Accept & sign</SubmitButton>
          </ActionForm>
        </section>
      )}
      {doc.status === "accepted" && (
        <section className="no-print mx-auto mt-6 max-w-3xl rounded-2xl bg-green-50 p-6 text-green-900 ring-1 ring-green-200">
          <h2 className="text-lg font-semibold">Thank you{doc.accepted_name ? `, ${doc.accepted_name.split(" ")[0]}` : ""}!</h2>
          <p className="mt-1 text-sm">Your acceptance has been recorded. {doc.org.name} will be in touch to schedule your project.</p>
        </section>
      )}
      {doc.status === "declined" && (
        <p className="no-print mx-auto mt-6 max-w-3xl rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">This estimate was declined. Contact {doc.org.name} if you&apos;d like a revised quote.</p>
      )}
    </main>
  );
}
