import Link from "next/link";
import type { ReactNode } from "react";
import { ItemIcon } from "@/components/item-icons";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

const MEASURE = [
  {
    title: "From the plans",
    tag: "New builds",
    body: "Drop in the architect's PDF. Ridge & Beam reads the roof plan, works out the scale and pitch, and measures every ridge, hip, valley and gutter line. No paying for a roof report.",
  },
  {
    title: "On the satellite map",
    tag: "Re-roofs",
    body: "Trace the roof over an aerial photo, set the pitch in degrees and get the true area in m², straight onto the quote.",
  },
  {
    title: "Quick price per m²",
    tag: "Ballpark",
    body: "Put an instant-quote form on your website so homeowners get a price range while you book the site visit.",
  },
];

const FEATURES: { title: string; body: string }[] = [
  { title: "Quotes that read like a receipt", body: "The roof up top in the COLORBOND colour they pick, every line with its own icon, and extras the customer can add before they sign online." },
  { title: "Your state's rules on every job", body: "Licence numbers, contract type, deposit caps, cooling-off dates and home warranty insurance for NSW, VIC, QLD, WA, SA, TAS, ACT and NT, worked out from the price." },
  { title: "Your supplier's price sheet", body: "Pick your supplier, import their price sheet, and your roof sheets, capping, flashings and gutters are priced at your markup. Material orders go out with their product codes." },
  { title: "Metric, all the way down", body: "m², lineal metres and pitch in degrees. Sheet cut lists for Custom Orb, Trimdek and Klip-Lok, plus battens, sarking, safety mesh and downpipes." },
  { title: "Tax invoices and getting paid", body: "GST-inclusive pricing, ATO-ready tax invoices with your ABN, bank transfer and PayID details, Xero sync and the TPAR export at tax time." },
  { title: "Insurance work, sorted", body: "Track the insurer, claim number and assessor, follow the claim from lodged to paid, and see what the insurer and the homeowner each still owe." },
  { title: "Jobs, crews and the schedule", body: "Every job from lead to paid on one board, crews on a weekly calendar with rain and wind warnings, and a simple work order on the crew's phone." },
  { title: "One login for the whole team", body: "Owners, office, sales reps and crew leads each see what they need. Your company's data stays private to your company." },
];

function Section({ children, tint = false }: { children: ReactNode; tint?: boolean }) {
  return <section className={tint ? "border-y border-slate-100 bg-cream" : ""}><div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">{children}</div></section>;
}

/** A small, static sample of the quote docket (made-up job) for the hero. */
function SampleDocket() {
  const lines: [string, string, string, string][] = [
    ["metal_sheet", "COLORBOND Trimdek · Surfmist", "252.2 m", "$7,489.75"],
    ["labour_install", "Installation labour", "176.5 m²", "$6,708.52"],
    ["ridge_capping", "Ridge & hip capping", "44.1 m", "$1,067.22"],
    ["valley_iron", "Valley iron", "6.3 m", "$166.32"],
    ["roof_battens", "Roof battens", "211.9 m", "$1,631.78"],
  ];
  const extras: [string, string, string][] = [["sarking", "Sarking", "$990.00"], ["gutter", "Gutters & downpipes", "$2,376.00"]];
  return (
    <div className="w-full min-w-0 max-w-md rounded-[20px] bg-white px-4 pb-7 pt-5 ring-1 ring-slate-200 sm:px-6" aria-label="Example quote">
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400"><span>Your roofing business<br />ABN · QLD licence</span><span className="text-right">Quote 1001<br />Toowong QLD</span></div>
      <div className="mt-3 flex items-center gap-4 border-y-2 border-dashed border-slate-200 py-4">
        <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0" aria-hidden>
          <polygon points="8,8 92,8 92,52 55,52 55,92 8,92" fill="#dcdbd0" />
          <path d="M8 8 L31 31 L31 69 L8 92 M31 69 L55 92 M92 8 L70 30 L31 31 M70 30 L92 52" fill="none" stroke="white" strokeWidth="3" />
        </svg>
        <div className="min-w-0 flex-1"><p className="font-display text-lg font-bold text-ink">New Trimdek roof</p><p className="text-xs text-slate-500">176.5 m² · 6 panels at 25° · Surfmist</p></div>
      </div>
      <ul className="py-2 font-mono text-[11px] text-slate-600">
        {lines.map(([k, d, q, p]) => (
          <li key={d} className="flex items-center gap-2 py-1"><ItemIcon calcKey={k} size={14} /><span className="min-w-0 flex-1 truncate">{d}</span><span className="hidden w-16 text-right sm:inline">{q}</span><span className="w-[4.5rem] text-right">{p}</span></li>
        ))}
      </ul>
      <ul className="border-t-2 border-dashed border-slate-200 py-2 text-xs">
        {extras.map(([k, d, p]) => (
          <li key={d} className="flex items-center gap-2 py-1"><ItemIcon calcKey={k} size={14} /><span className="flex-1 text-ink">{d}</span><span className="tabular-nums text-ink">{p}</span></li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t-2 border-ink pt-3"><span className="font-display font-bold text-ink">Total inc GST</span><span className="font-display text-2xl font-bold tabular-nums text-ink">$20,429.59</span></div>
      <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-wider text-slate-400">Includes GST of $1,857.24</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Sign in</Link>
          <LinkButton href="/signup">Get started</LinkButton>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Built for Australian roofers</p>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Measure the roof, quote it and get it signed. Before you&apos;re off the ladder.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Ridge &amp; Beam measures from the architect&apos;s plans or the satellite map, prices from your supplier&apos;s sheet, and sends a quote your customer signs on their phone, with your state&apos;s rules already on it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/signup" className="px-5 py-3 text-base">Set up your company</LinkButton>
            <LinkButton href="/login" variant="secondary" className="px-5 py-3 text-base">Sign in</LinkButton>
          </div>
          <p className="mt-6 text-sm text-slate-500">Metal and tile · new builds, re-roofs, restorations and insurance work · GST included</p>
        </div>
        <SampleDocket />
      </section>

      <Section tint>
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink">Three ways to measure</h2>
        <p className="mt-2 max-w-2xl text-slate-600">Whichever you use, the measurements fill the quote: sheets, capping, valleys, gutters, battens and labour.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {MEASURE.map((m) => (
            <div key={m.title} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2"><h3 className="font-display text-xl font-bold text-ink">{m.title}</h3><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{m.tag}</span></div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{m.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink">Everything from the first call to the final payment</h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-slate-200 pt-5">
              <h3 className="font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="bg-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white">Set up in a couple of minutes</h2>
            <p className="mt-2 text-white/70">Add your ABN, licence and state, pick your supplier, and send your first quote today.</p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="States and territories">
              {STATES.map((s) => <li key={s} className="rounded-full px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">{s}</li>)}
            </ul>
          </div>
          <Link href="/signup" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 text-base font-semibold text-ink hover:bg-brand-50">Set up your company</Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-xs text-slate-400 sm:px-6">
        © {new Date().getFullYear()} Ridge &amp; Beam · Made for roofers across Australia. State rules are general information, not legal advice.
      </footer>
    </div>
  );
}
