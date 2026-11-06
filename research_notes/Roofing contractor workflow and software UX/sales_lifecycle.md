# Roofing Sales Lifecycle (Lead to Signed Contract), US 2025-2026

Research notes. Method: about 16 web searches and fetches, run 2026-11-06. **Source-quality warning:** the network sandbox blocked direct fetches of roofr.com, jobnimbus.com, eagleview.com, roofingcontractor.com and jlconline.com, so most findings below come from search-result summaries, not full-page reads. Many results are vendor blogs or low-authority SEO sites (`*.pages.dev`, estatepass.ai, coohom.com). Treat their numbers as directional. Statute text (NY, TN, OH, CA) is the most reliable material here.

## 1. Lead generation channels, lead tracking, speed-to-lead, lead cost, close rates

### Takeaway
Leads come from paid digital channels, lead marketplaces (Angi/HomeAdvisor), referrals, and storm-driven canvassing. Economics are judged by cost per booked job (CPL / close rate), not cost per lead. Speed to lead is the most-cited lever. Average roofer response is reportedly hours, while top performers respond in under 15 minutes. Storm work runs on hail maps, then territories, then GPS-tracked door knocking, then handoff to a production CRM.

### Cited Findings
- LocaliQ's analysis of 3,211 home-service Google Ads campaigns (Apr 2024 to Mar 2025) found an average roofing cost per lead of **$228.15**, the highest of the home-service categories. Cited via [99calls blog 2026](https://blog.99calls.com/2026/02/02/roofing-lead-generation-costs-in-2026/) and [ActiveProspect](https://activeprospect.com/blog/roofing-leads-cost/). I did not read the primary LocaliQ report.
- Shared leads (sold to several contractors) are cheaper per lead but close worse. One vendor claims shared leads close at 5-15%, and exclusive leads with structured speed-to-lead follow-up close at 35-40%. These are vendor figures and inconsistent with each other. [99calls](https://blog.99calls.com/2025/02/20/the-cost-of-roofing-leads/); [Angi/HomeAdvisor cost per booked job press release, 2026](https://www.wboc.com/online_features/press_releases/angi-and-homeadvisor-leads-for-roofers-their-real-cost-per-booked-job-2026/article_8a1352fb-2e25-598e-934c-6f7b3f710a79.html)
- Cost per booked job = CPL / close rate. Examples: a $50 lead at 10% close costs $500 per job, and an exclusive $200 lead at 35% close costs about $571. ActiveProspect argues that a $250 lead at 25% close beats a $90 lead at 5%. [ActiveProspect](https://activeprospect.com/blog/roofing-leads-cost/)
- Roofr lists speed to lead and close rate as the two metrics that "move revenue the fastest". [Roofr blog: 7 roofing sales metrics 2026](https://roofr.com/blog/roofing-sales-metrics-to-track). This is a search snippet; the full page was not readable.
- JobNimbus models 50 leads a month at a 20% close rate and claims that cutting response time from 24 hours to 5 minutes could double close rate. This is a modeled claim, not measured data. [JobNimbus speed to lead](https://jobnimbus.com/blog/speed-to-lead-the-simplest-way-to-win-more-roofing-jobs-without-more-leads)
- A vendor blog cites a "2025 study of 2,847 leads across 38 home services businesses". It reports an average roofer response time of **8.7 hours**, and says the top 10% respond in under 15 minutes and close at 38-49%, against an average of 10-16%. The methodology is unverified. [SalesCaptain blog](https://blog.salescaptain.com/?p=1731)
- Homeowners shop multiple bids. Roofing Contractor's 2026 homeowner survey reports that 66% would gather three quotes. Its 2024 survey found that 1-3 weeks typically pass between quote and job start. [Roofing Contractor 2026 homeowners survey](https://www.roofingcontractor.com/articles/101774-homeowners-survey-the-roofing-customers-journey-in-2026); [2024 survey](https://www.roofingcontractor.com/articles/99486-2024-homeowner-roofing-survey). Both are search snippets only.
- Another blog says quote requesters are typically in contact with 3-5 contractors at the same time. [SchedulingKit](https://schedulingkit.com/hub/industry-guides/how-roofers-win-more-estimates) (low authority)
- **Storm and canvassing tools:**
  - SPOTIO markets storm-area mapping, GPS-verified territory assignment and real-time canvass tracking, with integrations to HailTrace, AccuLynx, HubSpot, Salesforce and Pipedrive. Its workflow: a manager draws a Territory around the storm swath in the web app and assigns it, and reps see it on their phones. Canvassing leads, damage photos and homeowner data are pushed into AccuLynx. [SPOTIO storm restoration CRM](https://spotio.com/solutions/storm-restoration-crm/); [SPOTIO roofing storm CRM](https://spotio.com/solutions/roofing-storm-restoration-sales-crm/)
  - SPOTIO claims that responding in the first 48 hours after a storm drives 73% of annual revenue for restoration contractors. This is a vendor claim and unverified. [SPOTIO](https://spotio.com/solutions/storm-restoration-crm/)
  - SalesRabbit started as a canvassing app. It has storm map overlays in the app and offers address-specific Verisk insurance/weather reports via its API. Its RoofLink add-on is a roofing CRM with territory drawing, rep assignment and weather tracking. [SalesRabbit field sales platform](https://salesrabbit.com/field-sales-platform); [SalesRabbit RoofLink](https://salesrabbit.com/rooflink)
  - A SalesRabbit case study says Moss Roofing cut weather-report lookup time to under a minute. Another says Escalade Roofing has a 90% referral close rate (self-reported). [Moss case study](https://www.casestudies.com/company/salesrabbit/case-study/moss-roofing-cuts-weather-report-lookup-time-to-under-a-minute-with-salesrabbit); [Escalade case study](https://www.casestudies.com/company/salesrabbit/case-study/escalade-roofing-boosts-sales-with-salesrabbit-using-a-90-referral-close-rate)
  - Raplor Restoration reports saving "hours each night" on territory management with SalesRabbit. This suggests that nightly manual territory and lead reconciliation is a real pain point. [Raplor case study](https://www.casestudies.com/company/salesrabbit/case-study/raplor-restoration-saves-hours-each-night-with-salesrabbit)
- Canvass appointment economics: one job posting pays $100 per qualified appointment that results in a completed inspection, plus a bonus if the job signs and gets carrier approval. This shows the setter/closer split and the carrier-approval milestone. [CareerBuilder posting](https://www.careerbuilder.com/job-details/roof-inspector-outside-sales-uncapped-commissions-tucson-az--cf1d4961-1264-4144-a2bd-77eb0f76055c)

### Inferences
- The CRM needs a lead-source field and a cost-per-lead input. With those it can report cost per booked job by channel, which is the metric owners actually reason about.
- Speed to lead implies instant lead intake (web form, Angi/HomeAdvisor webhook, call tracking), auto text/notification to the rep, and a visible "time since lead" timer.
- Storm and canvassing companies split roles: setter/canvasser, then inspector/closer, then production. Leads must carry attribution (who knocked) for commission. A map/territory view is table stakes for storm-restoration buyers, and companies often run a separate canvassing app (SPOTIO/SalesRabbit) that pushes into the CRM, so import and integration matters.

### Gaps
- No primary data was read on Angi/HomeAdvisor per-lead prices for roofing in 2025-2026; the press-release page was not fetched.
- I found no first-party documentation on HailTrace or Interactive Hail Maps features, pricing or report contents.
- No independent data on Knockbase.
- No independent study of close rates by channel (referral vs. paid vs. canvass). Referral close rates are widely asserted to be highest, but the only figure found is a vendor case study.

## 2. The inspection appointment (roof and kitchen table)

### Takeaway
A typical sequence: confirm the arrival window, inspect the exterior and roof, take many photos (about 50 per dwelling, damaged and undamaged areas), and chalk-circle hail hits. On storm jobs, mark a 10x10 ft test square per slope and count hits. Then present findings to the homeowner. Insurers set replacement thresholds that vary by carrier, commonly cited as about 8 or more hits per test square.

### Cited Findings
- Example contractor flow: the homeowner books by phone or online, the field rep calls with an ETA, then on site inspects for hail damage, takes photos and documents the damage. [Precision Exteriors booking page](https://hildsrwxrdnxnikufb.10to8.com)
- One contractor's practice: about 50 photos per dwelling, covering sites of damage and sites of no damage, plus a 10'x10' test square from each direction with damage marked inside the square. [Frogtown Roofing](https://frogtownroofing.com/?p=789)
- One sales guide advises circling hail hits with chalk for photos and recording video narration, treating the inspection as a sales opportunity and not just an assessment. [BuildFolio roofing sales techniques](https://build-folio.com/contractor-guides/roofing-sales-techniques/) (low authority)
- Test-square thresholds: "most Michigan carriers approve full replacement at 8+ strikes per 100 sq ft" ([Disaster911 Michigan checklist](https://disaster911.net/blog/hail-damage-roof-claim-adjuster-checklist-michigan/)). A North Georgia contractor cites 8-14 impacts per 100 sq ft ([Fowler Exteriors](https://development.solutionbuilt.com/fowlerexteriors/?p=2111)). The threshold depends on insurer and policy.
- A Claims Journal article (May 2026) argues that test squares are high-variance: zero hits in one square does not prove the roof is undamaged, so inspectors should "inspect as much roof as feasible". [Claims Journal 2026-05-06](https://amp.claimsjournal.com/news/national/2026/05/06/337211.htm)
- InterNACHI's hail-damage inspection training series covers what hail damage looks like on roofing materials. [NACHI hail damage part 12](https://www.nachi.org/hail-damage-part12-39.htm)
- Job postings describe the rep role as "document findings with photos, notes, and inspection reports". [CareerBuilder posting, Norcross GA](https://www.careerbuilder.com/job-details/roofing-sales-roof-inspection-specialist-norcross-ga--3197fdd2-e70e-4029-92c1-a04863481309)

### Inferences
- Field UX should support rapid bulk photo capture tagged by slope or elevation (N/S/E/W, plus detail categories such as shingles, vents, gutters, soft metals, collateral), test-square counts per slope, and annotation (circles/arrows like chalk). Photos should work offline and upload later.
- Safety and ergonomics constraints were not found in sources (see Gaps) but are strongly implied by the work: on a pitched roof the rep has one hand free at most and may wear gloves, the screen is in bright sun, and connectivity is poor. This argues for large tap targets, high-contrast mode, voice notes, minimal typing, and capture-now/organize-later.
- Two audiences consume the same photos: the homeowner at the kitchen table (presentation) and the insurance adjuster (evidence). A shareable photo report is a key artifact.

### Gaps
- I found no sourced material on steep-roof safety practice for reps (harness use, steep-pitch thresholds where reps use a drone or ladder-only photos), glove/phone use, or sun glare.
- I found no sourced description of the kitchen-table presentation script or its average duration. Industry lore puts a full inspection plus presentation at about 1-2 hours, but this is unverified.
- No data on what share of companies use drones for inspection.

## 3. Measurement (aerial reports, apps, drones)

### Takeaway
Contractors order aerial or photo-based reports (EagleView, Hover, GAF QuickMeasure, Roofr, RoofSnap, Nearmap) or self-measure from satellite imagery. Prices and turnaround vary by source:

| Tool | Reported price per report | Reported turnaround |
|---|---|---|
| GAF QuickMeasure | about $15-60 | under 1 hour (fastest) |
| Hover | about $25-75 | about 24 h (12 h for subscribers); photo-based from the rep's phone |
| EagleView | about $15-90 | 24-72 h, though one source says 1-4 h |

Reports contain total area, facet count, predominant pitch and pitch per facet, linear feet of ridge/hip/valley/rake/eave/flashing/step flashing, and a suggested waste table. Independent accuracy testing is absent.

### Cited Findings
- **Price, conflicting (all from low-authority comparison blogs):**
  - One roundup: QuickMeasure $15-20, Hover $25/job, EagleView $50-75+.
  - Another: EagleView $45-90, Hover $35-75, QuickMeasure $30-60.
  - A third: EagleView $15-30, Hover $25-45.
  - Sources: [Roof Manager blog 2026](https://roofing-measurement-tool.pages.dev/blog/roof-measurement-report-cost-2026); [Roof Manager mirror](https://claude-9.pages.dev/blog/roof-measurement-report-cost-2026); [US Tech Automations, EagleView alternatives](https://ustechautomations.com/resources/blog/eagleview-alternatives-for-roofing-contractors-2027); [Hook Agency, Hover vs EagleView](https://hookagency.com/blog/hover-vs-eagleview/)
  - One review notes that QuickMeasure and Nearmap pricing is quote- or supplier-based and not publicly comparable. [Property Claims Research Network 2026](https://pr.chinookobserver.com/article/Property-Claims-Research-Network-Reviews-Top-5-Roof-Measurement-Companies-for-Insurance-Adjusters-in-2026/695c8f6c333dce0002698398)
- **Turnaround:**
  - QuickMeasure single-family reports in under an hour.
  - Hover about 24 h standard, 12 h for subscribers. Another source says 20 min, likely meaning on-site capture time.
  - EagleView usually 24-72 h standard; another source says 1-4 h.
  - Same sources as above.
- **Accuracy:** claims are vendor-stated only. GAF is cited as "95% accurate" (warranted), and EagleView at about 1 inch per its marketing. No independent head-to-head test was found. [Roof Manager blog](https://roofing-measurement-tool.pages.dev/blog/roof-measurement-report-cost-2026); [US Tech Automations](https://ustechautomations.com/resources/blog/best-aerial-measurement-tools-for-roofers-2027)
- **Fit:**
  - Hover works from the rep's smartphone photos. EagleView and QuickMeasure work from aerial or satellite imagery.
  - QuickMeasure is mainly for GAF-certified contractors.
  - EagleView is generally favored for insurance and adjuster work.
  - Sources: [Hook Agency](https://hookagency.com/blog/hover-vs-eagleview/); [PCRN 2025 review](https://pr.hillsboronewstimes.com/article/Property-Claims-Research-Network-Reviews-Top-5-Roof-Measurement-Companies-for-Independent-Insurance-Adjusters-in-2025/689b02c8a89569000255a640)
- **EagleView Premium report contents** (from sample reports; the full PDF fetch was blocked):
  - Sections: Images, Length Diagram, Pitch Diagram, Area Diagram, Notes Diagram, Report Summary.
  - Summary: total roof area, total facets, predominant pitch.
  - Linear feet and segment counts for ridges, hips, valleys, rakes, eaves, flashing, step flashing and parapets, plus derived drip edge (eaves + rakes).
  - A suggested-waste percentage table, valid only for asphalt shingles and only counting areas of 3/12 pitch or more. It says it "is not to replace or substitute for experience or judgment".
  - Sources: [EagleView Premium Residential sample (2025)](https://www.eagleview.com/wp-content/uploads/2025/07/Premium-Sample-Report-Residential-1.pdf); [EagleView sample premium report (2017, older)](https://www.eagleview.com/wp-content/uploads/2017/06/Sample-Premium-Roof-Report-Lg.pdf); [Rochester Housing reproduced EagleView reports](https://www.rochesterhousing.org/uploads/procurements/addendum/Roof%20Reports%20Eagle%20View.pdf)
  - EagleView also publishes commercial and "Full House" (walls and siding) samples. [Premium Commercial sample](https://www.eagleview.com/wp-content/uploads/2025/07/Premium-Commercial-Sample-Report.pdf); [Full House sample](https://www.eagleview.com/wp-content/uploads/2025/07/Full-House-Sample-Report.pdf)
- **Measurement in CRMs:** ServiceTitan announced measurement partners integrated into its platform, positioning integration as eliminating re-entry time. [ServiceTitan measurement partners](https://www.servicetitan.com/blog/news-servicetitan-measurement-partners)

### Inferences
- The structured fields of a report (squares by facet and pitch, LF by edge type, waste table) map directly onto estimate line items. A roof measurement calculator should output the same schema so estimates can use either source interchangeably.
- Friction points:
  - Waiting hours or days for a report delays the proposal, so reps often quote at the table from satellite self-measure and true up later.
  - Re-keying numbers from a PDF into the estimate.
  - Paying per report on leads that never close.
- An instant in-app satellite measurement (even approximate), followed by an optional paid report for ordering or insurance, matches how the work flows.
- The waste table's 3/12 limit and shingle-only scope means low-slope sections must be estimated separately (modified bitumen/TPO). The calculator should support mixed-system roofs.

### Gaps
- No first-party pricing confirmed for EagleView, Hover, Roofr reports, RoofSnap or Nearmap in 2026 (vendor sites were blocked or not found).
- No independent accuracy study found.
- Roofr report contents and turnaround are not verified (roofr.com blocked).
- No data on drone adoption rates or on specific drone measurement apps.

## 4. Estimating (quantities, labor, pricing, mistakes)

### Takeaway
The core math:
- Squares = area / 100.
- Gross squares = net squares x (1 + waste).
- Bundles = gross squares x bundles per square, rounded up (usually 3 per square, 4-5 for heavy designer shingles).

Starter, ridge cap, underlayment, ice and water barrier, drip edge and flashing are separate linear or roll takeoffs driven by edge lengths. Waste typically runs 5-17% depending on complexity. Steep pitch and complexity add roughly 20-30%. 2026 installed asphalt pricing is commonly cited at about $350-$1,200 per square (architectural about $550-800), and $8k-$16k for a typical home.

### Cited Findings
- **Squares and bundles:** square = 100 sq ft; gross squares = net x (1 + waste factor); bundles = gross squares x bundles per square, always rounded up because suppliers do not break bundles. Standard 3-tab and architectural shingles are commonly 3 bundles per square, and some heavyweight designer shingles 4-5. [Open Exam Prep, MI roofing contractor: takeoffs](https://open-exam-prep.com/study-guides/mi-roofing-contractor/planning-estimating/material-takeoffs-squares-waste-factors); [Open Exam Prep, LA: wastage factors](https://open-exam-prep.com/study-guides/la-roofing-contractor/roofing-estimating-plan-reading-math/material-takeoff-wastage-costing)
- **Waste factor:** 8% for simple gable roofs, up to 17% for complex roofs with multiple valleys and dormers ([shingle calculator](https://www.getclue.com/calculators/asphalt-shingle-calculator)). Another source gives 5-10% for asphalt ([Zuper](https://www.zuper.co/blog/estimating-roofing-materials-how-to-accurately-plan-for-your-next-roof-project)). Fine Homebuilding discusses much lower figures tied to ordering practice ([Fine Homebuilding](https://finehomebuilding.com/?p=80087)). Hips, valleys and rakes drive waste ([Open Exam Prep LA](https://open-exam-prep.com/study-guides/la-roofing-contractor/roofing-estimating-plan-reading-math/material-takeoff-wastage-costing)).
- **Accessories:** starter, ridge, valley and ice barrier are separate takeoffs. One tool computes ridge cap from total ridge + hip length at about 35 LF per bundle, and an underlayment example uses 1 roll = 400 sq ft. [Shingle takeoff calculator](https://sendthebid.pages.dev/roofing/shingle-takeoff-calculator); [Site Math roofing calculator](https://the-site-math.pages.dev/roofing-calculator) (low authority; coverage varies by product)
- **2026 pricing:**
  - Installed asphalt $350-$1,200 per square. [JobNimbus new roof cost 2026](https://www.jobnimbus.com/blog/how-much-does-a-new-roof-really-cost-in-2025-the-numbers-you-need-to-know)
  - 3-tab $425-$825 per square installed. [Inch Calculator](https://www.inchcalculator.com/roof-replacement-cost/)
  - Architectural $550-$800 per square installed. [BuildVision AI 2026](https://www.buildvisionai.com/roof-replacement-cost)
  - National average about $12,000, with most projects $8,000-$16,000. [Fixr 2026](https://www.fixr.com/articles/asphalt-shingles-everything-you-need-to-know)
  - $6,885-$23,993 for a 2,000 sq ft home, or $3.44-$12 per sq ft. [This Old House](https://www.thisoldhouse.com/roofing/new-roof-cost)
- **Price drivers:**
  - Tear-off is often a separate line, about $1-$5 per sq ft of old material.
  - Steep pitch and complex rooflines add 20-30%.
  - Asphalt shingle costs are up about 8-12% since 2024.
  - Sources: [SubcontractorHub](https://www.subcontractorhub.com/blog/how-much-does-it-cost-to-replace-a-roof); [Roof Observations 2026](https://roofobservations.com/asphalt-shingle-roof-cost/)

### Inferences
- An estimate template structure that follows from the report schema:
  - Field shingles: area x (1 + waste) in squares, then bundles.
  - Starter: eaves + rakes LF.
  - Ridge cap: ridge + hip LF.
  - Drip edge: eaves + rakes LF.
  - Ice and water: eaves LF x width rows + valleys LF.
  - Synthetic underlayment: squares / roll coverage.
  - Step and counter flashing LF, pipe boots, vents.
  - Labor: per square, with pitch-tier multipliers (e.g. 7/12+, 10/12+), extra tear-off layers per square, and decking replacement as an allowance per sheet.
- Pricing models seen in practice are cost-plus margin and flat price per square. The software should show both cost and sell price and the resulting margin to the rep, and warn when margin falls below a floor.
- Common mistakes the tool can prevent (inferred from the formulas above and their sources):
  - Applying shingle waste to low-slope areas.
  - Forgetting starter, ridge or drip edge (not in bundle counts).
  - Not rounding to whole bundles or rolls.
  - Ignoring extra layers or steep charges.
  - Forgetting decking allowances.

### Gaps
- No authoritative 2025-2026 source on typical overhead and profit percentages (the "10 and 10" O&P convention exists in insurance/Xactimate contexts, but I did not verify it here).
- No sourced labor rates per square or steep-charge tiers by pitch.
- No manufacturer coverage figures for ice and water shield or starter rolls.
- No source on decking-replacement allowance norms.

## 5. Proposals (good-better-best, manufacturer systems and warranties, tools)

### Takeaway
A three-tier Good-Better-Best proposal is the standard best practice (NRCIA calls it a proposal standard). Tiers are differentiated by material line, system components and manufacturer warranty level, and the middle tier is positioned as the recommendation. Uplift numbers (around 68% pick the middle tier; 18-30% higher close with premium warranties) are vendor claims.

### Cited Findings
- NRCIA: professional roofing contractors present three price points (good, better, best), and well-prepared proposals clarify the value of each. [NRCIA](https://www.nrcia.org/?p=3656); [NRCIA tag page](https://www.nrcia.org/tag/homeowner/page/2/)
- JobNimbus describes Good (basic, lowest cost), Better (mid-range, recommended) and Best (premium, full feature), with a worked estimate example. [JobNimbus good-better-best example](https://www.jobnimbus.com/blog/good-better-best-roofing-estimate-example)
- Tiers should differ by material quality, warranty length and included features; if the middle tier isn't clearly better for its price, buyers won't upgrade. [PricingLink tiered pricing](https://pricinglink-static2.pages.dev/knowledge-base/residential-roof-replacement-installation/tiered-pricing-roofing-packages); [RoofersCoffeeShop pricing strategy](https://www.rooferscoffeeshop.com/post/the-pricing-strategy-that-can-help-you-differentiate-your-services)
- Claimed: 68% of customers pick the Better option when shown three tiers (attributed to Joist), and good-better-best contractors close 30% more (attributed to a Reddit poll). Neither was verified. [RoofPredict](https://roofpredict-v2.pages.dev/blog/unlock-shingle-sales-good-better-best-framework-for-contractors)
- Claimed: a premium manufacturer warranty (GAF Golden Pledge, Owens Corning Platinum Protection, CertainTeed SureStart PLUS) lifts close rates 18-30% at the same price. No primary study is cited. [Pipeline Marketing warranty tiers 2026](https://pipeline-marketing.pages.dev/blog/roofing-warranty-types/)
- Warranty ladders, per a secondary source (verify against manufacturer sites):
  - GAF: Standard, System Plus, Silver Pledge, Golden Pledge.
  - Owens Corning: Standard, System Protection, Preferred, Platinum.
  - Higher tiers require manufacturer contractor certification and full-system installs.
  - Sources: [Pipeline Marketing](https://pipeline-marketing.pages.dev/blog/roofing-warranty-types/); [Two Brothers Roofing, GAF warranty options](https://twobrothersroofingsc.rynosites.com/understanding-gaf-warranty-options-for-your-two-brothers-roofing-project/); [GAF commercial certification sell sheet](https://www.gaf.com/en-us/document-library/documents/brochures-&-literature/commercial-certification-program-sell-sheet-comgn860.pdf)

### Inferences
- The proposal builder should generate three tiers from one measurement and estimate by swapping a product and system package (shingle line plus matched accessories plus warranty), with the middle tier pre-highlighted. It should show a monthly-payment figure on each tier (see section 7) and support e-acceptance of a specific tier.
- A warranty tier is gated by the contractor's certification level (e.g. GAF Master Elite for Golden Pledge). The company profile should store certifications so only eligible warranty tiers appear.
- Proposal tools named in the brief (SumoQuote, Roofr proposals, Leap) compete on in-home, tablet-friendly presentation and remote sharable links.

### Gaps
- No first-party documentation from SumoQuote, Roofr or Leap was retrieved (sites blocked or not surfaced).
- No reliable data on in-home vs. remote presentation close rates, or on one-call-close vs. follow-up norms.
- Manufacturer warranty terms were not verified on GAF, OC or CertainTeed sites.

## 6. Contracts, e-signature, deposits, state laws, insurance contingency agreements

### Takeaway
Rules on deposits and cancellation are state-specific:
- **California:** down payment capped at the lesser of $1,000 or 10% (B&P Code 7159).
- **New York:** roofers cannot require a deposit at all (GBL 771-b); insurance-paid contracts can be cancelled before midnight of the 3rd business day.
- **Tennessee:** no payments required until the insurer confirms coverage in writing, or the 3-day window passes.
- **Ohio:** a 3-business-day cancellation, plus an insurance-claim-related cancellation right.
- **Federal:** the FTC Cooling-Off Rule gives a 3-day cancel right for in-home sales, which is the baseline for kitchen-table signings.

Contingency agreements on insurance jobs are restricted in several states.

### Cited Findings
- **New York GBL §771-b:** "A roofing contractor shall not require an owner to provide a deposit for the work and materials," and shall not mandate a particular form of payment to start work. For insurance-paid contracts the owner may cancel before midnight of the third business day. [NY Senate GBS 771-B](https://nysenate.gov/legislation/laws/GBS/771-B); [FindLaw](https://codes.findlaw.com/ny/general-business-law/gbs-sect-771-b/); [Justia 2020](https://law.justia.com/codes/new-york/2020/gbs/article-36-a/771-b/)
- **Tennessee (Residential Roofing Services, §62-6-601 et seq.):** "No residential roofing services provider shall require any payments from a person pursuant to a contract until the person has received written notice from the insurer that the contract or claim is fully covered or the three-day cancellation [period has expired]." [TN.gov 62-6-601](https://www.tn.gov/lawsandpolicies/laws-a-c/laws-contractors-and-contracting/residential-roofing-services/62-6-601--part-definitions-111.html)
- **Ohio:** required contract language: "You may cancel this contract not later than the third business day after entering into the contract. If this contract is related to an insurance claim, you may also cancel the contract..." [Ohio Legislature document](https://www.legislature.ohio.gov/download?key=20484)
- **South Carolina** passed related legislation in its 2013-2014 session (older). [SC Statehouse 3409](https://www.scstatehouse.gov/sess120_2013-2014/prever/3409_20130523.htm)
- **California:** down payment may not exceed the lesser of $1,000 or 10% of the contract amount (B&P 7159), per the SB 601 (2023) bill text/summary. Example: on an $18,000 roof, the max deposit is $1,000, so a 50% ($9,000) deposit would be $8,000 over the limit. [LegiScan CA SB601 2023](https://legiscan.com/CA/text/SB601/2023); [Cinderblock](https://cinderblock.com/blog/california-contractor-down-payment-limits/); [Levelset Q&A](https://levelset.com/payment-help/question/california--limit-to-down-payment-request)
- California provides a 3-business-day right to cancel home solicitation contracts. Florida's 3-day period applies when the contract is not signed at the company's office. These come from a low-authority source; verify against statute. [Coohom](https://www.coohom.com/article/roofing-contract-cancellation-laws-by-state-what-homeowners-should-know)
- A state-by-state compendium of roofing contractor laws, including insurance and storm provisions, exists from the Minnesota Legislative Coordinating Commission. [MN LCC State Roofing Contractor Laws Compendium](https://www.lcc.mn.gov/hcpi/background/5.%20Reinsurance%20Market%20for%20Homeowners%20and%20Commercial%20Property%20Insurance/State%20Roofing%20Contractor%20Laws%20Compendium.pdf). I did not read it.
- JLC published "Roofers face a flood of new state laws". The fetch was blocked, so its contents were not reviewed. [JLC](https://www.jlconline.com//how-to/roofing/roofers-face-a-flood-of-new-state-laws_o/)

### Inferences
- Contract templates and payment schedules must be state-aware:
  - A deposit field with a cap rule (CA: min($1,000, 10%); NY: $0 required).
  - Auto-inserted cancellation notice language.
  - An insurance-job flag that triggers state-specific clauses and blocks payment requests until carrier approval (TN).
  - A cancel-by date computed in business days and shown on the job.
- The insurance contingency agreement is a distinct document signed at inspection. It makes the contract contingent on carrier approval, with price set by the insurance scope. It is followed later by a build contract or scope change once the adjuster approves. Many states that ban roofers acting as public adjusters or waiving deductibles limit what this agreement can say. The CRM should model "contingency signed, then claim filed, then adjuster meeting, then approved/denied, then contract finalized" as pipeline stages.
- E-signature on a tablet at the kitchen table is the norm the software must support. It should timestamp the signature and email the homeowner a copy, which matters for cooling-off timing.

### Gaps
- FTC Cooling-Off Rule details (3 business days, in-home sales of $25 or more, or $130 or more at temporary locations) are from general knowledge only and were not verified against ftc.gov in this session.
- I found no comprehensive 2025-2026 table of state deposit caps and roofer-specific insurance rules (e.g. TX, FL, CO, MN, IL, LA deductible-waiver and public-adjusting bans). The MN LCC compendium and JLC article are the leads.
- Licensing: roofing license requirements vary widely by state and were not researched in depth.
- No source was retrieved on the typical text of a contingency agreement or typical deposit norms outside capped states (anecdotally a deposit or material payment of a third to a half; unverified).

## 7. Consumer financing

### Takeaway
Lenders and vendors consistently claim that financing raises close rates and ticket size. The most specific figure is EnerBank's (now Regions) 2018 Brickyard Study: offering a choice of same-as-cash and low-monthly-payment plans could lift a 25% close rate to 44%. Best practice is to show financing on every estimate and to pre-qualify during the appointment. Contractors often use 2-3 lenders because of the trade-off between approval rates and dealer fees. No provider-specific (GreenSky, Hearth, Service Finance, Enhancify) data was found.

### Cited Findings
- EnerBank's 2018 Brickyard Study: offering a choice of same-as-cash and low-monthly-payment options "can nearly double your close rate", e.g. from a 25% to a 44% baseline. This is lender-sponsored and older (2018). [EnerBank/Regions, boost close rate](https://enerbank.com/blog/boost-close-rate-payment-option-benefits-series); [EnerBank roofing financing](https://www.enerbank.com/contractor-financing/roofing-financing)
- Vendor claims: contractors offering financing close "40-60% more deals" with "45% higher average job values" (BuildFolio, from unnamed surveys), or "20-35% more jobs" (SubcontractorHub). [BuildFolio roofing financing guide](https://build-folio.com/financing/roofing-contractor-financing-guide/); [SubcontractorHub 2026](https://www.subcontractorhub.com/blog/contractor-financing-options)
- Case-study claim: a roofer closed 41% more jobs over $10K by offering financing on every quote. [ContractorPlus](https://contractorplus.app/blog/how-a-roofer-closed-41-more-jobs-over-10k-by-offering-financing-on-every)
- Practice guidance:
  - Get pre-approval during the estimate.
  - Show financing on every estimate, not only on request.
  - Work with 2-3 financing platforms so declined customers can try another.
  - Lowest dealer fees often mean the lowest approval rates.
  - Sources: [BuildFolio](https://build-folio.com/financing/roofing-contractor-financing-guide/); [Leap, closing with smart financing](https://leaptodigital.com/blog/closing-roofing-contracts-smart-financing/); [PredictiveSalesAI](https://www.predictivesalesai.com/blog/p.250617002/how-financing-can-help-contractors-close-more-deals)
- Trade-press coverage: [RoofersCoffeeShop, what roofers need to know about financing](https://rooferscoffeeshop.com/post/what-roofers-need-to-know-about-offering-financing-options); [IKO, homeowner financing](https://iko.com/blog/using-homeowner-financing-options-to-grow-your-roofing-business); [Roofing Contractor, "the shingle most important way to boost your close rate"](https://www.roofingcontractor.com/blogs/16-roofing-contractor-blog/post/96039-the-shingle-most-important-way-to-boost-your-close-rate)

### Inferences
- UX implications:
  - Display "as low as $X/mo" on each proposal tier.
  - Embed a soft-pull pre-qualification link or QR that the homeowner completes on their own phone at the table.
  - Record lender, approval status and dealer fee on the job, since dealer fees reduce margin and should feed into estimate pricing.
  - Allow multiple lender integrations.
- Financed jobs change the deposit and payment flow: the lender funds on completion or in stages. This links to the invoicing module.

### Gaps
- No verified 2025-2026 data on GreenSky, Hearth, Service Finance or Enhancify (dealer fee ranges, approval rates, promo structures, roofing-specific uptake).
- No independent, non-lender study of financing's effect on roofing close rates.
- No data on what share of residential roofing jobs are financed.

## 8. Commercial roofing (brief)

### Takeaway
The commercial sales cycle is survey-led and bid-driven: core samples and infrared moisture surveys come before system selection, and often formal RFPs with pre-bid meetings and RFI channels. Itemized technical proposals (membrane type and mil thickness; deck repairs priced separately as unit prices) replace kitchen-table closes. Timelines are weeks to months.

### Cited Findings
- Core samples reveal the number and type of layers, deck material, falls and trapped moisture. Multiple cores across zones are needed on large roofs. Trapped moisture means strip-out rather than overlay. [Zigaflow commercial flat roofing guide](https://zigaflow.com/resources/guides/how-to-quote-and-run-a-commercial-flat-roofing-and-waterproofing-contract) (UK-oriented vendor; some content is generic)
- Infrared thermal scans identify wet insulation and saturation. [Simon Roofing inspection analysis](https://simonroofing.com/services/inspections/inspection-analysis/)
- RFP guidance: allow 2-3 weeks between announcement and bid deadline for simple projects and longer for complex ones, with formal RFI and mandatory pre-bid meeting rules. [FacilitiesNet](https://www.facilitiesnet.com/roofing/article.aspx?id=16523); [Property Manager Insider](https://propertymanagerinsider.com/how-to-get-commercial-roofing-bids/)
- Public bids often require deck-repair unit pricing that is authorized separately from base work. [BidNet solicitation](https://www.bidnetdirect.com/public/supplier/solicitations/statewide/443495387928/abstract); [City of Charlotte MI bid tally](https://charlottemi.gov/wp-content/uploads/2022/07/Commercial-Roof-bid-tally.pdf)
- A commercial proposal is "a technical document disguised as a sales document". TPO/PVC membranes come in 45, 50, 60 and 80 mil. [Flat Roof Report, reading proposals](https://flatroofreport.pages.dev/contractors/reading-proposals) (low authority)

### Inferences
- Commercial needs differ from residential: per-section measurements (multiple roof areas), alternates and unit-price lines in proposals, bid due-date tracking, and a property-manager/owner contact hierarchy. Tiered good-better-best still applies as alternates (e.g. 60 vs. 80 mil, recover vs. tear-off).

### Gaps
- No sourced commercial close rates, bid-win rates or average sales cycle lengths.
- No data on commercial estimating software usage.
