// Milestone invoices (payment schedule) and invoice labels. Pure functions.
import type { Tone } from "./format";

export const INVOICE_KINDS = ["standard", "deposit", "progress", "final", "supplement", "change_order"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  standard: "Invoice",
  deposit: "Deposit",
  progress: "Progress",
  final: "Final",
  supplement: "Supplement",
  change_order: "Change order",
};
export const INVOICE_KIND_TONE: Record<InvoiceKind, Tone> = {
  standard: "slate",
  deposit: "violet",
  progress: "cyan",
  final: "teal",
  supplement: "orange",
  change_order: "amber",
};

export const BILL_TO = ["homeowner", "carrier", "mortgagee", "other"] as const;
export type BillTo = (typeof BILL_TO)[number];
export const BILL_TO_LABEL: Record<BillTo, string> = { homeowner: "Homeowner", carrier: "Insurance company", mortgagee: "Mortgage company", other: "Other" };

export const MILESTONE_TRIGGERS = ["signed", "delivered", "completed"] as const;
export const TRIGGER_LABEL: Record<string, string> = { signed: "Due when the contract is signed", delivered: "Due when materials are delivered", completed: "Due at completion walkthrough" };

export type ScheduleStep = { label: string; pct: number; trigger: string };
export type PlannedInvoice = { kind: "deposit" | "progress" | "final"; label: string; trigger: string; pct: number; amount: number };

export function validateSchedule(steps: unknown): { ok: true; steps: ScheduleStep[] } | { ok: false; error: string } {
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: "No payment schedule is set up. Add one in Settings → Payments." };
  const clean: ScheduleStep[] = [];
  for (const s of steps as Record<string, unknown>[]) {
    const pct = Number(s?.pct);
    const trigger = String(s?.trigger ?? "");
    if (!Number.isFinite(pct) || pct <= 0) return { ok: false, error: "Every payment-schedule step needs a percentage above 0." };
    if (!(MILESTONE_TRIGGERS as readonly string[]).includes(trigger)) return { ok: false, error: `Unknown payment-schedule trigger "${trigger}".` };
    clean.push({ label: String(s?.label ?? "").trim() || "Payment", pct, trigger });
  }
  const sum = Math.round(clean.reduce((a, s) => a + s.pct, 0) * 1000) / 1000;
  if (sum !== 100) return { ok: false, error: `Payment-schedule percentages add up to ${sum}%, not 100%. Fix it in Settings → Payments.` };
  return { ok: true, steps: clean };
}

/** Split a contract total into milestone invoices. The last one absorbs rounding so the sum is exact. */
export function planSchedule(total: number, steps: ScheduleStep[]): PlannedInvoice[] {
  const cents = Math.round(total * 100);
  let assigned = 0;
  return steps.map((s, i) => {
    const last = i === steps.length - 1;
    const c = last ? cents - assigned : Math.round((cents * s.pct) / 100);
    assigned += c;
    const kind: PlannedInvoice["kind"] = last ? "final" : i === 0 && s.trigger === "signed" ? "deposit" : "progress";
    return { kind, label: s.label, trigger: s.trigger, pct: s.pct, amount: c / 100 };
  });
}
