/**
 * Australian state-by-state roofing rules engine (pure, no I/O).
 *
 *   rulesFor(state, input) → what applies to THIS job in THIS state on THIS contract date:
 *   regulator, licence, written contract tier, deposit cap, cooling-off, home warranty insurance,
 *   documents, statutory warranties, security of payment, permits, WHS (SWMS), asbestos, ACL
 *   door-to-door rules, plus every source and every item the research could NOT verify.
 *
 * Values come only from the verified research (see au-rules-data.ts). Where the research could not
 * verify something, the engine does not guess: it returns an `unverified` entry that the UI shows as
 * "Check with your regulator" with the regulator's link. This is general information, not legal advice.
 */
import { AU_STATE_NAME, AU_STATE_TZ, asAuState, type AuState } from "./au";
import { addBusinessDays, calendarDate, type BusinessDayOptions, type IsoDate } from "./au-business-days";
import {
  ACL_CALLING_HOURS, ACL_FRONT_PAGE_TEXT, ACL_FRONT_PAGE_TITLE, CARD_SURCHARGE_BAN_FROM, DISCLAIMER, NSW_COOLING_OFF_TEXT,
  NT_CHANGE_DATE, NT_RESIDENTIAL_SWMS_FROM, NT_THRESHOLD, pick, QLD_CBG_V2_FROM, QLD_COOLING_OFF_SUGGESTED, REGULATOR, SA_CHANGE_DATE,
  SA_FORM1_CL2, SA_MINOR, SA_SWMS_M, SRC, TAS_REGS_2026, VERIFIED_ON, VIC_CHANGE_DATE, VIC_COOLING_OFF_TEXT, VIC_HW, VIC_MAJOR,
  WHS_REGULATOR, type Cite, type Regulator,
} from "./au-rules-data";

export { VERIFIED_ON, DISCLAIMER } from "./au-rules-data";
export type { Cite, Regulator } from "./au-rules-data";
export { HOLIDAY_NOTE } from "./au-business-days";

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------
export type RoofSystem = "metal" | "concrete_tile" | "terracotta_tile" | "membrane";
export const ROOF_SYSTEMS: { value: RoofSystem; label: string }[] = [
  { value: "metal", label: "Metal (COLORBOND / ZINCALUME)" },
  { value: "concrete_tile", label: "Concrete tile" },
  { value: "terracotta_tile", label: "Terracotta tile" },
  { value: "membrane", label: "Membrane / low-slope" },
];
export type AuJobType = "re_roof" | "restoration" | "repair" | "gutters" | "asbestos_replacement" | "new_build" | "other";
export const AU_JOB_TYPES: { value: AuJobType; label: string }[] = [
  { value: "re_roof", label: "Re-roof (incl. tile to metal)" },
  { value: "restoration", label: "Restoration (clean, rebed/repoint, coat)" },
  { value: "repair", label: "Repair / leak" },
  { value: "gutters", label: "Gutters & downpipes" },
  { value: "asbestos_replacement", label: "Asbestos roof replacement" },
  { value: "new_build", label: "New build" },
  { value: "other", label: "Other" },
];

export type RuleInput = {
  /** Total contract price including GST (ACL single price). */
  contractValueIncGst: number;
  /** Date the contract is (or will be) signed: picks effective-dated rules. Date or YYYY-MM-DD. */
  contractDate: string | Date;
  roofSystem: RoofSystem;
  jobType: AuJobType;
  /** Does the job need a building permit / approval / development approval? undefined = not known yet. */
  buildingApprovalRequired?: boolean;
  /** Work on an existing house (vs a new house or extension). */
  existingHouse: boolean;
  /** Sold on an uninvited visit or call (door-knock, storm canvass, cold call) → ACL unsolicited agreement. */
  doorKnockSale?: boolean;
  /** The customer lives (or will live) in the house. Default true. */
  ownerOccupier?: boolean;
  /** Urgent work: delay would risk health/safety or property damage (NSW cooling-off exception). */
  urgentWork?: boolean;
  /** The contract is ONLY cleaning/painting/coating (VIC painting exemption; QLD painting licence). */
  paintOrCoatOnly?: boolean;
  /** VIC: the contract also covers non-plumbing building work (e.g. battens, carpentry) on a metal roof. */
  mixedWork?: boolean;
  /** The roofer is subcontracting to a builder rather than contracting with the owner. */
  subcontract?: boolean;
  /** ACL disaster emergency-repair exemption is being relied on (declared emergency, licensed, hazard repairs only). */
  disasterEmergencyRepair?: boolean;
  /** Roof pitch in degrees (QLD: fall controls at any height over 26°). */
  roofPitchDeg?: number;
  /** House built before 1990 (asbestos check prompt). */
  builtBefore1990?: boolean;
};

export type Tri = boolean | "depends";
export type ShowOn = "quote" | "contract" | "ads" | "invoice" | "site_sign" | "business_card" | "vehicle";
export const SHOW_ON_LABEL: Record<ShowOn, string> = {
  quote: "quotes", contract: "contracts", ads: "ads", invoice: "invoices", site_sign: "site sign", business_card: "business cards", vehicle: "vehicles",
};

export type LicenceRule = { required: Tri; threshold: number | null; thresholdText: string; classes: string[]; showOn: ShowOn[]; showOnRecommended: ShowOn[]; note: string; src: Cite[] };
export type WrittenContractRule = { required: Tri; tier: string | null; mustInclude: string[]; note: string; src: Cite[] };
export type DepositRule = { maxPct: number | null; maxAud: number | null; isLegalLimit: boolean; note: string; src: Cite[] };
export type CoolingOffRule = {
  applies: boolean;
  length: number | null;
  unit: "business_days" | null;
  startsWhen: string;
  exceptions: string[];
  noticeText: string | null;
  noticeKind: "approved_form" | "prescribed_form" | "government_sample" | "suggested" | null;
  noticeSource: Cite | null;
  /** Options for computing the end date (NSW excludes 27–31 Dec). */
  businessDayRules: BusinessDayOptions;
  note: string;
  src: Cite[];
};
export type InsuranceRule = { scheme: string | null; required: Tri; mustBeBefore: "deposit" | "work" | "payment" | null; threshold: number | null; note: string; src: Cite[] };
export type DocumentRule = { name: string; when: string; link: string };
export type WarrantyRule = { type: string; years: number };
export type SopRule = { appliesToOwnerOccupier: boolean | "unclear"; appliesToThisJob: Tri; scheduleDays: number | null; unit: "business_days" | "working_days"; note: string; src: Cite[] };
export type PermitRule = { status: "likely_not_needed" | "check" | "likely_needed"; summary: string; src: Cite[] };
export type WhsRule = { swmsHeightM: number; fallControlHeightM: number | null; notes: string[]; src: Cite[] };
export type AsbestosRule = { unlicensedMaxM2: number; unlicensedTimeLimit: string | null; notifyBefore: string; notes: string[]; neverHighPressureClean: true; src: Cite[] };
export type AclRule = {
  applies: boolean;
  thresholdAud: number;
  terminationBusinessDays: number;
  noSupplyOrPaymentDuringPeriod: boolean;
  exemptionClaimed: boolean;
  callingHours: string;
  frontPageTitle: string;
  frontPageNotice: string;
  notes: string[];
  src: Cite[];
};
export type Unverified = { topic: string; note: string; regulator: Regulator };
export type Scope = { covered: Tri; summary: string };

export type RulesResult = {
  state: AuState;
  stateName: string;
  contractDate: IsoDate;
  /** Which effective-dated rule set was used (e.g. "Contracts signed before 31 Mar 2027"). */
  regime: string;
  regulator: Regulator;
  whsRegulator: Regulator;
  scope: Scope;
  licence: LicenceRule;
  writtenContract: WrittenContractRule;
  deposit: DepositRule;
  coolingOff: CoolingOffRule;
  insurance: InsuranceRule;
  documents: DocumentRule[];
  statutoryWarranty: WarrantyRule[];
  warrantyNote: string;
  securityOfPayment: SopRule;
  permit: PermitRule;
  whs: WhsRule;
  asbestos: AsbestosRule;
  acl: AclRule;
  national: { notes: string[]; src: Cite[] };
  sources: Cite[];
  unverified: Unverified[];
  verifiedOn: string;
  disclaimer: string;
};

type StatePart = Omit<RulesResult, "state" | "stateName" | "contractDate" | "regulator" | "whsRegulator" | "acl" | "national" | "sources" | "verifiedOn" | "disclaimer">;

type Ctx = RuleInput & { state: AuState; v: number; d: IsoDate; owner: boolean };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const $ = (n: number) => aud.format(n);
const fmtDate = (iso: IsoDate) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const pctOf = (v: number, pct: number) => Math.round(v * pct) / 100;
const isTile = (r: RoofSystem) => r === "concrete_tile" || r === "terracotta_tile";

const NO_COOLING: Omit<CoolingOffRule, "note" | "src"> = {
  applies: false, length: null, unit: null, startsWhen: "", exceptions: [], noticeText: null, noticeKind: null, noticeSource: null, businessDayRules: {},
};

/** Model WHS asbestos rules (verified in the QLD, SA and WA regulations that mirror the model text). */
function modelAsbestos(extraNotes: string[] = [], src: Cite[] = []): AsbestosRule {
  return {
    unlicensedMaxM2: 10,
    unlicensedTimeLimit: null,
    notifyBefore: "at least 5 days before licensed removal starts",
    notes: [
      "Up to 10 m² of non-friable asbestos (e.g. a few AC sheets): no licence, but a competent person trained in asbestos removal must do it.",
      "More than 10 m² of non-friable asbestos needs a Class B (or A) licensed removalist; any friable asbestos needs Class A.",
      "Disturbing asbestos is high risk construction work: a SWMS is required.",
      ...extraNotes,
    ],
    neverHighPressureClean: true,
    src: [SRC.qldWhs, SRC.waWhs, SRC.saWhs, ...src],
  };
}

const NEVER_PRESSURE_CLEAN = "Never use high-pressure water or compressed air on asbestos-cement roofs (WHS reg 446). No angle grinders; wet down with PVA before removal.";

// ---------------------------------------------------------------------------------------------
// NSW
// ---------------------------------------------------------------------------------------------
function nsw(c: Ctx): StatePart {
  const { v } = c;
  const reg = REGULATOR.NSW;
  const head = !c.subcontract;
  const classes = [
    ...(c.roofSystem === "metal" || c.jobType === "gutters" ? ["Roof plumbing (metal roofs, gutters, downpipes, flashings)"] : []),
    ...(isTile(c.roofSystem) ? ["Roof tiling (concrete, clay or metal tiles; bedding and pointing, valleys, sarking, battens)"] : []),
    "General building work (covers all residential building work)",
  ];
  const tier = v <= 5000 ? null : v <= 20000 ? "Small jobs contract ($5,000–$20,000)" : "Large jobs contract (over $20,000)";
  const small = ["Date and signatures of both parties", "Names, incl. the licence holder's name as on the licence", "Contractor licence number", "Description of the work", "Plans / specifications", "Contract price (if known)", "Quality of construction clause", "Permitted design-liability limitation clause", "Copy of the Consumer Building Guide"];
  const large = [...small, "Contract price prominently on the first page (with a warning if it may change)", "Statutory warranties", "HBC insurance cost", "Variations clause (written, signed by both)", "Progress payment schedule (stages and/or costs incurred)", "Termination clause", "17-item owner checklist with caution", "Note: owner gets a signed copy within 5 business days", "HBC certificate note", "5 clear business day cooling-off statement", "Owner's acknowledgement of the Consumer Building Guide and checklist", "Security of Payment Guide"];
  const insReq = head && v > 20000;
  const coolApplies = head && v > 20000 && !c.urgentWork;
  const unverified: Unverified[] = [
    { topic: "Home warranty (HBC) exemptions", note: "The Home Building Regulation's list of HBC-exempt projects could not be read. Check before relying on an exemption.", regulator: { name: "icare HBCF", url: SRC.icareNeed.url } },
    { topic: "Building approval for re-roofing", note: "Whether a like-for-like re-roof is exempt development (Codes SEPP) was not verified. The owner must check approvals with council or a certifier.", regulator: reg },
    { topic: "Asbestos and falls (NSW specifics)", note: "SafeWork NSW pages and the NSW WHS Regulation text could not be read; the model WHS values below are shown. Confirm with SafeWork NSW.", regulator: WHS_REGULATOR.NSW },
    { topic: "Missing cooling-off statement", note: "The remedy if a contract over $20,000 omits the cooling-off statement (reportedly 7 days after the owner becomes aware) was not verified.", regulator: reg },
    ...(c.roofSystem === "membrane" ? [{ topic: "Licence category for membrane roofing", note: "Membranes are excluded from roof plumbing; the right licence category for membrane-only work was not verified.", regulator: reg }] : []),
  ];
  return {
    regime: "NSW Home Building Act rules (Building Commission NSW, checked 6 Nov 2026)",
    scope: { covered: true, summary: "Roofing on a home is residential building work under the Home Building Act 1989 (roof plumbing, roof tiling and roof slating are trade work)." },
    licence: {
      required: v > 5000, threshold: 5000, thresholdText: "Contractor licence for work valued at more than $5,000 (labour and materials, incl. GST); also for advertising and contracting.",
      classes, showOn: ["contract", "ads"], showOnRecommended: ["quote", "invoice"],
      note: "The licence must be in the name of the contracting entity: a director's own licence doesn't cover their company. Ads must show the licensee name (or registered business name), licence number with category, and business phone.",
      src: [SRC.nswRoofPlumbing, SRC.nswRoofTiling, SRC.nswGeneral, SRC.nswAds],
    },
    writtenContract: {
      required: v > 5000, tier, mustInclude: v <= 5000 ? [] : v <= 20000 ? small : large,
      note: v <= 5000 ? "No statutory written contract at $5,000 or less, but give one anyway." : "Arbitration clauses are void. The owner gets a signed copy within 5 business days.",
      src: [SRC.nswContracts, SRC.nswOwnerContracts],
    },
    deposit: {
      maxPct: 10, maxAud: pctOf(v, 10), isLegalLimit: true,
      note: `Flat 10% for all contracts. Any money taken before work starts counts toward it.${insReq ? " Over $20,000: no deposit at all until the HBC certificate has been given." : ""}`,
      src: [SRC.nswContracts, SRC.nswSample20k],
    },
    coolingOff: v > 20000 && head
      ? {
        applies: coolApplies, length: 5, unit: "business_days",
        startsWhen: "After the owner is given a copy of the signed contract (if no copy within 5 days of signing: after the owner becomes aware they are entitled to one).",
        exceptions: ["Urgent work: delay would risk health/safety or damage to property and the work can't wait for the cooling-off period", "Both parties are licensed contractors", "Licensed contractor and a developer", "Contract fully prepared by the owner's side", "Shortened or waived with a lawyer's certificate (HBA s 7BA(5))"],
        noticeText: NSW_COOLING_OFF_TEXT, noticeKind: "government_sample", noticeSource: SRC.nswSample20k,
        businessDayRules: { excludeDec27to31: true },
        note: c.urgentWork
          ? "Urgent-work exception selected: record in the contract why the work can't wait. Otherwise the owner can rescind within 5 clear business days, even after work has started."
          : "5 clear business days. A business day excludes weekends, public holidays and 27–31 December. The owner can rescind even after work starts; you keep reasonable out-of-pocket costs and a reasonable price for work done.",
        src: [SRC.nswSample20k, SRC.nswContracts],
      }
      : { ...NO_COOLING, note: c.subcontract ? "No HBA cooling-off between licensed contractors." : "No Home Building Act cooling-off at $20,000 or less.", src: [SRC.nswContracts] },
    insurance: {
      scheme: "Home Building Compensation Fund (icare HBCF)", required: insReq, mustBeBefore: insReq ? "deposit" : null, threshold: 20000,
      note: insReq
        ? "Get the HBC certificate for this project before taking ANY payment (including the deposit) and before starting work, and give the owner a copy."
        : c.subcontract ? "Subcontractors don't insure: the head contractor does." : "Not needed at $20,000 or less (incl. GST).",
      src: [SRC.icareNeed, SRC.nswInsurance],
    },
    documents: [
      ...(v > 5000 ? [{ name: "Consumer Building Guide (Nov 2025 edition, unmodified)", when: "Before the owner signs", link: SRC.nswCbgPdf.url }] : []),
      ...(v > 5000 && v <= 20000 ? [{ name: "Small jobs contract (sample)", when: "At signing", link: SRC.nswSample5to20.url }] : []),
      ...(v > 20000 ? [
        { name: "Large jobs contract incl. 17-item checklist (sample)", when: "At signing", link: SRC.nswSample20k.url },
        { name: "Security of Payment Guide (in the contract)", when: "In every contract over $20,000", link: SRC.nswSopChanges.url },
        ...(head ? [{ name: "HBC Certificate of Insurance", when: "Before any payment and before work starts", link: SRC.icareNeed.url }] : []),
        { name: "Progress payment schedule", when: "In the contract", link: SRC.nswContracts.url },
      ] : []),
      ...(v > 5000 ? [{ name: "Signed copy of the contract", when: "Within 5 business days of signing", link: SRC.nswOwnerContracts.url }] : []),
      { name: "Written variations (with the cost calculation), signed by both", when: "Before variation work (after the fact only for urgent danger/damage)", link: SRC.nswOwnerContracts.url },
    ],
    statutoryWarranty: [{ type: "Major defects (incl. roof waterproofing or structure)", years: 6 }, { type: "All other defects", years: 2 }],
    warrantyNote: "From completion. If a breach shows up in the last 6 months, the owner gets an extra 6 months. Warranties apply even if not written into the contract.",
    securityOfPayment: {
      appliesToOwnerOccupier: true, appliesToThisJob: v >= 5000, scheduleDays: 10, unit: "business_days",
      note: "Owner-occupier contracts are covered (except residential work under $5,000). Payment claims must say they are made under the Building and Construction Industry Security of Payment Act 1999 (NSW). Default due date homeowner → builder: 10 business days.",
      src: [SRC.nswSopChanges, SRC.nswSopFaq],
    },
    permit: {
      status: "check",
      summary: "Check with council or a certifier. A like-for-like re-roof on a 1–2 storey house that isn't heritage-listed and has no structural change is usually exempt, but this was not verified. Never tell the owner \"no approval needed\" as fact.",
      src: [SRC.nswCbgGuide],
    },
    whs: { swmsHeightM: 2, fallControlHeightM: null, notes: ["SWMS before work with a fall risk over 2 m (model WHS reg 291). NSW-specific variations not verified."], src: [SRC.qldWhs] },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN, "NSW-specific asbestos rules were not verified: confirm notice periods with SafeWork NSW."]),
    unverified,
  };
}

// ---------------------------------------------------------------------------------------------
// VIC (effective-dated: 1 Jul 2026 insurance; 31 Mar 2027 contracts)
// ---------------------------------------------------------------------------------------------
function vic(c: Ctx): StatePart {
  const { v, d } = c;
  const reg = REGULATOR.VIC;
  const post = d >= VIC_CHANGE_DATE;
  const major = pick(VIC_MAJOR, d);
  const plumbingOnly = (c.roofSystem === "metal" || c.jobType === "gutters") && !c.mixedWork && c.jobType !== "asbestos_replacement" && !c.paintOrCoatOnly;
  const paintOnly = Boolean(c.paintOrCoatOnly);
  const dbc = !plumbingOnly && !paintOnly;
  const hw = pick(VIC_HW, d);
  const regime = post ? "Contracts signed on or after 31 Mar 2027 (Domestic Building Contracts Amendment Act 2025)" : "Contracts signed before 31 Mar 2027";
  const unverified: Unverified[] = [
    { topic: "Early commencement", note: "A proclamation could bring parts of the 2025 amendments in before 31 Mar 2027; the Government Gazette was not checked.", regulator: reg },
    { topic: "Heritage / planning permits", note: "Heritage overlays and planning permits were not checked.", regulator: reg },
  ];
  if (paintOnly) unverified.push({ topic: "Paint/coat-only restoration", note: "Treating a coat-only roof restoration as exempt \"painting\" (DBC Regs reg 7(f)) is an inference, not a verified rule.", regulator: reg });
  if (plumbingOnly) unverified.push({ topic: "Security of payment for plumbing-only work", note: "Whether SOP Act s 7(2)(ba) excludes a metal-roof-only plumbing contract with a homeowner is unclear: treated as excluded. Get advice.", regulator: reg });
  if (post && dbc) unverified.push({ topic: "Cooling-off notice wording from 31 Mar 2027", note: "From 31 Mar 2027 the Authority approves the cooling-off form; the new wording has not been captured. Use the BPC's current form.", regulator: reg });
  if (dbc && d < "2026-07-01") unverified.push({ topic: "Domestic Building Insurance timing", note: "For contracts signed before 1 Jul 2026 the DBI threshold ($16,000) is verified but the timing rules were not re-checked.", regulator: reg });

  const scope: Scope = plumbingOnly
    ? { covered: false, summary: "Metal roofing, flashings, gutters and downpipes only = plumbing work (roofing (stormwater) class). The Domestic Building Contracts Act does not apply: no major contract, DBC deposit cap or DBC cooling-off. Plumbing rules still apply (licence, compliance certificate)." }
    : paintOnly
      ? { covered: false, summary: "A contract only for painting/coating is single-trade \"painting\", which the Domestic Building Contracts Act excludes (inference; see unverified)." }
      : { covered: true, summary: `${isTile(c.roofSystem) ? "Tile/slate/concrete roofing" : c.roofSystem === "membrane" ? "Membrane roofing" : "This contract (mixed or non-plumbing work)"} is domestic building work under the Domestic Building Contracts Act 1995.` };

  const licence: LicenceRule = plumbingOnly
    ? {
      required: true, threshold: 0, thresholdText: "Any plumbing work needs a licensed or registered plumber (Building Act s 221D). Only a licensed plumber can issue the compliance certificate.",
      classes: ["Plumber — Roofing (stormwater): licensed, or registered and supervised by a licensed plumber"], showOn: [], showOnRecommended: ["quote", "contract", "invoice"],
      note: "No statutory rule requires the plumbing licence number in ads; the compliance certificate carries it.", src: [SRC.vicBuildingAct, SRC.vicPlumbRegs],
    }
    : {
      required: paintOnly ? "depends" : v > major, threshold: major,
      thresholdText: `Registered building practitioner to enter a major domestic building contract (more than ${$(major)}).${post ? "" : " From 31 Mar 2027 the threshold is more than $20,000."} A registered builder may also be needed to be named on a building permit for work over $10,000.`,
      classes: isTile(c.roofSystem) ? ["Domestic builder (limited to roof tiling)", "Domestic builder (unlimited)"] : ["Domestic builder (unlimited)"],
      showOn: ["contract", "ads", "quote"], showOnRecommended: ["invoice"],
      note: "Ads and any written statement offering domestic building work must show the registered name and registration number, clearly legible.",
      src: [SRC.vicDbc, SRC.vicBuildingAct, SRC.vicBuildingRegs, SRC.vicAmendRegs2026],
    };

  const writtenContract: WrittenContractRule = !dbc
    ? { required: false, tier: null, mustInclude: [], note: "Outside the Domestic Building Contracts Act: no statutory contract form, but put the price and scope in writing.", src: [SRC.vicDbcRegs, SRC.vicWhatWork] }
    : post
      ? { required: true, tier: v > major ? "Major domestic building contract (over $20,000)" : "Domestic building contract (in writing, s 7A)", mustInclude: v > major ? ["Registration number", "Start/finish dates", "Price (+ price-may-change warning)", "Approved cooling-off notice", "Statutory warranties", "Approved checklist", "First Resort Home Warranty Scheme statement (reg 12A)"] : ["In English and readily legible", "Names and addresses", "Detailed description", "Price", "Date"], note: "From 31 Mar 2027 every domestic building contract must be in writing.", src: [SRC.vicAmend2025, SRC.vicAmendRegs2026] }
      : v > major
        ? { required: true, tier: "Major domestic building contract (over $10,000)", mustInclude: ["Registration number", "Start/finish dates", "Price (+ price-may-change warning)", "Approved cooling-off notice", "Statutory warranties (ss 8 and 20)", "Approved checklist"], note: "Must be signed by both parties or it has no effect.", src: [SRC.vicDbc, SRC.vicDbcRegs] }
        : { required: false, tier: null, mustInclude: [], note: "$10,000 or less: no statutory writing requirement, but give copies of the documents forming the contract (s 25(b)).", src: [SRC.vicDbc] };

  const deposit: DepositRule = !dbc
    ? { maxPct: null, maxAud: null, isLegalLimit: false, note: "No Domestic Building Contracts Act deposit cap for this contract.", src: [SRC.vicDbcRegs] }
    : post
      ? { maxPct: 10, maxAud: pctOf(v, 10), isLegalLimit: true, note: "From 31 Mar 2027: flat 10% for roofing contracts (the 5% tier is gone).", src: [SRC.vicAmendRegs2026] }
      : { maxPct: v >= 20000 ? 5 : 10, maxAud: pctOf(v, v >= 20000 ? 5 : 10), isLegalLimit: true, note: "5% if the contract price is $20,000 or more, 10% if less. Applies to all domestic building contracts.", src: [SRC.vicDbc] };

  const coolingOff: CoolingOffRule = dbc && v > major
    ? {
      applies: true, length: 5, unit: "business_days",
      startsWhen: "After the owner receives a copy of the signed contract (5 clear business days).",
      exceptions: post ? ["A previous substantially-same contract for the same home or land"] : ["A previous substantially-same contract for the same home or land", "The owner received independent advice from an Australian legal practitioner before signing (removed from 31 Mar 2027)"],
      noticeText: post ? null : VIC_COOLING_OFF_TEXT, noticeKind: post ? null : "approved_form", noticeSource: post ? null : SRC.vicModelContract,
      businessDayRules: {},
      note: "The builder may keep $100 plus approved out-of-pocket expenses. If the contract lacks the notice, the owner can withdraw within 7 days of finding out.",
      src: [SRC.vicDbc, SRC.vicModelContract],
    }
    : { ...NO_COOLING, note: dbc ? `No DBC cooling-off for contracts of ${$(major)} or less.` : "No DBC cooling-off (outside the Act).", src: [SRC.vicDbc] };

  const insReq: Tri = dbc && v > hw.threshold;
  const firstResort = hw.scheme === "First Resort Home Warranty Scheme";
  const insurance: InsuranceRule = {
    scheme: hw.scheme, required: insReq, mustBeBefore: insReq && firstResort ? "work" : null, threshold: hw.threshold,
    note: !dbc ? "Outside the scheme: not domestic building work." : !insReq ? `Not needed at ${$(hw.threshold)} or less.`
      : firstResort ? "Pay the premium to the Authority before the earlier of 10 business days after signing or the day work starts (tools or materials first used on site). The Authority sends the owner the notice of cover — don't claim cover has been issued until it has."
        : "Contract signed before 1 Jul 2026: Domestic Building Insurance applies over $16,000.",
    src: [SRC.vicBuildingAct, SRC.vicSis, SRC.vicConsumerGuide],
  };

  const documents: DocumentRule[] = dbc
    ? [
      ...(v > major ? [
        { name: "Domestic Building Consumer Guide", when: "Before the owner signs the major contract", link: SRC.vicConsumerGuide.url },
        { name: "Approved checklist + cooling-off notice (in the contract)", when: "In the major contract", link: SRC.vicModelContract.url },
        ...(post ? [{ name: "First Resort Home Warranty Scheme statement (reg 12A)", when: "In the major contract", link: SRC.vicAmendRegs2026.url }] : []),
      ] : []),
      { name: "Signed copy of the contract", when: "Within 5 clear business days", link: SRC.vicDbc.url },
      { name: "Variation notice + owner's signed consent", when: "Before the varied work", link: SRC.vicDbc.url },
      { name: "Progress claims tied to work done", when: "Each claim", link: SRC.vicDbc.url },
    ]
    : [];
  if (plumbingOnly || c.roofSystem === "metal" || c.jobType === "gutters") {
    if (v >= 750) documents.push({ name: "Plumbing compliance certificate (give to the customer AND lodge with the Authority)", when: "Within 5 days of completion (work of $750 or more)", link: SRC.vicPlumbRegs.url });
  }

  return {
    regime, scope, licence, writtenContract, deposit, coolingOff, insurance, documents,
    statutoryWarranty: dbc
      ? [{ type: "Building action limitation (implied warranties s 8)", years: 10 }, ...(insReq && firstResort ? [{ type: "Home warranty cover — major defects (structural, waterproofing incl. roof leaks)", years: 6 }, { type: "Home warranty cover — other defects", years: 2 }] : [])]
      : [],
    warrantyNote: dbc ? "Implied warranties can't be signed away; building actions must be brought within 10 years (from the occupancy permit or certificate of final inspection)." : "Australian Consumer Law guarantees still apply.",
    securityOfPayment: {
      appliesToOwnerOccupier: plumbingOnly ? "unclear" : false, appliesToThisJob: Boolean(c.subcontract), scheduleDays: 10, unit: "business_days",
      note: "Domestic building contracts with home owners are excluded. Subcontracts to builders are covered: payment schedule within 10 business days (or the contract time, if earlier).",
      src: [SRC.vicSop],
    },
    permit: {
      status: c.buildingApprovalRequired === true ? "likely_needed" : c.buildingApprovalRequired === false ? "likely_not_needed" : "check",
      summary: "No building permit for repair/renewal of part of a building if structural soundness isn't affected, no supporting element is removed or altered, and materials commonly used for the same purpose are used. A material change (e.g. tile to metal) or batten/structural work: check with a building surveyor.",
      src: [SRC.vicBuildingRegs],
    },
    whs: {
      swmsHeightM: 2, fallControlHeightM: 2,
      notes: ["SWMS before work with a risk of falling more than 2 m.", "Fall hierarchy: eliminate → passive fall prevention (edge protection, scaffold) → work positioning → fall arrest → ladders/admin. Harnesses are not PPE controls.", "Set rescue / emergency procedures before using any reg 44(2)–(5) control."],
      src: [SRC.vicOhs, SRC.vicSwms],
    },
    asbestos: {
      unlicensedMaxM2: 10, unlicensedTimeLimit: "and no more than 1 hour of removal in any 7-day period (2 people: 30 min each)",
      notifyBefore: "Licensed removalist notifies WorkSafe at least 24 hours before (10 m² or less non-friable) or at least 5 days before (all other cases); copy to the person who commissioned the work",
      notes: ["Unlicensed removal only for non-friable ACM of 10 m² or less AND no more than 1 hour per 7 days.", NEVER_PRESSURE_CLEAN],
      neverHighPressureClean: true, src: [SRC.vicOhs, SRC.vicAsbestosNotice, SRC.vicAsbestosLimit],
    },
    unverified,
  };
}

// ---------------------------------------------------------------------------------------------
// QLD
// ---------------------------------------------------------------------------------------------
function qld(c: Ctx): StatePart {
  const { v, d } = c;
  const reg = REGULATOR.QLD;
  const level = v <= 3300 ? 0 : v < 20000 ? 1 : 2;
  const painting = c.jobType === "restoration" || Boolean(c.paintOrCoatOnly);
  const classes = [
    ...(c.roofSystem === "metal" || c.roofSystem === "membrane" || c.jobType === "gutters" ? ["Roof and wall cladding (roof cladding other than terracotta/concrete tiles, rainwater goods, flashings, fascias)"] : []),
    ...(isTile(c.roofSystem) ? ["Roof tiling (tiles, battens, bedding/pointing, sarking)"] : []),
    ...(painting ? ["Painting and decorating — needed for roof painting/coating over $3,300 (painting is excluded from both roofing classes) unless it is incidental work of $3,300 or less"] : []),
  ];
  const insReq = v > 3300 && !c.subcontract;
  const cbgV2 = d >= QLD_CBG_V2_FROM;
  const unverified: Unverified[] = [
    { topic: "Licence number on quotes", note: "No express rule found for quotes (ads and contracts are required). Show it anyway.", regulator: reg },
    ...(c.roofSystem === "membrane" ? [{ topic: "Licence class for membranes", note: "Whether membrane roofing falls in the Roof and wall cladding class was not verified.", regulator: reg }] : []),
    ...(level === 0 ? [{ topic: "Deposit on jobs of $3,300 or less", note: "QBCC guidance says 20%, but no statutory cap was found.", regulator: reg }] : []),
    ...(c.existingHouse ? [{ topic: "2 m vs 3 m fall threshold for re-roofs", note: "Treating a non-structural re-roof of an existing house as non-housing construction work (2 m) is an inference.", regulator: WHS_REGULATOR.QLD }] : []),
  ];
  const coolExceptions = ["A previous substantially-identical regulated contract for the same home/land", "The owner received paid formal legal advice before signing (or tells you so)", "Repair contracts: the owner may waive cooling-off by a signed waiver notice (s 39)"];
  return {
    regime: "QBCC Act Schedule 1B (in force versions checked 6 Nov 2026)",
    scope: { covered: true, summary: "Re-roofs, repairs, restorations and gutters on a home are domestic building work; there is no single-trade exemption. Roof cleaning alone is not building work." },
    licence: {
      required: v > 3300, threshold: 3300, thresholdText: "QBCC licence for building work valued over $3,300 (incl. labour, materials and GST).",
      classes, showOn: ["contract", "ads"], showOnRecommended: ["quote", "invoice"],
      note: "Contracts must show the licence number as it appears on the licence; ads must state you are licensed and the number.",
      src: [SRC.qldReg, SRC.qldAct, SRC.qbccLicence],
    },
    writtenContract: {
      required: v > 3300, tier: level === 0 ? null : level === 1 ? "Level 1 regulated contract ($3,300–$20,000)" : "Level 2 regulated contract ($20,000 or more)",
      mustInclude: level === 0 ? [] : ["In writing, dated, signed by both", "Contractor's name and licence number as on the licence", "Description, plans, specifications", "Price (or method)", "Date for practical completion", "Conspicuous cooling-off notice", ...(level === 2 ? ["Start date", "Statement of each statutory warranty", "Price + price-change warning on the first page of the schedule"] : [])],
      note: level === 0 ? "No regulated contract needed; QBCC recommends its small building projects contract." : "A non-compliant contract has no effect — don't start work until it is signed and dated by both.",
      src: [SRC.qldAct, SRC.qbccContracts],
    },
    deposit: level === 0
      ? { maxPct: null, maxAud: null, isLegalLimit: false, note: "No statutory cap at $3,300 or less (QBCC guidance suggests 20%).", src: [SRC.qbccDeposits] }
      : { maxPct: level === 1 ? 10 : 5, maxAud: pctOf(v, level === 1 ? 10 : 5), isLegalLimit: true, note: "Includes the home warranty premium. 20% is allowed only where off-site work is more than 50% of the price.", src: [SRC.qldAct, SRC.qbccDeposits] },
    coolingOff: level > 0
      ? {
        applies: true, length: 5, unit: "business_days",
        startsWhen: level === 2 ? "After the owner receives a copy of the signed contract, or the Consumer Building Guide if that arrives later." : "After the owner receives a copy of the signed contract.",
        exceptions: coolExceptions,
        noticeText: QLD_COOLING_OFF_SUGGESTED, noticeKind: "suggested", noticeSource: SRC.qbccCooling, businessDayRules: {},
        note: `No prescribed wording: the contract needs a conspicuous notice. You may keep reasonable out-of-pocket expenses plus $100.${c.jobType === "repair" ? " This is a repair contract: the owner can waive cooling-off with a signed waiver notice." : ""}`,
        src: [SRC.qldAct, SRC.qbccCooling],
      }
      : { ...NO_COOLING, note: "No cooling-off at $3,300 or less.", src: [SRC.qldAct] },
    insurance: {
      scheme: "Queensland Home Warranty Scheme (QBCC)", required: insReq, mustBeBefore: insReq ? "work" : null, threshold: 3300,
      note: insReq ? "Collect the premium from the owner and pay QBCC before the earlier of 10 business days after signing or the start of work. The premium counts toward the deposit cap. QBCC emails the owner a Notice of Cover — log it." : "Not needed at $3,300 or less.",
      src: [SRC.qldAct, SRC.qbccPremium, SRC.qbccAtoZ],
    },
    documents: [
      ...(level === 2 ? [{ name: cbgV2 ? "QBCC Consumer Building Guide (FSG0116_v2_10/26) + signed Home Owner's Acknowledgement" : "QBCC Consumer Building Guide (edition in force on the contract date)", when: "Before the owner signs", link: SRC.qbccCbg.url }] : []),
      ...(level > 0 ? [{ name: "Signed copy of the contract (incl. plans/specs)", when: "Within 5 business days", link: SRC.qldAct.url }] : []),
      ...(level === 2 ? [{ name: "Commencement notice", when: "Within 10 business days of starting on site", link: SRC.qldAct.url }] : []),
      ...(insReq ? [{ name: "QHWS Notice of Cover (from QBCC)", when: "After the premium is paid", link: SRC.qbccPremium.url }] : []),
      ...(level > 0 ? [{ name: "Written variation (owner agrees in writing before the work)", when: "Before varied work", link: SRC.qldAct.url }] : []),
    ],
    statutoryWarranty: level > 0 ? [{ type: "Structural defect", years: 6 }, { type: "Non-structural", years: 1 }] : [],
    warrantyNote: level > 0 ? "From completion; plus 6 months if the breach shows up in the last 6 months. Separately, QHWS cover runs 6 years 6 months." : "Australian Consumer Law guarantees apply.",
    securityOfPayment: {
      appliesToOwnerOccupier: false, appliesToThisJob: c.subcontract || !c.owner, scheduleDays: 15, unit: "business_days",
      note: "Resident owners are excluded from all of BIF Act Chapter 3. For landlords, companies and builders: payment schedule within 15 business days; default due date 10 business days.",
      src: [SRC.qldBif],
    },
    permit: {
      status: c.buildingApprovalRequired === true ? "likely_needed" : c.buildingApprovalRequired === false ? "likely_not_needed" : "check",
      summary: "Like-for-like re-sheeting or re-tiling with no change to height or structure is accepted development (no approval), but must still meet the NCC and wind tie-down. Replacing more than 20% of battens/rafters, changing height or pitch, or touching roof solar/PV: get a building certifier.",
      src: [SRC.qldBldgReg],
    },
    whs: {
      swmsHeightM: 2, fallControlHeightM: c.jobType === "new_build" ? 3 : 2,
      notes: [
        "SWMS for high risk construction work: fall risk over 2 m, or disturbing asbestos.",
        c.jobType === "new_build" ? "Housing construction work: fall controls (edge protection, travel restraint, fall arrest) where a fall of 3 m or more is possible." : "Fall controls where a fall of 2 m or more is possible (3 m applies only to housing construction work).",
        `Any roof steeper than 26°: fall controls at ANY height.${c.roofPitchDeg && c.roofPitchDeg > 26 ? ` This roof is ${c.roofPitchDeg}°.` : ""}`,
        "Edge protection: top rail at least 900 mm above the surface.",
      ],
      src: [SRC.qldWhs],
    },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN, "Licensed removalist notifies WHSQ at least 5 days before. Asbestos removal on its own is not building work and isn't insurable."], [SRC.qldWhs, SRC.qbccAtoZ]),
    unverified,
  };
}

// ---------------------------------------------------------------------------------------------
// WA
// ---------------------------------------------------------------------------------------------
function wa(c: Ctx): StatePart {
  const { v } = c;
  const reg = REGULATOR.WA;
  const hbc = v > 7500 && v < 500000 && !c.subcontract;
  const permit = c.buildingApprovalRequired;
  const registration: Tri = permit === false ? false : v < 20000 ? false : permit === true ? true : "depends";
  const hii: Tri = c.jobType === "gutters" || c.subcontract || permit === false || v <= 20000 ? false : permit === true ? true : "depends";
  return {
    regime: "Home Building Contracts Act 1991 (consolidated versions checked 6 Nov 2026)",
    scope: { covered: hbc, summary: hbc ? "Repairing, altering or improving a house is home building work; contracts over $7,500 and under $500,000 are covered by the Home Building Contracts Act." : "Outside the Home Building Contracts Act contract rules (only covers contracts over $7,500 and under $500,000 with the owner)." },
    licence: {
      required: registration, threshold: 20000,
      thresholdText: "Building contractor registration only for builder work: needs a building permit AND is worth $20,000 or more AND is in a Schedule 3 area (South West Land Division plus listed towns). A like-for-like re-roof without a permit needs no registration at any value.",
      classes: ["Building contractor (individual / partnership / company)", "Building practitioner (nominated supervisor)", "No plumbing licence for gutters, downpipes or roof stormwater (only water supply, sanitary and below-ground drainage plumbing)"],
      showOn: ["ads", "site_sign"], showOnRecommended: ["quote", "contract", "invoice"],
      note: "Registered contractors must show the registration number in every ad, and on a site sign (with the nominated supervisor) on builder-work jobs.",
      src: [SRC.waBsrAct, SRC.waBsrRegs, SRC.waPlRegs],
    },
    writtenContract: {
      required: hbc, tier: hbc ? "Home building work contract (over $7,500, under $500,000)" : null,
      mustInclude: hbc ? ["All terms, in writing", "Date", "Signed by builder and owner", "Prescribed Notice for the Home Owner given BEFORE signing", "Copy to the owner before work starts"] : [],
      note: hbc ? "If these aren't met, the owner may terminate. Get the owner to sign a dated receipt for the notice and contract. Cost-plus contracts must be headed \"cost plus contract\"." : "No HBC Act writing requirement at this value; put it in writing anyway.",
      src: [SRC.waHbc, SRC.waHbcRegs],
    },
    deposit: hbc
      ? { maxPct: 6.5, maxAud: pctOf(v, 6.5), isLegalLimit: true, note: `After work starts, only genuine progress payments for work done or materials supplied.${hii === true ? " Where home indemnity insurance applies: no payment at all until the certificate is given." : ""}`, src: [SRC.waHbc] }
      : { maxPct: null, maxAud: null, isLegalLimit: false, note: "No HBC Act deposit cap outside its scope.", src: [SRC.waHbc] },
    coolingOff: { ...NO_COOLING, note: "WA has no statutory building-contract cooling-off (the ACL door-to-door right still applies).", src: [SRC.waHbc] },
    insurance: {
      scheme: "Home indemnity insurance (HBC Act Part 3A)", required: hii, mustBeBefore: hii === false ? null : "deposit", threshold: 20000,
      note: hii === false
        ? permit === false ? "No building permit needed → no home indemnity insurance (and no registration)." : c.jobType === "gutters" ? "Gutters/downpipes on their own are associated work: excluded." : "Not needed at $20,000 or less."
        : hii === true ? "Give the owner the HII certificate before demanding ANY payment (including the deposit) and before starting work. Applies if registration is required (Schedule 3 area)."
          : "Over $20,000: needed only if the job needs a building permit (and registration). Decide whether a permit is needed first.",
      src: [SRC.waHbc, SRC.waHbcRegs],
    },
    documents: [
      ...(hbc ? [
        { name: "Notice for the Home Owner (HBC Regs Sch 1) — reproduce verbatim", when: "Before the owner signs", link: SRC.waHbcRegs.url },
        { name: "Copy of the signed contract", when: "As soon as practicable and before work starts", link: SRC.waHbc.url },
        { name: "Owner's signed, dated receipt for the notice and contract", when: "On delivery", link: SRC.waHbc.url },
        { name: "Signed written variations (copy to owner)", when: "Before varied work", link: SRC.waHbc.url },
      ] : []),
      ...(hii !== false ? [{ name: "Home indemnity insurance certificate", when: "Before any payment (incl. deposit)", link: SRC.waHbc.url }] : []),
    ],
    statutoryWarranty: [{ type: "Make good defects notified in writing within 4 months of practical completion (implied term)", years: 0.33 }, { type: "Complaint to the Building Commissioner about faulty work", years: 6 }, ...(hii === true ? [{ type: "Home indemnity insurance claim window", years: 6 }] : [])],
    warrantyNote: "WA has no multi-year implied statutory warranty: a 4-month make-good term (contract may give longer) plus a 6-year complaint window.",
    securityOfPayment: {
      appliesToOwnerOccupier: false, appliesToThisJob: c.subcontract ? true : c.owner ? false : "depends", scheduleDays: 15, unit: "business_days",
      note: "Excluded for an individual home owner (not multiple dwellings or development, up to $500,000, not a subcontract). Applies to subcontracts to builders, companies and developers: payment schedule within 15 business days.",
      src: [SRC.waSop],
    },
    permit: {
      status: permit === true ? "likely_needed" : permit === false ? "likely_not_needed" : "check",
      summary: "No permit for repair/renovation using materials commonly used for the same purpose, with no structural, height, classification or compliance change and no heritage order. A material change (e.g. tile to metal) or structural work (rafters, trusses, pitch) needs a permit — and then registration and HII may apply.",
      src: [SRC.waBuildingRegs],
    },
    whs: {
      swmsHeightM: 2, fallControlHeightM: null,
      notes: ["SWMS for fall risk over 2 m.", "From about 1 Oct 2026 reg 79 applies to high risk construction work: edge protection or scaffold first, harness only if those aren't reasonably practicable."],
      src: [SRC.waWhs],
    },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN, "Removing more than 200 m² of brittle or fragile roofing where any part is 10 m or more above ground needs a Class 1 demolition licence."], [SRC.waWhs]),
    unverified: [
      { topic: "Schedule 3 area", note: "Registration and HII apply only in Schedule 3 areas (South West Land Division + listed towns). Confirm the site is in one.", regulator: reg },
      { topic: "Roof stormwater isn't plumbing", note: "Based on the plumbing regulation definitions; no Plumbers Licensing Board statement was read.", regulator: reg },
      { topic: "Reg 79 start date", note: "Depends on the WHS Act 2020 commencement date (31 Mar 2022, not re-read).", regulator: WHS_REGULATOR.WA },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// SA (effective-dated: 10 Nov 2025 minor-work threshold; 1 Jul 2026 SWMS height)
// ---------------------------------------------------------------------------------------------
function sa(c: Ctx): StatePart {
  const { v, d } = c;
  const reg = REGULATOR.SA;
  const minor = pick(SA_MINOR, d);
  const covered = v >= minor && !c.subcontract;
  const approval = c.buildingApprovalRequired;
  const bii: Tri = !covered || approval === false ? false : approval === true ? true : "depends";
  const oldDollarCap = covered && v < 20000; // only possible for contracts signed before 10 Nov 2025
  const swms = pick(SA_SWMS_M, d);
  return {
    regime: d >= SA_CHANGE_DATE ? "Contracts signed on or after 10 Nov 2025 (minor work under $20,000)" : "Contracts signed before 10 Nov 2025 (minor work under $12,000)",
    scope: { covered, summary: covered ? `Domestic building work of ${$(minor)} or more: contract rules, deposit cap, cooling-off and (if approval is needed) building indemnity insurance apply.` : `Minor domestic building work (under ${$(minor)}): the contract, deposit, cooling-off and insurance rules don't apply, but the licence and statutory warranties still do.` },
    licence: {
      required: true, threshold: 0,
      thresholdText: "Building work contractors licence at any value. Exception: a licensed plumbing contractor doing minor roof plumbing (flashings, gutters, downpipes, roof coverings) under $3,000.",
      classes: ["Building work contractors licence (with conditions for the kind of work, e.g. roofing)", "Registered building work supervisor"],
      showOn: covered ? ["contract", "ads", "site_sign"] : ["ads", "site_sign"], showOnRecommended: ["quote", "invoice"],
      note: "Licence name and number in all ads and on the site sign (numbers start with \"BLD\"). Don't subcontract to unlicensed people.",
      src: [SRC.saBwc, SRC.saBwcRegs],
    },
    writtenContract: {
      required: covered, tier: covered ? `Domestic building work contract (${$(minor)} or more)` : null,
      mustInclude: covered ? ["All terms in writing, signed by both", "Business name and licence number", "Fixed price and payment terms", "\"This Price May Change\" / \"Estimate Only\" next to variable prices", "Copy + Form 1 to the owner"] : [],
      note: covered ? "Rise-and-fall only with a stated completion period. Variations: get them in writing and signed." : "No statutory written contract below the threshold; a written quote is still best practice.",
      src: [SRC.saBwc, SRC.saForm1],
    },
    deposit: covered
      ? oldDollarCap
        ? { maxPct: null, maxAud: Math.min(1000, v), isLegalLimit: true, note: "Contract signed before 10 Nov 2025 and under $20,000: deposit up to $1,000.", src: [SRC.saBwc] }
        : { maxPct: 5, maxAud: pctOf(v, 5), isLegalLimit: true, note: "5% of the price for $20,000 or more. After work starts, only progress payments for work done, requested in writing.", src: [SRC.saBwc] }
      : { maxPct: null, maxAud: null, isLegalLimit: false, note: "No statutory cap below the threshold (you may choose a $1,000 cap as policy — it's not the law).", src: [SRC.saBwc, SRC.saBwcRegs] },
    coolingOff: covered
      ? {
        applies: true, length: 5, unit: "business_days", startsWhen: "After the contract is made (5 clear business days). If you didn't comply with the Act (e.g. no Form 1, deposit over the cap, no insurance), the right lasts until the work is finished.",
        exceptions: [], noticeText: SA_FORM1_CL2, noticeKind: "prescribed_form", noticeSource: SRC.saForm1, businessDayRules: {},
        note: "The owner's notice must be in writing and served personally or by certified mail. Give the full Form 1 (at least 10 pt Times New Roman) with the contract copy.",
        src: [SRC.saBwc, SRC.saBwcRegs, SRC.saForm1],
      }
      : { ...NO_COOLING, note: "No cooling-off for minor domestic building work.", src: [SRC.saBwc] },
    insurance: {
      scheme: "Building indemnity insurance (BWC Act Part 5 Div 3)", required: bii, mustBeBefore: bii === false ? null : "work", threshold: minor,
      note: bii === false ? (covered ? "No development approval needed → no building indemnity insurance." : "Minor work: not needed.")
        : bii === true ? "Give the owner (and council) the insurance certificate (Form 2) before work starts. Ridge & Beam also asks for it before the deposit, because the premium is part of it."
          : `${$(minor)} or more: needed only if the work needs development approval.`,
      src: [SRC.saBwc, SRC.saBwcRegs, SRC.saBuildingWork],
    },
    documents: [
      ...(covered ? [{ name: "Signed contract copy + Form 1 (your rights and obligations)", when: "As soon as practicable after both sign", link: SRC.saForm1.url }] : []),
      ...(bii !== false ? [{ name: "Building indemnity insurance certificate (Form 2)", when: "Before work starts", link: SRC.saBwcRegs.url }] : []),
      ...(covered ? [{ name: "Written request for each progress payment", when: "Before the owner has to pay", link: SRC.saBwc.url }] : []),
      ...(approval === true ? [{ name: "Statement of Compliance (SA planning portal)", when: "With the notice of completion (consented work)", link: SRC.saPdiRegs.url }] : []),
    ],
    statutoryWarranty: [{ type: "Implied warranties: proceedings within 5 years of completion", years: 5 }, { type: "Long-stop for defective building work", years: 10 }],
    warrantyNote: "Statutory warranties apply at ANY contract value.",
    securityOfPayment: {
      appliesToOwnerOccupier: false, appliesToThisJob: c.subcontract || !c.owner, scheduleDays: 15, unit: "business_days",
      note: "Not for work on the home the owner lives in. Applies to landlords, companies and subcontracts: payment schedule within 15 business days; due 15 business days if the contract is silent.",
      src: [SRC.saSop],
    },
    permit: {
      status: approval === true ? "likely_needed" : approval === false ? "likely_not_needed" : "check",
      summary: "Repair or maintenance with no demolition of any part and no structural effect is not development (except local heritage places). Full strip-and-replace, a material change or structural/truss work: check with council or a certifier.",
      src: [SRC.saPdi, SRC.saPdiRegs],
    },
    whs: { swmsHeightM: swms, fallControlHeightM: null, notes: [swms === 2 ? "SWMS for fall risk over 2 m (since 1 Jul 2026; was 3 m)." : "SWMS for fall risk over 3 m (changes to 2 m on 1 Jul 2026)."], src: [SRC.saWhs, SRC.saHeights] },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN], [SRC.saWhs]),
    unverified: [
      { topic: "Strip-and-replace re-roofs", note: "Whether stripping the old roof is \"demolition of any part\" (so development approval and BII apply) is not settled.", regulator: reg },
      { topic: "Roof plumbing certificate", note: "The SA Water / Office of the Technical Regulator certificate regime could not be read.", regulator: reg },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// TAS (RBWCDR Regulations 2026 from 2 Nov 2026)
// ---------------------------------------------------------------------------------------------
function tas(c: Ctx): StatePart {
  const { v, d } = c;
  const reg = REGULATOR.TAS;
  const covered = v >= 20000 && !c.subcontract;
  const regs2026 = d >= TAS_REGS_2026;
  const pct = v >= 50000 ? 5 : 10;
  const unverified: Unverified[] = [
    { topic: "Licence threshold / low-risk work", note: "Whether a given roof job is low-risk work (no licensed builder needed) is set by the Director of Building Control's determination, which could not be read.", regulator: reg },
    { topic: "Permit category for re-roofing", note: "Whether re-roofing is low-risk, notifiable or permit work wasn't verified. Ask a building surveyor.", regulator: reg },
    { topic: "Cooling-off clause wording", note: "No prescribed wording; any Director-determined contract provisions could not be read.", regulator: reg },
    { topic: "Metal roof cladding", note: "Whether metal roof cladding (not just drainage) is plumbing work in Tasmania wasn't verified.", regulator: reg },
  ];
  if (covered && !regs2026) unverified.push({ topic: "Deposit set amount before 2 Nov 2026", note: "The 2016 Regulations ($50,000) expired and the 2026 Regulations start 2 Nov 2026. If no regulation was in force on your contract date the Act's default is $20,000.", regulator: reg });
  return {
    regime: regs2026 ? "RBWCDR Act 2016 + Regulations 2026 (from 2 Nov 2026)" : "RBWCDR Act 2016 (contract before the 2026 Regulations started on 2 Nov 2026)",
    scope: { covered, summary: covered ? "Residential building work of $20,000 or more (including restoration, repair and gutters): no single-trade exemption." : "Under $20,000 the Residential Building Work Contracts Act doesn't apply." },
    licence: {
      required: "depends", threshold: null,
      thresholdText: "No dollar threshold: a building services licence unless the work is low-risk under the Director's determination. Roof (stormwater) work is prescribed plumbing work: plumber practitioner licence, and a contractor licence to run the business.",
      classes: ["Building services licence (builder class)", "Plumber practitioner (incl. restricted) — roof (stormwater)", "Plumbing contractor licence"],
      showOn: covered ? ["contract"] : [], showOnRecommended: ["quote", "invoice", "ads"],
      note: "Unlicensed contractors can't recover payment. Keep building services records for at least 10 years.",
      src: [SRC.tasOl, SRC.tasPlumbRegs, SRC.tasRbw],
    },
    writtenContract: {
      required: covered, tier: covered ? "Residential building work contract ($20,000 or more)" : null,
      mustInclude: covered ? ["In English, all terms", "Parties and licence number", "Description and plans", "Price (or method + estimate)", "Date of practical completion", "Part 6 statutory warranties", "Required checklist", "Consumer guide attached"] : [],
      note: covered ? "Signed by both or it has no effect; if not written at signing, put it in writing within 5 business days and before work starts." : "Not required under $20,000.",
      src: [SRC.tasRbw],
    },
    deposit: covered
      ? { maxPct: pct, maxAud: pctOf(v, pct), isLegalLimit: true, note: "10% under $50,000, 5% at $50,000 or more (20% only where off-site work is more than half the price). Any payment before work starts counts.", src: [SRC.tasRbw, SRC.tasRbwRegs] }
      : { maxPct: null, maxAud: null, isLegalLimit: false, note: "The Act doesn't apply under $20,000.", src: [SRC.tasRbw] },
    coolingOff: covered
      ? {
        applies: true, length: 5, unit: "business_days", startsWhen: "After the owner has received BOTH a signed copy of the contract and the consumer guide (the later of the two).",
        exceptions: ["A previous substantially-same contract", "The owner received paid formal legal advice"], noticeText: null, noticeKind: null, noticeSource: null, businessDayRules: {},
        note: "You may keep $100 plus reasonable out-of-pocket expenses. If the consumer guide isn't given, the owner can withdraw within 7 days of finding out.",
        src: [SRC.tasRbw],
      }
      : { ...NO_COOLING, note: "No cooling-off under $20,000.", src: [SRC.tasRbw] },
    insurance: { scheme: null, required: false, mustBeBefore: null, threshold: null, note: "No home warranty insurance is in force in Tasmania (the 2023 amendment Act hasn't commenced).", src: [SRC.tasRbw, SRC.tasHwi2023] },
    documents: covered ? [
      { name: "Residential building consumer guide", when: "Before signing, and attached to the contract", link: reg.url },
      { name: "Signed contract copy + consumer guide", when: "Within 5 business days", link: SRC.tasRbw.url },
      { name: "Commencement notice (start date + estimated completion)", when: "Within 10 business days after work starts", link: SRC.tasRbw.url },
      { name: "Notice of practical completion", when: "Within 10 business days after practical completion", link: SRC.tasRbw.url },
      { name: "Written, signed variations (copy to owner within 5 business days)", when: "Before added work starts", link: SRC.tasRbw.url },
    ] : [],
    statutoryWarranty: covered ? [{ type: "Implied statutory warranties (proceedings within 6 years of practical completion)", years: 6 }] : [],
    warrantyNote: covered ? "Warranties pass to later owners and can't be excluded." : "Australian Consumer Law guarantees apply.",
    securityOfPayment: {
      appliesToOwnerOccupier: true, appliesToThisJob: true, scheduleDays: c.jobType === "new_build" ? 20 : 10, unit: "business_days",
      note: "Applies to every building contract, including home owners. A non-practitioner owner of a residence to be built gets 20 business days for the payment schedule; for re-roofing an existing house 10 may apply (unclear).",
      src: [SRC.tasSop],
    },
    permit: { status: "check", summary: "All building work is permit work unless the Director's determination makes it low-risk or notifiable (or it's emergency work). Check with a building surveyor.", src: [SRC.tasBuildingAct] },
    whs: { swmsHeightM: 2, fallControlHeightM: null, notes: ["SWMS for fall risk over 2 m."], src: [SRC.tasWhs] },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN, "Refurbishing a home: identify (and where practicable remove) asbestos likely to be disturbed before work starts."], [SRC.tasWhs]),
    unverified,
  };
}

// ---------------------------------------------------------------------------------------------
// ACT
// ---------------------------------------------------------------------------------------------
function act(c: Ctx): StatePart {
  const { v } = c;
  const reg = REGULATOR.ACT;
  const part6 = v >= 12000 && !c.subcontract;
  const approval = c.buildingApprovalRequired;
  const ins: Tri = !part6 || approval === false ? false : approval === true ? true : "depends";
  return {
    regime: "Building Act 2004 Part 6 (authorised republications checked 6 Nov 2026)",
    scope: { covered: part6, summary: part6 ? "Residential building work of $12,000 or more: statutory warranties apply; roofs and their weatherproofing are structural elements." : "Under $12,000 Part 6 (warranties, insurance) doesn't apply." },
    licence: {
      required: true, threshold: 0,
      thresholdText: "No dollar threshold: building work needs a licensed builder. Roofs are structural, so class C or higher is likely (class D is non-structural only).",
      classes: ["Builder class A, B or C", "Builder class D (non-structural only — likely not enough for re-roofing)", "Asbestos removal licence for any asbestos removal"],
      showOn: ["ads", "quote", "contract", "business_card", "vehicle"], showOnRecommended: ["invoice"],
      note: "Ads — including letters, business cards, sample contracts and vehicle signs — must show the name on the licence, the licence number and (for companies) the ACN. Gutters and downpipes aren't plumbing in the ACT.",
      src: [SRC.actCola, SRC.actColr, SRC.actWsa],
    },
    writtenContract: { required: false, tier: null, mustInclude: [], note: "No statutory written-contract requirement in the ACT; prescribed documents must be attached to residential building work contracts (see unverified).", src: [SRC.actBa, SRC.actBgr] },
    deposit: { maxPct: null, maxAud: null, isLegalLimit: false, note: "No statutory deposit cap in the ACT. Ridge & Beam suggests 10% as practice — it is not a legal limit.", src: [SRC.actBa, SRC.actBgr] },
    coolingOff: { ...NO_COOLING, note: "No building-contract cooling-off in the ACT (the ACL door-to-door right still applies).", src: [SRC.actBa] },
    insurance: {
      scheme: "Residential building work insurance or fidelity certificate", required: ins, mustBeBefore: ins === false ? null : "work", threshold: 12000,
      note: ins === false ? (part6 ? "No building approval → no insurance trigger (warranties still apply)." : "Not needed under $12,000.") : ins === true ? "The policy or fidelity certificate must accompany the application for the building commencement notice (so before work)." : "Needed only if the job has a building approval and costs $12,000 or more.",
      src: [SRC.actBa, SRC.actBgr],
    },
    documents: [
      ...(ins !== false ? [{ name: "Residential building insurance policy / fidelity certificate", when: "With the commencement notice application", link: SRC.actBa.url }] : []),
      ...(approval === true ? [{ name: "Licensed builder site sign", when: "While approved work is carried out", link: SRC.actBa.url }] : []),
    ],
    statutoryWarranty: part6 ? [{ type: "Structural elements incl. roof and its weatherproofing", years: 6 }, { type: "Non-structural elements", years: 2 }] : [],
    warrantyNote: part6 ? "From the completion day. The owner can also give a written rectification notice within 2 years (defect then presumed)." : "Australian Consumer Law guarantees apply.",
    securityOfPayment: {
      appliesToOwnerOccupier: false, appliesToThisJob: c.subcontract || !c.owner, scheduleDays: 10, unit: "business_days",
      note: "Resident owners are excluded at any value. Others: payment schedule within 10 business days; progress payment due 15 business days after the claim.",
      src: [SRC.actSop],
    },
    permit: { status: approval === true ? "likely_needed" : approval === false ? "likely_not_needed" : "check", summary: "No express re-roofing exemption in the Building Regulation. Confirm with a certifier (or an exemption assessment) whether a like-for-like re-roof needs approval.", src: [SRC.actBgr] },
    whs: { swmsHeightM: 2, fallControlHeightM: null, notes: ["SWMS for fall risk over 2 m (model WHS). ACT falls variations not verified."], src: [SRC.qldWhs] },
    asbestos: {
      unlicensedMaxM2: 0, unlicensedTimeLimit: null, notifyBefore: "at least 5 days before licensed removal starts",
      notes: ["ACT: ANY removal of non-friable asbestos (e.g. AC roof sheeting) needs a Class B (or A) licence — there is no 10 m² allowance.", NEVER_PRESSURE_CLEAN],
      neverHighPressureClean: true, src: [SRC.actWhs, SRC.actCola],
    },
    unverified: [
      { topic: "Required contract documents", note: "The Minister's determination of documents that must be attached to residential building work contracts could not be found.", regulator: reg },
      { topic: "Approval for like-for-like re-roofs", note: "Whether certifiers treat like-for-like re-sheeting/re-tiling as maintenance or an alteration needing approval wasn't verified.", regulator: reg },
      { topic: "Builder class", note: "That re-roofing needs class C or higher is an inference from the structural-element definition.", regulator: reg },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// NT (thresholds $25,000 from 30 Mar 2026; re-roofing an existing house is outside the regime)
// ---------------------------------------------------------------------------------------------
function nt(c: Ctx): StatePart {
  const { v, d } = c;
  const reg = REGULATOR.NT;
  const threshold = pick(NT_THRESHOLD, d);
  const prescribed = c.jobType === "new_build" || !c.existingHouse;
  const head = prescribed && !c.subcontract && v >= threshold;
  const residentialSwms = d >= NT_RESIDENTIAL_SWMS_FROM && c.jobType === "new_build" ? 3 : 2;
  return {
    regime: d >= NT_CHANGE_DATE ? "Building Act 1993 (thresholds $25,000 from 30 Mar 2026)" : "Building Act 1993 (contract before 30 Mar 2026: $12,000 thresholds)",
    scope: prescribed
      ? { covered: head, summary: head ? `New house / extension work of ${$(threshold)} or more by a residential building contractor: registration, written contract, 5% deposit and RBI/fidelity cover apply.` : "Roofing on a new house or extension is usually a subcontract: the head builder's registration, contract and cover apply." }
      : { covered: false, summary: "Re-roofing (re-cladding) an existing house with no floor-area increase is expressly outside NT registration, written-contract, deposit and RBI/fidelity rules. Only the ACL applies." },
    licence: {
      required: head, threshold,
      thresholdText: prescribed ? `Building contractor registration for prescribed building work of ${$(threshold)} or more (residential).` : "No building contractor registration for re-roofing an existing house (the regulations' own example of excluded work).",
      classes: ["Building contractor — residential (restricted / unrestricted)", "No roofing-specific category"],
      showOn: head ? ["contract"] : [], showOnRecommended: ["quote", "invoice"],
      note: "Display the registration certificate at your principal place of business; companies must name the registered nominee in ads.",
      src: [SRC.ntBr, SRC.ntBa, SRC.ntAmd26],
    },
    writtenContract: {
      required: head, tier: head ? `Residential building contract (prescribed work ${$(threshold)}+)` : null,
      mustInclude: head ? ["Single project", "Contractor identity and registration number", "Extent of work and total price", "Deposit (max 5%)", "Stage percentages", "Dispute resolution"] : [],
      note: head ? "Every progress invoice must include your declaration that the stage is complete." : "No statutory written contract for this job; use one anyway.",
      src: [SRC.ntBr],
    },
    deposit: head
      ? { maxPct: 5, maxAud: pctOf(v, 5), isLegalLimit: true, note: "No payment of any kind until RBI/fidelity cover is in force and the document has been given. Payments only after each stage is complete.", src: [SRC.ntBr, SRC.ntBa] }
      : { maxPct: null, maxAud: null, isLegalLimit: false, note: "No statutory deposit cap for re-roofing / renovation work.", src: [SRC.ntBr] },
    coolingOff: { ...NO_COOLING, note: "No statutory building-contract cooling-off in the NT (the ACL door-to-door right still applies).", src: [SRC.ntBa] },
    insurance: {
      scheme: "Residential building insurance (RBI) or fidelity certificate", required: head, mustBeBefore: head ? "deposit" : null, threshold,
      note: head ? "Cover in force and the RBI policy document / fidelity certificate given to the owner before work AND before any payment, including a deposit." : prescribed ? "Covered by the head builder's RBI / fidelity cover." : "Not required: renovations that don't increase floor area (e.g. re-cladding a roof) are excluded.",
      src: [SRC.ntRbi, SRC.ntAmd26, SRC.ntBa],
    },
    documents: head ? [
      { name: "RBI policy document or fidelity certificate copy", when: "Before work and before any payment", link: SRC.ntBa.url },
      { name: "Residential building contract (r 41H contents)", when: "At signing", link: SRC.ntBr.url },
      { name: "Stage-complete declaration on each progress invoice", when: "Every progress invoice", link: SRC.ntBr.url },
    ] : [],
    statutoryWarranty: head ? [{ type: "Structural defects incl. roof weatherproofing (after the construction period)", years: 6 }, { type: "Non-structural defects", years: 1 }] : [],
    warrantyNote: head ? "Plus 90 days for non-completion; extended 30 days if the defect is found in the last 30 days." : "Re-roofing isn't prescribed work: only the ACL consumer guarantees apply.",
    securityOfPayment: {
      appliesToOwnerOccupier: true, appliesToThisJob: true, scheduleDays: 10, unit: "working_days",
      note: "No home-owner exclusion. If the contract is silent: notice of dispute within 10 working days or pay in full within 20 working days. Terms over 30 working days are read down to 30; pay-when-paid clauses have no effect.",
      src: [SRC.ntSop],
    },
    permit: {
      status: c.buildingApprovalRequired === false ? "likely_not_needed" : "likely_needed",
      summary: "Inside a gazetted building control area, building work including repairs and alterations needs a building permit from a building certifier; there is no re-roofing exemption in the regulations. Outside building control areas the permit rules don't apply.",
      src: [SRC.ntBa, SRC.ntBr],
    },
    whs: {
      swmsHeightM: residentialSwms, fallControlHeightM: null,
      notes: [residentialSwms === 3 ? "Residential construction work (Class 1/10 construction): SWMS for falls over 3 m from 17 Jul 2026." : "SWMS for falls over 2 m (re-roofing an existing house defaults to 2 m; 3 m applies to residential construction work from 17 Jul 2026)."],
      src: [SRC.ntWhs],
    },
    asbestos: modelAsbestos([NEVER_PRESSURE_CLEAN], [SRC.ntWhs]),
    unverified: [
      { topic: "Building control areas", note: "The list of gazetted building control areas could not be read. Ask whether the site is in one.", regulator: reg },
      { topic: "Gutters and downpipes as plumbing", note: "Whether roof gutters/downpipes are \"plumbing\" (7-day notice to the Director) wasn't verified.", regulator: reg },
      { topic: "3 m SWMS threshold for re-roofs", note: "Whether re-roofing an existing house is \"residential construction work\" is unsettled; 2 m is used.", regulator: WHS_REGULATOR.NT },
    ],
  };
}

const STATE_FN: Record<AuState, (c: Ctx) => StatePart> = { NSW: nsw, VIC: vic, QLD: qld, WA: wa, SA: sa, TAS: tas, ACT: act, NT: nt };

// ---------------------------------------------------------------------------------------------
// National: ACL unsolicited consumer agreements, single price, card surcharges
// ---------------------------------------------------------------------------------------------
export const ACL_THRESHOLD = 100;
export const ACL_TERMINATION_BUSINESS_DAYS = 10;

function aclRule(c: Ctx): AclRule {
  const applies = Boolean(c.doorKnockSale) && c.v >= ACL_THRESHOLD;
  const exempt = applies && Boolean(c.disasterEmergencyRepair);
  return {
    applies, thresholdAud: ACL_THRESHOLD, terminationBusinessDays: ACL_TERMINATION_BUSINESS_DAYS,
    noSupplyOrPaymentDuringPeriod: applies && !exempt, exemptionClaimed: exempt,
    callingHours: ACL_CALLING_HOURS, frontPageTitle: ACL_FRONT_PAGE_TITLE, frontPageNotice: ACL_FRONT_PAGE_TEXT,
    notes: applies
      ? [
        exempt
          ? "Disaster emergency-repair exemption: you may do the work and take payment within 10 business days ONLY IF a state of emergency is declared for the area, the contract covers only repairs the disaster made necessary, you hold the relevant licence, and the repairs only remove a hazard, protect health and safety or prevent substantial damage. Visiting hours still apply."
          : "For 10 business days from the day after signing: no work, no goods over $500, and NO payment of any kind (incl. deposits).",
        "Print the front-page notice, attach the termination form, and give the signed copy immediately. Show the total price incl. GST, your ABN/ACN, business address (not a PO box) and the salesperson's details.",
        "Before the pitch: state the purpose, show ID, and leave when asked (no contact for 30 days). Treat a \"Do not knock\" sign as a request to leave.",
        "Rights extend to 3 months (visit outside hours, no ID/purpose, didn't leave) or 6 months (no cooling-off info, defective form, work or payment in the period).",
        "Signing at the quote visit counts as unsolicited — you must prove the customer asked for the sale.",
      ]
      : c.doorKnockSale ? ["Under $100: the unsolicited consumer agreement rules don't apply."] : ["Not a door-knock / cold-call sale. If the contract is signed at the visit where you gave the quote, treat it as unsolicited."],
    src: [SRC.acccDoor, SRC.acccSalesGuide, SRC.cavDoor, ...(exempt ? [SRC.cavDisaster] : [])],
  };
}

function nationalNotes(c: Ctx) {
  return {
    notes: [
      "Quote one total price including GST as the most prominent figure (a per-m² or labour-only figure must not be more prominent).",
      c.d >= CARD_SURCHARGE_BAN_FROM
        ? "No card surcharges (Visa, Mastercard, eftpos, Amex, UnionPay, PayPal) — including on invoices issued before 1 Oct 2026 and B2B. Payment-method discounts (e.g. PayID) are fine if the full price is shown."
        : "From 1 Oct 2026 card surcharges are banned for card payments made on or after that date.",
    ],
    src: [SRC.acccPrice, SRC.acccSurcharge, SRC.rbaSurcharge],
  };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------
export function rulesFor(stateInput: string, input: RuleInput): RulesResult {
  const state = asAuState(stateInput);
  if (!state) throw new Error(`Unknown Australian state: ${stateInput}`);
  const v = Math.max(0, Number(input.contractValueIncGst) || 0);
  const d = calendarDate(input.contractDate, AU_STATE_TZ[state]);
  const c: Ctx = { ...input, state, v, d, owner: input.ownerOccupier !== false };
  const part = STATE_FN[state](c);
  if (c.builtBefore1990) part.asbestos = { ...part.asbestos, notes: ["House built before 1990: assume fibre-cement (AC) sheeting, eaves and flues may contain asbestos until a sample says otherwise.", ...part.asbestos.notes] };
  const acl = aclRule(c);
  const national = nationalNotes(c);
  const unverified = [...part.unverified];
  if (acl.applies) unverified.push({ topic: "Door-to-door hours by state", note: "The ACCC says some states set different visiting hours; per-state hours weren't checked. The ACL default hours are shown.", regulator: { name: "ACCC", url: SRC.acccDoor.url } });
  const all = [
    part.licence.src, part.writtenContract.src, part.deposit.src, part.coolingOff.src, part.insurance.src, part.securityOfPayment.src,
    part.permit.src, part.whs.src, part.asbestos.src, acl.src, national.src,
  ].flat();
  const seen = new Set<string>();
  const sources = all.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  return {
    ...part, unverified, state, stateName: AU_STATE_NAME[state], contractDate: d,
    regulator: REGULATOR[state], whsRegulator: WHS_REGULATOR[state], acl, national, sources, verifiedOn: VERIFIED_ON, disclaimer: DISCLAIMER,
  };
}

/** Last day the owner can withdraw / rescind under the state cooling-off, or null when none applies. */
export function coolingOffEnd(rules: RulesResult, copyReceivedOn: string | Date): IsoDate | null {
  if (!rules.coolingOff.applies || !rules.coolingOff.length) return null;
  const from = calendarDate(copyReceivedOn, AU_STATE_TZ[rules.state]);
  return addBusinessDays(from, rules.coolingOff.length, rules.coolingOff.businessDayRules);
}

/**
 * ACL unsolicited agreement: last day of the 10-business-day termination period
 * ("from and including the day after you signed"). Payment and work can start the day after.
 */
export function aclTerminationEnd(signedAt: string | Date, state: string = "NSW"): IsoDate {
  const st = asAuState(state) ?? "NSW";
  return addBusinessDays(calendarDate(signedAt, AU_STATE_TZ[st]), ACL_TERMINATION_BUSINESS_DAYS);
}

export type PaymentJob = {
  state: string | null;
  lead_source?: string | null;
  /** When the homeowner signed / accepted (contract date). */
  signed_at?: string | Date | null;
  contract_value_inc_gst?: number | null;
  /** Explicitly mark an unsolicited sale even if the lead source isn't "door_knock". */
  door_knock_sale?: boolean | null;
  /** Relying on the ACL disaster emergency-repair exemption. */
  disaster_emergency_repair?: boolean | null;
  /** Rules say insurance must be in place before any payment (e.g. NSW HBC, WA HII, NT RBI). */
  insurance_required_before_payment?: boolean | null;
  insurance_certificate_on_file?: boolean | null;
};
export type PaymentCheck = { allowed: boolean; reason: string | null; until: IsoDate | null; firstPaymentDay: IsoDate | null };

export const isDoorKnockSource = (s: string | null | undefined) => /door[\s_-]?knock|canvass|storm/i.test(s ?? "");

/** May the business take a payment (deposit, progress claim) on this job today? */
export function canTakePayment(job: PaymentJob, today: string | Date = new Date()): PaymentCheck {
  const st = asAuState(job.state) ?? "NSW";
  const now = calendarDate(today, AU_STATE_TZ[st]);
  if (job.insurance_required_before_payment && !job.insurance_certificate_on_file) {
    return { allowed: false, reason: "Home warranty insurance must be in place (and the certificate given to the owner) before you take any payment, including the deposit.", until: null, firstPaymentDay: null };
  }
  const unsolicited = Boolean(job.door_knock_sale) || isDoorKnockSource(job.lead_source);
  const value = job.contract_value_inc_gst ?? ACL_THRESHOLD;
  if (!unsolicited || value < ACL_THRESHOLD || job.disaster_emergency_repair) return { allowed: true, reason: null, until: null, firstPaymentDay: null };
  if (!job.signed_at) return { allowed: false, reason: "Door-knock sale: no payment until the agreement is signed and its 10-business-day cancellation period has ended.", until: null, firstPaymentDay: null };
  const until = aclTerminationEnd(job.signed_at, st);
  const firstPaymentDay = nextDay(until);
  if (now <= until) return { allowed: false, reason: `Door-knock sale: no payment and no work until the 10-business-day cancellation period ends on ${fmtDate(until)}.`, until, firstPaymentDay };
  return { allowed: true, reason: null, until, firstPaymentDay };
}

function nextDay(iso: IsoDate): IsoDate {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8)) + 1);
  return new Date(t).toISOString().slice(0, 10);
}

export const formatAuDate = fmtDate;

// ---------------------------------------------------------------------------------------------
// Mapping helpers for the app's stored values
// ---------------------------------------------------------------------------------------------
/** jobs.roof_material (free text) → roof system. Defaults to metal (most AU re-roofs end in metal). */
export function roofSystemFrom(material: string | null | undefined): RoofSystem {
  const m = (material ?? "").toLowerCase();
  if (/terracotta|clay/.test(m)) return "terracotta_tile";
  if (/concrete|tile|slate/.test(m)) return "concrete_tile";
  if (/membrane|torch|bitum|low[-\s]?slope|flat/.test(m)) return "membrane";
  return "metal";
}

/** jobs.job_type enum (US-era values + AU additions) → AU job type. */
export function auJobTypeFrom(jobType: string | null | undefined): AuJobType {
  switch (jobType) {
    case "replacement": case "re_roof": return "re_roof";
    case "restoration": return "restoration";
    case "repair": return "repair";
    case "gutters": return "gutters";
    case "asbestos": case "asbestos_replacement": return "asbestos_replacement";
    case "new_construction": case "new_build": return "new_build";
    default: return "other";
  }
}

// ---------------------------------------------------------------------------------------------
// State reference (Settings → State rules, and the panel when no contract value is known yet)
// ---------------------------------------------------------------------------------------------
export type ReferenceRow = { topic: string; text: string; src: Cite[] };
export type StateReference = { state: AuState; stateName: string; asOf: IsoDate; regulator: Regulator; whsRegulator: Regulator; rows: ReferenceRow[]; changes: string[]; unverified: Unverified[]; verifiedOn: string; disclaimer: string };

/** Key thresholds and rules for a state as at a date, independent of any one job. */
export function stateReference(stateInput: string, asOf: string | Date = new Date()): StateReference {
  const state = asAuState(stateInput);
  if (!state) throw new Error(`Unknown Australian state: ${stateInput}`);
  const d = calendarDate(asOf, AU_STATE_TZ[state]);
  // A typical tile re-roof over every threshold, used to pull the shared texts and unverified list.
  const big = rulesFor(state, { contractValueIncGst: 60000, contractDate: d, roofSystem: "concrete_tile", jobType: "re_roof", existingHouse: true });
  const rows: ReferenceRow[] = [];
  const changes: string[] = [];
  const add = (topic: string, text: string, src: Cite[]) => rows.push({ topic, text, src });
  switch (state) {
    case "NSW":
      add("Licence", "Contractor licence for work over $5,000 incl. GST (roof plumbing, roof tiling, roof slating or general building). Show name, licence number and category in all ads and contracts.", [SRC.nswRoofPlumbing, SRC.nswRoofTiling, SRC.nswAds]);
      add("Written contract", "Over $5,000: small jobs contract. Over $20,000: large jobs contract (17-item checklist, progress payment schedule, warranties, cooling-off statement).", [SRC.nswContracts]);
      add("Deposit", "Maximum 10% for all contracts; any money before work starts counts.", [SRC.nswContracts]);
      add("Cooling-off", "Over $20,000: 5 clear business days after the owner gets the signed copy (business days exclude 27–31 Dec). Exception for urgent work.", [SRC.nswSample20k]);
      add("Home warranty", "HBC (icare HBCF) over $20,000 incl. GST: before any payment (incl. deposit) and before work.", [SRC.icareNeed]);
      add("Documents", "Consumer Building Guide before signing (over $5,000); Security of Payment Guide in contracts over $20,000; signed copy within 5 business days.", [SRC.nswCbg, SRC.nswSopChanges]);
      add("Warranties", "6 years major defects (incl. roof waterproofing), 2 years other.", [SRC.nswOwnerContracts, SRC.nswDefects]);
      add("Security of payment", "Covers owner-occupiers (residential work from $5,000). Payment schedule within 10 business days.", [SRC.nswSopChanges]);
      break;
    case "VIC": {
      const major = pick(VIC_MAJOR, d);
      const post = d >= VIC_CHANGE_DATE;
      add("Which roofs are covered", "Metal roofing, flashings, gutters and downpipes only = plumbing work (outside the Domestic Building Contracts Act). Tile, slate, concrete and membrane roofing = domestic building work.", [SRC.vicDbcRegs, SRC.vicPlumbRegs]);
      add("Registration / licence", `Registered building practitioner (roof tiling or unlimited) for major contracts over ${$(major)}; plumbers need the Roofing (stormwater) class.`, [SRC.vicDbc, SRC.vicBuildingAct]);
      add("Written contract", post ? "Every domestic building contract in writing; major contract over $20,000." : `Major domestic building contract over ${$(major)} (written, signed by both).`, [SRC.vicDbc, SRC.vicAmend2025]);
      add("Deposit", post ? "Flat 10%." : "10% under $20,000; 5% at $20,000 or more.", [SRC.vicDbc, SRC.vicAmendRegs2026]);
      add("Cooling-off", `Major contracts: 5 clear business days after the owner receives the signed copy.${post ? "" : " Legal-advice exception until 30 Mar 2027."}`, [SRC.vicDbc, SRC.vicModelContract]);
      add("Home warranty", d >= "2026-07-01" ? "First Resort Home Warranty Scheme over $20,000 (contracts from 1 Jul 2026): premium paid to the Authority before the earlier of 10 business days or work starting." : "Domestic Building Insurance over $16,000.", [SRC.vicBuildingAct, SRC.vicSis]);
      add("Plumbing compliance certificate", "Roof plumbing of $750 or more: certificate to the customer and lodged within 5 days of completion.", [SRC.vicPlumbRegs]);
      add("Warranties", "Implied warranties; building actions within 10 years.", [SRC.vicDbc]);
      add("Security of payment", "Domestic building contracts with home owners excluded; 10 business days for payment schedules.", [SRC.vicSop]);
      if (!post) changes.push("31 Mar 2027: major contract threshold becomes $20,000, deposit becomes a flat 10%, every contract must be in writing, and the legal-advice cooling-off exception is removed.");
      break;
    }
    case "QLD":
      add("Licence", "QBCC licence over $3,300 (incl. GST): Roof and wall cladding, Roof tiling; roof painting needs Painting and decorating.", [SRC.qldReg, SRC.qbccLicence]);
      add("Written contract", "Level 1 over $3,300 and under $20,000; Level 2 at $20,000 or more. In writing, dated, signed — or it has no effect.", [SRC.qldAct]);
      add("Deposit", "Level 1: 10%; Level 2: 5%; 20% only if off-site work is over 50%. Includes the insurance premium.", [SRC.qldAct]);
      add("Cooling-off", "Over $3,300: 5 business days after the owner receives the signed copy. Owners can waive it for repair contracts.", [SRC.qldAct, SRC.qbccCooling]);
      add("Home warranty", "QHWS over $3,300 (re-roofs, restorations, gutters): premium paid to QBCC before the earlier of 10 business days or work starting.", [SRC.qldAct, SRC.qbccAtoZ]);
      add("Documents", d >= QLD_CBG_V2_FROM ? "Level 2: Consumer Building Guide FSG0116_v2_10/26 with signed acknowledgement, before signing." : "Level 2: Consumer Building Guide before signing.", [SRC.qbccCbg]);
      add("Warranties", "6 years structural, 1 year non-structural (+6 months if found late).", [SRC.qldAct]);
      add("Security of payment", "Resident owners excluded; payment schedule 15 business days.", [SRC.qldBif]);
      break;
    case "WA":
      add("Registration", "Building contractor registration only for permit work worth $20,000+ in a Schedule 3 area. Like-for-like re-roof without a permit: no registration.", [SRC.waBsrRegs]);
      add("Written contract", "Over $7,500 and under $500,000: written, dated, signed; Notice for the Home Owner before signing.", [SRC.waHbc, SRC.waHbcRegs]);
      add("Deposit", "Maximum 6.5%.", [SRC.waHbc]);
      add("Cooling-off", "None under WA building law (ACL door-to-door right still applies).", [SRC.waHbc]);
      add("Home indemnity insurance", "Over $20,000 where a building permit (and registration) is needed: certificate before any payment. No permit → no HII.", [SRC.waHbc, SRC.waHbcRegs]);
      add("Warranties", "4-month make-good period after practical completion; 6-year complaint window.", [SRC.waHbc]);
      add("Security of payment", "Individual home owners excluded (up to $500,000); 15 business days.", [SRC.waSop]);
      break;
    case "SA": {
      const minor = pick(SA_MINOR, d);
      add("Licence", "Building work contractors licence at any value (plumbing contractors exempt only for minor roof plumbing under $3,000). Show the BLD number in ads and on site signs.", [SRC.saBwc, SRC.saBwcRegs]);
      add("Written contract", `${$(minor)} or more: written, signed, copy + Form 1.`, [SRC.saBwc, SRC.saForm1]);
      add("Deposit", `${$(minor)} or more: 5%. Under ${$(minor)}: no statutory cap.`, [SRC.saBwc]);
      add("Cooling-off", `${$(minor)} or more: 5 clear business days after the contract is made (Form 1 clause 2).`, [SRC.saForm1]);
      add("Building indemnity insurance", `${$(minor)} or more AND development approval needed: certificate before work starts.`, [SRC.saBwc]);
      add("Warranties", "5 years (any value) + 10-year long-stop.", [SRC.saBwc, SRC.saPdi]);
      add("Security of payment", "Owner-occupied homes excluded; 15 business days.", [SRC.saSop]);
      break;
    }
    case "TAS":
      add("Licence", "Building services licence unless the work is low-risk (Director's determination); plumbing licence for roof stormwater work.", [SRC.tasOl, SRC.tasPlumbRegs]);
      add("Written contract", "$20,000 or more: written, signed, consumer guide attached.", [SRC.tasRbw]);
      add("Deposit", "$20,000 or more: 10% under $50,000, 5% from $50,000.", [SRC.tasRbw, SRC.tasRbwRegs]);
      add("Cooling-off", "5 business days after the owner has both the signed contract and the consumer guide.", [SRC.tasRbw]);
      add("Home warranty", "None in force.", [SRC.tasHwi2023]);
      add("Warranties", "6 years from practical completion.", [SRC.tasRbw]);
      add("Security of payment", "Covers home owners; 10 business days (20 for a residence to be built).", [SRC.tasSop]);
      break;
    case "ACT":
      add("Licence", "Licensed builder at any value (class C or higher likely for roofs). Ads, quotes, sample contracts, cards and vehicles show licence name, number and ACN.", [SRC.actCola, SRC.actColr]);
      add("Written contract", "No statutory requirement; prescribed documents must be attached (content not verified).", [SRC.actBa]);
      add("Deposit", "No statutory cap.", [SRC.actBa]);
      add("Cooling-off", "None under ACT building law (ACL door-to-door right still applies).", [SRC.actBa]);
      add("Insurance", "Residential building insurance / fidelity certificate only for approved work of $12,000 or more, with the commencement notice.", [SRC.actBa, SRC.actBgr]);
      add("Warranties", "$12,000 or more: 6 years for roofs (structural, incl. weatherproofing), 2 years non-structural.", [SRC.actBgr]);
      add("Security of payment", "Resident owners excluded; 10 business days.", [SRC.actSop]);
      add("Asbestos", "Any asbestos removal needs a licensed removalist (no 10 m² allowance).", [SRC.actWhs]);
      break;
    case "NT": {
      const t = pick(NT_THRESHOLD, d);
      add("Re-roofing", "Re-roofing an existing house (no floor-area increase) is outside registration, written-contract, deposit and RBI/fidelity rules.", [SRC.ntBr, SRC.ntRbi]);
      add("New houses", `Prescribed work of ${$(t)} or more: registration, written contract, 5% deposit, RBI/fidelity cover before any payment.`, [SRC.ntBr, SRC.ntAmd26]);
      add("Cooling-off", "None under NT building law (ACL door-to-door right still applies).", [SRC.ntBa]);
      add("Permits", "Inside building control areas, repairs and alterations need a building permit.", [SRC.ntBa]);
      add("Security of payment", "Covers home owners: notice of dispute within 10 working days or pay within 20.", [SRC.ntSop]);
      add("WHS", "SWMS over 2 m; 3 m for residential construction work from 17 Jul 2026.", [SRC.ntWhs]);
      break;
    }
  }
  add("SWMS / falls", big.whs.notes[0] ?? `SWMS for fall risk over ${big.whs.swmsHeightM} m.`, big.whs.src);
  add("Asbestos (AC roofs)", [big.asbestos.notes.find((x) => !/^House built/.test(x)) ?? "", `Licensed removalist notifies ${WHS_REGULATOR[state].name} ${big.asbestos.notifyBefore}.`, "Never high-pressure clean an asbestos-cement roof."].filter(Boolean).join(" "), big.asbestos.src);
  add("Door-knock sales (ACL, all states)", "Uninvited sales of $100+: 10 business days to cancel from the day after signing; no work and no payment in that time; front-page notice and termination form; visits Mon–Fri 9–6, Sat 9–5, never Sundays or public holidays.", [SRC.acccDoor, SRC.acccSalesGuide]);
  add("Pricing (ACL, all states)", "One total price incl. GST; no card surcharges from 1 Oct 2026.", [SRC.acccPrice, SRC.acccSurcharge]);
  return { state, stateName: AU_STATE_NAME[state], asOf: d, regulator: REGULATOR[state], whsRegulator: WHS_REGULATOR[state], rows, changes, unverified: big.unverified, verifiedOn: VERIFIED_ON, disclaimer: DISCLAIMER };
}
