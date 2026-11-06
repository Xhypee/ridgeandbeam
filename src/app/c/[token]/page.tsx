import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignaturePad } from "@/components/signature-pad";
import { Input } from "@/components/ui";
import { adminClient, hasAdminKey } from "@/lib/admin";
import { signPaths } from "@/lib/field-server";
import { date, money } from "@/lib/format";
import { anonClient } from "@/lib/public";
import { approveChangeOrder, declineChangeOrder } from "./actions";

export const metadata: Metadata = { title: "Change order", robots: { index: false } };

type PublicCo = {
  id: string; org_id: string; job_id: string; title: string; description: string | null; status: string; created_at: string;
  approved_at: string | null; approved_name: string | null; approval_method: string | null; tax_rate: number;
  org: { name: string; phone: string | null; email: string | null; license_number: string | null };
  customer: { name: string };
  job: { title: string; site_address: string | null; public_token: string };
  items: { description: string; quantity: number; unit: string; unit_price: number }[];
  photos: { storage_path: string; caption: string | null }[];
};

export default async function PublicChangeOrder({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const { data } = await anonClient().rpc("get_public_change_order", { p_token: token });
  if (!data) notFound();
  const co = data as PublicCo;
  const prefix = `${co.org_id}/${co.job_id}/`;
  const paths = co.photos.map((p) => p.storage_path).filter((p) => p.startsWith(prefix));
  const urls = hasAdminKey() && paths.length ? await signPaths(adminClient(), paths, 60 * 60 * 2) : new Map<string, string>();
  const subtotal = co.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const tax = Math.round(subtotal * Number(co.tax_rate || 0)) / 100;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-6 text-slate-900">
      <header className="mb-4">
        <p className="text-lg font-bold text-brand-700">{co.org.name}</p>
        <p className="text-sm text-slate-600">{[co.org.license_number && `License #${co.org.license_number}`, co.org.phone].filter(Boolean).join(" · ")}</p>
      </header>
      <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change order · {date(co.created_at)}</p>
        <h1 className="mt-1 text-2xl font-bold">{co.title}</h1>
        <p className="text-sm text-slate-600">{co.customer.name} · {co.job.title}{co.job.site_address ? ` · ${co.job.site_address}` : ""}</p>
        {co.description && <p className="mt-3 whitespace-pre-wrap text-base text-slate-800">{co.description}</p>}
        {co.photos.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {co.photos.map((p) => urls.get(p.storage_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.storage_path} src={urls.get(p.storage_path)} alt={p.caption ?? "Photo"} className="aspect-square w-full rounded-xl object-cover" />
            ))}
          </div>
        )}
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {co.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3 py-2">
              <span>{i.description}<span className="block text-slate-500">{Number(i.quantity)} {i.unit} × {money(i.unit_price)}</span></span>
              <span className="tabular-nums">{money(Number(i.quantity) * Number(i.unit_price))}</span>
            </li>
          ))}
        </ul>
        {tax > 0 && <div className="flex justify-between text-sm text-slate-600"><span>Tax</span><span>{money(tax)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-lg font-bold"><span>Added to your project</span><span className="tabular-nums">{money(subtotal + tax)}</span></div>
        <p className="mt-1 text-xs text-slate-500">This amount is added to your final invoice.</p>
      </article>

      {co.status === "sent" && (
        <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold">Approve this change</h2>
          <ActionForm action={approveChangeOrder} className="mt-3 space-y-3">
            <input type="hidden" name="token" value={token} />
            <Input name="name" placeholder="Your full name" autoComplete="name" required className="min-h-12 text-base" />
            <SignaturePad name="signature" required height={170} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agree" required className="mt-0.5 h-5 w-5 accent-brand-500" />
              I approve this change to my roofing contract with {co.org.name} for the amount shown.
            </label>
            <SubmitButton className="min-h-14 w-full text-base">Approve & sign</SubmitButton>
          </ActionForm>
          <form action={declineChangeOrder} className="mt-3 text-center">
            <input type="hidden" name="token" value={token} />
            <button className="min-h-11 text-sm font-medium text-slate-500 underline">Decline — I&apos;d like to talk first</button>
          </form>
        </section>
      )}
      {co.status === "approved" && (
        <p className="mt-4 rounded-2xl bg-green-50 p-4 text-green-900 ring-1 ring-green-200" data-testid="co-approved">
          Approved{co.approved_name ? ` by ${co.approved_name}` : ""}{co.approved_at ? ` on ${date(co.approved_at)}` : ""}. Thank you — the crew will keep going.
        </p>
      )}
      {co.status === "declined" && <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-slate-700">You declined this change. {co.org.name} will contact you{co.org.phone ? ` (${co.org.phone})` : ""}.</p>}
      <p className="mt-4 text-center text-sm"><a className="text-brand-700 underline" href={`/p/${co.job.public_token}`}>Back to your project</a></p>
    </main>
  );
}
