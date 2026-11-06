# Insurance-Restoration (Storm Damage) Workflow for US Residential Roofing Contractors

> Method note: Research was done via web search only. WebFetch was blocked for several primary hosts in this session (tdi.texas.gov, servicing-guide.fanniemae.com, verisk.com, eagleview.com did not resolve), so many findings rest on search-result snippets of those pages, not full-page reads. Much of the open web on this topic is vendor/contractor marketing; I flag source quality where it matters. Researched Nov 2026.

## Step sequence: inspection -> claim -> contingency -> adjuster meeting -> scope of loss -> Xactimate estimates -> contractor scope -> scope comparison

### Takeaway
The standard sequence is: storm event and lead -> contractor roof inspection with photos/measurements -> homeowner files claim (contractor may advise but in TX/FL may not negotiate or "adjust") -> contractor-homeowner agreement (contingency/insurance-work agreement; heavily regulated in CO, TX, FL) -> carrier adjuster inspection (contractor often attends) -> carrier issues scope of loss/estimate, usually in Xactimate -> contractor builds its own Xactimate (or Symbility) estimate from aerial measurements (often an EagleView ESX file) -> line-by-line comparison -> supplement for gaps. The process is document-heavy and the Xactimate estimate is the "lingua franca" between contractor and carrier.

### Cited Findings
- Contractor-facing guides describe the 2026 claim process as including a contractor inspection, the adjuster meeting, the carrier estimate, and supplementing; claims with supplements, code disputes, or a re-inspection "often run four to eight weeks or longer." — [SubcontractorHub](https://www.subcontractorhub.com/blog/roofing-insurance-claim-process); [Pipelineon](https://pipelineon.com/blog/roofing-insurance-claims-process/)
- EagleView lets users download an ESX file directly from a roof order; the ESX is built for import into Xactimate and carries measurements, sketch, photos, line items and pricing. ESX downloads require an EagleView One subscription, and insurance providers need the file type enabled on their accounts. (EagleView blog dated April 14, 2026, read via search snippet.) — [EagleView](https://www.eagleview.com/blog/streamline-estimates-in-xactimate-with-eagleview-reports-and-esx-files/)
- Florida (FL): Contractors may tell the homeowner to check coverage; current §489.147 text includes a notice that the residential owner "should contact your insurance company to verify coverage for the proposed roofing work, including any claims, deductibles, and policy terms, before signing." Contractors may not use "prohibited advertisements" that encourage/induce a consumer to contact a contractor or public adjuster for the purpose of making a roof insurance claim. — [Fla. Stat. 489.147 (flsenate.gov, 2026)](https://www.flsenate.gov/Laws/Statutes/2026/489.147); [Florida Roofing & Sheet Metal Contractors Assn on SB 76](https://www.floridaroof.com/news/blog/SB76-Misinformation-August2021)
- Colorado (CO): Residential roofing contracts must state the cancellation/refund policy with a 72-hour right of rescission, and may be rescinded within 72 hours after the owner receives written notice that the insurance claim was denied; contractor must refund within 10 days of a proper rescission (C.R.S. 6-22-101 to 6-22-105, SB 12-038). — [C.R.S. 6-22-105 (Justia 2022)](https://law.justia.com/codes/colorado/2022/title-6/article-22/section-6-22-105/); [Colorado Roofing Association](https://coloradoroofing.org/news/waiving-insurance-deductibles-is-illegal-in-colorado)
- Texas (TX): Contracts of $1,000+ involving insurance settlements must carry a statutory notice (12-point bold) that Texas law requires the insured to pay any applicable deductible (Bus. & Com. Code §27.02). — [TDI "Roofing and insurance: Know the law"](https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html)
- O&P: "10 and 10" (10% overhead + 10% profit) is the common convention; the "three-trade rule" for when O&P is owed is industry custom, not law — it does not appear in any insurance code or NAIC model act. Whether Xactimate defaults to 10/10 is disputed across sources; one citing Xactware instructions says the estimator enters the percentages. Stacking 10% overhead then 10% profit yields ~21% markup. — [ClaimSpark](https://claimspark.com/blog/overhead-and-profit-roofing-insurance); [ClaimStack](https://getclaimstack.com/blog/overhead-and-profit-roofing); [CapOut glossary](https://capout.ai/resources/glossary/overhead-and-profit); [Build-Folio 10 and 10](https://build-folio.com/contractor-guides/10-and-10-contractor-rule/)

### Inferences
- A claims-aware SaaS should model the claim as a sub-object of the job with its own state machine (Inspected -> Claim filed -> Adjuster scheduled -> Adjuster met -> Carrier scope received -> Contractor scope built -> Supplement(s) -> Approved -> Built -> Final invoice/COC -> Depreciation released -> Closed), plus carrier, claim number, adjuster contact, policy type (RCV/ACV/roof schedule) and date-of-loss fields.
- Contract templates must be state-aware (CO rescission language, TX §27.02 notice, FL §489.147 notice).
- Since the ESX file and the carrier's Xactimate estimate are both structured, line-item diffing (carrier scope vs. contractor scope) is a natural product feature.

### Gaps
- Could not read primary Xactimate/Verisk docs (host blocked): price list cadence (commonly said to be monthly, regional), and Symbility specifics were not verified.
- No reliable source found describing a standard "contingency agreement" form or typical contingency terms beyond state statutes.
- No sourced data on adjuster-meeting scheduling lead times or share of claims where contractor attends.

## Supplements: definition, common items, process, documentation, turnaround, success rates, outsourced fees

### Takeaway
A supplement is a request to add items omitted, underpaid, or discovered after work begins to the carrier's scope. Commonly supplemented roof items include drip edge, starter, ridge, ice & water shield, flashing, decking/deck rot, code upgrades, and O&P. Turnaround is usually cited as 1-6 weeks (longer with reinspection); outsourced supplement firms usually charge ~10-20% of recovered funds or a flat per-claim fee. Hard independent success-rate data does not exist publicly.

### Cited Findings
- Definition: "a charge or charges that need to be added to a claim for items omitted, overlooked, under paid or discovered after work begins." — [The Roof Crafters (LA contractor)](https://theroofcrafters.com/insurance-mortgage-check-endorsement/)
- Commonly missed/supplemented: drip edge, starter, ridge, flashing, and O&P; adjusters often apply flat waste percentages that ignore complex geometry, starter shingles and valley flashing. — [Roof Sales Mastery](https://roofsalesmastery.com/?p=376172); [ARH Foundation supplements guide](https://www.arhfoundation.org/roofing-supplements-guide)
- Supplements also cover code upgrades and hidden damage (deck rot, ice & water shield, drip edge). — [HailMate](https://hailmate.ai/blog/complete-guide-to-roofing-supplements); [IA Solutions](https://www.iasolutions.claims/blog/what-is-a-roofing-supplement)
- Documentation: dated, geotagged photos of every damaged area before and after tear-off; measurements; local code requirements; documentation quality is cited as the biggest driver of delay. A supplement differs from a reinspection request (asking the adjuster to come back). — [OneScope](https://www.onescopellc.com/blog/the-roofing-insurance-supplement-process-explained-for-professional-contractors); [ClaimSpark](https://claimspark.com/blog/what-is-a-roofing-supplement); [ProLine](https://useproline.com/average-processing-time-for-roofing-insurance-supplement-approvals/)
- Turnaround (vendor sources, conflicting): 1-6 weeks depending on complexity/documentation/follow-up; "most supplements receive a response within 2-4 weeks"; adjuster typically responds in 5-14 days; ~2-3 weeks when submitted in Xactimate format vs ~6-8 weeks as PDF. — [ProLine](https://useproline.com/average-processing-time-for-roofing-insurance-supplement-approvals/); [The Estimate Company](https://theestimatecompany.com/services/roofing-supplements/); [OneScope](https://www.onescopellc.com/blog/the-roofing-insurance-supplement-process-explained-for-professional-contractors)
- Success rate: only figure found is a vendor claim of "89% approval rate for well-documented supplements" — not independently verified. — [search results incl. American Roof Supplements](https://americanroofsupplements.com/)
- Outsourced fees: percentage model (~10-20% of recovered funds) most common; flat ~$150-$300/claim; blended (base + % above threshold). Vendor blog estimates, not survey data. — [RoofPredict blog](https://roofpredict-v2.pages.dev/blog/unlock-savings-roofing-supplement-company-vs-in-house)
- Industry debate on in-house vs outsourced supplementing ("keep the margin, keep the control"). — [RoofersCoffeeShop podcast](https://rooferscoffeeshop.com/podcast/keep-the-margin-keep-the-control--how-in-house-supplementing-pays-off)
- Supplements can trigger another check that again names the mortgage company, repeating the endorsement loop. — [search snippet on supplement/mortgage payment path](https://theroofcrafters.com/insurance-mortgage-check-endorsement/)

### Inferences
- Product should support multiple supplement rounds per claim, each with line items, supporting evidence (photos tagged to line items, code citations, invoices), submission date, carrier response, approved amount, and follow-up reminders (5/10/14-day cadence).
- Exporting supplements in Xactimate-compatible format matters (faster approval per vendor claims).
- If a SaaS offers or integrates outsourced supplementing, pricing as % of approved supplement is the market norm to compare against.

### Gaps
- No independent data on supplement success rates or average dollar uplift.
- Fee ranges reported by others (some cite 25-35%) were not found in this research; only 10-20% from one vendor blog.

## Money: RCV vs ACV, recoverable depreciation, deductible, check sequence, mortgage endorsement & loss-draft, final invoice/COC

### Takeaway
On an RCV policy the carrier first pays ACV (RCV minus depreciation minus deductible); recoverable depreciation is held back and released after the contractor submits a final invoice/certificate of completion. Roof ACV endorsements or roof payment schedules can make depreciation non-recoverable. Checks are typically co-payable to the homeowner and mortgagee; the lender's loss-draft department endorses and often disburses in stages after inspections, adding weeks.

### Cited Findings
- Depreciation release requires completion paperwork: certificate of completion, final invoice matching the approved scope, often photos. If actual cost is below estimate, recoverable depreciation is capped at actual spend minus ACV already paid. — [The Roofing Brief](https://theroofingbrief.com/recoverable-depreciation-roof/); [Thomas Roofing](https://thomasroofingandrepair.com/articles/recoverable-depreciation-roof/)
- Deadlines vary: typically 180 days to 2 years depending on policy/state. Under ISO HO 00 03 the 180 days is a notice-of-intent window for replacement cost, not a completion deadline. Missing it can forfeit holdback; request extensions in writing beforehand. — [The Roofing Brief](https://theroofingbrief.com/recoverable-depreciation-roof/); [Insurance Claim HQ](https://insuranceclaimhq.com/roof-insurance-claim/)
- Roof ACV endorsements / roof surface payment schedules generally make roof depreciation non-recoverable. — [Bill Layne Insurance](https://www.billlayneinsurance.com/blog/blogs/acv-roof-claims); [The Roofing Brief](https://theroofingbrief.com/recoverable-depreciation-roof/)
- Second (depreciation) check released after installation and the contractor's Certificate of Completion is sent to the carrier; failure to pay deductible can lead carrier not to release the second check (contractor claim). — [The Roof Crafters](https://theroofcrafters.com/insurance-mortgage-check-endorsement/); [Buffalo Roofing FAQ](https://www.buffaloroofing.com/insurance-faqs-old)
- Mortgage/loss draft: lenders require the check be endorsed and sent to their loss-draft unit; common staged pattern ~1/3 up front, 1/3 at 50% completion, final 1/3 after completion inspection. — [Gateway First loss draft FAQ](https://www.gatewayfirst.com/support/account-help/loss-draft-and-insurance-claims-faq.md); [AmeriSave 2025 guide](https://www.amerisave.com/learn/your-insurance-claim-check-made-out-to-your-mortgage-lender-here-s-your-step-by-step-guide)
- Fannie Mae Servicing Guide B-5-01 (current, per snippet): for current borrowers servicer may release an initial disbursement up to the greater of $40,000 or 33% of proceeds; receipts not needed when proceeds are $40,000 or less; delinquent (31+ days) borrowers get a smaller initial release (25% capped). A 2020 announcement (SVC-2020-03) eliminated the requirement in certain circumstances that proceeds be payable to both borrower and contractor. Verify on live guide (host blocked). — [Fannie Mae B-5-01](https://servicing-guide.fanniemae.com/svc/b-5-01/insured-loss-events); [WBK on SVC-2020-03](https://thewbkfirm.com/industry/fannie-mae-issues-servicing-guide-announcement-svc-2020-03)
- TX timelines: insurer has 5 business days to mail payment after accepting claim; lender must endorse within ~10 days of the endorsement request/requirements being met. — [AmeriSave](https://www.amerisave.com/learn/your-insurance-claim-check-made-out-to-your-mortgage-lender-here-s-your-step-by-step-guide); [ABC13 Houston](https://abc13.com/archive/6547383)
- Lender paperwork usually includes contractor documents and scope of work before later releases; final funds ~2-3 business days after inspection report (Virginia Housing). — [Virginia Housing](https://s-www.virginiahousing.com/-/media/docs/homeowners/new-homeowner-resources/hazard-claims-whats-next.pdf); [Georgia DCA claims procedures](https://dca.georgia.gov/document/document/insuranceclaimsproceduresdocumentwebsite-09-29-2022pdf); [TDECU packet](https://cdn2.tdecu.org/images/Storm-Center/Insurance-Loss-Claim-Process-Member-Packet.pdf)
- Common delays: incorrect endorsement, incomplete contractor paperwork (W-9, contract, lien waivers, license/insurance), slow inspection scheduling; mailing back and forth adds ~10-15 days (homeowner forum estimate). — [UpHelp](https://uphelp.org/ask-an-expert/question/mortgage-company-holding-insurance-check/); [BiggerPockets](https://www.biggerpockets.com/forums/52/topics/1123545-insurance-payment-for-roofing-replacement)

### Inferences
- Financial model per claim: RCV, depreciation (recoverable vs non-recoverable), deductible, ACV paid, supplements approved, depreciation released, mortgagee on check (Y/N, lender name, loss-draft contact, required docs, inspection status), homeowner-collected deductible. Expected-vs-received reconciliation by check is the core cash-flow view.
- Deadline tracking from date of loss/ACV payment (notice and completion windows) is a high-value automated reminder.
- A "loss-draft packet" generator (W-9, signed contract, COC, final invoice, lien waiver, license/COI) would address the most-cited delay cause.

### Gaps
- No data on average days for loss-draft release by major servicer (Mr. Cooper, Rocket, Wells Fargo etc.).
- Freddie Mac and FHA rules not verified.

## State regulations: deductible waivers, public adjuster rules, AOB, contractor-as-PA

### Takeaway
TX, CO and FL criminalize or prohibit contractor waiver/rebate of deductibles; TX and FL bar contractors from adjusting/negotiating claims without a PA license (TX strictly bars a contractor from acting as PA on jobs it does); FL voided post-loss AOBs for policies issued on/after Jan 1, 2023. PA fees are capped (e.g., 10% in TX; FL 10% for catastrophe-period claims).

### Cited Findings
- TX: Illegal for a contractor to offer to waive, rebate, or absorb a deductible (Ins. Code ch. 707, HB 2102, eff. Sept 1, 2019; Class B misdemeanor per law-firm summary) plus Bus. & Com. Code §27.02 notice requirement. — [TDI](https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html); [Raizner Law](https://www.raiznerlaw.com/insights/deceptive-contractors-waiving-deductibles/); [HB 2102 analysis](https://www.lrl.texas.gov/scanned/TLCBillAnalyses/86-0/HB2102RPT.PDF)
- TX: SB 1268 (88R, 2023) targeted a loophole letting insurers waive deductibles if the insured uses the carrier's preferred contractor; passage not confirmed. — [SB 1268 bill analysis](https://capitol.texas.gov/tlodocs/88R/analysis/html/SB01268I.htm)
- TX: A roofer/contractor may not act as a public adjuster on claims where it also does the work, nor advertise to do so (Ins. Code §4102.163); contractors aren't exempt from PA licensing; Texas courts upheld this. PA total compensation capped at 10% of claim (TDI 2014 FAQ). — [TDI](https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html); [TDI unlicensed adjusting FAQ](https://agate.tdi.texas.gov/bulletins/2014/documents/unlicensedfaq.pdf); [RoofersCoffeeShop/WSRCA](https://rooferscoffeeshop.com/post/wsrca-roof-talk-texas-courts-will-nail-roofers-repairing-damage-acting-public-adjusters); [JD Supra](https://jdsupra.com/legalnews/roofing-contractors-dont-mess-with-tex-66597)
- CO: Contractors may not pay, waive or rebate a deductible, or advertise/promise to; insurer need not consider that contractor's estimate; also a Class 2 misdemeanor under insurance fraud law; plus 72-hour rescission rights (C.R.S. 6-22-101 to -105). — [Colorado Roofing Association](https://coloradoroofing.org/news/waiving-insurance-deductibles-is-illegal-in-colorado); [C.R.S. 6-22-105](https://colorado.public.law/statutes/crs_6-22-105); [Property Insurance Coverage Law](https://www.propertyinsurancecoveragelaw.com/blog/who-pays-the-deductible-requirements-of-roofing-contracts-in-colorado/)
- FL: Contractor waiving/rebating a deductible with intent to defraud is insurance fraud, a third-degree felony; offering anything of value (incl. deductible waiver) for inspection or claim is prohibited; unlicensed persons may not adjust claims; fines up to $10,000 per violation (§489.147, amended 2022, 2024, 2025). — [Fla. Stat. 489.147](https://www.flsenate.gov/Laws/Statutes/2026/489.147); [Taylor English](https://insights.taylorenglish.com/post/102hrx0/what-roofing-contractors-and-public-adjusters-should-know-about-florida-sb-76)
- FL AOB: Under F.S. §627.7152(13), post-loss benefits under residential/commercial property policies issued on or after Jan 1, 2023 cannot be assigned; any such assignment is void (SB 2-A, signed Dec 2022). Renewals count, so most policies are now covered. FL CFO warned of vendors trying to require direct payment as a workaround. — [Jimerson Birr](https://www.jimersonfirm.com/blog/2023/10/policyholders-are-no-longer-permitted-to-assign-their-insurance-benefits-in-florida/amp/); [Kin](https://www.kin.com/blog/florida-assignment-of-benefits-law/); [AdvantaClean FL](https://www.advantaclean.com/ft-lauderdale-fl/about-us/blog/clarifying-we-bill-your-insurance-claims-in-floridas-restoration-industry-what-homeowners-actually-owe-after-sb-76-2021-and-sb-2-a-2022/); [Roofing Contractor](https://www.roofingcontractor.com/articles/97099-new-florida-insurance-laws-impact-on-the-roofing-industry)
- FL PA fees: 10% cap on catastrophic-loss claims (per law-firm chronology; verify §626.854). — [Property Insurance Coverage Law](https://www.propertyinsurancecoveragelaw.com/blog/a-chronology-of-public-adjuster-regulations-regarding-what-florida-public-adjusters-can-charge/)

### Inferences
- Compliance features: block/flag any "deductible discount" pricing in TX/CO/FL; state-specific contract clauses; ensure communication templates don't cross into "negotiating" the claim in TX/FL (position contractor communication as providing documentation/estimate, homeowner or licensed PA as negotiator).
- FL: no AOB means payment collection relies on homeowner and direct-to-contractor checks are not guaranteed; homeowner-signed authorizations and progress billing matter more.

### Gaps
- FL claim-filing deadline changes (reported reduction for new claims) not verified in this research.
- Other hail-belt states (OK, MN, NE, KS, IL etc.) deductible/contractor statutes not covered.

## Tools: Xactimate, Symbility, EagleView/ESX, AccuLynx/JobNimbus/Leap, supplement tools

### Takeaway
Xactimate (Verisk/Xactware) dominates carrier estimating, with XactAnalysis used to route assignments/estimates; EagleView ESX files feed measurements directly into Xactimate. AccuLynx and JobNimbus both integrate with EagleView, and JobNimbus has an Xactimate/XactAnalysis integration; supplement-specific workflow inside CRMs is thinly documented publicly.

### Cited Findings
- EagleView ESX for Xactimate import (EagleView One subscription required). — [EagleView](https://www.eagleview.com/blog/streamline-estimates-in-xactimate-with-eagleview-reports-and-esx-files/)
- AccuLynx: order EagleView reports in-app; measurements saved to job and auto-populate estimates. A comparison site claims a $10 ESX export per report (unverified, possible affiliate bias). — [AccuLynx EagleView integration](https://acculynx.com/integrations/eagleview); [ContractorToolStack](https://contractortoolstack.com/alternatives/acculynx-alternatives/)
- JobNimbus: Xactimate integration imports claim estimates via XactAnalysis; works only with JobNimbus legacy financials; EagleView ordering in-app. JobNimbus and Xactware announced a restoration project management workflow integration. — [JobNimbus help: Xactimate](https://support.jobnimbus.com/how-do-i-enable-the-jobnimbus-integration-with-xactimate); [JobNimbus help: EagleView](https://support.jobnimbus.com/how-do-i-enable-the-jobnimbus-integration-with-eagleview); [Verisk newsroom](https://www.verisk.com/company/newsroom/jobnimbus-and-xactware-announce-new-restoration-project-management-workflow-integration/)
- New AI supplement/claim tools are proliferating (e.g., HailMate, ClaimSpark, ClaimStack, CapOut), mostly positioned around line-item gap detection and O&P arguments. — [HailMate](https://hailmate.ai/blog/complete-guide-to-roofing-supplements); [ClaimStack](https://getclaimstack.com/blog/overhead-and-profit-roofing); [CapOut](https://capout.ai/resources/tools/overhead-profit-calculator)

### Inferences
- Integration priority for a new SaaS: ESX/Xactimate import (parse carrier estimate), EagleView/aerial measurements, and export to Xactimate format for supplements.

### Gaps
- Symbility (CoreLogic/Cotality) contractor workflow and Leap's insurance features not researched due to call limits/blocked hosts.
- AccuLynx/JobNimbus native supplement tracking features not documented in found sources.

## Pain points

### Takeaway
Most cited pain is cash-flow delay from the multi-check, mortgagee-endorsed, paperwork-gated payment path, plus supplement follow-up, documentation burden and homeowner confusion about ACV/RCV/deductible.

### Cited Findings
- Delays mostly from paperwork friction (wrong endorsement, incomplete contractor docs, late loss-draft contact, inspection scheduling), not denials. — [UpHelp](https://uphelp.org/ask-an-expert/question/mortgage-company-holding-insurance-check/); [Hurricane Ida mortgage struggles (The Advocate via InsuranceNewsNet)](https://insurancenewsnet.com/oarticle/they-got-their-insurance-money-after-hurricane-ida-now-theyre-wrestling-their-mortgage-company-the-advocate-baton-rouge-la)
- Supplement checks re-trigger mortgage processing. — [The Roof Crafters](https://theroofcrafters.com/insurance-mortgage-check-endorsement/)
- Documentation is the biggest driver of supplement delay; follow-up consistency affects turnaround. — [ProLine](https://useproline.com/average-processing-time-for-roofing-insurance-supplement-approvals/)
- Homeowner confusion about deductibles: contractors' FAQs warn unpaid deductible blocks the second check; laws require explicit deductible disclosure (TX). — [Buffalo Roofing FAQ](https://www.buffaloroofing.com/insurance-faqs-old); [TDI](https://www.tdi.texas.gov/consumer/storms/roofing-and-insurance-know-the-law.html)
- Post-catastrophe backlogs of several months reported. — [search result: RoofClaim FAQ](https://roofclaim.com/frequently-asked-questions/page/3)

### Inferences
- Highest-value features: a multi-job claims board showing stalled stage/days-in-stage, automated adjuster/loss-draft follow-ups, document checklists per carrier/lender, line-item reconciliation of insurance scope vs. actual material orders and labor, and a homeowner portal explaining ACV/RCV/deductible/next check.

### Gaps
- Could not retrieve actual Reddit r/Roofing or r/Insurance threads (search returned none); no quantitative survey of contractor pain points or days-sales-outstanding on insurance jobs found.
