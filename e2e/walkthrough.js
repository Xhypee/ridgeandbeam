// End-to-end walk through Ridge & Beam against local Supabase.
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const SHOTS = process.argv[2] || require("os").tmpdir();
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() === 404) errors.push("404 " + r.url()); });
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  console.log("1. Landing + sign up");
  await page.goto(BASE);
  await shot("01-landing");
  await page.goto(BASE + "/app");
  check(page.url().includes("/login"), "signed-out /app redirects to /login");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Alice Owner");
  await page.fill('input[name="email"]', `alice${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  check(true, "new user lands on onboarding");

  console.log("2. Create company");
  await page.fill('input[name="name"]', "Summit Roofing");
  await page.fill('input[name="phone"]', "02 9555 0100");
  await page.selectOption('select[name="state"]', "NSW");
  await page.fill('input[name="abn"]', "51 824 753 556");
  await shot("01b-onboarding");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  check(await page.getByText("Summit Roofing").first().isVisible(), "dashboard shows company");

  console.log("3. New customer with job");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Jane Homeowner");
  await page.fill('input[name="phone"]', "0412 345 678");
  await page.fill('input[name="email"]', "jane@example.com");
  await page.fill('input[name="address"]', "42 Banksia St");
  await page.fill('input[name="city"]', "Penrith");
  await page.selectOption('select[name="state"]', "NSW");
  await page.fill('input[name="zip"]', "2750");
  await page.fill('input[name="job_title"]', "Hail damage full replacement");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobUrl = page.url();
  check(await page.getByRole("heading", { name: "Hail damage full replacement" }).isVisible(), "job created from new-customer form");

  console.log("4. Estimate with roof calculator");
  await page.click('button:has-text("New quote")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  const estUrl = page.url();
  // New quotes open on the receipt docket; enter the measurements by hand in the detailed editor.
  await page.click('[data-testid="detailed-editor"]');
  await page.waitForURL(/view=editor/);
  await page.fill('input[aria-label="Plan area m²"]', "186");
  await page.fill('input[aria-label="Pitch degrees"]', "26.6");
  await page.fill('input[aria-label="Ridge lm"]', "12");
  await page.fill('input[aria-label="Barge lm"]', "28");
  check((await page.locator('[data-testid="true-area"]').innerText()).includes("208.02"), "true area = 186 m² ÷ cos(26.6°) = 208.02 m²");
  await page.click('button:has-text("Fill line items from measurements")');
  const rows = await page.locator('input[aria-label="Description"]').count();
  check(rows >= 6, `calculator generated line items (got ${rows})`);
  // The starter price book has no prices (every roofer sets their own), so price the first line here.
  await page.locator('input[aria-label="Unit price"]').first().fill("60");
  await page.click('button:has-text("+ Custom line")');
  await page.locator('input[aria-label="Description"]').last().fill("Skylight reflash");
  await page.locator('input[aria-label="Unit price"]').last().fill("350");
  await page.click('button:has-text("Save quote")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check((await page.locator('input[aria-label="Description"]').count()) === rows + 1, "line items persisted after reload");
  // Extras left "offered" (Often added) aren't part of the quote unless someone adds them.
  const offered = (await page.locator('select[aria-label="On the docket"]').evaluateAll((els) => els.map((e) => e.value))).filter((v) => v === "offered").length;
  await shot("02-estimate-editor");

  console.log("5. Send + customer accepts via public link");
  await page.click('button:has-text("Mark as sent")');
  await page.getByText("Send this link").waitFor();
  const publicHref = await page.locator('a:has-text("Customer view")').getAttribute("href");
  const pub = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  const cpage = await pub.newPage();
  await cpage.goto(BASE + publicHref);
  check(await cpage.getByText("Prepared for").isVisible(), "public estimate renders for anonymous visitor");
  check(await cpage.getByText("Jane Homeowner").first().isVisible(), "public estimate shows customer");
  await cpage.screenshot({ path: `${SHOTS}/03-public-estimate.png`, fullPage: true });
  await cpage.fill('input[name="name"]', "Jane Homeowner");
  const sig = await cpage.locator('canvas[aria-label^="Signature"]').boundingBox();
  await cpage.mouse.move(sig.x + 20, sig.y + sig.height / 2);
  await cpage.mouse.down();
  for (let i = 1; i <= 12; i++) await cpage.mouse.move(sig.x + 20 + i * 18, sig.y + sig.height / 2 + (i % 2 ? -25 : 25));
  await cpage.mouse.up();
  await cpage.check('input[name="agree"]');
  await cpage.click('button:has-text("Accept")');
  await cpage.getByText("Your acceptance has been recorded").waitFor();
  await cpage.screenshot({ path: `${SHOTS}/03b-public-accepted.png`, fullPage: false });
  check(true, "customer accepted estimate");

  await page.goto(jobUrl);
  check(await page.locator("h1 + div").getByText("Signed & Prepping").isVisible(), "job stage moved to Signed & Prepping");

  console.log("6. Invoice from estimate, payments");
  await page.goto(estUrl);
  check(await page.getByText("Accepted").first().isVisible(), "estimate shows Accepted & is locked");
  await page.click('button:has-text("Create invoice")');
  await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+$/);
  check((await page.locator('input[aria-label="Description"]').count()) === rows + 1 - offered, `invoice copied all ${rows + 1 - offered} quoted lines`);
  await page.click('button:has-text("Issue tax invoice")');
  await page.locator('a:has-text("Customer view")').waitFor();
  const amountInput = page.locator('input[name="amount"]');
  const fullBalance = Number(await amountInput.inputValue());
  check(fullBalance > 10000, `balance is a realistic roof price (${fullBalance})`);
  await amountInput.fill("5000");
  await page.fill('input[name="reference"]', "EFT ref 1042");
  await page.click('button:has-text("Record payment")');
  await page.getByText("Payment recorded.").waitFor();
  await page.reload();
  check(await page.getByText("Partial").first().isVisible(), "invoice is Partial after deposit");
  await page.locator('input[name="amount"]').waitFor();
  await page.click('button:has-text("Record payment")');
  await page.locator('input[name="amount"]').waitFor({ state: "detached" });
  await page.reload();
  check(await page.locator("h1").getByText("Paid").isVisible(), "invoice Paid after balance");
  await shot("04-invoice");
  await page.goto(jobUrl);
  check(await page.locator("h1 + div").getByText("Paid").isVisible(), "job stage moved to Paid");

  console.log("7. Crew + schedule");
  await page.goto(BASE + "/app/settings/crews");
  await page.fill('input[placeholder^="Crew name"]', "Miguel's crew");
  await page.click('form:has(input[placeholder^="Crew name"]) button:has-text("Add")');
  await page.getByText("Crew added.").waitFor();
  // A second job to schedule
  await page.goto(BASE + "/app/jobs/new");
  await page.selectOption('select[name="customer_id"]', { label: "Jane Homeowner" });
  await page.fill('input[name="title"]', "Gutter replacement");
  await page.click('button:has-text("Create job")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.fill('input[name="scheduled_start"]', iso(today));
  await page.fill('input[name="scheduled_end"]', iso(new Date(today.getTime() + 86400000)));
  await page.selectOption('select[name="crew_id"]', { label: "Miguel's crew" });
  await page.click('button:has-text("Save schedule")');
  await page.getByText("Scheduled.").waitFor();
  await page.goto(BASE + "/app/schedule");
  check(await page.getByText("Gutter replacement").first().isVisible(), "job appears on weekly schedule");
  await shot("05-schedule");
  await page.goto(BASE + "/app/jobs");
  await shot("06-jobs-board");
  await page.goto(BASE + "/app");
  await shot("07-dashboard");

  console.log("8. Invite a teammate; second company is isolated");
  await page.goto(BASE + "/app/settings/team");
  await page.fill('input[placeholder="teammate@company.com"]', `carol${stamp}@example.com`);
  await page.click('button:has-text("Invite")');
  await page.getByText("Invite created").waitFor();
  const inviteText = await page.locator("li:has-text('pending')").first().textContent();
  check(inviteText.includes("carol"), "invite listed as pending");

  const bobCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const bob = await bobCtx.newPage();
  await bob.goto(BASE + "/signup");
  await bob.fill('input[name="full_name"]', "Bob Other");
  await bob.fill('input[name="email"]', `bob${stamp}@example.com`);
  await bob.fill('input[name="password"]', "password123");
  await bob.click('button[type="submit"]');
  await bob.waitForURL("**/onboarding");
  await bob.fill('input[name="name"]', "Bob's Roofing");
  await bob.click('button[type="submit"]');
  await bob.waitForURL(BASE + "/app");
  await bob.goto(BASE + "/app/customers");
  check((await bob.locator('[data-contact-row="customer"]').count()) === 0, "other company sees no customers");
  const r = await bob.goto(jobUrl);
  check(r.status() === 404, "other company gets 404 on Summit's job URL");

  console.log("9. Mobile layout");
  const mob = await browser.newContext({ ...require("playwright").devices["iPhone 13"] });
  await mob.addCookies(await ctx.cookies());
  const mp = await mob.newPage();
  await mp.goto(estUrl);
  await mp.screenshot({ path: `${SHOTS}/08-mobile-estimate.png`, fullPage: false });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no horizontal page scroll on phone");

  if (process.env.STORAGE_STATE) await ctx.storageState({ path: process.env.STORAGE_STATE });
  const real = errors.filter((e) => !/favicon/.test(e));
  check(real.length === 0, "no browser console errors" + (real.length ? `: ${real.join(" | ")}` : ""));
  console.log("\nE2E PASSED");
  await browser.close();
})().catch(async (e) => {
  console.error(e.message);
  process.exit(1);
});
