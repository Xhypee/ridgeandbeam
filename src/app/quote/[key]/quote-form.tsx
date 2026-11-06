"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { instantQuoteRange, QUOTE_PITCHES, type QuotePitch } from "@/lib/roof";
import { submitInstantQuote, type QuoteState } from "./actions";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const input = "block w-full rounded-lg border-0 bg-white px-3 py-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";
const chip = "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:checked]:ring-2 has-[:checked]:ring-brand-500";

/** House outline whose roof gets steeper with the pitch (rise per 12). */
function PitchIcon({ rise }: { rise: number }) {
  const h = Math.min(30, (rise / 12) * 30);
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
      {pending ? "Sending…" : "Get my quote"}
    </button>
  );
}

export function QuoteForm({ intakeKey, orgName, low, high, phone }: { intakeKey: string; orgName: string; low: number; high: number; phone: string | null }) {
  const [state, action] = useActionState<QuoteState, FormData>(submitInstantQuote, undefined);
  const [mode, setMode] = useState<"house" | "squares">("house");
  const [sqft, setSqft] = useState("");
  const [stories, setStories] = useState("1");
  const [squares, setSquares] = useState("");
  const [pitch, setPitch] = useState<QuotePitch>("medium");

  const range = useMemo(() => {
    const r = mode === "squares"
      ? instantQuoteRange({ mode, squares: Number(squares) || 0, pitch }, low, high)
      : instantQuoteRange({ mode, houseSqft: Number(sqft) || 0, stories: Number(stories) || 1, pitch }, low, high);
    return r.squares > 0 ? r : null;
  }, [mode, sqft, stories, squares, pitch, low, high]);

  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200" data-testid="quote-done">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">Your estimated range</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{usd(state.low ?? 0)} – {usd(state.high ?? 0)}</p>
        <p className="mt-1 text-sm text-slate-500">About {state.squares} squares of roof</p>
        <p className="mt-4 text-base text-slate-700">Thanks! {state.orgName ?? orgName} will contact you shortly to schedule a free inspection and an exact price.</p>
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
        <input name="address" required autoComplete="street-address" placeholder="Street address" className={input} aria-label="Street address" />
        <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
          <input name="city" autoComplete="address-level2" placeholder="City" className={input} aria-label="City" />
          <input name="state" maxLength={2} autoComplete="address-level1" placeholder="ST" className={`${input} uppercase`} aria-label="State" />
          <input name="zip" inputMode="numeric" autoComplete="postal-code" placeholder="ZIP" className={input} aria-label="ZIP" />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">2. How big is the roof?</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className={chip}><input type="radio" className="sr-only" checked={mode === "house"} onChange={() => setMode("house")} />Use my home size</label>
          <label className={chip}><input type="radio" className="sr-only" checked={mode === "squares"} onChange={() => setMode("squares")} />I know my squares</label>
        </div>
        {mode === "house" ? (
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input name="house_sqft" inputMode="numeric" value={sqft} onChange={(e) => setSqft(e.target.value.replace(/[^\d]/g, ""))} placeholder="Living area (sq ft)" className={input} aria-label="House square feet" required />
            <select name="stories" value={stories} onChange={(e) => setStories(e.target.value)} className={input} aria-label="Stories">
              <option value="1">1 story</option><option value="2">2 stories</option><option value="3">3 stories</option>
            </select>
          </div>
        ) : (
          <input name="squares" inputMode="decimal" value={squares} onChange={(e) => setSquares(e.target.value)} placeholder="Roof squares (1 square = 100 sq ft)" className={input} aria-label="Roof squares" required />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">3. How steep is it?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(QUOTE_PITCHES) as QuotePitch[]).map((k) => (
            <label key={k} className={`${chip} flex-col text-slate-700`}>
              <input type="radio" name="pitch" value={k} className="sr-only" checked={pitch === k} onChange={() => setPitch(k)} />
              <PitchIcon rise={QUOTE_PITCHES[k].pitch} />
              <span>{QUOTE_PITCHES[k].label}</span>
              <span className="text-xs font-normal text-slate-500">{QUOTE_PITCHES[k].hint}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">4. Current roof</h2>
          <select name="material" defaultValue="asphalt" className={input} aria-label="Current material">
            <option value="asphalt">Asphalt shingles</option>
            <option value="metal">Metal</option>
            <option value="tile">Tile</option>
            <option value="wood">Wood shake</option>
            <option value="flat">Flat / membrane</option>
            <option value="unsure">Not sure</option>
          </select>
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">5. Insurance claim?</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className={chip}><input type="radio" name="insurance" value="yes" className="sr-only" />Yes, storm damage</label>
            <label className={chip}><input type="radio" name="insurance" value="no" className="sr-only" defaultChecked />No</label>
          </div>
        </div>
      </section>

      <div className="rounded-2xl bg-slate-900 p-5 text-center text-white" aria-live="polite" data-testid="quote-range">
        {range ? (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-300">Estimated price range</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{usd(range.low)} – {usd(range.high)}</p>
            <p className="mt-1 text-xs text-slate-300">About {range.squares} squares. Final price after a free inspection.</p>
          </>
        ) : (
          <p className="text-sm text-slate-300">Enter your roof size to see a price range.</p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">6. Where should we send it?</h2>
        <input name="name" required autoComplete="name" placeholder="Your name" className={input} aria-label="Your name" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="phone" type="tel" autoComplete="tel" placeholder="Phone" className={input} aria-label="Phone" />
          <input name="email" type="email" autoComplete="email" placeholder="Email" className={input} aria-label="Email" />
        </div>
      </section>

      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Submit />
      <p className="text-center text-xs text-slate-400">By submitting you agree to be contacted by {orgName} about your roof. Ranges are estimates, not an offer.</p>
    </form>
  );
}
