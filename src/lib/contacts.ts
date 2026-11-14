// Contacts: customers, builders, suppliers, contractors and others in one list.
// Suppliers live in org_suppliers (Materials uses them); the rest are rows in customers with a kind.
import type { ContactKind } from "./types";

export type ContactType = ContactKind | "supplier";
export const CONTACT_TYPES: ContactType[] = ["customer", "builder", "supplier", "contractor", "other"];
export const TYPE_LABEL: Record<ContactType, string> = { customer: "Customer", builder: "Builder", supplier: "Supplier", contractor: "Contractor", other: "Other" };
export const TYPE_PLURAL: Record<ContactType, string> = { customer: "Customers", builder: "Builders", supplier: "Suppliers", contractor: "Contractors", other: "Others" };
export const TYPE_BADGE: Record<ContactType, string> = {
  customer: "bg-brand-50 text-brand-700 ring-brand-100",
  builder: "bg-amber-50 text-amber-800 ring-amber-200",
  supplier: "bg-sky-50 text-sky-800 ring-sky-200",
  contractor: "bg-violet-50 text-violet-800 ring-violet-200",
  other: "bg-slate-100 text-slate-700 ring-slate-200",
};
export const isContactType = (v: unknown): v is ContactType => typeof v === "string" && (CONTACT_TYPES as string[]).includes(v);

/** Days from `today` to `date` (negative when it has passed). */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export type ExpiryState = "ok" | "soon" | "expired" | "missing";
/** Licence / insurance status: expired, due within 30 days ("soon"), fine, or no date on file. */
export function expiryState(date: string | null | undefined, today: string, warnDays = 30): ExpiryState {
  if (!date) return "missing";
  const d = daysUntil(date, today);
  return d < 0 ? "expired" : d <= warnDays ? "soon" : "ok";
}

export type ComplianceItem = { key: "licence" | "pl" | "workcover"; label: string; date: string | null; state: ExpiryState; days: number | null };
/** A contractor's licence, public liability and WorkCover, worst first. */
export function contractorCompliance(c: { licence_expiry: string | null; pl_expiry: string | null; workcover_expiry: string | null }, today: string): ComplianceItem[] {
  const items: ComplianceItem[] = [
    { key: "licence", label: "Licence", date: c.licence_expiry },
    { key: "pl", label: "Public liability", date: c.pl_expiry },
    { key: "workcover", label: "WorkCover", date: c.workcover_expiry },
  ].map((x) => ({ ...(x as { key: ComplianceItem["key"]; label: string; date: string | null }), state: expiryState(x.date, today), days: x.date ? daysUntil(x.date, today) : null }));
  const rank: Record<ExpiryState, number> = { expired: 0, soon: 1, missing: 2, ok: 3 };
  return items.sort((a, b) => rank[a.state] - rank[b.state] || (a.days ?? 9e9) - (b.days ?? 9e9));
}

/** One line for the list: the most urgent licence / insurance problem, or null when all dated items are fine. */
export function complianceAlert(c: { licence_expiry: string | null; pl_expiry: string | null; workcover_expiry: string | null }, today: string): { text: string; tone: "red" | "amber" } | null {
  const worst = contractorCompliance(c, today)[0];
  if (worst.state === "expired") return { text: `${worst.label} expired`, tone: "red" };
  if (worst.state === "soon") return { text: worst.days === 0 ? `${worst.label} expires today` : `${worst.label} expires in ${worst.days} day${worst.days === 1 ? "" : "s"}`, tone: "amber" };
  return null;
}
