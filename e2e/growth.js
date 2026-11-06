// Growth & integrations end-to-end: lead intake -> board timer -> contacted, lead source report,
// canvass knock -> lead, satellite measure -> estimate sections, public invoice pay instructions,
// billing cancel/reactivate, phone-width checks. Map tiles are mocked (no outbound network needed).
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3105";
const SHOTS = process.argv[2] || require("os").tmpdir();
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}

// 1x1 PNG for mocked map tiles
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
async function mockTiles(ctx) {
  await ctx.route(/arcgisonline\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, geolocation: { latitude: 39.7392, longitude: -104.9903 }, permissions: ["geolocation"] });
  await mockTiles(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const shot = (name, p = page) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  console.log("1. Sign up + company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Gina Growth");
  await page.fill('input[name="email"]', `gina${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Peak Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "555-0199");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  check(true, "company created");

  console.log("2. Lead intake settings");
  await page.goto(BASE + "/app/settings/lead-intake");
  const endpoint = (await page.locator("dt:has-text('Lead intake URL') + dd").textContent()).trim();
  const key = endpoint.split("/").pop();
  check(/^[0-9a-f]{24}$/.test(key), "intake URL shows the org intake key");
  check(await page.getByText("<iframe", { exact: false }).first().isVisible(), "iframe embed snippets shown");
  check(await page.getByText(`/quote/${key}`, { exact: false }).first().isVisible(), "instant quote embed points at /quote/<key>");
  check(await page.getByText("curl -X POST", { exact: false }).isVisible(), "curl webhook example shown");
  check(await page.getByText("AI phone receptionist", { exact: false }).isVisible(), "phone receptionist marked out of scope");
  await page.fill('input[name="price_per_square_low"]', "475");
  await page.fill('input[name="price_per_square_high"]', "700");
  await page.click('button:has-text("Save instant quote")');
  await page.getByText("Instant quote saved.").waitFor();
  check(true, "instant quote price range saved");
  await shot("g01-lead-intake");

  console.log("3. Lead via API (JSON webhook), CORS, honeypot, hosted form");
  const api = page.request;
  const pre = await api.fetch(`${BASE}/api/leads/${key}`, { method: "OPTIONS", headers: { Origin: "https://example-roofer.com" } });
  check(pre.status() === 204 && pre.headers()["access-control-allow-origin"] === "*", "CORS preflight allowed");
  const res = await api.post(`${BASE}/api/leads/${key}`, { data: { first_name: "Hank", last_name: "Hailstorm", phone: "555-0142", email: "hank@example.com", address: "9 Ridge Rd", city: "Denver", state: "co", zip: "80202", message: "Hail last night", source: "angi" } });
  check(res.status() === 201, `JSON lead accepted (${res.status()})`);
  const leadId = (await res.json()).id;
  const bot = await api.post(`${BASE}/api/leads/${key}`, { form: { name: "Spam Bot", phone: "1", _gotcha: "http://spam" } });
  check(bot.status() === 200, "honeypot submission silently ignored");
  const bad = await api.post(`${BASE}/api/leads/${key}`, { data: { name: "No Contact" } });
  check(bad.status() === 422, "lead without phone/email rejected");
  const unknown = await api.post(`${BASE}/api/leads/deadbeef`, { data: { name: "X", phone: "5550000" } });
  check(unknown.status() === 404, "unknown intake key rejected");

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const ap = await anon.newPage();
  await ap.goto(`${BASE}/l/${key}?source=website`);
  check(await ap.getByText(`Peak Roofing ${stamp}`).isVisible(), "hosted lead form renders for anonymous visitor");
  await ap.fill('input[name="name"]', "Wanda Website");
  await ap.fill('input[name="phone"]', "555-0177");
  await ap.fill('input[name="city"]', "Aurora");
  await ap.click('button:has-text("Request inspection")');
  await ap.getByText("we got your request").waitFor();
  check(true, "hosted form submission shows confirmation");
  check(!(await ap.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "lead form fits a phone");
  await ap.screenshot({ path: `${SHOTS}/g02-lead-form-phone.png`, fullPage: true });

  console.log("4. Board timer, dashboard, mark contacted");
  await page.goto(BASE + "/app/jobs");
  const card = page.locator(`[data-job-card="${leadId}"]`);
  await card.waitFor();
  const timer = card.locator("[data-lead-timer]");
  check(await timer.isVisible(), "new lead card shows time-since-lead timer");
  check((await timer.getAttribute("class")).includes("green"), "timer is green under 5 minutes");
  check(await card.getByText("d in stage").isVisible(), "card shows days in stage");
  check((await card.locator("span[title^='Assigned to']").textContent()).trim() === "GG", "card shows assignee initials (round-robin -> owner)");
  check(await page.getByText("2 new leads waiting").isVisible(), "board header counts uncontacted leads");
  await page.click('a:has-text("My jobs")');
  await page.waitForURL(/mine=1/);
  check(await page.locator(`[data-job-card="${leadId}"]`).isVisible(), "My jobs filter includes leads assigned to me");
  await shot("g03-board");
  await page.goto(BASE + "/app");
  check(await page.locator("[data-waiting-leads]").getByText("Hank Hailstorm").isVisible(), "dashboard lists new leads waiting");
  check(await page.getByText("My day").isVisible(), "dashboard shows My day");
  await shot("g04-dashboard");
  await page.goto(`${BASE}/app/jobs/${leadId}`);
  check(await page.getByText("Angi").first().isVisible(), "job overview shows lead source");
  await page.click('button:has-text("Mark contacted")');
  await page.locator("[data-response-time]").waitFor();
  check(/response time \d+ min/.test(await page.locator("[data-response-time]").textContent()), "response time shown after contact");
  await page.fill('input[name="bid_due_on"]', "2026-12-01");
  await page.click('button:has-text("Save lead info")');
  await page.getByText("Saved.").first().waitFor();
  check(await page.getByText("Pipeline stage").isVisible() && await page.getByText("Notes & activity").isVisible(), "existing overview cards still render");
  check(await page.getByText("First contact made").isVisible(), "contact logged as a note");
  await shot("g05-job-overview");
  await page.goto(BASE + "/app/jobs");
  check((await page.locator(`[data-job-card="${leadId}"] [data-lead-timer]`).count()) === 0, "timer gone once contacted");

  console.log("5. Lead source report + spend");
  await page.goto(BASE + "/app/reports/leads");
  const month = new Date().toISOString().slice(0, 7);
  await page.fill('input[name="source"]', "angi");
  await page.fill('input[name="month"]', month);
  await page.fill('input[name="amount"]', "600");
  await page.click('button:has-text("Save spend")');
  await page.getByText(`Saved angi spend for ${month}.`).waitFor();
  await page.reload();
  const row = page.locator('[data-lead-report] tr[data-source="angi"]').first();
  check((await row.locator('[data-col="leads"]').textContent()).trim() === "1", "angi: 1 lead");
  check((await row.locator('[data-col="spend"]').textContent()).trim() === "$600.00", "angi: $600 spend");
  check((await row.locator('[data-col="cpl"]').textContent()).trim() === "$600.00", "angi: $600 cost per lead");
  check((await row.locator("td").nth(3).textContent()).trim() === "100%", "angi: 100% contacted within 1h");
  const web = page.locator('[data-lead-report] tr[data-source="website"]').first();
  check((await web.locator('[data-col="leads"]').textContent()).trim() === "1", "website: 1 lead from hosted form");
  await shot("g06-lead-report");

  console.log("6. Canvass: knock here -> interested -> convert to lead");
  await page.goto(BASE + "/app/canvass");
  await page.locator("[data-map] .leaflet-tile-pane").waitFor({ state: "attached" });
  await page.click("[data-knock-here]");
  await page.locator("[data-knock-sheet]").waitFor();
  await page.locator("[data-knock-sheet]").getByRole("button", { name: "Interested", exact: true }).click();
  await page.fill('[data-knock-sheet] input[placeholder="123 Main St"]', "77 Shingle Ct");
  await page.fill('[data-knock-sheet] input[placeholder^="Hail hits"]', "Granule loss, wants inspection");
  await page.click('[data-knock-sheet] button:has-text("Save")');
  await page.getByText("Interested saved.").waitFor();
  await page.click('button[role="tab"]:has-text("list")');
  await page.locator("[data-knock-list]").getByText("77 Shingle Ct").click();
  await page.click('[data-knock-sheet] button:has-text("Convert to lead")');
  await page.fill('[data-knock-sheet] input[name="name"]', "Dora Doorknock");
  await page.fill('[data-knock-sheet] input[name="phone"]', "555-0188");
  await page.fill('[data-knock-sheet] input[name="city"]', "Denver");
  await page.fill('[data-knock-sheet] input[name="state"]', "CO");
  await page.click('[data-knock-sheet] button:has-text("Create customer & lead")');
  await page.getByText("Lead created and credited to you").waitFor();
  check(true, "knock converted to customer + lead");
  const lb = page.locator("[data-leaderboard] tr").first().locator("td");
  check((await lb.nth(1).textContent()).trim() === "1" && (await lb.nth(2).textContent()).trim() === "1" && (await lb.nth(4).textContent()).trim() === "1", "leaderboard: 1 knock, 1 interested, 1 lead created");
  await shot("g07-canvass");
  await page.click('a:has-text("Open the job")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  check(await page.getByText("Door Knock").first().isVisible(), "job lead source is door_knock");
  check((await page.locator('select[name="setter_id"]').inputValue()).length > 0, "setter attributed to current user");
  check(await page.locator("[data-response-time]").isVisible(), "door-knock lead counts as already contacted");
  const knockJobUrl = page.url();

  console.log("7. Satellite measure -> estimate sections");
  await page.click('button:has-text("New estimate")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  const estId = page.url().split("/").pop();
  await page.goto(`${BASE}/app/measure/${estId}`);
  await page.getByText("Trace roof edges including overhangs; verify pitch on site").waitFor();
  check(true, "measure page shows the tracing caveat");
  await page.locator("[data-map] .leaflet-tile-pane").waitFor({ state: "attached" });
  await page.waitForTimeout(800); // let geocoding settle (offline -> message)
  await page.click('button:has-text("+ Trace a facet")');
  const box = await page.locator("[data-map]").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-120, -60], [120, -60], [120, 60], [-120, 60]]) await page.mouse.click(cx + dx, cy + dy);
  check((await page.locator("[data-drawing]").textContent()).includes("4 points"), "four corners placed");
  await page.click('button:has-text("Finish facet")');
  await page.locator('[data-facet] button:has-text("8/12")').click();
  const totalText = await page.locator("[data-measure-total]").textContent();
  check(/squares/.test(totalText) && !/Plan 0 sq ft/.test(totalText), `area computed (${totalText.trim()})`);
  await page.click('button:has-text("Save to estimate")');
  await page.getByText(/Saved 1 section/).waitFor();
  check(true, "satellite sections saved");
  await shot("g08-measure");
  await page.goto(`${BASE}/app/estimates/${estId}`);
  const plan = Number(await page.locator('input[aria-label="Plan area"]').first().inputValue());
  const pitch = Number(await page.locator('input[aria-label="Pitch"]').first().inputValue());
  check(plan > 100 && pitch === 8, `estimate editor reads satellite section (plan ${plan} sq ft, pitch ${pitch}/12)`);

  console.log("8. Public invoice without Stripe shows check/ACH instructions + financing");
  await page.goto(BASE + "/app/settings/payments");
  await page.click('button:has-text("+ Lender")');
  await page.fill('[data-lender] input[aria-label="Lender name"]', "Acme Lending");
  await page.fill('[data-lender] input[aria-label="Prequalification link"]', "https://lender.example.com/prequal");
  await page.fill('[data-lender] input[aria-label="Dealer fee %"]', "6");
  await page.locator('label:has-text("Offer financing") input').check();
  await page.click('button:has-text("Save financing")');
  await page.getByText("Financing saved.").waitFor();
  check(true, "financing lender saved");
  await page.locator("[data-milestone] input[aria-label='Percent']").first().fill("50");
  check((await page.locator("[data-schedule-sum]").textContent()).includes("must be 100"), "schedule editor enforces 100%");
  await page.locator("[data-milestone] input[aria-label='Percent']").first().fill("30");
  check((await page.locator("[data-schedule-sum]").textContent()).trim() === "Total 100%", "schedule back to 100%");
  await shot("g09-payments-settings");
  await page.goto(knockJobUrl);
  await page.click('button:has-text("New invoice")');
  await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+$/);
  await page.click('button:has-text("+ Custom line")');
  await page.locator('input[aria-label="Description"]').last().fill("Roof repair");
  await page.locator('input[aria-label="Unit price"]').last().fill("1200");
  await page.click('button:has-text("Save invoice")');
  await page.getByRole("button", { name: "Saved" }).waitFor();
  await page.click('button:has-text("Mark as sent")');
  const invHref = await page.locator('a:has-text("Customer view")').getAttribute("href");
  const ip = await anon.newPage();
  await ip.goto(BASE + invHref);
  check(await ip.locator("[data-pay-instructions]").isVisible(), "public invoice shows check/ACH instructions when Stripe isn't configured");
  check(await ip.getByText("payable to").isVisible(), "check payee shown");
  check(await ip.getByText("Check my rate with Acme Lending").isVisible(), "financing prequal link shown");
  check(!(await ip.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "public invoice fits a phone");
  await ip.screenshot({ path: `${SHOTS}/g10-public-invoice-phone.png`, fullPage: true });

  console.log("9. Financing application -> funded -> dealer fee");
  await page.goto(knockJobUrl);
  await page.fill('input[name="lender"]', "Acme Lending");
  await page.fill('input[name="amount"]', "10000");
  await page.fill('input[name="dealer_fee_pct"]', "6");
  await page.click('button:has-text("Record financing")');
  await page.getByText("Financing recorded.").waitFor();
  await page.reload();
  await page.locator('[data-financing] select[aria-label="Financing status"]').selectOption("funded");
  await page.click('[data-financing] button:has-text("Update")');
  await page.getByText("dealer fee posted to Job cost").waitFor();
  check(true, "funded financing posts dealer fee");

  console.log("10. Plan & billing: cancel and reactivate, export");
  await page.goto(BASE + "/app/settings/billing");
  check(await page.locator("[data-plan-price]").textContent() === "$149.00", "flat plan price shown");
  check(await page.getByText("Unlimited users", { exact: false }).isVisible(), "unlimited users listed");
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("Cancel subscription")');
  await page.locator('[data-billing-status="cancelled"]').waitFor();
  await page.reload();
  check(await page.locator('[data-billing-status="cancelled"]').getByText("ends on").isVisible(), "status shows cancelled with end date");
  check(await page.getByText("What happens to your data").isVisible(), "explains what happens to data");
  const stillOpen = await api.post(`${BASE}/api/leads/${key}`, { data: { name: "Grace Period", phone: "555-0111" } });
  check(stillOpen.status() === 201, "lead intake keeps working during the paid-through period");
  await page.click('button:has-text("Reactivate subscription")');
  await page.locator('[data-billing-status="active"]').waitFor();
  await page.reload();
  check(await page.locator('[data-billing-status="active"]').isVisible(), "reactivated");
  const csv = await api.get(`${BASE}/api/export/customers`);
  const body = await csv.text();
  check(csv.status() === 200 && body.includes("Hank Hailstorm") && body.includes("Dora Doorknock"), "customers CSV export works");
  check((await api.get(`${BASE}/api/export/payments`)).status() === 200, "payments CSV export works");
  await shot("g11-billing");

  console.log("11. Integrations + webhooks without keys");
  await page.goto(BASE + "/app/settings/integrations");
  check(await page.getByText("No sync problems").isVisible(), "integrations page shows sync problems inbox");
  const wh = await api.post(`${BASE}/api/webhooks/stripe`, { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } });
  check([400, 501].includes(wh.status()), `stripe webhook rejects unsigned/unconfigured (${wh.status()})`);
  const ai = await api.post(`${BASE}/api/ai/proposal-notes`, { data: { estimateId: estId } });
  check([501, 200, 502].includes(ai.status()), `AI endpoint responds (${ai.status()})`);
  const sms = await api.post(`${BASE}/api/sms/inbound`, { form: { From: "+15550142000", Body: "hello" } });
  check(sms.status() === 200 || sms.status() === 403, "SMS inbound returns TwiML");

  console.log("12. Phone width (390px)");
  const mob = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockTiles(mob);
  await mob.addCookies(await ctx.cookies());
  const mp = await mob.newPage();
  for (const [path, name] of [["/app", "dash"], ["/app/jobs", "board"], [new URL(knockJobUrl).pathname, "job"], ["/app/canvass", "canvass"], [`/app/measure/${estId}`, "measure"], ["/app/reports/leads", "leads"], ["/app/settings/lead-intake", "intake"], ["/app/settings/payments", "payments"], ["/app/settings/billing", "billing"], ["/app/settings/integrations", "integrations"]]) {
    await mp.goto(BASE + path);
    await mp.waitForTimeout(300);
    // page must not scroll sideways, and no card may stick out past the screen edge
    const over = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll("main section")].some((el) => el.getBoundingClientRect().right > window.innerWidth + 1));
    await mp.screenshot({ path: `${SHOTS}/g12-phone-${name}.png`, fullPage: false });
    check(!over, `no horizontal scroll on ${path}`);
  }

  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  check(real.length === 0, "no browser console errors" + (real.length ? `: ${real.join(" | ")}` : ""));
  console.log("\nGROWTH E2E PASSED");
  await browser.close();
})().catch(async (e) => {
  console.error(e.message);
  process.exit(1);
});
