# VERIFIED RULES — VIC and TAS (round 2, primary-source verification)

> Status: IN PROGRESS (started 2026-11-06). VIC legislation group done; VIC regulator pages and TAS pending.
>
> **Method.** WebFetch could not resolve any of the brief's hosts (ENOTFOUND). `curl` through the session's agent proxy (default curl user agent, no spoofing) could reach www.legislation.vic.gov.au, www.consumer.vic.gov.au and www.legislation.tas.gov.au. Authorised consolidated versions were downloaded as DOCX from www.legislation.vic.gov.au/sites/default/files/... (the same files the site links on content.legislation.vic.gov.au, which the proxy blocks) and converted to text with pandoc. **Blocked:** www.bpc.vic.gov.au (Cloudflare "Just a moment..." JS challenge, HTTP 403, not bypassed); bpc.vic.gov.au, cbos.tas.gov.au and austlii (proxy CONNECT 403); www.cbos.tas.gov.au (connection reset).
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

(Item-by-item block written below once regulator pages are checked.)

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

## TAS — VERIFIED RULES (in progress)

Sources read (via curl through the agent proxy, 2026-11-06; the TAS site's internal date showed 2026-11-07):
- Residential Building Work Contracts and Dispute Resolution Act 2016 (RBWCDR Act), in-force version from **16 Jul 2024** — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2016-032
- **Residential Building Work Contracts and Dispute Resolution Regulations 2026** (SR 2026-085, made 26 Oct 2026, *"take effect on 2 November 2026"*, notified in the Gazette 28 Oct 2026) — https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2026-085
  - These replace the 2016 Regulations (SR 2016-089), which the site now marks *"(Expired)"*.
- Residential Building (Home Warranty Insurance Amendments) Act 2023 (as made, assent 16 Oct 2023, commences on proclamation) — https://www.legislation.tas.gov.au/view/whole/html/asmade/act-2023-025
- www.cbos.tas.gov.au: connection reset by the proxy, so it could not be read. cbos.tas.gov.au (non-www): proxy 403.
