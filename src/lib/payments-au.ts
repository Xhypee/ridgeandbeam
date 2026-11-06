// Australian payment options: bank transfer (BSB + account), PayID, BECS Direct Debit, card,
// consumer finance referrals. Pure helpers (safe in client components).

export const AU_PAYMENT_METHODS = ["bank_transfer", "payid", "card", "cash", "check", "insurance", "becs", "financing", "other"] as const;
export type AuPaymentMethod = (typeof AU_PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer (EFT)",
  payid: "PayID",
  card: "Card",
  cash: "Cash",
  check: "Cheque",
  insurance: "Insurer payment",
  becs: "BECS Direct Debit",
  financing: "Finance provider",
  online: "Online (Stripe)",
  ach: "Bank transfer (EFT)",
  other: "Other",
};

/** BSB: 6 digits, shown as 062-000. */
export const cleanBsb = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
export const isValidBsb = (v: string | null | undefined) => /^\d{6}$/.test(cleanBsb(v));
export const formatBsb = (v: string | null | undefined) => {
  const d = cleanBsb(v);
  return d.length === 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};
/** Australian bank account numbers are 5–10 digits (most are 6–9). */
export const cleanAccount = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
export const isValidAccount = (v: string | null | undefined) => /^\d{5,10}$/.test(cleanAccount(v));

export type PayIdType = "email" | "phone" | "abn";
/** Validate a PayID of the given type; returns the normalised value or null. */
export function normalisePayId(type: PayIdType, v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s.toLowerCase() : null;
  if (type === "phone") {
    const d = s.replace(/\D/g, "");
    if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    if (/^614\d{8}$/.test(d)) return `0${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
    return null;
  }
  const d = s.replace(/\D/g, "");
  return /^\d{11}$/.test(d) ? d : null;
}

/** Payment reference the homeowner types into their banking app. */
export const bankReference = (invoiceNumber: number | string) => `INV${invoiceNumber}`;

// ---------------------------------------------------------------------------
// Card surcharging
// The RBA's March 2026 conclusions (Review of Retail Payments Regulation) remove card surcharges on
// eftpos, Mastercard and Visa from 1 October 2026; enforcement runs through scheme rules and merchant
// agreements. Ridge & Beam therefore never adds a card surcharge line and offers no surcharge setting
// for those networks. See research_notes/.../insurance_payments_warranties.md §4.
// ---------------------------------------------------------------------------
export const SURCHARGE_NOTE =
  "Card surcharges on eftpos, Mastercard and Visa are banned from 1 October 2026 (RBA), so Ridge & Beam never adds one. Price card costs into your rates, or encourage bank transfer and PayID, which cost you nothing.";

// ---------------------------------------------------------------------------
// Consumer finance providers (configurable referral links)
// ---------------------------------------------------------------------------
export const FINANCE_PROVIDERS = [
  { key: "brighte", name: "Brighte", hint: "Home improvement payment plans" },
  { key: "humm", name: "humm", hint: "Buy now, pay later for larger purchases" },
  { key: "zip", name: "Zip", hint: "Buy now, pay later" },
  { key: "plenti", name: "Plenti", hint: "Personal and renewable-energy loans" },
] as const;
export type FinanceProviderKey = (typeof FINANCE_PROVIDERS)[number]["key"] | "other";

export const FINANCE_DISCLAIMER =
  "Offering finance is regulated credit activity. You must hold an Australian credit licence, be an authorised credit representative, or fall within an exemption (for example, acting only as a referrer under the provider's own point-of-sale arrangements). Don't recommend a product or help with applications beyond what the provider allows. Check with the provider before turning this on.";

export const FINANCE_HOMEOWNER_NOTE =
  "These providers are separate businesses. Approval, fees and interest are set by the provider — read their terms before you apply.";
