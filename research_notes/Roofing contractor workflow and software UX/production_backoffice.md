# Roofing Contractor Back Half: Production and Back Office (Signed Contract to Paid, Warrantied, Reviewed)

Research note scope: US residential roofing (mostly steep-slope asphalt replacement and insurance restoration), current as of late 2025 to 2026. Many sources are vendor marketing (AccuLynx, JobNimbus, CompanyCam, scheduling vendors). They are flagged where it matters. Several primary hosts could not be fetched in this session because they were outside the allowed network domains: hookagency.com, certainteed.com and becn.com. Findings from those hosts come from search snippets only.

Working sequence (synthesized from the findings below): contract signed and deposit collected → order verified against the measurement report and colors confirmed → permit and HOA → material order placed with the distributor → delivery scheduled (rooftop load or ground drop) and dumpster ordered → homeowner and neighbors notified → crew assigned and job scheduled, with a weather check → tear-off, then a decking change order if needed → install with photo checklist → cleanup and magnet sweep → final inspection → walkthrough → final invoice and collection, with lien waivers → leftover materials returned and credited → job costed (budget vs actual) and commission paid → manufacturer warranty registered → review and referral requested.

## 1. Material ordering (distributors, portals, integrations, delivery, returns, credit)

### Takeaway
Three distributors dominate, and all are now owned by much larger companies. ABC Supply is still independent. SRS Distribution is part of Home Depot and absorbed GMS in September 2025. Beacon became part of QXO in April 2025, and its PRO+ portal is moving onto QXO.com. Each has a contractor portal that turns a signed estimate or aerial measurement into an order with live branch pricing, delivery tracking and delivery photos. The portals plug into AccuLynx, JobNimbus, Leap, Roofr and HOVER. The remaining manual work, and where errors creep in, is verifying quantities, confirming colors, choosing rooftop or ground delivery, and handling returns and credits.

### Cited Findings
**Industry consolidation**
- QXO completed its acquisition of Beacon Roofing Supply on April 29, 2025, at $124.35 per share (about $11B). Beacon became a wholly owned subsidiary, and QXO described itself as the largest publicly traded distributor of roofing, waterproofing and complementary building products in the US. — [Business Wire](https://www.businesswire.com/news/home/20250429541973/en/QXO-Completes-Acquisition-of-Beacon-Roofing-Supply); [MDM](https://www.mdm.com/?p=264285)
- QXO kept acquiring. One report says it closed the purchase of Kodiak Building Partners (about $2.25B) in February 2026, and a QXO release mentions a pending TopBuild acquisition. These are secondary snippets and unverified. — [search snippet via iTiger/Business Wire mirror](https://www.itiger.com/news/2531731499)
- Beacon customers are being moved to QXO branding. QXO's FAQ says all PRO+ features (online ordering, project management, rewards tracking) remain available on QXO.com and existing logins still work. — [QXO "Beacon is now QXO"](https://go.qxo.com/qxo-announcement)
- Home Depot's SRS Distribution acquired GMS through a $110 per share cash tender. The merger closed September 4, 2025, with about $4.3B of equity consideration plus about $1.2B of GMS debt repaid, roughly $5.5B in enterprise value. GMS is now a direct subsidiary of SRS. — [Home Depot 10-K FY2025 (filed 2026)](https://www.sec.gov/Archives/edgar/data/354950/000162828026019436/hd-20260201.htm); [Distribution Strategy](https://distributionstrategy.com/2025/09/home-depot-completes-5-5-billion-acquisition-of-gms-through-srs-distribution/)
- The deal reportedly ended a potential bidding war between Home Depot and Brad Jacobs (QXO) for GMS. — [NBC News](https://www.nbcnews.com/business/business-news/home-depot-buying-gms-4point3-billion-retailer-chases-home-pros-rcna215945)

**Distributor portals**
- **ABC Supply + AccuLynx:** A contractor can turn a signed estimate into a digital order with ABC products and quantities "in a matter of seconds" and submit it to the local branch instead of emailing, faxing or calling. The branch then confirms and processes it. Real-time pricing and available products are visible inside AccuLynx. — [AccuLynx ABC Supply integration](https://acculynx.com/integrations/abc-supply/); [AccuLynx feature page](https://acculynx.com/features/abc)
- AccuLynx's Spring 2025 update added delivery photos that attach to the job file automatically and notifications at delivery milestones. — [AccuLynx Spring 2025 Product Updates](https://acculynx.com/acculynx-spring-2025-product-updates/)
- **SRS Roof Hub:** Contractors build orders from "smart templates" that learn their ordering habits, track material to the jobsite and view delivery confirmation photos. The app also shows open orders, past invoices, supplier promotions, weather and hail maps, and branch locations. A desktop version was added for office staff. — [App Store listing](https://apps.apple.com/us/app/id1434560046); [RoofersCoffeeShop: Roof Hub desktop](https://rooferscoffeeshop.com/post/srs-distribution-is-thrilled-to-announce-the-launch-of-roof-hub-desktop)
- Roof Hub integrates with JobNimbus (live local branch pricing) — [RCS](https://www.rooferscoffeeshop.com/post/srs-distribution-announces-integration-with-jobnimbus-enabling-contractors-to-streamline-their-roof-hub-material-ordering-directly-on-jobnimbus); with Leap (import Roof Hub templates) — [RCS](https://www.rooferscoffeeshop.com/post/leap-crm-enhances-srs-roof-hub-integration-for-faster-more-seamless-material-ordering); with HOVER (direct ordering from measurement-calculated quantities) — [Roofing Contractor](https://www.roofingcontractor.com/articles/97430-hover-partners-with-srs-distribution-to-streamline-digital-materials-ordering-for-contractors); and, from 2025, with Roofr (embedded SRS pricing in quotes, one-click ordering from measurement to delivery) — [Distribution Strategy](https://distributionstrategy.com/2025/07/srs-launches-roofr-integration-as-home-depot-pushes-further-into-pro-contracting/)
- SRS launched the Roof Hub Estimator, a homeowner-facing proposal tool, in October 2024. This means the distributor now competes with CRM vendors on the estimate step. — [Roofing Contractor](https://www.roofingcontractor.com/articles/100033-srs-distribution-launches-roof-hub-estimator)
- **Beacon PRO+:** Contractors order and track materials online, schedule jobsite deliveries, reorder, pay bills online and keep order history. "Smart Order" uses EagleView aerial measurements to build the order. The portal integrates with HOVER, EagleView, JobNimbus, AccuLynx and Leap. — [Beacon: Smart Order](https://www.becn.com/beaconbits/build-your-business/smart-order-how-beacon-pro-makes-it-easier-to-order-roofing-project-materials); [Roofing Contractor: Beacon PRO+ upgrade](https://www.roofingcontractor.com/articles/93217-beacon-roofing-supply-upgrades-beacon-pro); [RCS: AccuLynx + Beacon](https://www.rooferscoffeeshop.com/post/acculynx-and-beacon-partner-to-create-high-efficiency-material-ordering-process-for-roofing-contractors)

**Delivery: rooftop load vs ground drop**
- Shingles usually arrive by rooftop delivery: a conveyor boom truck carries bundles up, and the crew spreads them along the ridge. — [FineHomebuilding forum](https://finehomebuilding.com/forum/roof-loading-boom-truck-or-hand-loaded)
- Distributors employ dedicated "Delivery Material Handler / Roof Loader" staff, including at QXO and ABC, for first- and second-story roof loading. — [QXO job listing](https://jobs.weekday.works/qxo-delivery-material-handler-%2F-roof-loader-9fka); [ABC listing](https://www.jobs.ca/job/2a48b889-c536-478a-989b-48dc76c1ef1e)
- One supplier's policy shows the typical rules. The driver decides whether a roof load is safe. If it is not, material goes on the ground or the delivery is rescheduled, possibly for an extra fee. The roofer may need to supply labor to help load. Rolled membranes such as TPO, EPDM and PVC cannot go up the conveyor. — [Supplier delivery policy (small independent)](https://chameleon-avocado-9ywt.squarespace.com/delivery-policy)
- Common reasons a roof load is not possible include narrow driveways and overhead power lines. Pallets on a roof should be spread out immediately to distribute the load. — [EngineerFix](https://engineerfix.com/how-many-roof-tiles-are-in-a-pallet/)

**Order accuracy**
- AccuLynx publishes guidance on material order accuracy, which signals that over- and under-ordering is a known pain point. — [AccuLynx: material order accuracy](https://acculynx.com/?p=4297); [RCS: 4 tips for accurate orders](https://es.rooferscoffeeshop.com/post/4-tips-to-make-sure-your-material-orders-are-accurate)

**Returns and credits**
- Published restocking fees range from 0% to 40%. One supplier charges 25% of invoice or a $75 minimum on leftover material from completed projects, orders placed in error and cancelled jobs. Some require clean, resalable product returned in original bundles. Some give full credit within 90 days of invoice. Some refuse roofing returns entirely. These are mixed small suppliers, and I could not fetch the Beacon/QXO policy. — [Simonson Lumber](https://simonson-lumber.com/materials/return-policy/); [Eagle Eye Bids policy](https://eebids.notion.site/Eagle-Eye-Bids-Roofing-Materials-Limited-Return-Policy-Warranty-2ab69fde264b801fa776d923b32cc63c); [Beacon material return policy (not fetched)](https://becn.com/material-return-policy)

**Trade credit**
- ABC Supply, Beacon and SRS all offer contractor credit programs, and regular buyers are typically on net 30 or net 60 terms. This comes from a contractor-finance marketing site. — [The Contractor Matrix](https://www.thecontractormatrix.com/contractor-financing/roof-company)
- Terms are often set by branch, for example net 30 or "Net 10th". This example is from another distributor, Johnstone. — [Resolve blog](https://resolvepay.com/blog/johnstone-supply-payment-terms?hs_amp=true)
- Fintechs such as Billd advertise 120-day material terms aimed at contractors, which shows that contractors face a working-capital gap between paying for materials and collecting from homeowners. — [Billd](https://grow.billd.com/?p=122)

### Inferences
- Material flows through four objects: estimate → order → delivery (with photos and status) → invoice and credit. A SaaS should link these in one job-level ledger. Distributor invoices and credits flow back into job cost, which JobNimbus's QuickBooks sync does not handle well (see section 4).
- Consolidation means a contractor's ordering software increasingly needs integrations with two or three corporate platforms rather than many independents: ABC myABCsupply, SRS Roof Hub (plus GMS), and QXO (formerly Beacon PRO+). QXO's rebranding could break existing integrations or confuse users.
- Distributors are moving up the workflow into estimating (Roof Hub Estimator) and project management (PRO+ "project management"). That makes them both partners and competitors to CRM vendors.
- UX pain points to design for:
  - color and line-item confirmation with the homeowner before ordering
  - capturing the delivery method and access notes (power lines, driveway, gate codes)
  - a delivery-photo-verified checklist
  - leftover materials logged at job close so they can be returned before the return window or credit expiry

### Gaps
- The exact myABCsupply features in 2026, ABC's API terms, and whether ABC exposes public APIs beyond its partner integrations were not verified.
- The claim that SRS "acquired GAF-affiliated/Heritage" was not substantiated. "Heritage" names SRS's own landscape and pool divisions, not a roofing acquisition, so the premise likely conflates the two and should be treated as unverified. Home Depot's 2024 acquisition of SRS is widely reported but was not separately confirmed in this session.
- No primary ABC, SRS or QXO credit terms (such as 10th prox and finance charges), or the QXO return policy, were obtained. One blog claims 1.5–2% monthly late charges, but it is unsourced.
- No quantitative data was found on how often orders are wrong or redelivered.

## 2. Production scheduling (crews, capacity, weather, permits, dumpsters, HOA, notifications, inspections, safety)

### Takeaway
A production manager keeps a rolling one- to two-week install calendar. They assign crews, which are often subcontractors paid per square, by capacity, and they gate each job on permit, materials and colors. Weather forces constant rescheduling, and homeowners often are not told. The main sources of delay and lost margin are weather cascades, permit lead times, and poor communication with homeowners. Fall protection is the most-cited OSHA standard every year.

### Cited Findings
- A production manager job posting defines the role as owning scheduling, crew coordination, material readiness, documentation enforcement and production KPI reporting. It specifies maintaining a "live 2-week rolling install schedule," assigning crews by capacity, adjusting for weather and labor availability, and logging change orders in the job software. — [Production Manager posting](https://swooped.co/job-postings/production-manager-remote-assist-world-f80a5)
- In contractor surveys cited by a scheduling vendor, 66% name weather as their top scheduling risk. Weather delays cascade across the week, and homeowners often are not told the new timeline. This is a vendor statistic and unverified. — [Arrivy blog](https://www.arrivy.com/blog/how-roofing-project-management-software-automates-scheduling-rescheduling/); [FieldProxy](https://www.fieldproxy.ai/blueprints/roofing-dynamic-scheduling)
- Phase-gate automation, where finishing one stage such as an inspection triggers scheduling of the next phase, sends notifications and checks that permits and materials are ready, is the pattern vendors promote. — [Arrivy](https://www.arrivy.com/?p=9493)
- JobNimbus publishes "Top 10 Tips to Keep Your Roofing Job on Schedule," covering pre-job confirmation and communication. — [JobNimbus](https://jobnimbus.com/?p=1066)
- **Subcontractor labor:** Labor typically runs about $200–$350 per square nationally. A Leap model of state sub rates for 2026 runs from about $122 per square in Arkansas to about $424 in California. The figures are modeled, not surveyed. Steep (>6:12) or complex roofs cost more, and tear-off is often priced separately. — [Leap 2026 Roofing Subcontractor Price Sheet](https://leaptodigital.com/e-books/2026-roofing-subcontractor-price-sheet/); [Leap PDF](https://leaptodigital.com/wp-content/uploads/2026/07/2026-MAR-Subcontractor-Price-Sheet.pdf); [InvoiceFly](https://invoicefly.com/free-resources/free-calculators/roofing-cost-calculator/)
- **Permits:** Nearly all reroofing jobs need a permit before work starts. — [Arrivy](https://www.arrivy.com/?p=9493)
- **Safety:** Fall protection (29 CFR 1926.501) was OSHA's most-cited standard for the 15th straight year in FY2025, with 5,914 violations, down from 6,307 in FY2024. The construction top five also include ladders (2,405), fall protection training (1,907) and scaffolding (1,905). Residential fall protection, 1926.501(b)(13), is the top serious citation in construction. — [OSHA Top 10](https://www.osha.gov/top10); [MSA Safety](https://blog.msasafety.com/fall-protection-top-10-osha-violations-of-fy-2025/); [J.J. Keller](https://jjkellercompliancenetwork.com/news/avoid-50k-in-serious-osha-fines-learn-where-others-slipped-up-in-fy-2025)

### Inferences
- The schedule object should depend on readiness flags (permit approved, HOA approved, materials confirmed and delivered, dumpster booked, colors signed off, deposit received). It also needs a weather-driven bulk reschedule that notifies the homeowner, crew, supplier and dumpster vendor all at once.
- Because crews are paid per square with adders for pitch, layers and tear-off, a work order should carry the crew price sheet so sub pay is calculated automatically from the measurement.
- Safety documentation, such as fall protection plans, training records and per-job harness or anchor photos, is a reasonable compliance feature given how often OSHA cites it.

### Gaps
- No good data was found on permit timelines by jurisdiction, on who pulls permits (the contractor in most states, but unverified), on dumpster logistics or costs, on HOA approval timelines, on neighbor-notification practices, or on in-house vs subcontracted crew mix. Searches returned only vendor content.
- No primary data was found on crew capacity, such as squares per crew per day. One vendor snippet said 0.8–1.6 squares per day, which looks like a per-worker figure and is unreliable.

## 3. On-site execution (photos, checklists, crew communication, change orders, daily logs, walkthrough)

### Takeaway
CompanyCam-style photo timelines and per-job-type checklists are the de facto record of the job. They support homeowner updates, insurance and supplement paperwork, warranty proof and review requests. The most common change order on a reroof is rotten decking found at tear-off. Contracts pre-price it per sheet, sometimes with an included allowance, so it can be approved on the spot without a separate written change order.

### Cited Findings
- **Photo documentation:** CompanyCam projects have a chronological timeline of photos, videos and documents. It can be shared as a live link with homeowners, and individual photos can be hidden. Checklists can be customized by job type and can require a photo at each item. — [CompanyCam: high-volume roofers](https://companycam.com/resources/blog/how-high-volume-roofers-use-companycam); [Sagnik Bhattacharya comparison](https://sagnikbhattacharya.com/blog/companycam-alternatives-roofers-photo-reports)
- Recommended roofer photos include the job site when the crew arrives each day and the protection laid down, such as tarps and plywood. — [CompanyCam: 25 must-take photos](https://companycam.com/blog/25-must-take-photos-for-roofers-1)
- CompanyCam integrates with AccuLynx. — [CompanyCam blog](https://companycam.com/resources/blog/acculynx-companycam-integration)
- A third-party comparison lists the CompanyCam Crew plan at about $129 per month for three users, with Core limited to two users. Prices are unverified. — [Sagnik Bhattacharya](https://sagnikbhattacharya.com/blog/companycam-alternatives-roofers-photo-reports)
- **Rotten decking change orders:**
  - A Florida Roofing Contractors Association template has the customer agree to pay "$___ per sheet of plywood replaced without the need for a written change order." — [FRSA](https://floridaroof.com/Addressing-Self-Adhered-Underlayment-in-Contracts-1-21818.html)
  - Example rates: $75 per sheet in a Florida municipal contract that includes one 4×8 sheet in the base price; $60 per sheet and $9.50 per lineal foot for 1" board in a roofer's terms. — [Hampton/Zephyrhills public docs](https://archives.ci.zephyrhills.fl.us/WebLink/0/doc/74761/Page8.aspx); [Roofer T&C](https://media.base44.com/files/public/user_6a22dc88783b484dd6ef2b08/17c435028_DemoreTermsandconditions.pdf)
  - Commercial bids sometimes include 10% deck replacement in the base price, with a change order only above that. — [BidNet](https://www.bidnetdirect.com/public/supplier/solicitations/statewide/443804427989/abstract)
  - A City of Everett change order increased rotted plywood replacement from 640 to 1,120 square feet. — [Everett WA CO #1](https://lfportal.everettwa.gov/WebLink/0/edoc/1615740/Creative%20Roof%20Solutions%20LLC%20132024%20Change%20Order%201.pdf)
- Roofing Contractor's legal column covers how disputes arise from change orders of many shapes and sizes. — [Roofing Contractor: Legally Speaking](https://www.roofingcontractor.com/articles/85008-legally-speaking-avoiding-disputes-the-many-shapes-and-sizes-of-change-orders); [RCS: managing change work orders](https://www.rooferscoffeeshop.com/post/effective-management-of-change-work-orders-in-roofing-projects)

### Inferences
- Mid-job change orders need a mobile flow the crew lead or production manager can complete from the roof:
  1. take a photo of the rot
  2. count sheets against the pre-priced unit rate
  3. get the homeowner's e-signature, or text approval when the contract says no written change order is needed
  4. add the change to the final invoice and to job cost
- Pre-priced unit items (decking per sheet, extra layers per square, step flashing) belong in the contract template so the field flow is mostly counting.
- Crew messaging today is ad hoc (text and WhatsApp). Photo-first, low-text checklists with icons suit crews with limited English. This is inferred, not sourced.

### Gaps
- No sourced data was found on language barriers or Spanish-speaking crews, WhatsApp usage, daily-log practices, or final-walkthrough checklists. Reddit and YouTube were not reached in this session.

## 4. Completion and money (invoicing, payment schedule, methods, collections, liens, QuickBooks)

### Takeaway
A typical retail schedule is a deposit of 10–30%, sometimes up to 50%, then a progress payment at material delivery or mid-job, then a final payment after inspection and walkthrough. Insurance jobs complicate this, but that is outside this note's scope. Mechanics lien rights depend on strict state-specific notice and filing deadlines. Accounting sync is a weak point: JobNimbus pushes invoices and payments to QuickBooks Online, but not material orders, work orders or vendor bills, so job costing is split across systems.

### Cited Findings
- **Payment schedule:** A typical schedule is a 10–30% deposit, a progress payment at a milestone such as material delivery or the halfway point, and a final payment after the job. Example: a $15,000 roof billed as 25% deposit, 50% progress and 25% final. — [RoofVista payment schedule guide](https://roofvista.com/resources/guides/roof-replacement-payment-schedule)
- Homeowner-side advice is to release final payment only after the municipal inspection passes (if required), debris is cleaned up, warranty documents are delivered and a walkthrough is approved. Contracts should require conditional lien waivers with each progress payment and an unconditional waiver on final payment. — [RoofVista](https://roofvista.com/resources/guides/roof-replacement-payment-schedule)
- Deposit norms vary from 10–30% to 30–50%, and some states regulate residential down payments. — [Roof Observations: deposit rules by state](https://roofobservations.com/residential-roofing-down-payment-rules/); [Roof Crafters](https://www.roof-crafters.com/learn/how-much-should-you-pay-upfront-for-a-roof)
- **Liens:** Missing a required notice or the filing deadline can invalidate a mechanics lien. — [Levelset: lien and notice deadlines in all 50 states](https://www.levelset.com/blog/lien-and-notice-deadlines-in-all-50-states)
- Texas example: subs and suppliers send notice by the 15th day of the second month after unpaid work. The lien must be filed by the 15th day of the third month after the last work on residential jobs, and the 4th month on non-residential. Missing notice "may be fatal" to the claim. — [Levelset TX fact sheet](https://hub.levelset.com/hubfs/_Levelset/Levelset%20Lien%20and%20Notice%20Fact%20Sheets/TX_FactSheet.pdf)
- Nevada residential: all claimants except laborers must send a Notice of Intent to Lien to the owner and the GC. — [Levelset Q&A](https://www.levelset.com/payment-help/question/how-does-a-mechanics-lien-work/)
- Roofers commonly ask Levelset whether they missed their preliminary notice window on residential retail jobs, which shows confusion about prime-contractor notice obligations. — [Levelset Q&A](https://www.levelset.com/payment-help/question/i-am-a-general-roofing-contractor-there-is-no-lender-on-the-project-customer-is-not-paying-i-am-past-the-preliminary-lien-time-period-because-we-understood-that-we-do-not-have-to-prelim-in-this-sit); [Levelset: can a roofer file a lien](https://www.levelset.com/payment-help/question/can-a-roofer-file-a-lien-against)
- **JobNimbus ↔ QuickBooks Online:**
  - Sync can be one-way or two-way. Contacts must sync first, then products, then estimates and invoices, then payments. Drafts do not sync. — [JobNimbus: connect QBO](https://support.jobnimbus.com/how-do-i-connect-with-quickbooks-online); [Fields that sync](https://support.jobnimbus.com/what-fields-sync-to-quickbooks-online)
  - Work orders, material orders, vendors and bills paid do not sync. — [JobNimbus: connecting to QBO](https://support.jobnimbus.com/connecting-to-quickbooks-online)
  - Payments land in Undeposited Funds or Payments to Deposit, and users cannot change this. Matching from the bank feed instead of to the synced payments creates duplicates. — [JobNimbus: payment sync](https://support.jobnimbus.com/how-does-a-payment-sync-from-jobnimbus-to-quickbooks)
  - Common errors: payment method not linked, product not found, category item, stale object, and inactive or merged products. — [JobNimbus: troubleshooting QBO](https://support.jobnimbus.com/troubleshooting-qbo); [Products not syncing](https://support.jobnimbus.com/troubleshooting-products-services-not-syncing-to-quickbooks)
  - QBO expenses can flow back into JobNimbus's "Profit Tracker". — [JobNimbus: expenses to Profit Tracker](https://support.jobnimbus.com/how-do-expenses-sync-from-quickbooks-online-to-the-profit-tracker)

### Inferences
- A roofing SaaS should treat the payment schedule as a set of milestone-triggered invoices: deposit on signature, progress on delivery photo, final on passed inspection and walkthrough sign-off. Each should be paired with the right conditional or unconditional lien waiver.
- A per-job lien deadline tracker keyed to state and last-furnished date would address a real, costly failure mode for small contractors with no in-house counsel.
- The two-direction gap between CRM and accounting (revenue syncs out, costs sync back in, both with mapping errors) is a likely reason owners do not trust job profitability numbers.

### Gaps
- No sourced data was found on payment-method mix (check vs ACH vs card), card surcharge practices (legal in most states with caps and disclosure; some states restrict it), consumer financing penetration and dealer fees (for example GreenSky, Service Finance), or AR aging norms (DSO) in roofing. Searches returned nothing usable.
- A 50-state summary of whether prime contractors on owner-occupied residential jobs must send preliminary notice was not compiled.

## 5. Warranties (manufacturer certification and registration, workmanship)

### Takeaway
The top manufacturer warranties, the ones that cover workmanship, require a certified contractor, a full system of qualifying accessories and timely registration by the contractor: GAF Golden Pledge (Master Elite), Owens Corning Platinum Protection (Platinum Preferred) and CertainTeed SureStart PLUS / 5-Star (SELECT ShingleMaster). Missing the registration window drops the homeowner to the basic warranty. That makes registration a back-office task with a deadline.

### Cited Findings
- GAF Golden Pledge requires installation by a GAF Master Elite contractor, a qualifying GAF shingle plus qualifying accessories (a source says 5) and a full roof. GAF may decline to issue the warranty if it is not registered within 45 days of installation, and can withhold it if the installation does not follow GAF instructions. — [GAF Golden Pledge brochure (RESWT161B)](https://www.gaf.com/en-us/document-library/documents/brochures-&-literature/golden-pledge-limited-warranty-brochure-reswt161b.pdf); [GAF Golden Pledge warranty PDF](https://www.gaf.com/en-us/document-library/documents/warranties/fortified-limited-warranty-golden-pledge-and-presidents-club.pdf)
- The contractor registers online with homeowner info plus the shingles and accessories installed, and GAF emails the warranty to the homeowner. This is a third-party source. — [Roof Crafters](https://www.roof-crafters.com/learn/gaf-golden-pledge-warranty)
- One secondary source says that from 2025, GAF requires Master Elite contractors to meet annual installation, warranty-registration and education minimums. This is unverified with GAF. — [GAF Residential Program Guidelines PDF](https://www.gaf.com/en-us/document-library/documents/brochures-&-literature/partner-programs-residential-program-guidelines.pdf); [RooferDirectory](https://rooferdirectory.co/articles/gaf-certified-master-elite-explained/)
- One secondary source describes a GAF Master Elite path to 25-year workmanship coverage. This is a low-quality press-release mirror. — [mirror](https://lifestyle.mmminimal.com/story/660922/gaf-master-elite-certification-unlocks-25-year-workmanship-coverage/)
- CertainTeed SELECT ShingleMaster eligibility includes at least 5 years in business, or 1 year as a ShingleMaster, plus training and credential exams. Secondary sources add insurance proof and audits. SureStart PLUS extended warranties can only be registered by SELECT ShingleMasters. — [CertainTeed SELECT ShingleMaster (snippet)](https://certainteed.ca/select-shinglemaster); [Roof Crafters: CertainTeed 5-Star](https://www.roof-crafters.com/learn/certainteed-5-star-warranty)
- Owens Corning Platinum Protection requires a Platinum Preferred Contractor under its terms and conditions. — [Owens Corning document](https://www.owenscorning.com/dms/10020608)
- Registration windows conflict across secondary sources: GAF 30 days (but the official brochure says 45), OC 30 days, CertainTeed 60 or 120 days. If the window is missed, the warranty defaults to basic coverage. — [Econo Roofing blog](https://econo-roofing.pages.dev/blog/roof-warranty-explained/); [Shingles Calculator](https://shinglescalculator.pages.dev/how-to/understand-roofing-warranty/); contradicted for GAF by the [official GAF brochure](https://www.gaf.com/en-us/document-library/documents/brochures-&-literature/golden-pledge-limited-warranty-brochure-reswt161b.pdf)

### Inferences
- Warranty registration should be a required, dated task at job close, with a countdown to the manufacturer window. It needs the shingle line, accessory SKUs (pulled from the material order and delivery record), install date and certification ID. The material order is the natural source of that SKU list.
- Certification minimums, such as GAF registration counts, make a contractor's registration rate and volume a KPI the software could report.
- The contractor's own workmanship warranty, often 2–10 years for non-certified companies (inferred, not sourced), should be generated as a document with the final invoice.

### Gaps
- Current official registration windows for Owens Corning and CertainTeed, and current Master Elite or Platinum requirements such as the percentage of roofs installed and annual quotas, could not be confirmed. certainteed.com was blocked and the OC PDF was not fetched.
- No data was found on workmanship-warranty norms or on callback and warranty-claim rates.

## 6. Sales commissions, job costing and owner KPIs

### Takeaway
Rep pay is usually commission-only or a draw against commission. Common plans are roughly 8–12% of contract value, about 20–30% of gross profit, or a "10/50/50" split: 10% of revenue off the top for overhead, then the profit after job costs split 50/50 with the rep. Commissions are paid after the job is costed and collected, so accurate job costing is a compensation problem as well as a reporting one. Owners watch gross margin (about 25–40%), overhead (about 18–24% of revenue) and net margin (about 5–15%), plus backlog, close rate and AR.

### Cited Findings
- **Percent of gross profit:** Example of a $20,000 contract with $12,000 in costs, giving $8,000 GP. A 25% GP commission pays $2,000. — [Contractors Cloud: roofing sales commissions](https://contractorscloud.com/blog/roofing-sales-commissions-models-examples-payouts-and-how-to-automate-them)
- **Draws:** A draw is an advance reconciled against earned commission. Example: a $2,000 draw against $2,500 earned pays a net $500. Draws often have recovery clauses. — [Contractors Cloud](https://contractorscloud.com/blog/roofing-sales-commissions-models-examples-payouts-and-how-to-automate-them)
- **Common rates:**
  - About 10% of gross sales, or about 20% of profit, is commonly cited, as is a hybrid of 6–8% of gross plus a 2–3% profit bonus. — [Hook Agency: roof sales commission (snippet)](https://hookagency.com/blog/roof-sales-commission/); [Hook Agency: compensation plans (snippet)](https://hookagency.com/blog/roofing-sales-compensation-plans/)
  - The 10/50/50 split is described as common in storm restoration and harder to run with new reps. — [Hook Agency (snippet)](https://hookagency.com/blog/roofing-sales-compensation-plans/); [ContractorPlus](https://contractorplus.app/blog/how-roofing-sales-commissions-keep-closers-loyal)
  - RoofersCoffeeShop forum threads show wide variation. — [RCS forum: how to pay your salesmen](https://rooferscoffeeshop.com/forum/topic/how-to-pay-your-salesmen)
- AccuLynx markets commission management within its job records. — [AccuLynx: managing sales commissions](https://acculynx.com/?p=568)
- **Margin benchmarks:**
  - Gross margin is typically 25–40% (repair 40–50%, replacement 30–38%) and overhead about 18–24% of revenue. Example: 35% GM minus 22% overhead leaves about 13% net. Net margin estimates range from 5–10% (top performers 12–15%) to 6–12%. — [JobNimbus: profit margin](https://jobnimbus.com/blog/roofing-business-profit-margin); [Hook Agency: profitability](https://hookagency.com/blog/good-roofing-year-profitability/); [Zuper](https://www.zuper.co/blog/understanding-average-profit-margins-in-roofing-industry)
  - Vendors recommend tracking gross margin by job type, overhead ratio and backlog days monthly. — [JobNimbus: 12 roofing KPIs](https://jobnimbus.com/blog/roofing-kpis); [ServiceTitan: roofing KPIs](https://www.servicetitan.com/blog/roofing-kpis)

### Inferences
- Commission is a downstream calculation from job cost: contract plus change orders and supplements, minus materials (net of returns), labor, dumpster, permit and other costs, minus overhead percentage, times the rep's split, minus draws, chargebacks and adjustments. Every cost that arrives late (a distributor invoice, a credit, a crew adder) delays or disputes commission payouts. Live budget-vs-actual per job is therefore critical for retaining reps, not just an owner report.
- Since material orders and vendor bills do not sync from CRM to QuickBooks (section 4), many contractors likely rebuild job costing in spreadsheets.

### Gaps
- No primary or survey data was found on commission timing (paid on collection vs completion), chargeback norms, supplement-related commission rules, or which KPIs owners actually review. Hook Agency pages were not fetchable, and NRCA benchmarks were not found.

## 7. Reviews and referrals after completion

### Takeaway
Review requests are best sent at completion, ideally on site via a direct Google review link or QR code, with project photos attached. Photo tools (CompanyCam Reviews) and CRMs automate this. Little hard data was found on conversion rates or referral program design.

### Cited Findings
- CompanyCam's Reviews feature sends homeowners a review request with selected project photos and a direct Google review link, or shows a QR code for an in-person review. — [CompanyCam: high-volume roofers](https://companycam.com/resources/blog/how-high-volume-roofers-use-companycam); [Sagnik Bhattacharya](https://sagnikbhattacharya.com/blog/companycam-alternatives-roofers-photo-reports)
- The shareable live project timeline, with hidden photos excluded, doubles as a completion report for the homeowner. — [Sagnik Bhattacharya](https://sagnikbhattacharya.com/blog/companycam-alternatives-roofers-photo-reports)

### Inferences
- The final walkthrough is the natural moment to trigger the closing bundle: e-signed completion certificate → final invoice and pay link → warranty documents → review request with photos → referral offer. The review request should be suppressed while there is an open punch item or unpaid balance.

### Gaps
- No sourced data was found on Google review request conversion rates, typical referral bonuses ($ per closed referral), or post-job follow-up cadence such as annual inspections. Reddit, podcasts and YouTube were not reached in this session.
