import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { ApproveOnSite } from "@/components/field/approve-on-site";
import { Badge, Card, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { signPaths } from "@/lib/field-server";
import { date, label, money, siteUrl, STATUS_TONE } from "@/lib/format";
import { deleteChangeOrder, sendChangeOrder } from "../actions";

export const metadata: Metadata = { title: "Change order" };

export default async function ChangeOrderPage({ params, searchParams }: PageProps<"/app/jobs/[id]/change-orders/[coId]">) {
  const { id, coId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireMoneyAccess();
  const { data: co } = await supabase.from("change_orders").select("*, change_order_items(*), invoices(id, number, kind)").eq("id", coId).eq("job_id", id).maybeSingle();
  if (!co) notFound();
  const items = ((co.change_order_items ?? []) as { id: string; position: number; description: string; quantity: number; unit: string; unit_price: number; unit_cost: number; category: string }[]).sort((a, b) => a.position - b.position);
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const cost = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
  const { data: files } = co.file_ids?.length ? await supabase.from("job_files").select("id, storage_path, caption").in("id", co.file_ids) : { data: [] };
  const urls = await signPaths(supabase, (files ?? []).map((f) => f.storage_path));
  const link = `${siteUrl()}/c/${co.public_token}`;
  const inv = co.invoices as { id: string; number: number; kind: string } | null;
  const msg = typeof sp.m === "string" ? sp.m : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/app/jobs/${id}/change-orders`} className="text-sm text-slate-600 hover:text-brand-600">← All change orders</Link>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}
      <Card title={<span className="flex flex-wrap items-center gap-2">{co.title}<Badge tone={STATUS_TONE[co.status]}>{co.status === "sent" ? "Awaiting homeowner" : label(co.status)}</Badge></span>}>
        {co.description && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{co.description}</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>{i.description} <span className="text-slate-500">· {Number(i.quantity)} {i.unit} × {money(i.unit_price)}</span></span>
              <span className="tabular-nums">{money(Number(i.quantity) * Number(i.unit_price))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total (before tax)</span><span className="tabular-nums">{money(total)}</span></div>
        <p className="text-xs text-slate-500">Our cost {money(cost)} · margin {total > 0 ? Math.round(((total - cost) / total) * 100) : 0}%</p>
        {(files ?? []).length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(files ?? []).map((f) => urls.get(f.storage_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={urls.get(f.storage_path)} alt={f.caption ?? ""} className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </Card>

      {co.status === "approved" ? (
        <Card title="Approved">
          <p className="text-sm">Approved {date(co.approved_at)} by <b>{co.approved_name}</b> ({co.approval_method === "verbal" ? "verbal / on site" : co.approval_method === "remote_signature" ? "signed online" : "signed on site"}).</p>
          {co.signature_data && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={co.signature_data} alt="Homeowner signature" className="mt-2 h-20 rounded bg-white ring-1 ring-slate-200" />
          )}
          {inv && <p className="mt-2 text-sm">Added to <Link className="font-medium text-brand-700 underline" href={`/app/invoices/${inv.id}`}>{inv.kind === "final" ? "final invoice" : "change order invoice"} #{inv.number}</Link> and job cost.</p>}
        </Card>
      ) : co.status === "declined" ? (
        <Card title="Declined"><p className="text-sm">The homeowner declined this change order{co.declined_at ? ` on ${date(co.declined_at)}` : ""}.</p></Card>
      ) : (
        <>
          <Card title="Send to homeowner for approval">
            <ActionForm action={sendChangeOrder} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={co.id} />
              <Select name="how" defaultValue="both" className="w-auto" aria-label="Send by">
                <option value="both">Text + email</option><option value="sms">Text</option><option value="email">Email</option>
              </Select>
              <SubmitButton>{co.status === "sent" ? "Resend link" : "Send link"}</SubmitButton>
              <CopyLink url={link} label="Copy approval link" />
            </ActionForm>
            {co.status === "sent" && <p className="mt-2 text-xs text-slate-500">Sent {date(co.sent_at)} · <a className="underline" href={`/c/${co.public_token}`} target="_blank" rel="noreferrer">open homeowner view</a></p>}
          </Card>
          <Card title="Approve on site">
            <ApproveOnSite id={co.id} />
          </Card>
          <form action={deleteChangeOrder} className="text-right">
            <input type="hidden" name="id" value={co.id} />
            <SubmitButton variant="danger" confirm="Delete this change order?">Delete</SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
