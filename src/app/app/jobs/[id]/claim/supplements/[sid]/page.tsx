import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, money } from "@/lib/format";
import { FOLLOW_UP_DAYS, SUPPLEMENT_STATUS_LABEL, SUPPLEMENT_STATUS_TONE, SUPPLEMENT_STATUSES } from "@/lib/claims";
import { jobFilesWithUrls, type Supplement, type SupplementItem } from "@/lib/claims-server";
import { deleteSupplement, markFollowedUp, setSupplementStatus } from "../../actions";
import { SupplementEditor } from "./supplement-editor";

export const metadata: Metadata = { title: "Supplement" };

export default async function SupplementPage({ params }: PageProps<"/app/jobs/[id]/claim/supplements/[sid]">) {
  const { id, sid } = await params;
  const { supabase } = await requireMoneyAccess();
  const { data } = await supabase.from("supplements").select("*, supplement_items(*), claims!inner(job_id, carrier, claim_number)").eq("id", sid).maybeSingle();
  if (!data || (data.claims as unknown as { job_id: string }).job_id !== id) notFound();
  const s = data as Supplement & { supplement_items: SupplementItem[] };
  const items = [...s.supplement_items].sort((a, b) => a.position - b.position);
  const photos = (await jobFilesWithUrls(supabase, id, { photosOnly: true })).map((f) => ({ id: f.id, url: f.url, caption: f.caption, category: f.category }));
  const today = isoDate(new Date());
  const due = s.status === "submitted" && s.next_follow_up_on && s.next_follow_up_on <= today;
  const locked = ["approved", "partial", "denied"].includes(s.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/app/jobs/${id}/claim/supplements`} className="text-sm text-slate-500 hover:text-slate-800">← Supplements</Link>
          <h2 className="text-lg font-semibold text-slate-900">Round {s.round}</h2>
          <Badge tone={SUPPLEMENT_STATUS_TONE[s.status]}>{SUPPLEMENT_STATUS_LABEL[s.status]}</Badge>
        </div>
        <LinkButton variant="secondary" href={`/app/claims/supplements/${s.id}`} target="_blank" className="min-h-11">Printable request</LinkButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SupplementEditor
            id={s.id}
            locked={locked}
            notes={s.notes}
            photos={photos}
            initial={items.map((i) => ({
              description: i.description,
              xact_code: i.xact_code,
              quantity: Number(i.quantity),
              unit: i.unit,
              unit_price: Number(i.unit_price),
              code_citation: i.code_citation,
              justification: i.justification,
              file_ids: i.file_ids ?? [],
              status: i.status,
              approved_amount: Number(i.approved_amount),
            }))}
          />
        </div>
        <div className="space-y-6">
          <Card title="Carrier response">
            <dl className="mb-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Requested</dt><dd className="font-semibold tabular-nums">{money(s.requested_amount)}</dd></div>
              <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Approved</dt><dd className="font-semibold tabular-nums">{money(s.approved_amount)}</dd></div>
            </dl>
            {s.status === "submitted" && s.next_follow_up_on && (
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${due ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"}`}>
                <p>{due ? "Follow-up due" : "Next follow-up"}: <b>{date(s.next_follow_up_on)}</b></p>
                <p className="text-xs">Reminders at {FOLLOW_UP_DAYS.join(", ")} days after submitting, then weekly.{s.follow_up_count ? ` ${s.follow_up_count} follow-up${s.follow_up_count === 1 ? "" : "s"} done.` : ""}</p>
                <form action={markFollowedUp} className="mt-2">
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton variant={due ? "primary" : "secondary"} className="min-h-11 w-full">Mark followed up</SubmitButton>
                </form>
              </div>
            )}
            <ActionForm action={setSupplementStatus} className="space-y-3">
              <input type="hidden" name="id" value={s.id} />
              <Field label="Status">
                <Select name="status" defaultValue={s.status} aria-label="Supplement status">
                  {SUPPLEMENT_STATUSES.map((x) => <option key={x} value={x}>{SUPPLEMENT_STATUS_LABEL[x]}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Submitted on"><Input name="submitted_on" type="date" defaultValue={s.submitted_on ?? today} max={today} /></Field>
                <Field label="Answered on"><Input name="responded_on" type="date" defaultValue={s.responded_on ?? ""} /></Field>
              </div>
              <Field label="Approved amount" hint="Leave empty when fully approved to use the requested amount.">
                <Input name="approved_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={Number(s.approved_amount) || ""} />
              </Field>
              <Field label="Carrier response"><Textarea name="carrier_response" defaultValue={s.carrier_response ?? ""} rows={2} /></Field>
              <SubmitButton className="min-h-11 w-full">Update status</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-slate-500">When a round is approved, an expected supplement check is added to the insurance ledger automatically.</p>
          </Card>
          {s.status === "draft" && (
            <form action={deleteSupplement}>
              <input type="hidden" name="id" value={s.id} />
              <SubmitButton variant="danger" confirm="Delete this draft supplement?">Delete draft</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
