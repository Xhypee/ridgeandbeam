// End-to-end: Australian insurance claims, ATO tax invoices, bank transfer / PayID, finance links,
// Xero settings, TPAR, security-of-payment slot.
// Usage: BASE_URL=http://localhost:3203 node e2e/au-money.js <screenshot dir> [desktop screenshot dir]
// Company ABN and a crew pay cost are seeded with psql (the company settings / crews screens belong to other builders).
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3203";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
const DESK = process.argv[3] || null;
const stamp = Date.now();
const email = `mona${stamp}@example.com`;

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-qtAc", q], { encoding: "utf8" }).trim();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  const shot = (name, p = page) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const noHScroll = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const ok = async (text) => page.getByText(text).first().waitFor({ timeout: 15000 });

  console.log("1. Sign up + company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Mona Money");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', "Southerly Roofing Pty Ltd");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select m.org_id from memberships m join auth.users u on u.id = m.user_id where u.email = '${email}'`);
  check(/^[0-9a-f-]{36}$/.test(orgId), "company created");

  console.log("2. Settings → Payments: bank, PayID, no surcharge, finance providers");
  await page.goto(BASE + "/app/settings/payments");
  check(await page.getByTestId("surcharge-note").getByText("1 October 2026").isVisible(), "surcharge note cites the 1 Oct 2026 RBA ban");
  check((await page.locator('input[name="pass_card_fee"]').count()) === 0, "no card surcharge setting");
  await page.fill('input[name="bank_account_name"]', "Southerly Roofing Pty Ltd");
  await page.fill('input[name="bank_bsb"]', "06200");
  await page.fill('input[name="bank_account_number"]', "12345678");
  await page.click('button:has-text("Save bank details")');
  await ok("A BSB is 6 digits");
  check(true, "bad BSB rejected");
  await page.fill('input[name="bank_bsb"]', "062-000");
  await page.fill('input[name="payid"]', "accounts@southerly.test");
  await page.click('button:has-text("Save bank details")');
  await ok("Bank details saved");
  check(sql(`select bank_bsb || '/' || payid from organizations where id = '${orgId}'`) === "062000/accounts@southerly.test", "bank details stored");
  check(await page.getByTestId("finance-disclaimer").getByText("credit licence").isVisible(), "finance credit-licence disclaimer shown");
  await page.locator('[data-lender="brighte"] input[type="checkbox"]').check();
  await page.fill('input[aria-label="Brighte link"]', "https://brighte.example.com/southerly");
  await page.getByLabel("Show these finance links on invoices").check();
  await page.click('button:has-text("Save finance links")');
  await ok("Confirm the credit licensing note");
  check(true, "finance needs the licence acknowledgement");
  await page.getByText("We hold an Australian credit licence").click();
  await page.click('button:has-text("Save finance links")');
  await ok("Finance links saved");
  check(true, "finance providers saved");
  await shot("m-01-payments-settings");

  console.log("3. Customer + insurance job");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Harriet Hailstone");
  await page.fill('input[name="phone"]', "0412 345 678");
  await page.fill('input[name="address"]', "9 Storm Ct");
  await page.fill('input[name="city"]', "Penrith");
  await page.fill('input[name="state"]', "NSW");
  await page.fill('input[name="zip"]', "2750");
  await page.fill('input[name="job_title"]', "Hail re-roof");
  await page.check('input[name="job_kind"][value="insurance"]');
  await page.fill('input[name="insurance_company"]', "NRMA");
  await page.fill('input[name="claim_number"]', "NRMA-26-4471");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobUrl = page.url();
  const jobId = jobUrl.split("/").pop();
  sql(`update jobs set state = 'NSW' where id = '${jobId}'`);
  sql(`update customers set state = 'NSW' where id = (select customer_id from jobs where id = '${jobId}')`); // customer form still caps state at 2 chars (coordinator change request)

  console.log("4. Claim: AU fields, Code of Practice guide, who pays what, explainer");
  await page.goto(jobUrl + "/claim");
  check(await page.getByRole("link", { name: "Variation requests" }).isVisible(), "claim nav says Variation requests");
  check((await page.locator('input[name="rcv_amount"], input[name="deductible"], input[name="mortgagee_name"]').count()) === 0, "no RCV / deductible / mortgagee fields");
  await page.selectOption('select[name="policy_type"]', "indemnity");
  check(await page.getByText("allowing for its age and condition").isVisible(), "cover type has plain-language help");
  await page.selectOption('select[name="policy_type"]', "replacement");
  await page.fill('input[name="sum_insured"]', "650000");
  await page.fill('input[name="excess"]', "750");
  await page.selectOption('select[name="event_type"]', "hail");
  await page.fill('input[name="date_of_loss"]', daysAgo(160));
  await page.fill('input[name="lodged_on"]', daysAgo(150));
  await page.selectOption('select[name="catastrophe"]', "declared");
  await page.fill('input[name="catastrophe_name"]', "CAT 251");
  await page.fill('input[name="adjuster_name"]', "Alex Assessor");
  await page.fill('input[name="adjuster_phone"]', "0400 111 222");
  await page.selectOption('select[name="settlement_path"]', "own_builder");
  check(await page.getByText("usually paying you its approved amount less the excess").isVisible(), "settlement path explains who pays");
  await page.fill('input[name="approved_amount"]', "18000");
  await page.fill('input[name="make_safe_done_on"]', daysAgo(158));
  await page.selectOption('select[name="make_safe_authorised_by"]', "insurer");
  await page.selectOption('select[name="make_safe_payer"]', "insurer");
  await page.fill('input[name="make_safe_amount"]', "660");
  await page.fill('input[name="make_safe_notes"]', "Tarped north face");
  await page.click('button:has-text("Save claim")');
  await ok("Claim saved");
  await page.reload();
  check((await page.getByTestId("code-reminders").count()) === 1, "Code of Practice reminders shown");
  check(await page.getByText("Code of Practice guide — check current Code").isVisible(), "reminders labelled as a guide");
  check(await page.getByTestId("code-reminders").getByText("Insurer's claim decision").isVisible(), "4-month decision reminder");
  const who = await page.getByTestId("who-pays").innerText();
  check(/Insurer[\s\S]*\$17,910\.00/.test(who) && /Homeowner excess[\s\S]*\$750\.00/.test(who), "who pays: insurer 17,250 + make-safe 660, homeowner excess 750");
  check(sql(`select excess || '/' || deductible || '/' || settlement_path from claims where job_id = '${jobId}'`) === "750.00/750.00/own_builder", "excess stored (deductible mirrored for older readers)");
  await page.getByText("What the homeowner sees").click();
  check(await page.getByTestId("claim-explainer").getByText("AFCA").isVisible(), "homeowner explainer mentions AFCA");
  await shot("m-02-claim");
  await page.click('button:has-text("Move to: Assessor booked")');
  await page.waitForTimeout(800);
  check((await page.getByTestId("claim-stage").innerText()).includes("Assessor booked"), "stage advanced to Assessor booked");

  console.log("5. Scope compare → variation request");
  await page.goto(jobUrl + "/claim/scope");
  check(await page.getByText("usually arrive as a PDF").isVisible(), "scope compare says insurer scopes are PDFs");
  check((await page.getByText(/Xactimate|ESX/).count()) === 0, "no Xactimate/ESX references");
  const insurer = page.locator('textarea[aria-label="Insurer scope lines"]');
  await insurer.fill("1. Replace Colorbond roof sheeting 180.00 m2 68.00 12240.00\n2. Ridge capping 10.00 LM 32.00 320.00\n3. Clean gutters 1.00 EA 150.00 150.00\nGST 1271.00");
  await page.locator('button:has-text("Import 3 lines")').first().click();
  await ok("Imported 3 insurer lines");
  const ours = page.locator('textarea[aria-label="Your scope lines"]');
  await ours.fill("Description\tQty\tUnit\tRate\tTotal\nColorbond roof sheeting\t182\tm2\t68\t12376\nRidge capping\t14\tLM\t32\t448\nSarking\t182\tm2\t9.5\t1729\nEdge protection\t1\tITEM\t1450\t1450");
  await page.locator('button:has-text("Import 4 lines")').click();
  await ok("Imported 4 of your lines");
  await page.reload();
  const flags = await page.getByTestId("flags").innerText();
  check(/Sarking is in your scope but not in the insurer's/.test(flags) && /Edge protection/.test(flags) && /ridge capping/i.test(flags), "missing sarking / edge protection and short ridge capping flagged");
  check(sql(`select stage from claims where job_id = '${jobId}'`) === "scope_received", "importing the insurer scope moves the claim to Scope received");
  await shot("m-03-scope");
  await page.click('button:has-text("Add flagged items to a new variation request")');
  await page.waitForURL(/\/claim\/supplements\/[0-9a-f-]+$/);
  check(await page.getByRole("heading", { name: "Variation request 1" }).isVisible(), "variation request created");
  check((await page.locator('[data-testid="supp-line"]').count()) === 3, "3 variation lines drafted");
  check((await page.inputValue('input[aria-label="Standard or requirement"] >> nth=0')).length > 0, "lines carry an Australian Standard reference");
  await page.selectOption('select[aria-label="Variation request status"]', "submitted");
  await page.click('button:has-text("Update status")');
  await ok("Marked as sent");
  await page.selectOption('select[aria-label="Variation request status"]', "partial");
  await page.fill('input[name="approved_amount"]', "2500");
  await page.click('button:has-text("Update status")');
  await ok("expected payment for the approved variation");
  check(true, "approved variation → expected payment");

  console.log("6. Claim money: expected vs received by payer, paperwork");
  await page.goto(jobUrl + "/claim/money");
  await page.click('button:has-text("Work out expected payments")');
  await ok("Expected payments ready");
  await page.reload();
  const ledger = page.getByTestId("ledger");
  check((await ledger.locator('[data-payer="insurer"]').count()) === 3, "insurer: scope, make-safe and variation");
  check((await ledger.locator('[data-payer="homeowner_excess"]').count()) === 1, "homeowner excess row");
  await ledger.locator('[data-check-kind="excess"] button:has-text("Mark received")').click();
  await page.waitForTimeout(800);
  const summary = await page.getByTestId("claim-money-summary").innerText();
  check(/Received\s*\$750\.00/.test(summary), "excess marked received; summary shows $750 received");
  check(/Expected\s*\$21,160\.00/.test(summary), "expected total = 17,250 + 750 + 660 + 2,500");
  const tile = page.locator('[data-doc="insurer_scope"] button');
  await tile.click();
  await page.waitForTimeout(800);
  check((await page.locator('[data-doc="insurer_scope"] button').getAttribute("aria-pressed")) === "true", "paperwork tile ticks when tapped");
  await shot("m-04-claim-money");

  console.log("7. Tax invoice: ABN required, GST-inclusive, buyer, issue");
  await page.goto(jobUrl);
  await page.click('button:has-text("New invoice")');
  await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+$/);
  const invUrl = page.url();
  await page.click('button:has-text("+ Custom line")');
  await page.fill('input[aria-label="Description"]', "Make-safe and ridge capping repairs");
  await page.fill('input[aria-label="Unit price"]', "1320");
  check((await page.getByTestId("editor-gst").innerText()).includes("$120.00"), "GST is 1/11 of the GST-inclusive price");
  await page.click('button:has-text("Save invoice")');
  await ok("Saved.");
  await page.reload();
  check((await page.getByTestId("tax-invoice-problems").innerText()).includes("ABN is missing"), "can't issue a tax invoice without the seller ABN");
  await page.click('button:has-text("Issue tax invoice")');
  await ok("A tax invoice must show it");
  sql(`update organizations set abn = '51824753556' where id = '${orgId}'`);
  await page.reload();
  check((await page.getByTestId("tax-invoice-problems").count()) === 0, "with the ABN set, nothing blocks the tax invoice");
  await page.fill('input[placeholder="11 digits"]', "123");
  await page.click('button:has-text("Save invoice")');
  await ok("buyer's ABN doesn't look right");
  await page.fill('input[placeholder="11 digits"]', "");
  await page.click('button:has-text("Save invoice")');
  await ok("Saved.");
  await page.click('button:has-text("Issue tax invoice")');
  await page.getByRole("link", { name: "Customer view" }).waitFor({ timeout: 15000 });
  check(sql(`select status from invoices where id = '${invUrl.split("/").pop()}'`) === "sent", "tax invoice issued");
  await page.selectOption('select[name="method"]', "bank_transfer");
  check((await page.locator('select[name="method"] option').allInnerTexts()).join(",").includes("PayID"), "AU payment methods offered (PayID, bank transfer)");
  const token = sql(`select public_token from invoices where id = '${invUrl.split("/").pop()}'`);
  await shot("m-05-invoice");

  console.log("8. Public invoice: Tax invoice, ABN, GST, bank transfer, finance, explainer");
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/i/${token}`);
  check((await pub.getByTestId("invoice-title").innerText()).trim().toLowerCase() === "tax invoice", "titled Tax invoice");
  check((await pub.getByTestId("seller-abn").innerText()).includes("51 824 753 556"), "seller ABN shown");
  check((await pub.getByTestId("gst-line").innerText()).includes("Includes GST of $120.00"), "GST amount shown");
  check((await pub.getByTestId("buyer-name").innerText()).includes("Harriet Hailstone"), "buyer identity shown");
  check((await pub.getByTestId("bsb").innerText()) === "062-000", "BSB shown");
  check((await pub.getByTestId("payid").innerText()) === "accounts@southerly.test", "PayID shown");
  check((await pub.getByTestId("pay-reference").innerText()).startsWith("INV"), "payment reference shown");
  check(await pub.locator("[data-finance]").getByText("Brighte").isVisible(), "finance provider link shown");
  check(await pub.getByTestId("claim-explainer").getByText("What is the excess?").isVisible(), "insurance explainer on the invoice");
  await shot("m-06-public-invoice", pub);
  await pub.setViewportSize({ width: 390, height: 844 });
  await pub.reload();
  check(await noHScroll(pub), "public invoice fits 390px");
  await shot("m-07-public-invoice-phone", pub);
  sql(`update organizations set gst_registered = false where id = '${orgId}'`);
  await pub.reload();
  check((await pub.getByTestId("invoice-title").innerText()).trim().toLowerCase() === "invoice", "not GST-registered → plain Invoice");
  check(await pub.getByText("No GST has been charged.").isVisible(), "no GST shown when not registered");
  sql(`update organizations set gst_registered = true where id = '${orgId}'`);
  await pub.close();

  console.log("9. Billing tab: expected vs received by payer");
  await page.goto(jobUrl + "/billing");
  const evr = page.getByTestId("expected-vs-received");
  check((await evr.locator('[data-group="insurer"]').count()) === 1 && (await evr.locator('[data-group="homeowner_excess"]').count()) === 1, "ledger grouped by insurer / homeowner excess");
  check((await evr.locator('[data-group="homeowner_balance"]').count()) === 1, "invoice to homeowner shows under homeowner balance");
  await shot("m-08-billing");

  console.log("10. Xero integration settings");
  await page.goto(BASE + "/app/settings/integrations");
  check(await page.getByTestId("xero-not-configured").getByText("XERO_CLIENT_ID").isVisible(), "Xero shown, needs XERO_CLIENT_ID/SECRET");
  check((await page.getByText(/QuickBooks/).count()) === 0, "QuickBooks removed from the UI");
  await page.fill('input[name="costs"]', "310");
  await page.click('button:has-text("Save codes")');
  await ok("Account codes saved");
  check(true, "Xero account codes saved");

  console.log("11. TPAR");
  const crewId = sql(`insert into crews (org_id, name) values ('${orgId}', 'Smith Roofing Crew') returning id`).split("\n")[0];
  const lastFyDay = (() => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-06-15`; })();
  const fyStart = Number(lastFyDay.slice(0, 4)) - 1;
  sql(`insert into job_costs (org_id, job_id, category, vendor, description, amount, incurred_on, source, source_id) values ('${orgId}', '${jobId}', 'labor', 'Smith Roofing Crew', 'Crew pay', 4000, '${lastFyDay}', 'crew_pay', '${crewId}')`);
  await page.goto(`${BASE}/app/reports`);
  await page.getByRole("link", { name: /Taxable payments \(TPAR\)/ }).click();
  await page.waitForURL(/\/app\/reports\/tpar/);
  await page.goto(`${BASE}/app/reports/tpar?fy=${fyStart}`);
  check(await page.getByText("28 August").first().isVisible(), "TPAR shows the 28 August due date");
  check((await page.getByTestId("tpar-rows").innerText()).includes("ABN missing"), "missing ABN flagged");
  await page.fill('input[aria-label="ABN for Smith Roofing Crew"]', "51 824 753 556");
  await page.locator('[data-crew="Smith Roofing Crew"] button:has-text("Save")').click();
  await ok("Saved.");
  await page.reload();
  const tpar = await page.getByTestId("tpar-rows").innerText();
  check(tpar.includes("51 824 753 556") && tpar.includes("$4,400.00"), "contractor ABN and gross incl GST");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tpar-csv").click()]);
  const csv = require("fs").readFileSync(await dl.path(), "utf8");
  check(csv.includes("Smith Roofing Crew,51824753556,,4400.00,400.00,0.00,1,"), "TPAR CSV has the contractor row");
  await shot("m-09-tpar");

  console.log("12. Production: security of payment slot; claims board");
  await page.goto(jobUrl + "/production");
  check((await page.getByTestId("sop-panel").innerText()).includes("New South Wales"), "SecurityOfPaymentPanel placeholder for NSW");
  check((await page.getByText(/Lien deadlines/).count()) === 0, "US lien card removed");
  await page.goto(BASE + "/app/claims");
  check((await page.locator('section[aria-label="Scope received"] [data-testid="claim-card"]').count()) === 1, "claims board groups by AU stage");

  console.log("13. Phone width (390px)");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const pp = await phone.newPage();
  for (const [name, url] of [["claim", jobUrl + "/claim"], ["claim-money", jobUrl + "/claim/money"], ["invoice", invUrl], ["payments", BASE + "/app/settings/payments"], ["tpar", `${BASE}/app/reports/tpar?fy=${fyStart}`], ["billing", jobUrl + "/billing"]]) {
    await pp.goto(url);
    check(await noHScroll(pp), `${name} fits 390px`);
    await shot(`m-phone-${name}`, pp);
  }
  await phone.close();

  if (DESK) {
    console.log("14. Desktop screenshots 1440×960 @2x");
    const desk = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
    const dp = await desk.newPage();
    for (const [name, url] of [["claim", jobUrl + "/claim"], ["claim-money", jobUrl + "/claim/money"], ["scope", jobUrl + "/claim/scope"], ["billing", jobUrl + "/billing"], ["invoice", invUrl], ["public-invoice", `${BASE}/i/${token}`], ["payments-settings", BASE + "/app/settings/payments"], ["integrations", BASE + "/app/settings/integrations"], ["tpar", `${BASE}/app/reports/tpar?fy=${fyStart}`], ["claims-board", BASE + "/app/claims"]]) {
      await dp.goto(url);
      await dp.screenshot({ path: `${DESK}/money-${name}.png` });
    }
    await desk.close();
  }

  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await browser.close();
  console.log("AU MONEY E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
