"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

export type MapApi = { L: typeof Leaflet; map: Leaflet.Map };

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Leaflet map with Esri World Imagery (satellite) and an OpenStreetMap fallback when satellite
 * tiles fail to load. Pages draw their own layers through `onReady`.
 */
export function MapCanvas({
  center,
  zoom = 19,
  satellite = true,
  onReady,
  className = "h-[60vh] min-h-80",
}: {
  center: [number, number];
  zoom?: number;
  satellite?: boolean;
  onReady: (api: MapApi) => void | (() => void);
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"satellite" | "street">(satellite ? "satellite" : "street");
  const apiRef = useRef<{ api: MapApi; layer: Leaflet.TileLayer; setBase: (m: "satellite" | "street", auto?: boolean) => void } | null>(null);
  const initial = useRef({ center, zoom, mode });

  useEffect(() => {
    let cancelled = false;
    let cleanup: void | (() => void);
    let map: Leaflet.Map | null = null;
    import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: true, attributionControl: true, maxZoom: 21 }).setView(initial.current.center, initial.current.zoom);
      const holder = { api: { L, map }, layer: null as unknown as Leaflet.TileLayer, setBase: (() => undefined) as (m: "satellite" | "street", auto?: boolean) => void };
      const setBase = (m: "satellite" | "street", auto = false) => {
        if (holder.layer) map!.removeLayer(holder.layer);
        let errors = 0;
        let loads = 0;
        const layer = m === "satellite"
          ? L.tileLayer(ESRI, { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" })
          : L.tileLayer(OSM, { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap contributors" });
        layer.on("tileload", () => { loads++; });
        layer.on("tileerror", () => {
          errors++;
          if (errors >= 3 && loads === 0) {
            if (m === "satellite") {
              setMsg("Satellite imagery didn't load, so you're seeing a street map. You can still trace and measure.");
              setMode("street");
              setBase("street", true);
            } else {
              setMsg("Map tiles couldn't load (no connection?). You can still place points — measurements come from coordinates, not the picture.");
            }
          }
        });
        layer.addTo(map!);
        holder.layer = layer;
        if (!auto) setMsg(null);
      };
      holder.setBase = setBase;
      setBase(initial.current.mode, true);
      apiRef.current = holder;
      cleanup = ready.current(holder.api);
    });
    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
      map?.remove();
      apiRef.current = null;
    };
  }, []);

  return (
    <div className="relative">
      <div ref={el} className={`${className} w-full overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-300`} data-map />
      <div className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg bg-white text-xs font-medium ring-1 ring-slate-300">
        {(["satellite", "street"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); apiRef.current?.setBase(m); }}
            className={`px-3 py-2 ${mode === m ? "bg-slate-900 text-white" : "text-slate-700"}`}
          >
            {m === "satellite" ? "Satellite" : "Street"}
          </button>
        ))}
      </div>
      {msg && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200" data-map-message>{msg}</p>}
    </div>
  );
}
