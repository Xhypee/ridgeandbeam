import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/document-view";
import { PrintButton } from "@/components/print-button";
import { anonClient } from "@/lib/public";
import type { PublicDocument } from "@/lib/types";

export const metadata: Metadata = { title: "Your invoice", robots: { index: false } };

export default async function PublicInvoice({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_document", { p_kind: "invoice", p_token: token });
  if (!data) notFound();
  const doc = data as PublicDocument;
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4 sm:px-0"><PrintButton /></div>
      <DocumentView doc={doc} />
      {doc.status === "paid" ? (
        <p className="no-print mx-auto mt-6 max-w-3xl rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Paid in full. Thank you for your business!</p>
      ) : (
        <p className="no-print mx-auto mt-6 max-w-3xl rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
          To pay, contact {doc.org.name}{doc.org.phone ? ` at ${doc.org.phone}` : ""}{doc.org.email ? ` or ${doc.org.email}` : ""}.
        </p>
      )}
    </main>
  );
}
