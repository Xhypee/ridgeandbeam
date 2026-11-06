# VERIFIED RULES — NSW and ACT (round 2, primary-source verification)

> Status: COMPLETE for this round (2026-11-06). ACT: primary-verified from legislation.act.gov.au. NSW: updated in round 3 (2026-11-06) — regulator-verified from Building Commission NSW pages on www.nsw.gov.au and icare; statute text still blocked (see NSW section access log).
> Method: legislation texts downloaded as the official authorised PDFs from the ACT Legislation Register (www.legislation.act.gov.au), via curl through the session proxy, and read in full for the relevant parts. Date checked for every ACT item: **2026-11-06**.
> Access log (what was blocked, so nobody re-tries blindly):
> - `www.legislation.act.gov.au`: **reachable** (HTML + PDF). All ACT quotes below come from here.
> - `www.accesscanberra.act.gov.au`, `accesscanberra.act.gov.au`, `www.planning.act.gov.au`, `www.worksafe.act.gov.au`, `legislation.act.gov.au` (no www): **blocked by the session proxy** (CONNECT 403). No regulator guidance pages were read.
> - `legislation.nsw.gov.au`: reachable but answers with a **Cloudflare "Just a moment..." bot challenge (HTTP 403)** on every path tried (/view/html, /view/pdf, /view/whole, /export/xml). Not bypassed.
> - `www.legislation.nsw.gov.au`: no response. `www.fairtrading.nsw.gov.au`: answers **301 → prod.redirects.dcs.skpr.live → www.nsw.gov.au**, and `www.nsw.gov.au` / `nsw.gov.au` / `fairtrading.nsw.gov.au` / `www.safework.nsw.gov.au` / `www.service.nsw.gov.au` / `www.icare.nsw.gov.au` / `www.planning.nsw.gov.au` are **blocked by the session proxy**. `www.austlii.edu.au`: 403 bot challenge.
> - WebFetch tool: returns ENOTFOUND for every NSW host and for `www.fairtrading.nsw.gov.au`; it cannot be used here.
> - **Round 3 update (2026-11-06):** `www.nsw.gov.au` and `www.icare.nsw.gov.au` are now reachable via curl; the NSW section was re-done from them. `legislation.nsw.gov.au` (Cloudflare 403), SafeWork NSW, NSW Planning, SIRA and `www.buildingcommission.nsw.gov.au` remain unreachable.
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

> **Round 3 (2026-11-06): regulator-verified.** `www.nsw.gov.au` (where Building Commission NSW and the former NSW Fair Trading content now live) and `www.icare.nsw.gov.au` were reachable with plain `curl` through the session proxy. No header spoofing was used. Every quote below was read today on those pages or in the official PDFs they host: the Consumer Building Guide (Nov 2025 edition) and the Building Commission NSW sample contracts (July 2025 editions).
> Access log for NSW:
> - **Reachable:** `www.nsw.gov.au` (HTML + PDFs), `www.icare.nsw.gov.au`, `www.accc.gov.au`.
> - **Still blocked:** `legislation.nsw.gov.au` (Cloudflare "Just a moment..." HTTP 403 on every path; not bypassed). `www.buildingcommission.nsw.gov.au`, `www.safework.nsw.gov.au`, `www.planning.nsw.gov.au`, `www.planningportal.nsw.gov.au`, `www.sira.nsw.gov.au`, `www.legalaid.nsw.gov.au`, `www.parliament.nsw.gov.au` and `www.safeworkaustralia.gov.au` get no connection (curl 000). WebFetch gives ENOTFOUND for safework. `www.austlii.edu.au`: 403.
> - So the **Act and Regulation text itself was not read**. Where a value rests on regulator guidance rather than the statute, the item says so. Section numbers are given as the regulator or the sample contract cites them.
>
> Statuses: **VERIFIED** = read today on a primary NSW Government (regulator) page or official PDF; **CORRECTED** = round-1/round-2 value was wrong, old value stated; **UNVERIFIED** = not readable today (reason given). Date checked for every item: **2026-11-06**.

Sources used (all checked 2026-11-06):
- [S1] Guide to providing home building contracts (Building Commission NSW, updated 11 Jun 2026): https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/guide-to-providing-home-building-contracts
- [S2] Contracts for residential building work (homeowner page, updated 29 Apr 2026): https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts
- [S3] Checklist for home owners (> $20,000): https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts/checklist
- [S4] Categories and classes of building and trade work: https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/categories-of-work
- [S5] Roof plumbing work (updated 23 Jun 2026): https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-plumbing-work
- [S6] Roof tiling work (updated 23 Jun 2026): https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-tiling-work
- [S7] Roof slating work (updated 23 Jun 2026): https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-slating-work
- [S8] General building work (updated 3 Sep 2026): https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/general-building-work
- [S9] Plumbing, draining and gasfitting: https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/plumbing-draining-and-gasfitting
- [S10] Building trade advertisements: https://www.nsw.gov.au/business-and-economy/running-a-business/advertising-laws-and-your-business/building-trade-advertisements
- [S11] Insurance cover for building work (updated 6 Jul 2026): https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/insurance-cover
- [S12] icare, Do I need HBCF?: https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/do-i-need-hbcf
- [S13] icare, What is a Certificate of Insurance?: https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/apply-for-insurance
- [S14] icare, HBCF: What am I covered for?: https://www.icare.nsw.gov.au/builders-and-homeowners/homeowners/hbcf-what-am-i-covered-for
- [S15] Consumer Building Guide, web version (Building Commission NSW): https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide/guide. The PDF (updated Nov 2025) is at https://www.nsw.gov.au/sites/default/files/noindex/2026-02/consumer-building-guide-2025.pdf. How-to page (updated 10 Feb 2026): https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide
- [S16] Building Commission NSW sample contract for work over $20,000 (July 2025): https://www.nsw.gov.au/sites/default/files/noindex/2026-03/home-building-contract-over-20000-july-2025.pdf
- [S17] Building Commission NSW sample contract for work $5,000–$20,000 (July 2025): https://www.nsw.gov.au/sites/default/files/noindex/2026-03/home-building-contract-5000-to-20000-july-2025.pdf
- [S18] How Building Commission NSW deals with building defect complaints: https://www.nsw.gov.au/departments-and-agencies/building-commission/about-us/building-defect-complaints
- [S19] Plumbing inspection documents (NoW / CoC): https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/plumbers-and-drainers/plumbing-inspection-documents
- [S20] Work requiring inspections (metro plumbing): https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/plumbers-and-drainers/metropolitan-inspections/work-requiring-inspections
- [S21] Changes to Security of Payment laws: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/changes-to-laws
- [S22] About Security of Payment: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/about
- [S23] Responding to a payment claim: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/responding-to-a-payment-claim
- [S24] Security of Payment FAQs: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/frequently-asked-questions
- [S25] Making a payment claim: https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/making-a-payment-claim
- [S26] ACCC, Door-to-door & telemarketing sales (business): https://www.accc.gov.au/business/advertising-promoting-your-business/door-to-door-telemarketing-sales

### NSW-1. Governing Act and regulator — VERIFIED
- **Act:** *Home Building Act 1989* (HBA) and *Home Building Regulation 2014* (HBR). Also relevant: *Building and Construction Industry Security of Payment Act 1999* (SOPA) and its *Regulation 2020*.
- **Regulator for licensing, contracts and disputes:** **Building Commission NSW.** [S15]: "Building Commission NSW is the NSW Government agency regulating residential building work (including building or trade work on single dwellings, villas, houses and home units) under the Home Building Act 1989." The sample contracts and the Consumer Building Guide are "published by the Building Commission NSW" [S1].
- **Insurance regulator:** **SIRA.** [S15]: "The State Insurance Regulatory Authority (SIRA) regulates home building compensation (HBC) cover in NSW". The **insurer** is icare's Home Building Compensation Fund (HBCF) [S12].
- **Legacy branding:** `www.fairtrading.nsw.gov.au` 301-redirects to nsw.gov.au, and the advertising page [S10] still says "Fair Trading NSW requires that advertisements include…". Templates should name **Building Commission NSW**. They can mention that it was formerly part of NSW Fair Trading.
- Round-1 note on the *Building (Approvals and Practitioners) Act 2026*: not checked (UNVERIFIED; legislation site blocked).

### NSW-2. Does roofing-only work fall under the residential regime? — VERIFIED
- **Yes.** Residential building work "means any activities related to constructing, altering, or adding to a dwelling. This includes repairing, renovating, decorating, or applying protective treatments to the property" [S8]. Re-roofs, repairs, restorations/coatings and gutters on a dwelling are therefore in scope.
- **Roofing trades are trade work, not specialist work** [S4], [S5], [S6], [S7]:
  - "Roof plumbing work is trade work." It is "any work involved in fixing, installing, renovating, altering, repairing and maintaining guttering, downpipes, roof flashing and roof coverings on any building or structure". It excludes coverings of "non-metallic tiles and slates", glass, concrete, timber, thatching and "malthoid, bituminous or similar membrane material". It "includes putting in skylights, ventilators and the like and work to put on protective coatings that doesn't involve structural changes" [S5].
  - "Roof tiling work is trade work." Roof tile means "a pressed or moulded tile of concrete, clay or metal fixed in rows to tile battens…". The work "includes tile bedding and pointing, and putting in flashing valleys, anti-ponding board, sarking and battens", plus skylights, ventilators and protective coatings without structural change [S6]. Definition: HBR Sch 4.
  - "Roof slating work is trade work." It includes shingles and shakes or imitations, flashing, sarking, battens and valleys [S7].
  - The specialist-work list is "Air conditioning and refrigeration; Electrical; Disconnection and reconnection of fixed electrical equipment; Medical gas and mechanical services; Plumbing, draining and gasfitting" [S4]. [S9]: "'Plumbing' includes water plumbing, sewerage and sanitary work. It does not include draining work or roof plumbing."
- **No single-trade exemption** from the contract, deposit, cooling-off or HBC rules was found on the regulator pages. The only carve-outs found are the cooling-off exceptions (NSW-6) and the HBC "exempt" projects, whose list sits in the blocked HBR (NSW-7).
- **Status:** VERIFIED; this confirms round-2's provisional finding that roof plumbing is not specialist work.

### NSW-3. Licence — VERIFIED
- **Threshold: more than $5,000, including GST, labour plus materials.** [S5]: "you need a contractor licence to do any residential building or trade work, including roof plumbing, which is valued at more than $5000 in labour and materials (including GST)". [S6] and [S7] use identical wording for roof tiling and roof slating. **Roof plumbing is NOT "any value"** (round-1 gap closed).
- **The licence covers carrying out, advertising and contracting:** "You must have a contractor licence to carry out, advertise or contract for building or trade work that is valued at more than $5,000…" [S5].
- **Subcontractors:** "The requirement to have a contractor licence also applies if you subcontract for building or trade work which is part of an overall contract for building or trade work valued at more than $5,000…". The page's example is a $3,000 subcontract inside a $30,000 job [S8].
- **Classes relevant to roofing:**
  - Roof plumbing (metal roofs, gutters, downpipes, flashings) [S5].
  - Roof tiling (concrete, clay or metal tiles) [S6].
  - Roof slating [S7].
  - General building work, since "A general builder can do any work that is residential building work" [S4].
  - Licence types: individual (or endorsed) contractor licence, company/partnership contractor licence, and qualified supervisor certificate [S5].
  - **Company trap:** "A licence in the name of an individual does not permit the individual's company or partnership to make the contract" [S2].
- **Penalty for unlicensed work:** "$22,000 as an individual or $110,000 as a company" [S5].
- **Licence number must appear on:**
  - **Ads:** VERIFIED. "The licensee's name and licence number must be shown in all advertising". A registered business name may be shown instead of the licensee's name. The regulator also requires "licence number with correct category of work" and a "business telephone number" in ads. Media covered: "print, internet, television, radio, other advertising" [S10]. (Section 32 of the HBA is not named on the page.)
  - **Contracts:** VERIFIED for both tiers. Small: "the number of the contractor licence"; large: "the exact name on your contractor's licence and licence number" [S1].
  - **Quotes:** no express rule found. A quote that circulates as promotional material is likely "advertising", so the app should print the name, number and category on quotes as well (recommended practice, not a verified rule).
- **Ad pricing rule:** "You cannot state a price that is only a part of the cost unless the single price is also clearly stated" [S10].

### NSW-4. Written contract thresholds and tiers — VERIFIED
- **Threshold:** a written contract is needed "if the contract price is over $5,000 (including GST), or if the price isn't known but the reasonable market cost of labour and materials exceeds $5,000" [S1].
- **Tiers:** "Jobs are considered small if they're worth $5,000–$20,000 and large if they're over $20,000. Each type requires a different contract" [S1].
  - **≤ $5,000:** no statutory written contract (best practice: still give one).
  - **> $5,000 to $20,000: small jobs contract.** "dated and signed by, or on behalf of, each party". Must contain:
    - the parties' names, including the licence-holder's name as shown on the licence;
    - the licence number;
    - a description of the work;
    - any plans or specifications;
    - the contract price if known;
    - a "quality of construction" clause (BCA, other codes and standards, consent conditions);
    - the permitted design-liability limitation clause;
    - "a copy of the Consumer Building Guide" [S1];
    - an information sheet about registered certifiers, and the owner's freedom to choose a certifier, if a certifier is required [S2].
  - **> $20,000: large jobs contract.** Everything in the small contract, plus:
    - the contract price "prominently displayed on the first page", with a warning if it is unknown or may change;
    - the HBC cover cost;
    - warranties;
    - the variations clause;
    - the progress payment schedule;
    - the termination clause;
    - the 17-item checklist plus a caution;
    - a note on the owner's entitlement to a copy "within 5 days of signing";
    - the HBC certificate note;
    - the 5-clear-business-day cooling-off statement;
    - the owner's acknowledgement of the Consumer Building Guide and checklist [S1].
- **GST:** the $5,000 tier is stated as GST-inclusive [S1], [S2]. The regulator page does not say "incl GST" for the $20,000 contract tier. HBC's $20,000 is stated as including GST [S11]. Treat both $20,000 tiers as GST-inclusive. The sample contract also says "The contract price includes all taxes (including GST)" [S16].
- **Copy of the signed contract:** "The builder or tradesperson must give you a copy of the contract within five business days after you sign it (the weekend, NSW public holidays and 27-31 December [inclusive] do not count)" [S2].
- **Arbitration clauses** "are not permitted in a home building contract and are deemed void" [S2].

### NSW-5. Maximum deposit — VERIFIED (no 5% tier remains)
- **10% flat for all contracts.** [S1]: "You cannot request a deposit of more than 10 percent. This applies to both small jobs contracts and contracts for large jobs." [S2]: "the maximum deposit you can be asked to pay is 10 percent." [S3] checklist: "Is the deposit within the legal limit of 10%?"
- **Any up-front money counts.** [S16] owner note: "Any amount received by the contractor prior to the commencement of work irrespective of whether the payment is described as a deposit or a payment for any other reason must not exceed the maximum allowable deposit amount."
- **HBC interaction:** for jobs over $20,000, no deposit at all until the HBC certificate has been given (NSW-7).
- **Status:** VERIFIED. **Round-2 warning resolved:** the old "5% for work over $20,000" tier does **not** appear on any current regulator page or sample contract. Do not encode it. (The current HBA s 8 text itself was not read; blocked.)

### NSW-6. Cooling-off — VERIFIED
- **Applies to** contracts "valued at over $20,000". **Length:** "5 clear business days" [S1], [S2].
- **Business day** "means any day other than a Saturday, Sunday, public holiday or 27, 28, 29, 30 or 31 December" [S16].
- **Start of the period** [S16, clause "Cooling off period"]:
  - "(a) where the owner has been given a copy of the signed contract – within 5 clear business days after being given a copy of the signed contract, or
  - (b) where the owner has not been given a copy of the signed contract within 5 days after the contract was signed – within 5 clear business days after the owner becomes aware of being entitled to be given a copy of the signed contract."
- The owner can rescind "even if work has commenced under the contract" [S16].
- **Form of notice:** it "must state that the owner rescinds the contract", left at the contractor's address or served under the contract's notice clause [S16].
- **Effect of rescission** [S16]: the contract is rescinded from signing. The contractor may keep "reasonable out of pocket expenses" incurred before rescission, must refund all other money, is "entitled to be paid a reasonable price for any work carried out … to the date the notice of rescission is given", and the owner "is not liable to the contractor in any way for rescinding".
- **Exceptions** (owner note in [S16]). The cooling-off provisions do not apply to contracts:
  - (i) between parties who each hold a contractor licence, for work each licence authorises;
  - (ii) between a licensed contractor and a developer;
  - (iii) "where, if the work were not to be done promptly there is likely to be a hazard to the health or safety of any person or to the public or to be damage to property and the work could not be done promptly if the cooling off provisions were to be complied with before commencing the work". **This is relevant to urgent storm and leak roof repairs over $20,000;**
  - (iv) contracts wholly supplied and prepared by the owner's side.
- **Waiver:** the period "may be shortened or deleted … provided the owner gives to the contractor a certificate by a legal practitioner that complies with s.7BA(5) Home Building Act" [S16].
- **Notice wording:** the HBR requires "a clear statement setting out the cooling-off period" [S1]. **No single prescribed form of words was found.** The ready-to-use wording is the Building Commission NSW sample-contract clause quoted above. The app should reproduce that clause verbatim; it is government-published.
- **Missing cooling-off statement: UNVERIFIED** (search summary only; HBA text blocked). The reported remedy is that a non-licensee "may, by notice in writing, rescind the contract within 7 days of becoming aware that the contract should have contained such a notice". No regulator page read today states it. Keep it as a warning prompt, not a hard rule.
- **Separate ACL right (unsolicited sales, e.g. door-knocking after storms):** VERIFIED on [S26].
  - **Trigger:** the agreement is unsolicited and its total value is $100 or more ("doesn't apply to agreements where the total value is less than $100").
  - **Length:** "10 business days, starting the first business day after they sign or receive the agreement document".
  - **Front-page notice:** "You have a right to cancel this agreement within 10 business days from and including the day after you signed or received this agreement. Details about your additional rights to cancel this agreement are set out in the information attached to this agreement."
  - **During the period:** no services may be supplied and no payment taken, "except electricity, gas or emergency repairs".
  - **Extension:** to 3 months or 6 months on breach.
  - **Visiting hours:** weekdays 9 am–6 pm and Saturdays 9 am–5 pm; no visits on Sundays or public holidays.
  - **Stacking:** this right stacks with the HBA right.

### NSW-7. Home Building Compensation (HBC) cover / icare HBCF — VERIFIED
- **Scheme:** Home Building Compensation Fund (HBCF), run by icare and regulated by SIRA. It was formerly called home warranty insurance [S11], [S15].
- **Threshold:** "you must get home building compensation (HBC) cover for each home building project over $20,000 including GST" [S11]. icare: "required for most residential building projects over $20,000 (including GST), unless the project is exempt" [S12].
- **Who must insure:** the contractor dealing directly with the owner, not a subcontractor: "You are contracting directly with a homeowner, developer, or owner-builder (not as a subcontractor)"; "the principal contractor is the one who must meet the insurance obligation" [S12].
- **Timing:** "You must have HBCF cover before you: Start work, or take any payment for the project, including a deposit" [S12]. Once the certificate is issued, "you must give the homeowner evidence of cover before work begins or money changes hands" [S12]. "Each project needs its own certificate" [S13].
- **Certificate of Eligibility:** the builder needs an active one first [S12].
- **Owner checklist** [S3]: "you are not required to pay the contractor a deposit or any progress payments until the contractor has given you a certificate of insurance under Part 6 or 6B".
- **What HBCF is:** last-resort cover. It applies on insolvency, death, disappearance, or licence suspension for failing to comply with an NCAT or court order. Defect cover runs up to 6 years for major defects and 2 years for other defects [S14].
- **Roofing-only: "depends."** A roofing job is residential building work (NSW-2), so a roofing contract over $20,000 incl GST made directly with the owner needs HBC cover unless exempt. icare lists "If the work is specialist or unusual" as a reason to check [S12]. The **exemption list is in the HBR, which was blocked: UNVERIFIED.**
- **App rule:**
  - over $20,000 incl GST and head contract → block deposit and payment requests until a certificate number is entered;
  - roofing subcontract under a builder → no HBC needed by the roofer.

### NSW-8. Required documents, progress payments, variations — VERIFIED
- **Consumer Building Guide (CBG).** "By law, tradespeople must give consumers a copy of the guide before they sign a contract for residential building work worth more than $5,000" [S15 how-to].
  - The guide "was updated November 2025. Traders should download and use the updated guide as soon as possible" [S15 how-to].
  - It may be reproduced in contracts only unmodified [S15 how-to].
  - For contracts over $20,000, the owner must acknowledge they have "read and understood" it [S1].
- **Security of Payment Guide** in every contract over $20,000. "From 26 June 2021 it will be mandatory for all construction contracts with a value of over $20,000 to contain the Security of Payment Guide. This is prescribed in clause 8 of the Home Building Regulation 2014". Omitting it attracts "a $8,800 fine in the case of a corporation and a $4,400 fine in any other case" [S21]. It is also checklist item 17 [S3].
- **17-item owner checklist** for contracts over $20,000, with a caution [S3]. The full list is on [S3] and in [S16].
- **Certifier information sheet** and the owner's freedom to choose a certifier, where a certifier is required [S2], [S15].
- **HBC certificate** before any payment or work (over $20,000) [S12].
- **Signed copy of the contract** within 5 business days [S2].
- **Progress payments** (large contracts): "All contracts over $20,000 in value must have a progress payment schedule. Progress payments must match the work carried out" [S2]. The schedule "may only include" [S1]:
  - "fixed payments to be made following the completion of specified stages of work" (specified amount or percentage; stages described in plain language);
  - payments "as work is performed and costs are incurred … supported by invoices, receipts or other documentation";
  - or a combination of the two.
  - Small contracts "may specify work be paid for at regular intervals" [S2].
- **Variations:** "must be in writing and signed by both the homeowner and contractor" [S1]. "Documents authorising variations must contain a statement explaining the cost implications … Calculation of the price change should be shown, rather than just a simple dollar amount" [S2].
  - **Emergency exception:** "If the variation is needed because there is likely to be danger to someone or damage to property … the written variation may be done after the work has been carried out" [S2].
  - The variations clause is a mandatory term for large contracts [S1]. For small contracts the in-writing rule is stated in the CBG ("Any change you need to make to a contract is a 'variation'. Variations must be in writing and be signed by both parties") [S15].

### NSW-9. Statutory warranty durations — VERIFIED
- **Periods:** "Statutory warranties are in effect for six years for major defects and two years for all other defects, commencing from the date when the work was completed" [S2].
- **Extension:** "If you find out there has been a breach of warranty in the last 6 months of the statutory warranty period, homeowners have an extra 6 months" [S18].
- **They apply anyway:** "Even if these warranties are not written into the contract you sign, the law says that they still apply" [S2]. "No provision of this contract can reduce, restrict or remove these statutory warranties" [S16].
- **Major defect** = "a defect in a major element of the building due to defective design, workmanship or materials, or failure to comply with the National Construction Code structural performance requirements. This may include but is not limited to: a load-bearing component essential to the stability of the building such as foundations, footings, floors, walls, roofs, columns or beams; fire safety system; waterproofing" [S18].
  - **Roofing implication:** a roof leak that is a failure of **waterproofing**, or a failure of roof structure, can be a *major* defect with 6-year exposure. A cosmetic coating or finish defect is 2-year.
  - The exact HBA s 18E wording was not read (blocked).

### NSW-10. Roof plumbing Notice of Work / Certificate of Compliance — CORRECTED (regulator-level); statute UNVERIFIED
- **Round-1 value:** a NoW at least 2 business days before roof plumbing work, and a CoC within 2 business days after (7 if uninspected).
- **Corrected finding:** NoW and CoC are a *plumbing and drainage* regime, under the Plumbing and Drainage Act 2011, administered by Building Commission NSW in metro areas and by councils elsewhere.
  - [S19]: "Plumbers and drainers before starting work must submit a NoW…". "Plumbers and drainers at the completion of all plumbing and drainage work must complete a CoC…".
  - Roof plumbing is a separate HBA trade category. [S9]: "'Plumbing' … does not include draining work or roof plumbing". [S5] defines roof plumbing under HBR Sch 1.
  - The metro work-requiring-inspection list [S20] covers sanitary drainage, recycled water and final inspections. It contains nothing on roofs, gutters, downpipes or stormwater.
- **Result:** **no NoW or CoC prompt for roof plumbing** (roofs, gutters, downpipes, flashings).
- **Unverified pieces:** the statutory exclusion in PDA s 4 ("roof plumbing work" and stormwater pipes excluded) is known only from search-engine summaries; legislation.nsw.gov.au was blocked. Some regional councils reportedly require approvals for stormwater drainage (search summary, e.g. Tenterfield).
- **App rule:** if the job includes below-ground stormwater or sanitary connections, show "check with council / Building Commission NSW". Never auto-generate a CoC for roof work.
- The round-1 NoW/CoC day counts were not re-verified and should not be used.

### NSW-11. Re-roofing approval (Codes SEPP exempt development) — UNVERIFIED
- The *State Environmental Planning Policy (Exempt and Complying Development Codes) 2008* is on legislation.nsw.gov.au (blocked). planning.nsw.gov.au and planningportal.nsw.gov.au are also blocked.
- Search-engine summaries (not read) say:
  - "repair or replacement of a non-structural wall or roof cladding" is exempt development unless the property is a heritage item or draft heritage item;
  - roof re-cladding is exempt only on 1–2 storey dwelling houses and attached or detached development;
  - no combustible cladding;
  - BCA deemed-to-satisfy compliance is required;
  - councils may ask for materials to match the existing roof.
- **App rule until verified:**
  - prompt "Like-for-like re-roof on a 1–2 storey house, not heritage-listed or in a heritage conservation area, no structural change: usually exempt. Otherwise confirm with council or a certifier."
  - Never state "no approval needed" as fact.
- [S15] adds a verified duty: "check with your local council or an accredited private certifier on approvals your building work needs … engage a building certifier. This is your responsibility, not the builder's".

### NSW-12. Security of payment — VERIFIED (with one regulator-page inconsistency)
- **Owner-occupiers: YES, from 1 March 2021.** [S21]: "These recent changes affect 'owner occupier construction contracts'. These types of contracts are generally building work done to residential properties where the person who engages the builder resides or proposed to reside. These changes come into effect 1 March 2021." [S25]: the Act "also applies to 'owner occupier construction contracts'".
- **Exclusion:** the Act does not apply to owner-occupier contracts for "residential building work where the total cost of labour and materials is less than $5,000", or for electrical, plumbing/draining/gasfitting or air-conditioning work [S24]. **Roofing over $5,000 for an owner-occupier is covered.**
- **Inconsistency:** [S23] ("Who is a respondent?") still says a respondent is someone who does "not live or propose to live in the part of the premises". That looks like a stale pre-2021 page. Follow [S21] and [S24].
- **Payment schedule:** "within the time outlined in the construction contract, or within 10 business days after the payment claim is served (whichever is earlier)" [S21]. A respondent who doesn't serve a schedule in time "is liable for the full amount claimed" [S23].
- **Default due dates** when the contract is silent:
  - owner-occupier (homeowner) to builder: 10 business days [S21];
  - principal to head contractor: 15 business days;
  - head contractor to subcontractor: 20 business days (non-residential) or 10 business days (residential) [S22], citing SOPA s 11(1A)(a), 11(1B)(a), 11(1C)(b).
- **Payment-claim wording:** "All payment claims must now state that they are being made under the Building and Construction Industry Security of Payment Act 1999" [S21].
- **Claim frequency:** monthly claims, one per month, from the last day of the month the work was done [S21].
- **Suspension:** a claimant may suspend work "following 2 business days' warning" [S23].
- **Status:** VERIFIED. Round 2's "subcontractor 20 business days" applies only to **non-residential** work. Residential is 10.

### NSW-13. Other prompts — partly VERIFIED
- **VERIFIED:**
  - Advertising must show the licensee name (or registered business name), licence number with category, and business phone [S10].
  - A company must hold its own licence; an individual's licence doesn't cover their company [S2].
  - Subcontracted roofing inside a job over $5,000 needs its own licence [S8].
  - Emergency cooling-off exception and after-the-fact written variations for urgent work [S16], [S2].
  - ACL door-to-door rules for storm-chasing sales [S26].
  - Termite-control responsibility: the owner should not be made responsible in the contract [S2].
  - Demolition is no longer HBA-licensed; SafeWork licences or permits may apply (nsw.gov.au "Work no longer regulated by the Home Building Act" page).
- **Asbestos: UNVERIFIED** (safework.nsw.gov.au and safeworkaustralia.gov.au blocked). Search summaries of SafeWork NSW pages say:
  - non-friable asbestos up to 10 m² may be removed without a licence (Code of Practice applies);
  - more than 10 m² needs a Class B licence;
  - SafeWork NSW must be notified "5 calendar days" before licensed removal (the Service NSW page reportedly says "5 working days");
  - don't walk on corrugated asbestos roofs; no high-pressure cleaning.
  - **App rule:** asbestos-suspected roof (pre-1990 fibre-cement) → force a hold. Over 10 m² → require a licensed removalist and a SafeWork notice at least 5 days ahead (treat as 5 working days to be safe).
- **Falls / WHS:** NSW variations UNVERIFIED (SafeWork blocked).

```json NSW
{
  "state": "NSW",
  "regulator": "Building Commission NSW (licensing, contracts, disputes; formerly part of NSW Fair Trading). HBC insurance regulated by SIRA, insurer icare HBCF.",
  "act": "Home Building Act 1989 (NSW); Home Building Regulation 2014 (NSW); Building and Construction Industry Security of Payment Act 1999 (NSW) - values verified on Building Commission NSW / icare pages; statute text itself not readable (legislation.nsw.gov.au Cloudflare 403)",
  "licence": {
    "threshold_aud": 5000,
    "threshold_rule": "licence required when work valued at MORE THAN $5,000 labour + materials, INCLUDING GST; applies to carrying out, advertising and contracting; also to subcontracts within an overall contract > $5,000",
    "incl_gst": true,
    "classes": ["Roof plumbing (trade work: metal roof coverings, guttering, downpipes, flashings, skylights, ventilators, non-structural coatings)", "Roof tiling (trade work: concrete/clay/metal tiles, bedding and pointing, valleys, sarking, battens)", "Roof slating (trade work: slates, shingles, shakes)", "General building work (covers all residential building work)"],
    "roofing_is_specialist_work": false,
    "show_on": ["contract", "ads"],
    "show_on_recommended": ["quote", "invoice"],
    "ad_requirements": "licensee name (or registered business name), licence number with correct category of work, business telephone number - all advertising (print, internet, TV, radio, other)",
    "penalty_unlicensed_aud": {"individual": 22000, "company": 110000},
    "source": "https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/roof-plumbing-work ; .../roof-tiling-work ; .../roof-slating-work ; .../categories-of-work ; .../general-building-work ; https://www.nsw.gov.au/business-and-economy/running-a-business/advertising-laws-and-your-business/building-trade-advertisements (checked 2026-11-06)"
  },
  "written_contract": {
    "threshold_aud": 5000,
    "incl_gst": true,
    "tiers": [
      {"name": "none required", "min_aud": 0, "max_aud": 5000},
      {"name": "small jobs contract", "over_aud": 5000, "up_to_aud": 20000, "must_include": ["date + signatures of each party", "parties' names incl licence-holder name as on licence", "contractor licence number", "description of work", "plans/specifications", "contract price if known", "quality of construction (work compliance) clause", "permitted design-liability limitation clause", "copy of Consumer Building Guide", "certifier information sheet + freedom to choose certifier (if certifier required)"]},
      {"name": "large jobs contract", "over_aud": 20000, "must_include": ["all small-job items", "contract price prominently on first page + warning if unknown/variable", "statutory warranties", "HBC cover cost", "variations clause (in writing, signed by both)", "progress payment schedule (stage-based and/or cost-incurred only)", "termination clause (general law statement)", "17-item owner checklist + caution", "note: owner entitled to signed copy within 5 business days", "note: HBC certificate obligation", "5 clear business day cooling-off statement", "owner acknowledgement of Consumer Building Guide + checklist", "Security of Payment Guide (HBR cl 8)"]}
    ],
    "signed_copy_to_owner": "within 5 business days of signing (excl weekends, NSW public holidays, 27-31 Dec)",
    "arbitration_clause": "void",
    "source": "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/guide-to-providing-home-building-contracts ; https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts (checked 2026-11-06)"
  },
  "deposit": {
    "rules": [
      {"max_contract_aud": null, "min_contract_aud": 0, "pct": 10, "cap_aud": null, "note": "flat 10% for both small and large contracts; any money received before commencement counts toward the cap"},
      {"max_contract_aud": null, "min_contract_aud": 20000, "pct": 10, "cap_aud": null, "note": "over $20,000 incl GST: no deposit at all until HBC certificate given"}
    ],
    "five_pct_tier_exists": false,
    "source": "guide-to-providing-home-building-contracts ('You cannot request a deposit of more than 10 percent. This applies to both small jobs contracts and contracts for large jobs.'); sample contract over $20,000 (July 2025) clause 4 owner note (checked 2026-11-06)"
  },
  "cooling_off": {
    "applies_over_aud": 20000,
    "length": "5",
    "unit": "business_days",
    "business_day_definition": "not Saturday, Sunday, public holiday or 27-31 December",
    "starts": "after the owner is given a copy of the signed contract; if no copy within 5 days of signing, after the owner becomes aware of being entitled to a copy",
    "exceptions": ["both parties licensed contractors for work their licences authorise", "licensed contractor and developer", "urgent work: hazard to health/safety or damage to property if not done promptly", "contract fully supplied/prepared by the owner's side", "shortened/waived by legal practitioner certificate under HBA s 7BA(5)"],
    "rescission_effect": "contractor keeps reasonable out-of-pocket expenses and a reasonable price for work done to the date of notice; refunds all other money; owner not otherwise liable",
    "notice_text": "Cooling off period for contracts with price over $20,000. Under the Home Building Act 1989 the owner may rescind the contract under the following provisions. The contract may be rescinded even if work has commenced under the contract. The notice of rescission must be given to the contractor: (a) where the owner has been given a copy of the signed contract – within 5 clear business days after being given a copy of the signed contract, or (b) where the owner has not been given a copy of the signed contract within 5 days after the contract was signed – within 5 clear business days after the owner becomes aware of being entitled to be given a copy of the signed contract. The notice of rescission must state that the owner rescinds the contract, and must be given to the contractor by leaving it at the address shown as the contractor's address, or by any method of service provided by [notices clause] of this contract.",
    "notice_text_source_note": "Building Commission NSW sample contract wording (July 2025); the law requires 'a clear statement' - no single prescribed form found",
    "missing_notice_remedy": "UNVERIFIED: reportedly owner may rescind by written notice within 7 days of becoming aware the contract should have contained the notice (search summary of HBA only)",
    "acl_unsolicited": {"applies_from_aud": 100, "length": 10, "unit": "business_days", "notice_text": "You have a right to cancel this agreement within 10 business days from and including the day after you signed or received this agreement. Details about your additional rights to cancel this agreement are set out in the information attached to this agreement.", "no_services_or_payment_during": true, "exception": "emergency repairs", "source": "https://www.accc.gov.au/business/advertising-promoting-your-business/door-to-door-telemarketing-sales"},
    "source": "https://www.nsw.gov.au/sites/default/files/noindex/2026-03/home-building-contract-over-20000-july-2025.pdf (pp 9-10); guide-to-providing-home-building-contracts; contracts page (checked 2026-11-06)"
  },
  "insurance": {
    "scheme": "Home Building Compensation Fund (HBCF) - icare; regulated by SIRA (formerly home warranty insurance)",
    "threshold_aud": 20000,
    "incl_gst": true,
    "who": "principal/head contractor contracting directly with homeowner, developer or owner-builder (not subcontractors)",
    "before": "before starting work AND before taking any payment including a deposit; give homeowner evidence (Certificate of Insurance, one per project) before work begins or money changes hands; builder needs active Certificate of Eligibility",
    "roofing_only_covered": "depends",
    "roofing_note": "roofing is residential building work so >$20k head contract needs cover unless exempt; HBR exemption list not readable",
    "source": "https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/insurance-cover ; https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/do-i-need-hbcf ; https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/apply-for-insurance (checked 2026-11-06)"
  },
  "documents": [
    {"name": "Consumer Building Guide (Building Commission NSW, Nov 2025 edition, unmodified)", "when": "before signing any contract > $5,000", "source": "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide"},
    {"name": "Written small jobs contract", "when": "> $5,000 to $20,000", "source": "guide-to-providing-home-building-contracts"},
    {"name": "Written large jobs contract incl 17-item checklist, cooling-off statement, warranties, progress payment schedule", "when": "> $20,000", "source": "guide-to-providing-home-building-contracts; /preparing/contracts/checklist"},
    {"name": "Security of Payment Guide (in contract)", "when": "contracts > $20,000 (HBR cl 8; fine $8,800 corp / $4,400 other)", "source": "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/changes-to-laws"},
    {"name": "HBC Certificate of Insurance", "when": "> $20,000 incl GST: before work starts and before any payment incl deposit", "source": "https://www.icare.nsw.gov.au/builders-and-homeowners/builders-and-distributors/do-i-need-hbcf"},
    {"name": "Signed copy of contract to owner", "when": "within 5 business days of signing", "source": "https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts"},
    {"name": "Registered certifier information sheet", "when": "if a certifier is required for the job", "source": "https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts"},
    {"name": "Written variation (description, plans, cost + calculation, time) signed by both", "when": "before variation work starts (after the fact only for urgent danger/damage)", "source": "https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts"},
    {"name": "Progress payment schedule (stage-based fixed payments and/or cost-incurred with invoices)", "when": "all contracts > $20,000", "source": "guide-to-providing-home-building-contracts"}
  ],
  "statutory_warranty": [
    {"type": "major defect (defect in a major element: load-bearing incl roofs, fire safety system, waterproofing)", "years": 6, "source": "https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts ; https://www.nsw.gov.au/departments-and-agencies/building-commission/about-us/building-defect-complaints"},
    {"type": "all other defects", "years": 2, "source": "same"},
    {"type": "extension if breach apparent in last 6 months of period", "years": 0.5, "source": "https://www.nsw.gov.au/departments-and-agencies/building-commission/about-us/building-defect-complaints"}
  ],
  "compliance_certificate": {
    "name": "None for roof plumbing. Notice of Work / Certificate of Compliance apply to plumbing and drainage work (water, sewer, sanitary drainage) under the Plumbing and Drainage Act 2011, not to HBA roof plumbing",
    "threshold_aud": null,
    "deadline": "",
    "applies_to_roofing": false,
    "caveat": "statutory exclusion in PDA s 4 not read (blocked); some councils may regulate stormwater drainage - prompt to check with council if below-ground stormwater/sanitary connection is in scope",
    "source": "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/plumbers-and-drainers/plumbing-inspection-documents ; https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/plumbing-draining-and-gasfitting ('Plumbing ... does not include draining work or roof plumbing') (checked 2026-11-06)"
  },
  "permit": {
    "summary": "UNVERIFIED: Codes SEPP 2008 reportedly makes repair/replacement of non-structural roof cladding exempt development on 1-2 storey dwellings, not heritage items/areas, non-combustible, BCA-compliant, no structural change. Verified: owner is responsible for checking approvals with council or a certifier.",
    "source": "Codes SEPP text blocked (legislation.nsw.gov.au); owner-responsibility statement from Consumer Building Guide https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/your-obligations-to-your-customers/how-to-use-consumer-building-guide/guide"
  },
  "security_of_payment": {
    "applies_to_owner_occupier": "yes",
    "owner_occupier_from": "2021-03-01",
    "owner_occupier_exclusion": "residential building work < $5,000 labour+materials; electrical, plumbing/draining/gasfitting, air-con work",
    "schedule_days": 10,
    "schedule_unit": "business_days (or earlier contract time)",
    "default_due_business_days": {"owner_occupier_to_builder": 10, "principal_to_head": 15, "head_to_sub_nonresidential": 20, "head_to_sub_residential": 10},
    "claim_must_state": "This is a payment claim made under the Building and Construction Industry Security of Payment Act 1999 (NSW)",
    "source": "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/security-of-payment/changes-to-laws ; .../about ; .../frequently-asked-questions ; .../responding-to-a-payment-claim (checked 2026-11-06)"
  },
  "other_prompts": [
    {"text": "Show licensee name (or registered business name), licence number with category, and business phone on every ad (web, social, print, vehicle, radio/TV); recommended on quotes too.", "source": "https://www.nsw.gov.au/business-and-economy/running-a-business/advertising-laws-and-your-business/building-trade-advertisements"},
    {"text": "Contracting entity must hold the licence: a director's personal licence does not cover their company.", "source": "https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/preparing/contracts"},
    {"text": "Roofing subcontractor inside an overall job > $5,000 needs its own roof plumbing/tiling/slating licence even if the subcontract is small.", "source": "https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade-licences-and-registrations/general-building-work"},
    {"text": "Urgent storm/leak repair > $20,000: cooling-off may not apply if delay risks health/safety or property damage; record the reason. Written variation may be done after urgent work.", "source": "home-building-contract-over-20000-july-2025.pdf; preparing/contracts"},
    {"text": "Door-knocking/phone sales >= $100: ACL unsolicited agreement rules - 10 business day cooling-off notice on front page, no services or payment during period except emergency repairs; visiting hours weekdays 9am-6pm, Sat 9am-5pm.", "source": "https://www.accc.gov.au/business/advertising-promoting-your-business/door-to-door-telemarketing-sales"},
    {"text": "UNVERIFIED (SafeWork NSW blocked): asbestos - non-friable <= 10 m2 may be removed without licence under the Code of Practice; > 10 m2 needs Class B licence and SafeWork NSW notice >= 5 days before. Force a hold on suspected AC roofs.", "source": "search summaries of safework.nsw.gov.au only"}
  ],
  "status_notes": "Checked 2026-11-06 on www.nsw.gov.au (Building Commission NSW pages, Consumer Building Guide Nov 2025 PDF, sample contracts July 2025 PDFs), www.icare.nsw.gov.au and www.accc.gov.au via curl through the session proxy (no header spoofing). Statute text (HBA, HBR, SOPA, PDA, Codes SEPP) NOT read: legislation.nsw.gov.au returns a Cloudflare 403 challenge (not bypassed). Unverified: HBR HBC exemption list; HBA remedy when cooling-off notice is missing (reportedly 7 days); PDA s 4 roof plumbing/stormwater exclusion (regulator pages consistent with it); Codes SEPP re-roof exemption; SafeWork NSW asbestos and falls rules (safework.nsw.gov.au blocked). Note: SOP 'responding' page has stale owner-occupier wording; followed the 'changes to laws' and FAQ pages."
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

**NSW (round 3, regulator-verified on nsw.gov.au / icare, 2026-11-06):** the round-1 numbers held up: $5k licence incl GST; $5k–$20k small jobs; > $20k full contract, HBC and 5-business-day cooling-off; 10% deposit; 6/2-year warranties; 10-business-day SOP schedule. Changes and additions:
- (a) roof plumbing, roof tiling and roof slating are **trade work, not specialist work**, so the $5k threshold applies (VERIFIED);
- (b) the deposit cap is **10% flat** for small and large contracts. There is **no 5% tier** (round-2 warning resolved), and any pre-commencement payment counts toward the cap;
- (c) **CORRECTED:** NoW/CoC do **not** apply to roof plumbing (it is a plumbing and drainage regime; "Plumbing … does not include … roof plumbing"). The round-1 NoW/CoC prompt for roofs is removed. The statutory text of PDA s 4 is still unread;
- (d) SOP: owner-occupier contracts covered from 1 Mar 2021 (except residential work < $5k). Residential subcontract default is 10 business days, not 20;
- (e) new required items: the **Security of Payment Guide** in contracts > $20k (HBR cl 8), the 17-item checklist, the certifier information sheet, and a signed copy to the owner within 5 business days;
- (f) cooling-off exceptions, including **urgent hazard/damage work**, and the government sample-contract notice wording captured;
- (g) ACL unsolicited-sales notice wording captured from the ACCC;
- (h) still UNVERIFIED: HBC exemption list, 7-day missing-notice rescission, Codes SEPP re-roof exemption, SafeWork asbestos/falls.
