// End-to-end: AU estimating (builder E) — company ABN/GST/licences, $0 AU price book + empty state + legacy toggle,
// metric calculator with sheet cut list, good/better/best (Klip-Lok re-cut), GST-inclusive totals, state placeholder,
// public quote with ABN + NSW licence, signed acceptance, satellite measure in m²/degrees, instant quote (AU address, 04xx).
//   BASE_URL=http://localhost:3202 node e2e/au-estimating.js /tmp/shots
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3202";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
const DESIGN_SHOTS = process.env.DESIGN_SHOTS || null; // 1440×960 @2x copies of the main screens
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const moneyNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));

async function noHorizontalScroll(page, what) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(sw <= iw + 1, `${what}: no horizontal scroll at 390px (${sw} <= ${iw})`);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  console.log("1. Sign up + company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Esti Mator");
  await page.fill('input[name="email"]', `au-est${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Harbour Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "0412 345 678");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select id from organizations where name = 'Harbour Roofing ${stamp}'`);
  check(/^[0-9a-f-]{36}$/.test(orgId), "company created");

  console.log("2. Company settings: ABN, GST, licences per state, service states");
  await page.goto(BASE + "/app/settings");
  await page.fill('input[name="abn"]', "12 345 678 901");
  check((await page.$eval('input[name="abn"]', (el) => el.validationMessage)).includes("isn't valid"), "invalid ABN blocked as you type (ATO check digits)");
  await page.fill('input[name="abn"]', "51824753556");
  await page.selectOption('select[name="state"]', "NSW");
  await page.fill('input[name="zip"]', "2026");
  await page.fill('input[name="address"]', "12 Industrial Dr, Alexandria");
  await page.fill('input[name="licence_NSW"]', "123456C");
  await page.fill('input[name="licence_classes_NSW"]', "Roof plumbing, Roof tiling");
  await page.fill('input[name="licence_QLD"]', "QBCC 15012345");
  await page.check('input[name="service_states"][value="NSW"]');
  await page.check('input[name="service_states"][value="QLD"]');
  await page.fill('input[name="min_margin_pct"]', "30");
  await page.click('button:has-text("Save company")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check((await page.inputValue('input[name="abn"]')) === "51 824 753 556", "ABN saved and shown formatted");
  check(sql(`select abn || '|' || gst_registered || '|' || tax_rate || '|' || (licences->'NSW'->>'number') || '|' || array_to_string(service_states, ',') from organizations where id = '${orgId}'`) === "51824753556|true|10.000|123456C|NSW,QLD", "ABN digits, GST, licence and service states stored");
  check(await page.locator('input[name="service_states"][value="QLD"]').isChecked(), "service state QLD ticked after reload");
  await shot(page, "e01-company-settings");

  console.log("3. Price book: AU items at $0, empty state, legacy toggle, prices");
  check(sql(`select count(*) from catalog_items where org_id = '${orgId}'`) === "28", "28 Australian items seeded");
  check(sql(`select count(*) from catalog_items where org_id = '${orgId}' and (unit_price <> 0 or calc_key in ('shingles','permit','dumpster'))`) === "0", "no US items and every price $0");
  sql(`insert into catalog_items (org_id, calc_key, name, unit, unit_price) values ('${orgId}', 'shingles', 'Old US shingles', 'bundle', 42)`);
  await page.goto(BASE + "/app/settings/price-book");
  check(await page.getByText("Set your prices or import a supplier price sheet").isVisible(), "empty state asks to set prices or import a sheet");
  check((await page.locator('input[value="Old US shingles"]').count()) === 0, "legacy item hidden by default");
  await page.click('[data-testid="legacy-toggle"]');
  await page.waitForURL(/legacy=1/);
  check((await page.locator('input[value="Old US shingles"]').count()) === 1, "legacy item shown behind the toggle");
  // Set one price through the UI (Better = COLORBOND Trimdek), the rest in SQL.
  const trimdek = page.locator('[data-testid="price-row"]', { has: page.locator('input[value="COLORBOND Trimdek 0.42 BMT"]') });
  await trimdek.locator('input[name="unit_price"]').fill("27.5");
  await trimdek.locator('input[name="unit_cost"]').fill("17");
  await trimdek.locator('button:has-text("Save")').click();
  await trimdek.getByText("Saved.").waitFor();
  const prices = { metal_sheet_good: [22, 14], metal_sheet_best: [38.5, 24], roof_screws: [110, 70], ridge_capping: [25, 15], barge_capping: [25, 15], sarking: [165, 100], safety_mesh: [220, 140], labour_strip: [22, 14], labour_install: [33, 20], edge_protection: [880, 600], skip_bin: [550, 400] };
  for (const [k, [p, c]] of Object.entries(prices)) {
    const [key, tier] = k.startsWith("metal_sheet_") ? ["metal_sheet", k.slice(12)] : [k, null];
    sql(`update catalog_items set unit_price = ${p}, unit_cost = ${c} where org_id = '${orgId}' and calc_key = '${key}' and tier ${tier ? `= '${tier}'` : "is null"}`);
  }
  await page.goto(BASE + "/app/settings/price-book");
  check(!(await page.getByText("Set your prices or import a supplier price sheet").count()), "empty state gone once prices are set");
  check(sql(`select unit_price from catalog_items where org_id = '${orgId}' and calc_key = 'metal_sheet' and tier = 'better'`) === "27.50", "Trimdek price saved from the UI");
  await page.fill('input[name="metal_m2_low"]', "100");
  await page.fill('input[name="metal_m2_high"]', "150");
  await page.fill('input[name="tile_m2_low"]', "120");
  await page.fill('input[name="tile_m2_high"]', "180");
  await page.click('button:has-text("Save rates")');
  await page.getByText("Saved.").first().waitFor();
  check(sql(`select instant_quote->>'metal_m2_high' from organizations where id = '${orgId}'`) === "150", "instant quote $/m² rates saved");
  await shot(page, "e02-price-book");

  console.log("4. Customer + NSW job");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Nora Homeowner");
  await page.fill('input[name="phone"]', "0412 555 123");
  await page.fill('input[name="email"]', "nora@example.com");
  await page.fill('input[name="address"]', "12 Ocean St");
  await page.fill('input[name="city"]', "Bondi");
  await page.fill('input[name="job_title"]', "Tile to COLORBOND re-roof");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobId = page.url().split("/").pop();
  // The customer form (not this builder's) still limits state to 2 letters; set the AU state directly.
  sql(`update jobs set state = 'NSW', zip = '2026' where id = '${jobId}'`);
  sql(`update customers set state = 'NSW', zip = '2026' where id = (select customer_id from jobs where id = '${jobId}')`);

  console.log("5. Quote: metric calculator, cut list, options, GST");
  await page.click('button:has-text("New quote")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  const estUrl = page.url();
  const estId = estUrl.split("/").pop();
  check(sql(`select gst_inclusive || '|' || tax_rate from estimates where id = '${estId}'`) === "true|10.000", "new quote is GST-inclusive at 10%");
  check((await page.locator('[data-testid="compliance-state"]').innerText()).includes("New South Wales"), "state compliance panel shows the job's state");
  check(await page.locator('[data-testid="quote-business"]').getByText("ABN 51 824 753 556").isVisible(), "quote header shows ABN");
  check(await page.locator('[data-testid="quote-licence"]').innerText().then((t) => t.includes("NSW licence 123456C")), "quote header shows the NSW licence");
  await page.fill('input[aria-label="Section name"]', "Front");
  await page.fill('input[aria-label="Plan area m²"]', "60");
  await page.fill('input[aria-label="Pitch degrees"]', "22.5");
  await page.fill('input[aria-label="Sheet run m"]', "6.5");
  await page.fill('input[aria-label="Section width m"]', "10");
  await page.click('button:has-text("+ Add section")');
  await page.locator('input[aria-label="Section name"]').nth(1).fill("Back");
  await page.locator('input[aria-label="Plan area m²"]').nth(1).fill("60");
  await page.locator('input[aria-label="Sheet run m"]').nth(1).fill("6.5");
  await page.locator('input[aria-label="Section width m"]').nth(1).fill("10");
  await page.fill('input[aria-label="Ridge lm"]', "10");
  await page.fill('input[aria-label="Barge lm"]', "26");
  check((await page.locator('[data-testid="true-area"]').innerText()).includes("129.89"), "true area = plan ÷ cos(22.5°) = 129.89 m²");
  check((await page.locator('[data-testid="cut-list"]').innerText()).includes("14 × 6,550 mm"), "cut list: 14 sheets × 6,550 mm per face");
  // rise/run helper: 250 over 1000 -> 14.04°
  await page.locator('button:has-text("Enter pitch as rise / run")').first().click();
  await page.fill('input[aria-label="Rise"]', "250");
  await page.fill('input[aria-label="Run"]', "1000");
  await page.click('button:has-text("Use 14.04°")');
  check((await page.locator('input[aria-label="Pitch degrees"]').first().inputValue()) === "14.04", "rise/run converts to degrees");
  await page.locator('input[aria-label="Pitch degrees"]').first().fill("22.5");
  await page.check('input[aria-label="Pre-1990 or asbestos suspected"]');
  check(await page.locator('[data-testid="asbestos-warning"]').innerText().then((t) => t.includes("licensed asbestos removalist")), "asbestos warning when pre-1990 is ticked");
  await page.uncheck('input[aria-label="Pre-1990 or asbestos suspected"]');
  await page.check('input[aria-label="Offer options"]');
  await page.click('button:has-text("Fill line items from measurements")');
  await page.getByText(/Filled \d+ lines/).waitFor();
  const optionLines = page.locator('[data-testid="option-lines"]');
  const qtyOf = async (group, desc) => Number(await optionLines.nth(group).locator('[data-testid="line-row"]', { has: page.locator(`input[value="${desc}"]`) }).locator('input[aria-label="Quantity"]').inputValue());
  check((await qtyOf(0, "ZINCALUME Custom Orb 0.42 BMT")) === 183.4, "Good: ZINCALUME Custom Orb 183.4 lm");
  check((await qtyOf(1, "COLORBOND Trimdek 0.42 BMT")) === 183.4, "Better: COLORBOND Trimdek 183.4 lm");
  check((await qtyOf(2, "COLORBOND Klip-Lok 700 0.48 BMT")) === 196.5, "Best: Klip-Lok re-cut for 700 mm cover, 196.5 lm");
  const shared = await page.locator('[data-testid="shared-lines"] input[aria-label="Description"]').evaluateAll((els) => els.map((e) => e.value));
  check(["Roofing screws (box)", "Sarking (roll)", "Safety mesh (roll)", "Strip & dispose of old roof", "Installation labour", "Edge protection / scaffold", "Skip bin"].every((d) => shared.includes(d)), "shared lines: screws, sarking, mesh, strip, install, edge protection, skip bin");
  const betterRow = page.locator('[data-testid="option-total"]', { hasText: "Better" });
  const betterTotal = moneyNum(await betterRow.locator("td").nth(1).innerText());
  const betterGst = moneyNum(await betterRow.locator("td").nth(2).innerText());
  check(Math.abs(betterGst - Math.round((betterTotal / 11) * 100) / 100) < 0.011, `Better GST is 1/11 of the GST-inclusive total (${betterTotal} / ${betterGst})`);
  await page.click('button:has-text("Save quote")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check((await page.locator('[data-testid="option-card"]').count()) === 3, "options persisted");
  const dbBetter = Number(sql(`select t.total from estimate_option_totals t join estimate_options o on o.id = t.option_id where o.estimate_id = '${estId}' and o.name = 'Better'`));
  check(Math.abs(dbBetter - betterTotal) < 0.011, `SQL option total matches the editor (${dbBetter})`);
  check(sql(`select measurements->>'units' || '|' || (measurements->'sections'->0->>'runLength') from estimates where id = '${estId}'`) === "metric|6.5", "metric measurements saved");
  await shot(page, "e03-quote-editor");

  console.log("6. Satellite measure in m² and degrees");
  await page.goto(BASE + `/app/measure/${estId}`);
  check(await page.getByText("m² true roof area").isVisible(), "satellite totals in m²");
  await page.locator('button:has-text("+ Trace a facet")').waitFor();
  await shot(page, "e04-satellite-measure");

  console.log("7. Send; homeowner sees ABN, licence, GST-inclusive prices; signs Better");
  await page.goto(estUrl);
  await page.click('button:has-text("Mark as sent")');
  await page.getByText("Send this link").waitFor();
  const publicHref = await page.locator('a:has-text("Customer view")').getAttribute("href");
  const pub = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const cpage = await pub.newPage();
  cpage.on("pageerror", (e) => errors.push(e.message));
  await cpage.goto(BASE + publicHref);
  check(await cpage.getByText("ABN 51 824 753 556").isVisible(), "public quote shows ABN");
  check(await cpage.getByText("NSW licence 123456C").isVisible(), "public quote shows the NSW licence");
  check(await cpage.getByText("12 Ocean St, Bondi NSW 2026").isVisible(), "customer address in AU order");
  check((await cpage.getByText(/Includes GST of \$/).count()) >= 3, "each option says 'Includes GST of $X'");
  check(await cpage.locator('[data-testid="price-basis"]').innerText().then((t) => t.includes("Australian dollars and include GST")), "prices stated as AUD incl. GST");
  check((await cpage.getByText(/m²/).count()) >= 1, "metric units shown");
  await cpage.screenshot({ path: `${SHOTS}/e05-public-quote.png`, fullPage: true });
  await cpage.fill('input[name="name"]', "Nora Homeowner");
  const sig = await cpage.locator('canvas[aria-label^="Signature"]').boundingBox();
  await cpage.mouse.move(sig.x + 20, sig.y + sig.height / 2);
  await cpage.mouse.down();
  for (let i = 1; i <= 12; i++) await cpage.mouse.move(sig.x + 20 + i * 18, sig.y + sig.height / 2 + (i % 2 ? -25 : 25));
  await cpage.mouse.up();
  await cpage.check('input[name="agree"]');
  await cpage.click('button:has-text("Accept")');
  await cpage.getByText("Your acceptance has been recorded").waitFor();
  check(sql(`select e.status || '|' || o.name from estimates e join estimate_options o on o.id = e.selected_option_id where e.id = '${estId}'`) === "accepted|Better", "accepted with Better selected");
  check(Math.abs(Number(sql(`select total from estimate_totals where estimate_id = '${estId}'`)) - betterTotal) < 0.011, "accepted total = Better total incl. GST");
  check(sql(`select jsonb_typeof(legal_notices) from estimates where id = '${estId}'`) === "array", "legal_notices snapshot kept (empty until AU rules land)");
  await cpage.screenshot({ path: `${SHOTS}/e06-public-accepted.png`, fullPage: false });

  console.log("8. Instant quote: AU address, postcode -> state, m², degrees, 04xx phone");
  const key = sql(`select intake_key from organizations where id = '${orgId}'`);
  const qpage = await pub.newPage();
  await qpage.goto(BASE + `/quote/${key}`);
  await qpage.fill('input[aria-label="Street address"]', "3 Gum Rd");
  await qpage.fill('input[aria-label="Suburb"]', "Paddington");
  await qpage.fill('input[aria-label="Postcode"]', "4064");
  check((await qpage.inputValue('select[aria-label="State"]')) === "QLD", "postcode 4064 defaults the state to QLD");
  await qpage.fill('input[aria-label="House floor area m²"]', "200");
  check((await qpage.locator('[data-testid="quote-range"]').innerText()).includes("$24,900 – $37,400"), "range from 200 m² floor, medium pitch: $24,900 – $37,400 inc GST");
  await qpage.click('label:has-text("Tiles")');
  check((await qpage.locator('[data-testid="quote-range"]').innerText()).includes("$29,900 – $44,800"), "tile rates change the range");
  check((await qpage.getByText("15–30°").count()) === 1, "pitch picker shows degree ranges");
  await qpage.fill('input[aria-label="Your name"]', "Wes Webb");
  await qpage.fill('input[aria-label="Mobile"]', "555-0100");
  check(await qpage.getByText("Enter an Australian number").isVisible(), "non-Australian phone flagged");
  await qpage.screenshot({ path: `${SHOTS}/e07-instant-quote.png`, fullPage: true });
  await qpage.click('button:has-text("Get my price")');
  await qpage.getByText("Enter an Australian phone number").waitFor();
  check(true, "server rejects the non-AU phone");
  await qpage.fill('input[aria-label="Mobile"]', "0412 345 678");
  await qpage.click('button:has-text("Get my price")');
  await qpage.locator('[data-testid="quote-done"]').waitFor();
  check(sql(`select j.state || '|' || j.zip || '|' || c.city from jobs j join customers c on c.id = j.customer_id where j.org_id = '${orgId}' and c.name = 'Wes Webb'`) === "QLD|4064|Paddington", "lead filed with suburb, 3-letter state and postcode");

  console.log("9. Phone width (390px)");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await mctx.newPage();
  for (const [path, what] of [[`/app/estimates/${estId}`, "quote editor"], ["/app/settings/price-book", "price book"], ["/app/settings", "company settings"], [`/app/measure/${estId}`, "satellite measure"], [publicHref, "public quote"], [`/quote/${key}`, "instant quote"]]) {
    await mp.goto(BASE + path);
    await mp.waitForLoadState("networkidle").catch(() => {});
    await noHorizontalScroll(mp, what);
  }
  await mp.goto(BASE + publicHref);
  await mp.screenshot({ path: `${SHOTS}/e08-mobile-public-quote.png`, fullPage: false });

  if (DESIGN_SHOTS) {
    console.log("10. 1440×960 @2x screenshots");
    const dp = await (await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })).newPage();
    for (const [path, name] of [[`/app/estimates/${estId}`, "editor"], ["/app/settings/price-book", "price-book"], ["/app/settings", "company"], [`/app/measure/${estId}`, "measure"], [publicHref, "public-quote"], [`/quote/${key}`, "instant-quote"]]) {
      await dp.goto(BASE + path);
      await dp.waitForLoadState("networkidle").catch(() => {});
      await dp.screenshot({ path: `${DESIGN_SHOTS}/estimating-${name}.png`, fullPage: false });
    }
    check(true, "design screenshots saved");
  }

  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await browser.close();
  console.log("\nAU ESTIMATING E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
