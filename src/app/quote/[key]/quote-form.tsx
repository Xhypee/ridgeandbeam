"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { asAuState, AU_STATES, auPhoneE164, stateFromPostcode } from "@/lib/au";
import { instantQuoteRange, QUOTE_PITCHES, QUOTE_ROOF_TYPES, type QuotePitch, type QuoteRoofType } from "@/lib/roof";
import { submitInstantQuote, type QuoteState } from "./actions";
import type { QuoteRates } from "./rates";

const aud = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const input = "block w-full rounded-lg border-0 bg-white px-3 py-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";
const chip = "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:checked]:ring-2 has-[:checked]:ring-brand-500";

/** House outline whose roof gets steeper with the pitch (degrees). */
function PitchIcon({ deg }: { deg: number }) {
  const h = Math.min(30, Math.tan((deg * Math.PI) / 180) * 26);
  return (
    <svg viewBox="0 0 64 48" className="h-10 w-14" aria-hidden>
      <rect x="14" y={44 - 18} width="36" height="18" fill="currentColor" opacity="0.15" />
      <polygon points={`6,${26} 32,${26 - h - 2} 58,${26}`} fill="currentColor" />
      <rect x="28" y="34" width="8" height="10" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-brand-500 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-60">
      {pending ? "Sending…" : "Get my price"}
    </button>
  );
}

export function QuoteForm({ intakeKey, orgName, rates, phone, defaultState }: { intakeKey: string; orgName: string; rates: QuoteRates; phone: string | null; defaultState: string | null }) {
  const [state, action] = useActionState<QuoteState, FormData>(submitInstantQuote, undefined);
  const [mode, setMode] = useState<"house" | "roof">("house");
  const [floor, setFloor] = useState("");
  const [storeys, setStoreys] = useState("1");
  const [roofM2, setRoofM2] = useState("");
  const [pitch, setPitch] = useState<QuotePitch>("medium");
  const [roofType, setRoofType] = useState<QuoteRoofType>("metal");
  const [postcode, setPostcode] = useState("");
  const [auState, setAuState] = useState<string>(asAuState(defaultState) ?? "");
  const [stateTouched, setStateTouched] = useState(false);
  const [mobile, setMobile] = useState("");
  // Controlled so nothing is lost when the server sends the form back with an error (React resets uncontrolled fields).
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("tile");
  const [insurance, setInsurance] = useState<"yes" | "no">("no");

  const rate = rates[roofType];
  const priced = rate.high > 0;
  const range = useMemo(() => {
    const r = mode === "roof"
      ? instantQuoteRange({ mode, roofM2: Number(roofM2) || 0, pitch }, rate.low, rate.high)
      : instantQuoteRange({ mode, floorM2: Number(floor) || 0, storeys: Number(storeys) || 1, pitch }, rate.low, rate.high);
    return r.m2 > 0 ? r : null;
  }, [mode, floor, storeys, roofM2, pitch, rate.low, rate.high]);
  const phoneBad = mobile.trim().length >= 8 && !auPhoneE164(mobile);

  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200" data-testid="quote-done">
        {state.high ? (
          <>
            <p className="text-sm font-medium uppercase tracking-wide text-brand-600">Your estimated range</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{aud(state.low ?? 0)} – {aud(state.high ?? 0)}</p>
            <p className="mt-1 text-sm text-slate-500">Including GST · about {state.m2} m² of roof</p>
          </>
        ) : (
          <p className="text-lg font-semibold text-slate-900">Request received</p>
        )}
        <p className="mt-4 text-base text-slate-700">Thanks! {state.orgName ?? orgName} will contact you shortly to book a free roof inspection and an exact price.</p>
        {phone && <p className="mt-2 text-sm text-slate-500">Questions? Call <a className="font-medium text-brand-700" href={`tel:${phone}`}>{phone}</a></p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6" data-testid="quote-form">
      <input type="hidden" name="key" value={intakeKey} />
      <input type="hidden" name="mode" value={mode} />

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">1. Where is the home?</h2>
        <input name="address" required autoComplete="address-line1" placeholder="Street address" className={input} aria-label="Street address" value={street} onChange={(e) => setStreet(e.target.value)} />
        <div className="grid grid-cols-[1fr_5.5rem] gap-2 sm:grid-cols-[1fr_6rem_6rem]">
          <input name="city" required autoComplete="address-level2" placeholder="Suburb" className={`${input} col-span-2 sm:col-span-1`} aria-label="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          <select name="state" value={auState} onChange={(e) => { setAuState(e.target.value); setStateTouched(true); }} className={input} aria-label="State" required>
            <option value="">State</option>
            {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            name="zip" inputMode="numeric" maxLength={4} required autoComplete="postal-code" placeholder="Postcode" className={input} aria-label="Postcode" value={postcode}
            onChange={(e) => {
              const pc = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPostcode(pc);
              const guess = pc.length === 4 ? stateFromPostcode(pc) : null;
              if (guess && !stateTouched) setAuState(guess);
            }}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">2. What roof would you like?</h2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(QUOTE_ROOF_TYPES) as QuoteRoofType[]).map((t) => (
            <label key={t} className={chip}><input type="radio" name="roof_type" value={t} className="sr-only" checked={roofType === t} onChange={() => setRoofType(t)} />{QUOTE_ROOF_TYPES[t]}</label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">3. How big is it?</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className={chip}><input type="radio" className="sr-only" checked={mode === "house"} onChange={() => setMode("house")} />Use my home size</label>
          <label className={chip}><input type="radio" className="sr-only" checked={mode === "roof"} onChange={() => setMode("roof")} />I know my roof area</label>
        </div>
        {mode === "house" ? (
          <div className="grid grid-cols-[1fr_8.5rem] gap-2">
            <input name="floor_m2" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^\d]/g, ""))} placeholder="Floor area (m²)" className={input} aria-label="House floor area m²" required />
            <select name="storeys" value={storeys} onChange={(e) => setStoreys(e.target.value)} className={input} aria-label="Storeys">
              <option value="1">Single storey</option><option value="2">Double storey</option><option value="3">Three storeys</option>
            </select>
          </div>
        ) : (
          <input name="roof_m2" inputMode="decimal" value={roofM2} onChange={(e) => setRoofM2(e.target.value)} placeholder="Roof area (m²)" className={input} aria-label="Roof area m²" required />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">4. How steep is it?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(QUOTE_PITCHES) as QuotePitch[]).map((k) => (
            <label key={k} className={`${chip} flex-col text-slate-700`}>
              <input type="radio" name="pitch" value={k} className="sr-only" checked={pitch === k} onChange={() => setPitch(k)} />
              <PitchIcon deg={QUOTE_PITCHES[k].deg} />
              <span>{QUOTE_PITCHES[k].label} <span className="font-normal text-slate-500">{QUOTE_PITCHES[k].range}</span></span>
              <span className="text-xs font-normal text-slate-500">{QUOTE_PITCHES[k].hint}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">5. Roof on the house now</h2>
          <select name="current" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} aria-label="Current roof">
            <option value="tile">Tiles</option>
            <option value="metal">Metal</option>
            <option value="fibro">Fibro / cement sheet</option>
            <option value="unsure">Not sure</option>
          </select>
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">6. Insurance claim?</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className={chip}><input type="radio" name="insurance" value="yes" className="sr-only" checked={insurance === "yes"} onChange={() => setInsurance("yes")} />Yes, storm damage</label>
            <label className={chip}><input type="radio" name="insurance" value="no" className="sr-only" checked={insurance === "no"} onChange={() => setInsurance("no")} />No</label>
          </div>
        </div>
      </section>

      <div className="rounded-2xl bg-ink p-5 text-center text-white" aria-live="polite" data-testid="quote-range">
        {!priced ? (
          <p className="text-sm text-white/80">{orgName} will send you a price after a quick look at your roof.</p>
        ) : range ? (
          <>
            <p className="text-xs uppercase tracking-wide text-white/70">Estimated price range, including GST</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{aud(range.low)} – {aud(range.high)}</p>
            <p className="mt-1 text-xs text-white/70">About {range.m2} m² of roof. Final price after a free inspection.</p>
          </>
        ) : (
          <p className="text-sm text-white/80">Enter your home or roof size to see a price range.</p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">7. Where should we send it?</h2>
        <input name="name" required autoComplete="name" placeholder="Your name" className={input} aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile, e.g. 0412 345 678" className={input} aria-label="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} aria-invalid={phoneBad || undefined} />
            {phoneBad && <p className="mt-1 text-xs text-red-700">Enter an Australian number, e.g. 0412 345 678.</p>}
          </div>
          <input name="email" type="email" autoComplete="email" placeholder="Email" className={input} aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </section>

      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Submit />
      <p className="text-center text-xs text-slate-400">By submitting you agree to be contacted by {orgName} about your roof. Ranges are estimates, not an offer.</p>
    </form>
  );
}
