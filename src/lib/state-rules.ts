// State-aware contract guardrails for residential roofing estimates (recommendation N4).
//
// A small, curated rules table — NOT legal advice and NOT complete for all 50 states. Each rule
// cites the statute it was drawn from; statutes change, so every rule carries "verify with counsel".
// Pure functions, no I/O: used by the estimate page (Compliance panel), the save action (deductible
// waiver block), and the public estimate (notices shown and snapshotted on acceptance).

import { addBusinessDays } from "./format";

export const VERIFY = "Verify with counsel: this is a summary for guidance, not legal advice, and statutes change.";

export type Notice = {
  id: string;
  title: string;
  /** Text attached to the estimate the homeowner signs. */
  text: string;
  citation: string;
  /** Show in bold / emphasized (some statutes require conspicuous type). */
  conspicuous?: boolean;
};

export type DepositRule =
  /** Lesser of a flat amount and a percent of the contract. */
  | { kind: "cap"; maxAmount: number; maxPct: number; note: string; citation: string }
  /** No deposit may be required. */
  | { kind: "none"; note: string; citation: string }
  /** Insurance jobs: no payment until the carrier confirms coverage in writing (or the cancel window passes). */
  | { kind: "insurance_hold"; note: string; citation: string }
  | { kind: "unrestricted"; note: string; citation?: string };

export type CancellationRule = {
  /** General right to cancel (home-solicitation / door-to-door), business days after signing. */
  businessDays: number;
  /** Extra / different right that applies to insurance-paid jobs. */
  insurance?: { businessDays?: number; hours?: number; days?: number; trigger: "signing" | "claim_denial"; note: string; citation: string };
  note: string;
  citation: string;
};

export type StateRule = {
  state: string;
  name: string;
  deposit: DepositRule;
  /** Rules that only apply to insurance-paid jobs (e.g. TN payment hold); falls back to `deposit`. */
  insuranceDeposit?: DepositRule;
  cancellation: CancellationRule;
  /** Notices attached to the estimate. `insuranceOnly` notices apply to insurance-paid jobs. */
  notices: (Notice & { insuranceOnly?: boolean; minContract?: number })[];
  /** Contractor may not waive, rebate or pay the homeowner's insurance deductible. */
  deductibleWaiverBan: boolean;
  deductibleCitation?: string;
  verify: string;
};

// Federal FTC Cooling-Off Rule (16 CFR Part 429): 3 business days for door-to-door sales of $25+ made at
// the buyer's home. (The research could not verify it end-to-end; it is the conservative default.)
const FTC_NOTICE: Notice = {
  id: "ftc_cooling_off",
  title: "Notice of right to cancel",
  text:
    "You, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction. " +
    "To cancel, sign and date a copy of a cancellation notice, or send any other written notice, to the contractor at the address on this estimate.",
  citation: "FTC Cooling-Off Rule, 16 CFR Part 429",
};

export const DEFAULT_RULE: StateRule = {
  state: "DEFAULT",
  name: "Other states (federal default)",
  deposit: { kind: "unrestricted", note: "No state deposit cap in this rules table for your state. Check local rules." },
  cancellation: { businessDays: 3, note: "Federal 3-business-day cooling-off right for sales made at the home.", citation: "16 CFR Part 429" },
  notices: [FTC_NOTICE],
  deductibleWaiverBan: false,
  verify: VERIFY,
};

export const STATE_RULES: Record<string, StateRule> = {
  // California — Bus. & Prof. Code §7159(d)(8): down payment may not exceed $1,000 or 10% of the contract
  // price, whichever is less (reaffirmed for disaster-area work by SB 601, 2023). Home-solicitation
  // contracts: 3 business days to cancel (Civ. Code §1689.5–1689.7; 5 for buyers 65+; 7 after a declared disaster).
  CA: {
    state: "CA",
    name: "California",
    deposit: { kind: "cap", maxAmount: 1000, maxPct: 10, note: "Down payment: the lesser of $1,000 or 10% of the contract price.", citation: "Cal. Bus. & Prof. Code §7159(d)(8); SB 601 (2023)" },
    cancellation: { businessDays: 3, note: "3 business days (5 for seniors 65+, 7 during a declared emergency).", citation: "Cal. Civ. Code §1689.5–1689.7" },
    notices: [
      { id: "ca_down_payment", title: "Down payment", text: "THE DOWN PAYMENT MAY NOT EXCEED $1,000 OR 10 PERCENT OF THE CONTRACT PRICE, WHICHEVER IS LESS.", citation: "Cal. Bus. & Prof. Code §7159(d)(8)", conspicuous: true },
      { id: "ca_cancel", title: "Three-day right to cancel", text: "You, the buyer, have the right to cancel this contract within three business days. You may cancel by e-mailing, mailing, faxing, or delivering a written notice to the contractor at the contractor's place of business by midnight of the third business day after you received a signed and dated copy of the contract that includes this notice.", citation: "Cal. Bus. & Prof. Code §7159(e); Civ. Code §1689.7" },
    ],
    deductibleWaiverBan: false,
    verify: VERIFY,
  },
  // New York — GBL §771-b (roofing and siding work paid from a property insurance claim): the contractor may
  // not require a deposit, and the owner may cancel within 3 business days. General home-improvement
  // contracts: GBL §771; door-to-door: GBL §428 (3 business days).
  NY: {
    state: "NY",
    name: "New York",
    deposit: { kind: "none", note: "A roofing contractor may not require any deposit.", citation: "N.Y. Gen. Bus. Law §771-b" },
    cancellation: {
      businessDays: 3,
      insurance: { businessDays: 3, trigger: "signing", note: "Insurance-paid roofing contracts: 3 business days to cancel.", citation: "N.Y. Gen. Bus. Law §771-b" },
      note: "3 business days for home-solicitation sales.",
      citation: "N.Y. Gen. Bus. Law §428",
    },
    notices: [
      { id: "ny_771b", title: "Insurance claim: right to cancel", insuranceOnly: true, text: "You may cancel this contract at any time before midnight of the third business day after you sign it. No deposit is required by this contractor. If your insurance carrier pays for this work, any cancellation must be in writing and delivered to the contractor at the address on this estimate.", citation: "N.Y. Gen. Bus. Law §771-b" },
      { ...FTC_NOTICE, id: "ny_cancel", citation: "N.Y. Gen. Bus. Law §428; 16 CFR 429" },
    ],
    deductibleWaiverBan: false,
    verify: VERIFY,
  },
  // Tennessee — Tenn. Code Ann. §62-6-601 et seq. (Residential Roofing Services): on insurance-paid work, no
  // payment may be required until the insurer confirms coverage in writing or the 3-day cancellation period
  // has passed; the owner may cancel within 3 business days after notice the claim is denied.
  TN: {
    state: "TN",
    name: "Tennessee",
    deposit: { kind: "unrestricted", note: "No general deposit cap in this table." },
    insuranceDeposit: { kind: "insurance_hold", note: "Insurance jobs: no payment may be required until the insurer confirms coverage in writing or the cancellation period has passed.", citation: "Tenn. Code Ann. §62-6-601 et seq." },
    cancellation: {
      businessDays: 3,
      insurance: { businessDays: 3, trigger: "claim_denial", note: "May cancel within 3 business days after written notice that the claim is denied in whole or part.", citation: "Tenn. Code Ann. §62-6-601 et seq." },
      note: "3 business days for sales made at the home.",
      citation: "16 CFR 429",
    },
    notices: [
      { id: "tn_insurance", title: "Insurance claim: payments and cancellation", insuranceOnly: true, text: "You may cancel this contract within three (3) business days after you receive written notice from your insurer that all or any part of the claim is not a covered loss. No payment will be required until your insurer confirms coverage in writing or the cancellation period has passed.", citation: "Tenn. Code Ann. §62-6-601 et seq." },
      FTC_NOTICE,
    ],
    deductibleWaiverBan: false,
    verify: VERIFY,
  },
  // Texas — Bus. & Com. Code §27.02: a seller who expects to be paid from a property insurance claim may not
  // pay, waive or rebate the deductible; a contract of $1,000 or more must include the statutory notice in
  // bold. Home solicitation: Bus. & Com. Code ch. 601 (3 business days).
  TX: {
    state: "TX",
    name: "Texas",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table." },
    cancellation: { businessDays: 3, note: "3 business days for home-solicitation sales.", citation: "Tex. Bus. & Com. Code §601.052" },
    notices: [
      {
        id: "tx_27_02",
        title: "Texas deductible notice",
        insuranceOnly: true,
        minContract: 1000,
        conspicuous: true,
        text:
          "TEXAS LAW REQUIRES A PERSON INSURED UNDER A PROPERTY INSURANCE POLICY TO PAY ANY DEDUCTIBLE APPLICABLE TO A CLAIM MADE UNDER THE POLICY. " +
          "IT IS A VIOLATION OF TEXAS LAW FOR A SELLER OF GOODS OR SERVICES WHO REASONABLY EXPECTS TO BE PAID WHOLLY OR PARTLY FROM THE PROCEEDS OF A PROPERTY INSURANCE CLAIM " +
          "TO KNOWINGLY ALLOW THE INSURED PERSON TO FAIL TO PAY, OR ASSIST THE INSURED PERSON'S FAILURE TO PAY, THE APPLICABLE INSURANCE DEDUCTIBLE.",
        citation: "Tex. Bus. & Com. Code §27.02",
      },
      { ...FTC_NOTICE, id: "tx_cancel", citation: "Tex. Bus. & Com. Code §601.052; 16 CFR 429" },
    ],
    deductibleWaiverBan: true,
    deductibleCitation: "Tex. Bus. & Com. Code §27.02",
    verify: VERIFY,
  },
  // Colorado — C.R.S. 6-22-105: the owner may rescind an insurance-paid roofing contract within 72 hours after
  // receiving written notice that the claim is denied in whole or part; the contract must say so.
  // C.R.S. 6-22-104 / 10-4-110.8(12): a contractor may not pay, waive or rebate the deductible.
  CO: {
    state: "CO",
    name: "Colorado",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table." },
    cancellation: {
      businessDays: 3,
      insurance: { hours: 72, trigger: "claim_denial", note: "72 hours to rescind after written notice that the claim is denied in whole or part.", citation: "C.R.S. 6-22-105" },
      note: "3 business days for sales made at the home.",
      citation: "16 CFR 429",
    },
    notices: [
      { id: "co_6_22_105", title: "Colorado right to rescind (insurance claims)", insuranceOnly: true, conspicuous: true, text: "You may rescind this contract within seventy-two hours after you receive written notice from your insurer that the claim is denied in whole or in part. To rescind, deliver or mail written notice to the roofing contractor at the address on this estimate. Any payments made, except for work already performed for emergency repairs, will be returned within ten days.", citation: "C.R.S. 6-22-105" },
      { id: "co_deductible", title: "Deductible", insuranceOnly: true, text: "Colorado law prohibits a roofing contractor from paying, waiving, or rebating all or part of your insurance deductible.", citation: "C.R.S. 6-22-104; C.R.S. 10-4-110.8(12)" },
      FTC_NOTICE,
    ],
    deductibleWaiverBan: true,
    deductibleCitation: "C.R.S. 6-22-104; 10-4-110.8(12)",
    verify: VERIFY,
  },
  // Florida — Fla. Stat. §489.147 (prohibited property insurance claim practices): no offering a rebate, gift,
  // waiver of the deductible or anything of value for a claim; insurance-paid roofing contracts may be
  // cancelled within 10 days after execution, or within 30 days of the scheduled start if work hasn't begun.
  FL: {
    state: "FL",
    name: "Florida",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table (Fla. Stat. §489.126 governs use of deposits over 10%)." , citation: "Fla. Stat. §489.126" },
    cancellation: {
      businessDays: 3,
      insurance: { days: 10, trigger: "signing", note: "Insurance-paid roofing: 10 days after signing (or 30 days after the scheduled start if work has not begun).", citation: "Fla. Stat. §489.147" },
      note: "3 business days for home-solicitation sales.",
      citation: "Fla. Stat. §501.021–501.055",
    },
    notices: [
      { id: "fl_489_147", title: "Florida insurance claim notice", insuranceOnly: true, conspicuous: true, text: "You may cancel this contract without penalty within 10 days after it is signed, or within 30 days after the scheduled start date if the contractor has not begun substantial work. The contractor may not offer you a rebate, gift, waiver of your insurance deductible, or anything else of value for making an insurance claim or allowing an inspection.", citation: "Fla. Stat. §489.147" },
      { ...FTC_NOTICE, id: "fl_cancel", citation: "Fla. Stat. §501.031; 16 CFR 429" },
    ],
    deductibleWaiverBan: true,
    deductibleCitation: "Fla. Stat. §489.147",
    verify: VERIFY,
  },
  // Ohio — R.C. 1345.21–1345.28 (Home Solicitation Sales Act): 3 business days with the statutory notice; when
  // the sale is paid from property insurance, the buyer may also cancel within 3 business days after the
  // insurer's written notice that the claim is denied (R.C. 1345.23(C)).
  OH: {
    state: "OH",
    name: "Ohio",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table." },
    cancellation: {
      businessDays: 3,
      insurance: { businessDays: 3, trigger: "claim_denial", note: "Also 3 business days after written notice that the insurance claim is denied.", citation: "Ohio Rev. Code 1345.23" },
      note: "3 business days with the statutory cancellation notice.",
      citation: "Ohio Rev. Code 1345.21–1345.28",
    },
    notices: [
      { id: "oh_cancel", title: "Ohio notice of cancellation", conspicuous: true, text: "You, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction. See the attached notice of cancellation form for an explanation of this right.", citation: "Ohio Rev. Code 1345.23(B)" },
      { id: "oh_insurance", title: "Insurance claim cancellation", insuranceOnly: true, text: "If this transaction is paid in whole or in part from the proceeds of a property insurance claim, you may also cancel it within three business days after you receive written notice from your insurer that the claim has been denied in whole or in part.", citation: "Ohio Rev. Code 1345.23(C)" },
    ],
    deductibleWaiverBan: false,
    verify: VERIFY,
  },
  // Kansas — Roofing Registration Act (K.S.A. 50-6a01 et seq.) and insurance-claim provisions: a roofer may not
  // offer to pay, waive or rebate the deductible. Door-to-door sales: K.S.A. 50-640 (3 business days).
  KS: {
    state: "KS",
    name: "Kansas",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table." },
    cancellation: { businessDays: 3, note: "3 business days for door-to-door sales.", citation: "K.S.A. 50-640" },
    notices: [
      { id: "ks_deductible", title: "Deductible", insuranceOnly: true, text: "Kansas law prohibits a roofing contractor from paying, waiving, or rebating all or any part of your insurance deductible.", citation: "K.S.A. 50-6a01 et seq." },
      { ...FTC_NOTICE, id: "ks_cancel", citation: "K.S.A. 50-640; 16 CFR 429" },
    ],
    deductibleWaiverBan: true,
    deductibleCitation: "K.S.A. 50-6a01 et seq.",
    verify: VERIFY,
  },
  // Minnesota — Minn. Stat. §325E.66: an owner may cancel a residential roofing contract paid from an insurance
  // claim within 72 hours after notice the claim is denied; a contractor may not pay or rebate the deductible
  // or advertise doing so (§325E.66 subd. 4 / §60K.46).
  MN: {
    state: "MN",
    name: "Minnesota",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table." },
    cancellation: {
      businessDays: 3,
      insurance: { hours: 72, trigger: "claim_denial", note: "72 hours to cancel after notice the claim is denied in whole or part.", citation: "Minn. Stat. §325E.66" },
      note: "3 business days for home-solicitation sales.",
      citation: "Minn. Stat. §325G.06–325G.11",
    },
    notices: [
      { id: "mn_325e66", title: "Minnesota insurance claim cancellation", insuranceOnly: true, conspicuous: true, text: "You may cancel this contract at any time before midnight on the third day (72 hours) after you have been notified by your insurer that all or any part of the claim or contract is not a covered loss under the insurance policy. A residential contractor may not pay or rebate any portion of your insurance deductible.", citation: "Minn. Stat. §325E.66" },
      { ...FTC_NOTICE, id: "mn_cancel", citation: "Minn. Stat. §325G.07; 16 CFR 429" },
    ],
    deductibleWaiverBan: true,
    deductibleCitation: "Minn. Stat. §325E.66",
    verify: VERIFY,
  },
  // South Dakota — no statewide roofing-specific contract statute captured in this table; door-to-door
  // sales follow the federal rule and SDCL 37-24-5.2 (3 business days). Local licensing may apply.
  SD: {
    state: "SD",
    name: "South Dakota",
    deposit: { kind: "unrestricted", note: "No state deposit cap in this table. No statewide roofing license; check city rules." },
    cancellation: { businessDays: 3, note: "3 business days for door-to-door sales.", citation: "SDCL 37-24-5.2; 16 CFR 429" },
    notices: [{ ...FTC_NOTICE, id: "sd_cancel", citation: "SDCL 37-24-5.2; 16 CFR 429" }],
    deductibleWaiverBan: false,
    verify: VERIFY,
  },
};

export const RULE_STATES = Object.keys(STATE_RULES);

/** Normalize a state field ("tx", " Texas ") to a 2-letter code when possible. */
export function normalizeState(v: string | null | undefined): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (/^[a-z]{2}$/i.test(t)) return t.toUpperCase();
  const byName = Object.values(STATE_RULES).find((r) => r.name.toLowerCase() === t.toLowerCase());
  return byName ? byName.state : null;
}

/** The job's state, falling back to the customer's state, then the company's. */
export function resolveState(jobState?: string | null, customerState?: string | null, orgState?: string | null) {
  for (const [v, source] of [[jobState, "job"], [customerState, "customer"], [orgState, "company"]] as const) {
    const s = normalizeState(v);
    if (s) return { state: s, source };
  }
  return { state: null, source: "none" as const };
}

export function rulesFor(state: string | null | undefined): StateRule {
  const s = normalizeState(state);
  return (s && STATE_RULES[s]) || DEFAULT_RULE;
}

/** The deposit rule in force (insurance-only rules win on insurance jobs). */
export function depositRule(rule: StateRule, isInsurance: boolean): DepositRule {
  return isInsurance && rule.insuranceDeposit ? rule.insuranceDeposit : rule.deposit;
}

/** Most the contractor may ask for at signing; null = no cap in the table. */
export function maxDeposit(rule: StateRule, total: number, isInsurance: boolean): number | null {
  const d = depositRule(rule, isInsurance);
  const t = Math.max(0, Number(total) || 0);
  if (d.kind === "none" || d.kind === "insurance_hold") return 0;
  if (d.kind === "cap") return Math.round(Math.min(d.maxAmount, (t * d.maxPct) / 100) * 100) / 100;
  return null;
}

/** Deposit the org's payment schedule would request at signing (sum of "signed" milestones). */
export function scheduledDeposit(schedule: { pct: number; trigger: string }[] | null | undefined, total: number) {
  const pct = (schedule ?? []).filter((s) => s.trigger === "signed").reduce((s, x) => s + (Number(x.pct) || 0), 0);
  return { pct, amount: Math.round(((Math.max(0, Number(total) || 0) * pct) / 100) * 100) / 100 };
}

/**
 * Cancel-by date from the signing date (business days skip weekends only; holidays are not
 * considered, so confirm close calls). Claim-denial windows run from the denial letter, so they
 * are returned as a description rather than a date.
 */
export function cancelBy(rule: StateRule, signedAt: Date, isInsurance: boolean) {
  const general = addBusinessDays(signedAt, rule.cancellation.businessDays);
  general.setHours(23, 59, 0, 0);
  let date = general;
  let insuranceNote: string | null = null;
  const ins = rule.cancellation.insurance;
  if (isInsurance && ins) {
    if (ins.trigger === "signing") {
      let d: Date;
      if (ins.days) { d = new Date(signedAt); d.setDate(d.getDate() + ins.days); d.setHours(23, 59, 0, 0); }
      else if (ins.hours) d = new Date(signedAt.getTime() + ins.hours * 3600000);
      else { d = addBusinessDays(signedAt, ins.businessDays ?? 0); d.setHours(23, 59, 0, 0); }
      if (d > date) date = d;
    } else {
      const span = ins.hours ? `${ins.hours} hours` : ins.days ? `${ins.days} days` : `${ins.businessDays} business days`;
      insuranceNote = `Plus ${span} after the homeowner receives a written claim denial (${ins.citation}).`;
    }
  }
  return { date, insuranceNote };
}

/** Notices that will be attached to this estimate. */
export function requiredNotices(rule: StateRule, ctx: { isInsurance: boolean; total: number }): Notice[] {
  return rule.notices
    .filter((n) => (!n.insuranceOnly || ctx.isInsurance) && (n.minContract == null || ctx.total >= n.minContract))
    .map(({ id, title, text, citation, conspicuous }) => ({ id, title, text, citation, ...(conspicuous ? { conspicuous } : {}) }));
}

/** Snapshot stored in estimates.legal_notices on acceptance. */
export function noticeSnapshot(state: string | null, notices: Notice[]) {
  return notices.map((n) => ({ ...n, state: state ?? "DEFAULT", verify: VERIFY }));
}

const WAIVER_WORDS = /\b(deductible|waive[sd]?|waiver|rebate|cash\s*back)\b/i;
const INSURANCE_CREDIT = /\b(insurance|claim|carrier)\b/i;

/** A line that looks like the contractor absorbing the homeowner's deductible. */
export function looksLikeDeductibleWaiver(item: { description: string; unit_price: number | string; quantity?: number | string }) {
  const d = String(item.description ?? "");
  const price = Number(item.unit_price) || 0;
  const qty = item.quantity == null ? 1 : Number(item.quantity) || 0;
  if (WAIVER_WORDS.test(d)) return true;
  if (INSURANCE_CREDIT.test(d) && (price < 0 || price * qty < 0) && /credit|discount|off|allowance/i.test(d)) return true;
  return false;
}

/** Error message when an estimate would carry a deductible discount in a ban state, else null. */
export function deductibleWaiverError(rule: StateRule, items: { description: string; unit_price: number | string; quantity?: number | string }[]): string | null {
  if (!rule.deductibleWaiverBan) return null;
  const bad = items.find(looksLikeDeductibleWaiver);
  if (!bad) return null;
  return `"${bad.description}" looks like a deductible discount or waiver, which ${rule.name} prohibits (${rule.deductibleCitation ?? "state law"}). Remove it or reword it if it is something else. ${VERIFY}`;
}
