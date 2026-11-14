import { describe, expect, it } from "vitest";
import {
  autoMapColumns, buildRows, bulkMap, calcUnitsPerSupplierUnit, conversionProblem, costPerCalcUnit, detectHeaderRow, guessGst,
  lengthFromText, normaliseUnit, packFromText, parseDelimited, parseLengthMm, parsePrice, rollAreaFromText, rowIssues, sellIncGst,
  suggestRowCalcKey, TEMPLATE_CSV,
} from "./price-sheet";
import { buildPriceBook, compareBooks, type PriceItem } from "./suppliers";
import { mapLinesToSupplier, supplierOrderCsv, supplierQuantity, toSourceLines } from "./suppliers-orders";

const item = (p: Partial<PriceItem> & { id: string; calc_key: string | null; unit: string; cost_ex_gst: number }): PriceItem => ({
  product_code: null, description: p.id, profile: null, finish: null, thickness_mm: null, cover_width_mm: null, length_mm: null, pack_qty: null, ...p,
});
const MARKUP = { material: 35, labor: 0, other: 20 };

describe("delimited parsing", () => {
  it("parses quoted CSV with commas, doubled quotes, CRLF and a BOM", () => {
    const rows = parseDelimited('﻿Code,Description,Price\r\nA1,"Custom Orb, 0.42 ""Monument""",12.50\r\n\r\nB2,Ridge,9\r\n');
    expect(rows).toEqual([["Code", "Description", "Price"], ["A1", 'Custom Orb, 0.42 "Monument"', "12.50"], ["B2", "Ridge", "9"]]);
  });
  it("detects tab-separated text pasted from Excel", () => {
    expect(parseDelimited("Code\tDescription\tPrice\nX\tQuad gutter 115\t$1,234.50")).toEqual([["Code", "Description", "Price"], ["X", "Quad gutter 115", "$1,234.50"]]);
  });
  it("parses the downloadable template", () => {
    const rows = parseDelimited(TEMPLATE_CSV);
    expect(rows[0][0]).toBe("Product code");
    expect(rows.length).toBe(9);
  });
});

describe("header detection and column mapping", () => {
  const rows = [
    ["ACME Roofing Supplies — trade price list"],
    ["Valid from 01/11/2026"],
    ["Item Code", "Product Description", "Profile", "Colour", "BMT", "Cover", "UOM", "Pack Qty", "Nett Price Ex GST"],
    ["CO42", "Custom Orb 0.42 Monument", "Custom Orb", "Monument", "0.42", "762", "L/M", "", "12.10"],
  ];
  it("skips title rows to find the header", () => {
    expect(detectHeaderRow(rows)).toBe(2);
  });
  it("isn't fooled by a note above the table that mentions price, length and units", () => {
    const noted = [rows[0], ["Valid from 1 November 2026. All prices ex GST. Cut-to-length sheet priced per lineal metre."], rows[2], rows[3]];
    expect(detectHeaderRow(noted)).toBe(2);
  });
  it("auto-maps code, description, profile, finish, thickness, cover, unit, pack and price", () => {
    const m = autoMapColumns(rows[2]);
    expect(m).toMatchObject({ product_code: 0, description: 1, profile: 2, finish: 3, thickness_mm: 4, cover_width_mm: 5, unit: 6, pack_qty: 7, price: 8 });
    expect(guessGst(rows[2], m)).toBe("ex");
    expect(guessGst(["Code", "Description", "Price inc GST"], autoMapColumns(["Code", "Description", "Price inc GST"]))).toBe("inc");
  });
});

describe("values and units", () => {
  it("normalises unit synonyms", () => {
    expect(["LM", "L/M", "Lin m", "per m", "metre"].map(normaliseUnit)).toEqual(["lm", "lm", "lm", "lm", "lm"]);
    expect(["M2", "m²", "SQM"].map(normaliseUnit)).toEqual(["m2", "m2", "m2"]);
    expect(["EA", "each", "No."].map(normaliseUnit)).toEqual(["ea", "ea", "ea"]);
    expect(["BX", "PKT", "Box"].map(normaliseUnit)).toEqual(["box", "box", "box"]);
    expect(["RL", "Roll"].map(normaliseUnit)).toEqual(["roll", "roll"]);
    expect(["LGTH", "Length", "SHT"].map(normaliseUnit)).toEqual(["length", "length", "sheet"]);
    expect(normaliseUnit("furlong")).toBeNull();
  });
  it("parses prices, lengths, packs and roll areas", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(parsePrice("abc")).toBeNull();
    expect(parseLengthMm("6.5")).toBe(6500);
    expect(parseLengthMm("6500mm")).toBe(6500);
    expect(parseLengthMm("3 m")).toBe(3000);
    expect(lengthFromText("Quad gutter 115mm 6.5m length")).toBe(6500);
    expect(lengthFromText("Downpipe 90mm round")).toBeNull();
    expect(packFromText("Roofing screw 12-14x45 box of 500")).toBe(500);
    expect(packFromText("Tek screw 100pk")).toBe(100);
    expect(rollAreaFromText("Sarking 1350mm x 60m")).toBe(81);
    expect(rollAreaFromText("Anticon 55mm 1.35 x 30m")).toBe(40.5);
  });
});

describe("unit conversion to calc units", () => {
  it("per lm stays per lm", () => {
    expect(costPerCalcUnit({ unit: "lm", cost_ex_gst: 12.1 }, "lm")).toBeCloseTo(12.1);
  });
  it("per sheet with length → per lm", () => {
    expect(calcUnitsPerSupplierUnit({ unit: "sheet", cost_ex_gst: 65, length_mm: 6500 }, "lm")).toBe(6.5);
    expect(costPerCalcUnit({ unit: "sheet", cost_ex_gst: 65, length_mm: 6500 }, "lm")).toBeCloseTo(10);
    expect(costPerCalcUnit({ unit: "sheet", cost_ex_gst: 65 }, "lm")).toBeNull();
  });
  it("per length → per lm", () => {
    expect(costPerCalcUnit({ unit: "length", cost_ex_gst: 58.5, length_mm: 6500 }, "lm")).toBeCloseTo(9);
  });
  it("per m² with cover width → per lm, and per lm → per m²", () => {
    expect(costPerCalcUnit({ unit: "m2", cost_ex_gst: 20, cover_width_mm: 762 }, "lm")).toBeCloseTo(15.24);
    expect(costPerCalcUnit({ unit: "lm", cost_ex_gst: 15.24, cover_width_mm: 762 }, "m2")).toBeCloseTo(20);
  });
  it("per box with pack qty → each; per roll with m² coverage → m²", () => {
    expect(costPerCalcUnit({ unit: "box", cost_ex_gst: 50, pack_qty: 500 }, "ea")).toBeCloseTo(0.1);
    expect(costPerCalcUnit({ unit: "roll", cost_ex_gst: 162, pack_qty: 81 }, "m2")).toBeCloseTo(2);
    expect(calcUnitsPerSupplierUnit({ unit: "roll", cost_ex_gst: 162, pack_qty: 81 }, "roll")).toBe(1);
  });
  it("explains rows that can't convert", () => {
    expect(conversionProblem({ unit: "sheet", cost_ex_gst: 1 }, "metal_sheet")).toMatch(/length/);
    expect(conversionProblem({ unit: "ea", cost_ex_gst: 1 }, "gutter")).toMatch(/priced per lm/);
    expect(conversionProblem({ unit: "lm", cost_ex_gst: 1 }, "gutter")).toBeNull();
  });
  it("sell = cost × (1 + markup) × 1.1, to cents", () => {
    expect(sellIncGst(10, 35)).toBe(14.85);
    expect(sellIncGst(10, 0)).toBe(11);
  });
});

describe("calc-key suggestion", () => {
  it("specific words beat generic ones", () => {
    expect(suggestRowCalcKey({ description: "Barge capping 180 girth" })).toBe("barge_capping");
    expect(suggestRowCalcKey({ description: "Roofing screw 12-14x45 hex" })).toBe("roof_screws");
    expect(suggestRowCalcKey({ description: "Roll top ridge capping" })).toBe("ridge_capping");
    expect(suggestRowCalcKey({ description: "Custom Orb 0.42 COLORBOND Monument" })).toBe("metal_sheet");
    expect(suggestRowCalcKey({ description: "Quad gutter 115mm" })).toBe("gutter");
    expect(suggestRowCalcKey({ description: "Monier Elabana ridge tile" })).toBe("ridge_tile");
    expect(suggestRowCalcKey({ description: "Bradford Anticon blanket" })).toBe("sarking");
    expect(suggestRowCalcKey({ description: "Widget" })).toBeNull();
  });
});

describe("row building", () => {
  const rows = parseDelimited([
    "Code,Description,Unit,Pack,Length,Price inc GST",
    "TD,Trimdek 0.48 ZINCALUME sheet,SHEET,,6.5,71.50",
    "SCR,Roofing screw 12-14x45,BX,500,,55",
    "BAD,Mystery,,,,abc",
    ",,LM,,,5",
    "SK,Sarking 1350mm x 60m,ROLL,,,110",
  ].join("\n"));
  const built = buildRows(rows, 0, autoMapColumns(rows[0]), { pricesIncludeGst: true });
  it("converts inc-GST prices to ex GST and fills profile/cover/length/pack", () => {
    expect(built[0]).toMatchObject({ line: 2, product_code: "TD", unit: "sheet", length_mm: 6500, cost_ex_gst: 65, profile: "Trimdek", cover_width_mm: 762, calc_key: "metal_sheet" });
    expect(built[1]).toMatchObject({ unit: "box", pack_qty: 500, cost_ex_gst: 50, calc_key: "roof_screws" });
    expect(built[4]).toMatchObject({ unit: "roll", pack_qty: 81, cost_ex_gst: 100, calc_key: "sarking" });
  });
  it("reports row errors", () => {
    expect(built[2].errors.join(" ")).toMatch(/isn't a number/);
    expect(built[3].errors).toContain("Missing description.");
    expect(rowIssues(built[0])).toEqual([]);
  });
  it("bulk maps rows containing text", () => {
    const { rows: next, changed } = bulkMap(built, "trimdek", "flashing");
    expect(changed).toBe(1);
    expect(next[0].calc_key).toBe("flashing");
    expect(next[1].calc_key).toBe("roof_screws");
  });
});

describe("supplierPriceBook selection (buildPriceBook)", () => {
  const items: PriceItem[] = [
    item({ id: "co-mon", calc_key: "metal_sheet", unit: "lm", cost_ex_gst: 12, profile: "Custom Orb", finish: "COLORBOND Monument", cover_width_mm: 762 }),
    item({ id: "co-zinc", calc_key: "metal_sheet", unit: "lm", cost_ex_gst: 10, profile: "Custom Orb", finish: "ZINCALUME", cover_width_mm: 762 }),
    item({ id: "kl-sheet", calc_key: "metal_sheet", unit: "sheet", cost_ex_gst: 91, length_mm: 6500, profile: "Klip-Lok 700", finish: "COLORBOND Monument" }),
    item({ id: "gut-len", calc_key: "gutter", unit: "length", cost_ex_gst: 58.5, length_mm: 6500 }),
    item({ id: "gut-lm", calc_key: "gutter", unit: "lm", cost_ex_gst: 9.5 }),
    item({ id: "sheet-nolen", calc_key: "metal_sheet", unit: "sheet", cost_ex_gst: 1 }),
    item({ id: "unmapped", calc_key: null, unit: "ea", cost_ex_gst: 1 }),
    item({ id: "sark", calc_key: "sarking", unit: "roll", cost_ex_gst: 100, pack_qty: 81, product_code: "SK60" }),
    item({ id: "skip", calc_key: "skip_bin", unit: "ea", cost_ex_gst: 400 }),
  ];
  it("takes the cheapest per calc unit when no profile/finish is given, skipping unconvertible rows", () => {
    const book = buildPriceBook(items, MARKUP);
    const sheet = book.find((r) => r.calc_key === "metal_sheet")!;
    expect(sheet.supplier_price_item_id).toBe("co-zinc");
    expect(sheet.unit).toBe("lm");
    expect(sheet.unit_cost_ex_gst).toBe(10);
    expect(sheet.unit_price_inc_gst).toBe(14.85);
    expect(book.find((r) => r.calc_key === "gutter")!.supplier_price_item_id).toBe("gut-len"); // 9.00/lm < 9.50/lm
    expect(book.some((r) => r.supplier_price_item_id === "unmapped")).toBe(false);
  });
  it("prefers rows matching the estimate's profile and finish", () => {
    expect(buildPriceBook(items, MARKUP, { profile: "Custom Orb", finish: "Monument" }).find((r) => r.calc_key === "metal_sheet")!.supplier_price_item_id).toBe("co-mon");
    const kl = buildPriceBook(items, MARKUP, { profile: "Klip-Lok" }).find((r) => r.calc_key === "metal_sheet")!;
    expect(kl.supplier_price_item_id).toBe("kl-sheet");
    expect(kl.unit_cost_ex_gst).toBe(14);
    expect(buildPriceBook(items, MARKUP, { finish: "COLORBOND Monument" }).find((r) => r.calc_key === "metal_sheet")!.supplier_price_item_id).toBe("co-mon");
  });
  it("keeps roll pack_qty and applies the category markup (other = 20%)", () => {
    const book = buildPriceBook(items, MARKUP);
    expect(book.find((r) => r.calc_key === "sarking")).toMatchObject({ unit: "roll", pack_qty: 81, unit_cost_ex_gst: 100, product_code: "SK60" });
    expect(book.find((r) => r.calc_key === "skip_bin")!.unit_price_inc_gst).toBe(528);
  });
  it("ranks boxes and rolls of different sizes per piece / per m²", () => {
    const book = buildPriceBook([
      item({ id: "box500", calc_key: "roof_screws", unit: "box", cost_ex_gst: 50, pack_qty: 500 }),
      item({ id: "box1000", calc_key: "roof_screws", unit: "box", cost_ex_gst: 90, pack_qty: 1000 }),
      item({ id: "roll30", calc_key: "sarking", unit: "roll", cost_ex_gst: 60, pack_qty: 40.5 }),
      item({ id: "roll60", calc_key: "sarking", unit: "roll", cost_ex_gst: 100, pack_qty: 81 }),
    ], MARKUP);
    expect(book.find((r) => r.calc_key === "roof_screws")).toMatchObject({ supplier_price_item_id: "box1000", unit_cost_ex_gst: 90, pack_qty: 1000 });
    expect(book.find((r) => r.calc_key === "sarking")!.supplier_price_item_id).toBe("roll60");
    const cmp = compareBooks([
      { id: "A", name: "A", rows: buildPriceBook([item({ id: "a", calc_key: "roof_screws", unit: "box", cost_ex_gst: 50, pack_qty: 500 })], MARKUP) },
      { id: "B", name: "B", rows: buildPriceBook([item({ id: "b", calc_key: "roof_screws", unit: "box", cost_ex_gst: 95, pack_qty: 1000 })], MARKUP) },
    ]);
    expect(cmp.rows[0]).toMatchObject({ per: "ea", cheapest: "B" });
    expect(cmp.rows[0].cells.A!.cost).toBe(0.1);
  });
  it("compares suppliers and flags the cheapest", () => {
    const a = buildPriceBook(items, MARKUP);
    const b = buildPriceBook([item({ id: "b-sheet", calc_key: "metal_sheet", unit: "lm", cost_ex_gst: 9.8 })], MARKUP);
    const cmp = compareBooks([{ id: "A", name: "Lysaght", rows: a }, { id: "B", name: "Stramit", rows: b }], ["metal_sheet", "gutter"]);
    expect(cmp.rows.map((r) => [r.calc_key, r.cheapest])).toEqual([["metal_sheet", "B"], ["gutter", null]]); // only one supplier has gutter: no "cheapest" badge
    expect(cmp.rows[1].cells.B).toBeNull();
  });
});

describe("supplier-aware order lines", () => {
  const items: PriceItem[] = [
    item({ id: "g", calc_key: "gutter", unit: "length", cost_ex_gst: 58.5, length_mm: 6500, product_code: "QG115", description: "Quad gutter 115 6.5m" }),
    item({ id: "s", calc_key: "roof_screws", unit: "box", cost_ex_gst: 50, pack_qty: 500, product_code: "SCR500", description: "Roofing screws box 500" }),
    item({ id: "c", calc_key: "metal_sheet", unit: "lm", cost_ex_gst: 12, product_code: "CO42", description: "Custom Orb 0.42" }),
  ];
  it("rounds discrete supplier units up", () => {
    expect(supplierQuantity(30, 6.5, "length")).toBe(5);
    expect(supplierQuantity(26, 6.5, "length")).toBe(4);
    expect(supplierQuantity(12.345, 1, "lm")).toBe(12.35);
  });
  it("uses the supplier's code, description and unit, converting quantities", () => {
    const { lines, matched } = mapLinesToSupplier([
      { description: "Gutter", quantity: 30, unit: "lm", unit_cost: 0, calc_key: "gutter" },
      { description: "Screws", quantity: 3, unit: "box", unit_cost: 0, calc_key: "roof_screws" },
      { description: "Sheeting", quantity: 180.5, unit: "lm", unit_cost: 0, calc_key: "metal_sheet", supplier_price_item_id: "c" },
      { description: "Skylight", quantity: 1, unit: "ea", unit_cost: 450, calc_key: null },
    ], items, MARKUP);
    expect(matched).toBe(3);
    expect(lines[0]).toMatchObject({ sku: "QG115", description: "Quad gutter 115 6.5m", quantity: 5, unit: "length", unit_cost: 58.5, supplier_price_item_id: "g" });
    expect(lines[1]).toMatchObject({ sku: "SCR500", quantity: 3, unit: "box" });
    expect(lines[2]).toMatchObject({ sku: "CO42", quantity: 180.5, unit: "lm" });
    expect(lines[3]).toMatchObject({ description: "Skylight", sku: null, unit_cost: 450, supplier_price_item_id: null });
  });
  it("switching supplier converts back through calc units and re-packs boxes", () => {
    const from = new Map(items.map((i) => [i.id, i]));
    const src = toSourceLines([
      { description: "Quad gutter 115 6.5m", quantity: 5, unit: "length", unit_cost: 58.5, calc_key: "gutter", supplier_price_item_id: "g" },
      { description: "Roofing screws box 500", quantity: 3, unit: "box", unit_cost: 50, calc_key: "roof_screws", supplier_price_item_id: "s" },
    ], from);
    expect(src[0]).toMatchObject({ quantity: 32.5, unit: "lm" });
    expect(src[1]).toMatchObject({ quantity: 3, unit: "box", pack_qty: 500 });
    const other: PriceItem[] = [
      item({ id: "g2", calc_key: "gutter", unit: "lm", cost_ex_gst: 9.5, product_code: "G2" }),
      item({ id: "s2", calc_key: "roof_screws", unit: "box", cost_ex_gst: 95, pack_qty: 1000, product_code: "S2" }),
    ];
    const { lines } = mapLinesToSupplier(src, other, MARKUP);
    expect(lines[0]).toMatchObject({ sku: "G2", quantity: 32.5, unit: "lm" });
    expect(lines[1]).toMatchObject({ sku: "S2", quantity: 2, unit: "box" }); // 1500 screws → 2 boxes of 1000
  });
  it("CSV leads with supplier product codes and an AU date", () => {
    const csv = supplierOrderCsv({ supplier: "Lysaght", account_number: "ACC-9", branch: "Smithfield", po_number: "PO1", color: "Monument", delivery_date: "2026-11-20", delivery_type: "roof_load", notes: null, job: "Smith — Re-roof", address: "1 Main St, Parramatta NSW 2150" },
      [{ description: "Quad gutter 115 6.5m", sku: "QG115", quantity: 5, unit: "length" }]);
    expect(csv).toContain("Account,ACC-9");
    expect(csv).toContain("Delivery date,20/11/2026");
    expect(csv).toContain("Line,Product code,Description,Quantity,Unit\n1,QG115,Quad gutter 115 6.5m,5,length");
    expect(csv).toContain('"1 Main St, Parramatta NSW 2150"');
  });
});
