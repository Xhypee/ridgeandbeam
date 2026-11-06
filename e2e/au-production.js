// End-to-end: AU production, field & homeowner portal (builder P).
// Crew pay sheet in $/m² -> metric crew pay on the production page -> posted to job cost in m²;
// readiness gates in Australian words (council / building approval, strata, skip bin, colour & profile);
// printable work order in metric; plain-English crew portal (no language switch, SWMS, old roof to strip);
// field storm-damage photo categories + broken-tile count -> photo report; homeowner portal with an AU claim stage;
// AU job types; hosted lead form with Suburb / State / Postcode.
//   BASE_URL=http://localhost:3206 node e2e/au-production.js /tmp/shots
//   DESIGN_SHOTS=<dir> also writes 1440×900 @2x copies of the key screens as production-*.png
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3206";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
const DESIGN_SHOTS = process.env.DESIGN_SHOTS || null;
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sql = (q) => execSync(`psql "${DB}" -q -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(q.replace(/\s+/g, " "))}`).toString().trim();
const moneyNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
const r2 = (n) => Math.round(n * 100) / 100;
const trueArea = (plan, deg) => plan / Math.cos((deg * Math.PI) / 180);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function noHorizontalScroll(page, what) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(sw <= iw + 1, `${what}: no horizontal scroll at 390px (${sw} <= ${iw})`);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, locale: "en-AU", timezoneId: "Australia/Sydney" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  // Desktop design shots at 1440×900 @2x, same session cookies.
  let design = null;
  const designShot = async (url, name, opts = {}) => {
    if (!DESIGN_SHOTS) return;
    if (!design) design = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en-AU", timezoneId: "Australia/Sydney", storageState: await ctx.storageState() });
    const p = await design.newPage();
    await p.goto(url);
    if (opts.wait) await p.locator(opts.wait).first().waitFor();
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.screenshot({ path: `${DESIGN_SHOTS}/${name}.png`, fullPage: Boolean(opts.full) });
    await p.close();
  };

  console.log("1. Sign up + Australian company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Paula Production");
  await page.fill('input[name="email"]', `au-prod${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Ironbark Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "02 9555 0100");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select id from organizations where name = 'Ironbark Roofing ${stamp}'`);
  check(/^[0-9a-f-]{36}$/.test(orgId), "company created");
  sql(`update organizations set abn = '51824753556', state = 'NSW', zip = '2026', licences = '{"NSW": {"number": "123456C"}}'::jsonb where id = '${orgId}'`);
  const intakeKey = sql(`select intake_key from organizations where id = '${orgId}'`);

  console.log("2. Crew pay sheet in $/m²");
  await page.goto(BASE + "/app/settings/crews");
  await page.fill('input[placeholder^="Crew name"]', "Dave's crew");
  await page.click('form:has(input[placeholder^="Crew name"]) button:has-text("Add")');
  await page.getByText("Crew added.").waitFor();
  await page.reload();
  const crewForm = page.locator('form:has(input[name="pay_rate_m2"])').first();
  check((await page.locator('select[name="language"]').count()) === 0, "no work-order language picker");
  check(await crewForm.getByText("Install rate ($/m²)").isVisible(), "install rate labelled $/m²");
  check(await crewForm.getByText("New gutter ($/lm)").isVisible(), "gutter rate labelled $/lm");
  check(await crewForm.getByText("Sections over 25°").isVisible(), "steep adder uses the estimate's 25° steep setting");
  await crewForm.locator('input[name="phone"]').fill("0412 345 678");
  await crewForm.locator('input[name="pay_rate_m2"]').fill("12");
  await crewForm.locator('input[name="pay_steep_m2"]').fill("3");
  await crewForm.locator('input[name="pay_high_steep_m2"]').fill("6");
  await crewForm.locator('input[name="pay_strip_m2"]').fill("4.5");
  await crewForm.locator('input[name="pay_gutter_lm"]').fill("9");
  await crewForm.locator('button:has-text("Save crew")').click();
  await page.getByText("Crew saved.").waitFor();
  const crewRow = sql(`select id || '|' || public_token || '|' || pay_rate_m2 || '|' || pay_low_slope_m2 || '|' || pay_steep_m2 || '|' || pay_high_steep_m2 || '|' || pay_strip_m2 || '|' || pay_gutter_lm from crews where org_id = '${orgId}'`).split("|");
  const [crewId, crewToken] = crewRow;
  check(crewRow.slice(2).join("|") === "12.00|0.00|3.00|6.00|4.50|9.00", "pay sheet stored in the metric columns");
  await shot(page, "p01-crews");
  await designShot(BASE + "/app/settings/crews", "production-crew-pay-sheet");

  console.log("3. Seed an accepted tile-to-metal job (metric measurements)");
  const start = new Date();
  start.setDate(start.getDate() + 5);
  while ([0, 6].includes(start.getDay())) start.setDate(start.getDate() + 1);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  while ([0, 6].includes(end.getDay())) end.setDate(end.getDate() + 1);
  const custId = sql(`insert into customers (org_id, name, phone, email, address, city, state, zip) values ('${orgId}', 'Mia Nguyen', '0423 555 018', 'mia@example.com', '14 Wattle St', 'Ryde', 'NSW', '2112') returning id`);
  const jobId = sql(`insert into jobs (org_id, customer_id, title, job_type, stage, state, zip, site_address, crew_id, scheduled_start, scheduled_end, gate_code, site_hazards, delivery_type, is_insurance)
    values ('${orgId}', '${custId}', 'Tile-to-metal re-roof, Trimdek', 'tile_to_metal', 'sold', 'NSW', '2112', '14 Wattle St, Ryde NSW 2112', '${crewId}', '${iso(start)}', '${iso(end)}', '2468',
            'Power line over the garage. Asbestos eaves lining — do not drill.', 'ground_drop', true) returning id`);
  const measurements = {
    units: "metric", jobType: "tile_to_metal", existingRoof: "tile", wastePct: 10, eave: 46, ridge: 18, hip: 0, valley: 6, barge: 22, apron: 4,
    includeGutters: true, includeSarking: true, includeSafetyMesh: true, includeEdgeProtection: true, includeSkip: true,
    sections: [
      { label: "Main", area: 140, pitch: 22.5, system: "metal", profile: "trimdek" },
      { label: "Verandah", area: 12, pitch: 5, system: "metal", profile: "trimdek" },
      { label: "Front gable", area: 25, pitch: 32, system: "metal", profile: "trimdek" },
    ],
  };
  const estId = sql(`insert into estimates (org_id, job_id, status, accepted_at, measurements) values ('${orgId}', '${jobId}', 'accepted', now(), '${JSON.stringify(measurements)}'::jsonb) returning id`);
  sql(`insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key) values
    ('${orgId}', '${estId}', 1, 'COLORBOND Trimdek 0.42 BMT, Monument', 268, 'lm', 38, 24, 'material', 'metal_sheet'),
    ('${orgId}', '${estId}', 2, 'Sarking, Anticon 60', 6, 'roll', 210, 150, 'material', 'sarking'),
    ('${orgId}', '${estId}', 3, 'Ridge capping, Monument', 19, 'lm', 22, 12, 'material', 'ridge_capping'),
    ('${orgId}', '${estId}', 4, 'Strip & dispose of old roof', 200, 'm2', 18, 9, 'labor', 'labour_strip')`);
  check(/^[0-9a-f-]{36}$/.test(estId), "accepted estimate with metric measurements");

  // Expected crew pay, worked out independently: base on all true area, steep on the 32° gable, strip on all, gutters per lm.
  const aMain = trueArea(140, 22.5), aVer = trueArea(12, 5), aGable = trueArea(25, 32);
  const area = r2(aMain + aVer + aGable);
  const expected = r2(r2(r2(aMain + aVer + aGable) * 12) + r2(r2(aGable) * 3) + r2(area * 4.5) + r2(46 * 9));

  console.log("4. Production page: AU readiness gates + metric crew pay");
  await page.goto(`${BASE}/app/jobs/${jobId}/production`);
  for (const t of ["Council / building approval", "Strata / body corporate approval", "Colour & profile confirmed with the homeowner", "Skip bin", "Deposit"]) {
    check(await page.getByText(t, { exact: true }).first().isVisible(), `readiness row "${t}"`);
  }
  const body = await page.locator("main").innerText();
  check(!/\bHOA\b|Dumpster|Shingle|squares?\b|\bsq\b/i.test(body), "no HOA / dumpster / shingle / squares wording");
  check(await page.getByTestId("approval-state-slot").getByText("New South Wales").isVisible(), "council approval points at the state rules slot (no hard-coded law)");
  check(await page.locator('form:has(input[name="field"][value="dumpster_status"]) button[value="ordered"]').innerText() === "Booked", "skip bin status buttons in Australian words");
  check(await page.locator('form:has(input[name="field"][value="permit_status"]) button[value="applied"]').innerText() === "Lodged", "approval status 'Lodged'");
  await page.click('form:has(input[name="field"][value="dumpster_status"]) button[value="ordered"]');
  await page.locator('form:has(input[name="field"][value="dumpster_status"]) button[value="ordered"][aria-pressed="true"]').waitFor();
  check(sql(`select dumpster_status from jobs where id = '${jobId}'`) === "ordered", "skip bin booked (enum value kept)");
  check(await page.locator('input[name="shingle_color"]').getAttribute("placeholder") === "e.g. COLORBOND Monument, Trimdek", "colour / profile placeholder");
  await page.fill('input[name="shingle_color"]', "COLORBOND Monument, Trimdek");
  await page.fill('input[name="permit_number"]', "CDC-2026-0412");
  await page.click('button:has-text("Save details")');
  await page.getByText("Saved.").first().waitFor();
  const basis = await page.getByTestId("crew-pay-basis").innerText();
  check(basis.includes(`${area} m² of true roof area`), `crew pay on ${area} m² true area`);
  const payTable = await page.locator('table:has([data-testid="crew-pay-total"])').innerText();
  check(/Install \(true roof area\)/.test(payTable) && /Steep adder \(over 25°\)/.test(payTable) && /Strip old roof \(tiles\)/.test(payTable) && /New gutter/.test(payTable), "pay lines: install, steep, strip, gutter");
  check(/m² × \$12\.00\/m²/.test(payTable) && /46 lm × \$9\.00\/lm/.test(payTable), "quantities in m² and lm with $/m² and $/lm rates");
  check(!/Very steep/.test(payTable), "no very-steep line (nothing at 40°+)");
  const shownTotal = moneyNum(await page.getByTestId("crew-pay-total").innerText());
  check(Math.abs(shownTotal - expected) < 0.011, `crew pay total ${shownTotal} = ${expected}`);
  await page.click('button:has-text("Post crew pay to job cost")');
  await page.getByText("Crew pay posted to job cost.").waitFor();
  const cost = sql(`select amount || '|' || description || '|' || category from job_costs where job_id = '${jobId}' and source = 'crew_pay'`).split("|");
  check(Math.abs(Number(cost[0]) - expected) < 0.011 && cost[1].startsWith(`Crew pay: ${area} m² — Install`) && cost[2] === "labor", "crew pay posted to job cost in m²");
  await page.reload();
  await shot(page, "p02-production");
  await designShot(`${BASE}/app/jobs/${jobId}/production`, "production-readiness", { full: true });

  console.log("5. Printable work order in metric");
  await page.goto(`${BASE}/app/jobs/${jobId}/production/work-order`);
  const wo = await page.getByTestId("work-order").innerText();
  check(wo.includes(`${area} m²`) && wo.includes("5–32°") && /Tiles/.test(wo) && wo.includes("Metal — Trimdek"), "roof area m², pitch range in degrees, old roof tiles, Trimdek");
  check(wo.includes("Sarking · Safety mesh · Edge protection · Skip bin · New gutters & downpipes"), "sarking, safety mesh, edge protection, skip bin listed");
  check(wo.includes("268 lm") && wo.includes("6 roll"), "materials in lm / rolls, no prices");
  check(!/\$\d/.test(wo), "work order shows no prices");
  check(/SWMS/.test(await page.getByTestId("work-order-safety").innerText()), "SWMS reminder on the work order");
  check(!/\/ Trabajo|Orden de trabajo|Español|squares/i.test(wo), "no Spanish or squares");
  await designShot(`${BASE}/app/jobs/${jobId}/production/work-order`, "production-work-order", { full: true });

  console.log("6. Crew portal: plain English, metric, SWMS");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "en-AU", timezoneId: "Australia/Sydney" });
  const cp = await phone.newPage();
  cp.on("pageerror", (e) => errors.push(e.message));
  await cp.goto(`${BASE}/w/${crewToken}`);
  check(await cp.getByText("Dave's crew").first().isVisible(), "crew portal opens");
  check((await cp.locator('[aria-label="Language"]').count()) === 0, "no EN/ES language switch");
  await cp.click("text=14 Wattle St");
  await cp.waitForURL(new RegExp(`/w/${crewToken}/${jobId}$`));
  const roofText = await cp.getByTestId("crew-roof").innerText();
  check(roofText.includes(`${area} m²`) && roofText.includes("Old roof to strip") && roofText.includes("Tiles") && roofText.includes("5–32°"), "crew sees m², pitch in degrees and the old roof to strip");
  check(roofText.includes("Booked"), "skip bin status for the crew");
  check(await cp.getByText("Edge protection", { exact: true }).isVisible(), "edge protection chip");
  check(/SWMS/.test(await cp.getByTestId("crew-safety").innerText()), "SWMS reminder");
  check(await cp.getByText("Asbestos eaves lining").isVisible(), "site hazards shown");
  await noHorizontalScroll(cp, "crew job");
  await cp.click("text=Problem / missing material");
  await cp.check('input[name="kind"][value="damage_found"]');
  check(await cp.getByText("Damage found (battens, sarking, etc.)").isVisible(), "problem kinds in AU terms");
  await cp.fill('textarea[name="message"]', "Rotten battens on the rear slope, about 12 lm");
  await cp.click('button:has-text("Send to office")');
  await cp.getByText("Sent. The office has been told.").waitFor();
  check(sql(`select count(*) from job_notes where job_id = '${jobId}' and body like '[Crew report] Damage found (battens, sarking, etc.): Rotten battens%'`) === "1", "crew problem lands as a job note");
  await cp.screenshot({ path: `${SHOTS}/p03-crew-job-phone.png`, fullPage: true });
  await designShot(`${BASE}/w/${crewToken}/${jobId}`, "production-crew-portal", { full: true });

  console.log("7. Field: storm-damage categories + broken-tile count");
  await page.goto(`${BASE}/app/jobs/${jobId}/field`);
  const cats = await page.getByTestId("damage-categories").innerText();
  for (const c of ["Broken / cracked tiles", "Ridge capping", "Lifted / rusted sheets", "Hail dents (metal)", "Gutters & downpipes", "Water damage inside"]) check(cats.includes(c), `damage category "${c}"`);
  const fieldText = await page.locator("main").innerText();
  check(!/test square|10×10|carrier|adjuster|hits per square/i.test(fieldText), "no US test squares / carrier wording");
  await page.click('button:has-text("Rear")');
  await page.click('button:has-text("Broken / cracked tiles")');
  check(await page.getByTestId("tile-counter").isVisible(), "broken-tile counter shows for tile photos");
  check(/assessor/i.test(await page.getByTestId("category-hint").innerText()) || (await page.getByTestId("category-hint").innerText()).includes("Count them per slope"), "capture hint for the assessor");
  for (let i = 0; i < 7; i++) await page.click('button[aria-label="One more broken tile"]');
  await page.click('button[aria-label="One less broken tile"]');
  check((await page.locator('output[aria-label="Broken tile count"]').innerText()) === "6", "count 6 broken tiles on the rear slope");
  const jpg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#8a3b1e"; g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#f5e9d8"; g.font = "120px sans-serif"; g.fillText("Cracked tiles", 200, 640);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  });
  await page.setInputFiles('[data-testid="photo-input"]', [{ name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") }]);
  await page.locator('[data-testid="tile"]').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tile"] [data-testid="chip"]').length > 0 &&
    [...document.querySelectorAll('[data-testid="tile"] [data-testid="chip"]')].every((c) => c.textContent === "Uploaded"), null, { timeout: 20000 });
  check(await page.locator('[data-testid="tile"]').first().getByText("6 broken").isVisible(), "photo tile shows 6 broken");
  check(sql(`select category || '|' || slope || '|' || test_square_hits from job_files where job_id = '${jobId}' and kind = 'photo'`) === "broken_tiles|rear|6", "stored as broken_tiles, rear slope, count 6");
  await shot(page, "p04-field");
  await designShot(`${BASE}/app/jobs/${jobId}/field`, "production-field", { wait: '[data-testid="tile"]', full: true });

  await page.goto(`${BASE}/app/jobs/${jobId}/field/report`);
  check(await page.getByRole("heading", { name: "Storm damage photo report" }).isVisible(), "storm damage photo report");
  check((await page.getByTestId("tile-total").innerText()) === "6", "report totals broken tiles per slope");
  check(await page.getByText("Prepared for the insurer's assessor").isVisible(), "report written for the assessor");
  check(await page.getByText("ABN 51 824 753 556 · NSW licence 123456C").isVisible(), "report header has ABN and NSW licence");
  await designShot(`${BASE}/app/jobs/${jobId}/field/report`, "production-photo-report", { full: true });

  console.log("8. Homeowner portal with an Australian claim stage");
  const claimId = sql(`insert into claims (org_id, job_id, carrier, claim_number, stage, excess, approved_amount, settlement_path, event_type, lodged_on)
    values ('${orgId}', '${jobId}', 'NRMA Insurance', 'NRMA-26-88123', 'scope_received', 750, 18500, 'own_builder', 'hail', current_date - 20) returning id`);
  sql(`insert into claim_checks (org_id, claim_id, kind, payer, expected_amount, received_amount) values ('${orgId}', '${claimId}', 'scope', 'carrier', 17750, 10000), ('${orgId}', '${claimId}', 'excess', 'homeowner', 750, 750)`);
  sql(`update job_files set shared_with_homeowner = true where job_id = '${jobId}'`);
  sql(`insert into job_events (org_id, job_id, kind, note, visible_to_homeowner) values ('${orgId}', '${jobId}', 'materials_delivered', 'Sheets on the nature strip', true)`);
  const portalToken = sql(`select public_token from jobs where id = '${jobId}'`);
  const hp = await phone.newPage();
  hp.on("pageerror", (e) => errors.push(e.message));
  await hp.goto(`${BASE}/p/${portalToken}`);
  check((await hp.getByTestId("claim-stage").innerText()) === "The insurer has sent its scope of works", "claim stage in plain AU words (auStage + CLAIM_STAGE_PLAIN)");
  const claimText = await hp.getByTestId("portal-claim").innerText();
  check(claimText.includes("NRMA Insurance") && claimText.includes("$750.00") && claimText.includes("$18,500.00") && claimText.includes("$10,000.00") && claimText.includes("$7,750.00"), "excess, approved, received and still expected from the insurer");
  check(claimText.includes("Own builder (approved)"), "settlement path shown");
  check(await hp.getByTestId("claim-explainer").isVisible(), "ClaimExplainer (excess, cash settlement, AFCA) reused");
  check((await hp.getByTestId("portal-business").innerText()) === "ABN 51 824 753 556 · NSW licence 123456C", "business ABN + NSW licence in the header");
  const portalText = await hp.locator("main").innerText();
  check(!/deductible|depreciation|mortgage|adjuster|Dry-in|Tear-off|magnet|License #/i.test(portalText), "no US claim or build wording");
  check(portalText.includes("Council / building approval") && portalText.includes("Watertight"), "milestones in AU words");
  await noHorizontalScroll(hp, "homeowner portal");
  await hp.screenshot({ path: `${SHOTS}/p05-portal-phone.png`, fullPage: true });
  if (DESIGN_SHOTS) {
    const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en-AU", timezoneId: "Australia/Sydney" });
    const dp = await d.newPage();
    await dp.goto(`${BASE}/p/${portalToken}`);
    await dp.waitForLoadState("networkidle").catch(() => {});
    await dp.screenshot({ path: `${DESIGN_SHOTS}/production-homeowner-portal.png`, fullPage: true });
    await d.close();
  }

  console.log("9. AU job types + hosted lead form (Suburb / State / Postcode)");
  await page.goto(`${BASE}/app/jobs/${jobId}`);
  const types = await page.locator('select[name="job_type"] option').allInnerTexts();
  check(["Re-roof", "Tile-to-metal re-roof", "Roof restoration", "Repair / leak", "Gutters & downpipes", "Asbestos roof replacement", "New build"].every((t) => types.includes(t)), "Australian job types");
  check((await page.inputValue('select[name="job_type"]')) === "tile_to_metal", "tile_to_metal stored in the job_type enum");
  check((await page.locator('input[name="roof_material"]').getAttribute("placeholder")).startsWith("COLORBOND Trimdek"), "roof material placeholder");
  const lead = await phone.newPage();
  await lead.goto(`${BASE}/l/${intakeKey}?source=hipages`);
  for (const l of ["Suburb", "State", "Postcode"]) check(await lead.getByText(l, { exact: true }).isVisible(), `lead form field "${l}"`);
  check((await lead.getByText("ZIP", { exact: true }).count()) === 0 && (await lead.getByText("City", { exact: true }).count()) === 0, "no City / ZIP");
  await lead.fill('input[name="name"]', "Liam Carter");
  await lead.fill('input[name="phone"]', "0433 555 210");
  await lead.fill('input[name="address"]', "3 Banksia Rd");
  await lead.fill('input[name="city"]', "Toowong");
  await lead.selectOption('select[name="state"]', "QLD");
  await lead.fill('input[name="zip"]', "4066");
  await lead.click('button:has-text("Request inspection")');
  await lead.getByText("we got your request").waitFor();
  check(sql(`select city || '|' || state || '|' || zip from customers where org_id = '${orgId}' and name = 'Liam Carter'`) === "Toowong|QLD|4066", "suburb in city, QLD state, postcode in zip");
  check(sql(`select lead_source from jobs j join customers c on c.id = j.customer_id where c.name = 'Liam Carter' and j.org_id = '${orgId}'`) === "hipages", "hipages lead source kept");
  await noHorizontalScroll(lead, "lead form");

  await phone.close();
  if (design) await design.close();
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
  console.log("AU PRODUCTION E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
