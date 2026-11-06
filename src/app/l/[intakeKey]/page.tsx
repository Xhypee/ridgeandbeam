import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { anonClient } from "@/lib/public";

export const metadata: Metadata = { title: "Request a free roof inspection", robots: { index: false } };

const input = "block w-full rounded-lg border-0 bg-white px-3 py-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";

/** Hosted lead form. Works standalone or inside an <iframe> on the roofer's website; posts without JavaScript. */
export default async function LeadForm({ params, searchParams }: PageProps<"/l/[intakeKey]">) {
  const { intakeKey } = await params;
  const sp = await searchParams;
  const { data } = await anonClient().rpc("get_intake_org", { p_key: intakeKey });
  if (!data) notFound();
  const org = data as { name: string; phone: string | null };
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;
  const source = typeof sp.source === "string" ? sp.source.slice(0, 50) : "website";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900">{org.name}</h1>
      {sent ? (
        <div className="mt-4 rounded-xl bg-green-50 p-4 text-green-900 ring-1 ring-green-200" role="status">
          <p className="font-medium">Thanks — we got your request.</p>
          <p className="mt-1 text-sm">Someone from {org.name} will reach out shortly{org.phone ? <>. Need us sooner? Call <a className="font-medium underline" href={`tel:${org.phone}`}>{org.phone}</a></> : ""}.</p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">Request a free roof inspection. We usually reply within minutes during business hours.</p>
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <form method="post" action={`/api/leads/${encodeURIComponent(intakeKey)}`} className="mt-4 space-y-3">
            <input type="hidden" name="source" value={source} />
            {/* honeypot — hidden from people, bots fill it */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Leave this empty<input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">Your name</span><input className={input} name="name" required autoComplete="name" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">Phone</span><input className={input} name="phone" type="tel" autoComplete="tel" inputMode="tel" /></label>
              <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">Email</span><input className={input} name="email" type="email" autoComplete="email" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">Street address</span><input className={input} name="address" autoComplete="street-address" /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-3 block sm:col-span-1"><span className="mb-1 block text-sm font-medium text-slate-700">City</span><input className={input} name="city" autoComplete="address-level2" /></label>
              <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">State</span><input className={input} name="state" maxLength={2} autoComplete="address-level1" /></label>
              <label className="col-span-2 block sm:col-span-1"><span className="mb-1 block text-sm font-medium text-slate-700">ZIP</span><input className={input} name="zip" inputMode="numeric" autoComplete="postal-code" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">What&apos;s going on with your roof?</span><textarea className={`${input} min-h-24`} name="message" placeholder="Leak over the kitchen, storm damage, getting quotes for a replacement…" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="insurance" value="yes" className="h-5 w-5 accent-brand-500" /> This may be an insurance claim (storm / hail)</label>
            <button className="w-full rounded-lg bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600">Request inspection</button>
            <p className="text-xs text-slate-500">Enter a phone number or email so we can reach you. We never sell your information.</p>
          </form>
        </>
      )}
    </main>
  );
}
