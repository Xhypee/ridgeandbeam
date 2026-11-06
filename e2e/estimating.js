// End-to-end: estimating (builder B) — G/B/B options, report import, low-slope, margin floor,
// state guardrails (TX), homeowner picks Better and signs, price book, company settings, instant quote.
//   BASE_URL=http://localhost:3102 node e2e/estimating.js /tmp/shots
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3102";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
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
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  page.on("dialog", (d) => d.accept());

  console.log("1. Sign up + company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Esti Mator");
  await page.fill('input[name="email"]', `estimator${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Lone Star Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "555-0100");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  check(true, "company created");

  console.log("2. Company settings: state, certifications, margin floor, bundles/sq");
  await page.goto(BASE + "/app/settings");
  await page.fill('input[name="state"]', "OH");
  await page.fill('input[name="zip"]', "43004");
  await page.fill('input[name="website"]', "lonestar.example.com");
  await page.fill('input[name="google_review_url"]', "https://g.page/r/lonestar");
  await page.fill('input[name="insurance_certificate_url"]', "https://example.com/coi.pdf");
  await page.check('input[name="certifications"][value="GAF Master Elite"]');
  await page.fill('input[name="min_margin_pct"]', "30");
  await page.fill('input[name="bundles_per_square"]', "3");
  await page.click('button:has-text("Save company")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check(await page.locator('input[name="certifications"][value="GAF Master Elite"]').isChecked(), "certification saved");
  check((await page.inputValue('input[name="website"]')) === "https://lonestar.example.com/", "website normalized to https URL");
  await shot(page, "b01-company-settings");

  console.log("3. Texas insurance customer + job");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Tess Homeowner");
  await page.fill('input[name="phone"]', "555-0142");
  await page.fill('input[name="email"]', "tess@example.com");
  await page.fill('input[name="address"]', "9 Bluebonnet Dr");
  await page.fill('input[name="city"]', "Austin");
  await page.fill('input[name="state"]', "TX");
  await page.fill('input[name="insurance_company"]', "Allstate");
  await page.fill('input[name="claim_number"]', "HAIL-TX-1");
  await page.fill('input[name="job_title"]', "Hail replacement");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobUrl = page.url();

  console.log("4. Estimate: import report (with a low-slope porch), options, fill");
  await page.click('button:has-text("New estimate")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  const estUrl = page.url();
  const estId = estUrl.split("/").pop();
  check((await page.locator('a:has-text("Measure on satellite map")').getAttribute("href")) === `/app/measure/${estId}`, "satellite measure link points at /app/measure/[estimateId]");
  await page.click('button:has-text("Import measurement report")');
  await page.selectOption('select[aria-label="Report source"]', "eagleview");
  await page.click('button:has-text("Paste CSV")');
  await page.fill('textarea[aria-label="Facet CSV"]', "Facet,Area,Pitch\nMain,2236.07,6/12\nPorch,301.05,1/12");
  await page.fill('input[aria-label="Report eaves"]', "120");
  await page.fill('input[aria-label="Report rakes"]', "80");
  await page.fill('input[aria-label="Report ridges"]', "45");
  await page.fill('input[aria-label="Report valleys"]', "20");
  await page.fill('input[aria-label="Suggested waste"]', "10");
  await page.click('button:has-text("Use these measurements")');
  check((await page.locator('[data-testid="section-row"]').count()) === 2, "imported 2 facets as sections");
  check((await page.locator('input[aria-label="Plan area"]').first().inputValue()) === "2000", "sloped report area converted to plan area (2000)");
  check(await page.getByText("EagleView").first().isVisible(), "measurement source badge shows EagleView");
  check(await page.locator('[data-testid="system-summary"]').getByText("Low-slope").isVisible(), "porch under 3/12 flagged as low-slope");
  check((await page.locator("dd").nth(3).textContent()).trim() === "74", "bundles exclude the low-slope porch (74)");

  await page.check('input[aria-label="Offer options"]');
  check((await page.locator('[data-testid="option-card"]').count()) === 3, "Good / Better / Best option cards created");
  const recName = await page.locator('[data-testid="option-card"]').nth(1).locator('input[aria-label="Option name"]').inputValue();
  check(recName === "Better" && (await page.locator('[data-testid="option-card"]').nth(1).locator('input[type="radio"]').isChecked()), "middle option (Better) recommended by default");
  // rename + reorder sanity: rename Best -> Premium, move it left and back
  await page.locator('[data-testid="option-card"]').nth(2).locator('input[aria-label="Option name"]').fill("Premium");
  await page.locator('[data-testid="option-card"]').nth(2).locator('button[aria-label="Move left"]').click();
  check((await page.locator('[data-testid="option-card"]').nth(1).locator('input[aria-label="Option name"]').inputValue()) === "Premium", "options can be reordered");
  await page.locator('[data-testid="option-card"]').nth(1).locator('button[aria-label="Move right"]').click();

  await page.click('button:has-text("Fill line items from measurements")');
  const shared = page.locator('[data-testid="shared-lines"] input[aria-label="Description"]');
  const sharedNames = await shared.evaluateAll((els) => els.map((e) => e.value));
  check(sharedNames.includes("Low-slope membrane (under 3/12)"), "low-slope section priced via the low_slope item");
  check(sharedNames.includes("Installation labor") && !sharedNames.some((n) => /shingles/i.test(n)), "identical items shared; shingles not shared");
  const groups = page.locator('[data-testid="option-lines"]');
  check((await groups.count()) === 3, "three option-specific line groups");
  const betterLines = await groups.nth(1).locator('input[aria-label="Description"]').evaluateAll((els) => els.map((e) => e.value));
  check(betterLines.includes("Designer shingles") && betterLines.some((n) => /Enhanced system warranty/.test(n)), "Better gets tier shingles + enhanced warranty");
  const bestLines = await groups.nth(2).locator('input[aria-label="Description"]').evaluateAll((els) => els.map((e) => e.value));
  check(bestLines.some((n) => /Premium system warranty/.test(n)), "certified (GAF Master Elite) premium warranty offered on Best");
  const shingleQty = await groups.nth(0).locator('tr:has(input[value="Architectural shingles"]) input[aria-label="Quantity"]').inputValue();
  check(Number(shingleQty) === 74, `Good shingles qty 74 (got ${shingleQty})`);
  await page.click('button:has-text("Save estimate")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check((await page.locator('[data-testid="option-card"]').count()) === 3, "options persisted after reload");
  check((await page.locator('[data-testid="option-lines"]').nth(1).locator('input[aria-label="Description"]').count()) >= 2, "per-option lines persisted");
  const totalsText = await page.locator('[data-testid="option-total"]').allTextContents();
  check(totalsText.length === 3, "per-option totals shown");
  const betterTotal = moneyNum((await page.locator('[data-testid="option-total"]').nth(1).locator("td").nth(1).textContent()));
  check(betterTotal > 10000, `Better total is a realistic roof price (${betterTotal})`);
  await shot(page, "b02-estimate-options");

  console.log("5. Margin floor warning");
  check(!(await page.locator('[data-testid="margin-warning"]').isVisible()), "no margin warning at price-book margins");
  await page.fill('input[aria-label="Discount"]', "4000");
  await page.locator('[data-testid="margin-warning"]').waitFor();
  check(await page.locator('[data-testid="margin-warning"]').isVisible(), "margin warning appears below the 30% floor");
  await page.fill('input[aria-label="Discount"]', "0");
  check(!(await page.locator('[data-testid="margin-warning"]').isVisible()), "warning clears when margin recovers");

  console.log("6. Texas guardrails: compliance panel + deductible waiver blocked");
  const panel = page.locator('[data-testid="compliance-panel"]');
  check(await page.getByText("Texas").first().isVisible(), "compliance panel uses customer state (TX) over company state (OH)");
  check(await panel.getByText("Texas deductible notice").isVisible(), "TX §27.02 deductible notice will be attached");
  check((await page.locator('[data-testid="cancel-by"]').textContent()).length > 5, "cancel-by date shown");
  await page.locator('[data-testid="shared-lines"] button:has-text("+ Custom line")').click();
  await page.locator('[data-testid="shared-lines"] input[aria-label="Description"]').last().fill("Deductible discount");
  await page.locator('[data-testid="shared-lines"] input[aria-label="Unit price"]').last().fill("-1000");
  await page.click('button:has-text("Save estimate")');
  await page.getByText(/prohibits/).waitFor();
  check(await page.getByText(/looks like a deductible discount/).isVisible(), "deductible waiver line blocked in TX");
  await page.locator('[data-testid="shared-lines"] button[aria-label="Remove line"]').last().click();
  await page.click('button:has-text("Save estimate")');
  await page.getByText("Saved.").waitFor();
  await shot(page, "b03-compliance");

  console.log("7. Send; homeowner picks Better and signs");
  await page.click('button:has-text("Mark as sent")');
  await page.getByText("Send this link").waitFor();
  const publicHref = await page.locator('a:has-text("Customer view")').getAttribute("href");
  const pub = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1, userAgent: "E2E-Homeowner-Browser" });
  const cpage = await pub.newPage();
  cpage.on("pageerror", (e) => errors.push(e.message));
  await cpage.goto(BASE + publicHref);
  const cards = cpage.locator('[data-testid="public-option"]');
  check((await cards.count()) === 3, "public link shows three option cards side by side");
  check(await cards.nth(1).getByText("Recommended").isVisible(), "recommended option highlighted");
  check(await cpage.locator('[data-testid="legal-notices"]').getByText(/TEXAS LAW REQUIRES/).isVisible(), "TX deductible notice appended to public estimate");
  await shot(cpage, "b04-public-options");
  await cards.nth(0).click();
  await cards.nth(1).click(); // Better
  check(await cpage.getByText(/You.re accepting Better/).isVisible(), "homeowner selected Better");
  const canvas = cpage.locator('canvas[aria-label^="Signature"]');
  const box = await canvas.boundingBox();
  await cpage.mouse.move(box.x + 20, box.y + box.height / 2);
  await cpage.mouse.down();
  for (let i = 1; i <= 12; i++) await cpage.mouse.move(box.x + 20 + i * 18, box.y + box.height / 2 + (i % 2 ? -25 : 25));
  await cpage.mouse.up();
  await cpage.fill('input[name="name"]', "Tess Homeowner");
  await cpage.check('input[name="agree"]');
  await cpage.click('button:has-text("Accept & sign")');
  await cpage.locator('[data-testid="receipt"]').waitFor();
  check(await cpage.locator('[data-testid="receipt"]').getByText("Better").isVisible(), "receipt shows the chosen option");
  check(await cpage.locator('[data-testid="receipt"] img[alt^="Signature"]').isVisible(), "receipt shows the drawn signature");
  check(await cpage.getByRole("button", { name: "Download PDF" }).isVisible(), "Download PDF available after accepting");
  check((await cpage.locator('[data-testid="public-option"]').count()) === 1, "receipt shows only the selected option");
  await shot(cpage, "b05-public-receipt");

  console.log("8. Office sees acceptance; totals follow the selected option");
  await page.goto(estUrl);
  check(await page.getByText(/chose Better/).isVisible(), "estimate records the chosen option");
  const row = sql(`select accepted_ip is not null, accepted_user_agent, jsonb_array_length(legal_notices) > 0, signature_data like 'data:image/png%' from estimates where id = '${estId}'`);
  check(row.startsWith("t|E2E-Homeowner-Browser|t|t"), `IP, user agent, notices snapshot and signature stored (${row.slice(0, 40)}…)`);
  check(await page.locator('[data-testid="notice-list"]').getByText("Texas deductible notice").isVisible(), "snapshotted notices shown on accepted estimate");
  await page.goto(BASE + "/app/estimates");
  const listTotal = moneyNum(await page.locator(`tr:has(a[href="/app/estimates/${estId}"]) td`).last().textContent());
  check(Math.abs(listTotal - betterTotal) < 0.01, `estimates list total = Better total (${listTotal})`);
  await page.goto(jobUrl);
  check(await page.locator("h1 + div").getByText("Sold").isVisible(), "job stage moved to Sold");

  console.log("9. Price book");
  await page.goto(BASE + "/app/settings/price-book");
  check(await page.getByText("Shingles").first().isVisible(), "price book grouped by calculator key");
  const shRow = page.locator('[data-testid="price-row"]:has(input[value="Architectural shingles"])');
  await shRow.locator('input[aria-label="Unit cost"]').fill("40");
  await shRow.locator('button:has-text("Save")').click();
  await page.getByText("Saved.").first().waitFor();
  await page.reload();
  check((await page.locator('[data-testid="price-row"]:has(input[value="Architectural shingles"]) input[aria-label="Unit cost"]').inputValue()) === "40", "unit cost edited");
  check(await page.locator('[data-testid="price-row"]:has(input[value="Architectural shingles"])').getByText("4.8%").isVisible(), "margin per item shown (42 vs 40 = 4.8%)");
  await shot(page, "b06-price-book");

  console.log("10. Instant quote widget (iframe-friendly)");
  const orgId = sql(`select org_id from estimates where id = '${estId}'`);
  const key = sql(`select intake_key from organizations where id = '${orgId}'`);
  const qctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const q = await qctx.newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(`${BASE}/quote/${key}`);
  check(await q.getByText("Get an instant roof replacement estimate").isVisible(), "quote widget renders without app chrome");
  await noHorizontalScroll(q, "instant quote");
  await q.fill('input[aria-label="Street address"]', "77 Elm St");
  await q.fill('input[aria-label="City"]', "Austin");
  await q.fill('input[aria-label="State"]', "TX");
  await q.fill('input[aria-label="House square feet"]', "2000");
  await q.locator("label:has-text('Steep')").click();
  const rangeText = await q.locator('[data-testid="quote-range"]').textContent();
  check(/\$\d/.test(rangeText), `live price range shown (${rangeText.trim().slice(0, 40)})`);
  await q.locator("label:has-text('Yes, storm damage')").click();
  await q.fill('input[aria-label="Your name"]', "Quinn Quote");
  await q.fill('input[aria-label="Phone"]', "555-0177");
  await q.click('button:has-text("Get my quote")');
  await q.locator('[data-testid="quote-done"]').waitFor();
  check(await q.getByText(/will contact you shortly/).isVisible(), "lead submitted with range");
  const lead = sql(`select j.is_insurance, j.notes like 'Instant quote:%' from jobs j where j.org_id = '${orgId}' and j.lead_source = 'Instant quote'`);
  check(lead === "t|t", "lead job created with quote summary + insurance flag");
  await shot(q, "b07-instant-quote");
  const host = await qctx.newPage();
  await host.setContent(`<html><body style="margin:0"><iframe src="${BASE}/quote/${key}" style="width:100%;height:900px;border:0"></iframe></body></html>`);
  const frame = host.frameLocator("iframe");
  await frame.getByText("Get an instant roof replacement estimate").waitFor();
  check(true, "widget loads inside an iframe embed");

  console.log("11. Phone width (390px)");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await mctx.newPage();
  for (const [path, name] of [[estUrl.replace(BASE, ""), "estimate editor"], ["/app/estimates", "estimates list"], ["/app/settings", "company settings"], ["/app/settings/price-book", "price book"]]) {
    await mp.goto(BASE + path);
    await noHorizontalScroll(mp, name);
  }
  await shot(mp, "b08-mobile-price-book");
  const mpub = await mctx.newPage();
  await mpub.goto(BASE + publicHref);
  await noHorizontalScroll(mpub, "public estimate receipt");
  await shot(mpub, "b09-mobile-public");

  // A second estimate (sent, unsigned) to check the option cards stack on a phone.
  await page.goto(estUrl);
  await page.click('button:has-text("Duplicate")');
  await page.waitForURL((u) => u.toString() !== estUrl && /\/app\/estimates\/[0-9a-f-]+$/.test(u.toString()));
  check((await page.locator('[data-testid="option-card"]').count()) === 3, "duplicate copies options");
  await page.click('button:has-text("Mark as sent")');
  await page.getByText("Send this link").waitFor();
  const href2 = await page.locator('a:has-text("Customer view")').getAttribute("href");
  await mpub.goto(BASE + href2);
  await noHorizontalScroll(mpub, "public options (unsigned)");
  const c0 = await mpub.locator('[data-testid="public-option"]').nth(0).boundingBox();
  const c1 = await mpub.locator('[data-testid="public-option"]').nth(1).boundingBox();
  check(c1.y > c0.y + c0.height - 1, "option cards stack vertically on mobile");
  await shot(mpub, "b10-mobile-public-options");

  check(errors.length === 0, `no page errors (${errors.join(" | ").slice(0, 300)})`);
  await browser.close();
  console.log("ESTIMATING E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
