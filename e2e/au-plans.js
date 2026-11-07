// End-to-end: Measure from plans. Generates a made-up vector plan set (A3, 1:100, VIC) with Chrome's PDF printer,
// uploads it on a quote, checks the details read off the title block, the measured roof, editing (line type, undo,
// scale check), Interact (3D hover), sheets, "Add to quote", and that the quote lines and job/customer were filled.
//   BASE_URL=http://localhost:3207 node e2e/au-plans.js /tmp/shots
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3207";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || os.tmpdir();
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const near = (a, b, tol, msg) => check(Math.abs(Number(a) - b) <= tol, `${msg} (${a} ≈ ${b})`);
const sql = (q) => execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

// ---------------------------------------------------------------------------
// The synthetic plans: sheet 0 = floor plan (walls), sheet 1 = roof plan of an L-shaped hip roof.
// Roof (real mm): main wing 14 m × 8 m, side wing 8 m wide running 6 m further; every hip/valley at 45°.
// At 25°: plan 160 m², true 160 / cos 25° = 176.54 m², hips 5 × 5.956 m, valley 5.956 m, ridges 12 m, gutters 56 m.
// ---------------------------------------------------------------------------
const S = 100; // 1:100 → paper mm = real mm / 100
const OX = 40, OY = 70; // where the roof sits on the A3 sheet (mm)
const mm = (v) => v / S;
const roofLines = [
  [[0, 0], [14000, 0]], [[14000, 0], [14000, 8000]], [[14000, 8000], [8000, 8000]], [[8000, 8000], [8000, 14000]], [[8000, 14000], [0, 14000]], [[0, 14000], [0, 0]],
  [[0, 0], [4000, 4000]], [[14000, 0], [10000, 4000]], [[14000, 8000], [10000, 4000]], [[8000, 14000], [4000, 10000]], [[0, 14000], [4000, 10000]],
  [[4000, 4000], [10000, 4000]], [[4000, 4000], [4000, 10000]], [[8000, 8000], [4000, 4000]],
];
const svgLine = ([a, b], w = 0.25, c = "#333") => `<line x1="${OX + mm(a[0])}" y1="${OY + mm(a[1])}" x2="${OX + mm(b[0])}" y2="${OY + mm(b[1])}" stroke="${c}" stroke-width="${w}" />`;
const txt = (s, x, y, size = 2.6, extra = "") => `<div style="position:absolute;left:${x}mm;top:${y}mm;font:${size}mm Arial, sans-serif;white-space:nowrap;${extra}">${s}</div>`;
const titleBlock = [
  txt("PROJECT ADDRESS:", 330, 180), txt("12 WATTLE GROVE", 330, 185), txt("ELTHAM VIC 3095", 330, 190),
  txt("CLIENT", 330, 200), txt("BLUEGUM HOMES PTY LTD", 330, 205),
  txt("PROJECT", 330, 215), txt("NEW DWELLING", 330, 220),
  txt("DATE", 330, 230), txt("03/02/26", 330, 235),
  txt("DRAWN BY", 375, 230), txt("BUSHLINE DRAFTING", 375, 235),
  txt("LOT 4 PS 712345", 330, 250), txt("COUNCIL: NILLUMBIK", 330, 255),
].join("");
const page = (body) => `<section style="position:relative;width:420mm;height:297mm;page-break-after:always;overflow:hidden">${body}${titleBlock}
  <svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297"><rect x="5" y="5" width="410" height="287" fill="none" stroke="#000" stroke-width="0.5"/><line x1="320" y1="5" x2="320" y2="292" stroke="#000" stroke-width="0.5"/></svg></section>`;
const floor = page(`
  <svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297">
    ${[[[6, 6], [134, 6]], [[134, 6], [134, 74]], [[134, 74], [74, 74]], [[74, 74], [74, 134]], [[74, 134], [6, 134]], [[6, 134], [6, 6]], [[6, 40], [74, 40]], [[74, 6], [74, 74]]]
      .map(([a, b]) => svgLine([[a[0] * 100, a[1] * 100], [b[0] * 100, b[1] * 100]], 0.5, "#000")).join("")}
  </svg>
  ${txt("FLOOR PLAN", 40, 260, 5)}${txt("SCALE 1:100 @ A3", 40, 268)}${txt("SINGLE STOREY", 200, 120)}`);
const dps = [[14000, 2000], [0, 12000], [8000, 13000]];
const roof = page(`
  <svg style="position:absolute;left:0;top:0" width="420mm" height="297mm" viewBox="0 0 420 297">
    ${roofLines.map((l) => svgLine(l)).join("")}
    ${dps.map(([x, y]) => `<rect x="${OX + mm(x) - 0.5}" y="${OY + mm(y) - 0.5}" width="1" height="1" fill="none" stroke="#333" stroke-width="0.25"/>`).join("")}
  </svg>
  ${dps.map(([x, y]) => txt("DP", OX + mm(x) + 1.5, OY + mm(y) - 1, 2)).join("")}
  ${[[2000, 6000], [7000, 1800], [11500, 5200], [6000, 11000], [2000, 11000], [6200, 7000]].map(([x, y]) => txt("25°", OX + mm(x), OY + mm(y), 2.4)).join("")}
  ${txt("ROOF PLAN", 40, 260, 5)}${txt("SCALE 1:100 @ A3", 40, 268)}
  ${txt("COLORBOND ROOF. DOWNPIPES 90 DIA PVC AT MAX 12m CTRS.", 200, 240, 2.4)}`);

async function makePdf(browser, file) {
  const p = await browser.newPage();
  await p.setContent(`<!doctype html><html><head><style>@page{size:420mm 297mm;margin:0}body{margin:0}</style></head><body>${floor}${roof}</body></html>`);
  await p.pdf({ path: file, width: "420mm", height: "297mm", printBackground: true });
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const pdfFile = path.join(os.tmpdir(), `au-plans-${stamp}.pdf`);
  await makePdf(browser, pdfFile);
  check(fs.statSync(pdfFile).size > 2000, "generated a 2-sheet A3 vector plan PDF");

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

  console.log("1. Sign up, company, customer, job, quote");
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Plan Reader");
  await page.fill('input[name="email"]', `au-plans${stamp}@example.com`);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  await page.fill('input[name="name"]', `Yarra Roofing ${stamp}`);
  await page.fill('input[name="phone"]', "0412 345 678");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select id from organizations where name = 'Yarra Roofing ${stamp}'`);
  for (const [key, tier, p] of [["metal_sheet", "good", 22], ["ridge_capping", null, 25], ["valley_iron", null, 30], ["gutter", null, 28], ["downpipe", null, 90], ["labour_install", null, 33]]) {
    sql(`update catalog_items set unit_price = ${p}, unit_cost = ${p / 2} where org_id = '${orgId}' and calc_key = '${key}' and tier ${tier ? `= '${tier}'` : "is null"}`);
  }
  await page.goto(BASE + "/app/customers/new");
  await page.fill('input[name="name"]', "Placeholder Owner");
  await page.fill('input[name="job_title"]', "New dwelling roof");
  await page.click('button:has-text("Save customer")');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+$/);
  const jobId = page.url().split("/").pop();
  await page.click('button:has-text("New quote")');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  const estId = page.url().split("/").pop();
  check(await page.locator('[data-testid="measure-from-plans"]').isVisible(), "quote's roof card offers Measure from plans");

  console.log("2. Upload the plans");
  await page.click('[data-testid="measure-from-plans"]');
  await page.waitForURL(/\/plans$/);
  await shot("p01-drop");
  await page.setInputFiles('[data-testid="plans-input"]', pdfFile);
  await page.waitForSelector('[data-testid="plans-scan"]');
  await page.waitForSelector('[data-testid="details-step"]', { timeout: 60000 });
  await shot("p02-details");

  console.log("3. Details read off the title block");
  const val = (k) => page.locator(`[data-testid="detail-${k}"]`).inputValue();
  check((await val("street")) === "12 Wattle Grove", "street");
  check((await val("suburb")) === "Eltham", "suburb");
  check((await val("state")) === "VIC", "state");
  check((await val("postcode")) === "3095", "postcode");
  check((await val("customer")) === "Bluegum Homes Pty Ltd", "client / builder");
  check((await val("lot")) === "Lot 4 on PS712345", "lot & plan");
  check((await val("council")) === "Nillumbik", "council");
  check((await val("designer")) === "Bushline Drafting", "designer");
  check((await val("drawingDate")) === "03/02/2026", "drawing date");
  check((await val("buildingType")) === "New Dwelling", "building type");
  check((await val("storeys")) === "1", "storeys from the floor plan sheet");
  check((await val("roofMaterial")) === "COLORBOND steel", "roof material");
  check((await val("downpipes")).startsWith("90 mm"), "downpipe note");
  const custRow = page.locator('[data-detail="customer"]');
  check(!(await custRow.locator('input[type="checkbox"]').isChecked()), "a different client isn't ticked until you choose it");
  check((await custRow.innerText()).includes("Placeholder Owner"), "shows the job's current customer next to it");
  await custRow.locator('input[type="checkbox"]').check();

  console.log("4. The measured roof");
  await page.click('[data-testid="details-next"]');
  await page.waitForSelector('[data-testid="total-area"]');
  const dv = (k) => page.locator(`[data-testid="total-${k}"]`).getAttribute("data-value");
  near(await dv("area"), 176.54, 0.3, "true roof area 160 m² ÷ cos 25°");
  near(await dv("ridge"), 12, 0.05, "ridges");
  near(await dv("hip"), 29.78, 0.1, "hips (5 × 5.96 m in 3D)");
  near(await dv("valley"), 5.96, 0.05, "valley");
  near(await dv("eave"), 56, 0.05, "gutters");
  check((await page.locator('[data-testid="scale-text"]').innerText()).startsWith("1:100"), "scale 1:100 read from the sheet");
  check((await page.locator('[data-testid="pitch-input"]').inputValue()) === "25", "pitch 25° read from the labels");
  check((await page.locator('[data-testid="downpipes-input"]').inputValue()) === "3", "3 downpipes (DP marks)");
  check((await page.locator('[data-testid="sheet-select"] option:checked').innerText()).includes("Sheet 01"), "picked the roof plan sheet, not the floor plan");
  check((await page.locator('[data-testid="line-label"]').count()) >= 14, "every line is labelled with its length");
  await page.waitForTimeout(1200);
  await shot("p03-all-measurements");

  console.log("5. Interact (3D)");
  await page.click('button[role="tab"]:has-text("Interact")');
  await page.waitForTimeout(1200);
  const panel = page.locator('[data-testid="roof-panel"]').first();
  const b = await panel.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.locator('[data-testid="panel-card"]').waitFor();
  check((await page.locator('[data-testid="panel-card"]').innerText()).includes("25° pitch"), "hovering a panel shows its area, pitch and edges");
  check((await page.locator('[data-testid="edge-3d-label"]').count()) >= 3, "the panel's edges are labelled on the model");
  check((await page.locator('[data-testid="ground-shade"]').count()) === 1, "soft shade under the 3D roof");
  await page.click('button[aria-label="Spin right"]');
  await shot("p04-interact");
  await page.click('button[role="tab"]:has-text("All measurements")');
  await page.waitForTimeout(1100);

  console.log("6. Edit: change a line type, undo, check the scale");
  await page.locator('[data-testid="roof-line"][data-kind="valley"]').first().click();
  await page.waitForFunction(() => document.querySelector('[data-testid="total-valley"]')?.getAttribute("data-value") === "0");
  check(Number(await dv("barge")) > 5, "tapping the valley turned it into a barge");
  await page.click('[data-testid="tool-undo"]');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="total-valley"]')?.getAttribute("data-value")) > 5);
  check(true, "undo puts the valley back");
  await page.click('[data-testid="check-dimension"]');
  await page.locator('[data-testid="roof-line"][data-role="outline"]').first().click({ force: true }); // a level line has a zero-height box
  const drawn = (await page.locator('[data-testid="scale-card"]').innerText()).match(/That line is ([\d.]+) m/)[1];
  await page.fill('[data-testid="real-length"]', String(Number(drawn) * 2));
  await page.click('[data-testid="apply-scale"]');
  check((await page.locator('[data-testid="scale-text"]').innerText()).startsWith("1:200"), "typing the real length rescales the drawing");
  near(await dv("area"), 176.54 * 4, 2, "and the area follows");
  await page.click('[data-testid="tool-undo"]');
  check((await page.locator('[data-testid="scale-text"]').innerText()).startsWith("1:100"), "undo restores the scale");
  await page.click('[data-testid="check-dimension"]');
  await page.locator('[data-testid="roof-line"][data-role="outline"]').first().click({ force: true }); // a level line has a zero-height box
  await page.fill('[data-testid="real-length"]', drawn);
  await page.click('[data-testid="apply-scale"]');
  check((await page.locator('[data-testid="scale-card"]').innerText()).includes("you checked it"), "scale confirmed by one dimension");

  console.log("7. Sheets and colour");
  await page.click('[data-testid="pick-sheets"]');
  await page.click('[data-testid="profile-trimdek"]');
  const trimCount = Number(await page.locator('[data-testid="sheet-count"]').getAttribute("data-value"));
  await page.click('[data-testid="profile-custom_orb"]');
  await page.click('button[aria-label="Woodland Grey"]');
  check((await page.locator('[data-testid="colour-name"]').innerText()) === "Woodland Grey", "colour picked");
  const orbLm = Number(await page.locator('[data-testid="sheet-lm"]').getAttribute("data-value"));
  const orbCount = Number(await page.locator('[data-testid="sheet-count"]').getAttribute("data-value"));
  check(orbLm > 176.54 / 0.762 && orbLm < (176.54 / 0.762) * 1.15, `Custom Orb ${orbCount} sheets / ${orbLm} lm within 15% of area ÷ cover`);
  check(trimCount >= orbCount, "Trimdek (can't be turned end for end) needs at least as many sheets");
  await page.click('[data-testid="cut-list"] summary');
  check((await page.locator('[data-testid="cut-list"]').innerText()).includes("Ridge capping"), "cut list with flashings");
  await page.waitForTimeout(1500);
  await shot("p05-sheets");

  console.log("8. Add to quote");
  await page.click('[data-testid="add-to-quote"]');
  await page.locator('[data-testid="done-card"]').waitFor({ timeout: 30000 });
  await shot("p06-done");
  check(sql(`select measurement_source from estimates where id = '${estId}'`) === "plans", "quote measured from plans");
  check(sql(`select (measurements->'plans'->>'scale')::numeric::int || '|' || (measurements->'plans'->>'pitch') from estimates where id = '${estId}'`) === "100|25", "takeoff saved on the quote");
  near(sql(`select quantity from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`), orbLm, 0.02, "metal_sheet lm = the optimised cut list");
  check(sql(`select description from estimate_items where estimate_id = '${estId}' and calc_key = 'metal_sheet'`).includes("Woodland Grey"), "sheet line names the colour");
  check(Number(sql(`select quantity from estimate_items where estimate_id = '${estId}' and calc_key = 'ridge_capping'`)) > 41.78, "ridge + hip capping in ordered lengths (more than the 41.78 lm measured)");
  check(Number(sql(`select quantity from estimate_items where estimate_id = '${estId}' and calc_key = 'valley_iron'`)) >= 6.2, "valley iron with run allowance");
  check(Number(sql(`select quantity from estimate_items where estimate_id = '${estId}' and calc_key = 'gutter'`)) > 56, "gutter in lengths");
  check(sql(`select quantity::int from estimate_items where estimate_id = '${estId}' and calc_key = 'downpipe'`) === "3", "3 downpipes on the quote");
  check(sql(`select count(*) from estimate_items where estimate_id = '${estId}' and calc_key = 'labour_strip'`) === "0", "new dwelling: nothing to strip");
  check(sql(`select site_address || '|' || state || '|' || zip || '|' || job_type from jobs where id = '${jobId}'`) === "12 Wattle Grove, Eltham VIC 3095|VIC|3095|new_construction", "job site address, state, postcode and type filled");
  const notes = sql(`select notes from jobs where id = '${jobId}'`);
  check(notes.includes("Lot 4 on PS712345") && notes.includes("Council: Nillumbik") && notes.includes("Designer: Bushline Drafting"), "job notes carry lot, council and designer");
  check(sql(`select roof_material from jobs where id = '${jobId}'`).includes("Woodland Grey"), "roof material with profile and colour");
  check(sql(`select c.name || '|' || coalesce(c.city, '') from jobs j join customers c on c.id = j.customer_id where j.id = '${jobId}'`) === "Bluegum Homes Pty Ltd|Eltham", "job linked to the builder from the plans, with the site address");
  check(sql(`select count(*) from job_files where job_id = '${jobId}' and category = 'plans' and mime_type = 'application/pdf'`) === "1", "the PDF is kept with the job's files");

  console.log("9. Back on the quote: lines, and View the roof");
  await page.click('[data-testid="open-quote"]');
  await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+$/);
  check((await page.locator("text=Measured from plans").count()) > 0, "quote shows the measurement source");
  check(await page.locator('[data-testid="cut-list"]').innerText().then((t) => t.includes("cut list from plans")), "quote's cut list comes from the plans");
  await shot("p07-quote");
  await page.click('[data-testid="view-roof"]');
  await page.waitForURL(/\/plans$/);
  await page.waitForSelector('[data-testid="total-area"]');
  near(await dv("area"), 176.54, 0.3, "View the roof reopens the saved takeoff");
  await page.waitForTimeout(1200);
  await shot("p08-view-roof");

  console.log("10. Phone width");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector('[data-testid="total-area"]');
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(sw <= iw + 1, `no horizontal scroll at 390px (${sw} <= ${iw})`);

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  fs.unlinkSync(pdfFile);
  await browser.close();
  console.log("AU PLANS E2E PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
