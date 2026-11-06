import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignaturePad } from "@/components/signature-pad";
import { Badge, Card, Field, Input, Select, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { WARRANTY_REGISTRATION_DAYS, warrantyDaysLeft } from "@/lib/field";
import { closeoutBlockers } from "@/lib/field-closeout";
import { warrantyProducts } from "@/lib/field-estimate";
import { date, isoDate, label, money, STATUS_TONE } from "@/lib/format";
import { addPunch, deletePunch, requestReview, saveWarranty, signWalkthrough, togglePunch } from "./actions";

export const metadata: Metadata = { title: "Close-out" };

export default async function CloseoutPage({ params }: PageProps<"/app/jobs/[id]/closeout">) {
  const { id } = await params;
  const { supabase, canSeeMoney } = await requireOrg();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, stage, completed_at, walkthrough_signed_at, walkthrough_name, warranty_product, warranty_registered_at, warranty_registration_number, review_requested_at, organizations(google_review_url)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const [{ data: punch }, blockers, products] = await Promise.all([
    supabase.from("job_checklist_items").select("id, label, done_at, created_at").eq("job_id", id).eq("kind", "punch").order("created_at"),
    closeoutBlockers(supabase, id),
    warrantyProducts(supabase, id),
  ]);
  const reviewUrl = (job.organizations as unknown as { google_review_url: string | null } | null)?.google_review_url;
  const openPunch = (punch ?? []).filter((p) => !p.done_at).length;
  const daysLeft = warrantyDaysLeft(job.completed_at);
  const hasInvoices = blockers.invoices.length > 0;
  const paidInFull = hasInvoices && blockers.balance <= 0.005;

  const checks: { label: string; done: boolean; detail: string; href?: string }[] = [
    { label: "Punch list complete", done: openPunch === 0, detail: openPunch ? `${openPunch} open item${openPunch > 1 ? "s" : ""}` : (punch ?? []).length ? "All items done" : "No punch items" },
    { label: "Walkthrough signed", done: Boolean(job.walkthrough_signed_at), detail: job.walkthrough_signed_at ? `${job.walkthrough_name} · ${date(job.walkthrough_signed_at)}` : "Have the homeowner sign below", href: job.walkthrough_signed_at ? `/app/jobs/${id}/closeout/certificate` : undefined },
    { label: "Final invoice paid", done: paidInFull, detail: !hasInvoices ? "No invoice yet" : paidInFull ? "Paid in full" : canSeeMoney ? `${money(blockers.balance)} due` : "Balance due" },
    { label: "Lien waiver", done: paidInFull, detail: paidInFull ? "Ready to give the homeowner" : "Available once paid in full", href: canSeeMoney && paidInFull ? `/app/jobs/${id}/closeout/lien-waiver` : undefined },
    { label: "Warranty registered", done: Boolean(job.warranty_registered_at), detail: job.warranty_registered_at ? `${job.warranty_product ?? "Registered"} · ${date(job.warranty_registered_at)}` : daysLeft === null ? "Starts when the job is completed" : daysLeft >= 0 ? `${daysLeft} days left to register` : `${-daysLeft} days overdue` },
    { label: "Review requested", done: Boolean(job.review_requested_at), detail: job.review_requested_at ? date(job.review_requested_at) : "After payment and punch list" },
  ];
  const ready = checks.filter((c) => c.done).length;

  const reviewBlock = !reviewUrl ? "Add your Google review link in Settings → Company first."
    : blockers.balance > 0.005 ? `Disabled: ${canSeeMoney ? money(blockers.balance) : "a balance"} is still due. Asking for a review before final payment invites a dispute.`
      : openPunch > 0 ? `Disabled: ${openPunch} punch item${openPunch > 1 ? "s are" : " is"} still open. Finish them first.` : null;

  return (
    <div className="space-y-6">
      <Card title={<span>Close-out readiness <span className="font-normal text-slate-500">({ready} of {checks.length})</span></span>}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="closeout-checklist">
          {checks.map((c) => (
            <li key={c.label} className={cx("flex items-start gap-3 rounded-xl p-3 ring-1", c.done ? "bg-green-50 ring-green-200" : "bg-white ring-slate-200")} data-done={c.done}>
              <span aria-hidden className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold", c.done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-500")}>{c.done ? "✓" : ""}</span>
              <div className="min-w-0">
                <p className="font-semibold">{c.label}<span className="sr-only">{c.done ? " — done" : " — not done"}</span></p>
                <p className="text-sm text-slate-600">{c.href ? <Link href={c.href} className="text-brand-700 underline">{c.detail}</Link> : c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Punch list">
          <ul className="mb-3 space-y-2">
            {(punch ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <form action={togglePunch}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="done" value={p.done_at ? "0" : "1"} />
                  <button className={cx("flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold ring-2", p.done_at ? "bg-green-600 text-white ring-green-600" : "bg-white ring-slate-400")} aria-label={p.done_at ? `Reopen: ${p.label}` : `Mark done: ${p.label}`}>
                    {p.done_at ? "✓" : ""}
                  </button>
                </form>
                <span className={cx("min-w-0 flex-1 text-sm", p.done_at && "text-slate-400 line-through")}>{p.label}</span>
                <form action={deletePunch}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="min-h-11 px-2 text-xs text-slate-400 hover:text-red-700" aria-label={`Delete: ${p.label}`}>Remove</button>
                </form>
              </li>
            ))}
            {(punch ?? []).length === 0 && <li className="text-sm text-slate-500">Nothing yet. Add touch-ups found at the walkthrough (e.g. &quot;reseal pipe boot&quot;, &quot;replace dented gutter&quot;).</li>}
          </ul>
          <ActionForm action={addPunch} className="flex gap-2">
            <input type="hidden" name="job_id" value={id} />
            <Input name="label" placeholder="Add punch item" required className="min-h-11" />
            <SubmitButton variant="secondary">Add</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Final walkthrough sign-off">
          {job.walkthrough_signed_at ? (
            <div className="space-y-2 text-sm">
              <p>Signed by <b>{job.walkthrough_name}</b> on {date(job.walkthrough_signed_at)}.</p>
              <Link href={`/app/jobs/${id}/closeout/certificate`} className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-4 font-semibold text-white">Certificate of Completion</Link>
            </div>
          ) : (
            <ActionForm action={signWalkthrough} className="space-y-3">
              <input type="hidden" name="job_id" value={id} />
              <p className="text-sm text-slate-600">Walk the property with the homeowner, then hand them your phone to sign. This creates the Certificate of Completion insurers ask for before releasing depreciation.</p>
              <Input name="name" placeholder="Homeowner's full name" required className="min-h-12 text-base" />
              <SignaturePad name="signature" required height={180} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" required className="mt-0.5 h-5 w-5 accent-brand-500" />
                I walked the finished job and confirm the work is complete{openPunch ? `, except the ${openPunch} punch item${openPunch > 1 ? "s" : ""} listed` : ""}.
              </label>
              <SubmitButton className="min-h-14 w-full text-base">Homeowner signs off</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Final invoice">
          {!hasInvoices ? <p className="text-sm text-slate-500">No invoices on this job yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {blockers.invoices.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  {canSeeMoney ? <Link href={`/app/invoices/${v.id}`} className="font-medium hover:text-brand-600">{v.milestone_label || label(v.kind)} #{v.number}</Link> : <span>{v.milestone_label || label(v.kind)} #{v.number}</span>}
                  <span className="flex items-center gap-2">
                    {canSeeMoney && <span className="tabular-nums">{money(v.total)}{v.balance > 0 ? ` · ${money(v.balance)} due` : ""}</span>}
                    <Badge tone={STATUS_TONE[v.status]}>{label(v.status)}</Badge>
                    {v.status !== "draft" && <a className="text-xs text-brand-700 underline" href={`/i/${v.public_token}`} target="_blank" rel="noreferrer">pay link</a>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canSeeMoney && (
            <p className="mt-3 text-sm">
              {paidInFull ? <Link href={`/app/jobs/${id}/closeout/lien-waiver`} className="font-medium text-brand-700 underline">Print unconditional lien waiver</Link>
                : <span className="text-slate-500">The unconditional lien waiver unlocks once the job is paid in full (give a conditional waiver before then).</span>}
            </p>
          )}
        </Card>

        <Card title="Warranty registration">
          <p className={cx("mb-3 rounded-lg px-3 py-2 text-sm font-medium", job.warranty_registered_at ? "bg-green-50 text-green-800" : daysLeft !== null && daysLeft < 10 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900")} data-testid="warranty-countdown">
            {job.warranty_registered_at ? `Registered ${date(job.warranty_registered_at)}${job.warranty_registration_number ? ` · #${job.warranty_registration_number}` : ""}`
              : daysLeft === null ? `Register within ${WARRANTY_REGISTRATION_DAYS} days of install (GAF). The countdown starts when the job is completed.`
                : daysLeft >= 0 ? `${daysLeft} days left to register (${WARRANTY_REGISTRATION_DAYS}-day window from ${date(job.completed_at)}).`
                  : `Registration window passed ${-daysLeft} days ago — call the manufacturer.`}
          </p>
          <ActionForm action={saveWarranty} className="space-y-3">
            <input type="hidden" name="job_id" value={id} />
            {products.length > 0 ? (
              <Field label="Product / warranty (from the signed estimate)">
                <Select name="warranty_product" defaultValue={job.warranty_product ?? products[0]}>
                  {[...new Set([...(job.warranty_product ? [job.warranty_product] : []), ...products])].map((p) => <option key={p}>{p}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field label={products.length ? "…or type another product" : "Product / warranty"}>
              <Input name="warranty_product_custom" defaultValue={products.length ? "" : job.warranty_product ?? ""} placeholder="e.g. GAF System Plus" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Registration #"><Input name="warranty_registration_number" defaultValue={job.warranty_registration_number ?? ""} /></Field>
              <Field label="Registered on"><Input type="date" name="warranty_registered_at" defaultValue={job.warranty_registered_at ? isoDate(new Date(job.warranty_registered_at)) : ""} /></Field>
            </div>
            <SubmitButton variant="secondary">Save warranty</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Review request">
          <ActionForm action={requestReview} className="space-y-2">
            <input type="hidden" name="job_id" value={id} />
            <p className="text-sm text-slate-600">Texts and emails the homeowner your Google review link.{job.review_requested_at ? ` Last sent ${date(job.review_requested_at)}.` : ""}</p>
            {reviewBlock && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700" data-testid="review-blocked">{reviewBlock}</p>}
            <button type="submit" disabled={Boolean(reviewBlock)} className="min-h-12 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {job.review_requested_at ? "Send review request again" : "Send review request"}
            </button>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
