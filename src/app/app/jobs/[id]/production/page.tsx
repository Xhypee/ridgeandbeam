import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Badge, Button, Card, Field, Input, LinkButton, Select, Textarea, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { date, isoDate, label, money, siteUrl } from "@/lib/format";
import { liensDisclaimer, lienSchedule, LIEN_STATES } from "@/lib/liens";
import {
  crewPay, daysUntil, DUMPSTER_STATUSES, HOA_STATUSES, jobReadiness, MATERIALS_STATUSES, PERMIT_STATUSES, type ReadinessJob,
} from "@/lib/production";
import { acceptedEstimate, readinessContexts } from "@/lib/production-data";
import { orderTotal } from "@/lib/production-orders";
import { crewLeadCanSee } from "@/lib/production-server";
import { scheduleJob } from "../../actions";
import { createOrder } from "../../../orders/actions";
import { postCrewPay, saveBidDue, saveDelivery, saveLien, saveReadinessDetails, setReadiness, unlockSchedule } from "./actions";

export const metadata: Metadata = { title: "Production" };

type CrewRow = { id: string; name: string; color: string; phone: string | null; language: string; public_token: string; rate_per_square: number; steep_adder: number; high_steep_adder: number; layer_adder: number; low_slope_rate: number };

const ORDER_TONE: Record<string, "slate" | "amber" | "blue" | "green" | "red"> = { draft: "slate", sent: "amber", confirmed: "blue", delivered: "green", cancelled: "red" };

function StatusButtons({ jobId, field, value, options, disabled }: { jobId: string; field: string; value: string; options: readonly string[]; disabled: boolean }) {
  return (
    <form action={setReadiness} className="flex flex-wrap gap-1.5">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="field" value={field} />
      {options.map((o) => (
        <button
          key={o}
          name="value"
          value={o}
          disabled={disabled}
          aria-pressed={o === value}
          className={cx(
            "min-h-11 rounded-lg px-3 text-sm font-medium ring-1 transition disabled:cursor-default",
            o === value ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-500",
          )}
        >
          {label(o)}
        </button>
      ))}
    </form>
  );
}

function Row({ ok, title, detail, children }: { ok: boolean; title: string; detail: string; children?: React.ReactNode }) {
  return (
    <li className="py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", ok ? "bg-green-600" : "bg-red-500")} aria-hidden>{ok ? "✓" : "!"}</span>
        <span className="font-medium text-slate-900">{title}</span>
        <span className="truncate text-sm text-slate-500">· {detail}</span>
      </div>
      {children && <div className="pl-8">{children}</div>}
    </li>
  );
}

export default async function ProductionPage({ params }: PageProps<"/app/jobs/[id]/production">) {
  const { id } = await params;
  const ctx = await requireOrg();
  const { supabase, org, canSeeMoney, isCrewLead } = ctx;
  const { data: j } = await supabase.from("jobs").select("*, customers(name, phone, state), crews(*)").eq("id", id).maybeSingle();
  if (!j || !crewLeadCanSee(ctx, j)) notFound();
  const job = j as ReadinessJob & {
    id: string; title: string; job_type: string; state: string | null; scheduled_end: string | null; crew_id: string | null; schedule_locked: boolean;
    permit_number: string | null; delivery_type: string; delivery_notes: string | null; gate_code: string | null; site_hazards: string | null;
    last_furnished_on: string | null; bid_due_on: string | null; customers: { name: string; phone: string | null; state: string | null } | null; crews: CrewRow | null;
  };
  const readOnly = isCrewLead;
  const today = isoDate(new Date());

  const [{ data: crews }, rctx, { data: orders }, est, { data: crewCost }] = await Promise.all([
    supabase.from("crews").select("id, name").order("name"),
    readinessContexts(supabase, [id]),
    supabase.from("material_orders").select("id, supplier, status, delivery_date, po_number, created_at, material_order_items(quantity, unit_cost)").eq("job_id", id).order("created_at"),
    canSeeMoney ? acceptedEstimate(supabase, id) : Promise.resolve(null),
    canSeeMoney ? supabase.from("job_costs").select("amount").eq("job_id", id).eq("source", "crew_pay").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const r = jobReadiness(job, rctx.get(id)!);
  const byKey = Object.fromEntries(r.items.map((i) => [i.key, i]));
  const crew = job.crews;
  const pay = crew && est ? crewPay(est.measurements, crew) : null;
  const lienState = job.state ?? job.customers?.state ?? org.state;
  const lien = lienSchedule(lienState, { lastFurnished: job.last_furnished_on, firstFurnished: job.scheduled_start, today });
  const bidDays = daysUntil(job.bid_due_on, today);

  return (
    <div className="space-y-6">
      <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1", job.schedule_locked ? "bg-green-50 ring-green-200" : r.ready ? "bg-blue-50 ring-blue-200" : "bg-amber-50 ring-amber-200")}>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {job.schedule_locked ? "Schedule locked" : r.ready ? "Ready to lock" : `Tentative — ${r.blockers.length} blocker${r.blockers.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-sm text-slate-600">
            {job.schedule_locked
              ? `${date(job.scheduled_start)}${job.scheduled_end && job.scheduled_end !== job.scheduled_start ? ` – ${date(job.scheduled_end)}` : ""} · ${crew?.name ?? "No crew"}`
              : r.ready ? "Everything is green. Lock the schedule to confirm the crew and homeowner." : `Waiting on: ${r.blockers.map((b) => b.label).join(", ")}`}
          </p>
        </div>
        <span className="text-sm font-medium text-slate-700">{r.done}/{r.total} ready</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Readiness checklist">
            <ul className="divide-y divide-slate-100">
              <Row ok={byKey.permit.ok} title="Permit" detail={byKey.permit.detail + (job.permit_number ? ` · #${job.permit_number}` : "")}>
                <StatusButtons jobId={id} field="permit_status" value={job.permit_status} options={PERMIT_STATUSES} disabled={readOnly} />
              </Row>
              <Row ok={byKey.hoa.ok} title="HOA approval" detail={byKey.hoa.detail}>
                <StatusButtons jobId={id} field="hoa_status" value={job.hoa_status} options={HOA_STATUSES} disabled={readOnly} />
              </Row>
              <Row ok={byKey.colors.ok} title="Colors confirmed with homeowner" detail={byKey.colors.detail}>
                <StatusButtons jobId={id} field="colors_confirmed" value={String(job.colors_confirmed)} options={["true", "false"]} disabled={readOnly} />
              </Row>
              <Row ok={byKey.materials.ok} title="Materials" detail={byKey.materials.detail}>
                <StatusButtons jobId={id} field="materials_status" value={job.materials_status} options={MATERIALS_STATUSES} disabled={readOnly} />
              </Row>
              <Row ok={byKey.dumpster.ok} title="Dumpster" detail={byKey.dumpster.detail}>
                <StatusButtons jobId={id} field="dumpster_status" value={job.dumpster_status} options={DUMPSTER_STATUSES} disabled={readOnly} />
              </Row>
              <Row ok={byKey.deposit.ok} title="Deposit" detail={byKey.deposit.detail}>
                {canSeeMoney && <p className="text-sm text-slate-500">Computed from invoices and payments. <Link className="text-brand-600 underline" href={`/app/jobs/${id}/billing`}>Billing</Link></p>}
              </Row>
            </ul>
            {!readOnly && (
              <ActionForm action={saveReadinessDetails} className="mt-2 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <input type="hidden" name="job_id" value={id} />
                <Field label="Permit number"><Input name="permit_number" defaultValue={job.permit_number ?? ""} /></Field>
                <Field label="Shingle color"><Input name="shingle_color" defaultValue={job.shingle_color ?? ""} placeholder="e.g. GAF Timberline HDZ Charcoal" /></Field>
                <div className="flex items-end"><SubmitButton variant="secondary">Save details</SubmitButton></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Schedule" actions={job.schedule_locked ? <Badge tone="green">Locked</Badge> : <Badge tone="amber">Tentative</Badge>}>
            {readOnly ? (
              <p className="text-sm text-slate-700">{job.scheduled_start ? `${date(job.scheduled_start)} – ${date(job.scheduled_end ?? job.scheduled_start)}` : "Not scheduled"} · {crew?.name ?? "No crew"}</p>
            ) : (
              <ActionForm action={scheduleJob} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Start"><Input type="date" name="scheduled_start" defaultValue={job.scheduled_start ?? ""} /></Field>
                  <Field label="End"><Input type="date" name="scheduled_end" defaultValue={job.scheduled_end ?? ""} /></Field>
                  <Field label="Crew">
                    <Select name="crew_id" defaultValue={job.crew_id ?? ""}>
                      <option value="">Unassigned</option>
                      {(crews ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton variant="secondary">Save (tentative)</SubmitButton>
                  {r.ready ? (
                    <SubmitButton name="lock" value="1">🔒 Lock schedule</SubmitButton>
                  ) : (
                    <Button type="button" disabled title={`Blocked: ${r.blockers.map((b) => b.label).join(", ")}`}>🔒 Lock schedule</Button>
                  )}
                  {!r.ready && <span className="text-xs text-slate-500">Lock unlocks when all six checks are green.</span>}
                </div>
              </ActionForm>
            )}
            {job.schedule_locked && !readOnly && (
              <form action={unlockSchedule} className="mt-3">
                <input type="hidden" name="job_id" value={id} />
                <SubmitButton variant="ghost">Unlock (make tentative)</SubmitButton>
              </form>
            )}
          </Card>

          {canSeeMoney && (
            <Card title="Material orders" actions={<Link href="/app/orders" className="text-sm text-brand-600 hover:underline">All orders</Link>}>
              {(orders ?? []).length === 0 ? (
                <p className="mb-3 text-sm text-slate-500">No orders yet. Build one from the accepted estimate&apos;s takeoff so quantities and colors match what was sold.</p>
              ) : (
                <ul className="mb-3 divide-y divide-slate-100">
                  {(orders ?? []).map((o) => (
                    <li key={o.id}>
                      <Link href={`/app/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand-600">
                        <span className="min-w-0 truncate">{o.supplier}{o.po_number ? ` · PO ${o.po_number}` : ""}{o.delivery_date ? ` · deliver ${date(o.delivery_date, { month: "short", day: "numeric" })}` : ""}</span>
                        <span className="flex shrink-0 items-center gap-2">{money(orderTotal(o.material_order_items ?? []))}<Badge tone={ORDER_TONE[o.status]}>{label(o.status)}</Badge></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <form action={createOrder}>
                  <input type="hidden" name="job_id" value={id} />
                  <input type="hidden" name="mode" value="estimate" />
                  <SubmitButton>Create order from estimate</SubmitButton>
                </form>
                <form action={createOrder}>
                  <input type="hidden" name="job_id" value={id} />
                  <input type="hidden" name="mode" value="blank" />
                  <SubmitButton variant="secondary">Blank order</SubmitButton>
                </form>
              </div>
            </Card>
          )}

          {canSeeMoney && (
            <Card title="Crew pay">
              {!crew ? (
                <p className="text-sm text-slate-500">Assign a crew to compute sub pay.</p>
              ) : !est ? (
                <p className="text-sm text-slate-500">Crew pay is computed from the accepted estimate&apos;s measurements. No accepted estimate yet.</p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-slate-500">{crew.name} pay sheet × {pay!.squares} installed squares (sloped area, no waste).</p>
                  {pay!.lines.length === 0 ? (
                    <p className="text-sm text-slate-500">This crew&apos;s pay sheet is empty. <Link className="text-brand-600 underline" href="/app/settings/crews">Set rates</Link>.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {pay!.lines.map((l) => (
                          <tr key={l.label}><td className="py-1.5">{l.label}</td><td className="py-1.5 text-right text-slate-500">{l.squares} sq × {money(l.rate)}</td><td className="py-1.5 text-right font-medium">{money(l.amount)}</td></tr>
                        ))}
                        <tr><td className="py-1.5 font-semibold" colSpan={2}>Total</td><td className="py-1.5 text-right font-semibold" data-testid="crew-pay-total">{money(pay!.total)}</td></tr>
                      </tbody>
                    </table>
                  )}
                  <ActionForm action={postCrewPay} className="mt-3 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="job_id" value={id} />
                    <SubmitButton variant="secondary">{crewCost ? "Update crew pay on job cost" : "Post crew pay to job cost"}</SubmitButton>
                    {crewCost && <span className="text-xs text-slate-500">Posted: {money(crewCost.amount)}</span>}
                  </ActionForm>
                </>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Delivery & site">
            {readOnly ? (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-slate-500">Delivery</dt><dd>{label(job.delivery_type)}</dd></div>
                {job.delivery_notes && <div><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{job.delivery_notes}</dd></div>}
                {job.gate_code && <div><dt className="text-xs text-slate-500">Gate code</dt><dd>{job.gate_code}</dd></div>}
                {job.site_hazards && <div><dt className="text-xs text-slate-500">Hazards</dt><dd className="whitespace-pre-wrap">{job.site_hazards}</dd></div>}
              </dl>
            ) : (
              <ActionForm action={saveDelivery} className="space-y-3">
                <input type="hidden" name="job_id" value={id} />
                <Field label="Delivery" hint="Power lines, steep or narrow driveways usually mean a ground drop.">
                  <Select name="delivery_type" defaultValue={job.delivery_type}>
                    <option value="roof_load">Roof load</option>
                    <option value="ground_drop">Ground drop</option>
                  </Select>
                </Field>
                <Field label="Delivery notes"><Textarea name="delivery_notes" defaultValue={job.delivery_notes ?? ""} placeholder="Drop on left side of driveway, avoid sprinkler heads…" /></Field>
                <Field label="Gate code"><Input name="gate_code" defaultValue={job.gate_code ?? ""} /></Field>
                <Field label="Site hazards"><Textarea name="site_hazards" defaultValue={job.site_hazards ?? ""} placeholder="Power line over garage, dog in yard, skylights…" /></Field>
                <SubmitButton variant="secondary">Save delivery details</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card title="Crew work order">
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="secondary" href={`/app/jobs/${id}/production/work-order`}>Printable work order</LinkButton>
              {crew && !readOnly && <CopyLink url={`${siteUrl()}/w/${crew.public_token}/${id}`} label="Copy crew link" />}
            </div>
            {crew && <p className="mt-2 text-xs text-slate-500">Crew portal shows this job in {crew.language === "es" ? "Spanish" : "English"} with materials (no prices), delivery notes and a problem button.</p>}
          </Card>

          <Card title="Lien deadlines">
            {lien ? (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">{lien.rule.name}: {lien.rule.lienLabel}.</p>
                {lien.lienDue ? (
                  <p className={cx("rounded-lg px-3 py-2 font-medium", (lien.daysLeft ?? 0) < 0 ? "bg-red-50 text-red-800" : (lien.daysLeft ?? 0) <= 14 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-800")}>
                    Lien due {date(lien.lienDue)} · {(lien.daysLeft ?? 0) >= 0 ? `${lien.daysLeft} days left` : `${-(lien.daysLeft ?? 0)} days ago`}
                  </p>
                ) : (
                  <p className="text-slate-500">Set the last furnished date to start the countdown.</p>
                )}
                {lien.notices.length > 0 && (
                  <ul className="space-y-1">
                    {lien.notices.map((n) => (
                      <li key={n.label} className="flex justify-between gap-2"><span>{n.label}</span><span className="shrink-0 text-slate-500">{n.due ? date(n.due) : n.note}</span></li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-400">{lien.rule.citation}. {liensDisclaimer}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No lien rules on file for {lienState || "this state"} yet (covered: {LIEN_STATES.join(", ")}). {liensDisclaimer}</p>
            )}
            {!readOnly && (
              <ActionForm action={saveLien} className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="job_id" value={id} />
                <Field label="Last furnished"><Input type="date" name="last_furnished_on" defaultValue={job.last_furnished_on ?? ""} /></Field>
                <Field label="State"><Input name="state" maxLength={2} defaultValue={lienState ?? ""} className="uppercase" /></Field>
                <div className="col-span-2"><SubmitButton variant="secondary">Save</SubmitButton></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Bid due (commercial)">
            {job.bid_due_on && <p className={cx("mb-2 text-sm font-medium", (bidDays ?? 0) < 0 ? "text-red-700" : (bidDays ?? 0) <= 3 ? "text-amber-700" : "text-slate-700")}>Due {date(job.bid_due_on)} · {(bidDays ?? 0) >= 0 ? `${bidDays} days left` : "past due"}</p>}
            {!readOnly ? (
              <ActionForm action={saveBidDue} className="flex items-end gap-2">
                <input type="hidden" name="job_id" value={id} />
                <Field label="Bid due date" className="flex-1"><Input type="date" name="bid_due_on" defaultValue={job.bid_due_on ?? ""} /></Field>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ) : !job.bid_due_on && <p className="text-sm text-slate-500">—</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
