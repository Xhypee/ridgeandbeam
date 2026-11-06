import Link from "next/link";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";

const FEATURES = [
  { title: "Estimates in minutes", body: "Enter plan area, pitch, and edge lengths. RoofDesk works out squares, waste, bundles, underlayment, ice & water, drip edge, ridge cap, and labor from your own price book." },
  { title: "Customers sign online", body: "Send a link. Homeowners review a clean, printable quote and accept it with a typed signature, and the job moves to Sold automatically." },
  { title: "Pipeline & scheduling", body: "Every job from lead to inspection to install to paid, on one board. Put crews on a weekly calendar, color-coded." },
  { title: "Invoices & payments", body: "Turn an accepted estimate into an invoice in one click. Record deposits and checks, and see what's overdue at a glance." },
  { title: "Insurance-ready CRM", body: "Track carrier, claim number, and adjuster on every homeowner, with follow-up reminders so no storm lead goes cold." },
  { title: "Built for your whole team", body: "Owners, office staff, and crews each get their own login. Your company's data stays private to your company." },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Sign in</Link>
          <LinkButton href="/signup">Start free</LinkButton>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">For roofing contractors</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
          Measure, quote, schedule, and get paid, all in one place.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          RoofDesk replaces the spreadsheets, paper estimates, and whiteboard schedule. Your quote is ready before you&apos;re off the ladder.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/signup" className="px-5 py-3 text-base">Create your company</LinkButton>
          <LinkButton href="/login" variant="secondary" className="px-5 py-3 text-base">Sign in</LinkButton>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <h2 className="font-semibold text-slate-900">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-100 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} RoofDesk</footer>
    </div>
  );
}
