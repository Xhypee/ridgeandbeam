import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Card, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { effectiveOptionId, itemsForOption } from "@/lib/estimate-totals";
import type { CatalogRow, DraftItem, DraftOption } from "@/lib/estimating";
import { date, label, money, siteUrl, STATUS_TONE } from "@/lib/format";
import { totals } from "@/lib/roof";
import { cancelBy, depositRule, maxDeposit, requiredNotices, resolveState, rulesFor, scheduledDeposit, VERIFY, type Notice } from "@/lib/state-rules";
import { createInvoiceFromEstimate } from "../../invoices/actions";
import { deleteEstimate, duplicateEstimate, setEstimateStatus } from "../actions";
import { EstimateEditor } from "./estimate-editor";

type ItemRow = DraftItem & { id: string; position: number; option_id: string | null };
type OptionRow = { id: string; position: number; name: string; tier: DraftOption["tier"]; description: string | null; warranty: string | null; recommended: boolean };

export default async function EstimatePage({ params }: PageProps<"/app/estimates/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireMoneyAccess();
  const [{ data: e }, { data: catalog }] = await Promise.all([
    supabase
      .from("estimates")
      .select("*, estimate_items(*), estimate_options!estimate_options_estimate_id_fkey(*), jobs(id, title, state, is_insurance, customers(name, email, state))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("catalog_items").select("*").order("category").order("calc_key").order("name"),
  ]);
  if (!e) notFound();
  const items = ((e.estimate_items ?? []) as ItemRow[]).sort((a, b) => a.position - b.position);
  const options = ((e.estimate_options ?? []) as OptionRow[]).sort((a, b) => a.position - b.position);
  const job = e.jobs as { id: string; title: string; state: string | null; is_insurance: boolean; customers: { name: string; email: string | null; state: string | null } };
  const publicUrl = `${siteUrl()}/q/${e.public_token}`;
  const status = e.status as string;
  const word = e.option_label === "alternates" ? "alternate" : "option";

  // Compliance (N4): job state -> customer state -> company state.
  const resolved = resolveState(job.state, job.customers.state, org.state);
  const rule = rulesFor(resolved.state);
  const effOption = effectiveOptionId(options, e.selected_option_id);
  const t = totals(itemsForOption(items, effOption), Number(e.discount), Number(e.tax_rate));
  const cap = maxDeposit(rule, t.total, job.is_insurance);
  const dRule = depositRule(rule, job.is_insurance);
  const sched = scheduledDeposit(org.payment_schedule, t.total);
  const signedAt = e.accepted_at ? new Date(e.accepted_at) : new Date();
  const cancel = cancelBy(rule, signedAt, job.is_insurance);
  const snapshot = (Array.isArray(e.legal_notices) ? e.legal_notices : []) as Notice[];
  const notices = status === "accepted" && snapshot.length ? snapshot : requiredNotices(rule, { isInsurance: job.is_insurance, total: t.total });
  const overCap = cap != null && sched.amount > cap;

  const statusBtn = (s: string, text: string, variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", confirm?: string) => (
    <form action={setEstimateStatus}>
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton variant={variant} confirm={confirm}>{text}</SubmitButton>
    </form>
  );

  const selectedName = options.find((o) => o.id === e.selected_option_id)?.name;

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
            {status === "sent" && (
              <form action={setEstimateStatus} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="accepted" />
                {options.length > 0 && (
                  <Select name="option_id" defaultValue={effOption ?? ""} className="w-auto" aria-label={`Accepted ${word}`}>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                )}
                <SubmitButton variant="secondary">Mark accepted</SubmitButton>
              </form>
            )}
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
          Draft. When it&apos;s ready, <b>Mark as sent</b> to get a link the customer can open, compare {word}s, and sign online.
        </p>
      )}
      {status === "sent" && (
        <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Send this link to {job.customers.name}{job.customers.email ? ` (${job.customers.email})` : ""}: <span className="break-all font-mono text-xs">{publicUrl}</span>.
          They can review{options.length ? `, pick an ${word},` : ""} and sign it online.
        </p>
      )}
      {status === "accepted" && (
        <div className="mb-6 flex flex-wrap items-start gap-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="flex-1">
            Accepted {e.accepted_at ? date(e.accepted_at) : ""}{e.accepted_name ? ` by ${e.accepted_name}` : ""}{selectedName ? ` · chose ${selectedName}` : ""}
            {e.accepted_ip ? ` · IP ${e.accepted_ip}` : ""}. This estimate is locked; duplicate it to make a change order.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.signature_data && <img src={e.signature_data} alt="Customer signature" className="h-14 rounded bg-white px-2 ring-1 ring-green-200" />}
        </div>
      )}

      <Card className="mb-6" title={<span className="flex items-center gap-2">Compliance <Badge tone={rule.state === "DEFAULT" ? "slate" : "blue"}>{rule.state === "DEFAULT" ? (resolved.state ?? "No state") : rule.name}</Badge></span>}>
        <div data-testid="compliance-panel" className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Deposit at signing</p>
            <p className="mt-1">
              Max allowed: <b data-testid="max-deposit">{cap == null ? "No cap in rules table" : money(cap)}</b>
            </p>
            <p className={overCap ? "font-medium text-red-700" : "text-slate-600"}>
              Your schedule asks {sched.pct}% = {money(sched.amount)}{overCap ? " — over the limit. Lower the deposit milestone for this job." : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">{dRule.note}{"citation" in dRule && dRule.citation ? ` (${dRule.citation})` : ""}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Cancel-by</p>
            <p className="mt-1"><b data-testid="cancel-by">{date(cancel.date.toISOString(), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</b> {status === "accepted" ? "" : <span className="text-slate-500">(if signed today)</span>}</p>
            <p className="text-xs text-slate-500">{rule.cancellation.note} ({rule.cancellation.citation}). Weekends skipped; holidays not counted.</p>
            {cancel.insuranceNote && <p className="mt-1 text-xs text-slate-600">{cancel.insuranceNote}</p>}
            {!job.is_insurance && rule.cancellation.insurance && <p className="mt-1 text-xs text-slate-500">Insurance jobs get an extra window: {rule.cancellation.insurance.note}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notices attached to the estimate</p>
            <ul className="mt-1 space-y-1" data-testid="notice-list">
              {notices.map((n) => <li key={n.id}><b>{n.title}</b> <span className="text-xs text-slate-500">{n.citation}</span></li>)}
              {notices.length === 0 && <li className="text-slate-500">None</li>}
            </ul>
            {rule.deductibleWaiverBan && <p className="mt-2 text-xs font-medium text-red-700">Deductible discounts/waivers are blocked in {rule.name} ({rule.deductibleCitation}).</p>}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          State from the {resolved.source === "none" ? "— (set the job's state)" : resolved.source}{job.is_insurance ? " · insurance job" : ""}. {VERIFY}
        </p>
      </Card>

      <EstimateEditor
        id={e.id}
        locked={status === "accepted"}
        catalog={(catalog ?? []) as CatalogRow[]}
        certifications={org.certifications ?? []}
        defaultWaste={Number(org.default_waste_pct)}
        bundlesPerSquare={Number(org.bundles_per_square) || 3}
        minMarginPct={Number(org.min_margin_pct) || 0}
        financing={{ enabled: Boolean(org.financing?.enabled), apr: Number(org.financing?.apr) || 0, term_months: Number(org.financing?.term_months) || 0 }}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        initial={{
          measurements: e.measurements,
          measurement_source: e.measurement_source,
          option_label: e.option_label === "alternates" ? "alternates" : "options",
          options: options.map((o) => ({ key: o.id, id: o.id, name: o.name, tier: o.tier, description: o.description ?? "", warranty: o.warranty ?? "", recommended: o.recommended })),
          items: items.map((i) => ({
            description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price), unit_cost: Number(i.unit_cost ?? 0),
            category: i.category, calc_key: i.calc_key ?? null, option_key: i.option_id,
          })),
          tax_rate: e.tax_rate,
          discount: e.discount,
          notes: e.notes,
          terms: e.terms,
        }}
      />

      <Card className="no-print mt-6" title="More">
        <div className="flex flex-wrap gap-2">
          <form action={duplicateEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="secondary">Duplicate</SubmitButton>
          </form>
          {status !== "draft" && statusBtn("draft", "Revert to draft", "ghost", "Move this estimate back to draft? The customer link stops working until you send it again, and any signature is cleared.")}
          <form action={deleteEstimate}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton variant="danger" confirm="Delete this estimate?">Delete</SubmitButton>
          </form>
        </div>
      </Card>
    </>
  );
}
