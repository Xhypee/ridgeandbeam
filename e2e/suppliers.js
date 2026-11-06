// E2E: Australian suppliers & price sheets — pick suppliers from the directory, import price
// sheets (CSV upload + paste from Excel), map rows to estimating items, markup, compare, versions,
// supplier-aware material orders, crew-lead privacy, phone widths, 1440 screenshots.
//   BASE_URL=http://localhost:3201 node e2e/suppliers.js <screenshot dir> [<1440 shots dir>]
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3201";
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] || require("os").tmpdir();
const BIG = process.argv[3] || null;
const stamp = Date.now();

function check(cond, msg) {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sql = (q) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(q.replace(/\s+/g, " "))}`).toString().trim();

const LYSAGHT_CSV = [
  "Lysaght Smithfield - account price list",
  "Valid from 01/11/2026",
  "Item Code,Product Description,Profile,Colour,BMT,Cover,UOM,Length,Pack Qty,Nett Price inc GST",
  "CO42-MON,Custom Orb 0.42 COLORBOND Monument,Custom Orb,COLORBOND Monument,0.42,762,LM,,,14.30",
  "CO42-ZINC,Custom Orb 0.42 ZINCALUME,Custom Orb,ZINCALUME,0.42,762,LM,,,12.10",
  "QG115-65,Quad gutter 115mm,,COLORBOND Monument,,,LGTH,6.5,,64.35",
  "SCR-1445,Roofing screw 12-14x45 hex,,,,,BX,,500,55.00",
  "VI-450,Valley iron 450 girth,,COLORBOND Monument,,,LM,,,16.50",
  "BAD,Mystery item,,,,,EA,,,abc",
  "SIL-300,Silicone sealant 300ml,,,,,EA,,,9.90",
  "WT-24,Wall trim,,COLORBOND Monument,,,LM,,,8.80",
].join("\n") + "\n";
const STRAMIT_TSV = [
  "Code\tDescription\tUnit\tPrice ex GST",
  "ST-CORR-ZN\tCorrugated 0.42 ZINCALUME\tLM\t10.50",
  "ST-QG115\tQuad gutter 115\tLM\t9.50",
  "ST-SCR\tRoofing screws box of 1000\tBOX\t95.00",
  "ST-VAL\tValley 450\tLM\t14.00",
  "ST-HOOK\tSafety hook\tEA\t22.00",
].join("\n");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  const shot = (name, p = page) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const csvPath = path.join(SHOTS, `lysaght-${stamp}.csv`);
  fs.writeFileSync(csvPath, LYSAGHT_CSV);

  console.log("1. Sign up + company (serves NSW)");
  const email = `sup${stamp}@example.com`;
  await page.goto(BASE + "/signup");
  await page.fill('input[name="full_name"]', "Sam Supplier");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  const company = `Ridge Suppliers ${stamp}`;
  await page.fill('input[name="name"]', company);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/app");
  const orgId = sql(`select id from organizations where name = '${company}'`);
  sql(`update organizations set service_states = '{NSW}' where id = '${orgId}'`);
  check(/^[0-9a-f-]{36}$/.test(orgId), "company created");

  console.log("2. Pick suppliers from the Australian directory");
  await page.goto(BASE + "/app/settings/suppliers");
  const dir = page.getByTestId("directory");
  check(await dir.getByText("Lysaght (BlueScope)").count() === 1, "Lysaght listed");
  check(await dir.getByText("Steeline").count() === 1 && await dir.getByText("Reece").count() === 1, "NSW + unknown-coverage suppliers listed");
  check(await dir.getByText("Fielders", { exact: true }).count() === 0, "Fielders (SA/WA/VIC only) hidden for an NSW business");
  await page.getByLabel(/Show suppliers outside NSW/).check();
  check(await dir.getByText("Fielders", { exact: true }).count() === 1, "show-all reveals Fielders");
  check(await page.getByText(/ABC Supply|SRS|QXO/).count() === 0, "no US suppliers");
  await page.getByLabel("Search suppliers").fill("lysaght");
  await dir.getByRole("button", { name: /Lysaght \(BlueScope\)/ }).click();
  await page.fill('input[name="account_number"]', "LYS-7781");
  await page.fill('input[name="branch_name"]', "Smithfield");
  await page.fill('input[name="branch_email"]', "smithfield@lysaght.example.com");
  await page.click('button:has-text("Add supplier")');
  await page.getByText("Supplier added.").waitFor();
  await page.getByLabel("Search suppliers").fill("stramit");
  await dir.getByRole("button", { name: /Stramit/ }).click();
  await page.fill('input[name="branch_email"]', "orders@stramit.example.com");
  await page.click('button:has-text("Add supplier")');
  await page.getByText("Supplier added.").waitFor();
  await page.click('button:has-text("My supplier isn\'t listed")');
  await page.fill('input[name="custom_name"]', "No.1 Roofing Parramatta");
  await page.click('button:has-text("Add supplier")');
  await page.getByText("Supplier added.").waitFor();
  await page.reload();
  const list = page.getByTestId("org-suppliers");
  check(await list.getByTestId("org-supplier").count() === 3, "three suppliers on the list");
  check(await list.locator('li:has-text("Lysaght") >> text=Default').count() === 1, "first supplier became the default");
  check(await list.getByText("Acct LYS-7781").count() === 1, "account number shown");

  console.log("3. Markup with live example");
  const mat = page.locator('input[name="material"]');
  await mat.fill("40");
  check((await page.getByTestId("markup-example-material").innerText()).includes("$15.40"), "cost $10 ex GST → $15.40 inc GST at 40%");
  await page.click('button:has-text("Save markup")');
  await page.getByText("Markup saved.").waitFor();
  check(sql(`select markup_pct->>'material' from organizations where id = '${orgId}'`) === "40", "markup saved");
  await shot("s01-suppliers");

  console.log("4. Import Lysaght CSV (title rows, inc GST, bad row, bulk map)");
  const lysId = sql(`select os.id from org_suppliers os join suppliers s on s.id = os.supplier_id where os.org_id = '${orgId}' and s.slug = 'lysaght'`);
  await page.goto(`${BASE}/app/settings/suppliers/${lysId}/import`);
  await page.getByTestId("sheet-file").setInputFiles(csvPath);
  await page.getByText("Match columns").waitFor();
  check(await page.locator('select[data-field="description"]').inputValue() === "1", "description column auto-detected");
  check(await page.locator('select[data-field="price"]').inputValue() === "9", "price column auto-detected");
  check(await page.locator('select[data-field="length_mm"]').inputValue() === "7" && await page.locator('select[data-field="pack_qty"]').inputValue() === "8", "length and pack qty detected");
  check(await page.locator('input[name="gst"][value="inc"]').isChecked(), "inc GST guessed from the header");
  await shot("s02-columns");
  await page.click('button:has-text("Check rows")');
  check(await page.getByTestId("ready-count").innerText() === "7", "7 rows ready");
  check(await page.getByTestId("error-count").innerText() === "1", "1 row with an error");
  check(await page.getByText('Price "abc" isn\'t a number.').count() === 1, "row error explained");
  check(await page.getByTestId("unmapped-count").innerText() === "2", "2 rows unmapped before bulk map");
  check(await page.getByText("$9.00/lm").count() === 1, "gutter per 6.5 m length normalised to $9.00/lm ex GST");
  await page.getByLabel("Rows containing").fill("wall trim");
  await page.getByLabel("Map to").selectOption("flashing");
  await page.click('button:has-text("Map rows")');
  check((await page.getByTestId("bulk-msg").innerText()).startsWith("1 row"), "bulk map applied");
  check(await page.getByTestId("unmapped-count").innerText() === "1", "1 row left unmapped");
  await shot("s03-check-rows");
  await page.click('button:has-text("Continue with 7 rows")');
  await page.click('button:has-text("Save price list")');
  await page.getByText("Tick the box to confirm").waitFor();
  check(true, "authorisation required");
  await page.getByTestId("authorised").check();
  await page.click('button:has-text("Save price list")');
  await page.waitForURL(`**/app/settings/suppliers/${lysId}?imported=1`);
  await page.getByTestId("versions").getByText("Active").waitFor();
  check(sql(`select count(*) from supplier_price_items i join supplier_price_lists l on l.id = i.price_list_id where l.org_supplier_id = '${lysId}' and l.is_active`) === "7", "7 rows stored in the active list");
  check(sql(`select cost_ex_gst from supplier_price_items where product_code = 'CO42-MON' and org_id = '${orgId}'`) === "13.00", "inc-GST price stored ex GST ($14.30 → $13.00)");
  check(sql(`select calc_key from supplier_price_items where product_code = 'WT-24' and org_id = '${orgId}'`) === "flashing", "bulk-mapped row saved");

  console.log("5. Fix the unmapped row on the supplier page");
  await page.goto(`${BASE}/app/settings/suppliers/${lysId}?show=unmapped`);
  const items = page.getByTestId("price-items");
  check(await items.getByText("Silicone sealant 300ml").count() === 1, "unmapped row listed");
  await items.getByLabel("Estimating item").first().selectOption("flashing");
  await page.waitForTimeout(800);
  await page.reload();
  check(await page.getByText("Every row is mapped.").count() === 1, "unmapped row fixed");
  await shot("s04-supplier");

  console.log("6. Import Stramit by pasting from Excel");
  const stId = sql(`select os.id from org_suppliers os join suppliers s on s.id = os.supplier_id where os.org_id = '${orgId}' and s.slug = 'stramit'`);
  await page.goto(`${BASE}/app/settings/suppliers/${stId}/import`);
  await page.click('button:has-text("Paste from Excel")');
  await page.getByTestId("sheet-paste").fill(STRAMIT_TSV);
  await page.click('button:has-text("Read pasted rows")');
  check(await page.locator('input[name="gst"][value="ex"]').isChecked(), "ex GST guessed");
  await page.click('button:has-text("Check rows")');
  check(await page.getByTestId("ready-count").innerText() === "5", "5 pasted rows ready");
  await page.getByLabel("Estimating item for row 6").selectOption("edge_protection");
  await page.click('button:has-text("Continue with 5 rows")');
  await page.getByTestId("authorised").check();
  await page.click('button:has-text("Save price list")');
  await page.waitForURL(`**/app/settings/suppliers/${stId}?imported=1`);
  check(sql(`select calc_key from supplier_price_items where product_code = 'ST-HOOK' and org_id = '${orgId}'`) === "edge_protection", "per-row mapping saved");

  console.log("7. New version keeps the old one inactive");
  await page.goto(`${BASE}/app/settings/suppliers/${stId}/import`);
  await page.click('button:has-text("Paste from Excel")');
  await page.getByTestId("sheet-paste").fill(STRAMIT_TSV.replace("10.50", "10.20"));
  await page.click('button:has-text("Read pasted rows")');
  await page.click('button:has-text("Check rows")');
  check(await page.getByLabel("Estimating item for row 6").inputValue() === "edge_protection", "re-import keeps last version's mapping by product code");
  await page.click('button:has-text("Continue with 5 rows")');
  await page.getByTestId("authorised").check();
  await page.click('button:has-text("Save price list")');
  await page.waitForURL(`**/app/settings/suppliers/${stId}?imported=1`);
  const versions = page.getByTestId("versions");
  check(await versions.getByText("Active", { exact: true }).count() === 1 && await versions.getByText("Inactive", { exact: true }).count() === 1, "two versions, one active");
  check(sql(`select count(*) from supplier_price_lists where org_supplier_id = '${stId}' and is_active`) === "1", "exactly one active list in the DB");

  console.log("8. Compare suppliers + default");
  await page.goto(BASE + "/app/settings/suppliers");
  const cmp = page.getByTestId("supplier-compare");
  const sheetRow = cmp.locator('tr:has-text("Roof sheeting")');
  check((await sheetRow.innerText()).includes("$11.00") && (await sheetRow.innerText()).includes("$10.20"), "sheeting: Lysaght $11.00 vs Stramit $10.20 per lm");
  check(await sheetRow.locator('td:last-child >> text=Cheapest').count() === 1, "Stramit cheapest for sheeting");
  const gutRow = cmp.locator("tr", { has: page.locator("td:first-child > span.font-medium", { hasText: /^Gutter$/ }) });
  check(await gutRow.locator("td").nth(1).getByText("Cheapest").count() === 1, "Lysaght cheapest for gutter ($9.00 vs $9.50)");
  const scrRow = cmp.locator('tr:has-text("Roofing screws")');
  check((await scrRow.innerText()).includes("per ea"), "screw boxes of different sizes compared per screw");
  check(await page.getByText(/updated \d{2}\/\d{2}\/\d{4} · 7 items/).count() === 1, "last updated (DD/MM/YYYY) and item count shown");
  await page.locator('li:has-text("Stramit")').getByRole("button", { name: "Make default" }).click();
  await page.waitForTimeout(800);
  check(sql(`select default_supplier_id from organizations where id = '${orgId}'`) === stId, "Stramit is now the default");
  await shot("s05-compare");

  console.log("9. Supplier-aware material order from the accepted estimate");
  const custId = sql(`insert into customers (org_id, name, city, state, zip) values ('${orgId}', 'Pat Nguyen', 'Parramatta', 'NSW', '2150') returning id`).split("\n")[0];
  const jobId = sql(`insert into jobs (org_id, customer_id, title, stage, site_address, shingle_color) values ('${orgId}', '${custId}', 'Tile to Colorbond re-roof', 'sold', '12 Smith St, Parramatta NSW 2150', 'ZINCALUME') returning id`).split("\n")[0];
  const estId = sql(`insert into estimates (org_id, job_id, status, accepted_at) values ('${orgId}', '${jobId}', 'accepted', now()) returning id`).split("\n")[0];
  sql(`insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key) values
    ('${orgId}', '${estId}', 0, 'Roof sheeting', 182.4, 'lm', 20, 11, 'material', 'metal_sheet'),
    ('${orgId}', '${estId}', 1, 'Quad gutter', 30, 'lm', 18, 9, 'material', 'gutter'),
    ('${orgId}', '${estId}', 2, 'Roofing screws', 2, 'box', 120, 50, 'material', 'roof_screws'),
    ('${orgId}', '${estId}', 3, 'Skylight', 1, 'ea', 900, 450, 'material', null),
    ('${orgId}', '${estId}', 4, 'Installation labour', 150, 'm2', 30, 0, 'labor', 'labour_install')`);
  await page.goto(BASE + "/app/orders");
  check(await page.getByText(/ABC Supply|SRS|QXO/).count() === 0, "no US supplier names on orders");
  await page.selectOption('select[name="job_id"]', jobId);
  check(await page.locator('select[name="org_supplier_id"]').inputValue() === stId, "new order defaults to the default supplier");
  await page.selectOption('select[name="org_supplier_id"]', lysId);
  await page.click('button:has-text("Create order")');
  await page.waitForURL(/\/app\/orders\/[0-9a-f-]+$/);
  const orderId = page.url().split("/").pop();
  const skus = await page.getByLabel("Product code").evaluateAll((els) => els.map((e) => e.value));
  check(JSON.stringify(skus) === JSON.stringify(["CO42-ZINC", "QG115-65", "SCR-1445", ""]), `lines use Lysaght codes (${skus.join(", ")})`);
  const qtys = await page.getByLabel("Quantity").evaluateAll((els) => els.map((e) => e.value));
  check(qtys[1] === "5", "30 lm of gutter ordered as 5 × 6.5 m lengths");
  check(sql(`select supplier || '|' || coalesce(branch_email,'') from material_orders where id = '${orderId}'`) === "Lysaght (BlueScope)|smithfield@lysaght.example.com", "order carries supplier + branch email");
  await shot("s06-order");

  console.log("10. Switch supplier → Stramit codes, CSV, send to branch");
  await page.selectOption('select[name="org_supplier_id"]', stId);
  await page.click('button:has-text("Use Stramit codes")');
  await page.getByText(/lines now use Stramit's product codes/).waitFor();
  const skus2 = await page.getByLabel("Product code").evaluateAll((els) => els.map((e) => e.value));
  check(skus2[0] === "ST-CORR-ZN" && skus2[1] === "ST-QG115" && skus2[2] === "ST-SCR", `lines switched to Stramit codes (${skus2.join(", ")})`);
  const qtys2 = await page.getByLabel("Quantity").evaluateAll((els) => els.map((e) => e.value));
  check(qtys2[1] === "32.5" && qtys2[2] === "1", "quantities converted back through lm (5 lengths → 32.5 lm; 1000 screws ≥ 2×500)");
  await page.click('button:has-text("Save order")');
  await page.getByText("Order saved.").waitFor();
  check(sql(`select org_supplier_id from material_orders where id = '${orderId}'`) === stId, "order saved against Stramit");
  const csv = await page.evaluate(async (u) => (await fetch(u)).text(), `${BASE}/app/orders/${orderId}/csv`);
  check(csv.includes("Line,Product code,Description,Quantity,Unit") && csv.includes("1,ST-CORR-ZN,Corrugated 0.42 ZINCALUME"), "CSV uses supplier product codes");
  await page.fill('input[name="delivery_date"]', "2026-12-01");
  await page.click('button:has-text("Save order")');
  await page.getByText("Order saved.").waitFor();
  check(await page.locator('form:has(button:has-text("Send to branch")) input[name="to"]').inputValue() === "orders@stramit.example.com", "send-to defaults to the supplier branch email");
  await page.click('button:has-text("Send to branch")');
  await page.getByText(/Order (emailed|logged as sent) to orders@stramit.example.com/).waitFor();
  check(sql(`select count(*) from messages where org_id = '${orgId}' and channel = 'email' and to_address = 'orders@stramit.example.com'`) === "1", "branch email logged");

  console.log("11. Crew lead can't open supplier prices");
  const crewEmail = `crew${stamp}@example.com`;
  const cctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const cpage = await cctx.newPage();
  await cpage.goto(BASE + "/signup");
  await cpage.fill('input[name="full_name"]', "Cal Crew");
  await cpage.fill('input[name="email"]', crewEmail);
  await cpage.fill('input[name="password"]', "password123");
  await cpage.click('button[type="submit"]');
  await cpage.waitForURL("**/onboarding");
  sql(`insert into memberships (org_id, user_id, role, full_name, email) select '${orgId}', id, 'crew_lead', 'Cal Crew', email from auth.users where email = '${crewEmail}'`);
  await cpage.goto(`${BASE}/app/settings/suppliers/${lysId}`);
  check(!cpage.url().includes("/settings/suppliers"), `crew lead redirected away (${new URL(cpage.url()).pathname})`);
  await cctx.close();

  console.log("12. Phone width (390px)");
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await m.newPage();
  for (const [name, url] of [["suppliers", "/app/settings/suppliers"], ["supplier", `/app/settings/suppliers/${lysId}`], ["import", `/app/settings/suppliers/${lysId}/import`], ["orders", "/app/orders"], ["order", `/app/orders/${orderId}`]]) {
    await mp.goto(BASE + url);
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 390, `${name} fits 390px (scrollWidth ${sw})`);
    await shot(`s-m-${name}`, mp);
  }
  await m.close();

  if (BIG) {
    console.log("13. Desktop screenshots 1440×960 @2x");
    const big = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
    const bp = await big.newPage();
    const snaps = [["settings", "/app/settings/suppliers"], ["supplier", `/app/settings/suppliers/${lysId}`], ["order", `/app/orders/${orderId}`]];
    for (const [name, url] of snaps) {
      await bp.goto(BASE + url);
      await bp.screenshot({ path: `${BIG}/suppliers-${name}.png`, fullPage: false });
    }
    await bp.goto(`${BASE}/app/settings/suppliers/${lysId}/import`);
    await bp.getByTestId("sheet-file").setInputFiles(csvPath);
    await bp.click('button:has-text("Check rows")');
    await bp.screenshot({ path: `${BIG}/suppliers-import.png`, fullPage: false });
    await big.close();
    check(true, "1440 screenshots saved");
  }

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
  console.log("SUPPLIERS E2E PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
