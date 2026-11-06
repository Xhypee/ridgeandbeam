# VERIFIED RULES — NSW and ACT (round 2, primary-source verification)

> Status: COMPLETE for this round (2026-11-06). ACT: primary-verified from legislation.act.gov.au. NSW: all primary sources blocked, so every NSW item is UNVERIFIED (search-corroborated only).
> Method: legislation texts downloaded as the official authorised PDFs from the ACT Legislation Register (www.legislation.act.gov.au), via curl through the session proxy, and read in full for the relevant parts. Date checked for every ACT item: **2026-11-06**.
> Access log (what was blocked, so nobody re-tries blindly):
> - `www.legislation.act.gov.au`: **reachable** (HTML + PDF). All ACT quotes below come from here.
> - `www.accesscanberra.act.gov.au`, `accesscanberra.act.gov.au`, `www.planning.act.gov.au`, `www.worksafe.act.gov.au`, `legislation.act.gov.au` (no www): **blocked by the session proxy** (CONNECT 403). No regulator guidance pages were read.
> - `legislation.nsw.gov.au`: reachable but answers with a **Cloudflare "Just a moment..." bot challenge (HTTP 403)** on every path tried (/view/html, /view/pdf, /view/whole, /export/xml). Not bypassed.
> - `www.legislation.nsw.gov.au`: no response. `www.fairtrading.nsw.gov.au`: answers **301 → prod.redirects.dcs.skpr.live → www.nsw.gov.au**, and `www.nsw.gov.au` / `nsw.gov.au` / `fairtrading.nsw.gov.au` / `www.safework.nsw.gov.au` / `www.service.nsw.gov.au` / `www.icare.nsw.gov.au` / `www.planning.nsw.gov.au` are **blocked by the session proxy**. `www.austlii.edu.au`: 403 bot challenge.
> - WebFetch tool: returns ENOTFOUND for every NSW host and for `www.fairtrading.nsw.gov.au`; it cannot be used here.
>
> Statuses: **VERIFIED** = read in the primary text today; **CORRECTED** = round-1 value was wrong, old value stated; **UNVERIFIED** = could not be read in a primary source (reason given).

---

## ACT — VERIFIED RULES

Primary texts read (all authorised republications from www.legislation.act.gov.au):

| Short name | Instrument | Republication / effective | URL |
|---|---|---|---|
| BA | Building Act 2004 (A2004-11) | R56, effective 1 Oct 2026 | https://www.legislation.act.gov.au/DownloadFile/a/2004-11/current/PDF/2004-11.PDF |
| BGR | Building (General) Regulation 2008 (SL2008-3) | R52, effective 1 Oct 2026 | https://www.legislation.act.gov.au/DownloadFile/sl/2008-3/current/PDF/2008-3.PDF |
| COLA | Construction Occupations (Licensing) Act 2004 (A2004-12) | R71, effective 23 Feb 2026 | https://www.legislation.act.gov.au/DownloadFile/a/2004-12/current/PDF/2004-12.PDF |
| COLR | Construction Occupations (Licensing) Regulation 2004 (SL2004-36) | R53, effective 23 Feb 2026 | https://www.legislation.act.gov.au/DownloadFile/sl/2004-36/current/PDF/2004-36.PDF |
| WSA | Water and Sewerage Act 2000 (A2000-68) | R29, effective 26 Nov 2025 | https://www.legislation.act.gov.au/DownloadFile/a/2000-68/current/PDF/2000-68.PDF |
| SOPA | Building and Construction Industry (Security of Payment) Act 2009 (A2009-50) | R14, effective 6 Dec 2025 | https://www.legislation.act.gov.au/DownloadFile/a/2009-50/current/PDF/2009-50.PDF |
| WHSR | Work Health and Safety Regulation 2011 (SL2011-36) | R47, effective 29 Nov 2025 | https://www.legislation.act.gov.au/DownloadFile/sl/2011-36/current/PDF/2011-36.PDF |

### ACT-1. Governing Act and regulator — VERIFIED (regulator name partly UNVERIFIED)
- Acts: Building Act 2004 (Part 6 "Residential building work—warranties, conditions, insurance etc"), Building (General) Regulation 2008 (Part 4), Construction Occupations (Licensing) Act 2004 (licensing, advertising).
- Regulator: the statutory office is the **construction occupations registrar** (BA s 86(1)(b)(i): "an amount agreed between the construction occupations registrar and the builder"; BA s 90(1)(j): the policy form must be "approved in writing by the construction occupations registrar"). The registrar's functions are delivered through Access Canberra, but the Access Canberra pages were blocked, so the current branding ("Access Canberra" / "Building and Construction Licensing") is **UNVERIFIED**.

### ACT-2. Does roofing-only work fall under the residential regime? — VERIFIED (with a note)
- Part 6 applies to "residential building work", which is "building work in relation to a residential building" (BA s 84). "Building work" means "work in relation to the erection, alteration or demolition of a building ... or ... work in relation to repairs of a structural nature to a building" (BA s 6(1)).
- **The roof counts as structural for warranty purposes:** a "structural element" includes "a component (including weatherproofing) forming part of the external walls or roof of the building" (BGR s 38(2)).
- Value floor: "The Act, part 6 ... does not apply to residential building work if the cost of the work is less than $12 000" (BGR s 37).
- No roofing or single-trade exemption appears in BGR Schedule 1 (exempt buildings and building work). The only roof-related exemptions are small structures (roof covering ≤ 25 m²), skylights ≤ 4 m² (sch 1 pt 1.3 item 16) and PV/solar water heaters (item 24).
- Note (inference): non-structural *repairs* (e.g. replacing a few broken tiles, cleaning, coating) are arguably not "building work" at all, because the definition covers alteration and "repairs of a structural nature" only. A full re-roof is likely an "alteration". The Act does not settle this for roof restoration; flag it for legal review.
- **CORRECTED vs round 1:** round 1 said the warranty and insurance requirements apply to work "that requires building approval and costs $12,000 or more". In the Act that is true only of **insurance** (see ACT-7). The **statutory warranties** (BA s 88) apply to every contract to carry out residential building work costing $12,000 or more, whether or not a building approval is needed.

### ACT-3. Licence — VERIFIED
- Offence to provide a service in a construction occupation without a licence: "A person commits an offence if the person— (a) provides a service ... in a construction occupation or occupation class; and (b) ... is not licensed in the occupation or class" (COLA s 84(1)). A builder is "an entity that provides ... a building service", meaning "the doing or supervising of building work" (COLA s 8).
- **No dollar threshold** in the ACT Acts. The licence follows the definition of "building work" (BA s 6), not the job's value.
- Builder classes (COLR sch 1 pt 1.3): class A (building work other than specialist work); class B (≤ 3 storeys + basic building work); class C (≤ 2 storeys class 1, 2 or 10a + basic building work); **class D: "non-structural basic building work, other than specialist building work"**; owner-builder. Since roofs are structural elements (BGR s 38) and "non-structural work" excludes work affecting a load-carrying element (BA s 10(2)(c)), **re-roofing most likely needs class C or higher**. Class D is limited to non-structural work. This is an inference; Access Canberra guidance was not readable.
- Plumbing: a plumber does "sanitary plumbing work" or "water supply plumbing work" (COLA s 13). Under the WSA, "sewage ... does not include stormwater" and "stormwater means surface water, subsoil water and runoff caused by rainfall on roof areas" (WSA dictionary). **So roof gutters and downpipes are not "plumbing" requiring a plumber's licence in the ACT.** Inference: they fall under building work where they form part of an alteration. There is **no separate ACT roof-plumbing licence class** (this resolves the round-1 gap).
- Licence number in advertising: "A person commits an offence if the person— (a) advertises that the person provides ... a service in a construction occupation ... and (b) does not include ... (i) the person's name as recorded on the person's licence; (ii) the person's licence number; (iii) if the person is a corporation—the person's ACN" (COLA s 83(1); max 5 penalty units). The statutory examples of advertising include "providing a prospective client with a letter, business card, **sample contract**, brochure ..." and vehicle signage. Quotes, proposals and sample contracts sent to prospects should therefore carry the name, licence number and ACN.
- Asbestos: "For building work that involves asbestos removal, a builder must hold an asbestos removal licence" (COLA s 8 note 2).

### ACT-4. Written-contract threshold — VERIFIED (no statutory requirement found) / partly UNVERIFIED
- The Building Act and the Regulation contain **no general written-contract requirement or small/major tiers**. Instead, BA Div 6.2A (ss 89A–89E) lets regulations prescribe **standard conditions** (s 89C, offence if omitted), **required documents** to be attached (s 89D, offence: "the required documents are not attached to the residential building work contract", 10 penalty units, strict liability) and **prohibited conditions** (s 89E, void). Div 6.2A does not apply where the cost is below the prescribed amount (s 89A).
- BGR s 38A: "A document determined by the Minister is prescribed" (a notifiable instrument). **The current determination was not located** (the register's search needs JavaScript and web search did not find it). **UNVERIFIED**: which document(s) must be attached.
- BGR s 38B: a prohibited condition (for new class 1 buildings or alterations to class 1/2 buildings) is one letting anyone other than the owner appoint or revoke the certifier, or act as the owner's agent with the certifier.
- No standard conditions are prescribed in BGR R52 (searched for "standard condition"; no prescribing provision found).
- A web-search snippet of an ACT Planning factsheet says "there is no requirement in ACT legislation to enter into a written contract for residential building work" (planning.act.gov.au PDF; blocked, so not read). It is consistent with the Acts read.

### ACT-5. Maximum deposit — VERIFIED (no statutory cap)
- No deposit cap appears in BA or BGR (full-text search for "deposit"). The only deposit rule is insurance-related: where the builder becomes insolvent, the owner may recover the deposit less work done, capped at "$10 000" (BA s 93(3); BGR s 43).
- Round-1 conflict resolved: the claim that "a builder cannot request more than 10% before commencing on contracts up to $20,000" is **not in ACT legislation** (CORRECTED; it is most likely a contract-template or other-state rule). App rule: no ACT statutory cap. Default to a conservative 10% as practice only, and show it as "not a legal limit".

### ACT-6. Cooling-off — VERIFIED (none in the building legislation)
- No cooling-off provision in BA, BGR or COLA (full-text search for "cooling"). Only the Australian Consumer Law unsolicited-consumer-agreement 10-business-day termination right applies, when the sale was unsolicited (door-knock or phone). The ACL text was not re-checked in this round.

### ACT-7. Residential building insurance / fidelity certificate — VERIFIED
- Scheme: "complying residential building work insurance" from an authorised insurer, **or** a "fidelity certificate" issued by the trustees of an approved fidelity fund scheme (BA ss 84, 90, Div 6.4).
- Covered work: "insurable residential building work" = residential building work on a building whose residential parts are class 1 or class 2 with "no more than 3 storeys" (BA s 84). Part 6 does not apply below **$12,000** (BGR s 37).
- Trigger and timing: the insurance or fidelity certificate must accompany the builder's application for a **building commencement notice**. "If the application is for insurable residential building work, the application must be accompanied by— (a) a residential building insurance policy for the work; or (b) a certificate issued by an approved insurer ...; or (c) a fidelity certificate" (BA s 37(4)). Section 37 applies only where "a building approval has been issued for building work" (s 37(1)(a)). The commencement notice ends automatically if the work is no longer insured (s 38(1)(a)).
- **So insurance is required only where the job needs a building approval** and costs at least $12,000. Re-roofing that needs no approval has no insurance trigger, but it still carries the statutory warranties if it costs $12,000 or more.
- Amounts: minimum cover "$200 000" (BGR s 39; round-1 "$85,000 → $200,000 from 1 Jan 2025" confirmed as the current value; the start date was not checked); insurance period "5 years" (s 40); claims period "180 days" (s 41); excess "$500" (s 42); lost-deposit cap "$10 000" (s 43).
- Round-1 claim "must be in place before taking a deposit, signing the head contract or bringing materials on site": **UNVERIFIED / not in the Act**. The statutory trigger read today is the commencement-notice application (BA s 37(4)). Approved fidelity fund rules may impose more conditions; not read.

### ACT-8. Required documents, progress payments, variations — partly VERIFIED
- Required documents: BA s 89D + BGR s 38A (Minister's determination). **UNVERIFIED** which document (see ACT-4).
- Progress payments or variations in writing: **no provision in BA, BGR or COLA** (searched). UNVERIFIED in any other ACT instrument. (SOPA governs payment claims; see ACT-12.)
- Signage: where building work must be done by a licensed builder, "A licensed builder who carries out or supervises the building work on a parcel of land must display a sign on the parcel" (BA s 37A(2)). This applies to approval-required jobs with a commencement notice. Prompt the roofer for site signage on approved jobs.
- Defect notice: an affected party may give written notice "within 2 years after the completion day" requiring rectification, and the work is then presumed defective unless the contrary is proven (BA s 89F). This applies to contracts entered into after the section commenced (s 89F(6)).

### ACT-9. Statutory warranty durations — VERIFIED
- BGR s 38(1): "(a) for residential building work in relation to a structural element of a building—**6 years** after the completion day for the work; or (b) ... non-structural element ...—**2 years** after the completion day".
- **Roofing-specific:** a structural element includes "a component (including weatherproofing) forming part of the external walls or roof of the building" (BGR s 38(2)(b)). **So roof cladding and weatherproofing work carries the 6-year warranty.**
- Completion day: "the day the work is completed or the day the contract relating to the work ends, whichever is the later" (BA s 85(1)).
- Warranty content: BA s 88(2) covers compliance with the Act; proper and skilful work in accordance with approved plans; good and proper materials; reasonable promptness; and fitness for purpose where the owner relies on the builder.

### ACT-10. Post-job roof plumbing compliance certificate — VERIFIED (not applicable)
- Roof stormwater is outside "sanitary plumbing" and "water supply plumbing" (WSA dictionary, quoted in ACT-3), so the ACT plumbing notice regime (WSA ss 15–17A) does not attach to gutters and downpipes. There is no ACT roof-plumbing compliance certificate. Where the job has a building approval, completion goes through the certifier and the certificate of occupancy process (BA Div 3.6, Part 5).

### ACT-11. Building approval for re-roofing — partly VERIFIED / UNVERIFIED in practice
- BGR Schedule 1 has **no express re-roofing or like-for-like exemption** (pt 1.2 and pt 1.3 read in full; the roof items are limited to small structures, skylights ≤ 4 m², and PV/solar water heaters).
- Exemptions in sch 1 pt 1.3 are lost if the work "may affect— (a) the structural integrity of any part of a building for which a certificate under the Act, part 5 ... has been issued" or reduces code compliance (BGR s 6(4)).
- **UNVERIFIED:** whether ACT certifiers or Access Canberra treat like-for-like re-sheeting or re-tiling as non-"building work" (maintenance) or as an alteration needing approval (guidance pages blocked). The app should force an "approval required? (certifier confirmed)" field for ACT re-roofs. Exemption assessments (BA Part 2A) are the formal route to confirm an exemption.

### ACT-12. Security of payment — VERIFIED
- **Does not apply to resident-owner contracts:** "This Act does not apply to ... (b) a construction contract for carrying out insurable residential building work if a resident owner is a party to the contract, to the extent that the contract relates to a building or part of a building where the resident owner lives or intends to live" (SOPA s 9(2)(b)). "Insurable residential building work" here has its BA meaning (class 1/2, ≤ 3 storeys), which carries no dollar floor. So **owner-occupied house roofing in the ACT is outside SOPA at any value.** Subcontracts to builders and work for investors or landlords are inside it.
- Payment schedule: the respondent becomes liable for the claimed amount if it does not provide a schedule "within the earlier of— (i) the time required by the relevant construction contract; or (ii) **10 business days** after the payment claim is given" (SOPA s 16(4)(b)).
- Due date: progress payment payable on the earlier of "15 business days after a payment claim is given" or the contract date (SOPA s 13(1)).
- **CORRECTED vs round 1:** round 1 listed the ACT owner-occupier coverage as "Not confirmed (Gap)". It is now confirmed **excluded**.

### ACT-13. Other prompts — VERIFIED
- **Asbestos (ACT stricter than the model WHS regulations):** "A person must not carry out the removal of the following at a workplace unless the person ... holds a Class B asbestos removal licence or a Class A asbestos removal licence: (a) non-friable asbestos or ACM" (WHSR s 487(1)). **There is no 10 m² unlicensed allowance in the ACT text.** The model WHS regulation 487 says "more than 10 m²"; that comparison is from background knowledge and was not re-read today. App rule for the ACT: any removal of AC roof sheeting needs a licensed removalist.
- Notification: "A licensed asbestos removalist must give written notice to the regulator at least 5 days before the removalist commences licensed asbestos removal work" (WHSR s 466(1)).
- Building work that involves "handling asbestos or disturbing friable asbestos" is itself "building work" (BGR s 5), and must follow approved plans that deal with the asbestos (BA s 42(1)(e)). Applications for buildings erected before 1985 need an asbestos removal control plan (BA s 26(2)(d)).
- Falls: WorkSafe ACT pages were blocked. Fall-specific ACT variations: **UNVERIFIED** this round.

```json ACT
{
  "state": "ACT",
  "regulator": "Construction Occupations Registrar (administered via Access Canberra - branding unverified)",
  "act": "Building Act 2004 (A2004-11) Part 6; Building (General) Regulation 2008 (SL2008-3) Part 4; Construction Occupations (Licensing) Act 2004 (A2004-12)",
  "licence": {
    "threshold_aud": 0,
    "classes": ["Builder class A", "Builder class B", "Builder class C", "Builder class D (non-structural basic building work only - likely insufficient for re-roofing)", "Asbestos removal licence Class A/B (WHS Reg) for any ACM removal"],
    "show_on": ["ads", "quote", "contract", "business_card", "vehicle"],
    "source": "COLA s 8, s 83(1) and examples, s 84(1); COLR sch 1 pt 1.3; BA s 10; https://www.legislation.act.gov.au/DownloadFile/a/2004-12/current/PDF/2004-12.PDF"
  },
  "written_contract": {
    "threshold_aud": null,
    "tiers": [],
    "source": "No written-contract requirement in BA/BGR; BA ss 89A-89E allow prescribed standard conditions / required documents / prohibited conditions (BGR s 38A, 38B). https://www.legislation.act.gov.au/DownloadFile/a/2004-11/current/PDF/2004-11.PDF"
  },
  "deposit": {
    "rules": [],
    "source": "No statutory deposit cap in BA/BGR. Insurance lost-deposit recovery cap $10,000 (BA s 93(3); BGR s 43)."
  },
  "cooling_off": {
    "applies_over_aud": null,
    "length": "",
    "unit": "business_days",
    "starts": "",
    "notice_text": "",
    "source": "None in BA/BGR/COLA; only ACL unsolicited consumer agreement 10 business days if unsolicited sale."
  },
  "insurance": {
    "scheme": "Residential building work insurance (authorised insurer) or fidelity certificate (approved fidelity fund scheme)",
    "threshold_aud": 12000,
    "before": "Must accompany the builder's application for a building commencement notice (only for work with a building approval); commencement notice lapses if work stops being insured",
    "roofing_only_covered": "depends",
    "source": "BA s 37(1),(4), s 38, s 84, s 90; BGR s 37 ($12,000), s 39 ($200,000), s 40 (5 yrs), s 41 (180 days), s 42 ($500), s 43 ($10,000)"
  },
  "documents": [
    {"name": "Required documents determined by the Minister (BGR s 38A) attached to residential building work contract - CONTENT UNVERIFIED", "when": "attached to the contract", "source": "BA s 89D; BGR s 38A"},
    {"name": "Residential building insurance policy / insurer certificate / fidelity certificate", "when": "with commencement notice application (approval-required work >= $12,000)", "source": "BA s 37(4)"},
    {"name": "Site sign (licensed builder)", "when": "while work carried out, for work only a licensed builder may do", "source": "BA s 37A"}
  ],
  "statutory_warranty": [
    {"type": "structural element (includes roof and its weatherproofing)", "years": 6, "source": "BGR s 38(1)(a), (2)"},
    {"type": "non-structural element", "years": 2, "source": "BGR s 38(1)(b)"},
    {"type": "owner rectification notice window (presumption of defect)", "years": 2, "source": "BA s 89F(2)"}
  ],
  "compliance_certificate": {
    "name": "None for roof stormwater (not sanitary/water-supply plumbing)",
    "threshold_aud": null,
    "deadline": "",
    "source": "WSA dictionary (sewage excludes stormwater; stormwater includes roof runoff); COLA s 13"
  },
  "permit": {
    "summary": "No express re-roofing exemption in BGR sch 1; small-structure, skylight <=4m2 and PV exemptions only; exemptions lost where structural integrity affected (BGR s 6(4)). Whether like-for-like re-roof is approval-exempt maintenance is UNVERIFIED - confirm with certifier / exemption assessment.",
    "source": "BGR s 6, sch 1 pts 1.2-1.3; BA s 6, Part 2A"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "no",
    "schedule_days": 10,
    "source": "SOPA s 9(2)(b) (resident owner excluded for insurable residential building work), s 16(4)(b) (10 business days), s 13(1) (due 15 business days)"
  },
  "other_prompts": [
    {"text": "Any removal of non-friable asbestos (e.g. AC roof sheeting) requires a Class B (or A) asbestos removal licence - no 10 m2 allowance in ACT text.", "source": "WHSR s 487(1)"},
    {"text": "Licensed asbestos removalist must notify regulator at least 5 days before licensed removal work.", "source": "WHSR s 466(1)"},
    {"text": "Advertising (incl. business cards, sample contracts, vehicle signage) must show licence name, licence number and ACN.", "source": "COLA s 83"},
    {"text": "Roof/weatherproofing work >= $12,000 carries 6-year structural statutory warranty from completion day.", "source": "BGR s 37, s 38; BA s 85, s 88"}
  ],
  "status_notes": "All values read 2026-11-06 in authorised PDFs on legislation.act.gov.au. Unverified: content of the Minister's required-documents determination (BGR s 38A); Access Canberra branding; whether like-for-like re-roofing needs building approval in practice; ACT fall-protection variations. Access Canberra, planning.act.gov.au and WorkSafe ACT were blocked by the session proxy."
}
```

---

## NSW — VERIFIED RULES

> **ROUND 3 IN PROGRESS (2026-11-06)** — www.nsw.gov.au now reachable via curl. Verified so far from Building Commission NSW pages on nsw.gov.au: licence > $5,000 incl GST labour+materials (roof plumbing, roof tiling, roof slating are TRADE work, not specialist); written contract > $5,000 incl GST; small job $5k–$20k; large > $20k; deposit max 10% for both small and large; 5 clear business days cooling-off > $20k; HBC cover > $20k incl GST before any payment and before work starts; Consumer Building Guide > $5,000 before signing; warranties 6 yrs major / 2 yrs other; variations in writing signed by both. Full block below is being rewritten.

> **No NSW primary text could be read in this round.** legislation.nsw.gov.au returns a Cloudflare bot challenge (HTTP 403) on every path; this was not bypassed. Fair Trading URLs redirect to www.nsw.gov.au, which the session proxy blocks, as it does SafeWork NSW, Service NSW, icare, NSW Planning, AustLII and the NSW Parliament file server. WebFetch cannot resolve any NSW host.
> So **every NSW item below is UNVERIFIED** in the brief's sense. What this round adds is **search-index corroboration**: web-search results restricted to `legislation.nsw.gov.au` / `nsw.gov.au`, where the search engine summarised the primary page. Those summaries are paraphrases, not quotes I read, and several came from **older consolidations** (2014–2024). Each item carries a "corroboration" grade:
> - **C1** = search summary of the primary page states the value and matches round 1;
> - **C2** = partial or ambiguous summary;
> - **C0** = nothing found.
>
> Date checked: 2026-11-06. To complete NSW, allow `legislation.nsw.gov.au` (and have Cloudflare not challenge the proxy) and `www.nsw.gov.au` in the session network, then re-read the sections cited.

Target sources (not readable today):
- Home Building Act 1989 (HBA): https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1989-147
- Home Building Regulation 2014 (HBR): https://legislation.nsw.gov.au/view/whole/html/inforce/current/sl-2014-0811
- Building and Construction Industry Security of Payment Act 1999 (SOPA): https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1999-046
- Plumbing and Drainage Act 2011 (PDA): https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-2011-059
- NSW Gov contracts guide: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/guide-to-providing-home-building-contracts

### NSW-1. Governing Act and regulator — UNVERIFIED (C2)
- HBA 1989 + HBR 2014. Search results show guidance under "Building Commission NSW" on nsw.gov.au (e.g. "How Building Commission NSW deals with building defect complaints", https://www.nsw.gov.au/departments-and-agencies/building-commission/about-us/building-defect-complaints). The plumbing NoW guidance says plumbers "submit a NoW to Building Commission NSW via the MyInspections Gateway" (nsw.gov.au summary). Templates should name **Building Commission NSW** (licensing, compliance) and **NSW Fair Trading** (consumer). The functional split is not confirmed.
- Round-1 note on the *Building (Approvals and Practitioners) Act 2026* (mostly uncommenced) was not checked: C0.

### NSW-2. Roofing-only work under the regime — UNVERIFIED (C1)
- Search summary of current HBA Schedule 1 (via the 2024 XML export): "roof plumbing work" covers "fixing, installing, renovating, altering, repairing and maintaining guttering, downpipes, roof flashing and roof coverings", with exceptions for non-metallic tiles, slates and glass. "Roof plumbing work done in connection with a dwelling is included in the definition of residential building work." So metal re-roofs, gutters, downpipes and flashings are residential building work. Tile and slate work is covered as general building work under the separate roof tiling and roof slating categories.
- No single-trade exemption was found (C0).

### NSW-3. Licence — UNVERIFIED (C1 for threshold; C2 for roof plumbing; C2 for licence number)
- Threshold: HBR prescribed amount "$5,000" for contracts on or after 1 Mar 2015 (search summary of HBR). NSW Gov guidance: licence needed "to carry out, advertise or contract for building or trade work that is valued at more than $5,000 in labour and materials (including GST)" (https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/general-building-work, summary). Matches round 1.
- **Change vs round 1 (gap resolved provisionally):** per the Schedule 1 summary, "specialist work" covers plumbing and drainage work **only where it is not roof plumbing work**. So roof plumbing is **not** specialist work, and the **$5,000** threshold applies, not "any value". Still C2; confirm in the HBA Sch 1 definition of "specialist work".
- Classes: roof plumbing (HBR lists "Roof plumbing" as work defined in Sch 1 of the Act), roof slating (HBR: "work involving the fixing of roof slates to the exterior surface of roof and fascia structures"), roof tiling (NSW Gov licence page per round 1; current HBR definition not surfaced: C2).
- Licence number: NSW guidance says the contract must include "the exact name on your contractor's licence and licence number" (summary of nsw.gov.au contracts guide). Advertising: round-1 rule (name, licence number, category, phone in all ads) was not re-corroborated in this round (C0 for the s 32 wording).

### NSW-4. Written contract thresholds — UNVERIFIED (C1)
- HBR (search summary): s 7(1A) prescribed amount "$20,000" for contracts on or after 1 Mar 2015 (full contract). s 7AAA prescribed amount "$5,000" (small jobs). "A small job contract is a contract that does not exceed a price of $20,000, but exceeds $5,000."
- Tiers: ≤ $5,000 no statutory written contract; > $5,000 and ≤ $20,000 small-jobs contract (s 7AAA); > $20,000 full contract (s 7 + Sch 2). Matches round 1. Whether the amounts are GST-inclusive for s 7 and s 7AAA was not surfaced. (The $20,000 for insurance is stated as GST-inclusive; see NSW-7.)
- Round-1 note that a NSW guidance summary said "written contract if the price exceeds $5,000": consistent with the small-jobs tier.

### NSW-5. Maximum deposit — UNVERIFIED (C1, with a version warning)
- Search summary of current HBA s 8: deposit capped at **10% of the contract price**, flat, for all residential building work. Matches round 1.
- **Warning:** the *as-made* HBR 2014 quick-check text summarised as "10% for work costing $20,000 or less or 5% for work costing more than $20,000". That is the pre-2014 tiered rule. Confirm the current s 8 before encoding. App default if unconfirmed: 10% hard cap, warning above 5% for > $20,000.

### NSW-6. Cooling-off — UNVERIFIED (C1 for 5-day / $20,000; C0 for prescribed wording)
- HBA s 7BA heading (summary): "person may rescind a contract for residential building work within 5 days without penalty". HBR: "For the purposes of section 7BA (1A) of the Act, the prescribed amount is $20,000." NSW guidance: contracts over $20,000 need "a clear statement setting out the cooling-off period of five clear business days after being given a copy of the contract" (summary).
- If the contract omits the statement, the owner may rescind "by notice in writing ... within 7 days of becoming aware that the contract should have contained such a notice" (summary of HBA). **New detail vs round 1**; prompt it in the app.
- Exceptions (e.g. legal-practitioner waiver) and the exact prescribed wording: C0. **Do not hard-code notice text** until s 7BA and the HBR schedule are read.

### NSW-7. Home Building Compensation Fund (HBCF) insurance — UNVERIFIED (C1)
- HBA s 92(2) (summary of 2024 consolidation): a person "must not demand or receive a payment under a residential building contract unless a complying insurance contract is in force and a certificate has been given to the other party". Max penalty 1,000 penalty units (corporation) / 200 (other).
- HBR: "For the purposes of sections 92 (3) and 96 (3) (e) of the Act, the amount of $20,000 (inclusive of GST) is prescribed." The certificate is due "before commencement of work and before demanding or receiving any payment" (summary of regulation-based consumer notice).
- Uninsured contractor: no damages or enforcement remedies; quantum meruit only if the court or tribunal finds it "just and equitable" (summary).
- Roofing-only coverage: since roof plumbing is residential building work (NSW-2), a > $20,000 re-roof is in scope. HBCF eligibility-manual exclusions were not checked: C0, "depends".

### NSW-8. Documents, progress payments, variations — UNVERIFIED (C2/C0)
- Large-jobs contracts must include insurance details, progress payments, warranties and the cooling-off statement (round 1, C1 earlier). The HBR contract checklist includes a cooling-off question (summary).
- Consumer Building Guide trigger, the HBA s 8A progress-payment rule and variations in writing: C0 this round.

### NSW-9. Statutory warranty durations — UNVERIFIED (C1)
- HBA s 18E (summary of the in-force page): proceedings must start within "6 years for a breach that results in a major defect ... or 2 years in any other case", running from completion. If the breach becomes apparent in the last 6 months of the period, a further 6 months is allowed. NSW Gov: for contracts signed on or after 1 Feb 2012, 6 years major / 2 years other. Matches round 1.
- Whether a failed roof covering counts as a "major defect" ("major element", e.g. roof cladding as weatherproofing) was not confirmed: C0.

### NSW-10. Roof plumbing compliance certificate / Notice of Work — UNVERIFIED (C2, possible CORRECTION)
- General PDA rule (summary): NoW to the plumbing regulator before work starts (Building Commission NSW via MyInspections in Sydney, Illawarra, Blue Mountains, Newcastle and Hunter; councils elsewhere). Certificate of compliance to the regulator and the customer. Round-1 timings (NoW ≥ 2 business days before; CoC ≤ 2 business days after, 7 if uninspected) were not re-corroborated (C0).
- **Possible correction:** a search summary of PDA s 4 indicates the definition of "plumbing and drainage work" deals with "roof plumbing work (being work declared by the regulations under the Home Building Act 1989 to be roof plumbing work)", apparently as an **exclusion**. The Act notes that work outside the definition is governed by other legislation "for example the Home Building Act 1989". A council page (Griffith) says stormwater work is regulated under the HBA. **If confirmed, roof plumbing (gutters, downpipes, flashings, metal roofing) needs no PDA Notice of Work or Certificate of Compliance**, and round-1's NoW/CoC prompt would apply only to stormwater drainage connected below ground (and then only where the PDA covers it). Status: UNVERIFIED. Do not ship either rule until PDA s 4 is read.

### NSW-11. Re-roofing approval — UNVERIFIED (C0 this round)
- Round-1 Codes SEPP exempt-development citations (re-cladding with similar materials, no structural change, heritage exclusions) were not re-checked. The planning.nsw.gov.au and legislation.nsw.gov.au EPI pages were blocked.

### NSW-12. Security of payment — UNVERIFIED (C1 for 10 business days; C2 for owner-occupier)
- SOPA s 14 (summary): schedule due within the earlier of the contract time or "10 business days after the payment claim is served". If no schedule is served, the whole claim is payable (nsw.gov.au summary).
- Owner-occupiers: NSW Gov SOP page summary says the Act "also applies to 'owner occupier construction contracts'". This is consistent with round 1 ("applies"). The mechanism and commencement (round 1 said 1 Mar 2021) were not confirmed. Default due dates (summary of nsw.gov.au table): principal to head contractor 15 business days; head contractor to subcontractor 20 (non-residential) / 10 (residential). **Corrects round 1's "UNVERIFIED prior knowledge: subcontractor 20 business days"**, because residential subcontracts are reportedly 10. Still C2.

### NSW-13. Other prompts — UNVERIFIED (C0 this round)
- Asbestos: round-1 rules (≤ 10 m² non-friable unlicensed; SafeWork NSW notice 5 days before licensed removal) could not be re-checked (safework.nsw.gov.au blocked).
- Unsolicited sales after storms: ACL 10-business-day termination right (not re-checked).

```json NSW
{
  "state": "NSW",
  "regulator": null,
  "act": "Home Building Act 1989 (NSW); Home Building Regulation 2014 (NSW) - primary text not readable this round",
  "licence": {"threshold_aud": null, "classes": [], "show_on": [], "source": "https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1989-147 (blocked: Cloudflare 403)"},
  "written_contract": {"threshold_aud": null, "tiers": [], "source": "HBA s 7, s 7AAA; HBR (blocked)"},
  "deposit": {"rules": [{"max_contract_aud": null, "pct": null, "cap_aud": null}], "source": "HBA s 8 (blocked)"},
  "cooling_off": {"applies_over_aud": null, "length": "", "unit": "business_days", "starts": "", "notice_text": "", "source": "HBA s 7BA; HBR (blocked)"},
  "insurance": {"scheme": "Home Building Compensation Fund (HBCF)", "threshold_aud": null, "before": "", "roofing_only_covered": "depends", "source": "HBA s 92, s 96; HBR (blocked)"},
  "documents": [],
  "statutory_warranty": [{"type": "major defect", "years": null, "source": "HBA s 18E (blocked)"}, {"type": "other defect", "years": null, "source": "HBA s 18E (blocked)"}],
  "compliance_certificate": {"name": "", "threshold_aud": null, "deadline": "", "source": "Plumbing and Drainage Act 2011 s 4 scope unresolved (blocked)"},
  "permit": {"summary": "", "source": "Codes SEPP 2008 (blocked)"},
  "security_of_payment": {"applies_to_owner_occupier": "unclear", "schedule_days": null, "source": "SOPA 1999 s 14 (blocked)"},
  "other_prompts": [],
  "unverified_candidates": {
    "_grade": "C1 = search-engine summary of the primary page matches; NOT read. Do not ship without re-reading.",
    "licence_threshold_aud": {"value": 5000, "incl_gst": true, "grade": "C1", "note": "labour + materials; roof plumbing appears NOT to be specialist work (C2)"},
    "licence_classes": ["Roof plumbing", "Roof tiling", "Roof slating", "General building work"],
    "licence_number_on": {"contract": "C1", "ads": "round-1 only", "quote": "best practice"},
    "small_jobs_contract_aud": {"over": 5000, "up_to": 20000, "grade": "C1"},
    "full_contract_over_aud": {"value": 20000, "grade": "C1"},
    "deposit_pct_max": {"value": 10, "grade": "C1", "warning": "pre-2014 rule was 5% over $20,000; confirm current s 8"},
    "cooling_off": {"over_aud": 20000, "length": 5, "unit": "business_days", "starts": "after owner is given a copy of the signed contract", "grade": "C1", "missing_notice_remedy": "owner may rescind within 7 days of becoming aware the notice was required (C1)"},
    "hbcf": {"over_aud": 20000, "incl_gst": true, "before": "before any payment demanded/received and before work starts", "grade": "C1"},
    "statutory_warranty_years": {"major_defect": 6, "other": 2, "plus_6_months_if_apparent_in_last_6_months": true, "grade": "C1"},
    "sop_payment_schedule_business_days": {"value": 10, "grade": "C1"},
    "sop_owner_occupier": {"value": "yes", "grade": "C2"},
    "sop_default_due_business_days": {"principal_to_head": 15, "head_to_sub_nonresidential": 20, "head_to_sub_residential": 10, "grade": "C2"},
    "roof_plumbing_now_coc": {"value": "possibly not required - PDA s 4 may exclude roof plumbing work", "grade": "C2"}
  },
  "status_notes": "All NSW values null because no NSW primary page could be read on 2026-11-06 (legislation.nsw.gov.au Cloudflare challenge; nsw.gov.au/fairtrading/safework/service/icare/planning/austlii blocked by the session proxy). Candidate values in unverified_candidates come from search-engine summaries of legislation.nsw.gov.au and nsw.gov.au pages, some from older consolidations. Key open questions: current HBA s 8 (10% flat vs tiered), s 7BA exceptions and prescribed wording, whether PDA s 4 excludes roof plumbing (affects NoW/CoC prompts), HBA s 32 advertising rule, SOPA owner-occupier mechanism, Codes SEPP re-roof exemption."
}
```

---

## What changed vs round-1 notes

**ACT (primary-verified):**
1. Statutory warranties apply to residential building work ≥ $12,000 **whether or not approval is needed**. Insurance applies only where a building approval and commencement notice are involved (BA s 37(4)). Round 1 tied both to approval.
2. **Roof and weatherproofing = structural element**, so roof work gets the 6-year warranty (BGR s 38(2)(b)). This is new.
3. **No statutory deposit cap** in the ACT. The round-1 "10% up to $20k" claim is not ACT law.
4. **No ACT building-contract cooling-off** (confirmed by full-text search).
5. **No written-contract requirement**, but the Minister's "required documents" must be attached (BA s 89D / BGR s 38A). Which documents is unverified.
6. **SOP excludes resident owners** of insurable residential building work (SOPA s 9(2)(b)). Round 1 had this as a gap. Schedule: 10 business days; due date: 15 business days.
7. **Licence**: no dollar threshold; builder classes A–D; class D is non-structural only. **No roof-plumbing licence**, because stormwater is outside ACT plumbing (WSA). Advertising, including business cards and sample contracts, must show name, licence number and ACN (COLA s 83).
8. **Asbestos**: any non-friable ACM removal needs a Class B licence, with no 10 m² allowance in the ACT text. Notify 5 days before.
9. Insurance figures confirmed: $200,000 minimum cover, 5-year period, 180-day claims window, $500 excess, $10,000 lost-deposit cap.

**NSW (not primary-verified; search-corroborated only):** the round-1 numbers held up ($5k licence; $5k–$20k small jobs; > $20k full contract, HBCF and 5-day cooling-off; 10% deposit; 6/2-year warranties; 10-business-day SOP schedule). New or changed points:
- (a) roof plumbing appears **not** to be specialist work, so the $5k threshold applies;
- (b) owner remedy of 7 days to rescind if the cooling-off notice is missing;
- (c) the PDA may **exclude** roof plumbing from NoW/CoC (possible correction of round 1);
- (d) residential subcontract SOP due date reportedly 10 business days, not 20;
- (e) warning that the old 5% deposit tier still appears in as-made regulation text.
