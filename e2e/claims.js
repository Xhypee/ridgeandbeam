// End-to-end: insurance claim object, ledger, paperwork, supplements, scope diff, milestone billing.
// Usage: BASE_URL=http://localhost:3101 node e2e/claims.js <screenshot dir>
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3101";
const SHOTS = process.argv[2] || require("os").tmpdir();
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  const shot = (name, p = page) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const noHScroll = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  console.log("1. Sign up + company");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Clara Claims");
  await page.fill('input[name="email"]', `clara${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', "Hailstone Roofing");
  await page.fill('input[name="tax_rate"]', "0");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  check(true, "company created");

  console.log("2. New customer → insurance claim job");
  await page.goto(BASE + "/app/customers/new");
  check((await page.locator('fieldset legend:has-text("Insurance claim (optional)")').count()) === 0, "customer form no longer has the insurance fieldset");
  await page.fill('input[name="name"]', "Henry Hail");
  await page.fill('input[name="phone"]', "555-0199");
  await page.fill('input[name="address"]', "9 Storm Ct");
  await page.fill('input[name="city"]', "Dallas");
  await page.fill('input[name="state"]', "TX");
  await page.fill('input[name="job_title"]', "Hail replacement");
  await page.check('input[name="job_kind"][value="insurance"]');
  await page.fill('input[name="insurance_company"]', "Lone Star Mutual");
  await page.fill('input[name="claim_number"]', "LSM-77-001");
  await page.fill('input[name="adjuster_name"]', "Ada Adjuster");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobUrl = page.url();
  const jobId = jobUrl.split("/").pop();
  check(await page.locator("h1 + div").getByText("Insurance").isVisible(), "job shows Insurance badge");

  console.log("3. Claim tab: edit details, money summary, stage advance");
  await page.goto(jobUrl + "/claim");
  check((await page.inputValue('input[name="carrier"]')) === "Lone Star Mutual", "claim created with carrier from new-customer flow");
  check((await page.inputValue('input[name="claim_number"]')) === "LSM-77-001", "claim # carried over");
  check((await page.inputValue('input[name="adjuster_name"]')) === "Ada Adjuster", "adjuster carried over");
  await page.selectOption('select[name="policy_type"]', "acv");
  check(await page.getByText("Held-back depreciation is NOT paid later").isVisible(), "policy type explains ACV in one line");
  await page.selectOption('select[name="policy_type"]', "rcv");
  await page.fill('input[name="policy_number"]', "POL-123");
  await page.fill('input[name="date_of_loss"]', isoDaysAgo(20));
  await page.fill('input[name="cause_of_loss"]', "Hail");
  await page.fill('input[aria-label="Adjuster meeting"]', `${isoDaysAgo(-3)}T10:30`);
  await page.fill('input[name="rcv_amount"]', "20000");
  await page.fill('input[name="depreciation_amount"]', "6000");
  await page.fill('input[name="deductible"]', "1000");
  await page.check('input[name="o_and_p_included"]');
  await page.fill('input[name="mortgagee_name"]', "First Lender Bank");
  await page.fill('input[name="mortgage_loan_number"]', "LN-555");
  await page.fill('input[name="loss_draft_contact"]', "Loss draft dept 800-555-0000");
  await page.click('button:has-text("Save claim")');
  await page.getByText("Claim saved.").waitFor();
  await page.reload();
  const summary = page.locator('section:has(h2:has-text("Money summary"))');
  check(await summary.getByText("$13,000.00").first().isVisible(), "ACV payable = 20000 - 6000 - 1000 = $13,000");
  check(await summary.getByText("is recoverable").isVisible(), "RCV policy says depreciation is recoverable");
  check(await summary.getByText("Texas law prohibits waiving").isVisible(), "deductible-waiver law note for TX");
  check(await page.getByText("Adjuster meeting").first().isVisible() && (await page.inputValue('input[aria-label="Adjuster meeting"]')).endsWith("10:30"), "adjuster meeting time round-trips in local time");
  await page.click('button:has-text("Advance to: Claim filed")');
  await page.locator('p:has-text("Claim filed")').first().waitFor();
  check(await page.getByText("Today").first().isVisible(), "stage advanced with days-in-stage reset");
  await shot("claims-01-overview");

  console.log("4. Accepted estimate + payment schedule (Billing tab)");
  await page.goto(jobUrl);
  await page.click('button:has-text("New estimate")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  await page.click('button:has-text("+ Custom line")');
  await page.locator('input[aria-label="Description"]').last().fill("Full roof replacement");
  await page.locator('input[aria-label="Unit price"]').last().fill("18000");
  await page.click('button:has-text("Save estimate")');
  await page.getByText("Saved.").waitFor();
  await page.click('button:has-text("Mark as sent")');
  const publicHref = await page.locator('a:has-text("Customer view")').getAttribute("href");
  const pub = await browser.newContext();
  const cpage = await pub.newPage();
  await cpage.goto(BASE + publicHref);
  await cpage.fill('input[name="name"]', "Henry Hail");
  await cpage.check('input[name="agree"]');
  await cpage.click('button:has-text("Accept & sign")');
  await cpage.getByText("Your acceptance has been recorded").waitFor();
  await pub.close();
  await page.goto(jobUrl + "/billing");
  check(await page.getByText("$5,400.00").first().isVisible(), "schedule preview shows 30% deposit of $18,000");
  await page.click('button:has-text("Create payment schedule")');
  await page.locator('[data-testid="job-invoices"] li').nth(2).waitFor();
  await page.reload();
  await shot("claims-02-billing");
  const invList = page.locator('[data-testid="job-invoices"] li');
  check((await invList.count()) === 3, "3 milestone invoices created");
  check(await invList.nth(0).getByText("Deposit").first().isVisible() && await invList.nth(2).getByText("Final").first().isVisible(), "kinds deposit … final with milestone labels");
  check((await page.locator('button:has-text("Create payment schedule")').count()) === 0, "schedule can't be created twice");

  console.log("5. Insurance ledger");
  await page.goto(jobUrl + "/claim/money");
  await page.click('button:has-text("Generate expected checks")');
  await page.getByText("Expected checks ready (3 added)").waitFor();
  await page.reload();
  const ledger = page.locator('[data-testid="ledger"] > li');
  check((await ledger.count()) === 3, "ACV, depreciation and deductible checks generated");
  const acv = page.locator('[data-check-kind="acv"]');
  check(await acv.getByText("Needs endorsement").first().isVisible(), "mortgagee on claim → endorsement needed");
  await acv.locator('summary:has-text("Record check received")').click();
  await acv.locator('input[name="received_amount"]').fill("13000");
  await acv.locator('input[name="check_number"]').fill("88123");
  const depositOption = await acv.locator('select[name="invoice_id"] option', { hasText: "Deposit" }).getAttribute("value");
  await acv.locator('select[name="invoice_id"]').selectOption(depositOption);
  await acv.locator('button:has-text("Save check")').click();
  await acv.getByText("more than the invoice's balance").waitFor();
  check(true, "can't apply a $13,000 check to a $5,400 invoice");
  await acv.locator('select[name="invoice_id"]').selectOption("");
  await acv.locator('button:has-text("Save check")').click();
  await acv.getByText("Check saved.").waitFor();
  const ded = page.locator('[data-check-kind="deductible"]');
  await ded.locator('summary:has-text("Record check received")').click();
  await ded.locator('input[name="check_number"]').fill("1050");
  await ded.locator('select[name="invoice_id"]').selectOption(depositOption);
  await ded.locator('button:has-text("Save check")').click();
  await page.getByText("Check recorded and applied to the invoice.").waitFor();
  await page.reload();
  check(await page.locator('[data-check-kind="deductible"]').getByText(/applied to invoice #/).isVisible(), "homeowner deductible check recorded as a payment on the deposit invoice");
  check(await page.locator('[data-check-kind="acv"]').getByText(/check #88123/).isVisible(), "ACV check received with check #");
  await page.locator('[data-check-kind="acv"] button:has-text("Mark sent to lender")').click();
  await page.locator('[data-check-kind="acv"]').getByText("Sent to lender").first().waitFor();
  await page.locator('[data-check-kind="acv"] button:has-text("Mark endorsed")').click();
  await page.locator('[data-check-kind="acv"]').locator("span", { hasText: /^Endorsed$/ }).first().waitFor();
  check(true, "endorsement advanced needed → sent to lender → endorsed");

  console.log("6. Loss-draft paperwork");
  const w9 = page.locator('[data-doc="w9"]');
  await w9.locator('select[name="status"]').selectOption("sent");
  await w9.locator('button:has-text("Save")').click();
  await w9.getByText("Saved.").waitFor();
  await page.reload();
  check(await page.locator('[data-doc="w9"]').getByText(/^Sent [A-Z][a-z]{2} \d+$/).isVisible(), "W-9 marked sent with date");
  check(await page.getByText("1 of 8 sent").isVisible(), "checklist progress shown");
  await shot("claims-03-money");

  await page.goto(jobUrl + "/billing");
  const evr = page.locator('[data-testid="expected-vs-received"] tr');
  check((await evr.count()) === 6, "expected vs received merges 3 invoices + 3 checks");
  const depositRow = page.locator('[data-testid="job-invoices"] li').nth(0);
  check(await depositRow.getByText("Partial", { exact: true }).isVisible(), "deposit invoice partially paid by the deductible check");

  console.log("7. Scope comparison");
  await page.goto(jobUrl + "/claim/scope");
  check(await page.getByText("requires a Verisk partnership").isVisible(), "ESX limitation explained");
  const carrierScope = [
    "Code\tDescription\tQty\tUnit\tUnit Price\tTotal",
    "RFG 300S\tLaminated - comp. shingle rfg - w/out felt\t25.00\tSQ\t265.10\t6,627.50",
    "RFG RIDGC\tHip / Ridge cap - Standard profile\t40.00\tLF\t4.12\t164.80",
    "RFG FELT15\tRoofing felt - 15 lb.\t25.00\tSQ\t32.00\t800.00",
  ].join("\n");
  const contractorScope = [
    "code,description,qty,unit,unit price,total",
    "RFG 300S,Architectural shingles,25.2,SQ,265.10,6680.52",
    "RFG RIDGC,Ridge cap shingles,65,LF,4.12,267.80",
    "RFG FELT15,Synthetic underlayment,25,SQ,32.00,800.00",
    "RFG DRIP,Drip edge,180,LF,2.85,513.00",
    "RFG ASTR,Starter strip,180,LF,1.92,345.60",
  ].join("\n");
  await page.fill('textarea[aria-label="Carrier scope lines"]', carrierScope);
  await page.click('section:has(h2:has-text("Carrier scope")) button:has-text("Import 3 lines")');
  await page.getByText("Imported 3 carrier lines").waitFor();
  await page.fill('textarea[aria-label="Contractor scope lines"]', contractorScope);
  await page.click('section:has(h2:has-text("Your scope")) button:has-text("Import 5 lines")');
  await page.getByText("Imported 5 contractor lines").waitFor();
  await page.locator('[data-testid="diff"]').waitFor();
  const st = async (s) => page.locator(`[data-testid="diff"] tr[data-status="${s}"]`).count();
  check((await st("matched")) === 2, "2 lines matched (shingles within 2%, felt)");
  check((await st("qty_differs")) === 1, "ridge cap quantity differs");
  check((await st("missing_from_carrier")) === 2, "drip edge + starter missing from carrier");
  const flags = page.locator('[data-testid="flags"] li');
  check(await flags.filter({ hasText: "Drip edge is in your scope" }).count() === 1, "drip edge auto-flagged");
  check(await flags.filter({ hasText: "Starter course is in your scope" }).count() === 1, "starter auto-flagged");
  check(await flags.filter({ hasText: "Carrier has 40 LF of hip & ridge cap" }).count() === 1, "short ridge cap flagged");
  check(await flags.filter({ hasText: "Overhead & profit is on neither scope" }).count() === 1, "O&P check suggested");
  await shot("claims-04-scope");
  await page.click('button:has-text("Add flagged items to a new supplement")');
  await page.waitForURL(/\/claim\/supplements\/[0-9a-f-]+$/);
  const suppUrl = page.url();
  const suppId = suppUrl.split("/").pop();
  check((await page.locator('[data-testid="supp-line"]').count()) === 3, "supplement round 1 created with 3 flagged lines");
  check((await page.locator('input[aria-label="Code citation"]').first().inputValue()).length > 0, "code citation pre-filled");
  const dripCitation = await page.locator('[data-testid="supp-line"]:has(input[value="Drip edge"]) input[aria-label="Code citation"]').inputValue();
  check(/R905\.2\.8\.5/.test(dripCitation), "drip edge cites IRC R905.2.8.5");
  const ridgeQty = await page.locator('[data-testid="supp-line"]:has(input[value*="Ridge cap"]) input[aria-label="Quantity"]').inputValue();
  check(Number(ridgeQty) === 25, "short item requests only the 25 LF difference");
  await page.click('button:has-text("+ Add line")');
  await page.locator('input[aria-label="Description"]').last().fill("Step flashing");
  await page.locator('input[aria-label="Xactimate code"]').last().fill("RFG STEP");
  await page.locator('input[aria-label="Quantity"]').last().fill("40");
  await page.locator('input[aria-label="Unit"]').last().fill("LF");
  await page.locator('input[aria-label="Unit price"]').last().fill("9.50");
  await page.locator('input[aria-label="Code citation"]').last().fill("IRC R905.2.8.3");
  await page.locator('textarea[aria-label="Justification"]').last().fill("Step flashing can't be reused.");
  await page.click('button:has-text("Save supplement")');
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check((await page.locator('[data-testid="supp-line"]').count()) === 4, "manual line saved");
  // 513 + 345.60 + 25*4.12=103 + 380 = 1341.60
  check(await page.getByText("$1,341.60").first().isVisible(), "requested total $1,341.60");

  console.log("8. Submit supplement + follow-up reminders");
  await page.selectOption('select[name="status"]', "submitted");
  await page.fill('input[name="submitted_on"]', isoDaysAgo(6));
  await page.click('button:has-text("Update status")');
  await page.getByText("Follow-up reminders are set").waitFor();
  await page.reload();
  check(await page.getByText("Follow-up due").isVisible(), "follow-up due (day 5 passed)");
  await page.goto(BASE + "/app/claims");
  const card = page.locator('[data-testid="claim-card"]', { hasText: "Henry Hail" });
  check(await card.isVisible(), "claim card on the board");
  check(await card.getByText("Lone Star Mutual").isVisible(), "card shows carrier");
  check(await card.getByText(/owed/).isVisible(), "card shows money outstanding");
  check(await card.getByText(/Follow up/).isVisible(), "card shows next follow-up");
  await page.click('a:has-text("Needs follow-up")');
  await page.waitForURL(/filter=follow_up/);
  check(await page.locator('[data-testid="claim-card"]', { hasText: "Henry Hail" }).isVisible(), "needs follow-up filter includes it");
  await shot("claims-05-board");
  await page.goto(BASE + "/app/claims");
  await page.goto(BASE + "/app/notifications");
  const notes = page.locator("li", { hasText: "Follow up on supplement round 1" });
  check((await notes.count()) === 1, "exactly one follow-up notification after two board loads (idempotent)");
  await page.goto(jobUrl + "/claim/supplements");
  await page.click('button:has-text("Mark followed up")');
  await page.waitForLoadState("networkidle");
  await page.reload();
  check(await page.getByText("Next follow-up").isVisible() && await page.getByText("1 done").isVisible(), "mark followed up pushes to the next reminder");

  console.log("9. Approve → expected supplement check; printable request");
  await page.goto(suppUrl);
  await page.selectOption('select[name="status"]', "partial");
  await page.fill('input[name="approved_amount"]', "1100");
  await page.click('button:has-text("Update status")');
  await page.getByText("expected supplement check was added").waitFor();
  await page.goto(jobUrl + "/claim/money");
  const suppCheck = page.locator('[data-check-kind="supplement"]');
  check((await suppCheck.count()) === 1 && (await suppCheck.getByText("$1,100.00").first().isVisible()), "approved supplement added a $1,100 expected check");
  await page.goto(BASE + `/app/claims/supplements/${suppId}`);
  check(await page.getByText("Supplement request").first().isVisible(), "printable supplement page renders");
  check(await page.getByText("LSM-77-001").isVisible() && await page.getByText("IRC R905.2.8.5").first().isVisible(), "print shows claim # and code citations");
  await shot("claims-06-print");

  console.log("10. Customer detail + invoices");
  await page.goto(jobUrl);
  await page.locator('h1 + div a').first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]+$/);
  check(await page.locator('[data-testid="customer-claims"]').getByText("Lone Star Mutual").isVisible(), "customer detail lists the job's claim");
  check((await page.locator('input[name="insurance_company"]').count()) === 0, "customer detail has no insurance fields");
  await page.goto(BASE + "/app/invoices");
  check(await page.getByText("Deposit").first().isVisible(), "invoice list shows milestone label");
  await page.locator('a:has-text("#")').first().click();
  await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+$/);
  await page.selectOption('select[name="bill_to"]', "carrier");
  await page.click('button:has-text("Save billing details")');
  await page.getByText("Saved.").first().waitFor();
  await page.reload();
  check(await page.getByText("Bill to Insurance company").isVisible(), "bill_to set to carrier");

  console.log("11. Retail job path");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Rita Retail");
  await page.fill('input[name="job_title"]', "Retail reroof");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  await page.goto(page.url() + "/claim");
  check(await page.getByText("Retail job.").isVisible(), "retail job explains no claim");
  check(await page.locator('button:has-text("Start insurance claim")').isVisible(), "can still start a claim");

  console.log("12. Phone width (390px)");
  await ctx.storageState({ path: `${SHOTS}/state.json` });
  console.log("  job: " + jobUrl);
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await m.newPage();
  for (const [name, url] of [
    ["claim", jobUrl + "/claim"],
    ["money", jobUrl + "/claim/money"],
    ["supplement", suppUrl],
    ["scope", jobUrl + "/claim/scope"],
    ["board", BASE + "/app/claims"],
    ["billing", jobUrl + "/billing"],
  ]) {
    await mp.goto(url);
    check(await noHScroll(mp), `no horizontal page scroll at 390px: ${name}`);
    await shot(`claims-m-${name}`, mp);
  }
  await m.close();

  const relevant = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
  check(relevant.length === 0, "no page errors" + (relevant.length ? ": " + relevant.join(" | ") : ""));
  await browser.close();
  console.log("CLAIMS E2E PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
