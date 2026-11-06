# VERIFIED RULES — VIC and TAS (round 2, primary-source verification)

> Status: COMPLETE (2026-11-06). Summary of changes vs round 1 at the end of this file.
>
> **Method.** WebFetch could not resolve any of the brief's hosts (ENOTFOUND). `curl` through the session's agent proxy (default curl user agent, no spoofing) could reach www.legislation.vic.gov.au, www.consumer.vic.gov.au and www.legislation.tas.gov.au. Authorised consolidated versions were downloaded as DOCX from www.legislation.vic.gov.au/sites/default/files/... (the same files the site links on content.legislation.vic.gov.au, which the proxy blocks) and converted to text with pandoc. **Blocked:** www.bpc.vic.gov.au (Cloudflare "Just a moment..." JS challenge, HTTP 403, not bypassed); bpc.vic.gov.au, cbos.tas.gov.au and austlii (proxy CONNECT 403); www.cbos.tas.gov.au (connection reset at first, then a Cloudflare JS challenge with HTTP 403; not bypassed).
> Date checked for every VIC legislation item: **2026-11-06**.

## VIC — VERIFIED RULES (legislation group)

Versions read:
- Domestic Building Contracts Act 1995 (DBC Act), **Version 094, as at 1 July 2026** — https://www.legislation.vic.gov.au/in-force/acts/domestic-building-contracts-act-1995/094
- Domestic Building Contracts Regulations 2017 (DBC Regs), **Version 004, as at 1 July 2021** (still the in-force version; they **sunset 12 April 2027**) — https://www.legislation.vic.gov.au/in-force/statutory-rules/domestic-building-contracts-regulations-2017/004
- Building Act 1993, **Version 152, as at 16 Sep 2026** — https://www.legislation.vic.gov.au/in-force/acts/building-act-1993/152
- Building (Statutory Insurance Scheme) Regulations 2026, S.R. 42/2026, **Version 002, as at 14 Oct 2026** — https://www.legislation.vic.gov.au/in-force/statutory-rules/building-statutory-insurance-scheme-regulations-2026/002
- Plumbing Regulations 2018, **Version 010, as at 1 May 2026** — https://www.legislation.vic.gov.au/in-force/statutory-rules/plumbing-regulations-2018/010
- Building Regulations 2018, **Version 032, as at 27 Oct 2026** — https://www.legislation.vic.gov.au/in-force/statutory-rules/building-regulations-2018/032
- Building and Construction Industry Security of Payment Act 2002, **Version 015, as at 24 June 2026** — https://www.legislation.vic.gov.au/in-force/acts/building-and-construction-industry-security-payment-act-2002/015
- Occupational Health and Safety Regulations 2017, **Version 018, as at 20 Oct 2026** — https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017/018


### VIC item block (all dates checked 2026-11-06)

**Timing warning: read this first.** Victoria's domestic building contract rules change on **31 March 2027**:
- The Domestic Building Contracts Amendment Act 2025 (No. 36/2025) commences on proclamation. Its forced-commencement date was "1 December 2026" (s 2(3)). The Consumer Legislation Amendment Act 2026 (No. 36/2026, assented 8 Sep 2026, Part 12B in force the next day) changed it: *"In section 2(3) of the Domestic Building Contracts Amendment Act 2025, for "1 December 2026" substitute "31 March 2027"."* — https://www.legislation.vic.gov.au/as-made/acts/consumer-legislation-amendment-act-2026 and https://www.legislation.vic.gov.au/as-made/acts/domestic-building-contracts-amendment-act-2025
- The Domestic Building Contracts Amendment Regulations 2026 (S.R. 175/2026, made 27 Oct 2026) state: *"These Regulations come into operation on 31 March 2027."* — https://www.legislation.vic.gov.au/as-made/statutory-rules/domestic-building-contracts-amendment-regulations-2026
- So the SaaS must key VIC rules on **contract date before 31 Mar 2027 / on or after 31 Mar 2027**, and also on **1 Jul 2026** for insurance. A proclamation could bring some provisions of the 2025 Act in earlier. No proclamation was checked (the Government Gazette was not read), so re-check before 31 Mar 2027.

**1. Governing Act and regulator — VERIFIED with nuance (CORRECTS round 1's "BPC replaced VBA" wording)**
- Contracts: Domestic Building Contracts Act 1995 (DBC Act) and Domestic Building Contracts Regulations 2017. Registration, plumbing and insurance: Building Act 1993 and Plumbing Regulations 2018.
- In the in-force legislation the regulator is still legally the **Victorian Building Authority**: Building Act v152 s 3(1), *"Authority means the Victorian Building Authority established under section 193"*. "Building and Plumbing Commission (BPC)" is the public name now in use; CAV says *"The Building and Plumbing Commission (BPC) registers building practitioners"* (https://www.consumer.vic.gov.au/housing/building-and-renovating/plan-and-manage-your-building-project/domestic-building-consumer-guide).
- The statutory BPC is created by the Building and Plumbing Administration and Enforcement Act 2026 (No. 17/2026, assented 19 May 2026): *"Commission means the Building and Plumbing Commission established by section 35(1)"*, and *"VBA means the body corporate established by section 193 of the Building Act 1993 and abolished by section 500"*. It commences on proclamation, at the latest *"1 December 2027"* (s 2(2)). Source: https://www.legislation.vic.gov.au/as-made/acts/building-and-plumbing-administration-and-enforcement-act-2026
- Consumer Affairs Victoria (CAV, Director of Consumer Affairs) currently approves the contract forms (cooling-off notice, checklist, consumer guide). The 2025 Amendment Act Part 6 is headed *"Transfer of functions from Director of Consumer Affairs to Victorian Building Authority"*, so the forms move to the Authority once it commences.
- **App rule:** show "Building and Plumbing Commission (BPC)" to users; store the legal entity as VBA until the 2026 Act commences.

**2. Is roofing-only work covered? Single-trade exemption — VERIFIED (resolves round 1's "conflict")**
- The DBC Act covers *"the renovation, alteration, extension, improvement or repair of a home"* (s 5(1)(b)).
- DBC Regs 2017 reg 7: *"any of the following types of work is not building work to which the Act applies if the work is to be carried out under a contract for only that type of work— … (f) painting; … (h) plumbing work as defined in section 221C of the Building Act 1993"*. Roofing is not named.
- Plumbing Regulations 2018 reg 12(1)(h) makes **roofing (stormwater) work** "plumbing work". Reg 25(1) defines it: *"the construction, installation, replacement, repair, alteration, maintenance, testing or commissioning of any roof covering or roof flashing, or any part of a roof drainage system involved in the collection or disposal of stormwater"*. Reg 25(2) excludes *"(a) any cleaning, painting or preparation work…"*, *"(b) … any roof covering consisting of non-metallic tiles, timber, concrete, glass, bitumen or slate"* and *"(c) any work on a membrane applied to a roof covering"*.
- **Result:**
  - A contract **only** for metal roofing, flashings, gutters or downpipes is plumbing work, so it is **outside the DBC Act** (no major contract, no DBC deposit cap, no DBC cooling-off). Plumbing rules still apply (licence, compliance certificate).
  - **Tile, slate or concrete re-roofing, re-bedding and re-pointing** is not plumbing, so it **is domestic building work**.
  - A **roof restoration that only paints or coats** is "painting", which is single-trade exempt under reg 7(f). This is an inference: coating tiles is treated as painting. Membranes are excluded from plumbing but not listed in reg 7.
  - **Mixed jobs** (for example tile repairs plus a re-coat, or metal re-roof plus carpentry/battens) are not "a contract for only that type of work", so the DBC Act applies.
- CAV (last updated 25 Sep 2025) lists *"plumbing, gas-fitting and draining"* among single-trade jobs not needing a major contract — https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/domestic-building-contracts/what-work-requires-a-building-contract
- The 2025 Amendment Act also amends ss 5–6. The new text was not read in full, so re-check reg 7 after 31 Mar 2027 (2026 Amendment Regs reg 10 does not touch reg 7).

**3. Licence or registration — VERIFIED**
- **Builder:** DBC Act s 29(1): *"A person must not enter into a major domestic building contract … unless— (a) the person is a registered building practitioner; and (b) the person's registration authorises the person to carry out the work."* Penalty: 500 penalty units for a person, 2500 for a company.
  - The relevant class is *"class of domestic builder (limited to roof tiling)"* (Building Regs 2018 Sch 1 cl 6(z)). Its scope (Sch, item 15) is *"(a) initial tiling of roofs; (b) the repair and renovation of existing tiled roofs; (c) re-pointing, sarking, cutting, bedding and pointing of roof tiles."* Otherwise a domestic builder (unlimited) is needed.
  - Threshold = the major domestic building contract threshold: **more than $10,000** now (DBC Regs reg 6: *"an amount of $10 000 is fixed"*). From **31 Mar 2027** it is **more than $20,000** (2026 Amendment Regs reg 7: *"for "$10 000" substitute "$20 000""*).
  - The building-permit "builder" threshold is separate (Building Regs reg 36B: *"the amount is $10 000"*, s 24B). The 2026 Amendment Regs do not change it, so registration may still be required to be named on a permit for work over $10,000.
- **Plumber:** Building Act s 221D(1): *"A person must not carry out any plumbing work of a particular class or type unless he or she is licensed or registered by the Authority"*. The class is **Roofing (stormwater)** (Plumbing Regs reg 10(g), 25). Licensed vs registered matters: s 221E allows only a **licensed** plumber (or a registered plumber supervised by one) to do work for which a compliance certificate is required.
- **Licence number on documents:**
  - Contracts: DBC Act s 31(1)(f) requires a major contract to *"state[] the registration number under the Building Act 1993 of the registered building practitioner who entered into the contract"*.
  - Advertising: Building Act s 169H requires an advertisement *"offering to carry out domestic building work"* to state *"(a) the name under which the building practitioner is registered; and (b) the registration number"*, and Building Regs reg 262 requires these to be *"clearly legible"*. Penalty: 60 penalty units.
  - Plumbers: no statutory duty to show the plumbing licence number in advertising was found in the Building Act or Plumbing Regs 2018. Section 221ZZZV allows regulations on plumbers' advertising, but none were found. The compliance certificate carries the licence details.
  - Quotes: there is no specific "quote" rule. Because s 169H covers any "written statement offering to carry out domestic building work", show the registration number on quotes too.

**4. Written-contract threshold and tiers — VERIFIED (with 2027 change)**
- Now: a **major domestic building contract** is one where the builder receives **more than $10,000**. It must be in writing with full contents (s 31) and must be signed by both parties or it is *"of no effect"* (s 31(2)).
- At $10,000 or below there is no statutory writing requirement, but s 25(b) requires the builder to give copies of documents forming the contract. CAV recommends a written contract.
- From 31 Mar 2027: the threshold becomes **more than $20,000**. New s 7A requires **every** domestic building contract (any value) to be *"(a) … in writing; and (b) … in English and readily legible"*, with names and addresses, a detailed description, price and date (2025 Amendment Act s 9).
- Price: the DBC Act "contract price" is the total amount payable. The Building Regs permit application form says *"All costs specified in an application are to be inclusive of GST."* The DBC Act does not state GST treatment of the threshold, so treat the threshold as including GST (conservative). This is an inference.

**5. Maximum deposit — VERIFIED (with 2027 CHANGE)**
- Contracts signed now (to 30 Mar 2027): DBC Act s 11(1): *"A builder must not demand or receive a deposit under a domestic building contract of more than— (a) 5% of any contract price that is $20 000 or more; (b) 10% of any contract price that is less than $20 000— before starting any work under the contract."* This applies to **all** domestic building contracts, not only major ones. Penalty: 100 penalty units, and the owner may avoid the contract (s 11(3)).
- From 31 Mar 2027: new s 11(1) caps the deposit at *"the percentage of the contract price that is prescribed"*. New reg 9A prescribes 20% / 15% for modern-methods-of-construction new homes and *"(c) in any other case—10%"*. So roofing contracts get a **flat 10%** at any value; the 5% tier for $20,000+ disappears.

**6. Cooling-off — VERIFIED (2027 change to exceptions)**
- DBC Act s 34(1): *"A building owner may withdraw from a major domestic building contract at any time before the expiration of 5 clear business days after the building owner receives a copy of the signed contract."* This applies only to major contracts (over $10,000 now, over $20,000 from 31 Mar 2027).
- Business day excludes Saturday, Sunday and *"a day that is wholly or partly observed as a public holiday throughout Victoria"* (s 3).
- Withdrawal is by signed written notice (s 34(2)). The builder may keep *"$100 plus the cost of any other out-of-pocket expenses the builder incurred before the withdrawal with the approval of the building owner"* (s 34(3)).
- Exceptions now (s 34(4)): a previous substantially same contract for the same home or land, or the owner *"received independent advice from an Australian legal practitioner"*. From 31 Mar 2027 the legal-advice exception is **removed** (2025 Amendment Act s 16).
- If the contract lacks the notice, the owner may withdraw *"within 7 days of becoming aware that the contract should have contained such a notice"* (s 35).
- The section number is **s 34**, not "ss 32–33" as the brief suggested. Section 32 is delay allowances and s 33 is the price-variation warning. The notice requirement is s 31(1)(n).
- **Approved notice wording (Director of CAV), quoted from CAV's model contract** (https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/building-and-renovating/building-contract-for-new-homes.docx), heading "Notice pursuant to Section 31(1)(n) — Cooling off period":
  > "Notice to Building Owner: You may end this contract within five clear business days after receipt by you of a signed copy of the contract by filling in the notice below and giving it to the Builder in one of the following ways: (1) Personally (2) Leaving it at his or her address set out in the contract with a person who appears to be at least 16 years old (3) Sending it by pre-paid certified mail to the address set out in this contract (4) Sending it by facsimile to the facsimile number (if any) set out in this contract."
  >
  > The detachable form is "Notice that contract is ended … I/We: … give notice under our contract with you that the contract is ended. Please refund the deposit less $100 and any out of pocket expenses incurred by you which I have previously approved. Building Owner's signature: … Date: …"
  >
  > The notice must be included "in substantially the same form or to the same effect".

  After 31 Mar 2027 the Authority approves the form, so expect new wording without the legal-advice exception.
- The ACL 10-business-day unsolicited-agreement right still applies alongside (not re-verified here).

**7. Home warranty insurance — VERIFIED (round-1 values confirmed; scheme name and details added)**
- Scheme name: **"First Resort Home Warranty Scheme"** (Building (Statutory Insurance Scheme) Regulations 2026 reg 50). The law is Building Act Part 9A (in force 1 Jul 2026).
- Threshold: an *"insurable domestic building contract means a domestic building contract … under which the builder will receive more than $20 000 (or any higher prescribed amount)"* (Building Act s 3(1)). The scheme does not apply to work *"the cost of which is less than— (i) $20 000"* (s 137J(d)). Both apply only to contracts signed on or after 1 Jul 2026.
- Whether the $20,000 includes GST is not stated in the Act. A BPC summary (search snippet only; the page is blocked) reportedly says the value includes labour, materials, agreed variations and GST. Treat it as **GST-inclusive** (unverified at primary level).
- When:
  - The builder must pay the premium to the Authority *"before the first of the following to happen— (a) 10 business days elapse after the day on which the contract is entered into; (b) the domestic building work starts"* (s 137O(1)). Penalty: 500 / 2500 penalty units.
  - If a variation takes the contract over the threshold, the premium is due *"within 10 business days after the variation"* (s 137O(2)).
  - The **Authority** issues the *"notice of cover"* and sends it to the owner (s 137T(4)). The builder does not hand over a certificate.
  - It is an offence to represent that a notice of cover has been issued when it has not (s 137U).
  - Cover applies even if the premium is unpaid, where the contract *"bears the builder's registration number"* (s 137R(2)(a)).
  - "Work starts" = *"the day on which tools or building materials are first used at the building site"* (SIS Regs reg 6).
- Cover: assistance *"limited to a total of $400 000"* per home (reg 21). Defects cover ends *"6 years after the completion date"* for major defects and 2 years for other defects (reg 8). A "major defect" includes *"a waterproofing or weatherproofing defect"*, and a "structural element" includes *"a component that forms part of the external walls or roof"* (reg 4). **Roof leaks are therefore major (6-year) defects.**
- Contracts signed before 1 Jul 2026 keep the old Domestic Building Insurance (DBI) threshold of **more than $16,000**, per CAV: *"Before 1 July 2026, your builder should have domestic building insurance if the work costs more than $16,000."* The CAV builder pages (dated 2025) still say $16,000 and are stale for new contracts.
- **Roofing-only:** *depends.*
  - A tile re-roof or roof-tiling contract over $20,000 by a registered domestic builder is covered.
  - A metal-roof, gutter or downpipe-only contract is plumbing work, so it is not "domestic building work" (DBC Regs reg 7(h)) and is outside the scheme (s 137J(a)).
  - Paint-only restoration is not domestic building work (reg 7(f)), so it is outside the scheme.
  - Regs reg 9 lists no roofing exclusion.
- Prescribed contract info: from 31 Mar 2027 a major contract must include the reg 12A scheme statement. Quote: *"(b) the statutory insurance scheme is referred to as the First Resort Home Warranty Scheme; (c) the Authority administers the statutory insurance scheme; (d) the statutory insurance scheme applies to a domestic building contract … under which the builder will receive more than $20 000 …; (e) … provides assistance … incomplete, defective or non-compliant; (f) cover … ends— (i) in relation to major defects (including structural defects and waterproofing and weatherproofing defects)—6 years after the completion date … (ii) … not major defects—2 years …; (g) … does not apply to … a structure that is not fixed to land; (h) more information … on the website of the Authority."*
- Sources: Building Act v152 Part 9A; SIS Regs v002; CAV consumer guide page (above).

**8. Documents, progress payments and variations — VERIFIED (major contracts)**
- Before signing a major contract: the *"contract information statement in a form approved by the Director"* (s 29A). This is CAV's **"Domestic Building Consumer Guide"**: *"The Domestic Building Consumer Guide is the contract information statement required by section 29A"* (CAV consumer guide page).
- Contract contents (s 31(1)): registration number, start and finish dates with delay allowances (s 32), price, the cooling-off notice (n), a definitions section (o)–(p), *"(q) sets out the warranties implied into the contract by sections 8 and 20"* (the statutory warranty statement), *"(r) … a checklist in a form approved … by the Director"* (CAV "Approved checklist"), and *"(l) … prescribed information about the statutory insurance scheme"*. Under (l), nothing is prescribed until reg 12A starts on 31 Mar 2027.
- A price-may-change warning in the approved form goes next to the price (s 33).
- Copy of the signed contract within *"5 clear business days"* (s 25). Copies of authority/surveyor reports as soon as practicable (s 26).
- Progress payments: for contracts not in the s 40 table (roofing is not in the table), *"a builder must not demand or receive any amount or instalment that is not directly related to the progress of the building work"* (s 40(3)). The same rule continues as new s 40(4) after 31 Mar 2027.
- Final payment: not until the work is complete and the owner has the occupancy permit or *"a copy of the certificate of final inspection"* where a permit applies (s 42).
- Variations (major contracts):
  - Builder variation (s 37): a written notice (description, reason, effect, permit, delay, cost), and the owner's *"signed consent"* is needed before doing the work.
  - Owner variation (s 38): written; the builder may proceed without a further notice only if it *"will not add more than 2% to the original contract price"* and causes no permit change or delay.
  - From 31 Mar 2027: one signed written variation agreement with the s 37(2)(c) particulars.
- Pre-31 Mar 2027, contracts $10,000 or below: none of the Part 3 requirements apply; only Part 2 (warranties, deposit, copy of documents).

**9. Statutory warranties and limitation — VERIFIED**
- DBC Act s 8 implies warranties (a)–(f) into every domestic building contract: proper and workmanlike, good and suitable new materials, compliance with laws, reasonable care and skill and finished on time, fit for occupation, and fit for stated purpose. They run with the building (s 9) and cannot be signed away (s 10).
- Duration: there is no fixed warranty period. Endnote [5] to the DBC Act: *"Section 134 of the Building Act 1993 imposes a 10 year limit on the bringing of building actions … The 10 years begins to run from the date the occupancy permit is issued. If no occupancy permit is issued, the 10 years runs from the date the certificate of final inspection is issued."*
- Round 1's "10 years, single tier" is confirmed. Note the 6 / 2 year **insurance** cover periods (item 7) are separate.
- Gap: for un-permitted work (no certificate of final inspection, which is typical of re-roofs), the start date of the 10-year period was not checked against s 134 itself.

**10. Plumbing compliance certificate — VERIFIED with CORRECTION of detail**
- Building Act s 221ZH(1)(a) applies to *"any plumbing work that has a total value of $500 or more (or any higher amount fixed by the regulations)"*. Plumbing Regs reg 47: *"For the purposes of section 221ZH(1)(a) of the Act, the amount fixed is $750."* So the trigger is a **total value of $750 or more**.
- Correction: round 1 said "exceeds $750". The statute applies at **$750 or more**.
- Deadline (s 221ZH(2)): *"Within 5 days of the completion of any plumbing work … a licensed plumber must— (a) give the person for whom the work was carried out a signed compliance certificate …; and (b) notify the Authority"*. Notification is by *"lodgement of the compliance certificate through an electronic system provided by the Authority on its Internet site"* (Plumbing Regs reg 14A, inserted by S.R. 38/2026).
- Correction: round 1 had two separate "within 5 days" steps (customer, then regulator). The Act sets **one 5-day window for both**. A certificate may also be demanded within 5 days if the job is abandoned (s 221ZH(2A)–(2B)).
- The roofing (stormwater) standard is *"Victorian variation VIC Part E3 in Schedule 10 to the PCA (Stormwater - Roof drainage systems)"* (Plumbing Regs reg 26, substituted by S.R. 38/2026).
- No "notice of work" before starting roof plumbing was found in the VIC legislation read.
- Round 1's "certificate cannot be withheld for non-payment" is from a 2019 VBA news item and was not re-verified.

**11. Building permit for re-roofing — PARTLY VERIFIED**
- Building Regs 2018 Sch 3 item 3 exempts from building and occupancy permits the *"Repair, renewal or maintenance of a part of an existing building"*, if the work:
  - *"(a) will not adversely affect the structural soundness of the building, and does not include— (i) an increase or decrease in the floor area or height of the building; (ii) underpinning or replacement of footings; or (iii) the removal or alteration of any element of the building that is contributing to the support of any other element of the building"*;
  - *"(b) is done using materials commonly used for the same purpose as the material being replaced"*;
  - and (c)–(d) does not affect safety or essential safety measures.
- There is no roof-specific item. Whether a tile→metal change or batten replacement needs a permit turns on (a)(iii) and (b). Council guidance (round 1, secondary) says changing material needs a permit. Keep that as a **conservative prompt**, not a rule.
- The heritage overlay and planning permit (Planning and Environment Act) were not checked.

**12. Security of payment — VERIFIED**
- SOP Act 2002 s 7(2)(b): the Act does not apply to *"a construction contract which is a domestic building contract within the meaning of the Domestic Building Contracts Act 1995 between a builder and a building owner … other than a contract where the building owner is in the business of building residences"*.
- Section 7(2)(ba) also excludes contracts for s 6-type work *"relating to a residence"*, unless the work is part of another construction contract.
- So owner-occupier = **no**. A roofer subcontracting to a builder or insurer's builder = yes.
- Payment schedule (s 15(4)): within the contract time or *"within 10 business days after the payment claim is served; whichever time expires earlier"*.
- A metal-roof-only plumbing contract with a homeowner: it is not a DBC Act "domestic building contract" (reg 7(h)). Whether s 7(2)(ba) catches it is **unclear**, so treat it as excluded (conservative) and get legal advice.
- The 15 Apr 2026 SOP reforms (secondary) are reflected in v015 (amended by No. 43/2025). Not further analysed.

**13. Other VIC prompts — VERIFIED (OHS Regs 2017 v018)**
- Falls: a "fall" is *"an involuntary fall of more than 2 metres"*.
  - Reg 44 sets the hierarchy: eliminate, then *"passive fall prevention device"*, then work positioning system, then fall arrest, then ladder or administrative controls.
  - Reg 49 requires *"emergency procedures"* (rescue and first aid) before the task whenever reg 44(2)–(5) controls are used.
- SWMS: reg 322(a) makes it high risk construction work *"where there is a risk of a person falling more than 2 metres"*. Reg 327 says no HRCW unless *"a safe work method statement is prepared for the work before the work commences"*. The SWMS must be kept for the duration (reg 329).
- Asbestos:
  - Unlicensed "limited asbestos removal work" is allowed only if the non-friable ACM is *"not exceed[ing] 10 square metres in total"* **and** the person *"does not perform more than 1 hour of asbestos removal work in total during a 7-day period"* (reg 250). The 1-hour-per-7-days limit is a VIC-specific addition the app should check.
  - A licence holder must notify WorkSafe *"at least 24 hours before"* for 10 m² or less of non-friable ACM, and *"in any other case, at least 5 days before"* (reg 298(1)). A copy of the notice goes to the person who commissioned the work (reg 298(3)).
  - Clearance certificate not required for 10 m² or less non-friable (reg 297(3)).
- Cost escalation clauses: banned below $1,000,000 from 31 Mar 2027. Currently they are only possible with a CAV-approved clause, and CAV says none have been approved.

---

## TAS — VERIFIED RULES

Sources read (via curl through the agent proxy, 2026-11-06; the TAS site's internal date showed 2026-11-07):
- Residential Building Work Contracts and Dispute Resolution Act 2016 (RBWCDR Act), in-force version from **16 Jul 2024** — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2016-032
- **Residential Building Work Contracts and Dispute Resolution Regulations 2026** (SR 2026-085, made 26 Oct 2026, *"take effect on 2 November 2026"*, notified in the Gazette 28 Oct 2026) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2026-085
  - These replace the 2016 Regulations (SR 2016-089), which the site now marks *"(Expired)"*.
- Residential Building (Home Warranty Insurance Amendments) Act 2023 (as made, assent 16 Oct 2023, commences on proclamation) — https://www.legislation.tas.gov.au/view/whole/html/asmade/act-2023-025
- www.cbos.tas.gov.au: connection reset by the proxy, so it could not be read. cbos.tas.gov.au (non-www): proxy 403.
- Occupational Licensing Act 2005 (in-force version from 2025-07-02) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2005-047
- Occupational Licensing (Building Services Work) Regulations 2016 (SR 2016-112; secondary sources say they expire Dec 2026) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2016-112
- Occupational Licensing (Plumbing Work) Regulations 2021 (SR 2021-114) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2021-114
- Building Act 2016 (in-force version from 2026-06-11) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2016-025
- Building Regulations 2016 (SR 2016-110) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2016-110
- Building and Construction Industry Security of Payment Act 2009 (in-force version from 2025-07-14) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2009-086
- Work Health and Safety Regulations 2022 (SR 2022-109, in-force version from 2025-07-02) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2022-109

### TAS item block (all checked 2026-11-06)

**1. Governing Act and regulator — VERIFIED (partly)**
- Act: RBWCDR Act 2016. Its long title says it is an Act *"to repeal the Housing Indemnity Act 1992"*.
- Regulator: the **Director of Building Control**. Section 4: *"Director means the Director of Building Control appointed under section 15 of the Building Act 2016"*.
- Licensing is under the Occupational Licensing Act 2005; the "Administrator" is the Administrator of Occupational Licensing.
- Consumer, Building and Occupational Services (CBOS, Department of Justice) is the office that runs these roles. The Building Regs say *"These regulations are administered in the Department of Justice."* The CBOS website itself could not be read (Cloudflare challenge).
- Disputes go to Director mediation (Part 9), then TASCAT (Part 10, *"Tasmanian Civil and Administrative Tribunal"*).

**2. Is roofing-only work covered? — VERIFIED: yes, at $20,000 or more, with no single-trade exemption**
- Section 6(2): residential building work includes *"(c) the restoration, maintenance, renovation, alteration, extension, improvement or repair of a residential building"*.
- Associated work includes *"(iii) the cleaning, painting and decorating of the inside and outside surfaces"*. The definition of "plumbing system" in s 6(1) includes *"a system of storm water drainage or roof drainage"*.
- Section 9: *"This Act does not apply to … residential building work that – (a) is performed, or is to be performed, for a contract price that is less than $20 000 or another greater amount, if any, that is prescribed by the regulations; … (c) consists solely of demolition work; or (d) is exempted … in accordance with section 10."*
- The 2026 Regulations prescribe **no** greater amount and **no** s 10 exemptions. Their only content is regs 4–7: non-residential buildings, deemed fixtures, deposit set amount, infringement notices.
- So re-roofs, restorations, repairs and gutters with a contract price of **$20,000 or more** are covered. Below $20,000 the Act does not apply.
- Residential building = NCC class 1a, 2, or 10 associated with them (s 5). Excluded by reg 4: *"a building comprised of at least 3 residences situated directly one above the other"*.
- Contracts with an owner builder are excluded (s 4, definition of residential building work contract).
- Deemed part of the building (reg 5): *"solar panels"*, *"rooftop wind turbines"*, *"satellite dishes"*, EV chargers, home batteries.

**3. Licensing — PARTLY VERIFIED**
- Building work: OL Act s 22A(1): *"A person must not manage, carry out, or enter into a contract to manage or carry out, any building services work unless the person holds – (a) a building services licence of the occupation and class relevant to the building services work"*.
  - Building services work includes *"Building work … carried out on, or as part of, the construction, … installation, replacement, repair, … alteration, addition, maintenance … of any premises, building"* (BSW Regs Sch 1 Pt 1 item 1).
  - It **excludes** work that *"(a) is low-risk work within the meaning of the Building Act 2016"* and *"(c) is not required under that Act to be performed by a licensed builder"* (Sch 1 Pt 2 item 1).
  - There is **no dollar threshold in the legislation**. Whether a given re-roof is low-risk is set by the Director of Building Control's determination (Building Act s 20, s 91), which sits on CBOS and was **not read**.
  - Unlicensed contractors cannot recover payment (OL Act s 35).
- Roof plumbing: *"roof (stormwater)"* installations or systems are prescribed plumbing work (Plumbing Work Regs reg 4(1)(a)(iv)).
  - A practitioner's licence is needed to do it (OL Act s 22).
  - A contractor's licence is needed to *"carry on business as a contractor"* (s 21).
  - The regs recognise "plumber practitioner (restricted)" licences. The exact "restricted to roof plumbing" scope is in the plumbing work determination (CBOS), not read. Round 1's AMR-list citation was not re-checked.
- Licence number: RBWCDR s 14(1)(d) requires the contract to *"if the building contractor holds a licence under the Occupational Licensing Act 2005, specif[y] the number of the licence"*.
  - **No** statutory duty to show the licence number in advertising or quotes was found in the OL Act text (searched for "advertis": no hits).
- Unverified: whether metal roof **cladding** (as opposed to drainage) is plumbing or building services work in TAS.

**4. Written contract — VERIFIED**
- One tier only: every residential building work contract of **$20,000 or more** must be in writing, or be *"put into written form – (i) as soon as practicable (but in any case within 5 business days) after it is entered into; and (ii) before residential building work begins"* (s 13).
- It *"has effect only if it is signed by the building contractor and the owner"* (s 15).
- Contents (s 14(1)): English, all terms, parties, licence number, description and plans, price (or method plus estimate), date of practical completion, *"(h) sets out the warranties that are part of the contract under Part 6"*, any Director-determined provisions (s 11A), *"(j) includes the required checklist"*, and *"(k) has attached to it a copy of a residential building consumer guide"*.
- Under $20,000: the Act does not apply.
- Contract price includes labour and materials (s 4). GST is not mentioned, so treat it as GST-inclusive (inference).

**5. Maximum deposit — VERIFIED (round-1 template value CONFIRMED; now primary)**
- Section 41(2): before starting work a contractor must not demand or receive a deposit of more than *"(a) if the contract price is equal to or more than the set amount … –5% of the contract price; or (b) if the contract price is less than the set amount … – 10% of the contract price; or (c) … where the value of the off-site work is more than 50% of the contract price – 20%"*.
- 2026 Regs reg 6: *"the set amount of $50 000 is prescribed"*. So: **10% if under $50,000; 5% if $50,000 or more; 20% if off-site work is over 50%.**
- "Deposit" includes *"any payment … demanded or received … before the residential building work begins to be performed"* (s 4).
- Note: SR 2016-089 (which also set $50,000) has **expired**. SR 2026-085 re-made the $50,000 from **2 Nov 2026**. If the regs had lapsed, the default would be $20,000 (s 41(1)). Check the dates of any contract signed in the gap, if one existed.

**6. Cooling-off — VERIFIED**
- Section 33: the owner *"may withdraw from the contract within 5 business days after the receipt day"*. The receipt day is the day the owner has received both *"(i) a copy of the signed contract; (ii) a copy of the residential building consumer guide"* (the later day if different).
- Business day excludes Saturday, Sunday, *"a statutory holiday as defined in the Statutory Holidays Act 2000 or a public holiday throughout the State"*.
- Exceptions (s 34):
  - a previous substantially-same contract for the same building or land;
  - the owner *"received formal legal advice"* (paid, independent) before entering, or tells the contractor so.
- If the guide is not given, the owner may withdraw *"within 7 days of becoming aware"* (s 35), and the contractor then gets only a reasonable amount for work done (s 38).
- Withdrawal notice (s 36): written, signed, stating *"(a) that the owner withdraws from the contract; and (b) the section of this Act under which the withdrawal is made"*.
- Retainable amount (s 37): *"$100"* plus reasonably incurred out-of-pocket expenses. If nothing was paid, the owner owes it.
- **Prescribed notice wording: none in the Act or Regs.** The warning is the consumer guide. The cooling-off clause text is UNVERIFIED (any s 11A Director determination on contract provisions sits on CBOS, which is blocked).
- Round 1's conflicting "10-day/14-day" claims are confirmed **wrong**.

**7. Home warranty insurance — VERIFIED: none currently in force (round-1 belief confirmed and sharpened)**
- The RBWCDR Act repealed the Housing Indemnity Act 1992 (long title).
- The **Residential Building (Home Warranty Insurance Amendments) Act 2023** (assent 16 Oct 2023) would insert Part 10A, including s 16A: *"the relevant building contractor must give the owner a copy of the certificate of insurance … no later than … 5 business days after entering into the residential building work contract"*, with minimum cover of *"$200 000 or such other amount as is prescribed"*.
- That Act *"commence[s] on a day or days to be proclaimed"*. The current consolidated RBWCDR Act (from 16 Jul 2024) contains no Part 10A or s 16A, so it is **not commenced** as at that consolidation. The insurable-work threshold could not be extracted.
- App rule: no TAS home warranty requirement. Add a watch flag for proclamation of the 2023 Act.
- Separately, OL Act ss 27–28 require **licence holders to hold insurance** (not read in detail).

**8. Documents, progress payments and variations — VERIFIED**
- **Residential building consumer guide** (Director-approved, s 81): give it before entering the contract (s 39(1)) and attach it to the contract (s 14(1)(k)).
- Signed copy of the contract plus guide *"within 5 business days"* (s 16).
- **Commencement notice** *"within 10 business days after residential building work … begins"*, stating the start day and estimated practical completion (s 40).
- **Notice of practical completion** *"within 10 business days after the date of practical completion"* (s 43).
- **Defects document** for agreed minor defects, then rectify *"within 6 months"* (s 44).
- Progress payments (s 42(2)): *"must not demand or receive an amount, other than a deposit, … unless the amount is directly related to the progress of the performance at the building site"*.
- Variations (ss 17–20):
  - Must be in writing *"within the shortest practicable time"*. Additions must be in writing before the work starts.
  - Owner-sought or added work must not start until both parties sign (s 17(5)). There is an urgent-work exception (s 17(2)).
  - Variation document contents are in s 18(2).
  - A copy goes to the owner *"within 5 business days"* (s 20).
- Statutory warranty statement: the contract must set out Part 6 warranties (s 14(1)(h)).
- The "required checklist" is a *"summary of the provisions of the residential building work contract"* (s 14(3)).

**9. Statutory warranties — VERIFIED (round 1's "about 6 years, unverified" CONFIRMED)**
- Implied warranties: materials good, suitable and new (s 23); compliance with laws (s 24); *"appropriate and skilful way"* with *"reasonable care and skill"* (s 25); plans (s 27); fit for occupation (s 28); *"reasonable diligence"* (s 29); provisional sums (s 30).
- They pass to successors in title (s 31) and cannot be excluded (s 78).
- Duration (s 32(1)): *"Proceedings for a breach of a statutory warranty are to be commenced within 6 years after the date of practical completion"*.

**10. Plumbing compliance and notice of work — PARTLY VERIFIED**
- All plumbing work is **permit plumbing work** unless it is low-risk or notifiable plumbing work as determined by the Director (Building Act s 154, ss 91, 105).
- **Notifiable plumbing work:**
  - Before starting: *"a notice of work has been given under section 108 to a permit authority"* and the authority has issued a *"certificate of likely compliance (notifiable plumbing work)"* (s 107).
  - On completion: *"must notify the relevant permit authority … when the work is completed"* (s 113).
  - *"Within the prescribed period"*: give a *"standard of work certificate (notifiable plumbing work)"* to the permit authority and *"a copy … to the owner"* (s 114).
- **Low-risk building work** flagged by the Director must be notified to the permit authority *"within a specified period"* after completion, with the licensed builder's licence number (Building Regs reg 24A).
- **UNVERIFIED:** which category roof (stormwater) work falls into, the "prescribed period" for the standard of work certificate (not found in Building Regs 2016), and any value threshold. All of these are in the Director's determination on CBOS (blocked).

**11. Permit for re-roofing — UNVERIFIED (framework only)**
- Building work is *"permit building work unless the work is – (a) low-risk building work … (b) notifiable building work … or (c) emergency work"* (Building Act s 128). The categories come from the Director's determination (s 20(1)(a): *"types of building work, plumbing work or demolition work that is low-risk work, notifiable work or permit work"*). The determination was not read.
- Notifiable building work needs a licensed builder and a building surveyor (ss 94–95).

**12. Security of payment — VERIFIED (round 1 confirmed, with nuance)**
- SOP Act 2009 s 7: it applies to *"any building or construction contract"*. There is **no** residential or owner-occupier exclusion.
- Payment schedule deadline (s 19(3)): *"the day 20 business days after the payment claim is served … if – (i) the claim relates to a residential structure to be built on land; and (ii) the respondent is the owner of the land; and (iii) the respondent is not a building practitioner; or (b) is, in any other case, the day 10 business days"*. The deadline is the earlier of this and the contract time (s 19(2)).
- Nuance: the 20-day period is worded for a structure *"to be built"*. For re-roofing an existing house, 10 business days may apply. Treat it as **unclear** and default to telling the homeowner 20 business days (conservative for the claimant).

**13. Other TAS prompts — VERIFIED (WHS Regs 2022)**
- HRCW includes work that *"involves a risk of a person falling more than 2 metres"* (reg 291). A SWMS is required (reg 299).
- Asbestos:
  - Licensed removalist required unless *"10 square metres or less of non-friable asbestos"* (reg 458(2)). There is **no** VIC-style 1-hour cap.
  - Notify the regulator *"at least 5 days before"* licensed removal (reg 466(1)).
  - *"Refurbishment of residential premises"*: all asbestos likely to be disturbed must be identified and, so far as reasonably practicable, removed before the work starts (reg 457).
- Keep records of building services work *"for at least 10 years"* (BSW Regs reg 6).
- Note: the BSW Regs 2016 are reported (secondary) to expire Dec 2026. Watch for replacement regs, as happened with the RBWCDR Regs.

---

## JSON — VIC (contracts signed 1 Jul 2026 – 30 Mar 2027; see `status_notes` for 31 Mar 2027 changes)

```json
{
  "state": "VIC",
  "regulator": "Building and Plumbing Commission (BPC) — legal entity still the Victorian Building Authority under Building Act 1993 s 3 until the Building and Plumbing Administration and Enforcement Act 2026 commences (latest 1 Dec 2027); contract forms currently approved by the Director of Consumer Affairs Victoria",
  "act": "Domestic Building Contracts Act 1995 (v094, 1 Jul 2026) + Domestic Building Contracts Regulations 2017; Building Act 1993 Pt 9A, Pt 11, Pt 12A; Plumbing Regulations 2018",
  "licence": {
    "threshold_aud": 10000,
    "classes": ["Domestic builder (limited to roof tiling)", "Domestic builder (unlimited)", "Plumber — Roofing (stormwater) class, licensed (required to issue compliance certificates) or registered"],
    "show_on": ["contract", "ads", "quote"],
    "source": "DBC Act s 29(1), s 31(1)(f); Building Act s 169H, s 221D, s 221E; Building Regs 2018 reg 262, Sch 1 cl 6(z); DBC Regs reg 6 ($10,000; becomes $20,000 on 31 Mar 2027 per S.R. 175/2026 reg 7). Builder threshold is 'more than' the amount. 'quote' is an inference from s 169H 'written statement offering to carry out domestic building work'. No statutory ad/licence-number rule found for plumbers."
  },
  "written_contract": {
    "threshold_aud": 10000,
    "tiers": ["<= $10,000: no statutory writing requirement (Part 2 only: deposit cap, warranties, copy of documents s 25(b))", "> $10,000: major domestic building contract — written, s 31 contents, signed by both or no effect"],
    "source": "DBC Act s 3(1), s 25, s 31; DBC Regs reg 6. From 31 Mar 2027: all contracts written (new s 7A), major threshold > $20,000."
  },
  "deposit": {
    "rules": [
      {"max_contract_aud": 19999.99, "pct": 10, "cap_aud": null},
      {"max_contract_aud": null, "pct": 5, "cap_aud": null}
    ],
    "source": "DBC Act s 11(1): 5% if contract price $20,000 or more; 10% if less than $20,000; applies to all domestic building contracts. From 31 Mar 2027: flat 10% for non-modern-methods contracts (DBC Regs reg 9A inserted by S.R. 175/2026)."
  },
  "cooling_off": {
    "applies_over_aud": 10000,
    "length": "5",
    "unit": "business_days",
    "starts": "after the building owner receives a copy of the signed (major) contract; 'clear' business days; excludes Sat, Sun and Victoria-wide public holidays",
    "notice_text": "Notice to Building Owner: You may end this contract within five clear business days after receipt by you of a signed copy of the contract by filling in the notice below and giving it to the Builder in one of the following ways: (1) Personally (2) Leaving it at his or her address set out in the contract with a person who appears to be at least 16 years old (3) Sending it by pre-paid certified mail to the address set out in this contract (4) Sending it by facsimile to the facsimile number (if any) set out in this contract.",
    "source": "DBC Act s 31(1)(n), s 34, s 35; Director of CAV approved notice reproduced in CAV model contract https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/building-and-renovating/building-contract-for-new-homes.docx. Exceptions: prior substantially-same contract; independent legal advice (legal-advice exception removed from 31 Mar 2027). Builder may keep $100 + approved out-of-pocket expenses."
  },
  "insurance": {
    "scheme": "First Resort Home Warranty Scheme (statutory insurance scheme, Building Act Pt 9A) — contracts signed on/after 1 Jul 2026; Domestic Building Insurance (> $16,000) for contracts signed before 1 Jul 2026",
    "threshold_aud": 20000,
    "before": "Builder pays premium to the Authority before the earlier of 10 business days after the contract is entered into or work starting (s 137O); the Authority issues the notice of cover to the owner (s 137T); no builder-issued certificate",
    "roofing_only_covered": "depends",
    "source": "Building Act s 3(1) 'insurable domestic building contract' (> $20,000), ss 137I, 137J, 137O, 137R, 137T; Building (Statutory Insurance Scheme) Regulations 2026 regs 6, 8, 21, 50. Covered: tile re-roof / mixed contracts by registered builder > $20,000. Not covered: plumbing-only (metal roof/gutters) and paint-only contracts (not domestic building work, DBC Regs reg 7(f),(h))."
  },
  "documents": [
    {"name": "Domestic Building Consumer Guide (contract information statement, s 29A)", "when": "before the owner signs a major domestic building contract", "source": "DBC Act s 29A; https://www.consumer.vic.gov.au/housing/building-and-renovating/plan-and-manage-your-building-project/domestic-building-consumer-guide"},
    {"name": "Approved checklist (in contract)", "when": "in the major contract", "source": "DBC Act s 31(1)(r)"},
    {"name": "Cooling-off notice (approved form)", "when": "in the major contract", "source": "DBC Act s 31(1)(n)"},
    {"name": "Implied warranties ss 8 and 20 set out in contract (statutory warranty statement)", "when": "in the major contract", "source": "DBC Act s 31(1)(q)"},
    {"name": "Price-may-change warning (approved form) next to price", "when": "if price can vary", "source": "DBC Act s 33"},
    {"name": "Signed copy of contract", "when": "within 5 clear business days of entering contract", "source": "DBC Act s 25"},
    {"name": "Statutory insurance scheme information (reg 12A)", "when": "in major contracts from 31 Mar 2027", "source": "DBC Regs reg 12A inserted by S.R. 175/2026"},
    {"name": "Variation notice + signed owner consent (builder variations); owner variation notice / builder response", "when": "before giving effect to a variation", "source": "DBC Act ss 37–38 (single variation agreement from 31 Mar 2027)"},
    {"name": "Progress claims must relate directly to work progress (non-table contracts)", "when": "each claim", "source": "DBC Act s 40(3)"},
    {"name": "Occupancy permit or certificate of final inspection (where permit work)", "when": "before demanding final payment", "source": "DBC Act s 42"},
    {"name": "Plumbing compliance certificate", "when": "within 5 days of completion, total value >= $750", "source": "Building Act s 221ZH; Plumbing Regs reg 47"}
  ],
  "statutory_warranty": [
    {"type": "Implied warranties s 8 (no fixed period) — building action limitation 10 years from occupancy permit or certificate of final inspection", "years": 10, "source": "DBC Act s 8, endnote [5] citing Building Act s 134"},
    {"type": "Home Warranty cover — major defects (structural, waterproofing/weatherproofing incl. roof)", "years": 6, "source": "SIS Regs reg 8(1)(a), reg 4"},
    {"type": "Home Warranty cover — other defects", "years": 2, "source": "SIS Regs reg 8(1)(b)"}
  ],
  "compliance_certificate": {
    "name": "Plumbing compliance certificate (roofing (stormwater) work)",
    "threshold_aud": 750,
    "deadline": "within 5 days of completion: give signed certificate to the customer AND lodge electronically with the Authority (same 5-day window)",
    "source": "Building Act s 221ZH(1)(a),(2); Plumbing Regs 2018 regs 14A, 47. Threshold is '$750 or more' (total value incl. materials, labour)."
  },
  "permit": {
    "summary": "No building permit for repair/renewal/maintenance of part of an existing building if it does not adversely affect structural soundness, does not remove/alter supporting elements, and uses 'materials commonly used for the same purpose as the material being replaced' (Sch 3 item 3). No roof-specific item. Batten/structural replacement or material change → treat as needing building-surveyor check (council guidance, secondary). Heritage/planning overlay not verified.",
    "source": "Building Regulations 2018 (v032) Sch 3 item 3, reg 23"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "no",
    "schedule_days": 10,
    "source": "SOP Act 2002 (v015) s 7(2)(b),(ba) (domestic building contracts with owners excluded unless owner in business of building residences); s 15(4) 10 business days or contract time, whichever earlier. Plumbing-only roofing contracts with homeowners: unclear under s 7(2)(ba)."
  },
  "other_prompts": [
    {"text": "Job type routing: metal roof/flashing/gutter/downpipe-only = plumbing (roofing (stormwater)) → DBC Act does not apply; tile/slate/concrete/terracotta roof work = domestic building work (roof tiling class); cleaning/painting stormwater items excluded from plumbing; mixed contracts = DBC Act applies.", "source": "Plumbing Regs 2018 reg 25; DBC Regs reg 7"},
    {"text": "SWMS required before work with risk of fall > 2 m; fall-control hierarchy (passive fall prevention first); documented rescue/emergency procedures before using any reg 44(2)-(5) control.", "source": "OHS Regs 2017 regs 44, 49, 322, 327, 329"},
    {"text": "Asbestos: unlicensed removal only if non-friable <= 10 m2 AND no more than 1 hour of removal per 7 days; licensed removalist notifies WorkSafe >= 24 h before (<= 10 m2 non-friable) or >= 5 days before (other); give copy of notice to the commissioning person.", "source": "OHS Regs 2017 regs 250, 298"},
    {"text": "Show builder registration name and number clearly legible in every advertisement or written statement offering domestic building work.", "source": "Building Act s 169H; Building Regs reg 262"},
    {"text": "Date-switch rules on 31 Mar 2027: major threshold $20,000; deposit flat 10%; all contracts in writing (s 7A); legal-advice cooling-off exception removed; new variation process; cost escalation clauses only >= $1,000,000.", "source": "Domestic Building Contracts Amendment Act 2025 (as amended by Consumer Legislation Amendment Act 2026 Pt 12B); S.R. 175/2026"}
  ],
  "status_notes": "All values from authorised consolidated legislation downloaded from www.legislation.vic.gov.au on 2026-11-06 plus CAV pages. BPC website blocked (Cloudflare challenge) so no BPC page was quoted. GST treatment of $10,000/$20,000 thresholds not stated in the Acts (permit forms say costs include GST; BPC summary snippet says HW value includes GST) — treat as GST-inclusive. Not verified: Government Gazette proclamations bringing the 2025 Amendment Act into force before 31 Mar 2027; heritage/planning permits; whether paint/coat-only restoration of tiles is 'painting' (inference); start of 10-year limitation for un-permitted work; ACL unsolicited-agreement rules (not re-verified)."
}
```

## JSON — TAS

```json
{
  "state": "TAS",
  "regulator": "Director of Building Control (RBWCDR Act; Building Act 2016) and Administrator of Occupational Licensing (OL Act 2005), via Consumer, Building and Occupational Services (CBOS), Department of Justice; disputes: Director mediation then TASCAT",
  "act": "Residential Building Work Contracts and Dispute Resolution Act 2016 + Residential Building Work Contracts and Dispute Resolution Regulations 2026 (SR 2026-085, from 2 Nov 2026); Occupational Licensing Act 2005; Building Act 2016",
  "licence": {
    "threshold_aud": null,
    "classes": ["Building services licence (builder class per Building Services Work Determination) — not read", "Plumber practitioner licence incl. (restricted) — roof (stormwater) prescribed plumbing work", "Plumbing contractor licence (to carry on business)"],
    "show_on": ["contract"],
    "source": "OL Act ss 21, 22, 22A, 35; OL (Building Services Work) Regs 2016 Sch 1 (excludes low-risk work not requiring a licensed builder); OL (Plumbing Work) Regs 2021 reg 4(1)(a)(iv); RBWCDR Act s 14(1)(d). No statutory dollar threshold; low-risk categories are in the Director's determination (CBOS, not read). No advertising licence-number rule found."
  },
  "written_contract": {
    "threshold_aud": 20000,
    "tiers": ["< $20,000: Act does not apply", ">= $20,000: written (or reduced to writing within 5 business days and before work), signed by both, s 14 contents, consumer guide attached"],
    "source": "RBWCDR Act ss 9(a), 13, 14, 15; no greater amount prescribed in 2026 Regs"
  },
  "deposit": {
    "rules": [
      {"max_contract_aud": 49999.99, "pct": 10, "cap_aud": null},
      {"max_contract_aud": null, "pct": 5, "cap_aud": null},
      {"max_contract_aud": null, "pct": 20, "cap_aud": null}
    ],
    "source": "RBWCDR Act s 41(2) (10% below set amount; 5% at or above; 20% where off-site work > 50% of price); 2026 Regs reg 6 set amount $50,000. Only for contracts >= $20,000 (s 9)."
  },
  "cooling_off": {
    "applies_over_aud": 20000,
    "length": "5",
    "unit": "business_days",
    "starts": "after the 'receipt day' = day the owner has received BOTH a signed copy of the contract and the residential building consumer guide (later of the two)",
    "notice_text": "",
    "source": "RBWCDR Act ss 33–38. No prescribed wording. Withdrawal notice must be written, signed, state that the owner withdraws and the section relied on (s 36). Exceptions: prior substantially-same contract; paid formal legal advice (s 34). If guide not given: withdraw within 7 days of becoming aware (s 35). Contractor may retain $100 + reasonable out-of-pocket expenses (s 37). applies_over_aud = applies at $20,000 or more."
  },
  "insurance": {
    "scheme": "None in force (Housing Indemnity Act 1992 repealed; Residential Building (Home Warranty Insurance Amendments) Act 2023 passed but not commenced as at current consolidation)",
    "threshold_aud": null,
    "before": "",
    "roofing_only_covered": "no",
    "source": "RBWCDR Act long title; https://www.legislation.tas.gov.au/view/whole/html/asmade/act-2023-025 (commences on proclamation; would require certificate copy to owner within 5 business days of contract)"
  },
  "documents": [
    {"name": "Residential building consumer guide (Director-approved)", "when": "before entering the contract, and attached to the contract", "source": "RBWCDR Act ss 39(1), 14(1)(k), 81"},
    {"name": "Required checklist (summary of contract provisions)", "when": "in the contract", "source": "RBWCDR Act s 14(1)(j), (3)"},
    {"name": "Part 6 statutory warranties set out in contract", "when": "in the contract", "source": "RBWCDR Act s 14(1)(h)"},
    {"name": "Signed copy of contract + consumer guide", "when": "within 5 business days of entering contract", "source": "RBWCDR Act s 16"},
    {"name": "Commencement notice (start date + estimated practical completion)", "when": "within 10 business days after work begins", "source": "RBWCDR Act s 40"},
    {"name": "Written, signed variation document (s 18(2) contents); copy to owner", "when": "before added/owner-requested work starts; copy within 5 business days", "source": "RBWCDR Act ss 17–20"},
    {"name": "Progress payments only directly related to progress on site", "when": "each claim", "source": "RBWCDR Act s 42"},
    {"name": "Notice of practical completion", "when": "within 10 business days after practical completion", "source": "RBWCDR Act s 43"},
    {"name": "Defects document; rectify agreed minor defects", "when": "as soon as practicable; rectify within 6 months", "source": "RBWCDR Act s 44"},
    {"name": "Standard of work certificate (notifiable plumbing work) to permit authority + copy to owner", "when": "within the prescribed period after completion (period not verified)", "source": "Building Act 2016 s 114"}
  ],
  "statutory_warranty": [
    {"type": "Implied statutory warranties (Part 6) — proceedings limitation from date of practical completion", "years": 6, "source": "RBWCDR Act ss 22–32"}
  ],
  "compliance_certificate": {
    "name": "Notifiable plumbing work: notice of work + certificate of likely compliance before start; completion notification; standard of work certificate (category of roof stormwater work not verified)",
    "threshold_aud": null,
    "deadline": "",
    "source": "Building Act 2016 ss 105–115, 154; categories in Director of Building Control determination (not read)"
  },
  "permit": {
    "summary": "All building work is permit work unless the Director's determination makes it low-risk or notifiable (or it is emergency work). Re-roofing category not verified.",
    "source": "Building Act 2016 ss 20, 91, 93, 128"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "yes",
    "schedule_days": 10,
    "source": "SOP Act 2009 s 7 (no residential exclusion); s 19(3): 20 business days if claim relates to a residential structure to be built on land and respondent is the (non-practitioner) owner, otherwise 10 business days; earlier contract time prevails (s 19(2))"
  },
  "other_prompts": [
    {"text": "SWMS required for HRCW with fall risk > 2 m.", "source": "WHS Regs 2022 (Tas) regs 291, 299"},
    {"text": "Asbestos: licensed removalist unless <= 10 m2 non-friable (then competent trained person); licensed removalist notifies regulator >= 5 days before; identify (and where practicable remove) asbestos before refurbishing residential premises.", "source": "WHS Regs 2022 (Tas) regs 457, 458, 466"},
    {"text": "Keep records of building services work for at least 10 years.", "source": "OL (Building Services Work) Regs 2016 reg 6"},
    {"text": "Watch flags: proclamation of Home Warranty Insurance Amendments Act 2023; replacement of OL (Building Services Work) Regs 2016 (reported expiry Dec 2026).", "source": "act-2023-025; secondary (Australian Institute of Architects submission)"}
  ],
  "status_notes": "Legislation read on www.legislation.tas.gov.au 2026-11-06. CBOS website blocked (Cloudflare challenge), so the consumer guide, Director determinations (building/plumbing categories, s 11A contract provisions), Building Services Work Determination (licence classes, low-risk thresholds) and plumbing work determination were NOT read — licence threshold, roof-plumbing restricted scope, permit/plumbing categories for re-roofing and the standard-of-work-certificate period remain null/unverified. GST treatment of the $20,000/$50,000 amounts not stated (treat as GST-inclusive). licence.show_on lists only what the statute requires (contract)."
}
```

---

## What changed vs round-1 notes (VIC, TAS)

**VIC**
- **NEW / critical:** the rules change on **31 Mar 2027**. The 2025 Amendment Act's forced commencement moved from 1 Dec 2026 to 31 Mar 2027 (Consumer Legislation Amendment Act 2026). The Amendment Regulations S.R. 175/2026 commence 31 Mar 2027 and set:
  - major contract threshold **$20,000**;
  - deposit **flat 10%**;
  - every contract in writing;
  - no legal-advice exception to cooling-off.
  - Round 1's "proposal, not law, by March 2027 (secondary)" is now **made law with a fixed date**.
- **RESOLVED:** the roofing single-trade exemption. Plumbing-only roofing (metal roofs, flashings, gutters, downpipes) is exempt from the DBC Act (Regs reg 7(h) plus Plumbing Regs reg 25). Tile, slate and concrete roofing is not plumbing, so it is covered. Round 1's "conservative default: treat all roofing over $10k as major contracts" can now be refined by job type.
- **CORRECTED (nuance):** "BPC replaced the VBA". In force, the legal entity is still the VBA. The statutory BPC is created by the Building and Plumbing Administration and Enforcement Act 2026, commencing on proclamation, latest 1 Dec 2027.
- **CORRECTED:** compliance certificate trigger is **$750 or more** (not "exceeds $750"). It is **one** 5-day window to give the certificate to the customer **and** lodge it with the Authority (not two steps).
- **CORRECTED:** the cooling-off section is **s 34** (and s 35 for a missing notice). The contents section is s 31. This contradicts the brief's "ss 32–33".
- **VERIFIED:**
  - deposit s 11 (5% at $20,000 or more, 10% below), for all domestic contracts;
  - Home Warranty threshold "more than $20,000" for contracts from 1 Jul 2026 (DBI over $16,000 before);
  - 10-year limitation;
  - SOP excludes homeowners, with a 10-business-day schedule;
  - fall SWMS over 2 m;
  - asbestos 24 h / 5 days.
- **NEW:**
  - scheme name "First Resort Home Warranty Scheme";
  - premium deadline (10 business days or start of work, whichever is earlier); the Authority (not the builder) issues the notice of cover;
  - $400,000 cap;
  - roof leaks are 6-year "major defects";
  - approved cooling-off notice wording;
  - s 169H registration number in ads;
  - Building Regs Sch 3 item 3 permit-exemption text;
  - VIC 1-hour-per-7-days cap on unlicensed asbestos removal.

**TAS**
- **NEW / critical:** the RBWCDR Regulations 2016 **expired**. They were replaced by the **RBWCDR Regulations 2026 (SR 2026-085), in effect 2 Nov 2026**. The set amount stays $50,000.
- **VERIFIED (upgraded from template-only):** deposit 10% under $50,000, 5% at $50,000 or more, plus a new item: **20% where off-site work is over 50%**.
- **VERIFIED (previously unverified):**
  - Act applies at **$20,000 or more** (s 9);
  - no single-trade exemption, so roofing is covered;
  - written-contract duty;
  - 6-year warranty limitation from practical completion;
  - cooling-off 5 business days from the later of receiving the signed contract **and** the consumer guide;
  - exceptions (prior contract; paid formal legal advice);
  - $100 retainable amount.
- **CORRECTED:** the 10-day / 14-day cooling-off claims are wrong.
- **VERIFIED with nuance:** there is no home warranty in force. The 2023 HWI Amendments Act passed but is uncommenced. SOP covers owner-occupiers. The 20-business-day schedule period is worded for a structure *"to be built"*, so re-roofs may be 10 days.
- **NEW:**
  - commencement notice within 10 business days of starting;
  - notice of practical completion within 10 business days;
  - defects document and 6-month rectification;
  - variation document rules;
  - licence number in the contract (s 14(1)(d));
  - unlicensed contractors cannot recover payment (OL Act s 35);
  - WHS regs 291, 299, 457, 458, 466.

## Still unverified (with reason)
- **All CBOS (TAS) and BPC (VIC) web pages:** blocked by a Cloudflare JS challenge, not bypassed. This leaves unread:
  - TAS Director determinations (building and plumbing categories for re-roofing and roof plumbing, low-risk thresholds, s 11A contract provisions);
  - the Building Services Work Determination (licence classes) and the restricted roof-plumbing scope;
  - the TAS consumer guide text;
  - the "prescribed period" for the TAS standard of work certificate;
  - BPC guidance pages.
- **VIC:** Government Gazette proclamations (any early commencement of the 2025 Act); heritage and planning permits; GST treatment of thresholds (treated as GST-inclusive by inference); whether coating a tile roof is "painting"; the start date of the 10-year limitation for un-permitted work.
- **TAS:** GST treatment; whether metal roof cladding (as opposed to drainage) is plumbing; the BSW Regs 2016 expiry and replacement status.
- **Not re-verified this round:** the ACL unsolicited-consumer-agreement rules, which apply nationally.
