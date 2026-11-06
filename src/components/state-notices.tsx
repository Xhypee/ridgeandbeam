// Notice blocks printed on quotes/contracts for the job's state, and the structured snapshot stored in
// estimates.legal_notices when the homeowner signs. Wording is reproduced verbatim where the research
// captured it (NSW sample clause, VIC approved notice, SA Form 1 cl 2, ACL front-page notice); where
// no wording is prescribed the notice is a plain-language summary and says so.
// General information, not legal advice.
import { Fragment } from "react";
import { cx } from "@/components/ui";
import { AU_STATE_NAME, asAuState } from "@/lib/au";
import {
  $, aclTerminationEnd, DISCLAIMER, formatAuDate, rulesFor, VERIFIED_ON, type RuleInput, type RulesResult,
} from "@/lib/au-rules";
import { SRC, VIC_COOLING_OFF_FORM } from "@/lib/au-rules-data";

export type StateNoticeKind = "licence" | "cooling_off" | "cooling_off_form" | "warranty" | "insurance" | "acl_front_page" | "acl_termination_form" | "acl_info" | "info";

/** Same shape as the existing notice snapshot ({id, title, text, citation, conspicuous, state, verify}) plus AU fields. */
export type StateNotice = {
  id: string;
  kind: StateNoticeKind;
  title: string;
  text: string;
  citation: string;
  sourceUrl: string;
  /** "verbatim" = wording copied from the source; "summary" = plain-language summary (no prescribed wording). */
  wording: "verbatim" | "summary";
  conspicuous?: boolean;
  /** Render with signature/date lines (detachable forms). */
  form?: boolean;
  state: string;
  verifiedOn: string;
  verify: string;
};

export type BusinessDetails = {
  name?: string | null;
  licenceNumber?: string | null;
  abn?: string | null;
  acn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type StateNoticeInput = Omit<RuleInput, "contractDate"> & { state: string; contractDate?: string | Date | null; business?: BusinessDetails };

const n = (state: string, x: Omit<StateNotice, "state" | "verifiedOn" | "verify">): StateNotice => ({ ...x, state, verifiedOn: VERIFIED_ON, verify: DISCLAIMER });

/** Notices to print on the quote / contract and to snapshot into estimates.legal_notices. */
export function stateNoticesFor(input: StateNoticeInput): StateNotice[] {
  const st = asAuState(input.state);
  if (!st) return [];
  const r: RulesResult = rulesFor(st, { ...input, contractDate: input.contractDate ?? new Date() });
  const b = input.business ?? {};
  const out: StateNotice[] = [];

  // Licence display
  if (r.licence.required !== false && (r.licence.showOn.some((s) => s === "contract" || s === "quote") || r.licence.showOnRecommended.includes("quote"))) {
    const parts = [
      b.name ? `${b.name}` : null,
      b.licenceNumber ? `${st} licence no. ${b.licenceNumber}` : `${st} licence no. ________`,
      st === "ACT" && b.acn ? `ACN ${b.acn}` : null,
      b.abn ? `ABN ${b.abn}` : null,
    ].filter(Boolean);
    out.push(n(st, {
      id: `${st.toLowerCase()}_licence`, kind: "licence", title: "Licence", text: parts.join(" · "), wording: "summary",
      citation: r.licence.src[0]?.label ?? "", sourceUrl: r.licence.src[0]?.url ?? "",
    }));
  }

  // State cooling-off
  const c = r.coolingOff;
  if (c.applies) {
    if (st === "NSW" && c.noticeText) {
      out.push(n(st, { id: "nsw_cooling_off", kind: "cooling_off", title: "Cooling off period (Home Building Act 1989)", text: c.noticeText.replace("[notices clause]", "the notices clause"), wording: "verbatim", conspicuous: true, citation: SRC.nswSample20k.label, sourceUrl: SRC.nswSample20k.url }));
    } else if (st === "VIC" && c.noticeText) {
      out.push(n(st, { id: "vic_cooling_off", kind: "cooling_off", title: "Notice pursuant to Section 31(1)(n) — Cooling off period", text: c.noticeText, wording: "verbatim", conspicuous: true, citation: SRC.vicModelContract.label, sourceUrl: SRC.vicModelContract.url }));
      out.push(n(st, { id: "vic_cooling_off_form", kind: "cooling_off_form", title: "Notice that contract is ended", text: VIC_COOLING_OFF_FORM, wording: "verbatim", form: true, citation: SRC.vicModelContract.label, sourceUrl: SRC.vicModelContract.url }));
    } else if (st === "SA" && c.noticeText) {
      out.push(n(st, { id: "sa_form1_cooling_off", kind: "cooling_off", title: "Form 1 — Your building contract: your rights and obligations (clause 2)", text: `${c.noticeText} The full Form 1 (Building Work Contractors Regulations 2026, Schedule 2) is given with your copy of the contract.`, wording: "verbatim", conspicuous: true, citation: SRC.saForm1.label, sourceUrl: SRC.saForm1.url }));
    } else if (st === "QLD" && c.noticeText) {
      out.push(n(st, { id: "qld_cooling_off", kind: "cooling_off", title: "Your right to withdraw (cooling-off)", text: `${c.noticeText} The period starts when you receive a copy of the signed contract${(input.contractValueIncGst ?? 0) >= 20000 ? " (or the Consumer Building Guide, if you receive it later)" : ""}. To withdraw, give the contractor a written notice signed by you stating that you withdraw from the contract and the section of Schedule 1B under which you withdraw.`, wording: "summary", conspicuous: true, citation: SRC.qbccCooling.label, sourceUrl: SRC.qbccCooling.url }));
    } else if (st === "TAS") {
      out.push(n(st, { id: "tas_cooling_off", kind: "cooling_off", title: "Your right to withdraw (cooling-off)", text: "You may withdraw from this contract within 5 business days after the day on which you have received both a copy of the signed contract and the residential building consumer guide. To withdraw, give the contractor a written, signed notice stating that you withdraw from the contract and the section of the Residential Building Work Contracts and Dispute Resolution Act 2016 under which you withdraw. The contractor may keep $100 plus reasonable out-of-pocket expenses.", wording: "summary", conspicuous: true, citation: SRC.tasRbw.label, sourceUrl: SRC.tasRbw.url }));
    }
  }

  // Statutory warranties (only where a written contract is required)
  if (r.writtenContract.required === true && r.statutoryWarranty.length) {
    const list = r.statutoryWarranty.map((w) => `${w.years < 1 ? `${Math.round(w.years * 12)} months` : `${w.years} years`}: ${w.type}`).join("; ");
    out.push(n(st, { id: `${st.toLowerCase()}_warranties`, kind: "warranty", title: "Statutory warranties", text: `The law gives you warranties for this work that cannot be excluded by this contract. ${list}. ${r.warrantyNote}`, wording: "summary", citation: r.writtenContract.src[0]?.label ?? "", sourceUrl: r.writtenContract.src[0]?.url ?? "" }));
  }

  // Home warranty insurance
  if (r.insurance.required === true && r.insurance.scheme) {
    const when = r.insurance.mustBeBefore === "deposit" ? "before you are asked for any payment, including a deposit" : "before work starts";
    out.push(n(st, { id: `${st.toLowerCase()}_insurance`, kind: "insurance", title: r.insurance.scheme, text: st === "VIC" || st === "QLD" ? `This work is covered by the ${r.insurance.scheme}. The premium is paid ${st === "QLD" ? "to the QBCC" : "to the Authority"} before the earlier of 10 business days after this contract is signed or the start of work, and you will receive a notice of cover.` : `This work needs ${r.insurance.scheme}. You will be given the certificate ${when}.`, wording: "summary", citation: r.insurance.src[0]?.label ?? "", sourceUrl: r.insurance.src[0]?.url ?? "" }));
  }

  // ACL unsolicited consumer agreement (door-knock / phone sale)
  if (r.acl.applies) {
    out.push(n(st, { id: "acl_front_page", kind: "acl_front_page", title: r.acl.frontPageTitle, text: r.acl.frontPageNotice, wording: "verbatim", conspicuous: true, citation: SRC.acccDoor.label, sourceUrl: SRC.acccDoor.url }));
    const end = aclTerminationEnd(r.contractDate, st);
    out.push(n(st, {
      id: "acl_info", kind: "acl_info", title: "Your rights under the Australian Consumer Law", wording: "summary", citation: SRC.acccSalesGuide.label, sourceUrl: SRC.acccSalesGuide.url,
      text: r.acl.exemptionClaimed
        ? "This agreement is for emergency repairs after a declared natural disaster. The supplier relies on the emergency-repair exception, which allows work and payment within the 10 business days only for repairs the disaster made necessary to remove a hazard, protect health and safety or prevent substantial damage, by a licensed supplier."
        : `You can cancel within 10 business days from and including the day after you signed or received this agreement (if signed on ${formatAuDate(r.contractDate)}, until the end of ${formatAuDate(end)}). During that period we will not start work, supply goods over $500, or ask for or accept any payment. If you cancel, any money paid is refunded promptly and related agreements (including finance) end. The total price of ${$(input.contractValueIncGst)} includes GST.`,
    }));
    const who = [b.name, b.address, b.abn ? `ABN ${b.abn}` : null, b.email].filter(Boolean).join(", ");
    out.push(n(st, {
      id: "acl_termination_form", kind: "acl_termination_form", title: "Termination notice form", form: true, wording: "summary", citation: SRC.acccSalesGuide.label, sourceUrl: SRC.acccSalesGuide.url,
      text: `To: ${who || "[supplier name and business address]"}. I/We give notice that I/we terminate the agreement for roofing work made on ${formatAuDate(r.contractDate)}. Name: ______________________ Address: ______________________ Signature: ______________________ Date: ____________`,
    }));
  }
  return out;
}

/** Things the business must still add that we can't generate (shown to staff, never printed). */
export function stateNoticeGaps(input: StateNoticeInput): string[] {
  const st = asAuState(input.state);
  if (!st) return ["Set the job's state to generate the state notices."];
  const r = rulesFor(st, { ...input, contractDate: input.contractDate ?? new Date() });
  const gaps: string[] = [];
  if (r.licence.required !== false && !input.business?.licenceNumber) gaps.push(`Add your ${st} licence number in Settings → Company.`);
  if (r.coolingOff.applies && st === "VIC" && !r.coolingOff.noticeText) gaps.push("From 31 Mar 2027 use the cooling-off notice in the form approved by the Building and Plumbing Commission (wording not captured yet).");
  if (st === "SA" && r.coolingOff.applies) gaps.push("Give the owner the full Form 1 (official PDF) with their copy of the contract, in at least 10 pt Times New Roman.");
  if (st === "WA" && r.writtenContract.required === true) gaps.push("Give the owner the prescribed Notice for the Home Owner (HBC Regs Sch 1) verbatim before they sign.");
  if (st === "ACT" && r.licence.required !== false && !input.business?.acn) gaps.push("Companies: add your ACN — ACT ads, quotes and sample contracts must show it.");
  return gaps;
}

/** Print-friendly notice blocks for quotes / contracts. */
export function StateNotices({ notices, className }: { notices: StateNotice[]; className?: string }) {
  if (!notices.length) return null;
  const st = asAuState(notices[0].state);
  return (
    <section data-state-notices className={cx("space-y-3 text-sm text-slate-800", className)} aria-label="Legal notices">
      {notices.map((x) => (
        <Fragment key={x.id}>
          <div data-notice={x.id} className={cx("rounded-xl p-4 ring-1", x.conspicuous ? "bg-amber-50 ring-amber-300" : "bg-white ring-slate-200", x.form && "border-t-2 border-dashed border-slate-400")}>
            <h3 className={cx("font-bold text-ink", x.conspicuous ? "text-base" : "text-sm")}>{x.title}</h3>
            <p className={cx("mt-1 whitespace-pre-line", x.conspicuous && "font-semibold")}>{x.text}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              {x.wording === "verbatim" ? "Wording from: " : "Summary based on: "}
              <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="underline">{x.citation}</a>
            </p>
          </div>
        </Fragment>
      ))}
      <p className="text-[11px] text-slate-500">{st ? `${AU_STATE_NAME[st]} rules verified ${formatAuDate(VERIFIED_ON)}. ` : ""}{DISCLAIMER}</p>
    </section>
  );
}
