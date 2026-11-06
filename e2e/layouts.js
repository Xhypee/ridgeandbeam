// Desktop layouts end-to-end: Today, Jobs pipeline (5 columns), job page timeline + Next step bar,
// schedule, crew-lead view, phone widths. Seeds a realistic Australian roofing company through the
// service-role API (after a normal UI sign-up), then checks the screens against real data.
//
//   BASE_URL=http://localhost:3204 node e2e/layouts.js <shots dir> [prefix]
//   MODE=before … only seeds and screenshots (used for the "before" pictures; no assertions).
// Dates are seeded in the company's time zone (the app shows "today" in the company's state).
process.env.TZ = process.env.TZ || "Australia/Brisbane";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.BASE_URL || "http://localhost:3204";
const SHOTS = process.argv[2] || require("os").tmpdir();
const PREFIX = process.argv[3] || "layouts";
const BEFORE = process.env.MODE === "before";
const stamp = Date.now();

function env() {
  const out = {};
  const file = path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const E = env();
const admin = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function check(cond, msg) {
  if (BEFORE) return;
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60000, DAY = 86400000;

async function must(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function seed(orgId, ownerId) {
  const ins = (table, rows) => must(admin.from(table).insert(rows.map((r) => ({ org_id: orgId, ...r }))).select());
  await must(admin.from("organizations").update({ state: "QLD", zip: "4000", abn: "51824753556", gst_registered: true, tax_rate: 0 }).eq("id", orgId));
  const [jack, mia] = await ins("crews", [{ name: "Jack's crew", color: "#1f5f3f" }, { name: "Mia's crew", color: "#0d9488" }]);
  const cust = async (name, phone, address, city, extra = {}) =>
    (await ins("customers", [{ name, phone, address, city, state: "QLD", zip: "4064", ...extra }]))[0];
  const job = async (c, j) => (await ins("jobs", [{ customer_id: c.id, site_address: `${c.address}, ${c.city} QLD`, state: "QLD", assigned_to: ownerId, ...j }]))[0];
  const estimate = async (jobId, status, amount, extra = {}) => {
    const [e] = await ins("estimates", [{ job_id: jobId, status, tax_rate: 0, ...extra }]);
    await ins("estimate_items", [{ estimate_id: e.id, description: "COLORBOND Custom Orb re-roof, Monument", quantity: 1, unit: "job", unit_price: amount, unit_cost: Math.round(amount * 0.62), category: "material" }]);
    return e;
  };
  const invoice = async (jobId, amount, extra = {}) => {
    const [v] = await ins("invoices", [{ job_id: jobId, status: "sent", tax_rate: 0, ...extra }]);
    await ins("invoice_items", [{ invoice_id: v.id, description: "Roofing works", quantity: 1, unit: "job", unit_price: amount, category: "other" }]);
    return v;
  };
  const pay = (invoiceId, amount, paidOn = dayOffset(0)) => ins("payments", [{ invoice_id: invoiceId, amount, method: "ach", paid_on: paidOn }]);

  // New leads
  const sophie = await cust("Sophie Tran", "0412 555 142", "77 Banksia St", "Paddington", { insurance_company: "Suncorp" });
  const leadA = await job(sophie, { title: "Storm damage — hail", stage: "lead", is_insurance: true, lead_source: "website", lead_received_at: ago(3 * MIN), stage_changed_at: ago(3 * MIN) });
  const dan = await cust("Dan Fischer", "0433 555 177", "5 Ridge Way", "Ashgrove");
  const leadB = await job(dan, { title: "Leak over garage", stage: "lead", lead_source: "google_ads", lead_received_at: ago(41 * MIN), stage_changed_at: ago(41 * MIN), job_type: "repair" });
  const gloria = await cust("Gloria Reyes", "0400 555 310", "310 Jacaranda Ave", "Bardon");
  await job(gloria, { title: "Tile roof restoration", stage: "lead", lead_received_at: ago(1 * DAY), first_contacted_at: ago(1 * DAY - 10 * MIN), stage_changed_at: ago(1 * DAY) });

  // Quoting
  const ortiz = await cust("Maria Ortiz", "0421 555 018", "12 Waratah Cres", "Red Hill", { insurance_company: "NRMA", claim_number: "NRMA-2026-8891" });
  const quoteDraft = await job(ortiz, { title: "Tile-to-metal re-roof", stage: "inspection", is_insurance: true, stage_changed_at: ago(1 * DAY), first_contacted_at: ago(2 * DAY) });
  const draftEst = await estimate(quoteDraft.id, "draft", 15800);
  const ken = await cust("Ken Brooks", "0455 555 914", "14 Wattle Ln", "Kelvin Grove");
  const quoteSent = await job(ken, { title: "Re-roof, Klip-Lok", stage: "estimate_sent", stage_changed_at: ago(6 * DAY), first_contacted_at: ago(9 * DAY) });
  await estimate(quoteSent.id, "sent", 11900, { sent_at: ago(6 * DAY) });
  const ann = await cust("Ann Wu", "0466 555 009", "9 Cedar Ave", "Toowong");
  await job(ann, { title: "Inspection — cracked tiles", stage: "inspection", stage_changed_at: ago(3 * DAY), first_contacted_at: ago(3 * DAY) });

  // Sold (build phase, getting ready) — insurance with an approved claim and a variation request out
  const raj = await cust("Raj Patel", "0488 555 902", "902 Moreton St", "New Farm", { insurance_company: "Allianz", claim_number: "ALZ-44781" });
  const sold = await job(raj, {
    title: "Full re-roof, COLORBOND Trimdek", stage: "sold", is_insurance: true, stage_changed_at: ago(2 * DAY), first_contacted_at: ago(20 * DAY),
    crew_id: jack.id, scheduled_start: dayOffset(8), scheduled_end: dayOffset(9), permit_status: "approved", permit_number: "BCC-26-41187",
    hoa_status: "not_needed", colors_confirmed: true, shingle_color: "Monument", materials_status: "delivered", dumpster_status: "needed",
  });
  const soldEst = await estimate(sold.id, "accepted", 18750, { sent_at: ago(10 * DAY), accepted_at: ago(4 * DAY), accepted_name: "Raj Patel" });
  const [claim] = await ins("claims", [{ job_id: sold.id, carrier: "Allianz", claim_number: "ALZ-44781", stage: "approved", rcv_amount: 19400, deductible: 1000 }]);
  await ins("claim_checks", [{ claim_id: claim.id, kind: "acv", payer: "carrier", label: "First payment", expected_amount: 13400 }]);
  await ins("supplements", [{ claim_id: claim.id, round: 1, status: "submitted", submitted_on: dayOffset(-2), requested_amount: 640, next_follow_up_on: dayOffset(3) }]);
  for (let i = 0; i < 6; i++) await ins("job_files", [{ job_id: sold.id, kind: "photo", storage_path: `${orgId}/${sold.id}/seed-${i}.jpg`, category: "damage" }]);
  await ins("job_notes", [{ job_id: sold.id, body: "Gate code is 4417, dog will be inside.", author_name: "Alice Owner" }]);

  const lisa = await cust("Lisa Moore", "0499 555 041", "41 Maple Dr", "Wilston");
  const scheduledNoPermit = await job(lisa, { title: "Gutters & downpipes", stage: "scheduled", stage_changed_at: ago(9 * DAY), crew_id: mia.id, scheduled_start: dayOffset(12), scheduled_end: dayOffset(12), job_type: "gutters", permit_status: "applied", first_contacted_at: ago(20 * DAY) });
  await estimate(scheduledNoPermit.id, "accepted", 12300, { accepted_at: ago(9 * DAY) });

  // Building today
  const wei = await cust("Wei Chen", "0411 555 018", "18 Aspen Ct", "Ashgrove", { insurance_company: "QBE" });
  const building = await job(wei, {
    title: "Re-roof after storm", stage: "in_progress", is_insurance: true, stage_changed_at: ago(0.2 * DAY), crew_id: jack.id, scheduled_start: dayOffset(0), scheduled_end: dayOffset(1),
    schedule_locked: true, permit_status: "approved", colors_confirmed: true, materials_status: "delivered", dumpster_status: "delivered", first_contacted_at: ago(30 * DAY),
  });
  await estimate(building.id, "accepted", 21600, { accepted_at: ago(14 * DAY) });
  const [qbe] = await ins("claims", [{ job_id: building.id, carrier: "QBE", claim_number: "QBE-1182", stage: "approved", rcv_amount: 21600 }]);
  // Variation request sent 10 days ago, follow-up overdue → shows in "Waiting on you"
  await ins("supplements", [{ claim_id: qbe.id, round: 1, status: "submitted", submitted_on: dayOffset(-10), requested_amount: 1240, next_follow_up_on: dayOffset(-1) }]);
  await ins("job_events", [{ job_id: building.id, kind: "tear_off_started", created_by_name: "Jack" }]);
  const dep = await invoice(building.id, 6480, { kind: "deposit", milestone_label: "Deposit" });
  await pay(dep.id, 6480, dayOffset(-3));

  // Also on a roof today: scheduled (locked) gutter job for Mia's crew
  const pete = await cust("Pete Walsh", "0477 555 902", "902 Elm St", "Paddington");
  const today2 = await job(pete, { title: "Gutter replacement", stage: "scheduled", stage_changed_at: ago(3 * DAY), crew_id: mia.id, scheduled_start: dayOffset(0), scheduled_end: dayOffset(0), schedule_locked: true, job_type: "gutters", permit_status: "not_needed", colors_confirmed: true, materials_status: "delivered", dumpster_status: "not_needed", first_contacted_at: ago(10 * DAY) });
  await estimate(today2.id, "accepted", 4200, { accepted_at: ago(5 * DAY) });
  await ins("job_events", [{ job_id: today2.id, kind: "on_my_way", created_by_name: "Mia" }]);

  // Wrapping up
  const sam = await cust("Sam Nguyen", "0422 555 006", "6 Willow Pl", "Bardon");
  const done = await job(sam, { title: "Roof restoration", stage: "completed", stage_changed_at: ago(2 * DAY), completed_at: ago(2 * DAY), crew_id: mia.id, scheduled_start: dayOffset(-4), scheduled_end: dayOffset(-3), walkthrough_signed_at: ago(2 * DAY), walkthrough_name: "Sam Nguyen", first_contacted_at: ago(40 * DAY) });
  await estimate(done.id, "accepted", 14200, { accepted_at: ago(30 * DAY) });
  const finalInv = await invoice(done.id, 14200, { kind: "final", milestone_label: "Final", due_date: dayOffset(-1) });
  await pay(finalInv.id, 9200, dayOffset(-1));
  const tom = await cust("Tom Hart", "0433 555 022", "22 Spruce St", "Toowong");
  const paid = await job(tom, { title: "Leak repair", stage: "paid", stage_changed_at: ago(5 * DAY), completed_at: ago(7 * DAY), job_type: "repair", walkthrough_signed_at: ago(7 * DAY), warranty_registered_at: ago(6 * DAY), first_contacted_at: ago(20 * DAY) });
  await estimate(paid.id, "accepted", 9800, { accepted_at: ago(15 * DAY) });
  const paidInv = await invoice(paid.id, 9800, { kind: "final" });
  await pay(paidInv.id, 9800, dayOffset(-5));
  // Old paid job (outside 30 days) and a lost job: both hidden from the board
  const old = await cust("Olive Grant", "0444 555 111", "3 Fig Tree Rd", "Milton");
  await job(old, { title: "Old re-roof", stage: "paid", stage_changed_at: ago(60 * DAY) });
  const lost = await cust("Larry Lost", "0444 555 222", "1 Nowhere St", "Milton");
  await job(lost, { title: "Lost quote", stage: "lost", stage_changed_at: ago(5 * DAY) });

  return { jack, mia, leadA, leadB, quoteDraft, draftEst, quoteSent, sold, soldEst, building, done, paid, today2, claim };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  const shot = (name, p = page, fullPage = true) => p.screenshot({ path: `${SHOTS}/${PREFIX}-${name}.png`, fullPage });
  const noHScroll = (p = page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  console.log("1. Sign up + company, seed an Australian roofing company");
  const email = `alice${stamp}@example.com`;
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Alice Owner");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', "Summit Roofing");
  await page.fill('input[name="phone"]', "07 3555 0100");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const [m] = await must(admin.from("memberships").select("org_id, user_id").eq("email", email));
  const S = await seed(m.org_id, m.user_id);
  console.log("  seeded org", m.org_id);

  console.log("2. Today");
  await page.goto(BASE + "/app");
  await shot("today");
  if (!BEFORE) {
    check(/Good (morning|afternoon|evening), Alice/.test(await page.locator("h1").first().textContent()), "greeting with first name");
    const dateLine = await page.locator("[data-today-date]").textContent();
    check(/^[A-Z][a-z]+day,? \d{1,2} [A-Z][a-z]+$/.test(dateLine.trim()), `en-AU date line (${dateLine.trim()})`);
    const tiles = page.locator("[data-money-tile]");
    check((await tiles.count()) === 3, "three money tiles");
    check(/\$\d/.test(await tiles.nth(0).textContent()) && (await tiles.nth(0).textContent()).includes("Collected this month"), "collected this month tile");
    check((await tiles.nth(1).textContent()).includes("$13,400 waiting on insurers"), "owed tile shows money waiting on insurers");
    check((await tiles.nth(2).textContent()).includes("1 homeowner deciding"), "quotes out tile counts quotes out");
    const call = page.locator("[data-waiting-leads]");
    check((await call.locator("li").count()) === 2, "Call now lists the two uncontacted leads");
    check((await call.locator("li").first().textContent()).includes("Dan Fischer"), "longest-waiting lead first");
    check((await call.locator("[data-lead-timer]").count()) === 2, "live minutes-waiting timers");
    check(await call.getByRole("link", { name: /Call 0412 555 142/ }).isVisible(), "Call button shows the number");
    const waiting = page.locator("[data-waiting-on-you] li");
    const wText = await page.locator("[data-waiting-on-you]").textContent();
    check(wText.includes("Send the Ortiz quote") || wText.includes("Send the quote"), "waiting on you: send quote");
    check(/variation request/i.test(wText), "waiting on you: follow up the variation request");
    check(/Chase .*payment|still owed/i.test(wText), "waiting on you: chase payment");
    check(/review/i.test(wText), "waiting on you: ask for a review");
    check((await waiting.first().getByRole("link", { name: "Open job" }).count()) === 1, "each task has Open job");
    const roofs = page.locator("[data-on-roofs] [data-roof-job]");
    check((await roofs.count()) === 2, "On roofs today shows the two jobs on a roof today");
    check((await page.locator("[data-on-roofs]").textContent()).includes("Strip started"), "roof card shows the latest field status");
    // search
    await page.fill('input[name="q"]', "ALZ-44781");
    await page.press('input[name="q"]', "Enter");
    await page.waitForURL(/q=ALZ/);
    check((await page.locator("[data-search-results]").textContent()).includes("Raj Patel"), "search by claim number finds the job");
    await page.goto(BASE + "/app?q=0433%20555%20177");
    check((await page.locator("[data-search-results]").textContent()).includes("Dan Fischer"), "search by phone finds the customer");
    await page.goto(BASE + "/app?q=Moreton");
    check((await page.locator("[data-search-results]").textContent()).includes("Raj Patel"), "search by address");
    // Mark contacted from Today
    await page.goto(BASE + "/app");
    await page.locator("[data-waiting-leads] li", { hasText: "Dan Fischer" }).getByRole("button", { name: "Mark contacted" }).click();
    await page.locator("[data-waiting-leads] li", { hasText: "Dan Fischer" }).waitFor({ state: "detached" });
    check((await page.locator("[data-waiting-leads] li").count()) === 1, "Mark contacted removes the lead from Call now");
  }

  console.log("3. Jobs pipeline");
  await page.goto(BASE + "/app/jobs?filter=all");
  await shot("jobs");
  if (!BEFORE) {
    const cols = page.locator("[data-pipeline-col]");
    check((await cols.count()) === 5, "five columns");
    const names = await cols.locator("h2").allTextContents();
    check(["New leads", "Quoting", "Sold", "Building", "Wrapping up"].every((n, i) => names[i].startsWith(n)), "column names in order");
    const colText = async (k) => page.locator(`[data-pipeline-col="${k}"]`).textContent();
    check((await colText("new")).includes("Sophie Tran") && (await colText("new")).includes("Gloria Reyes"), "leads in New leads");
    check((await colText("quoting")).includes("Maria Ortiz") && (await colText("quoting")).includes("Ken Brooks") && (await colText("quoting")).includes("Ann Wu"), "inspection + estimate_sent in Quoting");
    check((await colText("sold")).includes("Raj Patel") && (await colText("sold")).includes("Lisa Moore"), "sold + scheduled in Sold");
    check((await colText("building")).includes("Wei Chen"), "in_progress in Building");
    const wrap = await colText("wrapping");
    check(wrap.includes("Sam Nguyen") && wrap.includes("Tom Hart") && !wrap.includes("Olive Grant"), "completed + recently paid in Wrapping up (old paid hidden)");
    check(!(await page.locator("main").textContent()).includes("Larry Lost"), "lost jobs hidden");
    const raj = page.locator(`[data-job-card="${S.sold.id}"]`);
    check((await raj.textContent()).includes("$18,750"), "card value = accepted quote total");
    check((await raj.textContent()).includes("Insurance"), "insurance badge");
    check(await raj.locator("[data-next-step]").isVisible(), "card shows a → next step line");
    check((await page.locator(`[data-job-card="${S.leadA.id}"]`).textContent()).includes("Not quoted"), "lead card: Not quoted");
    check(await page.locator(`[data-job-card="${S.leadA.id}"] [data-lead-timer]`).isVisible(), "new lead shows minutes timer");
    check((await page.locator(`[data-job-card="${S.quoteSent.id}"] [data-age]`).textContent()).trim() === "6 d", "days-in-stage chip");
    check((await page.locator(`[data-job-card="${S.quoteSent.id}"] [data-age]`).getAttribute("data-tone")) === "amber", "6 days in Quoting is amber");
    check((await page.locator(`[data-job-card="${S.sold.id}"] span[title^='Assigned to']`).textContent()).trim() === "AO", "assignee initials");
    const header = await page.locator('[data-pipeline-col="quoting"] header').textContent();
    check(header.includes("3") && header.includes("$11,900"), "column header count + total value");
    // filters
    await page.getByRole("link", { name: "Insurance", exact: true }).click();
    await page.waitForURL(/filter=insurance/);
    check(!(await page.locator("main").textContent()).includes("Ken Brooks") && (await page.locator("main").textContent()).includes("Raj Patel"), "Insurance filter");
    await page.getByRole("link", { name: "Retail", exact: true }).click();
    await page.waitForURL(/filter=retail/);
    check((await page.locator("main").textContent()).includes("Ken Brooks") && !(await page.locator("main").textContent()).includes("Raj Patel"), "Retail filter");
    await page.getByRole("link", { name: "My jobs", exact: true }).click();
    await page.waitForURL(/filter=mine/);
    check(await page.locator(`[data-job-card="${S.sold.id}"]`).isVisible(), "My jobs includes jobs assigned to me");
    for (const w of [1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(BASE + "/app/jobs?filter=all");
      check(await noHScroll(), `no horizontal page scroll at ${w}px`);
      const fits = await page.evaluate(() => { const el = document.querySelector("[data-pipeline-scroll]"); return el.scrollWidth <= el.clientWidth + 1; });
      check(fits, `all five columns fit at ${w}px (no inner scroll)`);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }

  console.log("4. Job page: timeline + Next step");
  await page.goto(`${BASE}/app/jobs/${S.sold.id}`);
  await shot("job");
  if (!BEFORE) {
    check((await page.locator("h1").textContent()).trim() === "Raj Patel", "header shows the homeowner's name");
    check(await page.locator("h1 + div").getByText("Insurance").isVisible(), "insurance badge next to name");
    check(await page.getByRole("heading", { name: "Full re-roof, COLORBOND Trimdek" }).isVisible(), "job title shown");
    check((await page.locator("[data-job-header]").textContent()).includes("$18,750"), "header shows value");
    check(await page.getByRole("link", { name: "Call" }).first().isVisible() && await page.getByRole("link", { name: "Homeowner view" }).isVisible(), "Call and Homeowner view buttons");
    const steps = page.locator("[data-timeline] [data-step]");
    check((await steps.count()) === 7, "7-step timeline for an insurance job");
    check((await steps.evaluateAll((els) => els.map((e) => e.getAttribute("data-step")))).join(",") === "lead,inspect,quote,claim,build,close,paid", "steps in order: Lead · Inspect · Quote · Claim · Build · Close · Paid");
    check((await page.locator('[data-step="build"]').getAttribute("data-phase")) === "current", "Build is the current phase");
    check((await page.locator('[data-step="quote"]').getAttribute("data-phase")) === "done", "Quote done");
    check((await page.locator('[data-step="quote"]').textContent()).includes("Signed"), "Quote step says Signed");
    check((await page.locator('[data-step="inspect"]').textContent()).includes("6 photos"), "Inspect step shows photo count");
    const bar = page.locator("[data-next-step-bar]");
    check((await bar.textContent()).includes("Order the skip bin"), "Next step: order the skip bin");
    check((await bar.textContent()).includes("2 things left"), "detail counts what's left before locking");
    check((await bar.locator("a, button").count()) === 1, "exactly one primary button in the bar");
    // each step reaches its page
    const targets = { inspect: "/field", quote: `/app/estimates/${S.soldEst.id}`, claim: "/claim", build: "/production", close: "/closeout", paid: "/billing" };
    for (const [k, suffix] of Object.entries(targets)) {
      await page.locator(`[data-step="${k}"] a`).first().click();
      await page.waitForURL((u) => u.pathname.endsWith(suffix));
      check(true, `${k} → ${suffix}`);
      if (!suffix.startsWith("/app/estimates")) check((await page.locator(`[data-step="${k}"] a`).getAttribute("aria-current")) === "page", `${k} highlighted on its page`);
      await page.goto(`${BASE}/app/jobs/${S.sold.id}`);
    }
    // secondary pages still reachable
    for (const [label, suffix] of [["Change orders", "/change-orders"], ["Job cost", "/costs"]]) {
      await page.getByRole("link", { name: label }).first().click();
      await page.waitForURL((u) => u.pathname.endsWith(suffix));
      check(true, `${label} reachable`);
      await page.goto(`${BASE}/app/jobs/${S.sold.id}`);
    }
    check(await page.getByText("Pipeline stage").isVisible() && await page.getByText("Notes & activity").isVisible(), "overview cards still there");
    check(await page.getByText("Gate code is 4417").isVisible(), "activity shows notes");
    await page.goto(`${BASE}/app/jobs/${S.sold.id}/production`);
    await shot("job-production");

    // retail job: no Claim step; draft estimate → Send quote
    await page.goto(`${BASE}/app/jobs/${S.quoteSent.id}`);
    check((await page.locator("[data-timeline] [data-step]").count()) === 6, "retail job hides the Claim step");
    check((await page.locator("[data-next-step-bar]").textContent()).includes("Follow up on the quote"), "sent 6 days ago → follow up");
    await page.goto(`${BASE}/app/jobs/${S.quoteDraft.id}`);
    check((await page.locator("[data-next-step-bar]").textContent()).includes("Send the quote"), "draft quote → send it");
    await page.locator("[data-next-step-bar] a").click();
    await page.waitForURL((u) => u.pathname === `/app/estimates/${S.draftEst.id}`);
    check(true, "Next step button opens the draft quote");
    // lead: Mark contacted from the overview still works
    await page.goto(`${BASE}/app/jobs/${S.leadA.id}`);
    check((await page.locator("[data-next-step-bar]").textContent()).includes("Call Sophie"), "uncontacted lead → call");
    await shot("job-lead");
    await page.locator("main").getByRole("button", { name: "Mark contacted" }).first().click();
    await page.locator("[data-response-time]").waitFor();
    check(true, "Mark contacted on the job page");
    await page.goto(`${BASE}/app/jobs/${S.done.id}`);
    check((await page.locator('[data-step="close"]').getAttribute("data-phase")) === "current", "completed job → Close phase");
    check(/still owed/.test(await page.locator("[data-next-step-bar]").textContent()), "completed with balance → chase payment");
  }

  console.log("5. Schedule");
  await page.goto(BASE + "/app/schedule");
  await shot("schedule");
  if (!BEFORE) {
    check(await page.getByText("Gutter replacement").first().isVisible(), "schedule shows today's job");
    check((await page.locator('[data-testid="crew-lane"]').count()) >= 2, "crew swimlanes");
  }

  if (!BEFORE) {
    console.log("6. Crew lead: schedule-only Today, Field + Build only on the job");
    const crewEmail = `jack${stamp}@example.com`;
    const { data: u, error } = await admin.auth.admin.createUser({ email: crewEmail, password: "password123", email_confirm: true, user_metadata: { full_name: "Jack Crew" } });
    if (error) throw error;
    await must(admin.from("memberships").insert({ org_id: m.org_id, user_id: u.user.id, role: "crew_lead", full_name: "Jack Crew", email: crewEmail, crew_id: S.jack.id }));
    const cctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
    const cp = await cctx.newPage();
    cp.on("pageerror", (e) => errors.push(e.message));
    await cp.goto(BASE + "/login");
    await cp.fill('input[name="email"]', crewEmail);
    await cp.fill('input[name="password"]', "password123");
    await cp.click('button[type="submit"]');
    await cp.waitForURL(BASE + "/app");
    const t = await cp.locator("main").textContent();
    check(!/\$\d/.test(t) && !t.includes("Call now") && !t.includes("Waiting on you"), "crew lead Today has no money, no leads");
    check(t.includes("Wei Chen"), "crew lead sees their crew's job today");
    await cp.screenshot({ path: `${SHOTS}/${PREFIX}-crew-today.png`, fullPage: true });
    await cp.goto(`${BASE}/app/jobs/${S.building.id}`);
    await cp.waitForURL((u2) => u2.pathname.endsWith("/field") || u2.pathname.endsWith(S.building.id));
    const csteps = await cp.locator("[data-timeline] [data-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-step")));
    check(csteps.join(",") === "inspect,build", `crew lead sees only Field and Build (${csteps.join(",")})`);
    check(!/\$\d/.test(await cp.locator("main").textContent()), "no money on the crew lead's job page");
    await cctx.close();

    console.log("7. Phone width");
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mob.addCookies(await ctx.cookies());
    const mp = await mob.newPage();
    for (const [name, url] of [["today", "/app"], ["jobs", "/app/jobs"], ["job", `/app/jobs/${S.sold.id}`], ["schedule", "/app/schedule"]]) {
      await mp.goto(BASE + url);
      check(await noHScroll(mp), `${name} fits 390px with no horizontal page scroll`);
      await mp.screenshot({ path: `${SHOTS}/${PREFIX}-phone-${name}.png`, fullPage: true });
    }
    await mob.close();
  }

  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  check(real.length === 0, "no browser errors" + (real.length ? `: ${real.join(" | ")}` : ""));
  console.log(BEFORE ? "\nBEFORE SHOTS DONE" : "\nE2E PASSED");
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
