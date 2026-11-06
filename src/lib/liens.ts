// Mechanics' lien deadlines for RESIDENTIAL work by a contractor who contracts directly with the
// homeowner (a "prime" / "original" contractor), counted from the last day labor or materials were
// furnished. This is a curated summary for reminders only — statutes change, owner-occupied
// homestead rules add requirements, and computing the day is fact-specific. VERIFY WITH COUNSEL.
//
// Sources (statutes as summarized by Levelset's state guides,
// https://www.levelset.com/blog/lien-and-notice-deadlines-in-all-50-states, checked 2026):
//  TX  Tex. Prop. Code §53.052 (as amended by HB 2237, contracts on/after 1-1-2022): residential original
//      contractor files the lien affidavit by the 15th day of the 3rd month after the month the work was
//      completed; §53.055 notice of the filed affidavit to the owner within 5 days; §53.255 residential disclosure.
//  FL  Fla. Stat. §713.08(5): claim of lien within 90 days of final furnishing; §713.015 mandatory
//      disclosure in residential contracts > $2,500; §713.06(3)(d) contractor's final payment affidavit
//      at least 5 days before suing to enforce; §713.08(4)(c) serve the lien on the owner within 15 days of recording.
//  CA  Cal. Civ. Code §8412: direct contractor records within 90 days after completion (60 days after a
//      recorded notice of completion/cessation); direct contractors need no preliminary notice (§8200).
//  CO  C.R.S. §38-22-109(5): lien statement within 4 months after the last work; §38-22-109(3) notice of
//      intent to file served at least 10 days before recording.
//  GA  O.C.G.A. §44-14-361.1: claim of lien within 90 days of last furnishing; notice of filing to the owner
//      within 2 business days after filing; suit within 365 days.
//  NC  N.C.G.S. §44A-12: claim of lien within 120 days after last furnishing; §44A-13 suit within 180 days.
//  AZ  A.R.S. §33-992.01: preliminary 20-day notice within 20 days of first furnishing; §33-993: record
//      within 120 days after completion (60 days if a notice of completion is recorded).
//  OH  O.R.C. §1311.06(B)(1): residential (1–2 family) affidavit within 60 days of last furnishing;
//      §1311.07 serve the owner within 30 days of filing.
//  IL  770 ILCS 60/7: record within 4 months after completion to bind third parties (2 years vs. owner);
//      770 ILCS 60/5: residential contractor gives the owner a sworn statement of subs/suppliers before payment.
//  NY  N.Y. Lien Law §10: notice of lien within 4 months after completion for a single-family dwelling
//      (8 months otherwise); §11 serve the owner within 30 days after filing.

export type LienDeadline =
  | { kind: "days"; days: number }
  | { kind: "months"; months: number }
  | { kind: "month_day"; monthsAfter: number; day: number };

export type LienNotice = {
  label: string;
  /** When it's due: relative to first furnishing, or before the lien deadline, or a fixed milestone. */
  due: { from: "first_furnished"; days: number } | { from: "before_lien"; days: number } | { from: "contract" } | { from: "after_filing"; days: number };
};

export type StateLienRule = {
  state: string;
  name: string;
  lien: LienDeadline;
  lienLabel: string;
  notices: LienNotice[];
  notes: string;
  citation: string;
};

export const LIEN_RULES: Record<string, StateLienRule> = {
  TX: {
    state: "TX", name: "Texas", lien: { kind: "month_day", monthsAfter: 3, day: 15 },
    lienLabel: "File lien affidavit by the 15th day of the 3rd month after the month work was completed",
    notices: [
      { label: "Residential disclosure statement in the contract", due: { from: "contract" } },
      { label: "Send copy of filed affidavit to the owner", due: { from: "after_filing", days: 5 } },
    ],
    notes: "Homestead liens need a signed, recorded contract before work starts.",
    citation: "Tex. Prop. Code §§53.052, 53.055, 53.255",
  },
  FL: {
    state: "FL", name: "Florida", lien: { kind: "days", days: 90 },
    lienLabel: "Record claim of lien within 90 days of final furnishing",
    notices: [
      { label: "Statutory lien-law disclosure in the residential contract (> $2,500)", due: { from: "contract" } },
      { label: "Serve the recorded lien on the owner", due: { from: "after_filing", days: 15 } },
      { label: "Contractor's final payment affidavit (≥ 5 days before suit)", due: { from: "before_lien", days: 0 } },
    ],
    notes: "Subs and suppliers must serve a Notice to Owner within 45 days of first furnishing.",
    citation: "Fla. Stat. §§713.015, 713.06, 713.08",
  },
  CA: {
    state: "CA", name: "California", lien: { kind: "days", days: 90 },
    lienLabel: "Record mechanics lien within 90 days after completion (60 if a notice of completion was recorded)",
    notices: [],
    notes: "Direct contractors don't need a preliminary notice; subs and suppliers do (20 days).",
    citation: "Cal. Civ. Code §§8200, 8412",
  },
  CO: {
    state: "CO", name: "Colorado", lien: { kind: "months", months: 4 },
    lienLabel: "Record lien statement within 4 months after last work",
    notices: [{ label: "Notice of intent to lien (≥ 10 days before recording)", due: { from: "before_lien", days: 10 } }],
    notes: "Owner-occupied residences have extra limits on what can be liened.",
    citation: "C.R.S. §38-22-109",
  },
  GA: {
    state: "GA", name: "Georgia", lien: { kind: "days", days: 90 },
    lienLabel: "File claim of lien within 90 days of last furnishing",
    notices: [{ label: "Send notice of filing to the owner", due: { from: "after_filing", days: 2 } }],
    notes: "Start a suit within 365 days of filing and record a notice of action.",
    citation: "O.C.G.A. §44-14-361.1",
  },
  NC: {
    state: "NC", name: "North Carolina", lien: { kind: "days", days: 120 },
    lienLabel: "File claim of lien within 120 days after last furnishing",
    notices: [],
    notes: "Enforcement suit within 180 days after last furnishing.",
    citation: "N.C.G.S. §§44A-12, 44A-13",
  },
  AZ: {
    state: "AZ", name: "Arizona", lien: { kind: "days", days: 120 },
    lienLabel: "Record lien within 120 days after completion (60 if a notice of completion was recorded)",
    notices: [{ label: "Preliminary 20-day notice", due: { from: "first_furnished", days: 20 } }],
    notes: "On owner-occupied homes only the contractor with a written contract with the owner can lien.",
    citation: "A.R.S. §§33-992.01, 33-993, 33-1002",
  },
  OH: {
    state: "OH", name: "Ohio", lien: { kind: "days", days: 60 },
    lienLabel: "File affidavit within 60 days of last furnishing (residential 1–2 family)",
    notices: [{ label: "Serve the owner with the affidavit", due: { from: "after_filing", days: 30 } }],
    notes: "Commercial and other property: 75 days.",
    citation: "O.R.C. §§1311.06, 1311.07",
  },
  IL: {
    state: "IL", name: "Illinois", lien: { kind: "months", months: 4 },
    lienLabel: "Record lien within 4 months after completion (to bind third parties)",
    notices: [{ label: "Sworn statement of subs/suppliers to the owner before payment", due: { from: "contract" } }],
    notes: "Against the owner alone a contractor has 2 years, but lenders/buyers take free of an unrecorded lien.",
    citation: "770 ILCS 60/5, 60/7",
  },
  NY: {
    state: "NY", name: "New York", lien: { kind: "months", months: 4 },
    lienLabel: "File notice of lien within 4 months after completion (single-family dwelling)",
    notices: [{ label: "Serve the owner with the notice of lien", due: { from: "after_filing", days: 30 } }],
    notes: "Other property types: 8 months.",
    citation: "N.Y. Lien Law §§10, 11",
  },
};

export const liensDisclaimer = "Reminder only — deadlines vary by facts and change; verify with counsel.";

export const LIEN_STATES = Object.keys(LIEN_RULES);

const toDate = (iso: string) => new Date(iso + "T12:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };

/** Add calendar months, clamping to the end of a shorter month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d);
}

export function lienDeadline(rule: StateLienRule, lastFurnished: string) {
  const l = rule.lien;
  if (l.kind === "days") return addDays(lastFurnished, l.days);
  if (l.kind === "months") return addMonths(lastFurnished, l.months);
  const d = toDate(lastFurnished);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + l.monthsAfter, l.day, 12));
  return toIso(target);
}

export type LienSchedule = {
  rule: StateLienRule;
  lienDue: string | null;
  daysLeft: number | null;
  notices: { label: string; due: string | null; note?: string }[];
};

export function lienSchedule(state: string | null | undefined, opts: { lastFurnished: string | null; firstFurnished: string | null; today: string }): LienSchedule | null {
  const rule = state ? LIEN_RULES[state.toUpperCase()] : undefined;
  if (!rule) return null;
  const lienDue = opts.lastFurnished ? lienDeadline(rule, opts.lastFurnished) : null;
  const daysLeft = lienDue ? Math.round((toDate(lienDue).getTime() - toDate(opts.today).getTime()) / 86400000) : null;
  const notices = rule.notices.map((n) => {
    const d = n.due;
    if (d.from === "contract") return { label: n.label, due: null, note: "With the contract" };
    if (d.from === "after_filing") return { label: n.label, due: null, note: `Within ${d.days} day${d.days === 1 ? "" : "s"} after filing` };
    if (d.from === "first_furnished") return { label: n.label, due: opts.firstFurnished ? addDays(opts.firstFurnished, d.days) : null, note: opts.firstFurnished ? undefined : "Set the start date" };
    return { label: n.label, due: lienDue ? addDays(lienDue, -d.days) : null, note: lienDue ? undefined : "Set last furnished date" };
  });
  return { rule, lienDue, daysLeft, notices };
}
