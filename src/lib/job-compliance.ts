/**
 * Job compliance checklist (pure): built from the job's state rules (au-rules.ts) and what we know
 * about the job, then overlaid with the ticks people stored in job_compliance_items.
 * General information, not legal advice.
 */
import { AU_STATE_TZ } from "./au";
import { addBusinessDays, calendarDate, type IsoDate } from "./au-business-days";
import { canTakePayment, coolingOffEnd, formatAuDate, type RulesResult } from "./au-rules";

export type ItemStatus = "done" | "todo" | "not_needed";
export const ITEM_STATUSES: ItemStatus[] = ["done", "todo", "not_needed"];

export const CHECKLIST_KEYS = [
  "licence_on_quote", "written_contract", "consumer_guide", "signed_copy", "cooling_off", "insurance_certificate",
  "door_knock_rules", "permit_check", "swms", "asbestos_check", "plumbing_certificate", "warranty_info",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export type StoredTick = { item_key: string; status: ItemStatus; note: string | null; reference: string | null; file_id: string | null; updated_at?: string | null; updated_by_name?: string | null };

export type ChecklistItem = {
  key: ChecklistKey;
  title: string;
  detail: string;
  /** Final status shown (stored tick wins over the automatic one, except when not applicable). */
  status: ItemStatus;
  /** What the app worked out on its own. */
  autoStatus: ItemStatus;
  /** Status came from a person's tick. */
  manual: boolean;
  /** Evidence is expected (certificate, SWMS, signed receipt). */
  wantsEvidence: boolean;
  /** Until done, the deposit invoice is not ready. */
  blocksDeposit: boolean;
  due: IsoDate | null;
  link: { label: string; url: string } | null;
  tick: StoredTick | null;
};

export type ChecklistCtx = {
  rules: RulesResult;
  licenceNumber: string | null;
  /** Homeowner signed (estimate accepted / contract signed). */
  signedAt: string | null;
  /** Owner got the signed copy (starts cooling-off). */
  copyGivenOn: string | null;
  permitStatus: string | null;
  buildingApprovalRequired: boolean | null;
  builtBefore1990: boolean | null;
  doorKnock: boolean;
  disasterEmergencyRepair: boolean;
  jobType: string;
  stored: StoredTick[];
  today: IsoDate;
};

const docMatch = (r: RulesResult, re: RegExp) => r.documents.find((d) => re.test(d.name)) ?? null;

export function buildChecklist(c: ChecklistCtx): ChecklistItem[] {
  const r = c.rules;
  const tz = AU_STATE_TZ[r.state];
  const signed = c.signedAt ? calendarDate(c.signedAt, tz) : null;
  const stored = new Map(c.stored.map((s) => [s.item_key, s]));
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, applies: boolean, x: Omit<ChecklistItem, "key" | "status" | "manual" | "tick" | "autoStatus" | "blocksDeposit" | "wantsEvidence" | "due" | "link"> & Partial<Pick<ChecklistItem, "blocksDeposit" | "wantsEvidence" | "due" | "link">> & { auto: ItemStatus }) => {
    const tick = stored.get(key) ?? null;
    const autoStatus: ItemStatus = applies ? x.auto : "not_needed";
    const status: ItemStatus = !applies ? "not_needed" : tick ? tick.status : autoStatus;
    items.push({
      key, title: x.title, detail: x.detail, autoStatus, status, manual: Boolean(tick) && applies, tick,
      wantsEvidence: x.wantsEvidence ?? false, blocksDeposit: applies && (x.blocksDeposit ?? false) && status !== "done",
      due: x.due ?? null, link: x.link ?? null,
    });
  };

  // 1. Licence number on the quote
  const licReq = r.licence.required !== false;
  add("licence_on_quote", licReq && (r.licence.showOn.length > 0 || r.licence.showOnRecommended.includes("quote")), {
    title: "Licence number on the quote",
    detail: c.licenceNumber ? `${r.state} licence ${c.licenceNumber} prints on quotes and contracts.` : `Add your ${r.state} licence number in Settings → Company. ${r.licence.thresholdText}`,
    auto: c.licenceNumber ? "done" : "todo",
    link: { label: "Company settings", url: "/app/settings" },
  });

  // 2. Written contract
  add("written_contract", r.writtenContract.required !== false, {
    title: r.writtenContract.tier ? `Written contract: ${r.writtenContract.tier}` : "Written contract",
    detail: signed ? `Signed ${formatAuDate(signed)}.` : `${r.writtenContract.note}${r.writtenContract.mustInclude.length ? ` Must include: ${r.writtenContract.mustInclude.slice(0, 4).join(", ")}${r.writtenContract.mustInclude.length > 4 ? "…" : ""}.` : ""}`,
    auto: signed ? "done" : "todo", wantsEvidence: true,
  });

  // 3. Consumer guide / prescribed notice before signing
  const guide = docMatch(r, /Consumer Guide|Consumer Building Guide|consumer guide|Notice for the Home Owner|Form 1/);
  add("consumer_guide", Boolean(guide), {
    title: guide ? `Give the owner: ${guide.name}` : "Consumer guide",
    detail: guide ? `${guide.when}. Ask the owner to sign a dated receipt or acknowledgement.` : "",
    auto: "todo", wantsEvidence: true, link: guide ? { label: "Open the official document", url: guide.link } : null,
  });

  // 4. Signed copy to the owner
  const copyDoc = docMatch(r, /Signed (contract )?copy|Copy of the signed contract|signed contract copy/i);
  const copyDue = signed && copyDoc && /5 (clear )?business days/.test(copyDoc.when) ? addBusinessDays(signed, 5, r.coolingOff.businessDayRules) : null;
  add("signed_copy", Boolean(copyDoc), {
    title: "Signed copy of the contract given to the owner",
    detail: c.copyGivenOn ? `Given ${formatAuDate(calendarDate(c.copyGivenOn, tz))}.` : `${copyDoc?.when ?? ""}${copyDue ? ` — by ${formatAuDate(copyDue)}` : ""}. Record the date below: it starts the cooling-off period.`,
    auto: c.copyGivenOn ? "done" : "todo", due: copyDue,
  });

  // 5. Cooling-off end date passed
  const coolStart = c.copyGivenOn ?? signed;
  const coolEnd = r.coolingOff.applies && coolStart ? coolingOffEnd(r, coolStart) : null;
  add("cooling_off", r.coolingOff.applies, {
    title: `Cooling-off period over (${r.coolingOff.length ?? 0} business days)`,
    detail: coolEnd
      ? c.today > coolEnd ? `Ended ${formatAuDate(coolEnd)}.` : `The owner can withdraw until the end of ${formatAuDate(coolEnd)}${c.copyGivenOn ? "" : " (counted from signing — record when the owner got the signed copy)"}.`
      : "Starts when the owner gets a copy of the signed contract.",
    auto: coolEnd && c.today > coolEnd ? "done" : "todo", due: coolEnd,
  });

  // 6. Home warranty insurance certificate before the deposit
  const ins = r.insurance;
  add("insurance_certificate", ins.required !== false, {
    title: `${ins.scheme ?? "Home warranty insurance"} ${ins.mustBeBefore === "deposit" ? "certificate uploaded before the deposit" : "in place before work starts"}`,
    detail: `${ins.required === "depends" ? "May be needed — " : ""}${ins.note}`,
    auto: "todo", wantsEvidence: true, blocksDeposit: ins.required === true && (ins.mustBeBefore === "deposit" || ins.mustBeBefore === "work"),
    link: ins.src[0] ? { label: ins.src[0].label, url: ins.src[0].url } : null,
  });

  // 7. Door-knock (ACL) rules
  const pay = canTakePayment({ state: r.state, door_knock_sale: c.doorKnock, signed_at: c.signedAt, contract_value_inc_gst: null, disaster_emergency_repair: c.disasterEmergencyRepair }, c.today);
  add("door_knock_rules", r.acl.applies, {
    title: "Door-knock sale: no payment before day 11",
    detail: c.disasterEmergencyRepair ? "Relying on the disaster emergency-repair exemption: keep evidence of the declared emergency and that the work only removes a hazard." : pay.until ? (pay.allowed ? `10-business-day period ended ${formatAuDate(pay.until)}.` : `No work and no payment until after ${formatAuDate(pay.until)}. Front-page notice and termination form attached?`) : "Once signed: 10 business days with no work and no payment. Attach the front-page notice and termination form.",
    auto: c.disasterEmergencyRepair || (pay.until && pay.allowed) ? "done" : "todo", due: pay.until, blocksDeposit: !pay.allowed,
  });

  // 8. Permit check
  const permitDone = c.permitStatus === "approved" || c.permitStatus === "not_needed" || c.buildingApprovalRequired === false;
  add("permit_check", true, {
    title: "Permit / approval checked",
    detail: c.permitStatus === "approved" ? "Permit approved." : c.permitStatus === "not_needed" || c.buildingApprovalRequired === false ? `Recorded as not needed. ${r.permit.summary}` : r.permit.summary,
    auto: permitDone ? "done" : "todo", wantsEvidence: true,
  });

  // 9. SWMS for work at height
  add("swms", true, {
    title: `SWMS for work at height prepared (falls over ${r.whs.swmsHeightM} m)`,
    detail: r.whs.notes.join(" "), auto: "todo", wantsEvidence: true,
    link: r.whs.src[0] ? { label: r.whs.src[0].label, url: r.whs.src[0].url } : null,
  });

  // 10. Asbestos check
  const asb = c.jobType === "asbestos_replacement";
  add("asbestos_check", true, {
    title: asb ? "Licensed asbestos removalist booked and notified" : "Asbestos check (pre-1990 house?)",
    detail: asb
      ? `${r.asbestos.notes[r.state === "ACT" ? 0 : 1] ?? ""} Notice: ${r.asbestos.notifyBefore}.`
      : c.builtBefore1990 === false ? "House built 1990 or later: asbestos unlikely." : `${c.builtBefore1990 ? "Built before 1990: " : "Unknown age: "}sample suspect fibre-cement sheeting, eaves and flues, or book a licensed removalist. Never high-pressure clean an AC roof.`,
    auto: !asb && c.builtBefore1990 === false ? "done" : "todo", wantsEvidence: true,
  });

  // 11. Plumbing compliance certificate (VIC roof plumbing $750+)
  const plumb = docMatch(r, /compliance certificate/i);
  add("plumbing_certificate", Boolean(plumb), {
    title: "Plumbing compliance certificate", detail: plumb ? plumb.when : "", auto: "todo", wantsEvidence: true,
    link: plumb ? { label: "Source", url: plumb.link } : null,
  });

  // 12. Warranty information given
  add("warranty_info", r.statutoryWarranty.length > 0, {
    title: "Warranty information given",
    detail: r.statutoryWarranty.map((w) => `${w.years < 1 ? `${Math.round(w.years * 12)} months` : `${w.years} years`} ${w.type.toLowerCase()}`).join("; "),
    auto: "todo",
  });

  return items;
}

export function checklistProgress(items: ChecklistItem[]) {
  const applicable = items.filter((i) => i.status !== "not_needed" || i.autoStatus !== "not_needed");
  const needed = items.filter((i) => i.status !== "not_needed");
  return { done: needed.filter((i) => i.status === "done").length, total: needed.length, applicable: applicable.length };
}

/** Is the deposit invoice ready to send? (Blocked by insurance-before-deposit or the ACL window.) */
export function depositReadiness(items: ChecklistItem[]): { ready: boolean; reasons: string[] } {
  const blockers = items.filter((i) => i.blocksDeposit);
  return { ready: blockers.length === 0, reasons: blockers.map((b) => b.title) };
}
