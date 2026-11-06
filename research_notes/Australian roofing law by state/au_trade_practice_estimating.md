# Australian Roofing Trade Practice and Estimating (for localising a roofing SaaS)

Research date: 6 Nov 2026. Scope: Australia only, 2024-2026 data where available.

**Method and source limits (read first):**
- About 17 searches and fetches. Direct page fetches failed for `whatsthedamage.com.au` and `lysaght.com`: the session's network allowlist blocks them (DNS "ENOTFOUND"). Figures from those sites come from search-result snippets only, not full-page reads. To verify them, the host needs to be allowed in the session's network settings.
- Most price data comes from lead-generation or "cost guide" sites, and several of those are affiliate or competitor marketing pages (for example the `*.pages.dev` comparison sites). Treat every price as **indicative (estimate)** unless it is marked **confirmed (manufacturer spec)**.
- No official hipages, ServiceM8, Tradify, Fergus, simPRO or AroFlo pricing page was retrieved. All software and lead-platform prices are third-party figures.
- Items tagged "[known reference URL, not fetched this session]" are well-established facts with the official page that holds them. They were not re-verified in this run.

---

## 1. Job mix and roof types by region

### Takeaway
Australian residential roofing has four main job families:
- **metal re-roofs**: Colorbond or Zincalume, often converting tile to metal
- **tile roof restorations**: clean, rebed and repoint, recoat
- **repairs and leaks**
- **gutters, downpipes and fascia**

Asbestos roof removal plus a metal re-roof is a distinct, high-value job type. Regional drivers are cyclonic fixing requirements in the north (QLD, WA, NT) and storm or hail claim work in SE QLD and NSW. The data found was qualitative. No source gave job-mix percentages by state.

### Cited Findings
- Tile-to-Colorbond conversion is a standard priced job type in several city cost guides (estimates):
  - Sydney: $20,000-$35,000 total — [whatsthedamage Sydney (snippet)](https://whatsthedamage.com.au/roofing-cost-sydney/metal-roof-replacement/)
  - Brisbane, 3-bedroom home: $18,000-$30,000 — [whatsthedamage Brisbane roof replacement (snippet)](https://whatsthedamage.com.au/roofing-cost-brisbane/roof-replacement/)
  - Canberra: $90-$160/m², or $16,000-$28,000 for a single-storey 3-bedroom house with about 150 m² of roof — [whatsthedamage Canberra (snippet)](https://whatsthedamage.com.au/roofing-cost-canberra/)
- Roof restoration is priced as one bundled job: clean, repair, recoat. Sydney $2,875-$6,900; Melbourne $2,625-$6,300 (July 2026, estimate) — [whatsthedamage Sydney](https://whatsthedamage.com.au/roofing-cost-sydney/); [whatsthedamage Melbourne](https://whatsthedamage.com.au/roofing-cost-melbourne/)
- Adelaide restoration of a single-storey concrete-tile roof: $2,500-$6,500. Larger or two-storey roofs: $5,000-$10,000 (estimate) — [whatsthedamage Adelaide roof painting](https://whatsthedamage.com.au/painter-cost-adelaide/roof-painting/)
- Asbestos (bonded fibre-cement) roof removal is common enough to have its own cost pages for several cities, including Sydney, Melbourne, Central Coast and Darwin — [whatsthedamage asbestos Australia](https://whatsthedamage.com.au/asbestos-removal-cost-australia/); [Sydney asbestos roof removal](https://whatsthedamage.com.au/roofing-cost-sydney/asbestos-roof-removal/)
- Cyclone regions, North QLD:
  - Suncorp/James Cook University research on Cyclone Yasi found roof and window damage were the main drivers of insurance losses.
  - Pre-1980s homes accounted for $132M of claims, against $119M for post-1980s homes.
  - Roof upgrades "can cut cyclone damage bills in half". Suncorp later offered premium reductions for roof retrofits in North QLD.
  - Sources: [Suncorp/JCU media release](https://www.suncorpgroup.com.au/uploads/pdf/news/Media%20Release%20JCU%20first%20report%20FINAL.pdf); [Suncorp Build to Last report](https://www.suncorpgroup.com.au/uploads/build-to-last-report%20(AMR).pdf); [AIDR JCU report](https://knowledge.aidr.org.au/media/1765/jcu-1-final-for-publication-150715.pdf)
- Lysaght publishes a separate Cyclonic Area Design Manual. In it, fasteners, cyclonic washers and fastening pattern form "an integrated roofing/walling system prescribed in this manual" — [Lysaght Cyclonic Manual (Scribd copy)](https://www.scribd.com/document/427570528/LysaghtCyclonicManual-pdf)
- QLD has issued Building Newsflash 483 on fixing concrete and terracotta tiles in cyclonic regions. Its text was not retrieved — [QLD newsflash 483](https://www.chde.qld.gov.au/__data/assets/pdf_file/0019/4627/newsflash-483.pdf)
- Cyclone Alfred (SE QLD and northern NSW, 2025): insurers flagged that poor roof condition puts claims at risk, so pre-existing roof maintenance matters for claims — [Insurance Business AU](https://insurancebusinessmag.com/au/news/breaking-news/roof-condition-puts-cyclone-alfred-claims-at-risk-529452.aspx)
- Hail and storm claim work is a business segment in QLD: firms such as AusHail advertise hail inspections and insurance advocacy — [AusHail on Seek](https://au.seek.com/companies/aushail-991978)

### Inferences
- Suggested SaaS job types:
  - Re-roof (metal)
  - Re-roof (tile)
  - Tile-to-metal conversion
  - Asbestos removal plus re-roof
  - Roof restoration (tile)
  - Roof restoration (metal: paint or coat)
  - Rebed and repoint ridges
  - Leak or general repair
  - Storm or hail insurance repair
  - Gutter and downpipe replacement
  - Fascia replacement
  - Skylight or roof window
  - Whirlybird or roof ventilation
  - Sarking or insulation install
  - Solar-related work: panel removal and reinstall during a re-roof
  - Inspection or report: pre-purchase or insurance
- Add a per-job "wind region / cyclonic (Region C/D)" flag that switches the fastener schedule (cyclonic washers, more screws). Add a "BAL rating" field for bushfire-prone sites. BAL details were not researched here.
- Add an "insurance job" workflow (claim number, assessor, photo report) for the QLD and NSW storm and hail market. Cyclone Alfred shows condition reports matter.

### Gaps
- No source quantified job mix by state, such as the share of tile versus metal roofs per state, or restorations versus re-roofs.
- Nothing was found on how common terracotta and slate are by region, or on BAL-specific roofing requirements. These are likely covered by another researcher (law by state).
- No data was found on solar-related roof work volumes.

---

## 2. Measurement and estimating conventions

### Takeaway
Australia measures roofs in m² and lineal metres (lm), not "squares". Cover widths below are confirmed from manufacturer specs. Metal sheets are ordered cut to length per run, so a calculator must output a cut list: sheet count by length, from cover width. Concrete tile coverage is about 9.9 tiles/m², or about 11/m² including waste, for Monier Elabana.

Per-m² installed prices for 2026 are roughly:
- Colorbond re-roof: $80-$205/m²
- Tile re-roof: $100-$255/m²
- Restoration: $17-$80/m²

These vary widely by source and are estimates. The fastener-per-m² figure was not found and must come from Lysaght's installation manual.

### Cited Findings: product geometry (confirmed manufacturer specs)
- Lysaght Custom Orb (corrugated) has an effective cover width of 762 mm — [Lysaght walling brochure](https://wpstaq-ap-southeast-2-media.s3.amazonaws.com/baxterroofing/wp-content/uploads/media/2024/03/LysaghtWallingBrochureApril2016.pdf); [SteelSelect Custom Orb](https://steelselect.com.au/products/lysaght/lysaght-custom-orb)
- Lysaght Trimdek has an effective cover width of 762 mm (±4 mm per NBS) — [Lysaght walling brochure](https://wpstaq-ap-southeast-2-media.s3.amazonaws.com/baxterroofing/wp-content/uploads/media/2024/03/LysaghtWallingBrochureApril2016.pdf); [NBS Source Trimdek](https://source.thenbs.com/au/product/lysaght-trimdek-stainless-steel/p9Hy4eY3wd2rrLV5LpiLaZ/bsNrCVK3i5xq4GdWVUGxzV)
  - The brief's "700 mm Trimdek" is incorrect: 700 mm is Klip-Lok.
- Lysaght Klip-Lok 700 (Hi-Strength and Classic) has a cover width of 700 mm. It is concealed-fix on clips, with an older fixing table specifying "three screws per clip" — [Lysaght Klip-Lok Classic 700](https://lysaght.steelselect.com.au/products/lysaght/lysaght-klip-lok-classic-700); [Klip-Lok 700 HS manual (Scribd)](https://www.scribd.com/document/230177482/LysaghtKlipLok700HSMarch2014)
- Fasteners for pierce-fixed profiles: Lysaght Product Advisory Bulletin PAB04 gives the estimate as (fasteners per sheet per support) × (number of sheets) × (number of supports). It points to the LYSAGHT Roofing & Walling Installation Manual as the primary reference. Wind tables list "fasteners per sheet per support". For example, at 0.42 BMT the table shows 3 per support for single spans and 5 for serviceability — [Lysaght PAB04 (search snippet; fetch blocked)](https://lysaght.com/support-technical/support/design/pab04-fasteners); [PAB04 PDF](https://cdn.dcs.lysaght.com/download/lysaght-product-advisory-bulletin-pab04-fasteners)
- Custom Orb Accent 35, a related profile (not standard Custom Orb): crest-fixed with 3 fasteners per sheet at internal supports and 6 at end supports — [ArchiExpo Lysaght catalogue](https://pdf.archiexpo.com/pdf/bluescope-steel/custom-orb-accent-35/5607-232049.html)
- Monier Elabana concrete tile (Australian spec sheet): about 9.90 tiles/m² coverage, about 11.0 tiles/m² "usage including wastage", recommended head-lap adjustment 80-110 mm — [Monier Elabana spec (A&D attachment)](https://architectureanddesign.com.au/getattachment/54020527-248c-4f54-b1c9-92ea117ac139/attachment.aspx); [Monier Elabana page](https://www.monier.com.au/roof-tiles/concrete/elabana/)
- Elabana tile size and batten spacing (Malaysian BMI data, the same tile): 420 × 330 mm, batten spacing 295-345 mm, minimum overlap 75 mm, about 9.7 tiles/m² at minimum batten spacing — [BMI Elabana Tropical](https://www.bmigroup.com/my/p/monier-elabana-tropical-roof-system-ebony-314805824/)
- Worked example for the same tile: a 345 mm gauge gives about 9.83 tiles/m² and about 2.90 lm of batten per m² — [UTM course material](https://roer.utm.my/mod/resource/view.php?id=904)

### Cited Findings: price ranges (all estimates)
- Sydney, 2026:
  - Colorbond re-roof $92-$205/m²
  - Tile re-roof $115-$255/m²
  - Source: [whatsthedamage Sydney (snippet)](https://whatsthedamage.com.au/roofing-cost-sydney/)
- Brisbane:
  - Colorbond re-roof $80 / $120 / $180 per m² (low / typical / high)
  - Tile re-roof $100 / $150 / $220 per m²
  - Source: [whatsthedamage Brisbane (snippet)](https://whatsthedamage.com.au/roofing-cost-brisbane/roof-replacement/)
- Canberra: tile-to-Colorbond conversion $90-$160/m² — [whatsthedamage Canberra](https://whatsthedamage.com.au/roofing-cost-canberra/)
- Yellow Pages (2024) quotes Colorbond at $18-$37/m². This appears to be material-only and should not be used as an installed rate — [Yellow Pages 2024](https://yellowpages.com.au/articles/roof-restoration-and-repairs/how-much-does-roof-replacement-cost)
- Restoration by roof size, hipages figures quoted by Canstar (undated):
  - small roofs $28-$38/m²
  - medium $22-$28/m²
  - large $17-$22/m²
  - Source: [Canstar](https://www.canstar.com.au/home-loans/roof-restoration-cost/)
  - Other sources give higher figures: Top4 (2026) says roof coating is $35-$80/m² including cleaning and minor repairs — [Top4 2026](https://www.top4.com.au/pressrelease/detail/how-much-does-a-roof-coating-cost-in-australia-2026-price-guide); The Quote Yard says restoration is $35-$75/m² (undated) — [The Quote Yard QLD](https://www.thequoteyard.com.au/services/roofing-services-qld)
- Average-home restoration total: $3,000-$8,000 (Bark 2026) — [Bark AU](https://www.bark.com/en/au/moving-buying-home-hub/roof-replacement-cost/)
- Ridge work, Perth contractor page (undated, low authority):
  - Repointing only $25-$35/lm
  - Full rebed and repoint $40-$80/lm
  - Typical Perth home $1,200-$2,800
  - Source: [Perth roof repairs blog](https://lp260205-0304-roof-repairs-perth-tea3jh.pages.dev/blog/rebedding-vs-repointing-difference)
- Asbestos roof removal (2026 estimates):
  - Sydney licensed bonded removal $50-$80/m² — [whatsthedamage Sydney asbestos](https://whatsthedamage.com.au/roofing-cost-sydney/asbestos-roof-removal/)
  - Central Coast bonded removal $40-$110/m², typically $75/m²; $5,000-$16,000 for a 100-200 m² roof including disposal — [whatsthedamage Central Coast](https://whatsthedamage.com.au/asbestos-removal-cost-central-coast/)
  - TradeRefer $50-$120/m² — [TradeRefer](https://traderefer.au/trades/asbestos-removal)
  - Friable asbestos $100-$160/m², requiring a Class A licence — [whatsthedamage Australia asbestos](https://whatsthedamage.com.au/asbestos-removal-cost-australia/)
  - Sydney removal plus Colorbond re-roof: $25,000-$45,000 for a standard home — [whatsthedamage Sydney asbestos](https://whatsthedamage.com.au/roofing-cost-sydney/asbestos-roof-removal/)
- Asbestos notification: removing more than 10 m² of non-friable asbestos, or any amount of friable asbestos, requires notifying the state WHS regulator beforehand. This is from a cost guide summary; confirm with the regulator or the law-by-state notes — [whatsthedamage asbestos](https://whatsthedamage.com.au/asbestos-removal-cost-australia/)

### Inferences
**Calculator model:**
- Calculate in m². Pitch is entered in degrees.
- Roof surface area = plan area ÷ cos(pitch). The pitch factor is 1/cos(θ): about 1.035 at 15°, 1.064 at 20°, 1.103 at 25°. This is standard trigonometry, not a sourced figure.
- Lineal-metre items:
  - ridge, hip, valley (valley iron)
  - barge (verge on tile roofs)
  - gutter, fascia
  - apron and other flashings
  - downpipes counted per unit with a length
- Metal sheets:
  - sheets per run = ceil(run width ÷ cover width)
  - cover widths: 0.762 m for Custom Orb and Trimdek, 0.700 m for Klip-Lok 700
  - order sheet length = rafter length per run, plus overhang into the gutter
  - output is a cut list (qty × length in mm), not "squares"
- Fasteners: use PAB04's per-sheet-per-support × sheets × supports, with support count = rafter run ÷ batten or purlin spacing. Do not use a flat screws-per-m² default. Use a higher fastener count in cyclonic mode.
- Tiles: default about 9.9 tiles/m² net for a Monier Elabana-type concrete tile, about 11/m² with waste. Make it profile-specific, driven by batten gauge.

**Price book defaults (seed values, flagged as editable):**

| Item | Seed range |
|---|---|
| Colorbond re-roof | $90-$180/m² |
| Tile re-roof | $110-$220/m² |
| Restoration | $20-$40/m² (scales down with roof size) |
| Rebed and repoint | $40-$80/lm |
| Repoint only | $25-$35/lm |
| Asbestos removal (bonded) | $50-$110/m² |

### Gaps
- **Screws per m²** for Custom Orb and Trimdek: not found. Lysaght's installation manual or PAB04 is needed, but lysaght.com is blocked in this session.
- Terracotta tile coverage (for example Bristile, Monier Marseille), slate coverage, standard waste percentages for metal roofing, and sarking or Anticon roll coverage: not found.
- No reliable 2025-2026 figures were found for **roofer or roof plumber hourly labour rates, scaffold or edge-protection hire, skip bin hire, gutter $/lm, downpipe, fascia, skylight or whirlybird pricing**. Searches returned no usable AU data for these.
- Per-state price comparisons are incomplete. Perth, Hobart, Darwin and Adelaide re-roof $/m² figures exist on whatsthedamage, but the pages could not be fetched.

---

## 3. Suppliers and ordering

### Takeaway
BlueScope's Lysaght is the reference metal roofing brand, with standard profiles Custom Orb, Trimdek and Klip-Lok. Products are roll-formed and sold cut to length. Monier (BMI Group) is a primary concrete tile brand. Little verifiable information was found on ordering workflows, lead times or supplier software integrations.

### Cited Findings
- Lysaght (BlueScope) profiles and technical support:
  - Custom Orb, Trimdek, Klip-Lok 700, Spandek and Mini Orb are available in Colorbond and Zincalume steel
  - technical enquiry line 1800 641 417 (per brochure)
  - Sources: [NBS Source Lysaght listings](https://source.thenbs.com/product/lysaght-klip-lok-700-hi-strength-colorbond-steel-zincalume-steel/kS5GWxqs5cJQzBku5oexCg/f2Ku8gk3hLGhKidTfZUbWm); [Lysaght walling brochure](https://wpstaq-ap-southeast-2-media.s3.amazonaws.com/baxterroofing/wp-content/uploads/media/2024/03/LysaghtWallingBrochureApril2016.pdf)
- Lysaght Klip-Lok 700 is retailed through Mitre 10. Bunnings hosts Lysaght technical documents — [Mitre 10 Klip-Lok](https://www.mitre10.com.au/lysaght-klip-lok-700-hi-strength-42mm-3319183); [Bunnings Lysaght PDF](https://media.bunnings.com.au/api/public/content/6c948c3b66b1482495f3cfd516951c26)
- Monier (now part of BMI Group) publishes per-tile specs such as Elabana — [Monier Elabana](https://www.monier.com.au/roof-tiles/concrete/elabana/)

### Inferences
- The price book should hold supplier catalogues with profile, colour (Colorbond colour name), BMT (0.42 / 0.48) and cover width. The order output should be a cut list that can be emailed or exported as PDF or CSV to the local roll-forming distributor.

### Gaps
- No sources were retrieved on Stramit, Metroll, Fielders, Bunnings Trade, Reece or Tradelink ordering processes, roll-forming lead times, or supplier API or software integrations.
- No sources were retrieved on Bristile or Boral tile ranges.

---

## 4. Lead sources and sales process

### Takeaway
The main paid lead channels are hipages (subscription plus per-lead credits, leads shared between several tradies), ServiceSeeking and Oneflare (credit or commission models), and Google Local Services Ads. All prices found are third-party and inconsistent. For quoting, Nearmap, an Australian company, offers aerial roof pitch and area measurement. Roofgraf and RooferPro also appear on Capterra AU.

### Cited Findings
- hipages:
  - monthly subscription about $129-$599/mo, plus $25-$80 per lead connection (another source says $99-$400/mo)
  - leads are shared with up to 3 other tradies
  - competitor marketing sources, estimate only
  - Sources: [tradespro real cost of hipages](https://tradespro-live.pages.dev/blog/real-cost-of-hipages/); [tradiescaler hipages alternatives](https://tradiescaler.pages.dev/lead-generation/hipages-alternatives); [askbaily hipages vs ServiceSeeking](https://askbaily.pages.dev/vs/hipages-vs-serviceseeking)
- Oneflare: sources conflict. One says commission per job, another says lead credits at about AU$3-$25. One source claims it closed in June 2026, which is **unverified** — [askbaily Oneflare](https://askbaily.pages.dev/vs/oneflare); [tradiescaler hipages vs Oneflare](https://tradiescaler.pages.dev/lead-generation/hipages-vs-oneflare)
- ServiceSeeking: pay-per-lead or credits, about $50-$150/mo. Sources conflict on whether a subscription exists — [askbaily hipages vs Oneflare vs ServiceSeeking](https://askbaily.pages.dev/vs/hipages-vs-oneflare-vs-serviceseeking)
- Google Local Services Ads: estimated $20-$60 per lead. Directory platforms: estimated $87-$150+ per booked job — [tradespro tradie lead gen 2026](https://tradespro-live.pages.dev/blog/tradie-lead-generation-2026/)
- Nearmap:
  - founded in Australia in 2007, ASX-listed
  - offers roof pitch, height, width and area measurement from oblique aerial imagery through the MapBrowser web platform
  - 2020 coverage: 89% of Australia's populated areas
  - Sources: [RenewEconomy](https://reneweconomy.com.au/nearmap-offers-complete-aerial-map-measurement-tools-for-solar-and-roofing-industries-97262); [pv magazine 2020](https://www.pv-magazine.com/2020/08/10/digital-prospecting-and-selling-tools-for-rooftop-pv)
- Roofgraf: roof measurement and quoting tool on Capterra AU, 4.8/5 from 4 reviews, priced at USD 79 — [Capterra AU Roofgraf](https://www.capterra.com.au/software/179600/roofgraf)
- RooferPro: includes the "RoofMeasure" free unlimited aerial measurement tool, 5.0/5 from 1 review — [Capterra AU RooferPro](https://www.capterra.com.au/software/162717/rooferpro)
- Homeowners asking hipages vs ServiceSeeking vs Airtasker on OzBargain — [OzBargain](https://ozbargain.com.au/node/889579)

### Inferences
- The CRM needs lead-source tracking with hipages, ServiceSeeking, Oneflare, Google LSA, Google organic, word of mouth, repeat customers, insurance and builder as defaults. It also needs cost-per-lead attribution, since platform fees are significant.
- Support importing aerial measurements: a Nearmap integration or CSV/PDF import of area, pitch and lineal metres. Nearmap is the Australian-native option.

### Gaps
- No primary data was found on: the typical quoting sequence (on-site measure versus desktop), deposit norms, quote presentation formats, or common homeowner concerns.
- No data was found on Metroview, Roofr AU or Hover AU coverage or pricing.
- Deposit caps for residential building contracts are state-legislated (for example the HBCF / domestic building rules). This belongs in the law-by-state notes and was not researched here.

---

## 5. Software used by Australian roofers

### Takeaway
The common job-management tools are ServiceM8 (Australian-built, priced by jobs, unlimited users), Tradify and Fergus (per-user, from NZ), and AroFlo and simPRO (larger teams, higher cost). Every price below is third-party and conflicting. Verify on vendor sites.

### Cited Findings
- ServiceM8:
  - about $29/mo AUD Starter with unlimited users and 50 jobs/month
  - job-based pricing rather than per user
  - another source says from $25/mo
  - named "best for roofers" on price and offline use by one comparison site
  - Sources: [tradiescaler job management](https://tradiescaler.pages.dev/job-management); [tradiescaler best for roofers](https://tradiescaler.pages.dev/job-management/best-job-management-roofers); [softwarehq ServiceM8 vs Tradify](https://softwarehq.pages.dev/compare/servicem8-vs-tradify)
- Tradify:
  - quoted from $35 up to $47-$61 per user per month
  - one detailed page lists Lite at $48/user/month
  - per-seat pricing raises the cost for crews
  - suggested for roofers who also do guttering, fascia and building
  - Sources: [tradiescaler Tradify alternatives](https://tradiescaler.pages.dev/job-management/tradify-alternatives/); [softwarehq Tradify review](https://softwarehq.pages.dev/review/tradify)
- Fergus: Basic $39-$53/mo (sources differ); Essentials $48/user/mo; Pro $72/user/mo; Enterprise tier also listed — [toolradar Fergus pricing](https://toolradar.com/tools/fergus/pricing); [softwarehq Fergus](https://softwarehq.pages.dev/review/fergus)
- AroFlo: about $65-$70/user/mo (lower at 10+ and 30+ users), minimum monthly price $335, add-ons such as GPS at $12/device/mo — [tradiescaler AroFlo alternatives](https://tradiescaler.pages.dev/job-management/aroflo-alternatives); [Software Advice AU AroFlo](https://www.softwareadvice.com.au/software/161893/aroflo)
- simPRO: pricing on application, estimated at $100-$300+/mo (estimate) — [tradiescaler ServiceM8 alternatives](https://tradiescaler.pages.dev/job-management/servicem8-alternatives/)
- NextMinute: roofing-focused, about $159/mo AU. The same page is internally inconsistent, so treat this with caution — [tradiescaler roofer quoting software](https://tradiescaler.pages.dev/quoting-estimating/quoting-software-roofers)
- One source says some vendors list prices in USD, so AUD conversions may be off — [tradiescaler ServiceM8 alternatives](https://tradiescaler.pages.dev/job-management/servicem8-alternatives/)

### Inferences
- Competitive positioning: ServiceM8's job-based, unlimited-user model is the price anchor for small crews. Per-user tools at about $35-$72 AUD per user per month set the upper reference.
- No general tradie tool found here offers a native roof calculator with pitch, sheet cut lists and tile counts. This is the likely differentiation, though no source directly confirms the gap.

### Gaps
- Official AUD pricing pages and Capterra AU UX reviews (pros and cons) for each tool: not retrieved.
- Xero vs MYOB vs QuickBooks market share among tradies: not sourced in this run.
- Buildxact pricing and roofer usage: not found.

---

## 6. Practical localisation details

### Takeaway
These are standard Australian conventions. They are well established, but most were **not re-fetched this session**. The official reference URLs are listed so engineering can verify them.

### Cited Findings ([known reference URL, not fetched this session] unless noted)
- **Time zones:**
  - AEST UTC+10 (QLD, NSW, VIC, TAS, ACT)
  - ACST UTC+9:30 (SA, NT)
  - AWST UTC+8 (WA)
  - Daylight saving (AEDT UTC+11, ACDT UTC+10:30) applies in NSW, VIC, TAS, ACT and SA, from the first Sunday in October to the first Sunday in April
  - QLD, NT and WA have no daylight saving
  - Broken Hill, NSW uses ACST/ACDT
  - Use IANA zones: Australia/Brisbane, Australia/Sydney, Australia/Melbourne, Australia/Adelaide, Australia/Darwin, Australia/Perth, Australia/Hobart
  - Source: [National Measurement Institute – legal time](https://www.industry.gov.au/national-measurement-institute/legal-time-australia) [known reference URL, not fetched this session]
- **Public holidays differ by state.** Examples: Labour Day falls on different dates per state; WA Day; Melbourne Cup Day (VIC metro); King's Birthday is in late September in WA and in October in QLD; Adelaide Cup; NT Picnic Day. Use state-level holiday data — [australia.gov.au public holidays](https://www.australia.gov.au/public-holidays) [known reference URL, not fetched this session]
- **GST** is 10%. Consumer prices must be shown GST-inclusive. A tax invoice of $1,000 or more must show the buyer's identity or ABN. Businesses need an ABN, and GST registration is mandatory above $75k turnover — [ATO tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices) [known reference URL, not fetched this session]
- **Dates** use DD/MM/YYYY. **Currency** is shown as $1,234.56 (AUD). **Addresses** use Street, Suburb STATE Postcode, with a 4-digit postcode and state abbreviations NSW, VIC, QLD, WA, SA, TAS, ACT, NT — [Australia Post addressing guidelines](https://auspost.com.au/business/marketing-and-communications/access-data-and-insights/address-data/addressing-guidelines) [known reference URL, not fetched this session]
- **Mobile numbers** are written 04xx xxx xxx, or +61 4xx xxx xxx in international format. Landlines use area codes 02/03/07/08 — [ACMA numbering](https://www.acma.gov.au/phone-numbers) [known reference URL, not fetched this session]
- **Weather:** the Bureau of Meteorology publishes forecasts and warnings, and a scheduler should flag rain, wind and heat for roof work — [BoM](http://www.bom.gov.au/) [known reference URL, not fetched this session]
- **Trade terms**, observed in the sources above:
  - sarking (roof underlay)
  - Anticon (insulation blanket under metal)
  - barge or verge
  - valley iron
  - flashing
  - ridge capping (tile ridges are "bedded and pointed")
  - fascia
  - downpipe
  - skip bin
  - tradie
  - BMT (base metal thickness, for example 0.42 / 0.48 mm)
  - "rebedding and repointing" — [Vivify Roofing on bedding and pointing](https://www.vivifyroofing.com.au/roof-restoration-melbourne/roof-repointing/); [Bunnings Workshop rebed/repoint thread](https://workshop.bunnings.com.au/t5/Outdoor/Does-my-roof-need-a-repoint-or-rebed/m-p/269156)

### Inferences
- Localisation defaults:
  - en-AU locale, metric only
  - GST-inclusive display, with a toggle for builder/commercial ex-GST quotes
  - invoices titled "Tax Invoice" with the business ABN
  - a state field that drives time zone, public holidays and any state-specific compliance (asbestos notification, licensing, deposits)
- Integrate BoM forecasts into scheduling, with roof-work cut-offs for wind and rain.

### Gaps
- Localisation items were not re-verified with live fetches this run because of the tool budget and blocked hosts. Verify with the official URLs above before shipping.
- No source covered Australian homeowner expectations on quote formats, such as the Good/Better/Best options common in US roofing CRMs.
