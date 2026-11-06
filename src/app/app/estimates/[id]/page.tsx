import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, label, siteUrl, STATUS_TONE } from "@/lib/format";
import type { CatalogItem, Item } from "@/lib/types";
import { createInvoiceFromEstimate } from "../../invoices/actions";
import { deleteEstimate, duplicateEstimate, setEstimateStatus } from "../actions";
import { EstimateEditor } from "./estimate-editor";

export default async function EstimatePage({ params }: PageProps<"/app/estimates/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: e }, { data: catalog }] = await Promise.all([
    supabase.from("estimates").select("*, estimate_items(*), jobs(id, title, customers(name, email))").eq("id", id).maybeSingle(),
    supabase.from("catalog_items").select("*").order("category").order("name"),
  ]);
  if (!e) notFound();
  const items = ((e.estimate_items ?? []) as (Item & { position: number })[]).sort((a, b) => a.position - b.position);
  const job = e.jobs as { id: string; title: string; customers: { name: string; email: string | null } };
  const publicUrl = `${siteUrl()}/q/${e.public_token}`;
  const status = e.status as string;

  const statusBtn = (s: string, text: string, variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", confirm?: string) => (
    <form action={setEstimateStatus}>
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton variant={variant} confirm={confirm}>{text}</SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Estimate #{e.number} <Badge tone={STATUS_TONE[status]}>{label(status)}</Badge></span>}
        subtitle={
          <>
            <Link href={`/app/jobs/${job.id}`} className="font-medium text-slate-700 hover:text-brand-600">{job.title}</Link> · {job.customers.name} · Created {date(e.created_at)}
          </>
        }
        actions={
          <>
            {status === "draft" && statusBtn("sent", "Mark as sent", "primary")}
            {status !== "draft" && <CopyLink url={publicUrl} />}
            {status !== "draft" && <LinkButton variant="secondary" href={`/q/${e.public_token}`} target="_blank">Customer view</LinkButton>}
            {status === "sent" && statusBtn("accepted", "Mark accepted")}
            {status === "sent" && statusBtn("declined", "Mark declined", "ghost")}
            {status === "accepted" && (
              <form action={createInvoiceFromEstimate}>
                <input type="hidden" name="estimate_id" value={e.id} />
                <SubmitButton>Create invoice</SubmitButton>
              </form>
            )}
          </>
        }
      />

      {status === "draft" && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Draft. When it&apos;s ready, <b>Mark as sent</b> to get a link the customer can open, print, and sign online.
        </p>
      )}
      {status === "sent" && (
        <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Send this link to {job.customers.name}{job.customers.email ? ` (${job.customers.email})` : ""}: <span className="break-all font-mono text-xs">{publicUrl}</span>.
          They can review and accept it online.
        </p>
      )}
      {status === "accepted" && (
        <p className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          Accepted {e.accepted_at ? date(e.accepted_at) : ""}{e.accepted_name ? ` by ${e.accepted_name}` : ""}. This estimate is locked; duplicate it to make a change order.
        </p>
      )}

      <EstimateEditor
        id={e.id}
        locked={status === "accepted"}
        catalog={(catalog ?? []) as CatalogItem[]}
        defaultWaste={Number(org.default_waste_pct)}
        initial={{ measurements: e.measurements, items, tax_rate: e.tax_rate, discount: e.discount, notes: e.notes, terms: e.terms }}
      />

      <Card className="no-print mt-6" title="More">
        <div className="flex flex-wrap gap-2">
          <form action={duplicateEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="secondary">Duplicate</SubmitButton>
          </form>
          {status !== "draft" && statusBtn("draft", "Revert to draft", "ghost", "Move this estimate back to draft? The customer link stops working until you send it again.")}
          <form action={deleteEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="danger" confirm="Delete this estimate?">Delete</SubmitButton>
          </form>
        </div>
      </Card>
    </>
  );
}
