import { describe, expect, it } from "vitest";
import { downpipeCount, pagePitch, parsePaper, parseScale, pitchLabels } from "./detect";
import {
  mergeDetails, parseAddress, parseBuildingType, parseCouncil, parseDesigner, parseDetails, parseDownpipes, parseDrawingDate, parseEaveOverhang,
  parseLot, parseRoofMaterial, parseStoreys, type Found,
} from "./details";
import type { VText } from "./pdf";

// A made-up title block (Victoria), laid out the way drafting templates do: label, then the value under it.
const t = (s: string, x: number, y: number, size = 2.5, angle = 0): VText => ({ s, x, y, size, angle });
const titleBlock: VText[] = [
  t("PROJECT ADDRESS:", 340, 200), t("12 WATTLE GROVE", 340, 205), t("ELTHAM VIC 3095", 340, 210),
  t("CLIENT", 340, 220), t("J & K NGUYEN", 340, 225),
  t("PROJECT", 340, 235), t("NEW DWELLING", 340, 240),
  t("DATE", 340, 250), t("03.02.26", 340, 255),
  t("DRAWN BY", 380, 250), t("BUSHLINE DRAFTING", 380, 255),
  t("LOT 4 PS 712345", 20, 20), t("COUNCIL: NILLUMBIK", 20, 25),
];
const notes: VText[] = [
  t("DOUBLE STOREY BRICK VENEER", 50, 50), t("CONCRETE ROOF TILES TO MANUFACTURER'S SPECS", 50, 55),
  t("DOWNPIPES 90 DIA PVC AT MAX 10m CTRS", 50, 60), t("450 EAVES", 50, 65), t("22.5°", 100, 100), t("22.5°", 120, 100),
];

describe("title block parsing", () => {
  const found = parseDetails([{ index: 0, texts: titleBlock }, { index: 3, texts: notes }], { pitch: 22.5, roofPage: 3 });
  const v = (k: Found["key"]) => found.find((f) => f.key === k)?.value;
  it("reads the site address into street, suburb, state and postcode", () => {
    expect(v("street")).toBe("12 Wattle Grove");
    expect(v("suburb")).toBe("Eltham");
    expect(v("state")).toBe("VIC");
    expect(v("postcode")).toBe("3095");
  });
  it("reads client, lot, council, designer, date and building type with their sheet", () => {
    expect(v("client")).toBe("J & K Nguyen");
    expect(v("lot")).toBe("Lot 4 on PS712345");
    expect(v("council")).toBe("Nillumbik");
    expect(v("designer")).toBe("Bushline Drafting");
    expect(v("drawingDate")).toBe("03/02/2026");
    expect(v("buildingType")).toBe("New Dwelling");
    expect(found.find((f) => f.key === "street")!.page).toBe(0);
  });
  it("reads notes on other sheets", () => {
    expect(v("storeys")).toBe("2");
    expect(v("roofMaterial")).toBe("Concrete tile");
    expect(v("downpipes")).toBe("90 mm PVC, max 10 m apart".replace("PVC", "uPVC"));
    expect(v("eaveOverhang")).toBe("450 mm");
    expect(v("pitch")).toBe("22.5°");
  });
  it("reads a title block turned 90° on the sheet", () => {
    const rot = [t("CLIENT.", 500, 120, 2.8, -90), t("SUNSHINE HOMES PTY LTD", 505, 120, 2.8, -90), t("DATE.", 500, 60, 2.8, -90), t("1/7/2026", 505, 60, 2.8, -90)];
    const f = parseDetails([{ index: 1, texts: rot }]);
    expect(f.find((x) => x.key === "client")?.value).toBe("Sunshine Homes Pty Ltd");
    expect(f.find((x) => x.key === "drawingDate")?.value).toBe("01/07/2026");
  });
});

describe("field parsers", () => {
  it("addresses", () => {
    expect(parseAddress("Unit 2, 45 Smith St, Fitzroy VIC 3065")).toMatchObject({ street: "Unit 2, 45 Smith St", suburb: "Fitzroy", state: "VIC", postcode: "3065" });
    expect(parseAddress("7 BANKSIA COURT, MOUNT GRAVATT 4122")).toMatchObject({ street: "7 Banksia Court", suburb: "Mount Gravatt", state: "QLD", postcode: "4122" });
  });
  it("lots and plans in each state's style", () => {
    expect(parseLot("LOT: 7 on SP123456")).toBe("Lot 7 on SP123456");
    expect(parseLot("Lot 3 DP 12345")).toBe("Lot 3 on DP12345");
    expect(parseLot("LOT 21 ON RP 801234")).toBe("Lot 21 on RP801234");
    expect(parseLot("no lot here")).toBeNull();
  });
  it("councils, designers, dates", () => {
    expect(parseCouncil("LOCAL AUTHORITY: LOGAN")).toBe("Logan");
    expect(parseCouncil("SUBMIT TO GOLD COAST CITY COUNCIL FOR APPROVAL")).toBe("Gold Coast");
    expect(parseCouncil("AS DIRECTED BY LOCAL COUNCIL")).toBeNull();
    expect(parseDesigner("EXCLUSIVE USE BY THE CLIENT OF COASTLINE STUDIO FOR THE PURPOSE\nE. HELLO@COASTLINESTUDIO.COM.AU")).toBe("Coastline Studio");
    expect(parseDrawingDate("10/09/25")).toBe("10/09/2025");
    expect(parseDrawingDate("31/13/25")).toBeNull();
  });
  it("building, storeys, roof, downpipes, eaves", () => {
    expect(parseBuildingType("PROPOSED ALTERATIONS & ADDITIONS")).toMatchObject({ jobType: "new_construction" });
    expect(parseBuildingType("NEW RESIDENCE").jobType).toBe("new_construction");
    expect(parseStoreys("SINGLE STORY")).toBe(1);
    expect(parseRoofMaterial("COLOURBOND ROOF")).toMatchObject({ system: "metal" });
    expect(parseRoofMaterial("TERRACOTTA ROOF TILES")).toMatchObject({ system: "terracotta_tile" });
    expect(parseDownpipes("DOWNPIPES (DP) TO BE 100mmØ UPVC. MAXIMUM 12.0m CTRS")).toBe("100 mm uPVC, max 12 m apart");
    expect(parseEaveOverhang("EAVES 600")).toBe(600);
  });
  it("AI only fills what the parser didn't find", () => {
    const merged = mergeDetails([{ key: "client", value: "A", page: 0, via: "plans" }], { client: { value: "B", page: 1 }, council: { value: "Casey", page: 2 } });
    expect(merged.find((f) => f.key === "client")?.value).toBe("A");
    expect(merged.find((f) => f.key === "council")).toMatchObject({ value: "Casey", via: "ai", page: 2 });
  });
});

describe("scale, pitch and downpipes from page text", () => {
  it("scale labels", () => {
    expect(parseScale("SCALE 1 : 100 @ A3")).toBe(100);
    expect(parseScale("1:200")).toBe(200);
    expect(parseScale("SCALE AS SHOWN @ A3")).toBeNull();
    expect(parsePaper("SCALE AS SHOWN @ A3")).toBe("A3");
  });
  it("pitch: degree labels (not bearings), most common wins", () => {
    expect(pitchLabels([{ s: "23°" }, { s: "22.5 deg" }, { s: "100° 34' 25\"" }])).toEqual([23, 22.5]);
    expect(pagePitch([{ s: "23°" }, { s: "23°" }, { s: "15°" }])).toBe(23);
  });
  it("counts DP marks, not the words in notes", () => {
    expect(downpipeCount([{ s: "DP" }, { s: "DP" }, { s: "DOWNPIPES (DP) TO BE 100mm" }, { s: "dp" }])).toBe(2);
  });
});
