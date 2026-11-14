"use client";

// Site address with a Google Maps lookup (Places API, Australian addresses only) and a "Manual input" link.
// Posts the same fields as the manual form (address, city, state, zip) plus lat/lng when Google found the spot.
// With no NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, or if Google fails to load, it is just the manual fields.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Field, Input, Select, cx } from "@/components/ui";
import { AU_STATES } from "@/lib/au";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/* Just enough of the Google Maps JS types for what we use (no @types/google.maps dependency). */
type AddrComponent = { longText: string | null; shortText: string | null; types: string[] };
type GPlace = { fetchFields(o: { fields: string[] }): Promise<unknown>; addressComponents?: AddrComponent[]; location?: { lat(): number; lng(): number } };
type GPrediction = { placeId: string; text: { toString(): string }; mainText?: { toString(): string }; secondaryText?: { toString(): string }; toPlace(): GPlace };
type PlacesLib = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(r: Record<string, unknown>): Promise<{ suggestions: { placePrediction: GPrediction | null }[] }> };
};
type MapsWindow = Window & { google?: { maps?: { importLibrary?: (n: string) => Promise<unknown> } }; __rbMapsReady?: () => void };

let loading: Promise<PlacesLib> | null = null;
function loadPlaces(): Promise<PlacesLib> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const w = window as MapsWindow;
    if (w.google?.maps?.importLibrary) return resolve();
    w.__rbMapsReady = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&libraries=places&region=AU&language=en-AU&callback=__rbMapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error("Google Maps didn't load"));
    document.head.appendChild(s);
  }).then(() => (window as MapsWindow).google!.maps!.importLibrary!("places") as Promise<PlacesLib>);
  loading.catch(() => { loading = null; });
  return loading;
}

export type AddressParts = { address: string; city: string; state: string; zip: string; lat: number | null; lng: number | null };

/** Google address components → our fields ("9 Bay Tce", "Wynnum", "QLD", "4178"). Exported for tests. */
export function partsFromComponents(cs: AddrComponent[], loc?: { lat: number; lng: number } | null): AddressParts {
  const get = (t: string, short = false) => { const c = cs.find((x) => x.types.includes(t)); return (short ? c?.shortText : c?.longText) ?? ""; };
  const unit = get("subpremise");
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  const state = get("administrative_area_level_1", true).toUpperCase();
  return {
    address: unit && street ? `${unit}/${street}` : street || get("premise") || get("establishment"),
    city: get("locality") || get("sublocality_level_1") || get("sublocality") || get("postal_town"),
    state: (AU_STATES as readonly string[]).includes(state) ? state : "",
    zip: get("postal_code"),
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
  };
}

type Suggestion = { id: string; main: string; rest: string; prediction: GPrediction };

export function AddressLookup({ defaultState }: { defaultState?: string | null }) {
  const [mode, setMode] = useState<"lookup" | "manual">(KEY ? "lookup" : "manual");
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<AddressParts | null>(null);
  const [manual, setManual] = useState<AddressParts>({ address: "", city: "", state: defaultState ?? "", zip: "", lat: null, lng: null });
  const lib = useRef<PlacesLib | null>(null);
  const token = useRef<unknown>(null);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    if (mode !== "lookup" || lib.current) return;
    loadPlaces().then((l) => { lib.current = l; }).catch(() => { setFailed(true); setMode("manual"); });
  }, [mode]);

  // Ask Google as they type (debounced). Each request carries the session token so a lookup bills as one session.
  useEffect(() => {
    if (mode !== "lookup" || picked) return;
    const q = query.trim();
    if (q.length < 3) return; // too short: nothing shown (see `shown`)
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const l = lib.current ?? (lib.current = await loadPlaces());
        token.current ??= new l.AutocompleteSessionToken();
        const { suggestions } = await l.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: token.current, includedRegionCodes: ["au"], language: "en-AU", region: "au" });
        if (n !== seq.current) return;
        setItems(suggestions.flatMap((s) => (s.placePrediction ? [{
          id: s.placePrediction.placeId,
          main: s.placePrediction.mainText?.toString() ?? s.placePrediction.text.toString(),
          rest: s.placePrediction.secondaryText?.toString() ?? "",
          prediction: s.placePrediction,
        }] : [])).slice(0, 5));
        setActive(-1);
        setOpen(true);
      } catch {
        if (n === seq.current) setItems([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, mode, picked]);

  const choose = useCallback(async (s: Suggestion) => {
    setOpen(false);
    setBusy(true);
    setQuery(`${s.main}${s.rest ? `, ${s.rest}` : ""}`);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "location"] });
      const loc = place.location ? { lat: place.location.lat(), lng: place.location.lng() } : null;
      const parts = partsFromComponents(place.addressComponents ?? [], loc);
      setPicked(parts);
      setManual(parts);
    } catch {
      setPicked(null);
    } finally {
      token.current = null; // a pick ends the billing session
      setBusy(false);
    }
  }, []);

  // Suggestions only for 3+ characters; older results for a longer query are hidden, not cleared.
  const shown = query.trim().length >= 3 ? items : [];
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = shown;
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); void choose(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const linkCls = "text-sm font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline";

  if (mode === "manual") {
    const set = (k: keyof AddressParts) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setManual((m) => ({ ...m, [k]: e.target.value, lat: null, lng: null }));
    return (
      <div className="space-y-3" data-address-mode="manual">
        <Field label="Street address"><Input name="address" value={manual.address} onChange={set("address")} placeholder="9 Bay Tce" /></Field>
        <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-3">
          <Field label="Suburb"><Input name="city" value={manual.city} onChange={set("city")} /></Field>
          <Field label="State">
            <Select name="state" value={manual.state} onChange={set("state")}>
              <option value="">–</option>
              {AU_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
            </Select>
          </Field>
          <Field label="Postcode"><Input name="zip" value={manual.zip} onChange={set("zip")} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></Field>
        </div>
        {failed ? <p className="text-xs text-slate-500">Google Maps lookup isn&rsquo;t available right now. Type the address in.</p>
          : KEY ? <button type="button" className={linkCls} onClick={() => { setPicked(null); setQuery(""); setMode("lookup"); }}>Search Google Maps</button> : null}
      </div>
    );
  }

  const parts = picked;
  return (
    <div className="space-y-2" data-address-mode="lookup">
      {/* What gets saved: the picked address, or what they typed if they never picked one. */}
      <input type="hidden" name="address" value={parts ? parts.address : query.trim()} />
      <input type="hidden" name="city" value={parts?.city ?? ""} />
      <input type="hidden" name="state" value={parts?.state ?? defaultState ?? ""} />
      <input type="hidden" name="zip" value={parts?.zip ?? ""} />
      {parts?.lat != null && <input type="hidden" name="lat" value={parts.lat} />}
      {parts?.lng != null && <input type="hidden" name="lng" value={parts.lng} />}

      <Field label="Site address">
        <div className="relative">
          <Input
            role="combobox" aria-expanded={open && shown.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            value={query} autoComplete="off" placeholder="Start typing the address…"
            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
            onKeyDown={onKey} onFocus={() => { if (shown.length && !picked) setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="pl-9"
          />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5" /></svg>
          {open && shown.length > 0 && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 ring-1 ring-slate-300">
              {shown.map((s, i) => (
                <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); void choose(s); }} onMouseEnter={() => setActive(i)}
                  className={cx("flex cursor-pointer items-start gap-2.5 px-3 py-2.5", i === active && "bg-brand-50")}>
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" /></svg>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{s.main}</span><span className="block truncate text-xs text-slate-500">{s.rest}</span></span>
                </li>
              ))}
              <li aria-hidden className="px-3 pb-1 pt-1.5 text-right text-[10px] text-slate-400">Powered by Google</li>
            </ul>
          )}
        </div>
      </Field>

      {busy && <p className="text-xs text-slate-500">Finding the address…</p>}
      {parts && !busy && (
        <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" data-address-picked>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>
          <span className="min-w-0 truncate">{[parts.address, [parts.city, parts.state, parts.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
        </p>
      )}
      <button type="button" className={linkCls} onClick={() => { if (!picked && query.trim()) setManual((m) => ({ ...m, address: query.trim() })); setMode("manual"); }}>Manual input</button>
    </div>
  );
}
