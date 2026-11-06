import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { anonClient } from "@/lib/public";
import { QuoteForm } from "./quote-form";

export const metadata: Metadata = { title: "Instant roof quote", robots: { index: false } };

type IntakeOrg = {
  name: string;
  phone: string | null;
  website: string | null;
  state: string | null;
  instant_quote: { enabled?: boolean; price_per_square_low?: number; price_per_square_high?: number } | null;
};

/**
 * Embeddable instant-quote widget (no app chrome, works inside an iframe):
 * <iframe src="https://<site>/quote/<intake_key>" style="width:100%;height:1100px;border:0"></iframe>
 */
export default async function InstantQuotePage({ params }: PageProps<"/quote/[key]">) {
  const { key } = await params;
  const { data } = await anonClient().rpc("get_intake_org", { p_key: key });
  if (!data) notFound();
  const org = data as IntakeOrg;
  const iq = org.instant_quote ?? {};
  const enabled = iq.enabled !== false;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-5">
        <p className="text-sm font-medium text-brand-600">{org.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Get an instant roof replacement estimate</h1>
        <p className="mt-1 text-sm text-slate-500">Takes about a minute. No obligation.</p>
      </header>
      {enabled ? (
        <QuoteForm intakeKey={key} orgName={org.name} low={Number(iq.price_per_square_low) || 450} high={Number(iq.price_per_square_high) || 650} phone={org.phone} />
      ) : (
        <p className="rounded-xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">
          Online quotes are paused right now. {org.phone ? <>Call <a className="font-medium text-brand-700" href={`tel:${org.phone}`}>{org.phone}</a> for a free inspection.</> : "Please contact us for a free inspection."}
        </p>
      )}
    </main>
  );
}
