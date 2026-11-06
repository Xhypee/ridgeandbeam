/**
 * Verified Australian roofing rules: sources, thresholds, effective dates and notice wording.
 *
 * Every value here comes from the VERIFIED / CORRECTED items in
 * research_notes/Australian roofing law by state/verified_*.md (checked 2026-11-06). Items the research
 * marked UNVERIFIED are NOT encoded as rules: the engine (au-rules.ts) reports them in `unverified`
 * with the regulator's link ("Check with your regulator"). Do not add values here without a source.
 *
 * This is general information, not legal advice.
 */
import type { AuState } from "./au";

export const VERIFIED_ON = "2026-11-06";
export const DISCLAIMER = "This is general information, not legal advice.";

export type Cite = { label: string; url: string };
export type Regulator = { name: string; url: string };

/** Value that changes on a date: the entry with the latest `from` on or before the contract date wins. */
export type Dated<T> = readonly { from: string; value: T }[];
export function pick<T>(table: Dated<T>, isoDate: string): T {
  let out = table[0].value;
  for (const row of table) if (row.from <= isoDate) out = row.value;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Regulators ("Check with your regulator" links)
// ---------------------------------------------------------------------------------------------
export const REGULATOR: Record<AuState, Regulator> = {
  NSW: { name: "Building Commission NSW", url: "https://www.nsw.gov.au/departments-and-agencies/building-commission" },
  VIC: { name: "Building and Plumbing Commission (BPC)", url: "https://www.bpc.vic.gov.au" },
  QLD: { name: "Queensland Building and Construction Commission (QBCC)", url: "https://www.qbcc.qld.gov.au" },
  WA: { name: "Building Commissioner (Building and Energy)", url: "https://www.wa.gov.au/organisation/building-and-energy/building-and-energy" },
  SA: { name: "Consumer and Business Services (CBS)", url: "https://www.cbs.sa.gov.au" },
  TAS: { name: "Consumer, Building and Occupational Services (CBOS)", url: "https://www.cbos.tas.gov.au" },
  ACT: { name: "Construction Occupations Registrar (Access Canberra)", url: "https://www.accesscanberra.act.gov.au" },
  NT: { name: "NT Director of Building Control / Building Practitioners Board", url: "https://nt.gov.au" },
};

export const WHS_REGULATOR: Record<AuState, Regulator> = {
  NSW: { name: "SafeWork NSW", url: "https://www.safework.nsw.gov.au" },
  VIC: { name: "WorkSafe Victoria", url: "https://www.worksafe.vic.gov.au" },
  QLD: { name: "Workplace Health and Safety Queensland", url: "https://www.worksafe.qld.gov.au" },
  WA: { name: "WorkSafe WA", url: "https://www.worksafe.wa.gov.au" },
  SA: { name: "SafeWork SA", url: "https://www.safework.sa.gov.au" },
  TAS: { name: "WorkSafe Tasmania", url: "https://worksafe.tas.gov.au" },
  ACT: { name: "WorkSafe ACT", url: "https://www.worksafe.act.gov.au" },
  NT: { name: "NT WorkSafe", url: "https://worksafe.nt.gov.au" },
};

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------
const nswgov = "https://www.nsw.gov.au";
export const SRC = {
  // NSW (Building Commission NSW / icare pages; statute text itself was not readable)
  nswContracts: { label: "Building Commission NSW: Guide to providing home building contracts", url: `${nswgov}/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/guide-to-providing-home-building-contracts` },
  nswOwnerContracts: { label: "NSW: Contracts for residential building work", url: `${nswgov}/housing-and-construction/building-or-renovating-a-home/preparing/contracts` },
  nswChecklist: { label: "NSW: Checklist for home owners (over $20,000)", url: `${nswgov}/housing-and-construction/building-or-renovating-a-home/preparing/contracts/checklist` },
  nswRoofPlumbing: { label: "NSW: Roof plumbing work licence", url: `${nswgov}/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-plumbing-work` },
  nswRoofTiling: { label: "NSW: Roof tiling work licence", url: `${nswgov}/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-tiling-work` },
  nswGeneral: { label: "NSW: General building work", url: `${nswgov}/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/general-building-work` },
  nswAds: { label: "NSW: Building trade advertisements", url: `${nswgov}/business-and-economy/running-a-business/advertising-laws-and-your-business/building-trade-advertisements` },
  nswInsurance: { label: "NSW: Insurance cover for building work", url: `${nswgov}/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/insurance-cover` },
  icareNeed: { label: "icare: Do I need HBCF?", url: "https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/do-i-need-hbcf" },
  nswCbg: { label: "NSW Consumer Building Guide (how to use)", url: `${nswgov}/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide` },
  nswCbgPdf: { label: "NSW Consumer Building Guide (Nov 2025 PDF)", url: `${nswgov}/sites/default/files/noindex/2026-02/consumer-building-guide-2025.pdf` },
  nswSample20k: { label: "Building Commission NSW sample contract over $20,000 (July 2025)", url: `${nswgov}/sites/default/files/noindex/2026-03/home-building-contract-over-20000-july-2025.pdf` },
  nswSample5to20: { label: "Building Commission NSW sample contract $5,000–$20,000 (July 2025)", url: `${nswgov}/sites/default/files/noindex/2026-03/home-building-contract-5000-to-20000-july-2025.pdf` },
  nswDefects: { label: "Building Commission NSW: building defect complaints", url: `${nswgov}/departments-and-agencies/building-commission/about-us/building-defect-complaints` },
  nswSopChanges: { label: "NSW: Changes to Security of Payment laws", url: `${nswgov}/housing-and-construction/compliance-and-regulation/security-of-payment/changes-to-laws` },
  nswSopFaq: { label: "NSW: Security of Payment FAQs", url: `${nswgov}/housing-and-construction/compliance-and-regulation/security-of-payment/frequently-asked-questions` },
  nswPlumbingDocs: { label: "NSW: Plumbing inspection documents", url: `${nswgov}/housing-and-construction/compliance-and-regulation/plumbers-and-drainers/plumbing-inspection-documents` },
  nswCbgGuide: { label: "NSW Consumer Building Guide (web)", url: `${nswgov}/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide/guide` },

  // VIC (authorised consolidated legislation + CAV / WorkSafe VIC)
  vicDbc: { label: "Domestic Building Contracts Act 1995 (Vic) v094", url: "https://www.legislation.vic.gov.au/in-force/acts/domestic-building-contracts-act-1995/094" },
  vicDbcRegs: { label: "Domestic Building Contracts Regulations 2017 (Vic)", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/domestic-building-contracts-regulations-2017/004" },
  vicAmend2025: { label: "Domestic Building Contracts Amendment Act 2025 (Vic)", url: "https://www.legislation.vic.gov.au/as-made/acts/domestic-building-contracts-amendment-act-2025" },
  vicAmendRegs2026: { label: "Domestic Building Contracts Amendment Regulations 2026 (S.R. 175/2026)", url: "https://www.legislation.vic.gov.au/as-made/statutory-rules/domestic-building-contracts-amendment-regulations-2026" },
  vicCla2026: { label: "Consumer Legislation Amendment Act 2026 (Vic)", url: "https://www.legislation.vic.gov.au/as-made/acts/consumer-legislation-amendment-act-2026" },
  vicBuildingAct: { label: "Building Act 1993 (Vic) v152", url: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993/152" },
  vicSis: { label: "Building (Statutory Insurance Scheme) Regulations 2026 (Vic)", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/building-statutory-insurance-scheme-regulations-2026/002" },
  vicPlumbRegs: { label: "Plumbing Regulations 2018 (Vic)", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/plumbing-regulations-2018/010" },
  vicBuildingRegs: { label: "Building Regulations 2018 (Vic) v032", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/building-regulations-2018/032" },
  vicSop: { label: "Building and Construction Industry Security of Payment Act 2002 (Vic)", url: "https://www.legislation.vic.gov.au/in-force/acts/building-and-construction-industry-security-payment-act-2002/015" },
  vicOhs: { label: "Occupational Health and Safety Regulations 2017 (Vic)", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017/018" },
  vicConsumerGuide: { label: "CAV: Domestic Building Consumer Guide", url: "https://www.consumer.vic.gov.au/housing/building-and-renovating/plan-and-manage-your-building-project/domestic-building-consumer-guide" },
  vicModelContract: { label: "CAV model contract (approved cooling-off notice)", url: "https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/building-and-renovating/building-contract-for-new-homes.docx" },
  vicWhatWork: { label: "CAV: What work requires a building contract", url: "https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/domestic-building-contracts/what-work-requires-a-building-contract" },
  vicAsbestosNotice: { label: "WorkSafe Victoria: Asbestos removal notification", url: "https://www.worksafe.vic.gov.au/asbestos-removal-notification" },
  vicAsbestosLimit: { label: "WorkSafe Victoria: Understand and manage asbestos", url: "https://www.worksafe.vic.gov.au/understand-and-manage-asbestos-workplaces" },
  vicSwms: { label: "WorkSafe Victoria: Safe work method statements", url: "https://www.worksafe.vic.gov.au/safe-work-method-statements-swms" },

  // QLD
  qldAct: { label: "QBCC Act 1991 (Qld), Schedule 1B", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-1991-098" },
  qldReg: { label: "QBCC Regulation 2018 (Qld)", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2018-0138" },
  qldPd: { label: "Plumbing and Drainage Act 2018 (Qld)", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-2018-017" },
  qldBif: { label: "Building Industry Fairness (Security of Payment) Act 2017 (Qld)", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-2017-043" },
  qldBldgReg: { label: "Building Regulation 2021 (Qld)", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2021-0126" },
  qldWhs: { label: "Work Health and Safety Regulation 2011 (Qld)", url: "https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2011-0240" },
  qbccLicence: { label: "QBCC: Who must hold a QBCC licence", url: "https://www.qbcc.qld.gov.au/home-owner-hub/build-renovate/finding-contractor-getting-quotes/who-must-hold-qbcc-licence" },
  qbccContracts: { label: "QBCC: Contracts and agreement types", url: "https://www.qbcc.qld.gov.au/home-owner-hub/build-renovate/contracts-payments/contracts-agreement-types" },
  qbccDeposits: { label: "QBCC: Deposits and progress payments", url: "https://www.qbcc.qld.gov.au/home-owner-hub/build-renovate/contracts-payments/deposits-progress-payments" },
  qbccCooling: { label: "QBCC: Cooling-off period", url: "https://www.qbcc.qld.gov.au/home-owner-hub/build-renovate/contracts-payments/cooling-off-period" },
  qbccHw: { label: "QBCC: What is home warranty insurance", url: "https://www.qbcc.qld.gov.au/home-owner-hub/queensland-home-warranty-scheme/what-home-warranty-insurance" },
  qbccPremium: { label: "QBCC: Who pays the premium", url: "https://www.qbcc.qld.gov.au/home-owner-hub/queensland-home-warranty-scheme/who-pays-premium" },
  qbccAtoZ: { label: "QBCC: Insurable work A–Z guide", url: "https://www.qbcc.qld.gov.au/sites/default/files/2022-03/guide-insurable-work-a-to-z.pdf" },
  qbccCbg: { label: "QBCC Consumer Building Guide (FSG0116_v2_10/26)", url: "https://www.qbcc.qld.gov.au/sites/default/files/2021-09/guide-qbcc-consumer-building-v3.pdf" },

  // WA
  waHbc: { label: "Home Building Contracts Act 1991 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a352.html&view=consolidated" },
  waHbcRegs: { label: "Home Building Contracts Regulations 1992 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s4507.html&view=consolidated" },
  waBsrAct: { label: "Building Services (Registration) Act 2011 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a146829.html&view=consolidated" },
  waBsrRegs: { label: "Building Services (Registration) Regulations 2011 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43838.html&view=consolidated" },
  waBuildingRegs: { label: "Building Regulations 2012 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43955.html&view=consolidated" },
  waPlRegs: { label: "Plumbers Licensing and Plumbing Standards Regulations 2000 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s1820.html&view=consolidated" },
  waSop: { label: "Building and Construction Industry (Security of Payment) Act 2021 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a147300.html&view=consolidated" },
  waWhs: { label: "Work Health and Safety (General) Regulations 2022 (WA)", url: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html&view=consolidated" },

  // SA
  saBwc: { label: "Building Work Contractors Act 1995 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-work-contractors-act-1995/current/1995.87.auth.pdf" },
  saBwcRegs: { label: "Building Work Contractors Regulations 2026 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-work-contractors-regulations-2026/current/2026.58.auth.pdf" },
  saForm1: { label: "CBS Form 1: Your building contract — your rights and obligations", url: "https://www.cbs.sa.gov.au/documents/form-1-building-contract-rights-and-obligations.pdf" },
  saBuildingWork: { label: "CBS: Building work in SA — what you need to know", url: "https://www.cbs.sa.gov.au/documents/Building-work-in-SA-what-you-need-to-know.pdf" },
  saSop: { label: "Building and Construction Industry Security of Payment Act 2009 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-and-construction-industry-security-of-payment-act-2009/current/2009.77.auth.pdf" },
  saPdi: { label: "Planning, Development and Infrastructure Act 2016 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/planning-development-and-infrastructure-act-2016/current/2016.14.auth.pdf" },
  saPdiRegs: { label: "PDI (General) Regulations 2017 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/planning-development-and-infrastructure-general-regulations-2017/current/2017.24.auth.pdf" },
  saWhs: { label: "Work Health and Safety Regulations 2012 (SA)", url: "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/work-health-and-safety-regulations-2012/current/2012.268.auth.pdf" },
  saHeights: { label: "SafeWork SA: Working at heights", url: "https://www.safework.sa.gov.au/industry/construction/working-at-heights" },

  // TAS
  tasRbw: { label: "Residential Building Work Contracts and Dispute Resolution Act 2016 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2016-032" },
  tasRbwRegs: { label: "RBWCDR Regulations 2026 (Tas) (from 2 Nov 2026)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2026-085" },
  tasHwi2023: { label: "Residential Building (Home Warranty Insurance Amendments) Act 2023 (Tas) — not commenced", url: "https://www.legislation.tas.gov.au/view/whole/html/asmade/act-2023-025" },
  tasOl: { label: "Occupational Licensing Act 2005 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2005-047" },
  tasPlumbRegs: { label: "Occupational Licensing (Plumbing Work) Regulations 2021 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2021-114" },
  tasBuildingAct: { label: "Building Act 2016 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2016-025" },
  tasSop: { label: "Building and Construction Industry Security of Payment Act 2009 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2009-086" },
  tasWhs: { label: "Work Health and Safety Regulations 2022 (Tas)", url: "https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2022-109" },

  // ACT
  actBa: { label: "Building Act 2004 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/a/2004-11/current/PDF/2004-11.PDF" },
  actBgr: { label: "Building (General) Regulation 2008 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/sl/2008-3/current/PDF/2008-3.PDF" },
  actCola: { label: "Construction Occupations (Licensing) Act 2004 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/a/2004-12/current/PDF/2004-12.PDF" },
  actColr: { label: "Construction Occupations (Licensing) Regulation 2004 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/sl/2004-36/current/PDF/2004-36.PDF" },
  actWsa: { label: "Water and Sewerage Act 2000 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/a/2000-68/current/PDF/2000-68.PDF" },
  actSop: { label: "Building and Construction Industry (Security of Payment) Act 2009 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/a/2009-50/current/PDF/2009-50.PDF" },
  actWhs: { label: "Work Health and Safety Regulation 2011 (ACT)", url: "https://www.legislation.act.gov.au/DownloadFile/sl/2011-36/current/PDF/2011-36.PDF" },

  // NT
  ntBa: { label: "Building Act 1993 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=11645" },
  ntBr: { label: "Building Regulations 1993 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=11646" },
  ntRbi: { label: "Building (RBI and Fidelity Fund Schemes) Regulations 2012 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=11647" },
  ntDrr: { label: "Building (Resolution of Residential Building Work Disputes) Regulations 2012 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=11648" },
  ntAmd26: { label: "Building Legislation Amendment (Consumer Protection) Regulations 2026 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/SubordinateLegislation/PDF?id=6171" },
  ntSop: { label: "Construction Contracts (Security of Payments) Act 2004 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=11703" },
  ntWhs: { label: "WHS (National Uniform Legislation) Regulations 2011 (NT)", url: "https://legislation.nt.gov.au/api/sitecore/Act/PDF?id=12283" },

  // National
  acccDoor: { label: "ACCC: Telemarketing and door-to-door sales", url: "https://www.accc.gov.au/business/selling-products-and-services/telemarketing-and-door-to-door-sales" },
  acccSalesGuide: { label: "ACCC: Sales practices guide (Nov 2022)", url: "https://www.accc.gov.au/system/files/sales-practices-guide-businesses-legal-practitioners.pdf" },
  cavDoor: { label: "Consumer Affairs Victoria: Door-to-door sales", url: "https://www.consumer.vic.gov.au/consumers-and-businesses/products-and-services/business-practices/door-to-door-sales-and-telemarketing/door-to-door-sales" },
  cavDisaster: { label: "Consumer Affairs Victoria: Clean up, repairs and re-building (disaster emergency repairs)", url: "https://www.consumer.vic.gov.au/resources-and-tools/advice-in-a-disaster/clean-up-repairs-and-re-building" },
  acccPrice: { label: "ACCC: Price displays (single total price incl GST)", url: "https://www.accc.gov.au/consumers/pricing/price-displays" },
  acccSurcharge: { label: "ACCC: Card surcharges", url: "https://www.accc.gov.au/business/pricing/card-surcharges" },
  rbaSurcharge: { label: "RBA: Removal of card payment surcharges from 1 October 2026 (FAQ)", url: "https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/faqs/" },
} satisfies Record<string, Cite>;

// ---------------------------------------------------------------------------------------------
// Effective-dated thresholds (AUD, treated as GST-inclusive contract price)
// ---------------------------------------------------------------------------------------------
/** VIC major domestic building contract threshold ("more than"). 31 Mar 2027: S.R. 175/2026 reg 7. */
export const VIC_MAJOR: Dated<number> = [{ from: "1900-01-01", value: 10_000 }, { from: "2027-03-31", value: 20_000 }];
export const VIC_CHANGE_DATE = "2027-03-31";
/** VIC home warranty: First Resort scheme > $20,000 for contracts from 1 Jul 2026; DBI > $16,000 before. */
export const VIC_HW: Dated<{ scheme: string; threshold: number }> = [
  { from: "1900-01-01", value: { scheme: "Domestic Building Insurance", threshold: 16_000 } },
  { from: "2026-07-01", value: { scheme: "First Resort Home Warranty Scheme", threshold: 20_000 } },
];
/** SA minor domestic building work ("less than"): $12,000 from 15 Oct 2001; $20,000 from 10 Nov 2025 (BWC Regs 2026 r 4(4)). */
export const SA_MINOR: Dated<number> = [{ from: "1900-01-01", value: 12_000 }, { from: "2025-11-10", value: 20_000 }];
export const SA_CHANGE_DATE = "2025-11-10";
/** SA WHS high risk construction work fall height: 3 m until 30 Jun 2026, 2 m from 1 Jul 2026. */
export const SA_SWMS_M: Dated<number> = [{ from: "1900-01-01", value: 3 }, { from: "2026-07-01", value: 2 }];
/** NT thresholds (registration, written contract, RBI/fidelity): $12,000 → $25,000 from 30 Mar 2026. */
export const NT_THRESHOLD: Dated<number> = [{ from: "1900-01-01", value: 12_000 }, { from: "2026-03-30", value: 25_000 }];
export const NT_CHANGE_DATE = "2026-03-30";
/** NT residential construction work SWMS threshold 3 m from 17 Jul 2026 (2 m otherwise). */
export const NT_RESIDENTIAL_SWMS_FROM = "2026-07-17";
/** TAS: RBWCDR Regulations 2026 take effect 2 Nov 2026 (set amount $50,000). */
export const TAS_REGS_2026 = "2026-11-02";
/** QLD Consumer Building Guide FSG0116_v2_10/26 "effective October 2026". */
export const QLD_CBG_V2_FROM = "2026-10-01";
/** National: card surcharges removed from 1 Oct 2026 (ACCC, RBA). */
export const CARD_SURCHARGE_BAN_FROM = "2026-10-01";

// ---------------------------------------------------------------------------------------------
// Notice wording (verbatim where the research captured it)
// ---------------------------------------------------------------------------------------------
/** Building Commission NSW sample contract over $20,000 (July 2025), cooling-off clause. */
export const NSW_COOLING_OFF_TEXT =
  "Cooling off period for contracts with price over $20,000. Under the Home Building Act 1989 the owner may rescind the contract under the following provisions. The contract may be rescinded even if work has commenced under the contract. The notice of rescission must be given to the contractor: (a) where the owner has been given a copy of the signed contract – within 5 clear business days after being given a copy of the signed contract, or (b) where the owner has not been given a copy of the signed contract within 5 days after the contract was signed – within 5 clear business days after the owner becomes aware of being entitled to be given a copy of the signed contract. The notice of rescission must state that the owner rescinds the contract, and must be given to the contractor by leaving it at the address shown as the contractor's address, or by any method of service provided by [notices clause] of this contract.";

/** Director of CAV approved notice (s 31(1)(n)), from CAV's model contract. For contracts before 31 Mar 2027. */
export const VIC_COOLING_OFF_TEXT =
  "Notice to Building Owner: You may end this contract within five clear business days after receipt by you of a signed copy of the contract by filling in the notice below and giving it to the Builder in one of the following ways: (1) Personally (2) Leaving it at his or her address set out in the contract with a person who appears to be at least 16 years old (3) Sending it by pre-paid certified mail to the address set out in this contract (4) Sending it by facsimile to the facsimile number (if any) set out in this contract.";
export const VIC_COOLING_OFF_FORM =
  "Notice that contract is ended. I/We: ______________________ give notice under our contract with you that the contract is ended. Please refund the deposit less $100 and any out of pocket expenses incurred by you which I have previously approved. Building Owner's signature: ______________________ Date: ____________";

/** SA BWC Regs 2026 Sch 2 Form 1, clause 2 (Form 1 must be given in full, ≥ 10 pt Times New Roman). */
export const SA_FORM1_CL2 =
  "2—What are my \"cooling off\" rights? You may cancel your building contract, if you act before the \"prescribed time\". If you wish to cancel, you must give your building work contractor written notice of your intention not to be bound by the contract. You must serve that notice on the building work contractor either personally or by certified mail in an envelope addressed to the contractor. You must do this— (a) before 5 clear business days have expired after the making of the contract; or (b) if your building work contractor has not complied with relevant provisions of the Act, before the contractor completes the building work under the contract.";

/** QLD: no prescribed wording; this paraphrases the QBCC cooling-off page (label it as suggested). */
export const QLD_COOLING_OFF_SUGGESTED =
  "Under section 35 of Schedule 1B of the QBCC Act, you generally have the right to withdraw from the contract during a cooling-off period of five (5) business days.";

/** ACL unsolicited consumer agreement front-page notice (ACCC and CAV give identical wording). */
export const ACL_FRONT_PAGE_TITLE = "Important Notice to the Consumer";
export const ACL_FRONT_PAGE_TEXT =
  "You have a right to cancel this agreement within 10 business days from and including the day after you signed or received this agreement. Details about your additional rights to cancel this agreement are set out in the information attached to this agreement.";

export const ACL_CALLING_HOURS = "Door-to-door: Monday–Friday 9 am–6 pm and Saturday 9 am–5 pm; no visits on Sundays or public holidays (unless an appointment was made beforehand by phone or in writing, not in person).";
