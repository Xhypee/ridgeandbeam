# VERIFIED RULES — National (Commonwealth law, the ACL, and model WHS laws)

> Round 2 verification, checked 2026-11-06. **Round 3 follow-up (same day, 2026-11-06)**: newly allowed hosts re-tried; RBA, General Insurance Code, WorkSafe VIC and SafeWork SA items updated below. Statuses: **VERIFIED** (confirmed on a primary page; short quote given), **CORRECTED** (round 1 was wrong or incomplete; the old value is stated), **UNVERIFIED** (no primary source could be reached; the reason is given).
> Scope: national rules that apply in every state and territory, plus the places where states depart from the model WHS Regulations.

## Access log (2026-11-06)

| Host | Result | How used |
|---|---|---|
| www.accc.gov.au | Reachable with curl through the session proxy. The WebFetch tool failed on DNS. One path (`/publications/advertising-selling/...`) returned 403. | Primary source for the ACL (UCA, pricing, surcharges) |
| www.consumer.vic.gov.au | Reachable | State ACL regulator. Used for the UCA and the disaster emergency-repair exemption |
| www.legislation.qld.gov.au | Reachable | QLD WHS Regulation 2011, current as at 29 Mar 2026. It mirrors the model WHS Regs plus QLD additions |
| www.legislation.sa.gov.au | Reachable | SA WHS Regulations 2012, version 1.7.2026 and the historical version |
| www.legislation.wa.gov.au | Reachable | WA WHS (General) Regulations 2022, as at 1 Jul 2026 |
| www.legislation.act.gov.au | Reachable | ACT approval instruments, which attach the Safe Work Australia model codes of practice |
| www.legislation.vic.gov.au | The page loads but the text is served from content.legislation.vic.gov.au, which is **blocked** (403) | VIC OHS Regs text not read |
| www.ato.gov.au, www.rba.gov.au, www.legislation.gov.au, www.afca.org.au, insurancecouncil.com.au, business.gov.au, asic.gov.au, all state WHS regulators | Round 2: **blocked** (proxy CONNECT 403) | Round 2 used search-engine snippets only as UNVERIFIED corroboration |
| **Round 3 (2026-11-06)** www.rba.gov.au | **Reachable** with plain curl | Primary source for section 4 |
| **Round 3** insurancecouncil.com.au | **Reachable** | Code of Practice page, Code PDF, cash settlement fact sheet, 22 Oct 2026 release (section 6) |
| **Round 3** www.worksafe.vic.gov.au | **Reachable** (HTML pages). Its PDFs are served from content-v2.api.worksafe.vic.gov.au, which is **blocked** (proxy CONNECT 403) | VIC falls and asbestos rows (5.15–5.19). Compliance code PDFs not read |
| **Round 3** www.safework.sa.gov.au | **Reachable** | Corroborates the SA 2 m change (5.5) |
| **Round 3** www.ato.gov.au | Proxy now allows the tunnel, but the ATO's Akamai edge returns **"Access Denied" (HTTP 403)** to every path tried (home page, robots.txt, tax-invoices, TPAR, legal database). Not bypassed (no header spoofing) | Section 3 stays UNVERIFIED |
| **Round 3** www.afca.org.au | Cloudflare **"Sorry, you have been blocked" (HTTP 403)** on every path (including /media/2104/download). Not bypassed | AFCA basics taken from the Code's AFCA clauses (6.15) |
| **Round 3** www.worksafe.qld.gov.au, www.worksafe.act.gov.au | Cloudflare **"Just a moment…" JavaScript challenge (HTTP 403)**. Not bypassed | QLD rule stays verified from the QLD regulation text (5.6); ACT not used |
| www.safeworkaustralia.gov.au | The tunnel opens, then the server resets (HTTP/2 INTERNAL_ERROR or timeout). Treated as **blocked** and not bypassed | Model WHS content was checked through the state legislation mirrors instead |
| legislation.nsw.gov.au | 403 | Not used |

Consequence: the text of the ACL statute itself (CCA Sch 2) could not be fetched. ACL items below were verified against **ACCC and Consumer Affairs Victoria guidance**. These are primary regulator sources, but they are not the statute. ACL section numbers are as cited by the ACCC guide.

---

## 1. ACL unsolicited consumer agreements (UCA): door-knocking and cold calls

Sources:
- [A] ACCC, *Telemarketing and door-to-door sales* (business page): https://www.accc.gov.au/business/selling-products-and-services/telemarketing-and-door-to-door-sales. Checked 2026-11-06. The page notes an ACCC review published 28 July 2026.
- [B] ACCC, *Sales practices: A guide for businesses and legal practitioners* (Nov 2022): https://www.accc.gov.au/system/files/sales-practices-guide-businesses-legal-practitioners.pdf. Checked 2026-11-06.
- [C] Consumer Affairs Victoria, *Door-to-door sales* (last updated 7 Apr 2025): https://www.consumer.vic.gov.au/consumers-and-businesses/products-and-services/business-practices/door-to-door-sales-and-telemarketing/door-to-door-sales. Checked 2026-11-06.
- [D] Consumer Affairs Victoria, *Clean up, repairs and re-building* (last updated 8 Jan 2026): https://www.consumer.vic.gov.au/resources-and-tools/advice-in-a-disaster/clean-up-repairs-and-re-building. Checked 2026-11-06.

| # | Rule | Value | Quote | Src | Status |
|---|---|---|---|---|---|
| 1.1 | Legal basis | ACL ss 69–95 and 170–187 (CCA 2010 Sch 2), applied in every state and territory | "ACL reference: sections 69–95, 170–187" | B | VERIFIED (statute text itself not reachable) |
| 1.2 | Definition | The supplier approaches the consumer uninvited, away from the supplier's premises (door, phone or public place), and an agreement results | "telephones or approaches a consumer at a location other than the supplier's premises … without invitation from that consumer" | B | VERIFIED |
| 1.3 | $100 threshold | The UCA rules apply if the total value is **more than $100, or the value could not be established** when the agreement was made | "the total value of the goods or services is more than $100, or the value was not established when the agreement was made" / "Rules don't apply to agreements where the total value is less than $100" | B, A, C | VERIFIED |
| 1.4 | Quote visits (key for roofers) | An invitation to quote is **not** an invitation to sell. If the roofer negotiates or signs the sale at the quote visit, it is a UCA. If the roofer leaves the quote and the consumer later comes back to accept it, it is not a UCA. **The supplier carries the burden of proof** | "A consumer who has invited a supplier to provide a quote … is not soliciting the supplier to actually sell them those goods or services. If the supplier does negotiate a sale at the time the quote is provided, this would be an unsolicited consumer agreement." / "it is up to the supplier to prove that the consumer solicited the agreement" | B | VERIFIED (new; not in round 1) |
| 1.5 | Returned missed calls and other-purpose leads | Still a UCA when the consumer returns a missed call from the supplier, or when contact details given for one purpose (such as a competition) are used to sell something else | "a consumer returns a missed call from a supplier…" | A, B | VERIFIED |
| 1.6 | Door-to-door hours (ACL default) | Mon–Fri 9am–6pm; Sat 9am–5pm; no Sundays or public holidays | "weekdays between 9 am and 6 pm / Saturdays between 9 am and 5 pm. They must not visit on Sundays or public holidays." | A, B, C | VERIFIED |
| 1.7 | Telemarketing hours | Mon–Fri 9am–8pm; Sat 9am–5pm; no Sundays or public holidays. These come from the Telecommunications Act telemarketing standard, not the ACL | "before 9am or after 8pm on a weekday … before 9am or after 5pm on a Saturday" | A, B | VERIFIED |
| 1.8 | Hours vary by state | The ACCC says some states and territories set different hours. They were not checked per state in this round | "Some states and territories have different hours" | B | VERIFIED (that variation exists); per-state hours UNVERIFIED |
| 1.9 | Appointment exception (hours only) | A visit outside the permitted hours is allowed if an appointment was made beforehand with the consumer's consent, **by telephone or in writing, not in person** | "A salesperson can visit at any time if an appointment was made beforehand … it cannot be made in person." | B, C | VERIFIED |
| 1.10 | On-the-doorstep disclosure | Before the pitch, the salesperson must state the purpose of the visit, show ID (their name and the supplier's name and address, not a PO box), and say they will leave on request. If asked to leave, they must leave at once, and the business must not contact the consumer again for 30 days | "Before giving a sales pitch, a salesperson … must clearly inform the consumer of the purpose of the visit…" (ACL s 74) / "the business cannot contact the consumer again for the next 30 days" | A, B, C | VERIFIED |
| 1.11 | "Do not knock" sign | It must be treated as a request to leave | "Salespeople must treat that sign the same as a specific request from a consumer to leave." | A | VERIFIED |
| 1.12 | Agreement document | Written, printed (handwritten changes are allowed if both parties sign them), in plain language. The front page must be signed and dated by the consumer. In person, a copy is given immediately after signing; by phone, within 5 business days | "If negotiated in person, the copy must be given to the consumer immediately after it is signed." | A, B, C | VERIFIED |
| 1.13 | Required contents | Full terms; the total price (including GST) or how it will be calculated; postal or delivery charges; the cooling-off and termination rights; the supplier's name, business address (not a PO box), ABN or ACN, and email and fax if any; the salesperson's name and address if they sign on the supplier's behalf; and an attached **termination notice form** | "total cost (including any GST), or details of how the cost will be calculated … Australian Business Number or Australian Company Number … cooling-off information" | A, B, C | VERIFIED |
| 1.14 | **Prescribed front-page notice** | See the exact text below this table | ACCC and CAV give identical wording | A, B, C | VERIFIED |
| 1.15 | Termination (cooling-off) period | **10 business days.** In person it starts on the first business day after the agreement is made; by phone, on the first business day after the consumer receives the document. A business day is Mon–Fri excluding public holidays | "For other agreements, the cooling-off period begins on the first business day after the agreement was made." | B, C | VERIFIED |
| 1.16 | No supply and no payment in the period | During the 10 business days the supplier must not supply services, must not supply goods over $500, and must not accept or require **any** payment (ACL s 86). Exceptions: electricity and gas, plus emergency repairs (see 1.19) | "a supplier must not: supply any goods priced over $500 … supply services relating to the agreement … accept or require any form of payment" | A, B, C | VERIFIED |
| 1.17 | Extended to 3 months | If the salesperson visited outside the permitted hours, did not disclose the purpose of the visit or their ID, or did not leave on request | "A consumer may also terminate an agreement up to three months after it was made…" | A, B, C | VERIFIED |
| 1.18 | Extended to 6 months | If cooling-off information was not given, the document or form was missing or defective, goods over $500 or any services were supplied in the period, or any payment was accepted or requested in the period | "The termination period is extended to six months if…" | B, C | VERIFIED. Round 1's "3 vs 6 months conflict" is resolved: both apply, to different breaches |
| 1.19 | **Disaster emergency-repair exemption** | After a natural disaster, a business may supply and take payment within the 10 days without giving the cooling-off notice, **only if** all of these hold: (a) a state of emergency is declared for the area and the contract covers only repairs the disaster made necessary; (b) the supplier holds the relevant state, territory or national licence for the work; (c) the repairs only rectify a hazard, protect health and safety, or prevent substantial damage. **The visiting-hours rules still apply** | "a state of emergency has been declared for your area and the contract is only for repairs required by the disaster … the supplier doing the work has a relevant state, territory or national licence … does not have to give or notify the consumer of the 10-business-day cooling off period … can provide the goods or services under the contract and accept payment within 10 business days." | D (CAV); ACCC [A] lists "emergency repairs" as an exception | VERIFIED (regulator guidance). Statutory basis: a legislation.gov.au search result shows a Competition and Consumer Regulations 2010 provision on "emergency repair contracts" (reg 88), but the text was **not fetched** (host blocked), so the regulation number is UNVERIFIED |
| 1.20 | Waiver or contracting out | Void. It is also unlawful to persuade, or try to persuade, a consumer to waive their rights | ACL ss 89, 90 | B, C | VERIFIED |
| 1.21 | After termination | The agreement and any related contract, including finance, are void. Money must be refunded promptly. The supplier must not sue to recover or list the consumer as a defaulter | "A supplier must promptly return or refund any money paid" | B | VERIFIED |
| 1.22 | Liability | The supplier cannot enforce the agreement if its salesperson breached the rules, and both may be liable. Using third-party lead generators does not change this (per the ACCC June 2025 consultation paper; not re-read in round 2) | "A supplier cannot enforce an unsolicited consumer agreement if the supplier or the supplier's dealer … has breached the law" | B | VERIFIED (enforceability); lead-generator point UNVERIFIED this round |
| 1.23 | Reform watch | The ACCC review of unsolicited selling and lead generation was published 28 July 2026. It advocates changes, but no change in the law was found | "The ACCC has undertaken a review, published in July 2026, which … advocates for proposed changes" | A | VERIFIED (review exists); outcome pending |

**Prescribed front-page text (exact):**

> **Important Notice to the Consumer**
> You have a right to cancel this agreement within 10 business days from and including the day after you signed or received this agreement.
> Details about your additional rights to cancel this agreement are set out in the information attached to this agreement.

**Application to roofers door-knocking after storms (derived):**
- A storm-chasing door-knock that ends in a signed job over $100 is a UCA in every jurisdiction, unless every condition of the emergency-repair exemption in row 1.19 is met. Those conditions are: a declared state of emergency, disaster-caused repairs only, the roofer is licensed, and the work is limited to hazard, safety or damage prevention (make-safe and tarping fit; a full re-roof upgrade probably does not).
- Without the exemption the software must: block deposits, progress claims and scheduling for 10 business days counted from the day after signing, and skip public holidays (a per-state public holiday calendar is needed); print the front-page notice and attach the termination form; capture the ABN, business address and the salesperson's details; log visit times and refuse to record visits outside 9–6 weekdays or 9–5 Saturday without a prior phone or written appointment.
- Run the state building-contract cooling-off at the same time, and apply whichever restriction is stricter.
- A "quote requested" lead does not protect the roofer if the contract is signed at the quote visit. Default to UCA handling whenever the contract is signed on the visit where the quote was given.

---

## 2. ACL single (total) price and GST-inclusive quoting

Sources:
- [E] ACCC, *Price displays*: https://www.accc.gov.au/consumers/pricing/price-displays. Checked 2026-11-06.
- [A] (above), for UCA price contents.

| # | Rule | Quote | Status |
|---|---|---|---|
| 2.1 | The total price must be shown as a single figure: the minimum total cost, including taxes (GST), duties and any unavoidable or pre-selected fees, and any surcharge that applies every day | "Businesses must display the total price of a product or service as a single figure. This price must be the minimum total cost … including any taxes, duties and unavoidable or pre-selected extra fees." | VERIFIED |
| 2.2 | It applies however the price is communicated, including verbally | "in-store labels or signage, online notifications, ordering apps, or verbally" | VERIFIED |
| 2.3 | If a component price is shown (for example a per-m² rate, or "labour only"), the total must be at least as prominent | "the total price must be at least as prominent as the partial price" | VERIFIED |
| 2.4 | Optional extras the business has not pre-selected may be excluded, and so may charges that cannot be quantified when the price is stated. Once they can be calculated, the full total must be given | "The total price does not need to include extra charges that can't be quantified…" | VERIFIED |
| 2.5 | GST may be excluded only when the prices are shown only to other businesses | "If a business is displaying prices only to other businesses, it doesn't need to include GST in the total price." | VERIFIED |
| 2.6 | Payment-method discounts (cash, PayID) are allowed. The full price must be shown, and the discounted price must not be more prominent | "Businesses should not: make the discounted price more prominent than the full price; display only the discounted price." | VERIFIED. This answers round 1's open question: cash or PayID discounts are permitted |
| 2.7 | The statutory section (ACL s 48) was not checked: the statute host is blocked | — | UNVERIFIED (section number only) |

Software: consumer quotes, ads and price lists default to a GST-inclusive total as the most prominent figure. Ex-GST pricing is allowed only on B2B-flagged documents. Rate-card or per-m² figures always print next to an equally prominent total.

---

## 3. ATO: tax invoices, ABN, TPAR (all **UNVERIFIED**, because ato.gov.au refuses automated requests)

Round 3 (2026-11-06): the session proxy now opens the tunnel to www.ato.gov.au, but the ATO's own Akamai edge answers every request with an "Access Denied" page (HTTP 403), including the home page and robots.txt. This is the site's bot protection, so it was not bypassed. Round 2: the ATO host returned a proxy 403. The values below come from **search-engine snippets of ato.gov.au pages** only. They match round 1 but are not primary-verified.

| # | Claim | Snippet source (not fetched) | Status |
|---|---|---|---|
| 3.1 | No tax invoice is required for a sale of $82.50 or less (GST-inclusive). If a customer asks, one must be given within 28 days | https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices | UNVERIFIED |
| 3.2 | For sales under $1,000 the invoice must show: that it is intended as a tax invoice; the seller's identity; the seller's ABN; the issue date; a brief description with quantity and price; the GST amount (or "total price includes GST"); and the extent to which each sale is taxable | same | UNVERIFIED |
| 3.3 | For $1,000 or more, it must also show the buyer's identity or ABN | same | UNVERIFIED |
| 3.4 | TPAR: a business primarily in building and construction that pays contractors for building and construction services (and has an ABN) must lodge by **28 August** each year. Private or domestic projects (for example a homeowner's own house) are excluded. Paper lodgment is no longer accepted after 28 Aug 2025 | https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/taxable-payments-annual-report | UNVERIFIED |
| 3.5 | GST registration threshold of $75,000 | not checked this round | UNVERIFIED |
| 3.6 | ABN on UCA agreements: **VERIFIED** separately. A UCA document must show the supplier's ABN or ACN (ACCC [A], [B]). An ABN (or ACN) on UCA paperwork is therefore a primary-verified requirement even though the ATO pages are not | ACCC | VERIFIED |

Action: re-verify 3.1–3.5 on ato.gov.au by a human in a browser, or from a source the ATO publishes elsewhere (for example the GST Act / A New Tax System (GST) Regulations on legislation.gov.au, still blocked here). Items also still to check there: the 28-day issue rule for invoices requested by the buyer; the rules for sellers **not** registered for GST (they must not issue tax invoices or charge GST); the ABN withholding rule (49% withheld if a supplier gives no ABN); TPAR exclusions (payments for materials only, PAYG-withheld payments, and private or domestic projects).

---

## 4. Card surcharging (RBA reforms 2026)

Round 3 (2026-11-06): rba.gov.au is now reachable with curl and was read directly. The ACCC page remains the source for how the ACL applies.
- [F] ACCC, *Card surcharges*: https://www.accc.gov.au/business/pricing/card-surcharges. Checked 2026-11-06.
- [F2] RBA Media Release 2026-10, *Review of Merchant Card Payment Costs and Surcharging – Conclusions Paper* (31 Mar 2026): https://www.rba.gov.au/media-releases/2026/mr-26-10.html. Checked 2026-11-06.
- [F3] RBA, *Frequently Asked Questions – Removal of Card Payment Surcharges From 1 October 2026*: https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/faqs/. Checked 2026-11-06.

| # | Rule | Quote | Status |
|---|---|---|---|
| 4.1 | From **1 October 2026** a business may not surcharge Visa, Mastercard or eftpos credit, debit or prepaid cards (including internationally issued cards of those networks). American Express, UnionPay and PayPal have also removed surcharging | ACCC: "From 1 October 2026, businesses can no longer add a surcharge for payments made using Visa, Mastercard, American Express and eftpos cards." RBA [F3]: "eftpos, Mastercard and Visa announced that they would introduce 'no-surcharge' rules from this date – these will generally apply on all credit, debit and prepaid cards of these networks, including internationally issued cards." | VERIFIED (ACCC and RBA) |
| 4.2 | Mechanism: the RBA Payments System Board's final decision was published 31 Mar 2026. The RBA removed its prohibition on "no-surcharge" rules from 1 Oct 2026; the three designated networks (eftpos, Mastercard, Visa) then adopted no-surcharge rules. Amex, UnionPay and PayPal are not formally RBA-regulated but chose to remove surcharging too. The RBA does not regulate merchants directly; networks and payment providers enforce | RBA [F3]: "To implement this, the RBA has removed its prohibition on 'no-surcharge' rules with effect on and from that date." / "American Express, UnionPay and PayPal have also decided to remove surcharging. These firms are not currently subject to formal regulation by the RBA." / "The RBA does not directly regulate merchants." | VERIFIED. **CORRECTED** the round 1 conflict ("Merchantrates says Amex excluded"): Amex is included |
| 4.3 | Renaming a card surcharge as a "service fee" may be misleading conduct. Genuine fees that apply whatever the payment method (weekend, public holiday, booking or service fees) are outside the card change | ACCC: "Businesses shouldn't try to avoid the 'no surcharge' rules … by describing a card payment surcharge as another type of fee". RBA [F3]: "The changes only apply to surcharges added because a customer pays by card. They do not apply to weekend surcharges, public holiday surcharges, or booking fees or service fees." | VERIFIED |
| 4.4 | Card costs may be built into prices, but the business must not mislead about the reason for an increase. Payment-method discounts remain allowed | ACCC: "they must not mislead consumers about prices, including about the reasons for any price increases". RBA [F3]: "Yes. Businesses can continue to offer discounts for particular payment methods." | VERIFIED |
| 4.5 | The old cost-of-acceptance cap ended on 1 Oct 2026 | ACCC: "These rules ended on 1 October 2026." | VERIFIED |
| 4.6 | **UnionPay and PayPal**: both removed surcharging from 1 Oct 2026 | RBA [F3] table: "PayPal … Yes … No"; "UnionPay … Yes … No" (surcharging permitted before / from 1 October 2026) | VERIFIED (new; previously UNVERIFIED) |
| 4.7 | **B2B card payments are not exempt** unless a network's rules or a law provides an exemption | RBA [F3]: "Card payments between businesses are not exempt from the removal of surcharging unless a card network's rules provide an exemption or an exemption is provided by law or regulation." | VERIFIED (new) |
| 4.8 | **Invoices issued before 1 Oct 2026 but paid by card on or after it** cannot rely on the old surcharge | RBA [F3]: "If a card payment is made on or after 1 October 2026, surcharging may no longer be available even if the invoice was issued earlier." | VERIFIED (new) |
| 4.9 | Non-card methods (e.g. bank transfer, PayID): not regulated by the RBA; ACCC pricing-display guidance applies | RBA [F3]: "The RBA does not currently regulate surcharges on non-card payment methods." | VERIFIED (new) |
| 4.10 | Later stages: 30 Oct 2026 fee publication by networks and large acquirers; 30 Jan 2027 pass-through reporting; **1 Apr 2027** interchange caps on foreign-issued cards and more detailed merchant statements | RBA [F3]: "1 April 2027: Interchange fee caps will apply to foreign-issued card transactions acquired in Australia." / [F2] "The introduction of an interchange cap on foreign cards and some changes to payment cost transparency will come into effect later, on 1 April 2027" | VERIFIED (previously UNVERIFIED) |

Software: from 1 Oct 2026, turn off card-surcharge line items for **all** card types (Visa, Mastercard, eftpos, Amex, UnionPay, PayPal), including on B2B invoices and on invoices issued before 1 Oct 2026 but paid later. Allow a payment-method discount (for example a PayID discount) shown next to the full price.

---

## 5. WHS: model WHS Regulations, as mirrored in QLD, SA and WA

The Safe Work Australia site was unreachable. The model provisions were verified in the state regulations that adopt them word for word: QLD WHS Regulation 2011 (current as at 29 Mar 2026), SA WHS Regulations 2012 (version 1.7.2026) and WA WHS (General) Regulations 2022 (as at 1 Jul 2026). The model codes of practice were verified through the ACT approval instruments, which attach the Safe Work Australia model codes.

- [G] QLD WHS Regulation 2011: https://www.legislation.qld.gov.au/view/pdf/inforce/current/sl-2011-0240
- [H] SA WHS Regulations 2012, current: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/work-health-and-safety-regulations-2012/current/2012.268.auth.pdf. Historical (1.7.2025–30.6.2026): .../2026.06.30/2012.268.auth.pdf
- [I] WA WHS (General) Regulations 2022 (PCO 01-c0-00): https://www.legislation.wa.gov.au/legislation/prod/filestore.nsf/FileURL/mrdoc_49725.pdf/$FILE/Work%20Health%20and%20Safety%20(General)%20Regulations%202022%20-%20%5B01-c0-00%5D.pdf?OpenElement
- [J] ACT NI2020-553, falls code approval: https://www.legislation.act.gov.au/DownloadFile/ni/2020-553/current/PDF/2020-553.PDF
- [K] ACT NI2022-690, How to Safely Remove Asbestos code approval: https://www.legislation.act.gov.au/DownloadFile/ni/2022-690/current/PDF/2022-690.PDF
- [L] ACT NI2025-446 (Construction Work code, commenced 5 Nov 2025) and NI2022-691 (How to Manage and Control Asbestos in the Workplace)

| # | Rule | Value | Quote | Src | Status |
|---|---|---|---|---|---|
| 5.1 | High-risk construction work (HRCW): falls | Construction work that "involves a risk of a person falling more than 2m" (reg 291(a)). Asbestos disturbance is also HRCW (reg 291(d)) | "(a) involves a risk of a person falling more than 2m … (d) involves, or is likely to involve, the disturbance of asbestos" | G, H, I | VERIFIED |
| 5.2 | SWMS | Before HRCW starts, the PCBU must ensure a SWMS is prepared that identifies the HRCW, states the hazards and risks, and describes the controls and how they will be implemented, monitored and reviewed (reg 299). The work must then follow it (reg 300) | "must, before high risk construction work commences, ensure that a safe work method statement for the proposed work— (a) is prepared…" | G, I | VERIFIED |
| 5.3 | SWMS that relies only on admin or PPE controls for falls over 2 m | QLD reg 299(4): if the SWMS for falls over 2 m relies only on administrative controls or PPE, it must describe every control considered, addressing the reg 79(3) hierarchy. **Not present in the WA text**. The model text was not checked | "must describe all control measures considered…" | G | VERIFIED (QLD only) |
| 5.4 | Fall hierarchy (reg 78–80) | Work on the ground or a solid construction where reasonably practicable. Otherwise use a fall prevention device (secure fence, edge protection, working platforms, covers); then a work positioning system; then a fall arrest system. Fall arrest requires emergency and rescue procedures (reg 80) | "providing a fall prevention device if it is reasonably practicable … a work positioning system … a fall arrest system" | G, I | VERIFIED |
| 5.5 | **SA moved from 3 m to 2 m on 1 Jul 2026** | Reg 291 was amended by 112/2025 r 3, effective 1.7.2026. The historical version said "more than 3 metres" | current: "falling more than 2 metres"; historical 1.7.2025–30.6.2026: "falling more than 3 metres". SafeWork SA, *Working at heights* (https://www.safework.sa.gov.au/industry/construction/working-at-heights, checked 2026-11-06): "From July 2026, a SWMS will be required for construction work that involves a risk of a person falling more than 2 metres." | H; SafeWork SA | VERIFIED (regulation text and regulator). Note: some SafeWork SA pages (e.g. *Guardrail systems for roof work*) still say "greater than 3 metres"; the regulation governs |
| 5.6 | **QLD housing-construction fall rules** (in addition to the model) | QLD ss 306B–306D. For "housing construction work" (erecting, constructing, extending or structurally altering a detached house, terrace or townhouse, or an ancillary garage, carport or shed), mandatory prevention or arrest controls apply where the fall is **at least 3 m**. For other construction work the trigger is **2 m**. **Any roof with a slope over 26°** triggers the s 306D controls whatever the height. Below those triggers (s 306C), hazards must be identified and assessed and controls used before work starts. The example given is "a brittle roof on which the work is to be done 2m above a floor" | "construction work on a roof, or partly completed roof, surface with a slope over 26º" | G | VERIFIED (regulation text, round 2). Round 3: WorkSafe QLD guidance (www.worksafe.qld.gov.au) could not be read (Cloudflare JavaScript challenge, not bypassed), so the regulator's own explanation was not cross-checked. Note: the SWMS trigger in QLD is still the 2 m in reg 291. Whether a re-roof counts as "structurally alter" was not determined |
| 5.7 | WA: SWMS for 2–3 m work must explain why fall prevention was not used; slope over 26° treated as higher risk; "reg 79 applies to HRCW from 1 Oct 2026" (round 1, from WorkSafe WA guidance) | The WA regulation text as at 1 Jul 2026 has the plain model reg 79 and reg 299, with no 26° rule and no pending amendment in the compilation table | — | I | UNVERIFIED (WorkSafe WA blocked; not visible in the regulations) |
| 5.8 | Asbestos: Class B licence | Removing **more than 10 m²** of non-friable asbestos or ACM (or the associated dust or debris) needs a Class B or Class A licence (reg 487) | "more than 10m2 of non-friable asbestos or ACM" | G, I | VERIFIED |
| 5.9 | Asbestos: Class A licence | Removing **any** friable asbestos, or asbestos-contaminated dust and debris other than the minor or non-friable-associated kinds, needs a Class A licence (regs 485–486) | "friable asbestos; or … asbestos-contaminated dust or debris (ACD)" | G | VERIFIED |
| 5.10 | 10 m² or less of non-friable | No licence is needed, but a competent person trained under reg 445 must do the work (reg 458(2)–(3)) | "10m2 or less of non-friable asbestos … must ensure that the work is carried out by a competent person who has been trained under section 445" | G | VERIFIED |
| 5.11 | Regulator notification | The licensed removalist gives written notice **at least 5 days** before licensed removal starts (reg 466(1)). For a sudden or unexpected event: notify immediately by phone and in writing within 24 hours (reg 466(2)–(3)). The notice must include the ABN, licence number, client, address, dates, friable or non-friable, quantity and workers' competencies (reg 466(4)) | "must give written notice to the regulator at least 5 days before the removalist commences licensed asbestos removal work" | G, I | VERIFIED. The regulation says "5 days", not business days. Round 1's "5 calendar days" for NSW is consistent but the NSW text was not checked |
| 5.12 | **No high-pressure water or compressed air on asbestos or ACM** | Reg 446. Power tools, brooms and similar implements only with enclosure, capture or suppression. **Critical for roof restoration: never pressure-clean an AC roof** | "must not use … high-pressure water spray; compressed air" on asbestos or ACM | G | VERIFIED (new) |
| 5.13 | Codes of practice | *Managing the Risk of Falls at Workplaces* (SWA model code; ACT approval NI2020-553). It cites AS/NZS 4994.2:2009 *Roof edge protection* and AS/NZS 4389:2015 *Roof safety mesh*, and lists fragile surfaces such as "cement sheeting roofs, rusty metal roofs, fibreglass sheeting roofs and skylights". *How to Safely Remove Asbestos* (ACT NI2022-690, from 30 Jan 2023): for AC roof sheeting, "Angle grinders should not be used"; spray PVA before removal; "Do not use chutes, ramps or similar gravity-dependent devices". *How to Manage and Control Asbestos in the Workplace* (ACT NI2022-691). *Construction Work* code (ACT NI2025-446, from 5 Nov 2025) | quotes as given | J, K, L | VERIFIED (as approved in the ACT). Current SWA edition dates and adoption in each other state UNVERIFIED (SWA blocked) |
| 5.14 | Jurisdictions that differ | **VIC**: Occupational Health and Safety Act 2004 and OHS Regulations 2017, not the WHS laws; regulation text not readable (content host blocked). **WA**: WHS Act 2020 and WHS (General) Regulations 2022; the HRCW, SWMS and asbestos provisions verified above match the model. **QLD**: the model regulations plus extra housing-construction fall rules (5.6). **SA**: on 2 m since 1 Jul 2026. NSW, TAS, ACT, NT and Commonwealth: model WHS laws (not individually verified this round) | — | G, H, I | VERIFIED for QLD, SA and WA. VIC: see 5.15–5.19 (round 3, WorkSafe VIC). VIC reg 49 rescue requirement still UNVERIFIED |
| 5.15 | **VIC: falls threshold** | Part 3.3 of the OHS Regulations 2017 applies where there is a risk of a fall of **more than 2 m**. A SWMS is required before HRCW, which includes construction work "where there is a risk of a person falling more than 2 m" (VIC has the same 19 HRCW categories, including asbestos removal or likely disturbance) | "Part 3.3 of the Occupational Health and Safety Regulations 2017 (OHS Regulations) applies when there is a risk of a fall of more than 2 metres." / "HRCW involves construction work: where there is a risk of a person falling more than 2 m" | WorkSafe VIC: https://www.worksafe.vic.gov.au/preventing-slips-trips-and-falls-under-2-metres ; https://www.worksafe.vic.gov.au/safe-work-method-statements-swms (checked 2026-11-06) | VERIFIED (regulator; regulation text itself still not read) |
| 5.16 | **VIC: fall hierarchy** | Regulation 44 sets the fall-control hierarchy. WorkSafe's compliance codes set it out as five levels: (1) eliminate; (2) passive fall prevention devices; (3) work positioning systems; (4) fall arrest systems; (5) administrative controls and fixed or portable ladders. WorkSafe says PPE is **not** a fall-risk control and does not include harness systems. Emergency procedures must be established | "Refer to the hierarchy of control and Regulation 44 to help control risks from falls." / "level 2 controls: passive fall prevention devices … level 5 controls: administrative controls and fixed or portable ladders" / "PPE is not a fall risk control measure and does not include safety harness systems" / "establish emergency procedures" | WorkSafe VIC SWMS page; *Compliance code: Prevention of falls in housing construction – Key changes*: https://www.worksafe.vic.gov.au/compliance-code-prevention-falls-housing-construction-key-changes (checked 2026-11-06) | VERIFIED (regulator). The rescue regulation number (reg 49) is UNVERIFIED |
| 5.17 | **VIC: compliance codes for falls** | *Prevention of falls in housing construction* and *Prevention of falls in general construction* (Edition 2, published 19 Dec 2019, under the OHS Act 2004 / OHS Regs 2017). Following a code is deemed compliance with the duty it covers; codes are not mandatory. Roof-work guidance was reduced from 3 m to **2 m** to match the regulations. WorkSafe flags errors in the housing code's timber guardrail tables 3 and 4 and truss figures 17 and 19, and points to separate updated guidance | "If you comply with a code, you are deemed to comply with the Act or Regulation duty covered by the code." / "Information about roof work up to 3m has been reduced to 2m, to align with the 2m height threshold in the regulations." / "The specifications and requirements in table 3 - Timber guardrails and table 4 - Timber guardrail posts of the code is incorrect." | https://www.worksafe.vic.gov.au/resources/compliance-code-prevention-falls-housing-construction ; .../compliance-code-prevention-falls-general-construction (checked 2026-11-06) | VERIFIED (code PDFs on content-v2.api.worksafe.vic.gov.au blocked, so the code text itself was not read) |
| 5.18 | **VIC: asbestos notification (differs from model)** | Licensed removalist notifies WorkSafe for **each job and location**: (a) at least **24 hours** before starting if the total is **10 m² or less of non-friable ACM**; (b) within **24 hours of starting** if the removal results from an unexpected situation (OHS Regs reg 299); (c) at least **five days** before starting in all other cases (friable, or non-friable over 10 m²). The model WHS reg 466 has only the 5-day and emergency rules | "at least 24 hours before starting asbestos removal work if the total area to be removed is 10 square metres or less of non-friable asbestos-containing material" / "within 24 hours of starting asbestos removal work if the asbestos removal work is undertaken as the result of an unexpected situation (see regulation 299 of the Occupational Health and Safety Regulations 2017)" / "at least five days before the asbestos removal work starts in all other cases" | WorkSafe VIC, *Asbestos removal notification*: https://www.worksafe.vic.gov.au/asbestos-removal-notification (checked 2026-11-06) | VERIFIED. **CORRECTED/clarified**: round 1–2 "24 h notice for <=10 m²" is "at least 24 hours *before* starting"; the unexpected-situation notice is "within 24 hours of starting" (model: phone immediately + writing within 24 h) |
| 5.19 | **VIC: unlicensed removal limit (differs from model)** | Unlicensed removal is allowed only for non-friable ACM of **no more than 10 m² AND no more than 1 hour in any 7-day period** per employer or self-employed person (2 people: 30 minutes each; 3 people: 20 minutes each). The model WHS rule (reg 458) has the 10 m² limit but no time limit | "removal of non-friable ACM if the quantity does not exceed 10 square metres and if the time taken for the employer or self-employed person to remove the ACM does not take more than 1 hour in a 7 day period." / "2 people, 30 minutes each / 3 people, 20 minutes each" | WorkSafe VIC, *Understand and manage asbestos in workplaces*: https://www.worksafe.vic.gov.au/understand-and-manage-asbestos-workplaces (checked 2026-11-06) | VERIFIED (new). Roofing impact: replacing a few AC sheets unlicensed in VIC is capped by time as well as area |

---

## 6. General Insurance Code of Practice and AFCA

Round 3 (2026-11-06): insurancecouncil.com.au is reachable with curl and the Code was read in full. **www.afca.org.au returns a Cloudflare "Sorry, you have been blocked" page (HTTP 403) to plain curl**, so AFCA's own pages were not read and the block was not bypassed. AFCA basics below come from the Code's own AFCA clauses.

Sources:
- [M] ICA, *General Insurance Code of Practice* page: https://insurancecouncil.com.au/cop/. Checked 2026-11-06. States: "The current Code of Practice was last updated in October 2023."
- [N] ICA, *General Insurance Code of Practice 2020* (Oct 2023 update, PDF): https://insurancecouncil.com.au/wp-content/uploads/2023/11/2023-COP_UPDATE_October_FINAL.pdf. Checked 2026-11-06.
- [O] ICA, *Cash settlements under a home building policy* fact sheet (Dec 2025): https://insurancecouncil.com.au/wp-content/uploads/2025/12/20251205_CFS_FACTSHEET.pdf. Checked 2026-11-06.
- [P] ICA news release, *Insurers submit enhanced Code of Practice to regulator* (22 Oct 2026): https://insurancecouncil.com.au/resource/insurers-submit-enhanced-code-of-practice-to-regulator/. Checked 2026-11-06.

| # | Rule | Value | Quote | Src | Status |
|---|---|---|---|---|---|
| 6.1 | **Version in force** | The *General Insurance Code of Practice 2020*, in effect from 5 Oct 2021, as updated Oct 2023. It binds only insurers that have adopted it; Part 8 (claims) applies to retail insurance products only | "The current Code of Practice was last updated in October 2023." / "The Code takes effect on 5 October 2021." (cl 7) / "This part applies to Retail Insurance products only." | M, N | VERIFIED |
| 6.2 | **Redrafted Code: not yet in force** | The ICA submitted a redrafted Code to ASIC for approval on **22 Oct 2026**. It will be contractually enforceable and adds automatic acceptance of home and motor claims after 12 months where the delay is within the insurer's control. A transition period is expected after ASIC approval | "The Code will now be considered by ASIC for approval, after which a transition period is anticipated before the Code begins to take effect on new and renewed policies." / "home and motor claims will be automatically accepted after 12 months where no decision has been made due to circumstances within insurers' control." | P, M | VERIFIED. **CORRECTED**: round 2 described an October 2026 "proposed revised Code" draft; the current status is "submitted to ASIC 22 Oct 2026, awaiting approval". Do not code to it yet |
| 6.3 | Initial response | If more information or assessment is needed, within **10 business days** of receiving the claim the insurer tells the customer what information it needs, appoints an assessor or adjuster if needed, and gives an estimated timeframe | "within 10 Business Days of receiving your claim we will: a. tell you any information we need to make a decision on your claim…" (cl 68) | N | VERIFIED (new) |
| 6.4 | **Progress updates** | At least every **20 business days**; routine enquiries answered within **10 business days** | "We will tell you about the progress of your claim at least every 20 Business Days." (cl 70) / "…routine enquiries about your claim's progress within 10 Business Days." (cl 71) | N | VERIFIED (new) |
| 6.5 | Assessor, adjuster or investigator appointed | Customer told within **5 business days** (cl 72–73). External expert asked to report within **12 weeks** (cl 74) | "then within 5 Business Days we will tell you that we have appointed them" / "report to us within 12 weeks of us engaging them" | N | VERIFIED (new) |
| 6.6 | **Decision after all information** | Within **10 business days** once all relevant information is held and enquiries are complete | "Once we have all relevant information and have completed all enquiries, we will decide whether to accept or deny your claim and tell you of our decision within 10 Business Days." (cl 76) | N | VERIFIED |
| 6.7 | **Overall decision cap** | **4 months** from receiving the claim, else the insurer must tell the customer about its complaints process. Exceptions (cl 78): Extraordinary Catastrophe, suspected fraud, customer not responding, communication difficulty beyond the insurer's control, or customer-requested delay; then **12 months** | "Our decision will be made within 4 months of receiving your claim, unless paragraph 78 applies." (cl 77) / "then within 12 months of receiving your claim we will tell you our decision in writing." (cl 78) | N | VERIFIED (12-month exception new) |
| 6.8 | Alternative timetable | If a timeframe is not practical (e.g. complex claim), a reasonable alternative timetable is agreed; otherwise complaint details are given | "we will agree a reasonable alternative timetable with you" (cl 83) | N | VERIFIED (new) |
| 6.9 | Urgent financial need | After an event such as a natural disaster causing urgent financial need: fast-track and/or advance payment within **5 business days** of the need being shown | "pay you an advance amount … within 5 Business Days after you demonstrate your urgent financial need." (cl 64) | N | VERIFIED (new) |
| 6.10 | Denial or part-payment | Written reasons, the right to the information and expert or supplier reports relied on (given within **10 business days** of request, cl 82), and the complaints process | "If we deny your claim, or do not pay it in full, then we will tell you, in writing…" (cl 81) | N | VERIFIED (new) |
| 6.11 | **Insurer-authorised repairers** | If the insurer selected and directly authorised the repairer, the insurer is responsible for the quality of work and materials, and complaints about the repairer go through the insurer's complaints process | "then we will accept responsibility for the quality of their work and the materials they use." (cl 86) | N | VERIFIED (new; relevant to roofers on insurer panels) |
| 6.12 | Catastrophe review | If a catastrophe property claim was finalised within 1 month of the event, the customer may ask for a review within **12 months** of finalisation, even after signing a release | "We will give you 12 months from the date of finalisation of your claim to ask for a review of your claim." (cl 90) | N, M | VERIFIED (new) |
| 6.13 | **Cash settlement (home building)** | The Code (cl 79) requires information on how cash settlements work. The ICA fact sheet states the insurer must provide a **Cash Settlement Fact Sheet** where the policy gives a choice between cash and another form of settlement, showing the options, the total offered with a breakdown, review rights and a suggestion to get independent advice; it must be titled, dated, in writing and easy to understand. Customers may get their own quotes; the insurer says whether a contingency is included; the settlement can be reviewed even after the claim is closed | "If we offer a cash settlement under a home building policy, we will provide you with information to help you understand how they work…" (cl 79) / "the insurer must provide you with a 'Cash Settlement Fact Sheet'. This must show the settlement options, total amount being offered with a breakdown, rights of review, and advise you to consider getting independent advice. It must also be titled, dated, in writing, and easy to understand." / "You have a right to have your cash settlement reviewed, even if your claim has already been closed." | N, O | VERIFIED (ICA sources). The statutory or ASIC instrument behind the fact-sheet obligation was not named in the ICA document and asic.gov.au / legislation.gov.au are blocked: legal basis UNVERIFIED |
| 6.14 | **Complaints (IDR)** | Acknowledge, name a contact, update at least every **10 business days**, decide within **30 calendar days** (or explain the delay in writing and give AFCA details before the deadline). Written response required for declined claims, claim value, hardship, or on request. The process must comply with ASIC's guidelines | "We will make a decision about your Complaint within 30 Calendar Days." (cl 147) / "at least every 10 Business Days" (cl 146) / "Our Complaints process will comply with the Australian Securities and Investments Commission's guidelines." (cl 141) | N | VERIFIED. ASIC RG 271 text itself not read (asic.gov.au blocked) |
| 6.15 | **AFCA basics** | AFCA is the external dispute resolution scheme. The customer may go to AFCA at any time and if the complaint is not resolved within **30 calendar days**; AFCA may refer a complaint back if it has not been through IDR; AFCA decisions bind the insurer as set out in its Rules. Contact: www.afca.org.au, 1800 931 678 | "You can take your Complaint to the Australian Financial Complaints Authority at any time and if we do not resolve your Complaint within 30 Calendar Days after we first received your Complaint." (cl 154) / "…your Complaint may be referred back to us if it has not gone through our Complaints process." (cl 155) / "…decisions are binding on us in the way set out in its Rules." (cl 156) / "www.afca.org.au or by phoning 1800 931 678" | N, O | VERIFIED via the Code and the ICA fact sheet. AFCA's own pages, monetary limits and time limits UNVERIFIED (afca.org.au Cloudflare block) |
| 6.16 | Definitions | Business Days are Mon–Fri excluding public holidays; a Calendar Day is any day | "Business Days are Monday to Friday, excluding public holidays." / "Calendar Day means any day, including weekends and public holidays." | N | VERIFIED |
| 6.17 | AFCA approach document ("timeframes … not, of themselves, conclusive"); make-safe timeframes | Not in the Code text read; AFCA host blocked | — | — | UNVERIFIED. The 2020 Code has no make-safe timeframe |

Software (insurance jobs): track claim-received date and show the insurer's 10-business-day first-response, 20-business-day update, 4-month decision and 30-calendar-day complaint clocks for the homeowner; for cash-settled claims, prompt the roofer that the homeowner can submit independent quotes and ask for a review.

---

## 7. Corrections and additions versus round 1

1. **CORRECTED**: Amex is included in the 1 Oct 2026 surcharge removal (ACCC). Round 1 recorded this as a conflict.
2. **CORRECTED and clarified**: the 3-month and 6-month termination extensions are not a conflict. They apply to different breaches (rows 1.17 and 1.18).
3. **ADDED**: the quote-visit rule. Signing at the quote visit makes it a UCA, and the supplier must prove the consumer solicited the sale.
4. **ADDED**: the conditions of the disaster emergency-repair exemption (declared emergency, licensed supplier, hazard, safety or damage repairs only). The visiting hours still apply.
5. **ADDED**: the appointment exception to the hours. It must be made by phone or in writing, not in person.
6. **ADDED**: reg 446, no high-pressure water or compressed air on asbestos (AC roof cleaning).
7. **VERIFIED**: SA moved from 3 m to 2 m on 1 Jul 2026 (legislative history 112/2025).
8. **ADDED**: QLD's 3 m housing-construction and over-26° roof-slope control triggers, separate from the 2 m SWMS trigger.
9. **ADDED**: payment-method discounts (cash or PayID) are allowed if the full price is shown at least as prominently.
10. Round 2 **still unverified** list: the ATO tax invoice and TPAR rules, RBA details beyond what the ACCC states, the General Insurance Code and AFCA, the VIC OHS Regulations text, the Safe Work Australia site, and the WorkSafe WA 26° / 1 Oct 2026 guidance. Round 3 resolved part of this (items 11–17).
11. **VERIFIED (round 3, RBA)**: surcharge removal from 1 Oct 2026 for eftpos, Mastercard and Visa (designated networks) plus Amex, **UnionPay and PayPal**; applies to B2B card payments and to card payments on invoices issued before 1 Oct 2026; foreign-card interchange caps from 1 Apr 2027.
12. **VERIFIED (round 3, ICA)**: the Code in force is the 2020 Code (effective 5 Oct 2021, updated Oct 2023). Claim clocks: 10 business days to request information, updates every 20 business days, decision 10 business days after all information, 4-month cap (12 months in listed exceptions), complaints decided in 30 calendar days, AFCA available at any time and after 30 calendar days.
13. **CORRECTED (round 3)**: the revised Code is no longer an October 2026 "proposed" draft; it was **submitted to ASIC on 22 Oct 2026** and is not in force pending ASIC approval and a transition period.
14. **ADDED (round 3)**: cash settlement fact sheet contents (options, total with breakdown, review rights, independent advice; titled, dated, written); insurer responsibility for repairers it selects and authorises (cl 86).
15. **VERIFIED (round 3, WorkSafe VIC)**: VIC Part 3.3 falls threshold is more than 2 m; reg 44 hierarchy (five levels); SWMS for falls over 2 m.
16. **CORRECTED/ADDED (round 3, WorkSafe VIC)**: VIC asbestos notice is at least 24 h before starting for 10 m² or less of non-friable (licence holder), within 24 h of starting for unexpected situations, and at least 5 days before otherwise. VIC unlicensed removal is capped at 10 m² **and 1 hour per 7 days**.
17. **STILL UNVERIFIED after round 3**: all ATO items (ATO Akamai edge denies automated requests), AFCA's own pages (Cloudflare block), WorkSafe QLD and WorkSafe ACT guidance (Cloudflare challenge), the cash-settlement-fact-sheet legal instrument, ASIC RG 271, VIC reg 49 rescue, and the VIC compliance code PDFs (content-v2.api.worksafe.vic.gov.au blocked).

---

## 8. Machine-readable national rules

```json
{
  "scope": "NATIONAL",
  "checked": "2026-11-06 (round 2 and round 3 follow-up)",
  "acl_unsolicited_consumer_agreements": {
    "act": "Australian Consumer Law (Competition and Consumer Act 2010 (Cth) Sch 2) ss 69-95, 170-187",
    "regulators": [
      "ACCC",
      "state/territory consumer protection agencies"
    ],
    "applies_if": "uninvited approach (door, phone, public place) away from supplier premises AND total value > 100 AUD or value not determinable",
    "threshold_aud": 100,
    "quote_visit_rule": "invitation to quote is not invitation to sell; agreement negotiated at the quote visit is a UCA; supplier bears onus of proving the consumer solicited",
    "permitted_hours_door": {
      "mon_fri": "09:00-18:00",
      "sat": "09:00-17:00",
      "sun_public_holiday": "prohibited",
      "state_variations_exist": true,
      "appointment_exception": "prior appointment with consent made by phone or in writing (not in person) allows other times"
    },
    "permitted_hours_phone": {
      "mon_fri": "09:00-20:00",
      "sat": "09:00-17:00",
      "sun_public_holiday": "prohibited",
      "basis": "Telecommunications Act 1997 telemarketing standard"
    },
    "doorstep_disclosure": [
      "purpose of visit before pitch",
      "salesperson name + supplier name and address (not PO box)",
      "consumer may ask them to leave",
      "must leave immediately on request; no contact for 30 days",
      "treat 'do not knock' sign as request to leave"
    ],
    "agreement_contents": [
      "full terms",
      "total price incl. GST or how calculated",
      "postal/delivery charges",
      "cooling-off/termination rights",
      "supplier name, business address (not PO box), ABN or ACN, email/fax if any",
      "salesperson details if signing for supplier",
      "termination notice form attached",
      "front page signed and dated by consumer",
      "printed; handwritten changes signed by both"
    ],
    "copy_given": {
      "in_person": "immediately after signing",
      "phone": "within 5 business days"
    },
    "front_page_notice_text": "Important Notice to the Consumer\nYou have a right to cancel this agreement within 10 business days from and including the day after you signed or received this agreement.\nDetails about your additional rights to cancel this agreement are set out in the information attached to this agreement.",
    "termination_period": {
      "length": 10,
      "unit": "business_days",
      "starts": "first business day after agreement made (in person) or after document received (phone)",
      "business_day": "Mon-Fri excluding public holidays"
    },
    "during_period_prohibited": [
      "supply of any services",
      "supply of goods > 500 AUD",
      "accepting or requiring any payment"
    ],
    "during_period_exceptions": [
      "electricity/gas connection supply",
      "goods <= 500 AUD",
      "emergency repair contracts (see below)"
    ],
    "extended_3_months_if": [
      "visit outside permitted hours",
      "purpose not disclosed",
      "ID not given",
      "did not leave on request"
    ],
    "extended_6_months_if": [
      "cooling-off info not given",
      "no/defective written agreement or missing termination form",
      "goods > 500 AUD supplied in period",
      "services supplied in period",
      "payment accepted/requested in period"
    ],
    "emergency_repair_exemption": {
      "conditions_all": [
        "state of emergency declared for the area",
        "contract only for repairs required by the disaster",
        "supplier holds relevant state/territory/national licence",
        "repairs only to rectify hazard, protect health and safety, or prevent substantial damage"
      ],
      "effect": "no requirement to give/notify the 10 business day cooling-off; may supply and accept payment within 10 business days",
      "hours_still_apply": true,
      "statutory_ref": null,
      "source": "https://www.consumer.vic.gov.au/resources-and-tools/advice-in-a-disaster/clean-up-repairs-and-re-building"
    },
    "waiver": "void; inducing waiver unlawful (ss 89-90)",
    "sources": [
      "https://www.accc.gov.au/business/selling-products-and-services/telemarketing-and-door-to-door-sales",
      "https://www.accc.gov.au/system/files/sales-practices-guide-businesses-legal-practitioners.pdf",
      "https://www.consumer.vic.gov.au/consumers-and-businesses/products-and-services/business-practices/door-to-door-sales-and-telemarketing/door-to-door-sales"
    ],
    "status": "VERIFIED (regulator guidance; statute text not fetched)"
  },
  "acl_pricing": {
    "single_total_price": "total price as a single figure = minimum total cost incl. GST, duties, unavoidable and pre-selected fees, and any every-day surcharge",
    "applies_to_verbal_quotes": true,
    "component_price_rule": "total at least as prominent as any part price",
    "gst_exclusive_allowed_only": "prices displayed only to other businesses",
    "payment_method_discount": "allowed; full price must be shown and not be less prominent than discounted price",
    "statutory_ref": null,
    "source": "https://www.accc.gov.au/consumers/pricing/price-displays",
    "status": "VERIFIED"
  },
  "card_surcharging": {
    "ban_from": "2026-10-01",
    "networks": [
      "Visa",
      "Mastercard",
      "eftpos",
      "American Express",
      "UnionPay",
      "PayPal"
    ],
    "designated_rba_networks": [
      "eftpos",
      "Mastercard",
      "Visa"
    ],
    "non_designated_voluntary": [
      "American Express",
      "UnionPay",
      "PayPal"
    ],
    "card_types": [
      "credit",
      "debit",
      "prepaid"
    ],
    "includes_internationally_issued_cards": true,
    "b2b_exempt": false,
    "invoice_issued_before_paid_after": "no surcharge if card payment made on or after 2026-10-01",
    "not_covered": [
      "fees that apply regardless of payment method (weekend, public holiday, booking, service fees)",
      "non-card payment methods (not RBA-regulated; ACCC price display rules apply)"
    ],
    "payment_method_discount_allowed": true,
    "relabelling_as_fee": "may be misleading conduct",
    "decision_date": "2026-03-31",
    "later_stages": {
      "2026-10-30": "networks and large acquirers publish fee information",
      "2027-01-30": "large acquirers publish interchange pass-through",
      "2027-04-01": "interchange caps on foreign-issued cards; more detailed merchant statements"
    },
    "enforced_by": "card networks / payment service providers; RBA does not directly regulate merchants (ACL misleading-price rules by ACCC and states)",
    "sources": [
      "https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/faqs/",
      "https://www.rba.gov.au/media-releases/2026/mr-26-10.html",
      "https://www.accc.gov.au/business/pricing/card-surcharges"
    ],
    "status": "VERIFIED (RBA and ACCC, checked 2026-11-06)"
  },
  "ato": {
    "tax_invoice_not_required_at_or_below_aud_gst_incl": 82.5,
    "provide_on_request_days": 28,
    "buyer_identity_or_abn_from_aud": 1000,
    "fields_under_1000": [
      "intended to be a tax invoice",
      "seller identity",
      "seller ABN",
      "issue date",
      "description, quantity, price",
      "GST amount or 'total price includes GST'",
      "extent each sale is taxable"
    ],
    "tpar": {
      "who": "business primarily in building and construction paying contractors for building and construction services",
      "due": "28 August each year",
      "excludes": "private/domestic projects"
    },
    "abn_on_uca_documents": {
      "required": true,
      "source": "ACCC",
      "status": "VERIFIED"
    },
    "source": "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices",
    "status": "UNVERIFIED (round 3: proxy allows ato.gov.au but the ATO Akamai edge returns Access Denied 403 to automated requests; not bypassed; search snippets only) except abn_on_uca_documents",
    "to_check": [
      "28-day issue on request",
      "rules for sellers not registered for GST",
      "ABN withholding when no ABN quoted",
      "TPAR exclusions (materials-only, PAYG-withheld, private/domestic)",
      "GST registration threshold 75000"
    ]
  },
  "whs": {
    "framework": "model WHS Act/Regulations (Safe Work Australia) adopted in NSW, QLD, SA, WA (2020 Act/2022 Regs), TAS, ACT, NT, Cth; VIC uses OHS Act 2004 / OHS Regulations 2017",
    "hrcw_fall_threshold_m": 2,
    "hrcw_fall_rule": "risk of a person falling more than 2 m (reg 291(a)); disturbance of asbestos also HRCW (reg 291(d))",
    "swms": "required before HRCW starts; must identify HRCW, hazards/risks, controls, and implementation/monitoring/review (reg 299); work must follow it (reg 300)",
    "fall_hierarchy": [
      "ground or solid construction",
      "fall prevention device (fence, edge protection, platforms, covers)",
      "work positioning system",
      "fall arrest system + rescue procedures (reg 80)"
    ],
    "asbestos": {
      "class_b_licence": "more than 10 m2 non-friable asbestos/ACM (reg 487)",
      "class_a_licence": "any friable asbestos or ACD (regs 485-486)",
      "unlicensed_limit_m2": 10,
      "unlicensed_requirement": "competent person trained under reg 445 (reg 458)",
      "notification": "licensed removalist gives written notice to regulator at least 5 days before licensed removal (reg 466); emergencies: phone immediately + writing within 24 h",
      "prohibited_methods": "no high-pressure water spray or compressed air on asbestos/ACM; power tools/brooms only if controlled (reg 446)"
    },
    "codes_of_practice": [
      "Managing the Risk of Falls at Workplaces (cites AS/NZS 4994.2:2009 roof edge protection, AS/NZS 4389:2015 roof safety mesh)",
      "How to Safely Remove Asbestos (AC roof sheeting: no angle grinders; PVA; no chutes)",
      "How to Manage and Control Asbestos in the Workplace",
      "Construction Work"
    ],
    "jurisdiction_differences": [
      {
        "state": "SA",
        "text": "HRCW fall threshold changed from more than 3 m to more than 2 m on 2026-07-01 (amended by 112/2025); corroborated by SafeWork SA Working at heights page (some older SafeWork SA pages still say 3 m)",
        "status": "VERIFIED",
        "sources": [
          "https://www.safework.sa.gov.au/industry/construction/working-at-heights"
        ]
      },
      {
        "state": "QLD",
        "text": "Extra fall-control rules: housing construction work fall at least 3 m, other construction at least 2 m, or any roof slope over 26 degrees requires prevention/arrest controls before work (ss 306C-306D); SWMS trigger still 2 m; SWMS relying only on admin/PPE must list all controls considered (s 299(4))",
        "status": "VERIFIED (regulation text); WorkSafe QLD guidance unreachable (Cloudflare challenge, not bypassed)"
      },
      {
        "state": "WA",
        "text": "WHS (General) Regulations 2022 regs 79, 291, 299, 466, 487 match model text as at 2026-07-01; WorkSafe WA 26 degree / 1 Oct 2026 guidance not verified",
        "status": "PARTLY VERIFIED"
      },
      {
        "state": "VIC",
        "text": "OHS Act 2004 / OHS Regulations 2017 apply (not WHS). Part 3.3 falls applies to risk of fall more than 2 m; SWMS for HRCW incl. falls more than 2 m; reg 44 hierarchy in 5 levels (eliminate; passive fall prevention; work positioning; fall arrest; admin controls and ladders); PPE not a fall control. Asbestos notice (licence holder, each job): at least 24 h before start for <=10 m2 non-friable, within 24 h of start for unexpected situations (reg 299), at least 5 days before in all other cases. Unlicensed removal only for non-friable <=10 m2 AND <=1 hour per 7 days (2 people 30 min each, 3 people 20 min each).",
        "status": "VERIFIED (WorkSafe VIC guidance, checked 2026-11-06; regulation text not read)",
        "falls_threshold_m": 2,
        "asbestos_notice": {
          "le_10m2_non_friable": "at least 24 hours before starting",
          "unexpected_situation": "within 24 hours of starting (OHS Regs reg 299)",
          "other": "at least 5 days before starting"
        },
        "unlicensed_limit": {
          "max_m2": 10,
          "max_hours_per_7_days": 1,
          "split": {
            "2_people_minutes_each": 30,
            "3_people_minutes_each": 20
          }
        },
        "unverified": [
          "reg 49 rescue",
          "compliance code PDF text",
          "regulation text (content.legislation.vic.gov.au blocked)"
        ],
        "sources": [
          "https://www.worksafe.vic.gov.au/preventing-slips-trips-and-falls-under-2-metres",
          "https://www.worksafe.vic.gov.au/safe-work-method-statements-swms",
          "https://www.worksafe.vic.gov.au/compliance-code-prevention-falls-housing-construction-key-changes",
          "https://www.worksafe.vic.gov.au/asbestos-removal-notification",
          "https://www.worksafe.vic.gov.au/understand-and-manage-asbestos-workplaces"
        ]
      }
    ],
    "sources": [
      "https://www.legislation.qld.gov.au/view/pdf/inforce/current/sl-2011-0240",
      "https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/work-health-and-safety-regulations-2012/current/2012.268.auth.pdf",
      "https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html",
      "https://www.legislation.act.gov.au/DownloadFile/ni/2020-553/current/PDF/2020-553.PDF",
      "https://www.legislation.act.gov.au/DownloadFile/ni/2022-690/current/PDF/2022-690.PDF"
    ],
    "status": "VERIFIED via state mirrors of model regs (safeworkaustralia.gov.au unreachable)"
  },
  "general_insurance_code": {
    "code_in_force": "General Insurance Code of Practice 2020, effective 2021-10-05, last updated October 2023",
    "applies_to": "insurers that have adopted it; Part 8 claims = retail insurance products",
    "initial_information_request_business_days": 10,
    "progress_update_every_business_days": 20,
    "routine_enquiry_response_business_days": 10,
    "assessor_or_investigator_appointment_notice_business_days": 5,
    "external_expert_report_weeks": 12,
    "decision_after_info_business_days": 10,
    "decision_overall_months": 4,
    "decision_overall_exception_months": 12,
    "decision_exceptions": [
      "Extraordinary Catastrophe",
      "fraud or reasonably suspected fraud",
      "customer not responding",
      "communication difficulty beyond insurer control",
      "customer requested delay"
    ],
    "urgent_need_advance_business_days": 5,
    "reports_relied_on_provided_business_days": 10,
    "insurer_authorised_repairer": "insurer responsible for quality of work and materials (cl 86)",
    "catastrophe_review": "claim finalised within 1 month of catastrophe may be reviewed on request within 12 months (cl 90)",
    "cash_settlement": {
      "code_clause": "79",
      "fact_sheet_required_when": "policy gives choice between cash and another form of settlement",
      "fact_sheet_contents": [
        "settlement options",
        "total amount offered with breakdown",
        "rights of review",
        "advice to consider independent advice"
      ],
      "fact_sheet_form": [
        "titled",
        "dated",
        "in writing",
        "easy to understand"
      ],
      "review_after_closure": true,
      "legal_basis": null,
      "source": "https://insurancecouncil.com.au/wp-content/uploads/2025/12/20251205_CFS_FACTSHEET.pdf"
    },
    "complaints": {
      "update_every_business_days": 10,
      "decision_calendar_days": 30,
      "delay_notice": "in writing before deadline with reasons and AFCA right",
      "written_response_required_for": [
        "financial hardship",
        "declined claim",
        "value of a claim",
        "on request"
      ],
      "must_follow": "ASIC guidelines (RG 271 not read)"
    },
    "afca": {
      "access": "at any time, and if not resolved within 30 calendar days of first receipt",
      "may_refer_back_if_no_idr": true,
      "decisions_binding_on_insurer": "as set out in AFCA Rules",
      "phone": "1800 931 678",
      "web": "www.afca.org.au",
      "own_site_status": "UNVERIFIED (Cloudflare block)"
    },
    "make_safe_timeframe": null,
    "business_day": "Mon-Fri excluding public holidays",
    "revised_code": {
      "status": "submitted to ASIC 2026-10-22; not in force; transition period expected after approval",
      "notable": [
        "contractually enforceable",
        "home and motor claims auto-accepted after 12 months if delay within insurer control"
      ],
      "source": "https://insurancecouncil.com.au/resource/insurers-submit-enhanced-code-of-practice-to-regulator/"
    },
    "sources": [
      "https://insurancecouncil.com.au/cop/",
      "https://insurancecouncil.com.au/wp-content/uploads/2023/11/2023-COP_UPDATE_October_FINAL.pdf"
    ],
    "status": "VERIFIED (ICA Code text, checked 2026-11-06); AFCA site, ASIC RG 271 and fact-sheet legal basis UNVERIFIED"
  },
  "status_notes": "Round 2: accc.gov.au and consumer.vic.gov.au reachable via curl (WebFetch DNS failed). Round 3 (2026-11-06): rba.gov.au, insurancecouncil.com.au, worksafe.vic.gov.au (HTML only; PDFs on content-v2.api.worksafe.vic.gov.au blocked) and safework.sa.gov.au reachable. ato.gov.au (Akamai Access Denied), afca.org.au (Cloudflare block), worksafe.qld.gov.au and worksafe.act.gov.au (Cloudflare JS challenge) refuse automated requests; not bypassed. legislation.gov.au, asic.gov.au, business.gov.au, safeworkaustralia.gov.au, content.legislation.vic.gov.au still unreachable. Nulls mean unverified."
}
```
