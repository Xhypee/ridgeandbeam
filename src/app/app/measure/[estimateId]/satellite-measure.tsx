"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type * as Leaflet from "leaflet";
import { Button, Input, cx } from "@/components/ui";
import { MapCanvas, type MapApi } from "@/components/map/map-canvas";
import { polygonAreaSqM, type LatLng } from "@/lib/geo";
import { pitchFactor } from "@/lib/roof";
import { saveSatelliteMeasure } from "../actions";

export type Facet = { id: string; label: string; pitch: number; points: LatLng[] };
const PITCHES = [0, 5, 10, 15, 20, 22.5, 25, 30, 35, 40, 45];
const AU_CENTER: LatLng = [-25.27, 133.78];
const fmt = (n: number, d = 0) => n.toLocaleString("en-AU", { maximumFractionDigits: d, minimumFractionDigits: d });

export function SatelliteMeasure({ estimateId, address, initialCenter, initialZoom, initialFacets, locked }: {
  estimateId: string; address: string; initialCenter: LatLng | null; initialZoom?: number; initialFacets: Facet[]; locked: boolean;
}) {
  const [facets, setFacets] = useState<Facet[]>(initialFacets);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<LatLng[] | null>(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(initialCenter ? null : address ? "Finding the address…" : "No address on this job. Pan and zoom to the roof.");
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  const api = useRef<MapApi | null>(null);
  const group = useRef<Leaflet.LayerGroup | null>(null);
  const lastPitch = useRef(initialFacets.at(-1)?.pitch ?? 22.5);
  const click = useRef<(p: LatLng) => void>(() => {});

  const update = (fn: (f: Facet[]) => Facet[]) => { setFacets(fn); setDirty(true); setResult(null); };

  const finish = () => {
    if (!drawing || drawing.length < 3) return;
    let n = facets.length + 1;
    while (facets.some((x) => x.id === `f${n}`)) n++;
    const id = `f${n}`;
    const pts = drawing;
    update((fs) => [...fs, { id, label: `Facet ${n}`, pitch: lastPitch.current, points: pts }]);
    setDrawing(null);
    setSelected(id);
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  // Map click: add a vertex while drawing, otherwise deselect.
  useEffect(() => {
    click.current = (p) => {
      if (locked) return;
      if (drawing) setDrawing([...drawing, p]);
      else setSelected(null);
    };
  }, [drawing, locked]);

  const onReady = useCallback(({ L, map }: MapApi) => {
    api.current = { L, map };
    group.current = L.layerGroup().addTo(map);
    map.on("click", (e: Leaflet.LeafletMouseEvent) => click.current([e.latlng.lat, e.latlng.lng]));
    setReady(true);
  }, []);

  // Geocode the job address once when we don't have saved coordinates.
  useEffect(() => {
    if (initialCenter || !address || !ready) return;
    let stop = false;
    fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((j: { lat?: number; lng?: number; precision?: string; error?: string }) => {
        if (stop) return;
        if (j.lat != null && j.lng != null) {
          api.current?.map.setView([j.lat, j.lng], j.precision === "address" ? 20 : 15);
          setGeoMsg(j.precision === "address" ? null : "Found the area but not the exact house. Pan to the roof.");
        } else setGeoMsg(j.error ?? "Couldn't find that address. Pan and zoom to the roof.");
      })
      .catch(() => !stop && setGeoMsg("Address lookup is offline. Pan and zoom to the roof."));
    return () => { stop = true; };
  }, [initialCenter, address, ready]);

  // Never lose a tracing by accident.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Redraw all layers from state.
  useEffect(() => {
    const a = api.current;
    const g = group.current;
    if (!a || !g || !ready) return;
    const { L } = a;
    g.clearLayers();
    for (const f of facets) {
      const isSel = f.id === selected && !drawing;
      const poly = L.polygon(f.points, { color: isSel ? "#f97316" : "#22d3ee", weight: isSel ? 3 : 2, fillOpacity: isSel ? 0.35 : 0.2 }).addTo(g);
      const m2 = polygonAreaSqM(f.points) * pitchFactor(f.pitch);
      poly.bindTooltip(`${f.label}: ${fmt(m2, 1)} m²`, { permanent: true, direction: "center", className: "!bg-white/90 !text-xs !font-semibold" });
      poly.on("click", (ev: Leaflet.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        if (drawing) click.current([ev.latlng.lat, ev.latlng.lng]);
        else setSelected(f.id);
      });
      if (isSel && !locked) {
        f.points.forEach((p, i) => {
          const m = L.marker(p, {
            draggable: !removeMode,
            icon: L.divIcon({ className: "", html: `<div style="width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:9999px;background:${removeMode ? "#dc2626" : "#fff"};border:3px solid #f97316;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>` }),
          }).addTo(g);
          m.on("drag", () => {
            const ll = m.getLatLng();
            const pts = [...f.points];
            pts[i] = [ll.lat, ll.lng];
            poly.setLatLngs(pts);
          });
          m.on("dragend", () => {
            const ll = m.getLatLng();
            update((fs) => fs.map((x) => (x.id === f.id ? { ...x, points: x.points.map((q, j) => (j === i ? ([ll.lat, ll.lng] as LatLng) : q)) } : x)));
          });
          m.on("click", (ev: Leaflet.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            if (removeMode && f.points.length > 3) update((fs) => fs.map((x) => (x.id === f.id ? { ...x, points: x.points.filter((_, j) => j !== i) } : x)));
          });
        });
      }
    }
    if (drawing) {
      if (drawing.length > 1) L.polyline(drawing, { color: "#f97316", weight: 3, dashArray: "6 4" }).addTo(g);
      drawing.forEach((p, i) => {
        const c = L.circleMarker(p, { radius: i === 0 && drawing.length >= 3 ? 10 : 6, color: "#f97316", fillColor: i === 0 ? "#f97316" : "#fff", fillOpacity: 1, weight: 3 }).addTo(g);
        if (i === 0 && drawing.length >= 3) {
          c.bindTooltip("Tap to close", { direction: "top" });
          c.on("click", (ev: Leaflet.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); finishRef.current(); });
        }
      });
    }
  }, [facets, selected, drawing, removeMode, ready, locked]);

  const rows = facets.map((f) => {
    const plan = polygonAreaSqM(f.points);
    const pf = pitchFactor(f.pitch);
    return { f, plan, pf, area: plan * pf };
  });
  const totPlan = rows.reduce((s, r) => s + r.plan, 0);
  const totArea = rows.reduce((s, r) => s + r.area, 0);
  const sel = rows.find((r) => r.f.id === selected);

  const save = () =>
    start(async () => {
      const a = api.current?.map;
      const c = a?.getCenter();
      const r = await saveSatelliteMeasure({
        estimateId,
        center: c ? [c.lat, c.lng] : undefined,
        zoom: a?.getZoom(),
        facets: facets.map(({ label, pitch, points }) => ({ label, pitch, points })),
      });
      setResult(r ?? null);
      if (r?.ok) setDirty(false);
    });

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700 ring-1 ring-brand-100">
        <b>Trace roof edges including overhangs; verify pitch on site.</b> Satellite photos can be off by half a metre or more and trees hide edges — treat this as a starting measurement.
      </p>
      {geoMsg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700" data-geo-message>{geoMsg}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <p className="text-sm text-slate-600">This quote is accepted, so measurements are locked.</p>
        ) : drawing ? (
          <>
            <span className="text-sm font-medium text-slate-800" data-drawing>Tap each roof corner · {drawing.length} point{drawing.length === 1 ? "" : "s"}</span>
            <Button type="button" onClick={finish} disabled={drawing.length < 3} className="min-h-11">Finish facet</Button>
            <Button type="button" variant="secondary" onClick={() => setDrawing(drawing.slice(0, -1))} disabled={!drawing.length} className="min-h-11">Undo point</Button>
            <Button type="button" variant="ghost" onClick={() => setDrawing(null)} className="min-h-11">Cancel</Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={() => { setSelected(null); setRemoveMode(false); setDrawing([]); }} className="min-h-11">+ Trace a facet</Button>
            {sel && (
              <>
                <Button type="button" variant={removeMode ? "danger" : "secondary"} onClick={() => setRemoveMode(!removeMode)} className="min-h-11">{removeMode ? "Done removing" : "Remove points"}</Button>
                <Button type="button" variant="danger" onClick={() => { update((fs) => fs.filter((x) => x.id !== sel.f.id)); setSelected(null); }} className="min-h-11">Delete {sel.f.label}</Button>
              </>
            )}
            {sel && <span className="text-xs text-slate-500">Drag the white dots to adjust corners.</span>}
          </>
        )}
      </div>

      <MapCanvas center={initialCenter ?? AU_CENTER} zoom={initialCenter ? (initialZoom ?? 20) : 4} onReady={onReady} className="h-[55vh] min-h-80 cursor-crosshair" />

      <div className="rounded-xl bg-white ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold">Facets</h2>
          <p className="text-sm text-slate-600" data-measure-total>
            Plan {fmt(totPlan, 1)} m² · <b className="text-slate-900">{fmt(totArea, 1)} m² true roof area</b> (before waste)
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Tap <b>+ Trace a facet</b>, then tap each corner of one roof plane. Trace each plane that has a different pitch separately.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ f, plan, pf, area }) => (
              <li key={f.id} className={cx("space-y-2 px-4 py-3", f.id === selected && "bg-brand-50/50")} data-facet>
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Facet name" value={f.label} disabled={locked} onChange={(e) => update((fs) => fs.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))} onFocus={() => setSelected(f.id)} className="max-w-44" />
                  <span className="text-sm tabular-nums text-slate-600">{fmt(plan, 1)} m² plan × {pf.toFixed(3)} = <b className="text-slate-900">{fmt(area, 1)} m²</b></span>
                </div>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Pitch for ${f.label}`}>
                  <span className="mr-1 text-xs text-slate-500">Pitch °</span>
                  {PITCHES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={locked}
                      aria-pressed={f.pitch === p}
                      onClick={() => { lastPitch.current = p; update((fs) => fs.map((x) => (x.id === f.id ? { ...x, pitch: p } : x))); }}
                      className={cx("min-h-9 min-w-11 rounded-md px-2 text-sm font-medium ring-1", f.pitch === p ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300")}
                    >
                      {p}°
                    </button>
                  ))}
                  <span className="w-20"><Input aria-label="Custom pitch degrees" type="number" min={0} max={60} step={0.5} value={f.pitch} disabled={locked} onChange={(e) => update((fs) => fs.map((x) => (x.id === f.id ? { ...x, pitch: Math.max(0, Math.min(60, Number(e.target.value) || 0)) } : x)))} /></span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || !facets.length || !!drawing} className="min-h-11">{pending ? "Saving…" : "Save to quote"}</Button>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          {result?.ok && <span className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">{result.ok} <Link className="font-medium underline" href={`/app/estimates/${estimateId}`}>Open quote</Link></span>}
          {result?.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</span>}
        </div>
      )}
    </div>
  );
}
