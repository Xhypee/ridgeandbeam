// Sold jobs in the Jobs sidebar: getting ready to build. A short checklist from what the app already records
// (signed + deposit, cooling-off, home warranty, material orders, crew), one action each, then "Start build".
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { Docket } from "@/lib/job-docket-server";
import { setStage } from "./actions";
import { setComplianceItem } from "./[id]/compliance/actions";

const day = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const METHOD: Record<string, string> = { bank_transfer: "bank transfer", payid: "PayID", card: "card", cash: "cash", cheque: "cheque", bpay: "BPAY" };
const I = {
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3", clock: "M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2", shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4", cal: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  check: "M5 12l5 5 9-10", next: "M9 6l6 6-6 6", sms: "M4 5h16v11H9l-5 4z",
};
function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
type State = "done" | "now" | "wait" | "todo";
type Step = { key: string; icon: string; label: string; detail: string; state: State; note?: string; href?: string; action?: React.ReactNode };

export function SoldPanel({ d }: { d: Docket }) {
  const s = d.sold!;
  const j = d.job;
  const first = d.customer.name.split(" ")[0] || d.customer.name;
  const o = s.orders;
  const steps: Step[] = [];
  steps.push(s.deposit
    ? { key: "signed", icon: I.pen, label: "Signed & deposit paid", detail: `${s.signedAt ? day(s.signedAt) : "Signed"} · ${aud(s.deposit.amount)} by ${METHOD[s.deposit.method] ?? s.deposit.method}`, state: "done" }
    : { key: "signed", icon: I.pen, label: "Signed · deposit not paid yet", detail: s.signedAt ? `Signed ${day(s.signedAt)}` : "Signed", state: "todo", href: `/app/jobs/${j.id}/billing` });
  if (s.coolingOff.applies) steps.push(s.coolingOff.over
    ? { key: "cool", icon: I.clock, label: "Cooling-off ended", detail: s.coolingOff.ends ? day(s.coolingOff.ends) : "Over", state: "done" }
    : { key: "cool", icon: I.clock, label: "Cooling-off ends", detail: s.coolingOff.ends ? `${day(s.coolingOff.ends)} · business days` : "Starts when they get the signed copy", state: "wait", note: `${first} can still cancel until then` });
  if (s.insurance.required) steps.push(s.insurance.done
    ? { key: "ins", icon: I.shield, label: "Home warranty insurance", detail: "Paid", state: "done" }
    : { key: "ins", icon: I.shield, label: "Home warranty insurance", detail: `Pay the ${s.insurance.scheme ?? "home warranty"} premium before work`, state: "todo",
      action: (
        <ActionForm action={setComplianceItem}>
          <input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="item_key" value="insurance_certificate" /><input type="hidden" name="status" value="done" />
          <SubmitButton variant="secondary" className="min-h-8 px-3 text-xs">Mark paid</SubmitButton>
        </ActionForm>
      ) });
  const ordersDone = o.total > 0 && o.sent === o.total;
  const supTxt = o.suppliers.length ? `${o.suppliers[0]}${o.suppliers.length > 1 ? ` + ${o.suppliers.length - 1} more` : ""} · ${o.items} item${o.items === 1 ? "" : "s"}${o.cost ? ` · ${aud(o.cost)}` : ""}` : "From the signed quote";
  steps.push({
    key: "orders", icon: I.truck, href: `/app/materials/${j.id}`,
    label: o.delivered && o.delivered === o.total ? "Materials delivered" : o.confirmed && o.confirmed === o.total ? "Materials confirmed" : ordersDone ? "Materials ordered" : o.sent ? `Order materials · ${o.sent} of ${o.total} sent` : "Order materials",
    detail: supTxt, state: ordersDone ? "done" : "todo",
  });
  const booked = Boolean(j.scheduled_start && s.crew.name);
  steps.push(booked
    ? { key: "crew", icon: I.cal, label: "Crew booked", detail: `${s.crew.name} · ${day(j.scheduled_start!)}${j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${day(j.scheduled_end)}` : ""}`, state: "done", href: `/app/jobs/${j.id}/production` }
    : { key: "crew", icon: I.cal, label: "Book the crew", detail: j.scheduled_start ? `Starts ${day(j.scheduled_start)} · no crew yet` : "Pick the days and the crew", state: "todo", href: `/app/jobs/${j.id}/production` });
  // The first thing still to do is "now".
  const nowIx = steps.findIndex((x) => x.state === "todo");
  if (nowIx >= 0) steps[nowIx] = { ...steps[nowIx], state: "now" };
  const done = steps.filter((x) => x.state === "done").length;
  const all = done === steps.length;
  const tel = d.customer.phone?.replace(/\s+/g, "");

  return (
    <div className="px-5 pb-4" data-sold-panel>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{all ? "Ready to build" : "Getting ready to build"}</p>
          <p className="font-display text-[26px] font-bold leading-tight text-ink">{all && j.scheduled_start ? `Starts ${day(j.scheduled_start)}` : `${done} of ${steps.length} done`}</p>
        </div>
        <span className="mb-1.5 flex gap-1" aria-hidden>{steps.map((x) => <span key={x.key} className="h-2 w-5 rounded-full" style={{ background: x.state === "done" ? "#1f5f3f" : x.state === "now" ? "#13221a" : x.state === "wait" ? "#f4c66b" : "#e2e8f0" }} />)}</span>
      </div>
      <ol className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {steps.map((x, k) => {
          const body = (
            <>
              <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", x.state === "done" ? "bg-brand-500 text-white" : x.state === "now" ? "bg-ink text-white" : x.state === "wait" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-white text-slate-500 ring-1 ring-slate-200")}>
                <Icon d={x.state === "done" ? I.check : x.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-sm font-semibold", x.state === "todo" ? "text-slate-600" : "text-ink")}>{x.label}</span>
                <span className="block truncate text-xs text-slate-500">{x.detail}</span>
                {x.note && <span className="block text-xs font-medium text-amber-700">{x.note}</span>}
              </span>
              {x.action}
              {x.href && !x.action && (x.key === "crew" && x.state !== "done" ? <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-slate-300">Book</span> : <Icon d={I.next} className="h-5 w-5 text-slate-400" />)}
            </>
          );
          const cls = cx("flex items-center gap-3 px-3.5 py-3", k > 0 && "border-t border-slate-100", x.state === "now" && "bg-brand-50");
          return <li key={x.key} data-ready-step={x.key} data-state={x.state}>{x.href && !x.action ? <Link href={x.href} className={cx(cls, "hover:bg-slate-50")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
        })}
      </ol>
      {all && (
        <div className="mt-3 flex gap-2">
          {tel && <a href={`sms:${tel}?&body=${encodeURIComponent(`Hi ${first}, just confirming we start on your roof ${j.scheduled_start ? day(j.scheduled_start) : "soon"}. See you then!`)}`} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"><Icon d={I.sms} />Text {first}: we start {j.scheduled_start ? day(j.scheduled_start).split(" ")[0] : "soon"}</a>}
          <form action={setStage}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="stage" value="in_progress" />
            <button className="flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50">Start build</button></form>
        </div>
      )}
      {s.rule && <p className="mt-3 flex gap-2 rounded-xl bg-cream px-3 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200"><Icon d={I.shield} className="mt-0.5 h-4 w-4 text-brand-700" />{s.rule}</p>}
    </div>
  );
}
