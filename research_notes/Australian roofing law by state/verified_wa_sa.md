# Verified rules: WA and SA (round 2, primary-source check)

> **Status:** WA and SA sections complete (checked 2026-11-06). See the summary of changes from round 1 at the end.
>
> **Method.** WebFetch could not resolve any of the listed hosts in this session (`ENOTFOUND`), but `curl` through the session's configured HTTPS proxy reached them. All WA statute text below was downloaded from the official "HTML" consolidated versions on www.legislation.wa.gov.au (default curl user agent; no blocks bypassed) and read in full for the relevant parts. **www.commerce.wa.gov.au now 301-redirects to www.wa.gov.au, which is NOT reachable from this session**, so Building and Energy guidance pages and the WA factsheets were not re-read. WorkSafe WA was also unreachable. Where a value comes only from legislation, the "URL" is the legislation-site page for that instrument (the consolidated version page; the HTML file is served through `RedirectURL?OpenAgent&query=mrdoc_<n>.htm` from it).
>
> **WA instruments read (consolidated versions current on 2026-11-06):**
> - Home Building Contracts Act 1991 (HBC Act), version 04-h0-00, in force from 5 Apr 2023: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a352.html&view=consolidated (HTML mrdoc_45904)
> - Home Building Contracts Regulations 1992 (HBC Regs), version 03-k0-00, from 1 Sep 2025: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s4507.html&view=consolidated (mrdoc_48796)
> - Building Services (Registration) Act 2011 (BSR Act), 00-j0-00, from 21 Oct 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a146829.html&view=consolidated (mrdoc_49925)
> - Building Services (Registration) Regulations 2011 (BSR Regs), 02-aq0-00, from 1 Jul 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43838.html&view=consolidated (mrdoc_49615)
> - Building Act 2011: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a146834.html&view=consolidated
> - Building Regulations 2012, 04-ag0-00, from 1 Nov 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43955.html&view=consolidated (mrdoc_49954)
> - Plumbers Licensing Act 1995: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a869.html&view=consolidated
> - Plumbers Licensing and Plumbing Standards Regulations 2000 (PL Regs), 05-ah0-00, from 1 Jul 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s1820.html&view=consolidated (mrdoc_49686)
> - Building and Construction Industry (Security of Payment) Act 2021 (WA SOP Act), 00-f0-00, from 21 Oct 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_a147300.html&view=consolidated (mrdoc_49924)
> - Building and Construction Industry (Security of Payment) Regulations 2022, from 1 Jul 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53322.html&view=consolidated
> - Work Health and Safety (General) Regulations 2022 (WA WHS Regs), 01-c0-00, from 1 Jul 2026: https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html&view=consolidated (mrdoc_49725)
>
> Date checked for every WA item: **2026-11-06**.

---

## WA — VERIFIED RULES

### 1. Governing Act and regulator — VERIFIED (Acts); regulator name partly UNVERIFIED
- **Contracts:** Home Building Contracts Act 1991. Its long title says it regulates "contracts between consumers and builders for the performance of certain home building work, to make provision for home indemnity insurance". **Registration:** Building Services (Registration) Act 2011. **Permits:** Building Act 2011 and Building Regulations 2012. **Plumbing:** Plumbers Licensing Act 1995 and the PL Regs 2000 (Plumbers Licensing Board). **Payments:** Building and Construction Industry (Security of Payment) Act 2021.
- **Regulator:** the Building Commissioner (Building and Energy). The HBC Regs Sch 1 notice says complaints go to "the Building Commissioner at <https://www.wa.gov.au/organisation/building-and-energy/building-and-energy>". The legislation site lists the administering agency as the "Department of Local Government, Industry Regulation and Safety". This **CORRECTS** round 1, which said "DMIRS/DEMIRS". The current department name was not cross-checked on wa.gov.au, which is blocked here.

### 2. Does roofing-only work fall under the regime? — VERIFIED
- **Yes.** HBC Act s 3 defines *home building work* to include "(c) altering, improving or repairing a dwelling". A re-roof, roof restoration or roof repair on a house is therefore home building work. Gutters on an existing dwelling fall under "(d) … associated work in connection with … (ii) an existing dwelling".
- The Act's contract rules (Part 2) apply only to a *home building work contract*, which excludes:
  - cost plus contracts. These must instead be headed "cost plus contract" (s 14).
  - subcontracts.
  - contracts where the amount payable is $7,500 or less, or $500,000 or more (s 3, with HBC Regs r 2A: "(a) the prescribed amount for paragraph (b)(ii) … is $7 500; and (b) … (b)(iii) … is $500 000").
- The Sch 1 notice puts it this way: "contracts for home building work where the contract price is more than $7 500 and less than $500 000".
- **There is no single-trade or specialist exemption** in the Act. HII (item 7) has its own carve-outs.

### 3. Licence / registration — VERIFIED (law); roofing application is an INFERENCE
- **Builder registration (BSR Act s 7; BSR Regs r 4, r 13).** The prescribed building service is "builder work as a principal builder". *Builder work* means building work:
  - "(a) for which a building permit is required; and"
  - "(b) with a value … of — (i) if the work relates to a … Class 10a building … $50 000 or more; or (ii) otherwise — $20 000 or more; and"
  - "(c) carried out in an area of the State set out in Schedule 3". That area is the South West Land Division plus listed towns, including Geraldton, Kalgoorlie-Boulder, Esperance, Karratha, Port Hedland, Broome, Carnarvon and Exmouth.
  - Contracts that are "substantially a single undertaking" are added together to find the value (r 13(2)).
- **For a roofer, registration as a building contractor is required only when all three tests are met:** the job needs a permit, it is worth $20,000 or more (house; $50,000 for a Class 10a shed or garage), and it is in a Schedule 3 area. A like-for-like re-roof that needs no permit (see item 11) does not need registration whatever its value. Round 1 said ">$20,000 + permit", which is **CORRECTED**: the test is "$20,000 or more", plus the area test.
- **Registration classes:** building contractor (individual / partnership / company) and building practitioner (BSR Regs r 6). WA has no roofing-specific registration class. Plumbing licences are a separate system (see item 10).
- **Licence number display:**
  - **Ads — VERIFIED.** BSR Act s 8: "a building service contractor must cause the contractor's registration number to appear in any advertisement published by the contractor in respect of availability of the contractor to carry out prescribed building services. Penalty: a fine of $5 000." This applies to registered contractors.
  - **Site sign — VERIFIED.** BSR Regs r 21: a principal builder doing builder work must display a site sign showing "the name and registration number of the building contractor", a contact phone number, and "the name and registration number of the nominated supervisor".
  - **Quotes and contracts — no rule found.** Neither the HBC Act nor the BSR Act/Regs require the number on quotes or contracts. Showing it is best practice only.

### 4. Written contract threshold and tiers — VERIFIED
- **Over $7,500 and under $500,000:** the contract must be in writing, set out all its terms, show its date, and be signed by builder and owner (HBC Act s 4(1)).
  - The owner must get the prescribed notice **before signing** (s 4(3)).
  - The owner must get a copy of the signed contract "as soon as is reasonably practicable" after signing and "before the home building work is commenced" (s 5).
  - If s 4(1) is not met, the owner may terminate (s 4(5), s 19).
- **$7,500 or less, or $500,000 or more:** no HBC Act writing requirement. HII still applies over $20,000 (item 7).
- The source does not say whether the figures include GST. The Act uses "the amount stated in the contract as being payable", so treat the figures as the total contract price including GST (inference).
- There are no further small/major tiers inside the HBC Act. The thresholds that matter are $7.5k (contract rules), $20k (HII and registration) and $500k.

### 5. Maximum deposit — VERIFIED
- HBC Act s 10(1)(a)(i): "a deposit of not more than 6.5% of the total amount payable to the builder under the contract". The cap applies only within HBC Act scope ($7,500 < price < $500,000).
- The 20% cabinetry exception (HBC Regs r 3A) does not apply to roofing.
- Penalty: $10,000. A contract that breaches the cap may be terminated by the owner (s 10(4)).
- After work starts, the builder may take only "a genuine progress payment for work already performed or materials or services already supplied" (s 10(1)(b), s 10(5)).
- Where HII applies, no payment can be demanded, deposit included, until the HII certificate is given (item 7).

### 6. Cooling-off — VERIFIED: no statutory building-contract cooling-off
- The HBC Act and the Sch 1 owner notice were read in full. Neither contains a cooling-off right. The owner's termination rights are tied to breaches (s 4(5), 10(4), 14(3)) or to Sch 1 events, such as a price rise over 5% after permit delay.
- **The ACL unsolicited consumer agreement rule (10 business days) still applies** to door-knocked or phone-sold jobs. That rule is federal and was not re-verified here.
- Round 1 said "none found", which is now confirmed.

### 7. Home indemnity insurance (HII) — VERIFIED
- **Scheme:** home indemnity insurance under HBC Act Part 3A. Corresponding cover from an approved fund is also allowed.
- **Threshold:** HII applies only to work whose cost is **more than $20,000**. The Act sets a $10,000 "minimum amount … or such other amount as is prescribed", and HBC Regs r 7 says "the minimum amount is prescribed to be $20 000".
- **When:** s 25C(2) says the owner must be given the certificate "prior to a demand from the builder for any payment … including any deposit". The Sch 1 notice adds: "Before commencing work or demanding any payment (including a deposit) from you, the builder must take out home indemnity insurance and give you a certificate".
- **Roofing-only work: depends.** s 25B(4A): HII "does not apply to residential building work if — (a) a building permit under the Building Act 2011 is not required for the work; or (b) if a building permit is required … the work is not … a prescribed building service under the [BSR Act]". The Sch 1 notice states the same exceptions in plain words: "(a) where no building permit is required for the work; or (b) … where registration as a builder is not required in order to carry out the work."
  - So a like-for-like re-roof that needs no permit needs **no HII**.
  - A permit-required re-roof worth over $20,000 in a Schedule 3 area **needs HII**.
  - Associated work on its own (for example gutters only) is excluded, unless it is part of a contract that includes dwelling work.
- **Cover amounts:** deposit loss up to $40,000 (r 7A). Minimum cover is $200,000 (r 7B). The maximum excess is $500 (r 5). Claims can be made "at any time before the end of a period of 6 years after the day of practical completion" (Sch 1).

### 8. Documents, progress payments, variations — VERIFIED
- **Before signing:** the prescribed "NOTICE FOR THE HOME OWNER" (HBC Regs Sch 1, under r 3 and Act s 4(2)). The full official text is in HBC Regs Sch 1, last amended SL 2025/144 from 1 Sep 2025. The software should reproduce it verbatim from the legislation site, not paraphrase it. Its opening reads: "A builder must give a copy of this notice to you, as the owner, before you sign a contract for home building work that is covered by the Home Building Contracts Act 1991."
- **Proof of receipt:** a receipt signed and dated by the owner is evidence of delivery of the notice and contract (s 6). Have the owner sign one.
- **After signing:** a copy of the signed contract (s 5). Then the HII certificate before any payment, where HII applies (s 25C(2)).
- **Variations:** must be in writing, setting out the terms and cost, dated, and signed by both parties. A copy goes to the owner before the varied work starts (s 7). Exception (s 8): a variation forced by a written direction under a written law, or by circumstances the builder could not reasonably foresee. These may proceed if the builder gives the owner a written statement of the reason and cost **within 10 working days**. Cost increases for labour or materials do not count as unforeseen.
- **No rise-and-fall clauses** (s 13). Exceptions: law or tax changes, and a start delayed beyond 45 working days without the builder at fault.
- **Prime cost items and provisional sums** must not be understated (s 12).
- **Progress payments:** only for work done or materials supplied. A payment made under a contract schedule of stages is presumed genuine (s 10(3)).
- **Permit condition:** every contract is conditional on the building permit being granted within 45 working days, unless no permit is needed (s 9, Sch 1).

### 9. Statutory warranty — CORRECTED
- WA has **no implied multi-year statutory warranty**, unlike NSW or VIC. Instead:
  - **4-month defects term (s 11(1)).** "It is a term of every contract that the builder is liable to make good at the cost of the builder defects … notified in writing to the builder within the period of 4 months commencing on the day of practical completion." The contract may give a longer period (s 11(1a)).
  - **6-year complaint window.** Under the Building Services (Complaint Resolution and Administration) Act 2011, as summarised in Sch 1, a complaint about faulty building services "must be made within 6 years from the time the building service is completed". Contract disputes must be lodged within 3 years.
  - **6-year HII claim window** (item 7).
- Round 1 said "WA: 6 years (single tier), secondary". That is **CORRECTED**: model it as a 4-month contractual make-good period plus a 6-year regulatory complaint window.

### 10. Roof plumbing compliance certificate — VERIFIED (by definition): roof stormwater is not licensed plumbing in WA
- Under the Plumbers Licensing Act 1995, "plumbing work means work of a kind specified to be water supply plumbing, sanitary plumbing or drainage plumbing".
- PL Regs r 4B limits *drainage plumbing work* to pipes "(a) below ground level; and (b) … to convey wastewater or other waste to — (i) a sewerage system; (ii) an apparatus for the treatment of sewage; or (iii) a greywater diversion device". Pipes under 65 mm are excluded.
- Sanitary plumbing (r 4A) covers wastewater. Water supply plumbing (r 4) covers supply of water.
- **So gutters, downpipes and roof stormwater are not "plumbing work" under WA plumbing licensing.** No plumbing licence, notice of intention or certificate of compliance is triggered by roof drainage alone. This is an inference from the definitions; no Board statement saying so was found, because commerce.wa.gov.au is blocked.
- **Exception:** connecting a rainwater tank to supply a building is water supply plumbing. It needs a licensed plumber or a restricted plumbing permit (rainwater storage) (r 13E).
- **Where licensed plumbing is done:** major plumbing work needs a notice of intention to the Board "at least 24 hours before the work commences" (r 41). After completion, a **certificate of compliance within 5 working days** goes to the Board, with a copy to the builder named on the permit or to the owner or occupier (r 42). Minor plumbing (repair or replacement of existing plumbing) is exempt from both.
- Round 1 left this as an open gap. It is now resolved, flagged as a definition-based inference.

### 11. Building permit for re-roofing — VERIFIED
- Building Regulations 2012 r 41(3) and Sch 4 cl 2 item 2. No building permit is needed for "Renovation, alteration, improvement, repair or maintenance of a building" if the work:
  - "(a) will not adversely affect the structural soundness … and does not include — (i) an increase or decrease in the floor area or height … (ii) underpinning or replacement of footings; or (iii) the removal or alteration of any element … contributing to the support of any other element";
  - "(b) is done using materials commonly used for the same purpose as the material being replaced";
  - "(c) will not change the use or classification";
  - "(d) will not adversely affect the safety and health of the occupants";
  - "(e) will not affect the way in which the building … complies with each building standard";
  - "(f) is not work of a kind to which section 76, 77, 78 or 79 relates" (work affecting other land);
  - "(g) is not subject to a protection order, heritage works permit, repair notice or repair order".
- **App logic:**
  - Like-for-like re-sheet or re-tile, same material type, no structural change: no permit (so no registration or HII).
  - A material change (for example tile to metal, which changes roof loads) or structural work (replacing rafters or trusses, or changing pitch or height): permit needed.
  - Heritage-listed property: permit needed.
  - Some rural districts need no permit at all (r 41(1), Sch 4 cl 1 table).
- **Bushfire-prone areas** (Building Regs r 31BA): bushfire standards apply to renovation or repair of an older house unless the work is valued under $20,000 or "does not increase the risk of ignition from bushfire attack".
- **Example:** in the Phillips prosecution (round 1), $27,445 of roof and gutter work "required a building permit". This was not re-read here because wa.gov.au is blocked.

### 12. Security of payment — VERIFIED
- **Owner-occupier work is excluded** in most cases. SOP Act s 10(1): the Act "does not apply to a construction contract for home building work if — (a) the principal is an individual; and (b) the work is not carried out in relation to multiple dwellings or for the purposes of a residential development business …; and (c) the value of the contract does not exceed $500 000 …; and (d) the contract is not between a head contractor and a subcontractor".
- **So the SOP Act does not apply** to a roofer's contract with an individual homeowner under $500,000. It **does apply** when the roofer is subcontracting to a builder or insurer's builder, and to company or developer owners.
- **Payment schedule:** due before the earlier of the time in the contract and "15 business days after the payment claim is made" (s 25(1)).
- **Payment due date:** if the contract is silent, 20 business days for principal to head contractor and 25 business days for payments to a subcontractor. A contract may set an earlier date (s 20).
- **Homeowner notice:** home building work payment claims over $500,000 for an individual must include a prescribed homeowner's notice (s 24(2)).

### 13. Other WA prompts — VERIFIED unless noted
- **Falls:**
  - High risk construction work includes work with "a risk of a person falling more than 2 metres" (WA WHS Regs r 291). A SWMS is required (r 299).
  - Reg 79 sets the fall-control hierarchy: fall prevention device, then work positioning, then fall arrest. Transitional r 722 says "During the period of 4 years and 6 months beginning on commencement day, regulation 79 does not apply to high risk construction work."
  - Commencement day is the start of the WHS Act 2020. Background knowledge puts that at 31 Mar 2022; this was not re-read today. **Reg 79 therefore applies to HRCW from about 1 Oct 2026.** This confirms round 1's "reg 79 from 1 Oct 2026" claim. Prompt: plan edge protection or scaffold first; harness only if those are not reasonably practicable.
- **Asbestos:**
  - A Class B licence is required to remove "more than 10 square metres of non‑friable asbestos or ACM" (r 487). Friable asbestos needs Class A (r 485).
  - The licensed removalist must notify the regulator "at least 5 days before" starting (r 466).
  - Disturbing asbestos is itself HRCW, so a SWMS is needed.
- **Demolition licence (WA-specific):** a Class 1 demolition licence is needed for "removal of an area of brittle or fragile roofing material in excess of 200 m2 from a structure if any part of the area to be removed is 10 metres or more above the lowest ground level" (r 142B(1)(i)). Prompt this on large, high fibro or skylight roofs.
- **Owner receipts:** prompt the owner to sign a dated receipt for the Sch 1 notice and the contract copy (s 6).
- **Cyclone regions:** wind region C/D appears throughout the Building Regs permit exemptions, which do not apply in C/D for several Class 10 items. Prompt for cyclone-region fixings in the north.

```json WA
{
  "state": "WA",
  "regulator": "Building Commissioner (Building and Energy); agency listed on legislation site: Department of Local Government, Industry Regulation and Safety; Plumbers Licensing Board for plumbing",
  "act": "Home Building Contracts Act 1991 (WA); Building Services (Registration) Act 2011; Building Act 2011; Plumbers Licensing Act 1995; Building and Construction Industry (Security of Payment) Act 2021",
  "licence": {
    "threshold_aud": 20000,
    "classes": ["building contractor (individual/partnership/company) — required only for builder work: permit-required work valued $20,000+ ($50,000+ for Class 10a) in a Schedule 3 area", "building practitioner (individual / nominated supervisor)", "plumbing licences NOT required for roof stormwater (gutters/downpipes) — only water supply, sanitary, below-ground drainage plumbing"],
    "show_on": ["ads", "site_sign"],
    "source": "BSR Act 2011 s 7, s 8; BSR Regs 2011 r 4, r 13, r 21, Sch 3; Plumbers Licensing and Plumbing Standards Regs 2000 r 4, 4A, 4B — https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43838.html&view=consolidated"
  },
  "written_contract": {
    "threshold_aud": 7500,
    "tiers": ["<=7,500: HBC Act not applicable", ">7,500 and <500,000: written, dated, signed contract + prescribed Sch 1 notice before signing + copy before work", ">=500,000: HBC Act not applicable", "cost plus: must be headed 'cost plus contract'"],
    "source": "HBC Act 1991 s 3, 4, 5, 14; HBC Regs 1992 r 2A — https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s4507.html&view=consolidated"
  },
  "deposit": {
    "rules": [{"max_contract_aud": 500000, "pct": 6.5, "cap_aud": null}],
    "source": "HBC Act 1991 s 10(1)(a)(i) (applies only to contracts >7,500 and <500,000); 20% applies only to cabinetry (r 3A)"
  },
  "cooling_off": {
    "applies_over_aud": null,
    "length": "none (no statutory building-contract cooling-off); ACL 10 business days for unsolicited agreements still applies",
    "unit": "business_days",
    "starts": "",
    "notice_text": "",
    "source": "HBC Act 1991 and HBC Regs Sch 1 read in full — no cooling-off provision"
  },
  "insurance": {
    "scheme": "Home indemnity insurance (HBC Act Part 3A) or corresponding cover from approved fund",
    "threshold_aud": 20000,
    "before": "before demanding any payment including deposit, and before commencing work — certificate in Minister-approved form given to owner",
    "roofing_only_covered": "depends",
    "source": "HBC Act s 25A ('minimum amount'), 25B(4A), 25C(2); HBC Regs r 7 ($20,000), r 7A ($40,000 deposit cover), r 7B ($200,000 min cover); exempt if no building permit required or registration not required"
  },
  "documents": [
    {"name": "Notice for the Home Owner (HBC Regs Sch 1, prescribed under s 4(2))", "when": "before owner signs contract", "source": "HBC Act s 4(3); HBC Regs r 3, Sch 1"},
    {"name": "Copy of signed contract", "when": "as soon as reasonably practicable after signing and before work starts", "source": "HBC Act s 5"},
    {"name": "Owner's signed and dated receipt for notice/contract (evidence)", "when": "on delivery", "source": "HBC Act s 6"},
    {"name": "Home indemnity insurance certificate", "when": "before any payment demand (incl. deposit) where HII applies", "source": "HBC Act s 25C(2)"},
    {"name": "Signed written variation (terms, cost, date) — copy to owner", "when": "before varied work starts", "source": "HBC Act s 7"},
    {"name": "Statement of reason and cost for statutory-direction/unforeseen variation", "when": "within 10 working days", "source": "HBC Act s 8(2)"}
  ],
  "statutory_warranty": [
    {"type": "Contractual make-good of defects notified in writing (implied term)", "years": 0.33, "source": "HBC Act s 11(1) — 4 months from practical completion"},
    {"type": "Complaint to Building Commissioner re faulty building service", "years": 6, "source": "Building Services (Complaint Resolution and Administration) Act 2011 as summarised in HBC Regs Sch 1"},
    {"type": "HII claim window", "years": 6, "source": "HBC Regs Sch 1"}
  ],
  "compliance_certificate": {
    "name": "Certificate of compliance (major plumbing work) — NOT triggered by roof stormwater/gutters, which are not plumbing work in WA",
    "threshold_aud": null,
    "deadline": "within 5 working days of completion of major plumbing work; notice of intention at least 24 hours before",
    "source": "PL Regs 2000 r 41, 42; r 4B definition of drainage plumbing work"
  },
  "permit": {
    "summary": "No building permit for repair/renovation/maintenance using materials commonly used for the same purpose, with no structural, height, classification or compliance change and no heritage order (Building Regs 2012 Sch 4 cl 2 item 2). Material change or structural work → permit. Bushfire standards apply to repairs on older homes if >= $20,000 and ignition risk increases.",
    "source": "Building Regulations 2012 r 41, r 31BA, Sch 4 — https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s43955.html&view=consolidated"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "no",
    "schedule_days": 15,
    "source": "WA SOP Act 2021 s 10(1) (excluded: individual principal, not multiple dwellings/development, <=$500,000, not a subcontract), s 25(1) (15 business days), s 20 (due 20/25 business days, or contract date)"
  },
  "other_prompts": [
    {"text": "Fall risk > 2 m = HRCW: SWMS required; from ~1 Oct 2026 reg 79 hierarchy (fall prevention device > work positioning > fall arrest) applies to HRCW", "source": "WA WHS (General) Regs 2022 r 79, 291, 299, 722"},
    {"text": "Asbestos: >10 m2 non-friable needs Class B licence; licensed removalist notifies regulator 5 days before", "source": "WA WHS Regs r 466, 487"},
    {"text": "Removing >200 m2 brittle/fragile roofing where any part is >=10 m high needs a Class 1 demolition licence", "source": "WA WHS Regs r 142B(1)(i)"},
    {"text": "Registration number must appear in ads (registered contractors); site sign with contractor and nominated supervisor numbers on builder-work jobs", "source": "BSR Act s 8; BSR Regs r 21"},
    {"text": "Contract is conditional on building permit within 45 working days where a permit is needed", "source": "HBC Act s 9"},
    {"text": "No rise-and-fall clauses; PC/provisional sums must not be understated", "source": "HBC Act s 12, 13"}
  ],
  "status_notes": "All values from consolidated WA legislation read 2026-11-06. GST treatment of thresholds not stated in source (Act uses 'amount stated in the contract as being payable'). commerce.wa.gov.au redirects to www.wa.gov.au, which is blocked in this session, so Building and Energy guidance, the HII certificate form and the Phillips prosecution page were not re-read. Roof stormwater not being plumbing work is inferred from PL Regs definitions. Reg 79 HRCW start date depends on WHS Act 2020 commencement (31 Mar 2022, background knowledge)."
}
```

---

## SA — VERIFIED RULES

> **SA instruments read** (authorised PDFs from www.legislation.sa.gov.au, converted with pdftotext; date checked **2026-11-06**):
> - Building Work Contractors Act 1995 (BWC Act), version 15.1.2026: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-work-contractors-act-1995/current/1995.87.auth.pdf
> - **Building Work Contractors Regulations 2026** (BWC Regs 2026), version 1.9.2026. They commenced **1 September 2026** (r 2) and repealed the 2011 Regulations (Sch 3). Gazette 30.7.2026 p2421: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-work-contractors-regulations-2026/current/2026.58.auth.pdf
> - Plumbers, Gas Fitters and Electricians Act 1995 (PGE Act), 15.1.2026: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/plumbers-gas-fitters-and-electricians-act-1995/current/1995.25.auth.pdf ; PGE Regulations 2025, 7.8.2025: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/plumbers-gas-fitters-and-electricians-regulations-2025/current/2025.86.auth.pdf
> - Building and Construction Industry Security of Payment Act 2009 (SA SOP Act), current version 10.12.2011: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-and-construction-industry-security-of-payment-act-2009/current/2009.77.auth.pdf ; SOP Regulations 2026 (from 1.9.2026): https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-and-construction-industry-security-of-payment-regulations-2026/current/2026.57.auth.pdf
> - Planning, Development and Infrastructure Act 2016 (PDI Act), 30.7.2026: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/planning-development-and-infrastructure-act-2016/current/2016.14.auth.pdf ; PDI (General) Regulations 2017, 29.10.2026: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/planning-development-and-infrastructure-general-regulations-2017/current/2017.24.auth.pdf
> - Work Health and Safety Regulations 2012 (SA), 1.7.2026: https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/work-health-and-safety-regulations-2012/current/2012.268.auth.pdf
> - CBS guidance PDFs, read for cross-checking only; the statute prevails where they differ:
>   - "Working as a builder in SA" v3.1, Sept 2026: https://www.cbs.sa.gov.au/documents/working_as_a_builder_in_SA.pdf
>   - "Building licences FAQs", Nov 2025: https://www.cbs.sa.gov.au/documents/occlicensing/Building-licence-faqs.pdf
>   - "Building work in SA: what you need to know", May 2026: https://www.cbs.sa.gov.au/documents/Building-work-in-SA-what-you-need-to-know.pdf
>   - Form 1 PDF (Sept 2024): https://www.cbs.sa.gov.au/documents/form-1-building-contract-rights-and-obligations.pdf
> - The CBS HTML pages tried returned 404. safa.sa.gov.au, sa.gov.au and safework.sa.gov.au are **not reachable** from this session.

### 1. Governing Act and regulator — VERIFIED
- **Acts:** Building Work Contractors Act 1995 and the **Building Work Contractors Regulations 2026**, in force from 1 Sep 2026. Plumbing falls under the Plumbers, Gas Fitters and Electricians Act 1995. Permits fall under the PDI Act 2016.
- **Regulator:** the Commissioner for Consumer Affairs (BWC Act s 3, s 5), acting through **Consumer and Business Services (CBS)**.
- The prescribed Form 1 still refers to the "Office of Consumer and Business Affairs". That is the form's own wording and should be reproduced as written.
- Round 1 cited the 2011 Regulations as "current". That is **CORRECTED**: they were repealed on 1 Sep 2026.

### 2. Does roofing-only work fall under the regime? — VERIFIED
- **Yes.** *Domestic building work* means "constructing, erecting, underpinning, altering, repairing, improving, adding to or demolishing a house" (s 3). The BWC Regs 2026 r 4(2)(b) adds "any other building work carried out within the curtilage of a house". Re-roofing, roof repairs, restoration and gutters on a house are therefore domestic building work.
- **Two tiers, set by the "minor domestic building work" threshold.** Minor domestic building work is work "at a cost to the building owner that is less than the sum prescribed". BWC Regs 2026 r 4(4) prescribes:
  - "(b) … made on or after 15 October 2001 but before 10 November 2025—$12 000;"
  - "(c) … made on or after 10 November 2025—$20 000."
- **Contracts under $20,000** (signed on or after 10 Nov 2025) are minor work. The Part 5 Division 1 contract rules (s 27(2)), BII (s 33(2)(b)) and cooling-off (s 36(2)) **do not apply**. The licence requirement and the statutory warranties (s 32) still apply.
- **Single-trade or specialist carve-out (r 5(2)):** a licensed **plumbing contractor** under the PGE Act does not need a BWC licence where the work is limited to what the plumbing licence authorises. If the plumbing licence is unconditional, the exemption also covers "minor roof plumbing work". That is defined as "building work connected with the installation, renovation, replacement, alteration, repair or maintenance of flashings, guttering, downpipes, roof flashings or roof coverings on a building, where the cost of the work is less than $3 000" (r 5(13)). Staged work is added together (r 5(14)).
- There is no other roofing exemption.

### 3. Licence requirement — VERIFIED
- **Any value.** BWC Act s 6(1): a person must not "carry on business as a building work contractor except as authorised by a licence". Maximum penalties: $100,000 for an individual on a first or second offence ($150,000 or 12 months on a third), and $500,000 for a body corporate. Expiation fee: $5,000. There is **no dollar threshold** for the licence, apart from the plumber exemption above (roof plumbing under $3,000).
- **Classes:** a building work contractors licence, or a licence "with conditions" limiting the work (s 7). The kinds of work in BWC Regs 2026 Sch 1 Part 3 include "(d) Other specified building work". CBS FAQ: "Your licence will have one or more conditions that state the type of work you can contract for." The software should hold a licence condition field (for example "roofing" or "roof plumbing"); the exact CBS condition wording was not available.
- **Supervisor:** every licensee also needs a registered building work supervisor (s 12). The CBS factsheet says a licence may be suspended if no approved supervisor is in place for more than 28 days.
- **Licence number display:**
  - **Contracts:** s 28(1)(c), for domestic contracts of $20,000 or more, requires "the name in which the building work contractor carries on business under the contractor's licence, the contractor's licence number and the names and licence numbers of any other persons with whom the contractor carries on business … in partnership". CBS says licence numbers start with "BLD".
  - **Ads:** s 50(1) requires the licence name and number in any advertisement. Maximum $25,000; expiation $3,000. Job ads and ads aimed at other contractors are exempt.
  - **Site sign:** s 51 requires the name and licence number on a site sign. Maximum $25,000.
  - **Plumbers:** PGE Act s 33A requires a licensed plumbing contractor to show the PGE licence number in ads.
  - The CBS FAQ quotes a "$5,000" penalty for not displaying the number. The Act says $25,000 maximum for ads and site signs. The CBS figure appears out of date; use the Act.
  - **Quotes:** no statutory rule. Showing the number is recommended because s 50 covers advertising and most quotes act as marketing.

### 4. Written contract threshold and tiers — VERIFIED / CORRECTED
- **$20,000 or more** (contracts on or after 10 Nov 2025), under s 28(1):
  - the contract must be in writing and set out all its terms;
  - it must show the name and licence number;
  - it must be signed by both parties;
  - the owner must get "a copy of the signed contract as soon as reasonably practicable after it has been signed by both parties together with a notice in the prescribed form" (Form 1);
  - the copy must be legible.
- **Price rules (s 29):** the contract must state a fixed price and the terms of payment.
  - A rise-and-fall clause is lawful only if the contract states a completion period.
  - Variable or estimated prices must carry "This Price May Change" or "Estimate Only" next to the price. All such prices go in a single list (s 29(6)–(7)).
  - Cost-plus margins are capped at 10% (s 29(5)). For prime cost items, BWC Regs 2026 r 19 prescribes 15%.
- **Under $20,000:** no statutory written-contract rule. A written quote or contract is still best practice.
- Round 1's licensing note said "$12,000 or more need a written contract". That is **CORRECTED** to $20,000 for contracts signed on or after 10 Nov 2025; $12,000 applies only to contracts signed before then.
- GST: the source does not say. "Cost to the building owner" suggests GST-inclusive (inference).
- **Inconsistency in official guidance:** the Act says "less than $20 000" is minor, so $20,000 itself is covered. The CBS May 2026 guide says "over $20,000" and Form 1 says "over $20 000". **Use $20,000 or more.**

### 5. Maximum deposit — VERIFIED (with a scope CORRECTION)
- s 30(4) *prescribed payment*, for contracts made on or after 1 Sep 2011:
  - "(i) if the price … is less than $20 000—a payment as a deposit of not more than $1 000;"
  - "(ii) if the price … is $20 000 or more—a payment as a deposit of not more than 5% of the price".
- Other prescribed payments allowed before work: third-party professional fees (engineering, drawing, surveying), BII premium reimbursement, and statutory fees.
- After work starts, only "a genuine progress payment in respect of work already performed", or an SOP Act entitlement, may be demanded (s 30(1)).
- Penalties: up to $100,000 for an individual and $500,000 for a body corporate. Expiation: $5,000.
- **Scope correction:** s 30 sits in Part 5 Division 1, which "does not apply to a contract for the performance of minor domestic building work" (s 27(2)). Since 10 Nov 2025, minor work means under $20,000, so **the $1,000 tier no longer applies to new contracts**. Contracts under $20,000 have no statutory deposit cap, and contracts of $20,000 or more are capped at 5%.
  - The $1,000 tier still matters for contracts signed between 1 Sep 2011 and 9 Nov 2025 priced from $12,000 to under $20,000.
  - Round 1 encoded "$1,000 if under $20k". That is **CORRECTED** for new contracts.
  - Form 1 still describes the $1,000 tier; it is the prescribed text and must be reproduced unchanged.
  - **App default:** cap deposits at 5% for contracts of $20,000 or more. For under $20,000, optionally apply a conservative $1,000 cap as a policy choice, but label it as policy, not law.

### 6. Cooling-off — VERIFIED
- **Length and start:** s 36(3) and (5). The owner may serve "notice … of the building owner's intention not to be bound by the contract" before the *prescribed time*: "(a) the end of five clear business days after the making of the domestic building work contract; or (b) if there has been a failure to comply with any of the requirements of Division 1 or 3 … the time of completion of the building work".
- **Threshold:** contracts of $20,000 or more only (s 36(2) excludes minor work).
- **Service:** the notice must be in writing and signed by the owner, and either served personally or sent by certified mail.
- **Consequence:** the Magistrates Court may order refunds or payment for work and materials (s 36(4)).
- **If the contractor breaches Division 1 or 3** (for example no Form 1, no licence number, a deposit over the cap, or no BII), the cooling-off right extends to completion of the work.
- **Prescribed notice wording:** BWC Regs 2026 Sch 2, Form 1 "Notice under section 28(1)(f) of Building Work Contractors Act 1995", headed "YOUR BUILDING CONTRACT: YOUR RIGHTS AND OBLIGATIONS". Clause 2 reads:
  > "2—What are my "cooling off" rights? You may cancel your building contract, if you act before the "prescribed time". If you wish to cancel, you must give your building work contractor written notice of your intention not to be bound by the contract. You must serve that notice on the building work contractor either personally or by certified mail in an envelope addressed to the contractor. You must do this— (a) before 5 clear business days have expired after the making of the contract; or (b) if your building work contractor has not complied with relevant provisions of the Act, before the contractor completes the building work under the contract."
- **Format rules for Form 1 (r 18):** it must contain no particulars beyond those required, use type "not smaller than 10 point Times New Roman", and be legible. The software should render the full Sch 2 Form 1 text verbatim.
- The ACL 10-business-day unsolicited-agreement right still applies to door-knocked or phone-sold jobs (federal; not re-verified here).

### 7. Building indemnity insurance (BII) — VERIFIED
- **Scheme:** building indemnity insurance, BWC Act Part 5 Division 3.
- **Threshold and trigger:** s 33(2) says the Division does not apply to "(a) domestic building work for which approval under the Development Act 1993 … is or was not required; or (b) minor domestic building work". So BII is needed only when **the cost is $20,000 or more** (contracts on or after 10 Nov 2025; previously $12,000) **and** approval is required.
  - The Act's text still refers to the Development Act 1993. That it now operates through PDI Act development approval is an inference, consistent with PDI (General) Regs r 36, which requires the BII certificate to be lodged with the application for building consent.
  - CBS confirms: "domestic building work that costs $20,000 or more and requires council approval".
- **When:** s 34 says the contractor "must not perform building work … unless … the building owner has been provided with a certificate". Penalty: up to $100,000 for an individual and $500,000 for a body corporate. Expiation: $20,000. CBS: "Before you start work you must give the owner or their agent and the council, a copy of the certificate of insurance."
  - The statute ties delivery to **before work starts**, not before payment. Round 1's "before taking any money" (secondary source) is **CORRECTED**.
  - The software should still require the certificate before the deposit request, because the BII premium is itself a prescribed payment.
- **Certificate form:** Form 2 (BWC Regs 2026 Sch 2) lists the certificate number, insurer, building owner, description of work, premises, contractor name and contractor licence number.
- **Policy terms (r 20):** excess at most $400. The cap is at least $250,000 per dwelling for policies on or after 10 Nov 2025 ($80,000 before). Claimants get at least 90 days to claim.
- **Roofing-only work: depends.** It is covered only if the job is $20,000 or more **and** needs development approval. A like-for-like re-roof that is excluded from "development" (see item 11) needs no BII.

### 8. Documents, progress payments, variations — VERIFIED
- **Documents:**
  - Signed contract copy plus Form 1, as soon as reasonably practicable after signing (s 28(1)(f)).
  - BII certificate (Form 2) before work starts, where BII applies (s 34).
  - Any charging clause (a caveat right) must state the four prescribed warnings, including advice to seek independent legal advice (r 16).
  - **Statement of Compliance** (PDI (General) Regs r 104): for building work under a building consent (except Class 10 buildings other than pools and bushfire shelters), the licensed contractor must give it with the notice of completion, via the SA planning portal, to the council or certifier. The owner signs the second part.
- **Progress payments:** only for work already performed (s 30(1)). The owner "is not obliged to make a progress payment … unless … the building work contractor has requested the payment by notice in writing" (s 30(3)). **The app should always issue a written payment request.**
- **Variations:** the BWC Act has no specific written-variation section. A "domestic building work contract" includes "any variation of such a contract" (s 3), so a variation to a $20,000-plus contract must meet the s 28 formal requirements: written, signed, copy to the owner. That reading is an inference. Form 1 cl 4–5 says "Most variations require your written approval in advance". **Software rule:** require written, signed variations.

### 9. Statutory warranties — VERIFIED
- **Warranties implied by s 32(2)** in every domestic building work contract:
  - proper manner and accepted trade standards, following the agreed plans;
  - good and proper materials;
  - compliance with all statutory requirements;
  - reasonable diligence where no completion period is stated;
  - fitness for habitation (new houses);
  - fitness for a disclosed purpose.
- These apply **at any contract value**, because s 32 is in Division 2, which has no minor-work exclusion.
- **Time limits:**
  - **5 years:** "Proceedings for breach of a statutory warranty must be commenced within five years after completion of the building work" (s 32(5)). This "may not be extended" (s 32(6)).
  - **10 years:** PDI Act s 159(1) sets a long-stop: "no action for damages for economic loss or rectification costs resulting from defective building work … can be commenced more than 10 years after completion". CBS states the same: "Defective building work is covered for ten years."
- Round 1 said "SA: 5 years (secondary)". That is **CONFIRMED** from the Act, and the 10-year long-stop is added.

### 10. Roof plumbing compliance certificate / notice — PARTLY VERIFIED
- **What counts as plumbing:** under the PGE Act s 3, *plumbing* includes "draining work", meaning work on "sanitary drains or stormwater drains". A "stormwater drain means pipes and equipment to collect and convey stormwater to a public stormwater disposal system".
- **Small-pipe exemption:** PGE Regs 2025 r 4(5)(a)(v) exempts plumbing "relating to stormwater drainage pipes— (A) consisting of work on pipes not exceeding 90 mm in diameter".
- **App rule (inference):**
  - Gutters, roof sheeting and flashings are **building work** under the BWC Act. They need a BWC licence; a plumbing contractor is exempt only under $3,000 (r 5(2)).
  - Below-ground stormwater drains over 90 mm connecting to the public system are PGE-licensed draining work.
- **Certificate:** no post-job plumbing certificate requirement for roof drainage was found in the PGE Act, the PGE Regs 2025 or the Water Industry Regulations 2012. The SA Water / Office of the Technical Regulator certificate regime was **not reachable** (sa.gov.au is blocked). **UNVERIFIED**; treat as not required for gutters and downpipes until confirmed.
- **The one confirmed post-job document** is the PDI Statement of Compliance (item 8), and only for consented work.

### 11. Development / building approval for re-roofing — VERIFIED (law); application to full re-roofs needs care
- **Re-roofing is building work by default.** Under PDI Act s 3, *building work* means "the construction, demolition or removal of a building", and "construct … includes … (b) to repair the building; (c) to make alterations". So re-roofing is building work, and therefore development, unless the regulations exclude it.
- **General exclusion:** PDI (General) Regs Sch 4 cl 4(4) excludes, "Other than in respect of a local heritage place, the repair, maintenance or internal alteration of a building— (a) that does not involve demolition of any part of the building (other than the removal of fixtures, fittings or non load-bearing partitions); and (b) that will not adversely affect the structural soundness of the building or the health or safety of any person occupying or using it".
- **State heritage areas:** Sch 5 cl 4(7)(c) expressly excludes "replacing roofing materials, guttering or down-pipes with the same or similar materials or items".
- **App logic:**
  - Like-for-like roof repair, maintenance, gutter or downpipe replacement with no structural change: generally not development, so no approval and no BII.
  - Full re-roof stripping roof coverings, a change of material, or any structural or truss work: flag "check with council or a building certifier". Whether stripping the old roof is "demolition of any part of the building" under cl 4(4)(a) is not settled in the text.
  - Local heritage place: approval is likely.
  - Bushfire overlays and the Historic Area Overlay can also trigger approval.

### 12. Security of payment — VERIFIED
- **Owner-occupier excluded.** SA SOP Act s 7(2)(b): the Act does not apply to "a construction contract for the carrying out of domestic building work … on such part of any premises that the party for whom the work is carried out resides in or proposes to reside in".
- **So:** not for an owner-occupier's home. It **does** apply to landlord or investment houses, commercial owners, and subcontracts to builders or insurers.
- **Payment schedule:** within the contract time or "15 business days after the payment claim is served, whichever time expires earlier" (s 14(4)). Otherwise the claimed amount becomes payable.
- **Due date:** per the contract, or 15 business days after the claim if the contract is silent (s 11(1)).
- **Version:** the consolidated SOP Act is still the 10.12.2011 version. New SOP Regulations 2026 commenced 1 Sep 2026 but cover adjudicator eligibility, related services and financial institutions, not these timings.
- Round 1 listed this as "15 business days (s 14(4)), sources conflict". That is **CONFIRMED**, and the owner-occupier status is now resolved: **excluded**.

### 13. Other SA prompts — VERIFIED
- **Falls:** high risk construction work now includes "a risk of a person falling more than 2 metres" (SA WHS Regs r 291, "amended by 112/2025 r 3", from **1.7.2026**). This confirms round 1's 3 m to 2 m change. SWMS is required above 2 m.
- **Asbestos:**
  - Removing more than 10 m² of non-friable asbestos needs a Class B licence (r 487).
  - The licensed removalist notifies the regulator "at least 5 days before" starting (r 466).
  - Disturbing asbestos is HRCW.
- **Owner-builder and other checks:** BII can only be taken out by a licensed builder (CBS factsheet).
- **Contract wording checks** (s 29):
  - fixed-price check;
  - "This Price May Change" or "Estimate Only" labels;
  - rise-and-fall only with a stated completion period;
  - GST clause statements (s 29(8a)–(8b)).
- **Charging clause warnings** (r 16; PGE Act s 33B for plumbing).
- **Unlicensed contractors:** a licensed contractor must not contract with an unlicensed person (s 47A). Check subcontractor licences.
- **Licence register:** CBS licence numbers start with "BLD". Interstate roofers may work under Automatic Mutual Recognition (CBS factsheet).

```json SA
{
  "state": "SA",
  "regulator": "Commissioner for Consumer Affairs — Consumer and Business Services (CBS)",
  "act": "Building Work Contractors Act 1995 (SA); Building Work Contractors Regulations 2026 (from 1 Sep 2026); Plumbers, Gas Fitters and Electricians Act 1995; Planning, Development and Infrastructure Act 2016; Building and Construction Industry Security of Payment Act 2009",
  "licence": {
    "threshold_aud": 0,
    "classes": ["Building work contractors licence (usually 'with conditions' limiting kind of work, e.g. other specified building work)", "Registered building work supervisor (or approved supervisor) required", "PGE plumbing contractor licence: exempt from BWC licence only for work within the plumbing licence or (if unconditional) minor roof plumbing work < $3,000 (flashings, guttering, downpipes, roof coverings)", "PGE licence for draining work on stormwater drains > 90 mm to public system"],
    "show_on": ["contract", "ads", "site_sign"],
    "source": "BWC Act s 6, 7, 12, 28(1)(c), 50, 51; BWC Regs 2026 r 5(2), 5(13); PGE Act s 3, 33A; PGE Regs 2025 r 4(5)(a)(v)"
  },
  "written_contract": {
    "threshold_aud": 20000,
    "tiers": ["< $20,000 (contracts on/after 10 Nov 2025): minor domestic building work — Part 5 Div 1, BII and cooling-off do not apply; licence and statutory warranties still apply", ">= $20,000: written contract with licence name/number, signed, copy + Form 1 to owner", "Contracts signed 15 Oct 2001–9 Nov 2025: minor threshold was $12,000"],
    "source": "BWC Act s 3 (minor domestic building work), 27, 28; BWC Regs 2026 r 4(4) — https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-work-contractors-regulations-2026/current/2026.58.auth.pdf"
  },
  "deposit": {
    "rules": [{"max_contract_aud": 19999.99, "pct": null, "cap_aud": null}, {"max_contract_aud": null, "pct": 5, "cap_aud": null}],
    "source": "BWC Act s 30(4) prescribed payment (d): <$20,000 → $1,000; >=$20,000 → 5%; but s 27(2) excludes minor work (<$20,000 from 10 Nov 2025) from s 30, so the $1,000 tier only bites on pre-10-Nov-2025 contracts $12,000–$19,999. Third-party fees and BII premium reimbursement also permitted."
  },
  "cooling_off": {
    "applies_over_aud": 20000,
    "length": "5 clear business days after the making of the contract (extends to completion of the work if contractor failed Div 1 or Div 3 requirements)",
    "unit": "business_days",
    "starts": "making of the contract",
    "notice_text": "2—What are my \"cooling off\" rights? You may cancel your building contract, if you act before the \"prescribed time\". If you wish to cancel, you must give your building work contractor written notice of your intention not to be bound by the contract. You must serve that notice on the building work contractor either personally or by certified mail in an envelope addressed to the contractor. You must do this— (a) before 5 clear business days have expired after the making of the contract; or (b) if your building work contractor has not complied with relevant provisions of the Act, before the contractor completes the building work under the contract.",
    "source": "BWC Act s 36; BWC Regs 2026 Sch 2 Form 1 cl 2 (applies to contracts >= $20,000; threshold is 'not less than' — applies_over_aud means >=)"
  },
  "insurance": {
    "scheme": "Building indemnity insurance (BWC Act Part 5 Div 3)",
    "threshold_aud": 20000,
    "before": "before performing the work — certificate (Form 2) to owner; copy lodged with council/certifier with building consent application",
    "roofing_only_covered": "depends",
    "source": "BWC Act s 33(2), 34, 35; BWC Regs 2026 r 4(4), r 20 ($400 excess max; >= $250,000 cap for policies from 10 Nov 2025), Sch 2 Form 2; PDI (General) Regs r 36; only where development approval required"
  },
  "documents": [
    {"name": "Copy of signed contract + Form 1 'Your building contract: your rights and obligations' (BWC Regs 2026 Sch 2)", "when": "as soon as reasonably practicable after both sign (contracts >= $20,000)", "source": "BWC Act s 28(1)(f); BWC Regs 2026 r 18, Sch 2"},
    {"name": "Building indemnity insurance certificate (Form 2)", "when": "before work starts (where BII applies)", "source": "BWC Act s 34"},
    {"name": "Written request for each progress payment", "when": "before owner is obliged to pay", "source": "BWC Act s 30(3)"},
    {"name": "Charging clause warnings (if contract has caveat clause)", "when": "in contract", "source": "BWC Regs 2026 r 16"},
    {"name": "Statement of Compliance (via SA planning portal)", "when": "with notice of completion, for work under building consent", "source": "PDI (General) Regs 2017 r 104"}
  ],
  "statutory_warranty": [
    {"type": "Implied warranties (s 32(2)) — limitation for proceedings", "years": 5, "source": "BWC Act s 32(5)-(6)"},
    {"type": "Long-stop for defective building work economic loss/rectification", "years": 10, "source": "PDI Act 2016 s 159"}
  ],
  "compliance_certificate": {
    "name": "No roof-drainage plumbing certificate found; PDI Statement of Compliance applies to consented building work",
    "threshold_aud": null,
    "deadline": "Statement of Compliance: when notice of completion is given",
    "source": "PGE Act/Regs 2025 and Water Industry Regs 2012 searched — none found (UNVERIFIED: SA Water/OTR regime not reachable); PDI (General) Regs r 104"
  },
  "permit": {
    "summary": "Repair (incl. re-roofing) is 'building work' and so 'development' unless excluded. Sch 4 cl 4(4) excludes repair/maintenance not involving demolition of any part (other than fixtures/fittings/non-load-bearing partitions) and not affecting structural soundness — not for local heritage places. In State heritage areas Sch 5 expressly excludes replacing roofing, guttering or downpipes with same/similar materials. Full strip/re-roof, material change or structural work: confirm with council/certifier.",
    "source": "PDI Act 2016 s 3 (building work, construct, development); PDI (General) Regs 2017 Sch 4 cl 4(4), Sch 5 cl 4(7)(c)"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "no",
    "schedule_days": 15,
    "source": "SA SOP Act 2009 s 7(2)(b) (excludes domestic building work on premises owner resides/proposes to reside in), s 14(4) (15 business days), s 11(1) (due 15 business days if contract silent)"
  },
  "other_prompts": [
    {"text": "Fall risk > 2 m is HRCW from 1 Jul 2026 (was 3 m): SWMS required", "source": "SA WHS Regs 2012 r 291 (amended by 112/2025)"},
    {"text": "Asbestos: >10 m2 non-friable needs Class B licence; licensed removalist notifies regulator at least 5 days before", "source": "SA WHS Regs r 466, 487"},
    {"text": "Variable/estimated prices must be labelled 'This Price May Change' or 'Estimate Only' and listed together; rise-and-fall only with stated completion period", "source": "BWC Act s 29"},
    {"text": "Licence name and number in all ads and on site sign (max $25,000)", "source": "BWC Act s 50, 51"},
    {"text": "Do not subcontract to unlicensed persons", "source": "BWC Act s 47A"},
    {"text": "Key contract-date rules: signed on/after 10 Nov 2025 → $20,000 minor-work threshold and $250,000 BII cap; Regs 2026 apply from 1 Sep 2026", "source": "BWC Regs 2026 r 4(4), r 20"}
  ],
  "status_notes": "All values from SA authorised legislation PDFs read 2026-11-06. GST treatment not stated (Act uses 'cost to the building owner'). CBS guidance inconsistently says 'over $20,000'; statute says minor work is 'less than $20 000' so $20,000 exactly is covered. CBS FAQ quotes $5,000 for licence-number display breach vs Act s 50/51 $25,000 max. Whether a full strip-and-replace re-roof falls within PDI Sch 4 cl 4(4) is interpretive. Roof-plumbing certificate regime (SA Water/OTR) not reachable — sa.gov.au and safa.sa.gov.au blocked. Variations-in-writing derived from s 3 'contract includes any variation' + s 28 (inference)."
}
```

---

## What changed vs round 1 (WA and SA)

| # | Item | Round 1 | Round 2 (primary source) | Status |
|---|---|---|---|---|
| WA | Regulator agency | "DMIRS/DEMIRS" | Legislation site lists "Department of Local Government, Industry Regulation and Safety"; Building Commissioner (Building and Energy) | CORRECTED |
| WA | Registration test | "> $20,000 + permit" | Permit-required **and** **$20,000 or more** ($50k Class 10a) **and** Schedule 3 area (SW Land Division + listed towns) | CORRECTED |
| WA | Licence number display | not retrieved | Ads (BSR Act s 8, $5,000) and site sign (BSR Regs r 21); no quote/contract rule | VERIFIED |
| WA | HBC Act scope / deposit | $7.5k–$500k / 6.5% | Confirmed: > $7,500 and < $500,000; 6.5% (20% cabinetry only) | VERIFIED |
| WA | Cooling-off | "none found" | Confirmed none in HBC Act/Sch 1 notice | VERIFIED |
| WA | HII | > $20k, before any payment, $40k deposit cover | Confirmed; **exempt if no building permit needed or registration not required** (s 25B(4A)); $200k min cover, $500 max excess, 6-yr claim window | VERIFIED + added roofing exemption |
| WA | Statutory warranty | "6 years single tier (secondary)" | **4-month implied make-good term** (s 11) + 6-yr Building Commissioner complaint window + 6-yr HII claims | CORRECTED |
| WA | Roof plumbing licence/certificate | open gap | Gutters/downpipes/roof stormwater are **not plumbing work** (PL Regs r 4–4B); certificate of compliance 5 working days only for major plumbing | NEW (inference from definitions) |
| WA | Permit for re-roofing | "can be permit work" | Like-for-like repair/renovation exempt (Building Regs Sch 4 cl 2 item 2) unless structural, material change, heritage etc. | VERIFIED |
| WA | SOP | owner-occupier "not confirmed"; 15 bd schedule | **Excluded** for individual principal, ≤ $500k, not multi-dwelling/developer, not subcontract (s 10); 15 bd schedule; due 20/25 bd | RESOLVED |
| WA | Reg 79 from 1 Oct 2026 | unclear | r 722: reg 79 disapplied for HRCW for 4.5 years from commencement (31 Mar 2022) → applies from ~1 Oct 2026 | VERIFIED (commencement date from background knowledge) |
| WA | Demolition licence | — | Class 1 demolition licence for > 200 m² brittle/fragile roofing at ≥ 10 m (r 142B) | NEW |
| SA | Regulations | 2011 Regs "current"; 2026 Regs "appear" | **BWC Regs 2026 in force 1 Sep 2026**; 2011 Regs repealed | CORRECTED |
| SA | Written contract threshold | "$12,000 or more" (licensing notes) | **$20,000** for contracts on/after 10 Nov 2025 ($12,000 before) | CORRECTED |
| SA | Deposit | $1,000 if < $20k; 5% if ≥ $20k | 5% if ≥ $20k confirmed; **$1,000 tier no longer applies to new contracts** because < $20k is minor work excluded from s 30 | CORRECTED |
| SA | Cooling-off | 5 clear business days (s 36 "believed") | Confirmed s 36; ≥ $20k only; extends to completion if Div 1/3 breached; Form 1 cl 2 wording quoted | VERIFIED |
| SA | BII threshold | $20k from 10 Nov 2025; council approval | Confirmed (r 4(4)); $250k cap; ≤ $400 excess; certificate **before work starts** (not "before taking money") | VERIFIED / CORRECTED timing |
| SA | Licence | BWC licence "any building work"; plumber exemption wording unverified | Confirmed any value; plumber exemption limited to < $3,000 roof plumbing (r 5(2), 5(13)); licence number on contract, ads, site sign | VERIFIED |
| SA | Statutory warranty | 5 years (secondary) | 5 years (s 32(5)) + 10-year long-stop (PDI Act s 159) | VERIFIED + added |
| SA | SOP owner-occupier | "Not confirmed" | **Excluded** where owner resides/proposes to reside (s 7(2)(b)); 15 bd schedule; due 15 bd | RESOLVED |
| SA | Permit | not researched | Repair excluded from development unless demolition/structural/local heritage (Sch 4 cl 4(4)); State heritage area like-for-like roofing excluded (Sch 5) | NEW |
| SA | Falls | 3 m → 2 m on 1 Jul 2026 | Confirmed r 291 amended by 112/2025 from 1.7.2026 | VERIFIED |

### Still unverified / blocked
- **WA:** commerce.wa.gov.au redirects to www.wa.gov.au, which is blocked. Not re-read: the Building and Energy guidance, the HII certificate form, the Phillips prosecution, and any Board statement on roof stormwater. WorkSafe WA is also unreachable. The WHS Act 2020 commencement date (31 Mar 2022) is from background knowledge.
- **SA:** safa.sa.gov.au, sa.gov.au and safework.sa.gov.au are blocked. Not re-read: SAFA BII pages, the Office of the Technical Regulator / SA Water plumbing certificate regime, and SafeWork SA guidance. The exact CBS wording for a roofing licence condition was not found.
- **Interpretation calls to flag:**
  - SA: whether a strip-and-replace re-roof counts as "demolition of any part" under PDI Sch 4 cl 4(4).
  - SA: whether variations must be in writing (derived from s 3 and s 28).
  - WA: that roof stormwater is outside plumbing licensing (derived from definitions).
- **Both states:** the source does not say whether thresholds include GST. Treat them as the full contract price including GST (inference).
