"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type * as Leaflet from "leaflet";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import { MapCanvas, type MapApi } from "@/components/map/map-canvas";
import { geojsonRings, type LatLng } from "@/lib/geo";
import { convertKnock, createKnock, createTerritory, deleteKnock, deleteTerritory, updateKnock } from "./actions";
import { CsvImport } from "./csv-import";
import { KNOCK_META, type KnockStatus } from "./statuses";

export type Knock = { id: string; lat: number; lng: number; status: KnockStatus; notes: string | null; address: string | null; setter_id: string | null; customer_id: string | null; territory_id: string | null; created_at: string };
export type Territory = { id: string; name: string; kind: "territory" | "hail_swath"; geojson: unknown; color: string; assigned_to: string | null; storm_date: string | null };
type Person = { id: string; name: string };
type Draft = { lat: number; lng: number; status: KnockStatus; notes: string; address: string; queuedAt: number };

const QUICK: KnockStatus[] = ["not_home", "not_interested", "come_back", "interested", "inspection_booked"];
const QUEUE_KEY = "rb-knock-queue";
const readQueue = (): Draft[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Draft[]; } catch { return []; } };
const writeQueue = (q: Draft[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full or blocked */ } };

export function CanvassApp({ knocks, territories, people, center, hasData }: { knocks: Knock[]; territories: Territory[]; people: Person[]; center: LatLng; hasData: boolean }) {
  const [view, setView] = useState<"map" | "list" | "territories" | "import">("map");
  const [sheet, setSheet] = useState<{ mode: "new"; lat: number; lng: number } | { mode: "edit"; id: string } | null>(null);
  const [drawing, setDrawing] = useState<LatLng[] | null>(null);
  const [newTerritory, setNewTerritory] = useState<LatLng[][] | null>(null);
  const [queue, setQueue] = useState<Draft[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const api = useRef<MapApi | null>(null);
  const layers = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const click = useRef<(p: LatLng) => void>(() => {});
  const names = new Map(people.map((p) => [p.id, p.name]));

  // Offline queue: knocks that couldn't be sent are kept on the phone and retried.
  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return;
    const left: Draft[] = [];
    for (const d of q) {
      try { const r = await createKnock(d); if (r.error) left.push(d); } catch { left.push(d); }
    }
    writeQueue(left);
    setQueue(left);
    if (left.length < q.length) setFlash(`Sent ${q.length - left.length} saved knock(s).`);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the persisted offline queue once on mount
    setQueue(readQueue());
    void flush();
    const on = () => void flush();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [flush]);

  useEffect(() => {
    click.current = (p) => {
      if (drawing) setDrawing([...drawing, p]);
      else setSheet({ mode: "new", lat: p[0], lng: p[1] });
    };
  }, [drawing]);

  const onReady = useCallback(({ L, map }: MapApi) => {
    api.current = { L, map };
    layers.current = L.layerGroup().addTo(map);
    map.on("click", (e: Leaflet.LeafletMouseEvent) => click.current([e.latlng.lat, e.latlng.lng]));
    setReady(true);
  }, []);

  // Draw pins, territories and the territory being drawn.
  useEffect(() => {
    const a = api.current;
    const g = layers.current;
    if (!a || !g || !ready) return;
    const { L } = a;
    g.clearLayers();
    for (const t of territories) {
      for (const ring of geojsonRings(t.geojson)) {
        L.polygon(ring, { color: t.color, weight: 2, fillOpacity: t.kind === "hail_swath" ? 0.18 : 0.08, dashArray: t.kind === "hail_swath" ? "4 4" : undefined, interactive: false })
          .bindTooltip(`${t.name}${t.kind === "hail_swath" && t.storm_date ? ` · storm ${t.storm_date}` : ""}`, { sticky: true })
          .addTo(g);
      }
    }
    const all = [...knocks.map((k) => ({ ...k, queued: false })), ...queue.map((q, i) => ({ id: `q${i}`, lat: q.lat, lng: q.lng, status: q.status, queued: true }))];
    for (const k of all) {
      const m = L.circleMarker([k.lat, k.lng], { radius: 9, color: "#fff", weight: 2, fillColor: KNOCK_META[k.status].color, fillOpacity: k.queued ? 0.5 : 0.95 }).addTo(g);
      m.bindTooltip(KNOCK_META[k.status].label);
      if (!k.queued) m.on("click", (ev: Leaflet.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); if (!drawing) setSheet({ mode: "edit", id: k.id }); });
    }
    if (drawing?.length) {
      L.polyline(drawing, { color: "#ea580c", weight: 3, dashArray: "6 4" }).addTo(g);
      drawing.forEach((p) => L.circleMarker(p, { radius: 5, color: "#ea580c", fillColor: "#fff", fillOpacity: 1 }).addTo(g));
    }
  }, [knocks, territories, queue, drawing, ready]);

  const fitOnce = useRef(false);
  useEffect(() => {
    if (!ready || fitOnce.current || !hasData || !api.current) return;
    fitOnce.current = true;
    const { L, map } = api.current;
    map.fitBounds(L.latLngBounds(knocks.map((k) => [k.lat, k.lng] as LatLng)).pad(0.2), { maxZoom: 18, animate: false });
  }, [ready, hasData, knocks]);

  const knockHere = () => {
    if (!navigator.geolocation) { setFlash("This device can't share its location. Tap the map instead."); return; }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        api.current?.map.setView(p, Math.max(api.current.map.getZoom(), 18));
        setView("map");
        setSheet({ mode: "new", lat: p[0], lng: p[1] });
      },
      () => { setGpsBusy(false); setFlash("Couldn't get your location. Allow location access, or tap the house on the map."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const queueKnock = (d: Draft) => {
    const q = [...readQueue(), d];
    writeQueue(q);
    setQueue(q);
    setFlash("No connection — saved on this phone. It will send when you're back online.");
  };

  const editing = sheet?.mode === "edit" ? knocks.find((k) => k.id === sheet.id) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
          {(["map", "list", "territories", "import"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx("min-h-10 rounded-md px-3 font-medium capitalize", view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>
              {v === "import" ? "Import CSV" : v}
            </button>
          ))}
        </div>
        {queue.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">{queue.length} waiting to send</span>}
      </div>
      {flash && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700" role="status">{flash} <button type="button" className="ml-2 text-xs underline" onClick={() => setFlash(null)}>Dismiss</button></p>}

      <div className={cx(view !== "map" && view !== "territories" && "hidden")}>
        {drawing && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-2 text-sm">
            <span className="font-medium text-brand-700">Tap the map to outline the territory · {drawing.length} points</span>
            <Button type="button" disabled={drawing.length < 3} onClick={() => { setNewTerritory([drawing]); setDrawing(null); }}>Finish</Button>
            <Button type="button" variant="secondary" onClick={() => setDrawing(drawing.slice(0, -1))} disabled={!drawing.length}>Undo</Button>
            <Button type="button" variant="ghost" onClick={() => setDrawing(null)}>Cancel</Button>
          </div>
        )}
        <MapCanvas center={center} zoom={hasData ? 16 : 5} satellite={false} onReady={onReady} className="h-[55vh] min-h-80" />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {Object.entries(KNOCK_META).map(([k, m]) => <span key={k} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: m.color }} />{m.label}</span>)}
        </div>
      </div>

      {view === "map" && !sheet && !drawing && (
        <button type="button" onClick={knockHere} disabled={gpsBusy} className="sticky bottom-3 z-[1100] w-full rounded-xl bg-brand-500 px-4 py-4 text-lg font-semibold text-white shadow-lg hover:bg-brand-600 disabled:opacity-70" data-knock-here>
          {gpsBusy ? "Finding you…" : "Knock here"}
        </button>
      )}

      {sheet && (
        <KnockSheet
          key={sheet.mode === "edit" ? sheet.id : `${sheet.lat},${sheet.lng}`}
          sheet={sheet}
          knock={editing}
          setterName={editing?.setter_id ? names.get(editing.setter_id) : undefined}
          onClose={() => setSheet(null)}
          onQueued={queueKnock}
          onDone={(msg) => { setFlash(msg); setSheet(null); }}
        />
      )}

      {view === "list" && (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200" data-knock-list>
          {knocks.length === 0 && <li className="p-4 text-sm text-slate-500">No knocks in this date range.</li>}
          {knocks.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => setSheet({ mode: "edit", id: k.id })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: KNOCK_META[k.status].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{k.address || `${k.lat.toFixed(5)}, ${k.lng.toFixed(5)}`}</span>
                  <span className="block truncate text-xs text-slate-500">{KNOCK_META[k.status].label} · {new Date(k.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}{k.setter_id ? ` · ${names.get(k.setter_id) ?? ""}` : ""}{k.notes ? ` · ${k.notes}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === "territories" && (
        <Territories territories={territories} people={people} names={names}
          onDraw={() => { setSheet(null); setDrawing([]); }}
          pendingRings={newTerritory} onClearPending={() => setNewTerritory(null)} onFlash={setFlash} />
      )}

      {view === "import" && <CsvImport onDone={(m) => { setFlash(m); setView("list"); }} />}
    </div>
  );
}

function KnockSheet({ sheet, knock, setterName, onClose, onQueued, onDone }: {
  sheet: { mode: "new"; lat: number; lng: number } | { mode: "edit"; id: string };
  knock?: Knock; setterName?: string; onClose: () => void; onQueued: (d: Draft) => void; onDone: (msg: string) => void;
}) {
  const [status, setStatus] = useState<KnockStatus>(knock?.status ?? "not_home");
  const [notes, setNotes] = useState(knock?.notes ?? "");
  const [address, setAddress] = useState(knock?.address ?? "");
  const [convert, setConvert] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setErr(null);
      if (sheet.mode === "new") {
        const d: Draft = { lat: sheet.lat, lng: sheet.lng, status, notes, address, queuedAt: Date.now() };
        try {
          const r = await createKnock(d);
          if (r.error) setErr(r.error); else onDone(`${KNOCK_META[status].label} saved.`);
        } catch { onQueued(d); onClose(); }
      } else {
        try {
          const r = await updateKnock({ id: sheet.id, status, notes, address });
          if (r.error) setErr(r.error); else onDone("Updated.");
        } catch { setErr("No connection. Try again when you have signal."); }
      }
    });

  const doConvert = (fd: FormData) =>
    start(async () => {
      setErr(null);
      const o = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
      try {
        const r = await convertKnock({ id: knock!.id, ...o });
        if (r.error) setErr(r.error); else setJobId(r.jobId ?? null);
      } catch { setErr("No connection. Try again when you have signal."); }
    });

  return (
    <section className="rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200" data-knock-sheet>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{sheet.mode === "new" ? "New knock" : knock?.address || "Door knock"}</h2>
        <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100">Close</button>
      </div>
      {knock && <p className="mb-2 text-xs text-slate-500">{new Date(knock.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}{setterName ? ` · by ${setterName}` : ""}</p>}
      {knock?.status === "customer" ? (
        <p className="mb-3 rounded-lg bg-violet-50 p-3 text-sm text-violet-800">This door is a customer.{knock.customer_id && <> <Link className="font-medium underline" href={`/app/customers/${knock.customer_id}`}>Open customer</Link></>}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Result">
          {QUICK.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
              className={cx("min-h-12 rounded-lg px-2 text-sm font-semibold ring-2", status === s ? "text-white" : "bg-white text-slate-800 ring-slate-200")}
              style={status === s ? { background: KNOCK_META[s].color, boxShadow: "none", borderColor: KNOCK_META[s].color } : undefined}>
              {KNOCK_META[s].label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" autoComplete="off" /></Field>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Hail hits on gutters, call after 5…" /></Field>
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {knock?.status !== "customer" && <Button type="button" onClick={save} disabled={pending} className="min-h-12 flex-1 text-base">{pending ? "Saving…" : "Save"}</Button>}
        {knock && knock.status !== "customer" && !convert && <Button type="button" variant="secondary" onClick={() => setConvert(true)} className="min-h-12">Convert to lead</Button>}
        {knock && <Button type="button" variant="ghost" onClick={() => start(async () => { const r = await deleteKnock(knock.id); if (r.error) setErr(r.error); else onDone("Deleted."); })}>Delete</Button>}
      </div>

      {convert && knock && (
        jobId ? (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">Lead created and credited to you. <Link className="font-medium underline" href={`/app/jobs/${jobId}`}>Open the job</Link></p>
        ) : (
          <form action={doConvert} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium">Homeowner details</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name"><Input name="name" required autoComplete="off" /></Field>
              <Field label="Phone"><Input name="phone" type="tel" inputMode="tel" /></Field>
              <Field label="Email"><Input name="email" type="email" /></Field>
              <Field label="Street"><Input name="address" defaultValue={address} /></Field>
              <Field label="City"><Input name="city" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="State"><Input name="state" maxLength={2} /></Field>
                <Field label="ZIP"><Input name="zip" inputMode="numeric" /></Field>
              </div>
            </div>
            <input type="hidden" name="notes" value={notes} />
            <Button type="submit" disabled={pending} className="min-h-12">{pending ? "Creating…" : "Create customer & lead"}</Button>
          </form>
        )
      )}
    </section>
  );
}

function Territories({ territories, people, names, onDraw, pendingRings, onClearPending, onFlash }: {
  territories: Territory[]; people: Person[]; names: Map<string, string>;
  onDraw: () => void; pendingRings: LatLng[][] | null; onClearPending: () => void; onFlash: (m: string) => void;
}) {
  const [geo, setGeo] = useState<unknown>(null);
  const [kind, setKind] = useState<"territory" | "hail_swath">("territory");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shape = pendingRings ?? (geo ? geojsonRings(geo) : null);

  const onFile = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr("That file is over 8 MB. Simplify it first."); return; }
    try {
      const gj = JSON.parse(await f.text());
      const rings = geojsonRings(gj);
      if (!rings.length) { setErr("No polygons found in that file."); return; }
      setGeo(gj);
      setKind("hail_swath");
    } catch { setErr("That isn't a GeoJSON file."); }
  };

  const save = (fd: FormData) =>
    start(async () => {
      setErr(null);
      const r = await createTerritory({
        name: String(fd.get("name") ?? ""), kind, assigned_to: String(fd.get("assigned_to") ?? ""), storm_date: String(fd.get("storm_date") ?? ""),
        rings: shape ?? undefined,
      });
      if (r.error) setErr(r.error);
      else { onFlash(r.ok ?? "Saved."); setGeo(null); onClearPending(); }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onDraw} className="min-h-11">Draw a territory on the map</Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
          Import hail swath (GeoJSON)
          <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {shape && (
        <form action={save} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200" data-territory-form>
          <p className="text-sm text-slate-600">{shape.length} polygon{shape.length === 1 ? "" : "s"} ready to save.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Name"><Input name="name" required placeholder={kind === "hail_swath" ? "June 12 hail" : "North Hills"} /></Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="territory">Territory</option>
                <option value="hail_swath">Hail swath</option>
              </Select>
            </Field>
            {kind === "hail_swath" && <Field label="Storm date"><Input name="storm_date" type="date" /></Field>}
            <Field label="Assigned rep">
              <Select name="assigned_to" defaultValue="">
                <option value="">Nobody</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setGeo(null); onClearPending(); }}>Discard</Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
        {territories.length === 0 && <li className="p-4 text-sm text-slate-500">No territories yet.</li>}
        {territories.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded" style={{ background: t.color }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-slate-500">{t.kind === "hail_swath" ? `Hail swath${t.storm_date ? ` · ${t.storm_date}` : ""}` : "Territory"}{t.assigned_to ? ` · ${names.get(t.assigned_to) ?? ""}` : ""}</span>
              </span>
            </span>
            <Button type="button" variant="ghost" onClick={() => start(async () => { const r = await deleteTerritory(t.id); onFlash(r.error ?? "Deleted."); })}>Delete</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
