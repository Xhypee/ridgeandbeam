// State compliance end-to-end: job compliance checklist (NSW door-knock tile re-roof over $20k, VIC
// metal plumbing-only re-roof), evidence upload, deposit readiness, state notices, Settings → State rules.
//
//   BASE_URL=http://localhost:3205 node e2e/compliance.js <shots dir>
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.BASE_URL || "http://localhost:3205";
const SHOTS = process.argv[2] || require("os").tmpdir();
const stamp = Date.now();

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const E = env();
const admin = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function must(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sydneyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function seed(orgId) {
  const ins = (table, rows) => must(admin.from(table).insert(rows.map((r) => ({ org_id: orgId, ...r }))).select());
  await must(admin.from("organizations").update({
    state: "NSW", zip: "2000", abn: "51824753556", gst_registered: true, address: "1 George St, Sydney NSW 2000",
    licences: { NSW: { number: "123456C", classes: ["Roof tiling"] }, VIC: { number: "DB-L 12345" } }, service_states: ["NSW", "VIC", "QLD"],
  }).eq("id", orgId));
  const [nswC, vicC] = await ins("customers", [
    { name: "Priya Shah", phone: "0412 555 201", address: "8 Wattle St", city: "Parramatta", state: "NSW", zip: "2150" },
    { name: "Tom Nguyen", phone: "0412 555 202", address: "3 Elm Rd", city: "Box Hill", state: "VIC", zip: "3128" },
  ]);
  const [nsw, vic] = await ins("jobs", [
    { customer_id: nswC.id, title: "Concrete tile re-roof after hail", state: "NSW", site_address: "8 Wattle St, Parramatta NSW", job_type: "replacement", roof_material: "Concrete tile", lead_source: "door_knock", stage: "sold" },
    { customer_id: vicC.id, title: "COLORBOND re-sheet", state: "VIC", site_address: "3 Elm Rd, Box Hill VIC", job_type: "replacement", roof_material: "COLORBOND Custom Orb", lead_source: "website", stage: "estimate_sent" },
  ]);
  const [e1] = await ins("estimates", [{ job_id: nsw.id, status: "accepted", tax_rate: 0, accepted_at: new Date().toISOString(), accepted_name: "Priya Shah" }]);
  await ins("estimate_items", [{ estimate_id: e1.id, description: "Re-roof incl. GST", quantity: 1, unit: "job", unit_price: 30000, unit_cost: 18000, category: "material" }]);
  const [e2] = await ins("estimates", [{ job_id: vic.id, status: "sent", tax_rate: 0 }]);
  await ins("estimate_items", [{ estimate_id: e2.id, description: "Re-sheet incl. GST", quantity: 1, unit: "job", unit_price: 25000, unit_cost: 15000, category: "material" }]);
  return { nsw, vic };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  const shot = (name, p = page) => p.screenshot({ path: `${SHOTS}/compliance-${name}.png`, fullPage: true });
  const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  console.log("1. Sign up + company, seed NSW + VIC jobs");
  const email = `compliance${stamp}@example.com`;
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Casey Owner");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', "Harbour Roofing");
  await page.fill('input[name="phone"]', "02 9555 0100");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const [m] = await must(admin.from("memberships").select("org_id").eq("email", email));
  const S = await seed(m.org_id);

  console.log("2. NSW door-knock tile re-roof ($30,000) compliance checklist");
  const nswUrl = `${BASE}/app/jobs/${S.nsw.id}/compliance`;
  await page.goto(nswUrl);
  check((await page.locator("[data-deposit-ready]").getAttribute("data-deposit-ready")) === "no", "deposit invoice not ready");
  const banner = page.locator("[data-door-knock-banner]");
  check((await banner.getAttribute("data-door-knock-banner")) === "blocked", "door-knock banner blocks payment");
  const until = await banner.getAttribute("data-acl-until");
  check(/^\d{4}-\d{2}-\d{2}$/.test(until) && until > sydneyToday(), `ACL no-payment window ends ${until}`);
  const item = (k) => page.locator(`[data-item="${k}"]`).first();
  check((await item("licence_on_quote").getAttribute("data-status")) === "done", "licence number on quote: done (NSW 123456C set)");
  check((await item("insurance_certificate").innerText()).includes("Blocks deposit"), "HBC certificate blocks the deposit");
  check((await item("written_contract").getAttribute("data-status")) === "done", "written contract done (signed online)");
  check((await item("cooling_off").innerText()).includes("withdraw until"), "cooling-off end date shown");
  check((await item("door_knock_rules").getAttribute("data-status")) === "todo", "door-knock rule still running");
  const panel = page.locator('[data-state-compliance="NSW"]');
  check((await panel.innerText()).includes("New South Wales"), "state panel for New South Wales");
  check((await panel.locator("[data-deposit-max]").getAttribute("data-deposit-max")) === "3000", "max deposit $3,000 (10%)");
  check((await panel.innerText()).includes("123456C"), "panel shows the licence number to print");
  check(await page.locator('[data-notice="nsw_cooling_off"]').isVisible(), "NSW sample cooling-off clause in the notices");
  check((await page.locator('[data-notice="acl_front_page"]').innerText()).includes("Important Notice to the Consumer"), "ACL front-page notice");
  check(await page.locator('[data-notice="acl_termination_form"]').isVisible(), "ACL termination form");
  check((await page.locator("[data-sop-panel]").innerText()).includes("New South Wales"), "security of payment panel");
  await shot("01-nsw-checklist");

  console.log("3. Tick SWMS with a reference");
  const swms = item("swms");
  await swms.locator("summary").click();
  await swms.locator('input[name="reference"]').fill("SWMS-2026-14");
  await swms.getByRole("button", { name: "Done" }).click();
  await swms.getByText("Marked done.").waitFor();
  await page.reload();
  check((await item("swms").getAttribute("data-status")) === "done", "SWMS ticked done");
  check((await item("swms").innerText()).includes("SWMS-2026-14"), "SWMS reference saved");

  console.log("4. Upload the HBC certificate as evidence");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await item("insurance_certificate").locator('input[type="file"]').setInputFiles({ name: "HBC certificate.pdf", mimeType: "application/pdf", buffer: pdf });
  await item("insurance_certificate").getByText("Evidence uploaded and linked.").waitFor({ timeout: 15000 });
  await page.reload();
  check((await item("insurance_certificate").getAttribute("data-status")) === "done", "insurance certificate done after upload");
  check(await item("insurance_certificate").locator("[data-evidence-link]").isVisible(), "evidence link shown");
  const rows = await must(admin.from("job_compliance_items").select("item_key, status, file_id").eq("job_id", S.nsw.id));
  check(rows.some((r) => r.item_key === "insurance_certificate" && r.file_id), "job_compliance_items links the job file");
  const files = await must(admin.from("job_files").select("storage_path, kind").eq("job_id", S.nsw.id));
  check(files.some((f) => f.storage_path.startsWith(`${m.org_id}/${S.nsw.id}/compliance/`) && f.kind === "document"), "evidence stored as a job file");
  check((await page.locator("[data-deposit-ready]").getAttribute("data-deposit-ready")) === "no", "deposit still blocked by the 10-business-day window");

  console.log("5. Job facts: not a door-knock sale, built before 1990");
  await page.selectOption('select[name="door_knock_sale"]', "no");
  await page.selectOption('select[name="built_before_1990"]', "yes");
  await page.getByRole("button", { name: "Save job details" }).click();
  await page.getByText("Job details saved").waitFor();
  await page.reload();
  check((await page.locator("[data-deposit-ready]").getAttribute("data-deposit-ready")) === "yes", "deposit invoice ready once insurance is in and no ACL window");
  check((await page.locator("[data-door-knock-banner]").count()) === 0, "door-knock banner gone");
  check((await item("asbestos_check").innerText()).includes("Built before 1990"), "asbestos prompt for pre-1990 house");
  await shot("02-nsw-ready");

  console.log("6. VIC metal re-roof = plumbing-only");
  await page.goto(`${BASE}/app/jobs/${S.vic.id}/compliance`);
  const vicPanel = page.locator('[data-state-compliance="VIC"]');
  check((await vicPanel.innerText()).includes("plumbing work"), "VIC panel: metal roofing is plumbing work");
  check((await page.locator('[data-item="cooling_off"][data-status="not_needed"]').count()) === 1, "VIC metal: no DBC cooling-off");
  check((await item("plumbing_certificate").getAttribute("data-status")) === "todo", "VIC: plumbing compliance certificate to do");
  check((await page.locator("[data-deposit-ready]").getAttribute("data-deposit-ready")) === "yes", "VIC metal: nothing blocks the deposit");
  await page.selectOption('select[name="roof_system"]', "concrete_tile");
  await page.getByRole("button", { name: "Save job details" }).click();
  await page.getByText("Job details saved").waitFor();
  await page.reload();
  check((await page.locator('[data-state-compliance="VIC"]').innerText()).includes("limited to roof tiling"), "VIC tile: roof tiling registration");
  check((await item("cooling_off").getAttribute("data-status")) === "todo", "VIC tile: cooling-off applies");
  await shot("03-vic-tile");

  console.log("7. Settings → State rules");
  await page.goto(BASE + "/app/settings/state-rules");
  const tabs = await page.locator('nav[aria-label="States"] a').allInnerTexts();
  check(tabs.join(",") === "NSW,VIC,QLD", "tabs for the service states");
  check((await page.locator('[data-testid="state-rules-table"]').innerText()).includes("$5,000"), "NSW table shows the $5,000 licence threshold");
  check((await page.locator("[data-report-change]").getAttribute("href")).startsWith("mailto:"), "Report a change mailto");
  check((await page.getByText(/Last verified 06\/11\/2026/).count()) > 0, "last verified date");
  await shot("04-settings-nsw");
  await page.click('nav[aria-label="States"] >> text=VIC');
  await page.waitForURL(/state=VIC/);
  check((await page.getByText(/Coming change — 31 Mar 2027/).count()) === 1, "VIC: 31 Mar 2027 change flagged");
  await page.fill('input[name="value"]', "30000");
  await page.selectOption('select[name="roof"]', "terracotta_tile");
  await page.fill('input[name="date"]', "2027-04-01");
  await page.getByRole("button", { name: "Show what applies" }).click();
  await page.waitForURL(/value=30000/);
  const scen = page.locator('[data-state-compliance="VIC"]');
  check((await scen.locator("[data-deposit-max]").getAttribute("data-deposit-max")) === "3000", "VIC from 31 Mar 2027: flat 10% deposit");
  check((await page.locator('[data-testid="state-rules-table"]').innerText()).includes("Flat 10%"), "VIC table as at 01/04/2027");
  await shot("05-settings-vic-2027");

  console.log("8. Phone width (390px)");
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.addCookies(await ctx.cookies());
  const mp = await mob.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  for (const [name, url] of [["compliance", nswUrl], ["state-rules", BASE + "/app/settings/state-rules?state=QLD&value=4000&job=gutters&roof=metal"]]) {
    await mp.goto(url);
    check(await noHScroll(mp), `${name} fits 390px with no horizontal page scroll`);
    await mp.screenshot({ path: `${SHOTS}/compliance-phone-${name}.png`, fullPage: true });
  }
  check((await mp.locator('[data-state-compliance="QLD"]').innerText()).includes("Queensland Home Warranty Scheme"), "QLD gutters $4,000: home warranty");

  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await browser.close();
  console.log("compliance e2e PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
