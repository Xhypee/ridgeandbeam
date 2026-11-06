// E2E for builder C (field capture, status actions, homeowner portal, change orders, close-out).
//   BASE_URL=http://localhost:3103 node e2e/field.js <screenshot dir>
// Requires a production build (`next build && next start`) so the service worker is active.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3103";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
const stamp = Date.now();
const PHONE = "720" + String(stamp).slice(-7);

const sql = (q) => execFileSync("psql", [DB, "-tAX", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
async function noHScroll(page, name) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 391, `${name}: no horizontal scroll at 390px (scrollWidth ${w})`);
}
async function sign(page, canvasSel) {
  await page.locator(canvasSel).first().scrollIntoViewIfNeeded();
  const box = await page.locator(canvasSel).first().boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * 15, box.y + box.height / 2 + (i % 2 ? -25 : 25));
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  console.log("1. Sign up + company + customer/job");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Rita Rep");
  await page.fill('input[name="email"]', `rita${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', "Peak Field Roofing");
  await page.fill('input[name="phone"]', "555-0100");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Holly Homeowner");
  await page.fill('input[name="phone"]', PHONE);
  await page.fill('input[name="email"]', `holly${stamp}@example.com`);
  await page.fill('input[name="address"]', "9 Ridge Rd");
  await page.fill('input[name="city"]', "Boulder");
  await page.fill('input[name="state"]', "CO");
  await page.fill('input[name="job_title"]', "Hail roof replacement");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobUrl = page.url();
  const jobId = jobUrl.split("/").pop();
  // Insurance claim money (A's tables) so the portal claim explainer has data.
  sql(`insert into claims (org_id, job_id, carrier, claim_number, rcv_amount, depreciation_amount, deductible, stage)
       select org_id, id, 'State Farm', 'HAIL-${stamp}', 18000, 4200, 1500, 'approved' from jobs where id = '${jobId}'
       on conflict (job_id) do update set rcv_amount = 18000, depreciation_amount = 4200, deductible = 1500, stage = 'approved';
       insert into claim_checks (org_id, claim_id, kind, expected_amount, received_amount, received_on)
       select org_id, id, 'acv', 13800, 13800, current_date from claims where job_id = '${jobId}';
       insert into claim_checks (org_id, claim_id, kind, expected_amount) select org_id, id, 'depreciation', 4200 from claims where job_id = '${jobId}';`);
  check(true, `job ${jobId} with claim`);

  console.log("2. Offline photo capture survives reload, uploads when back online");
  const fieldUrl = `${jobUrl}/field`;
  await page.goto(fieldUrl);
  await page.getByRole("heading", { name: "Capture" }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // now controlled by the service worker
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForFunction(async () => {
    const c = await caches.open("rb-sw-v1-pages");
    return Boolean(await c.match(location.pathname, { ignoreVary: true }));
  }, null, { timeout: 15000 });
  check(true, "service worker controls the Field tab and cached it");
  await noHScroll(page, "Field tab");

  // Make three big JPEGs (3000x2000) in the browser.
  const jpgs = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("canvas");
      c.width = 3000; c.height = 2000;
      const g = c.getContext("2d");
      g.fillStyle = ["#7c2d12", "#1e3a8a", "#14532d"][i]; g.fillRect(0, 0, 3000, 2000);
      g.fillStyle = "#fff"; g.font = "200px sans-serif"; g.fillText("Photo " + (i + 1), 300, 1000);
      out.push(c.toDataURL("image/jpeg", 0.9).split(",")[1]);
    }
    return out;
  });

  await ctx.setOffline(true);
  await page.click('button:has-text("Rear")');
  await page.click('button:has-text("Damage")');
  await page.setInputFiles('[data-testid="photo-input"]', jpgs.map((b, i) => ({ name: `IMG_${i}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b, "base64") })));
  await page.getByTestId("sync-banner").getByText("3 photos waiting for signal").waitFor({ timeout: 15000 });
  check(true, 'banner: "3 photos waiting for signal"');
  check((await page.locator('[data-testid="tile"][data-status="queued"]').count()) === 3, "3 tiles queued while offline");
  await shot(page, "c01-field-offline-queued");

  await page.reload(); // offline reload: served from the service worker cache, queue from IndexedDB
  await page.getByTestId("sync-banner").getByText("3 photos waiting for signal").waitFor({ timeout: 15000 });
  check(true, "after offline reload the page opens and the 3 photos are still queued");

  await ctx.setOffline(false);
  await page.getByTestId("sync-banner").getByText("All captures uploaded").waitFor({ timeout: 30000 });
  await page.reload();
  await page.locator('[data-testid="tile"]').first().waitFor();
  check((await page.locator('[data-testid="tile"]').count()) === 3, "3 photos in the gallery after coming online");
  const nFiles = sql(`select count(*) from job_files where job_id = '${jobId}' and kind = 'photo' and slope = 'rear' and category = 'damage' and client_id is not null`);
  check(nFiles === "3", "3 job_files rows (slope rear, category damage, client_id set)");
  const nObj = sql(`select count(*) from storage.objects o join job_files f on f.storage_path = o.name where f.job_id = '${jobId}'`);
  check(nObj === "3", "3 objects in the job-files bucket");
  const big = sql(`select max(size_bytes) from job_files where job_id = '${jobId}'`);
  check(Number(big) < 1500000, `photos downscaled before upload (largest ${big} bytes)`);

  console.log("3. Gallery: share with homeowner, test square counter");
  await page.locator('[data-testid="tile"] button:has-text("Share")').first().click();
  await page.locator('[data-testid="tile"] button:has-text("Shared")').first().waitFor();
  check(sql(`select count(*) from job_files where job_id = '${jobId}' and shared_with_homeowner`) === "1", "photo shared with homeowner");
  await page.click('button:has-text("Front")');
  await page.click('button:has-text("Test square")');
  for (let i = 0; i < 9; i++) await page.click('button[aria-label="Add a hit"]');
  await page.click('button[aria-label="Remove a hit"]');
  check((await page.locator('output[aria-label="Hit count"]').textContent()).trim() === "8", "test-square counter at 8");

  console.log("4. One-tap status actions");
  await page.click('button:has-text("On my way")');
  await page.click('button:has-text("Post update")');
  await page.getByTestId("timeline").getByText("On my way").first().waitFor();
  await page.click('button:has-text("Tear-off started")');
  await page.fill('textarea[aria-label="Note"]', "Crew of 6 on site");
  await page.click('button:has-text("Post update")');
  await page.getByTestId("timeline").getByText("Crew of 6 on site").waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="timeline"] [data-testid="chip"]'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check(sql(`select count(*) from job_events where job_id = '${jobId}' and kind in ('on_my_way','tear_off_started')`) === "2", "2 job_events created");
  check(sql(`select count(*) from messages where job_id = '${jobId}' and direction = 'outbound' and channel = 'sms' and body like '%/p/%'`) === "2", "homeowner SMS logged with portal link for each");
  check(sql(`select stage from jobs where id = '${jobId}'`) === "in_progress", "tear-off moved job to In progress");
  await shot(page, "c02-field-online");

  console.log("5. Homeowner portal (anonymous)");
  const portalHref = await page.getByTestId("portal-link").getAttribute("href");
  const portalPath = new URL(portalHref).pathname;
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const hp = await anon.newPage();
  hp.on("pageerror", (e) => errors.push("portal: " + e.message));
  await hp.goto(BASE + portalPath);
  check(await hp.getByText("Peak Field Roofing").first().isVisible(), "portal shows company branding");
  check(await hp.getByText("Hi Holly").isVisible(), "portal greets homeowner by first name");
  const tear = hp.locator('[data-testid="milestones"] li', { hasText: "Tear-off" });
  check((await tear.getAttribute("data-status")) === "done", "milestone Tear-off is done (from field tap)");
  check((await hp.getByTestId("current-milestone").textContent()).includes("Dry-in"), "current milestone is Dry-in");
  const explainer = await hp.getByTestId("claim-explainer").textContent();
  check(explainer.includes("Your deductible: $1,500.00") && explainer.includes("Held back by your insurer until we finish: $4,200.00"), "claim explainer: deductible + held-back depreciation");
  check(explainer.includes("Next check expected"), "claim explainer: next check");
  check((await hp.locator('img[alt="Roof photo"], section[aria-labelledby="ph-h"] img').count()) >= 1, "shared photo visible on portal");
  check(await hp.getByText("Crew of 6 on site").isVisible(), "latest updates feed shows field note");
  await noHScroll(hp, "Portal");
  await shot(hp, "c03-portal");

  console.log("6. Roof-side change order approved by homeowner with signature");
  await page.goto(`${jobUrl}/change-orders`);
  await page.click('button[aria-label="One more sheet"]'); // 4 -> 5
  check((await page.getByTestId("co-total").textContent()).includes("$360.00"), "5 sheets × $72 price-book decking = $360");
  await page.locator('button[aria-pressed="false"]:has(img)').first().click();
  await noHScroll(page, "Change orders");
  await page.click('button:has-text("Send for approval")');
  await page.waitForURL(/change-orders\/[0-9a-f-]+/);
  await page.getByText("Sent to homeowner").waitFor();
  const coHref = await page.locator('a:has-text("open homeowner view")').getAttribute("href");
  await hp.goto(BASE + coHref);
  check(await hp.getByText("Replace rotten decking").first().isVisible(), "homeowner sees change order");
  check((await hp.locator("article img").count()) === 1, "change order shows the attached photo");
  await hp.fill('input[name="name"]', "Holly Homeowner");
  await sign(hp, "canvas");
  await hp.check('input[name="agree"]');
  await noHScroll(hp, "Change order approval");
  await hp.click('button:has-text("Approve & sign")');
  await hp.getByTestId("co-approved").waitFor();
  check(true, "homeowner approved with drawn signature");
  await shot(hp, "c04-change-order-approved");
  await page.reload();
  check(await page.getByText("Added to").isVisible(), "rep sees approval + invoice link");
  check(sql(`select count(*) from invoice_items i join invoices v on v.id = i.invoice_id where v.job_id = '${jobId}' and v.kind = 'change_order' and i.description like 'Change order:%'`) === "1", "change order line on a change_order invoice");
  check(sql(`select amount from job_costs where job_id = '${jobId}' and category = 'materials' and description = 'Change order: Replace rotten decking'`) === "190.00", "job cost row for decking (5 × $38)");
  check(sql(`select signature_data like 'data:image/png;base64,%' from change_orders where job_id = '${jobId}'`) === "t", "signature stored");

  console.log("7. Close-out: punch list, walkthrough sign-off, certificate, warranty, review gating");
  await page.goto(`${jobUrl}/closeout`);
  await page.fill('input[name="label"]', "Reseal pipe boot");
  await page.click('button:has-text("Add")');
  await page.getByText("Reseal pipe boot").waitFor();
  check(await page.getByTestId("review-blocked").isVisible(), "review request disabled with explanation");
  check(await page.getByText(/Change Order #\d+/).first().isVisible(), "close-out lists the change-order invoice with status");
  await page.click('button[aria-label="Mark done: Reseal pipe boot"]');
  await page.locator('button[aria-label="Reopen: Reseal pipe boot"]').waitFor();
  await page.fill('input[name="name"]', "Holly Homeowner");
  await sign(page, "canvas");
  await page.check('input[name="agree"]');
  await page.click('button:has-text("Homeowner signs off")');
  await page.getByText("Signed by Holly Homeowner").or(page.locator("form p[role=alert]")).first().waitFor();
  if (await page.locator("form p[role=alert]").count()) console.log("  alert:", await page.locator("form p[role=alert]").first().textContent());
  check(await page.getByText("Signed by Holly Homeowner").isVisible(), "walkthrough signed on the phone");
  await page.reload();
  check((await page.getByTestId("warranty-countdown").textContent()).includes("45 days left"), "warranty countdown: 45 days left");
  check((await page.locator('[data-testid="closeout-checklist"] li[data-done="true"]').count()) >= 2, "readiness checklist shows punch + walkthrough done");
  await noHScroll(page, "Close-out");
  await shot(page, "c05-closeout");
  await page.click('a:has-text("Certificate of Completion")');
  await page.getByRole("heading", { name: "Certificate of Completion" }).waitFor();
  check(await page.getByText("HAIL-" + stamp).isVisible(), "certificate includes claim number");
  check(await page.locator('img[alt="Homeowner signature"]').isVisible(), "certificate shows homeowner signature");
  await shot(page, "c06-certificate");
  check(sql(`select stage from jobs where id = '${jobId}'`) === "completed", "sign-off completed the job");

  console.log("8. Photo report + portal milestone after completion");
  await page.goto(`${jobUrl}/field/report`);
  await page.getByRole("heading", { name: "Inspection photo report" }).waitFor();
  check(await page.getByText("Rear slope").isVisible(), "report grouped by slope");
  await noHScroll(page, "Photo report");
  await hp.goto(BASE + portalPath);
  check((await hp.locator('[data-testid="milestones"] li', { hasText: "Roof complete" }).getAttribute("data-status")) === "done", "portal: Roof complete milestone done");

  await browser.close();
  const real = errors.filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|Load failed/i.test(e));
  check(real.length === 0, `no page errors (${real.join(" | ")})`);
  console.log("FIELD E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
