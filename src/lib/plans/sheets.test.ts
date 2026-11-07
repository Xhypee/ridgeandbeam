import { describe, expect, it } from "vitest";
import type { Pt } from "./geometry";
import type { AnalyzedFace } from "./roof-model";
import { nestPieces, planSheets, runLengths, type Piece } from "./sheets";

const face = (pts: Pt[], eave: [Pt, Pt]): AnalyzedFace => ({ pts, eave, plan: 0, area: 0, label: [0, 0], name: "Panel A", edges: [] });
const cos = (d: number) => Math.cos((d * Math.PI) / 180);

describe("sheet lengths", () => {
  it("a full strip runs from the gutter to the top plus the overhang, rounded up to 10 mm", () => {
    const p = planSheets({ faces: [face([[0, 0], [762, 0], [762, 3000], [0, 3000]], [[0, 0], [762, 0]])] }, 20, { coverMm: 762, overhangMm: 55 });
    expect(p.pieces).toHaveLength(1);
    expect(p.pieces[0].lengthMm).toBe(Math.ceil((3000 / cos(20) + 55) / 10) * 10);
  });
  it("a piece cut on a valley is measured from its own lowest point, not from the gutter line", () => {
    // Second strip's bottom is a valley cut rising from y = 500 to y = 1262.
    const pts: Pt[] = [[0, 0], [762, 0], [762, 500], [1524, 1262], [1524, 3000], [0, 3000]];
    const p = planSheets({ faces: [face(pts, [[0, 0], [762, 0]])] }, 20, { coverMm: 762, overhangMm: 55 });
    const valleyPiece = p.pieces.find((x) => !x.onGutter)!;
    expect(valleyPiece.lengthMm).toBe(Math.ceil(((3000 - 500) / cos(20)) / 10) * 10);
    expect(valleyPiece.lengthMm).toBeLessThan(3000 / cos(20));
    expect(valleyPiece.bottom).not.toBeNull();
  });
});

describe("nesting angled pieces", () => {
  const piece = (len: number, top: number | null, bottom: number | null): Piece => ({
    face: 0, k: 0, lengthMm: len, rawMm: len, onGutter: bottom == null, pts: [],
    top: top == null ? null : { k: top, along: 800 }, bottom: bottom == null ? null : { k: bottom, along: 800 },
  });
  it("Custom Orb: two hip-cut tops pair up by turning one sheet end for end", () => {
    const sheets = nestPieces([piece(5000, 1, null), piece(2000, 1, null)], { rotatable: true, maxNestMm: 15000 });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].nested).toBe(true);
    expect(sheets[0].lengthMm).toBe(5000 + 2000 - 800);
  });
  it("ribbed profiles can't turn, so two hip-cut tops are not nested", () => {
    const sheets = nestPieces([piece(5000, 1, null), piece(2000, 1, null)], { rotatable: false, maxNestMm: 15000 });
    expect(sheets.filter((s) => s.nested)).toHaveLength(0);
  });
  it("ribbed profiles still pair a hip-cut top with a matching valley-cut bottom", () => {
    const sheets = nestPieces([piece(5000, 1, null), piece(2500, null, 1)], { rotatable: false, maxNestMm: 15000 });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].nested).toBe(true);
  });
  it("cuts that slope opposite ways don't fit, and nothing longer than the limit is made", () => {
    expect(nestPieces([piece(5000, 1, null), piece(2500, null, -1)], { rotatable: false, maxNestMm: 15000 }).filter((s) => s.nested)).toHaveLength(0);
    expect(nestPieces([piece(9000, 1, null), piece(8000, 1, null)], { rotatable: true, maxNestMm: 15000 }).filter((s) => s.nested)).toHaveLength(0);
  });
});

describe("flashing lengths", () => {
  it("adds 300 mm per run and rounds up to 100 mm", () => {
    expect(runLengths(5600, 300, { lapMm: 100, maxLengthMm: 8000 })).toEqual([5900]);
    expect(runLengths(1250, 300, { lapMm: 100, maxLengthMm: 8000 })).toEqual([1600]);
  });
  it("splits long runs into 8 m lengths with 100 mm laps", () => {
    expect(runLengths(11320, 300, { lapMm: 100, maxLengthMm: 8000 })).toEqual([8000, 3800]);
  });
});
