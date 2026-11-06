import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty } from "@/components/ui";
import { requireMoneyAccess } from "@/lib/dal";
import { date, isoDate, money } from "@/lib/format";
import { daysBetween, SUPPLEMENT_STATUS_LABEL, SUPPLEMENT_STATUS_TONE } from "@/lib/claims";
import { getClaimForJob, type Supplement } from "@/lib/claims-server";
import { createSupplement, markFollowedUp } from "../actions";

export const metadata: Metadata = { title: "Variation requests" };

export default async function SupplementsPage({ params }: PageProps<"/app/jobs/[id]/claim/supplements">) {
  const { id } = await params;
  const { supabase } = await requireMoneyAccess();
  const claim = await getClaimForJob(supabase, id);
  if (!claim) notFound();
  const { data } = await supabase.from("supplements").select("*, supplement_items(count)").eq("claim_id", claim.id).order("round");
  const rows = (data ?? []) as (Supplement & { supplement_items: { count: number }[] })[];
  const today = isoDate(new Date());
  const requested = rows.reduce((s, r) => s + Number(r.requested_amount), 0);
  const approved = rows.reduce((s, r) => s + Number(r.approved_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          A variation request asks the insurer to add work that is missing from, or short in, its scope of works. Requested <b className="tabular-nums">{money(requested)}</b> · approved <b className="tabular-nums">{money(approved)}</b>.
        </p>
        <form action={createSupplement}>
          <input type="hidden" name="claim_id" value={claim.id} />
          <SubmitButton className="min-h-11">New variation request</SubmitButton>
        </form>
      </div>
      {rows.length === 0 ? (
        <Empty title="No variation requests yet">Compare the insurer&apos;s scope on the <Link className="text-brand-700" href={`/app/jobs/${id}/claim/scope`}>Scope compare</Link> tab to find missing items, or start one by hand.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((s) => {
            const due = s.status === "submitted" && s.next_follow_up_on && s.next_follow_up_on <= today;
            const waiting = s.status === "submitted" && s.submitted_on ? daysBetween(s.submitted_on, today) : null;
            return (
              <Card
                key={s.id}
                title={<Link href={`/app/jobs/${id}/claim/supplements/${s.id}`} className="hover:text-brand-600">Variation request {s.round}</Link>}
                actions={<Badge tone={SUPPLEMENT_STATUS_TONE[s.status]}>{SUPPLEMENT_STATUS_LABEL[s.status]}</Badge>}
              >
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-slate-500">Requested</dt><dd className="tabular-nums font-medium">{money(s.requested_amount)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Approved</dt><dd className="tabular-nums font-medium">{money(s.approved_amount)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Lines</dt><dd>{s.supplement_items?.[0]?.count ?? 0}</dd></div>
                  <div><dt className="text-xs text-slate-500">Sent</dt><dd>{s.submitted_on ? `${date(s.submitted_on)}${waiting !== null ? ` (${waiting}d ago)` : ""}` : "—"}</dd></div>
                </dl>
                {s.status === "submitted" && s.next_follow_up_on && (
                  <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${due ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"}`}>
                    <span>{due ? "Follow-up due" : "Next follow-up"}: <b>{date(s.next_follow_up_on)}</b>{s.follow_up_count > 0 ? ` · ${s.follow_up_count} done` : ""}</span>
                    <form action={markFollowedUp}>
                      <input type="hidden" name="id" value={s.id} />
                      <SubmitButton variant={due ? "primary" : "secondary"} className="min-h-11">Mark followed up</SubmitButton>
                    </form>
                  </div>
                )}
                <div className="mt-3 flex gap-3 text-sm">
                  <Link className="font-medium text-brand-700" href={`/app/jobs/${id}/claim/supplements/${s.id}`}>Open</Link>
                  <Link className="font-medium text-slate-600" href={`/app/claims/supplements/${s.id}`} target="_blank">Printable request</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
