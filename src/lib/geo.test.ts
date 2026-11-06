import { describe, expect, it } from "vitest";
import { geojsonRings, offsetMeters, pointInPolygon, polygonAreaSqFt, polygonAreaSqM, projectedAreaSqM, ringsToGeojson, type LatLng } from "./geo";

const rect = (origin: LatLng, w: number, h: number): LatLng[] => [
  origin,
  offsetMeters(origin, w, 0),
  offsetMeters(origin, w, h),
  offsetMeters(origin, 0, h),
];

describe("polygonAreaSqM", () => {
  it("returns 0 for fewer than 3 points", () => {
    expect(polygonAreaSqM([])).toBe(0);
    expect(polygonAreaSqM([[39, -105], [39.1, -105]])).toBe(0);
  });

  it("measures a 20m x 10m rectangle in Denver within 0.5%", () => {
    const a = polygonAreaSqM(rect([39.7392, -104.9903], 20, 10));
    expect(a).toBeGreaterThan(199);
    expect(a).toBeLessThan(201);
  });

  it("agrees with a projected shoelace computation for an L-shaped roof", () => {
    const o: LatLng = [33.4484, -112.074];
    const pts: LatLng[] = [o, offsetMeters(o, 15, 0), offsetMeters(o, 15, 6), offsetMeters(o, 6, 6), offsetMeters(o, 6, 12), offsetMeters(o, 0, 12)];
    const geo = polygonAreaSqM(pts);
    expect(geo).toBeCloseTo(15 * 6 + 6 * 6, 0);
    expect(Math.abs(geo - projectedAreaSqM(pts)) / geo).toBeLessThan(0.002);
  });

  it("ignores ring orientation", () => {
    const pts = rect([45, -93], 30, 12);
    expect(polygonAreaSqM([...pts].reverse())).toBeCloseTo(polygonAreaSqM(pts), 6);
  });

  it("converts to square feet (100 m² ≈ 1076 sq ft)", () => {
    expect(polygonAreaSqFt(rect([40, -75], 10, 10))).toBeCloseTo(1076.4, 0);
  });
});

describe("pointInPolygon", () => {
  const sq: LatLng[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  it("detects inside/outside", () => {
    expect(pointInPolygon([0.5, 0.5], sq)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], sq)).toBe(false);
  });
});

describe("geojson", () => {
  it("reads Feature/MultiPolygon rings as lat,lng and round-trips", () => {
    const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[-97, 32], [-96, 32], [-96, 33], [-97, 32]]] } }] };
    const rings = geojsonRings(fc);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual([32, -97]);
    const back = ringsToGeojson(rings);
    expect(geojsonRings(back)[0]).toEqual(rings[0]);
    expect(geojsonRings({ type: "Point", coordinates: [1, 2] })).toEqual([]);
  });
});
