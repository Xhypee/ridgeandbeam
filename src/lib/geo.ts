/** Geometry helpers for the satellite measure tool and canvassing map. Pure functions (unit-tested). */

export type LatLng = [lat: number, lng: number];

/** WGS84 mean radius used by Leaflet.draw / turf. */
const R = 6378137;
const SQFT_PER_SQM = 10.76391041671;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Geodesic area of a simple polygon on the sphere (spherical excess approximation, as used
 * by Leaflet.draw's `geodesicArea` and turf's `area`). Returns square meters; ring orientation
 * doesn't matter. Accurate to well under 0.5% for roof-sized shapes.
 */
export function polygonAreaSqM(points: LatLng[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % n];
    area += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((area * R * R) / 2);
}

export const polygonAreaSqFt = (points: LatLng[]) => polygonAreaSqM(points) * SQFT_PER_SQM;

/** Planar shoelace area on a local equirectangular projection (meters) — a cross-check for tests. */
export function projectedAreaSqM(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const lat0 = points.reduce((s, p) => s + p[0], 0) / points.length;
  const xy = points.map(([lat, lng]) => [rad(lng) * R * Math.cos(rad(lat0)), rad(lat) * R]);
  let s = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

/** Offset a point by meters east/north (small distances). */
export function offsetMeters([lat, lng]: LatLng, east: number, north: number): LatLng {
  return [lat + (north / R) * (180 / Math.PI), lng + (east / (R * Math.cos(rad(lat)))) * (180 / Math.PI)];
}

/** Ray-casting point-in-polygon on lat/lng (fine for neighborhood-sized polygons). */
export function pointInPolygon([lat, lng]: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** GeoJSON (Feature, FeatureCollection, Polygon, MultiPolygon) -> list of outer rings as [lat,lng]. */
export function geojsonRings(gj: unknown): LatLng[][] {
  const out: LatLng[][] = [];
  const visit = (g: unknown) => {
    if (!g || typeof g !== "object") return;
    const o = g as { type?: string; features?: unknown[]; geometry?: unknown; geometries?: unknown[]; coordinates?: unknown };
    if (o.type === "FeatureCollection") o.features?.forEach(visit);
    else if (o.type === "Feature") visit(o.geometry);
    else if (o.type === "GeometryCollection") o.geometries?.forEach(visit);
    else if (o.type === "Polygon") {
      const ring = (o.coordinates as number[][][] | undefined)?.[0];
      if (ring) out.push(ring.map(([x, y]) => [y, x] as LatLng));
    } else if (o.type === "MultiPolygon") {
      for (const poly of (o.coordinates as number[][][][] | undefined) ?? []) if (poly[0]) out.push(poly[0].map(([x, y]) => [y, x] as LatLng));
    }
  };
  visit(gj);
  return out.filter((r) => r.length >= 3 && r.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)));
}

/** [lat,lng] rings -> GeoJSON MultiPolygon geometry (closed rings, lng/lat order). */
export function ringsToGeojson(rings: LatLng[][]) {
  return {
    type: "MultiPolygon" as const,
    coordinates: rings.map((r) => {
      const ring = r.map(([lat, lng]) => [lng, lat]);
      const [f, l] = [ring[0], ring[ring.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([...f]);
      return [ring];
    }),
  };
}
