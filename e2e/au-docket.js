// End-to-end: the receipt docket quote. Synthetic data only: a made-up company, customer and a generated vector plan
// (the same L-shaped hip roof as e2e/au-plans.js). Measure from plans, the docket as the quote's default view,
// switch profile and colour, remove / add extras (live totals that match the database), the detailed editor link,
// send, the customer's docket link (add an extra, sign), the stored items, the locked receipt and the invoice.
//   BASE_URL=http://localhost:3208 node e2e/au-docket.js /tmp/shots
// Optional: DESIGN_SHOTS=/dir for 1440×900 @2x screenshots of each state.
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3208";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || os.tmpdir();
const DESIGN = process.env.DESIGN_SHOTS || null;
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const near = (a, b, tol, msg) => check(Math.abs(Number(a) - Number(b)) <= tol, `${msg} (${a} ≈ ${b})`);
const sql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const moneyNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));

// ---------------------------------------------------------------------------
// Synthetic plans (as e2e/au-plans.js): L-shaped hip roof, 1:100 on A3, 25°, 3 downpipes, made-up title block.
// ---------------------------------------------------------------------------
const S = 100, OX = 40, OY = 70;
const mm = (v) => v / S;
const roofLines = [
  [[0, 0], [14000, 0]], [[14000, 0], [14000, 8000]], [[14000, 8000], [8000, 8000]], [[8000, 8000], [8000, 14000]], [[8000, 14000], [0, 14000]], [[0, 14000], [0, 0]],
  [[0, 0], [4000, 4000]], [[14000, 0], [10000, 4000]], [[14000, 8000], [10000, 4000]], [[8000, 14000], [4000, 10000]], [[0, 14000], [4000, 10000]],
  [[4000, 4000], [10000, 4000]], [[4000, 4000], [4000, 10000]], [[8000, 8000], [4000, 4000]],
];
const svgLine = ([a, b], w = 0.25, c = "#333") => `<line x1="${OX + mm(a[0])}" y1="${OY + mm(a[1])}" x2="${OX + mm(b[0])}" y2="${OY + mm(b[1])}" stroke="${c}" stroke-width="${w}" />`;
const txt = (s, x, y, size = 2.6) => `<div style="position:absolute;left:${x}mm;top:${y}mm;font:${size}mm Arial, sans-serif;white-space:nowrap">${s}</div>`;
const titleBlock = [
  txt("PROJECT ADDRESS:", 330, 180), txt("8 BANKSIA CRES", 330, 185), txt("TOOWONG QLD 4066", 330, 190),
  txt("CLIENT", 330, 200), txt("WATTLE BUILT HOMES PTY LTD", 330, 205), txt("PROJECT", 330, 215), txt("NEW DWELLING", 330, 220),
  txt("DATE", 330, 230), txt("01/10/26", 330, 235),
].join("");
const sheet = (body) => `<section style="position:relative;width:420mm;height:297mm;page-break-after:always;overflow:hidden">${body}${titleBlock}
  <svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297"><rect x="5" y="5" width="410" height="287" fill="none" stroke="#000" stroke-width="0.5"/><line x1="320" y1="5" x2="320" y2="292" stroke="#000" stroke-width="0.5"/></svg></section>`;
const floor = sheet(`<svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297">
    ${[[[6, 6], [134, 6]], [[134, 6], [134, 74]], [[134, 74], [74, 74]], [[74, 74], [74, 134]], [[74, 134], [6, 134]], [[6, 134], [6, 6]]].map(([a, b]) => svgLine([[a[0] * 100, a[1] * 100], [b[0] * 100, b[1] * 100]], 0.5, "#000")).join("")}
  </svg>${txt("FLOOR PLAN", 40, 260, 5)}${txt("SCALE 1:100 @ A3", 40, 268)}${txt("SINGLE STOREY", 200, 120)}`);
const dps = [[14000, 2000], [0, 12000], [8000, 13000]];
const roof = sheet(`<svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297">
    ${roofLines.map((l) => svgLine(l)).join("")}
    ${dps.map(([x, y]) => `<rect x="${OX + mm(x) - 0.5}" y="${OY + mm(y) - 0.5}" width="1" height="1" fill="none" stroke="#333" stroke-width="0.25"/>`).join("")}
  </svg>${dps.map(([x, y]) => txt("DP", OX + mm(x) + 1.5, OY + mm(y) - 1, 2)).join("")}
  ${[[2000, 6000], [7000, 1800], [11500, 5200], [6000, 11000], [2000, 11000], [6200, 7000]].map(([x, y]) => txt("25°", OX + mm(x), OY + mm(y), 2.4)).join("")}
  ${txt("ROOF PLAN", 40, 260, 5)}${txt("SCALE 1:100 @ A3", 40, 268)}${txt("COLORBOND ROOF.", 200, 240, 2.4)}`);

async function makePdf(browser, file) {
  const p = await browser.newPage();
  await p.setContent(`<!doctype html><html><head><style>@page{size:420mm 297mm;margin:0}body{margin:0}</style></head><body>${floor}${roof}</body></html>`);
  await p.pdf({ path: file, width: "420mm", height: "297mm", printBackground: true });
  await p.close();
}

async function noHorizontalScroll(page, what) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(sw <= iw + 1, `${what}: no horizontal scroll at 390px (${sw} <= ${iw})`);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const pdfFile = path.join(os.tmpdir(), `au-docket-${stamp}.pdf`);
  await makePdf(browser, pdfFile);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const design = async (p, name, full = true) => {
    if (!DESIGN) return;
    const vp = p.viewportSize();
    const d = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: await p.context().storageState() })).newPage();
    await d.goto(p.url());
    await d.waitForLoadState("networkidle").catch(() => {});
    await d.screenshot({ path: `${DESIGN}/${name}.png`, fullPage: full });
    await d.context().close();
    return vp;
  };

  console.log("1. Sign up, company (ABN, QLD licence), prices");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Dana Docket");
  await page.fill('input[name="email"]', `au-docket${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Gumtree Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "0412 345 678");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select id from organizations where name = 'Gumtree Roofing ${stamp}'`);
  sql(`update organizations set abn = '51824753556', state = 'QLD', zip = '4066', licences = '{"QLD": {"number": "1234567", "classes": ["Roofing"]}}'::jsonb where id = '${orgId}'`);
  const prices = {
    metal_sheet_good: 22, metal_sheet_better: 29.7, metal_sheet_best: 38.5, labour_install: 38, ridge_capping: 24.2, barge_capping: 24, valley_iron: 26.4, roof_battens: 7.7,
    roof_screws: 110, flashing: 25, sarking: 198, safety_mesh: 231, gutter: 35.2, downpipe: 88, fascia: 22, edge_protection: 1650, whirlybird: 165, skip_bin: 550,
  };
  for (const [k, p] of Object.entries(prices)) {
    const [key, tier] = k.startsWith("metal_sheet_") ? ["metal_sheet", k.slice(12)] : [k, null];
    sql(`update catalog_items set unit_price = ${p}, unit_cost = ${Math.round(p * 60) / 100} where org_id = '${orgId}' and calc_key = '${key}' and tier ${tier ? `= '${tier}'` : "is null"}`);
  }
  // ZINCALUME Trimdek priced (the customer can switch to it); COLORBOND Custom Orb left at $0 (the roofer gets a warning).
  sql(`update catalog_items set unit_price = 26, unit_cost = 15.6 where org_id = '${orgId}' and name = 'ZINCALUME Trimdek 0.42 BMT'`);

  console.log("2. Price book: Extra flag and the why line");
  await page.goto(BASE + "/app/settings/price-book");
  const sarkRow = page.locator('[data-testid="price-row"]', { has: page.locator('input[value="Sarking (roll)"]') });
  check(await sarkRow.locator('[data-testid="extra-flag"]').isChecked(), "sarking is an extra by default");
  const installRow = page.locator('[data-testid="price-row"]', { has: page.locator('input[value="Installation labour"]') });
  check(!(await installRow.locator('[data-testid="extra-flag"]').isChecked()), "installation labour is a main line");
  await sarkRow.locator('input[aria-label="Why add it"]').fill("Cooler house, no drips");
  await sarkRow.locator('button:has-text("Save")').click();
  await sarkRow.getByText("Saved.").waitFor();
  check(sql(`select coalesce(is_extra::text, 'null') || '|' || blurb from catalog_items where org_id = '${orgId}' and calc_key = 'sarking'`) === "true|Cooler house, no drips", "Extra flag and why line saved");
  check((await page.locator('[data-testid="icon-tile"]').count()) >= 29, "price book shows the icon set");
  await shot(page, "d01-price-book");
  if (DESIGN) {
    const d = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })).newPage();
    await d.goto(BASE + "/app/settings/price-book");
    await d.locator('[data-testid="price-row"]', { has: d.locator('input[value="Sarking (roll)"]') }).scrollIntoViewIfNeeded();
    await d.evaluate(() => window.scrollBy(0, -200));
    await d.screenshot({ path: `${DESIGN}/price-book-extra.png` });
    await d.getByText("Item icons").scrollIntoViewIfNeeded();
    await d.locator("section", { has: d.getByText("Item icons") }).last().screenshot({ path: `${DESIGN}/icon-set.png` });
    await d.context().close();
  }

  console.log("3. Customer, job, quote: the docket is the default view");
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Sam Sample");
  await page.fill('input[name="email"]', "sam@example.com");
  await page.fill('input[name="job_title"]', "New dwelling roof");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobId = page.url().split("/").pop();
  sql(`update jobs set state = 'QLD', zip = '4066' where id = '${jobId}'`);
  await page.click('button:has-text("New quote")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  // New quotes open in the quoting engine; this test drives the receipt docket (?view=docket).
  const estId = page.url().split("/").pop();
  const estUrl = `${BASE}/app/estimates/${estId}?view=docket`;
  await page.goto(estUrl);
  await page.locator('[data-testid="docket-editor"]').waitFor();
  check(await page.locator('[data-testid="docket-empty"]').isVisible(), "new quote opens on the docket, asking to measure");
  check((await page.locator('[data-testid="docket-top"]').innerText()).includes("ABN 51 824 753 556 · QLD 1234567"), "receipt top line: ABN and QLD licence");

  console.log("4. Measure from plans");
  await page.click('[data-testid="measure-from-plans"]');
  await page.waitForURL(/\/plans$/);
  await page.setInputFiles('[data-testid="plans-input"]', pdfFile);
  await page.waitForSelector('[data-testid="details-step"]', { timeout: 60000 });
  await page.click('[data-testid="details-next"]');
  await page.waitForSelector('[data-testid="total-area"]');
  await page.click('[data-testid="pick-sheets"]');
  await page.click('[data-testid="profile-custom_orb"]');
  await page.click('button[aria-label="Woodland Grey"]');
  await page.click('[data-testid="add-to-quote"]');
  await page.locator('[data-testid="done-card"]').waitFor({ timeout: 30000 });
  check(sql(`select roof_profile || '|' || roof_colour from estimates where id = '${estId}'`) === "custom_orb|Woodland Grey", "plans set the docket's profile and colour");
  check(sql(`select count(*) from estimate_items where estimate_id = '${estId}' and extra_status = 'offered'`) !== "0", "plans filled offered extras too");
  await page.click('[data-testid="open-quote"]');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  await page.goto(estUrl);

  console.log("5. The docket (COLORBOND Custom Orb isn't priced yet)");
  await page.locator('[data-testid="docket"]').waitFor();
  check((await page.locator('[data-testid="roof-title"]').innerText()) === "New Custom Orb roof", "roof header: New Custom Orb roof");
  const facts = await page.locator('[data-testid="roof-facts"]').innerText();
  check(/176\.5 m² · 6 panels at 25° · Woodland Grey/.test(facts), `facts line (${facts})`);
  check((await page.locator('[data-testid="docket-roof"] polygon').count()) === 6, "roof drawn from the plans: 6 panels");
  check((await page.locator('[data-testid="sheet-price-warning"]').innerText()).includes("No price for COLORBOND Custom Orb"), "missing-price warning for COLORBOND Custom Orb");
  check(await page.locator('[data-testid="send-quote"]').isDisabled(), "Send is blocked until the sheet is priced");
  check(sql(`select unit_price from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`) === "0.00", "never borrows the ZINCALUME price");
  await shot(page, "d02a-missing-price");
  await design(page, "missing-price-warning", false);
  check((await page.locator('[data-testid="main-line"]').count()) >= 6, "main lines listed");
  check((await page.locator('[data-testid="main-line"] [data-icon="sheets"]').count()) === 1, "sheet line has the sheet icon");
  const addedIds = await page.locator('[data-testid="added-extra"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-extra")));
  const offeredIds = await page.locator('[data-testid="offered-extra"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-extra")));
  check(addedIds.includes("gutters") && addedIds.includes("sarking"), `added extras on the receipt (${addedIds.join(", ")})`);
  check(offeredIds.includes("whirlybird") && offeredIds.includes("fascia"), `often added (${offeredIds.join(", ")})`);
  const total = async (p = page) => Number(await p.locator('[data-testid="docket-total"]').getAttribute("data-value"));
  const saved = async () => { await page.waitForFunction(() => document.querySelector('[data-testid="save-state"]')?.textContent === "Saved"); };
  const dbTotal = () => Number(sql(`select total from estimate_totals where estimate_id = '${estId}'`));
  near(await total(), dbTotal(), 0.01, "docket total = database total");
  const ids0 = sql(`select string_agg(id::text, ',' order by calc_key) from estimate_items where estimate_id = '${estId}' and calc_key in ('labour_install', 'sarking', 'metal_sheet')`);

  console.log("6. Profile and colour");
  const sheetQty = (p) => Number(sql(`select round((measurements->'planQty'->'sheets'->'${p}'->>'lm')::numeric, 2) from estimates where id = '${estId}'`));
  await page.click('[data-testid="docket-profile-trimdek"]');
  check((await page.locator('[data-testid="roof-title"]').innerText()) === "New Trimdek roof", "Trimdek button: New Trimdek roof");
  await page.click('button[aria-label="Surfmist"]');
  check((await page.locator('[data-testid="docket-roof"]').getAttribute("data-colour")) === "#e4e2d5", "roof drawing recoloured Surfmist");
  check((await page.locator('[data-testid="sheet-price-warning"]').count()) === 0, "warning gone once the sheet is priced");
  await saved();
  check(sql(`select roof_profile || '|' || roof_colour from estimates where id = '${estId}'`) === "trimdek|Surfmist", "profile and colour saved");
  const sheetRow = sql(`select description || '|' || quantity || '|' || unit_price from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`).split("|");
  check(sheetRow[0] === "COLORBOND Trimdek 0.42 BMT · Surfmist", `sheet line re-priced and named (${sheetRow[0]})`);
  near(sheetRow[1], sheetQty("trimdek"), 0.01, "sheet lm = the plans' Trimdek cut list");
  check(Number(sheetRow[2]) === 29.7, "Trimdek price from the price book");
  check(sql(`select variants->'zincalume'->>'unit_price' || '|' || (variants->'colorbond'->>'unit_price') from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`) === "26|29.7", "sheet line keeps its price in both finishes");
  check(sql(`select string_agg(id::text, ',' order by calc_key) from estimate_items where estimate_id = '${estId}' and calc_key in ('labour_install', 'sarking', 'metal_sheet')`) === ids0, "line ids unchanged across saves");
  near(await total(), dbTotal(), 0.01, "total follows the profile");
  await shot(page, "d02-docket");
  await design(page, "roofer-docket-surfmist-trimdek");

  console.log("7. Remove and add extras; edge protection required");
  const before = await total();
  const mesh = page.locator('[data-testid="added-extra"][data-extra="safety_mesh"]');
  const meshAmt = moneyNum(await mesh.locator("span.tabular-nums").innerText());
  await mesh.locator('button:has-text("Remove")').click();
  near(await total(), before - meshAmt, 0.01, "Remove takes safety mesh off the total");
  check(await page.locator('[data-testid="offered-extra"][data-extra="safety_mesh"]').isVisible(), "safety mesh moved to Often added");
  const whirly = page.locator('[data-testid="offered-extra"][data-extra="whirlybird"]');
  const whirlyAmt = moneyNum((await whirly.locator("span.tabular-nums").innerText()).replace("+", ""));
  await whirly.locator('button:has-text("Add")').click();
  near(await total(), before - meshAmt + whirlyAmt, 0.01, "Add puts whirlybirds on the total");
  const edgeRow = page.locator('[data-testid="added-extra"][data-extra="edge_protection"]');
  check((await edgeRow.locator('[data-testid="required-toggle"]').innerText()).includes("Optional"), "extras are optional by default");
  await edgeRow.locator('[data-testid="required-toggle"]').click();
  check((await edgeRow.locator('[data-testid="required-toggle"]').innerText()).includes("Required"), "edge protection marked required");
  await saved();
  check(sql(`select required from estimate_items where estimate_id = '${estId}' and calc_key = 'edge_protection'`) === "t", "required stored");
  near(await total(), dbTotal(), 0.01, "database total matches after remove/add");
  check(sql(`select extra_status from estimate_items where estimate_id = '${estId}' and calc_key = 'safety_mesh'`) === "offered", "safety mesh stored as offered");
  check(sql(`select measurements->>'includeSafetyMesh' from estimates where id = '${estId}'`) === "false", "calculator switch kept in step");
  await page.reload();
  near(await total(), dbTotal(), 0.01, "total survives a reload");
  await shot(page, "d03-after-remove-add");
  await design(page, "roofer-required-optional");

  console.log("8. Detailed editor");
  await page.click('[data-testid="detailed-editor"]');
  await page.waitForURL(/view=editor/);
  check(await page.locator('[data-testid="cut-list"]').isVisible(), "detailed editor: measurements and cut list");
  check((await page.locator('select[aria-label="On the docket"]').count()) > 0, "line grid shows main / extra per line");
  near(moneyNum(await page.locator('[data-testid="estimate-total"]').innerText()), dbTotal(), 0.01, "detailed editor total = docket total");
  await page.fill('textarea[aria-label="Notes to customer"]', "Colorbond roof with new gutters.");
  await page.click('button:has-text("Save quote")');
  await page.getByText("Saved.").waitFor();
  check(sql(`select string_agg(id::text, ',' order by calc_key) from estimate_items where estimate_id = '${estId}' and calc_key in ('labour_install', 'sarking', 'metal_sheet')`) === ids0, "the detailed editor keeps line ids too");
  check(sql(`select required from estimate_items where estimate_id = '${estId}' and calc_key = 'edge_protection'`) === "t", "and keeps required");
  await shot(page, "d04-detailed-editor");
  await page.click('[data-testid="docket-view"]');
  await page.locator('[data-testid="docket"]').waitFor();

  console.log("9. Send the quote");
  await page.click('[data-testid="send-quote"]');
  await page.locator('[data-testid="sent-card"]').waitFor();
  const link = await page.locator('[data-testid="customer-link"]').innerText();
  check(/\/q\/[A-Za-z0-9_-]+$/.test(link), "sent: customer link shown");
  check(sql(`select status from estimates where id = '${estId}'`) === "sent", "status sent");
  await shot(page, "d05-sent");

  console.log("10. Customer docket: colour, add, remove (optional only)");
  const pub = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DESIGN ? 2 : 1 });
  const cpage = await pub.newPage();
  cpage.on("pageerror", (e) => errors.push(e.message));
  cpage.on("dialog", (d) => d.accept());
  const publicPath = link.slice(link.indexOf("/q/"));
  await cpage.goto(BASE + publicPath);
  await cpage.locator('[data-testid="docket"]').waitFor();
  check(await cpage.getByText("Prepared for").isVisible(), "customer page: prepared for");
  check((await cpage.locator('[data-testid="roof-title"]').innerText()) === "New Trimdek roof", "customer sees the roofer's profile");
  check((await cpage.locator('[data-testid="docket-roof"]').getAttribute("data-colour")) === "#e4e2d5", "and colour");
  check((await cpage.locator('[data-testid="docket-profile-trimdek"]').count()) === 0, "no profile buttons for the customer");
  check((await cpage.locator('[data-testid="main-line"] button').count()) === 0, "main lines are read only");
  const cBefore = await total(cpage);
  near(cBefore, dbTotal(), 0.01, "customer total = roofer total");
  const cEdge = cpage.locator('[data-testid="added-extra"][data-extra="edge_protection"]');
  check((await cEdge.locator("button").count()) === 0 && (await cEdge.locator('[data-testid="required-badge"]').isVisible()), "required edge protection: no Remove, padlock shown");
  if (DESIGN) await cpage.screenshot({ path: `${DESIGN}/customer-required-optional.png`, fullPage: true });
  await cpage.screenshot({ path: `${SHOTS}/d06-customer-before.png`, fullPage: true });
  // remove an optional extra
  const cSark = cpage.locator('[data-testid="added-extra"][data-extra="sarking"]');
  const sarkAmt = moneyNum(await cSark.locator("span.tabular-nums").innerText());
  await cSark.locator('button:has-text("Remove")').click();
  near(await total(cpage), cBefore - sarkAmt, 0.01, "customer removes sarking (optional): total goes down");
  check(await cpage.locator('[data-testid="offered-extra"][data-extra="sarking"]').isVisible(), "sarking can be added back");
  // add an offered extra
  await cpage.locator('[data-testid="offered-extra"][data-extra="safety_mesh"] button:has-text("Add")').click();
  near(await total(cpage), cBefore - sarkAmt + meshAmt, 0.01, "customer adds safety mesh: total goes up");
  // pick a colour in the other finish: ZINCALUME is re-priced
  const trimLm = Number(sql(`select quantity from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`));
  const zincDiff = Math.round(trimLm * 26 * 100) / 100 - Math.round(trimLm * 29.7 * 100) / 100;
  await cpage.click('[data-testid="customer-colour"][aria-label="ZINCALUME"]');
  check((await cpage.locator('[data-testid="docket-roof"]').getAttribute("data-colour")) === "#a9adb0", "roof recoloured ZINCALUME");
  check((await cpage.locator('[data-testid="main-line"][data-key="metal_sheet"]').innerText()).includes("ZINCALUME Trimdek 0.42 BMT"), "sheet line becomes ZINCALUME Trimdek");
  const cAfter = cBefore - sarkAmt + meshAmt + zincDiff;
  near(await total(cpage), cAfter, 0.01, "ZINCALUME price applied live");
  if (DESIGN) await cpage.screenshot({ path: `${DESIGN}/customer-picks-colour.png`, fullPage: false });
  await cpage.screenshot({ path: `${SHOTS}/d07-customer-after.png`, fullPage: true });

  console.log("11. The roofer edits while the customer has the link open");
  const fasc = page.locator('[data-testid="offered-extra"][data-extra="fascia"]');
  const fasciaAmt = moneyNum((await fasc.locator("span.tabular-nums").innerText()).replace("+", ""));
  await fasc.locator('button:has-text("Add")').click();
  await saved();
  await cpage.locator('[data-testid="quote-updated"]').waitFor({ timeout: 20000 });
  check((await cpage.locator('[data-testid="quote-updated"]').innerText()).includes(`updated by Gumtree Roofing ${stamp}`), "customer sees 'This quote was just updated'");
  near(await total(cpage), cAfter + fasciaAmt, 0.01, "new total includes the roofer's fascia");
  check((await cpage.locator('[data-testid="added-extra"][data-extra="sarking"]').count()) === 0, "customer's removal kept");
  check((await cpage.locator('[data-testid="added-extra"][data-extra="safety_mesh"]').count()) === 1, "customer's added extra kept");
  check((await cpage.locator('[data-testid="docket-roof"]').getAttribute("data-colour")) === "#a9adb0", "customer's colour kept");
  if (DESIGN) await cpage.screenshot({ path: `${DESIGN}/customer-quote-updated.png`, fullPage: false });

  console.log("12. Signing an outdated price is refused, then succeeds");
  // Hold the page's background version check so the change below is only discovered when signing.
  await cpage.route("**/q/**", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && (r.postData() ?? "").startsWith("[")) return route.abort();
    return route.continue();
  });
  await cpage.fill('input[name="name"]', "Sam Sample");
  const sig = await cpage.locator('canvas[aria-label^="Signature"]').boundingBox();
  await cpage.mouse.move(sig.x + 20, sig.y + sig.height / 2);
  await cpage.mouse.down();
  for (let i = 1; i <= 12; i++) await cpage.mouse.move(sig.x + 20 + i * 18, sig.y + sig.height / 2 + (i % 2 ? -25 : 25));
  await cpage.mouse.up();
  await cpage.check('input[name="agree"]');
  sql(`update estimates set notes = 'Price includes a site clean-up.' where id = '${estId}'`); // the roofer changes the quote
  await cpage.click('button:has-text("Accept")');
  await cpage.locator('[role="alert"]', { hasText: "was just updated by" }).waitFor({ timeout: 15000 });
  check(sql(`select status from estimates where id = '${estId}'`) === "sent", "outdated signature refused (still sent)");
  check(await cpage.getByText("Price includes a site clean-up.").isVisible(), "page refreshed to the latest quote");
  near(await total(cpage), cAfter + fasciaAmt, 0.01, "choices still applied after the refresh");
  await cpage.click('button:has-text("Accept")');
  await cpage.getByText("Your acceptance has been recorded").waitFor();
  check(sql(`select status from estimates where id = '${estId}'`) === "accepted", "accepted on the second try");
  check(sql(`select extra_status || '|' || customer_added from estimate_items where estimate_id = '${estId}' and calc_key = 'safety_mesh'`) === "added|true", "safety mesh stored as added by the customer");
  check(sql(`select extra_status || '|' || customer_removed from estimate_items where estimate_id = '${estId}' and calc_key = 'sarking'`) === "offered|true", "sarking stored as removed by the customer");
  check(sql(`select extra_status || '|' || required from estimate_items where estimate_id = '${estId}' and calc_key = 'edge_protection'`) === "added|true", "required edge protection kept");
  check(sql(`select roof_colour || '|' || colour_by_customer from estimates where id = '${estId}'`) === "ZINCALUME|true", "colour chosen by the customer stored");
  check(sql(`select description || '|' || unit_price from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`) === "ZINCALUME Trimdek 0.42 BMT|26.00", "sheet re-priced server-side for ZINCALUME");
  near(dbTotal(), cAfter + fasciaAmt, 0.01, "accepted total = what the customer saw");
  check(sql(`select body from notifications where org_id = '${orgId}' and kind = 'estimate_accepted' order by created_at desc limit 1`).includes("removed Sarking"), "notification names the removal");
  await cpage.screenshot({ path: `${SHOTS}/d08-customer-signed.png`, fullPage: true });

  console.log("13. Roofer's copy, invoice");
  await page.goto(estUrl);
  await page.locator('[data-testid="signed-receipt"]').waitFor();
  check((await page.locator('[data-testid="docket-profile-trimdek"]').count()) === 0, "accepted docket is read only");
  check(await page.locator('[data-testid="added-extra"][data-extra="safety_mesh"]').getByText("Added by customer").isVisible(), "shows the customer's pick");
  check(await page.locator('[data-testid="removed-extra"][data-extra="sarking"]').getByText("Removed by customer").isVisible(), "shows 'Removed by customer'");
  check((await page.locator('[data-testid="roof-badge"]').innerText()) === "Colour chosen by customer", "shows 'Colour chosen by customer'");
  check((await page.locator('[data-testid="added-extra"] button').count()) === 0, "no Remove once accepted");
  await shot(page, "d09-signed");
  await design(page, "roofer-removed-by-customer");
  if (DESIGN) {
    const d = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })).newPage();
    await d.emulateMedia({ media: "print" });
    await d.goto(estUrl);
    await d.screenshot({ path: `${DESIGN}/print-roofer.png`, fullPage: true });
    await d.context().close();
  }
  await page.click('button:has-text("Create invoice")');
  await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+$/);
  const invId = page.url().split("/").pop();
  const counted = Number(sql(`select count(*) from estimate_items where estimate_id = '${estId}' and extra_status is distinct from 'offered'`));
  check(Number(sql(`select count(*) from invoice_items where invoice_id = '${invId}'`)) === counted, `invoice has the ${counted} quoted lines`);
  check(sql(`select count(*) from invoice_items where invoice_id = '${invId}' and description = 'Safety mesh (roll)'`) === "1", "invoice includes the customer's safety mesh");
  check(sql(`select count(*) from invoice_items where invoice_id = '${invId}' and description = 'Sarking (roll)'`) === "0", "invoice leaves out the sarking the customer removed");
  near(sql(`select total from invoice_totals where invoice_id = '${invId}'`), dbTotal(), 0.01, "invoice total = accepted quote total");

  console.log("14. Roof drawings without plans: satellite tracing and typed-in sections");
  const lat = -27.4836, lng = 152.9934, m2lat = 1 / 110574, m2lng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  const P = (x, y) => [Math.round((lat + y * m2lat) * 1e7) / 1e7, Math.round((lng + x * m2lng) * 1e7) / 1e7]; // x east, y north (m)
  const facets = [ // a 12 m × 8 m hip roof plus a flat patio roof to the east
    { label: "South", pitch: 22.5, points: [P(0, 0), P(12, 0), P(8, 4), P(4, 4)] },
    { label: "North", pitch: 22.5, points: [P(0, 8), P(4, 4), P(8, 4), P(12, 8)] },
    { label: "West", pitch: 22.5, points: [P(0, 0), P(4, 4), P(0, 8)] },
    { label: "East", pitch: 22.5, points: [P(12, 0), P(12, 8), P(8, 4)] },
    { label: "Patio", pitch: 5, points: [P(12, 1.5), P(17, 1.5), P(17, 6.5), P(12, 6.5)] },
  ];
  const sections = facets.map((f) => ({ label: f.label, area: 10, pitch: f.pitch, system: "metal", profile: "trimdek" }));
  const satM = JSON.stringify({ units: "metric", jobType: "reroof", existingRoof: "tile", sections, satellite: { units: "metric", facets } }).replace(/'/g, "''");
  const satId = sql(`insert into estimates (org_id, job_id, tax_rate, gst_inclusive, measurements, measurement_source, roof_profile, roof_colour) values ('${orgId}', '${jobId}', 10, true, '${satM}'::jsonb, 'satellite', 'trimdek', 'Basalt') returning id`).split("\n")[0];
  await page.goto(`${BASE}/app/estimates/${satId}?view=docket`);
  await page.locator('[data-testid="docket-roof"][data-kind="satellite"]').waitFor();
  check((await page.locator('[data-testid="docket-roof"] polygon').count()) === 5, "satellite quote: the 5 traced facets are drawn");
  await shot(page, "d10-satellite");
  await design(page, "satellite-roof-drawing", false);
  const manM = JSON.stringify({ units: "metric", jobType: "reroof", existingRoof: "tile", sections: [
    { label: "Main roof", area: 120, pitch: 22.5, system: "metal" }, { label: "Garage", area: 36, pitch: 15, system: "metal" }, { label: "Verandah", area: 18, pitch: 10, system: "metal" },
  ] });
  const manId = sql(`insert into estimates (org_id, job_id, tax_rate, gst_inclusive, measurements, measurement_source, roof_colour) values ('${orgId}', '${jobId}', 10, true, '${manM}'::jsonb, 'manual', 'Surfmist') returning id`).split("\n")[0];
  await page.goto(`${BASE}/app/estimates/${manId}?view=docket`);
  await page.locator('[data-testid="docket-roof"][data-kind="tiles"]').waitFor();
  check((await page.locator('[data-testid="roof-tile"]').count()) === 3, "typed-in sections: one tile each");
  check((await page.locator('[data-testid="docket-roof"]').innerHTML()).includes("Garage"), "tiles are labelled");
  await page.click('[data-testid="docket-fill"]');
  await page.locator('[data-testid="main-line"]').first().waitFor();
  await saved();
  await shot(page, "d11-tiles");
  await design(page, "manual-tiles-drawing", false);

  console.log("15. Phone width (390px)");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await mctx.newPage();
  for (const [p, what] of [[`/app/estimates/${estId}?view=docket`, "roofer docket"], [publicPath, "customer docket"], ["/app/settings/price-book", "price book"]]) {
    await mp.goto(BASE + p);
    await mp.waitForLoadState("networkidle").catch(() => {});
    await noHorizontalScroll(mp, what);
  }
  await mp.goto(BASE + publicPath);
  await mp.screenshot({ path: `${SHOTS}/d10-mobile-customer.png`, fullPage: true });

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  fs.unlinkSync(pdfFile);
  await browser.close();
  console.log("\nAU DOCKET E2E PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
