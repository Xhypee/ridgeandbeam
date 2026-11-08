// The customer's payment plan on their links (project page and each invoice): what's paid, what's due now, what's next.
import { aud } from "@/lib/pay-plan";
import { cx } from "./ui";

export type PublicPlan = {
  methods: ("bank" | "card" | "cash")[];
  parts: { number: number; label: string; kind: string; trigger: string | null; due_date: string | null; status: string; total: number; paid: number; balance: number; public_token: string | null }[];
};

const WHEN: Record<string, string> = { signed: "On signing", delivered: "When materials are delivered", completed: "When the roof's finished" };
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function PublicPayPlan({ plan, current, cardOnline }: { plan: PublicPlan; current?: string; cardOnline: boolean }) {
  const parts = plan.parts.map((p) => ({ ...p, total: Number(p.total), paid: Number(p.paid), balance: Number(p.balance) }));
  if (parts.length < 2) return null;
  const total = parts.reduce((a, p) => a + p.total, 0);
  const paid = parts.reduce((a, p) => a + p.paid, 0);
  const dueNow = parts.find((p) => p.public_token && p.balance > 0);
  const ways = [cardOnline && plan.methods.includes("card") && "card", plan.methods.includes("bank") && "PayID / bank transfer", plan.methods.includes("cash") && "cash"].filter(Boolean) as string[];
  return (
    <section data-public-plan className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="rounded-t-2xl bg-brand-500 px-4 pb-4 pt-4 text-white">
        <h2 className="font-display text-lg font-bold">Your payment plan</h2>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/20" aria-hidden>
          {parts.map((p) => <span key={p.number} className="border-r border-brand-500 last:border-0" style={{ width: `${(p.total / (total || 1)) * 100}%`, background: p.balance <= 0 ? "#fff" : p.paid > 0 ? "rgba(255,255,255,.6)" : "transparent" }} />)}
        </div>
        <p className="mt-1.5 text-sm text-white/80">{aud(paid)} of {aud(total)} paid · {parts.length} payments</p>
      </div>
      {dueNow && dueNow.public_token !== current && (
        <div className="border-b border-slate-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due now · {dueNow.label}</p>
          <p className="font-display text-3xl font-bold tabular-nums text-ink">{aud(dueNow.balance)}</p>
          <a href={`/i/${dueNow.public_token}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-ink text-base font-semibold text-white">Pay {aud(dueNow.balance)}</a>
        </div>
      )}
      <ul className="divide-y divide-slate-100 px-4">
        {parts.map((p) => {
          const done = p.balance <= 0;
          const label = p.trigger === "date" && p.due_date ? fmt(p.due_date) : p.public_token && p.due_date ? `Due ${fmt(p.due_date)}` : WHEN[p.trigger ?? ""] ?? "";
          const body = (
            <>
              <span className="min-w-0">
                <span className={cx("block font-semibold", p.public_token === current ? "text-brand-700" : "text-ink")}>{p.label}{p.public_token === current ? " (this invoice)" : ""}</span>
                <span className="block text-xs text-slate-500">{label}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block tabular-nums text-ink">{aud(p.total)}</span>
                <span className={cx("block text-xs font-semibold", done ? "text-teal-700" : p.paid > 0 ? "text-amber-700" : p.public_token ? "text-brand-700" : "text-slate-400")}>
                  {done ? "Paid ✓" : p.paid > 0 ? `${aud(p.balance)} to go` : p.public_token ? "Due" : "Coming up"}
                </span>
              </span>
            </>
          );
          return (
            <li key={p.number}>
              {p.public_token && p.public_token !== current
                ? <a href={`/i/${p.public_token}`} className="flex min-h-14 items-center justify-between gap-3 py-2">{body}</a>
                : <div className="flex min-h-14 items-center justify-between gap-3 py-2">{body}</div>}
            </li>
          );
        })}
      </ul>
      {ways.length > 0 && (
        <p className="rounded-b-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Pay each part by {ways.length === 1 ? ways[0] : `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}`}.
          {plan.methods.includes("cash") && " Paying cash? Hand it to us or the crew and you'll get a receipt."}
        </p>
      )}
    </section>
  );
}
