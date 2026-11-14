"use client";
// The quoting engine: one column that reads like the quote the customer gets.
// 01 Roof plan (our roof report, done first) · 02 Who it's for · 03 The job · 04 Price (supplier, lines, extras, You make / they pay)
// · 05 Payment (Full by default, or Instalments) · 06 Terms. Everything saves as you type; the bar at the bottom
// always shows the total with Preview and Send. One step is open at a time: finished steps fold into one-line
// summaries (with Change), the open step has a Next button, later steps are faint outlines. The email on the right
// lights up the section that matches the open step. A quote that already has lines opens with everything folded.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { EmailPane, type EmailPreview } from "./email-pane";
import { AddressLookup } from "@/components/address-lookup";
import type { DraftItem } from "@/lib/estimating";
import { applyMargin, normaliseStages, priceFromCost, quoteMoney, stageAmounts, stagesProblem, STAGE_TRIGGER_LABEL, type PaymentPlan, type Stage, type StageTrigger } from "@/lib/quote-pricing";
import { saveEstimate } from "../actions";
import { sendQuoteEmail } from "../../jobs/quote-actions";
import { chooseQuoteSupplier, saveQuoteMoney, saveQuoteParty, searchPriceGuide, type GuideItem } from "./engine-actions";

export type SupplierChoice = {
  supplierId: string; name: string; category: string; branchId: string | null; branch: string | null; place: string | null; km: number | null;
  branches: number; states: string[]; orgSupplierId: string | null; hasGuide: boolean;
};
export type EngineProps = {
  id: string; number: number; status: string; firstName: string;
  party: { name: string; email: string; site: string; title: string };
  notes: string; terms: string;
  items: DraftItem[];
  base: { measurements: Record<string, unknown>; measurement_source: string | null; option_label: "options" | "alternates"; tax_rate: number; gst_inclusive: boolean; discount: number; org_supplier_id: string | null };
  marginPct: number | null;
  payment: PaymentPlan;
  supplier: { orgSupplierId: string | null; supplierId: string | null; name: string | null; branch: string | null; hasGuide: boolean; isDefault: boolean };
  suppliers: SupplierChoice[];
  nearLabel: string | null;
  canSetDefault: boolean;
  previewHref: string;
  roofPlan: ReactNode;
  roofMeasured: boolean;
  /** The customer's email, docked on the right on wide screens; refreshed after each save. */
  email?: EmailPreview | null;
  /** "212 m² · 22° pitch" when measured. */
  roofSummary?: string | null;
  rules: ReactNode;
};

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const LOCK = "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z";
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const PIN = "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5";
const PENCIL = "M4 20h4L19 9l-4-4L4 16zM14 6l4 4";
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const UNITS = ["ea", "m", "lm", "m2", "job", "hr", "sheet", "box", "roll", "pack", "lot"];
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
function Block({ n, title, hint, right, children }: { n: number; title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-7 first:border-t-0" data-engine-block={title}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs font-bold text-slate-400">0{n}</span>
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
        {hint && <span className="text-sm text-slate-500">{hint}</span>}
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </section>
  );
}
const field = "w-full rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-ink ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500";
const small = "rounded-lg bg-cream px-2 py-1.5 text-sm text-ink ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function QuoteEngine(p: EngineProps) {
  const router = useRouter();
  const [party, setParty] = useState(p.party);
  const [notes, setNotes] = useState(p.notes);
  const [terms, setTerms] = useState(p.terms);
  const [items, setItems] = useState<DraftItem[]>(() => p.items.map((i) => ({ ...i, id: i.id ?? newId() })));
  const [margin, setMargin] = useState<number | null>(p.marginPct);
  const [payment, setPayment] = useState<PaymentPlan>({ ...p.payment, stages: normaliseStages(p.payment.stages) });
  const [orgSupplierId, setOrgSupplierId] = useState(p.base.org_supplier_id);
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const { tax_rate: tax, gst_inclusive: inclusive } = p.base;
  const main = items.filter((i) => i.extra_status !== "offered");
  const extras = items.filter((i) => i.extra_status === "offered");
  const money = useMemo(() => quoteMoney(items, tax, inclusive, p.base.discount), [items, tax, inclusive, p.base.discount]);
  const shownMargin = margin ?? (money.cost > 0 ? Math.round(money.marginPct) : null);

  // ---- one step at a time: 1 roof plan → 2 who it's for → 3 the job → 4 price → 5 payment + 6 terms ----
  const [roofSkipped, setRoofSkipped] = useState(false);
  const [editingParty, setEditingParty] = useState(() => !p.party.name.trim() || !p.party.site.trim());
  const done = [
    p.roofMeasured || roofSkipped,
    Boolean(party.name.trim() && party.site.trim()),
    Boolean(notes.trim()),
    main.some((i) => i.description.trim() && i.quantity * i.unit_price > 0),
    true, // payment always has a plan
    true, // terms are optional
  ];
  // Start on the first unfinished step; a quote that already has lines opens with every step folded (active 0).
  const [start] = useState(() => {
    if (p.items.some((i) => i.extra_status !== "offered")) return 0;
    const i = done.findIndex((d) => !d);
    return i < 0 ? 0 : i + 1;
  });
  const [active, setActive] = useState(start);
  const [reached, setReached] = useState(start === 0 ? 6 : start);

  // ---- saving (debounced; three independent saves) ----
  const dirty = useRef({ party: false, content: false, money: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ party, notes, terms, items, margin, payment, orgSupplierId });
  useLayoutEffect(() => { latest.current = { party, notes, terms, items, margin, payment, orgSupplierId }; });

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const d = dirty.current;
    if (!d.party && !d.content && !d.money) return true;
    dirty.current = { party: false, content: false, money: false };
    const L = latest.current;
    setState("saving");
    const results = await Promise.all([
      d.party ? saveQuoteParty({ id: p.id, ...L.party }) : null,
      d.content ? saveEstimate({
        id: p.id, ...p.base, org_supplier_id: L.orgSupplierId, measurement_source: p.base.measurement_source as never,
        options: [], notes: L.notes || null, terms: L.terms || null,
        items: L.items.map((i) => ({ ...i, option_key: null })),
      }) : null,
      d.money ? saveQuoteMoney({ id: p.id, margin_pct: L.margin, payment_mode: L.payment.mode, payment_when: L.payment.when, payment_stages: L.payment.stages }) : null,
    ]);
    const err = results.find((r) => r && "error" in r && r.error) as { error: string } | undefined;
    setState(err ? "error" : "saved");
    if (err) setMsg({ error: err.error });
    else router.refresh(); // re-render the email preview from what's now saved
    return !err;
  }, [p.id, p.base, router]);

  const open = (n: number) => { void flush(); setActive(n); if (n === 2) setEditingParty(true); };
  const goNext = (n: number) => { void flush(); setActive(n === 6 ? 0 : n + 1); setReached((r) => Math.max(r, n === 6 ? 6 : n + 1)); if (n === 2) setEditingParty(false); };
  useEffect(() => { document.querySelector("[data-step-active]")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [active]);

  const touch = useCallback((what: "party" | "content" | "money") => {
    dirty.current[what] = true;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }, [flush]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const editParty = (k: keyof typeof party, v: string) => { setParty((x) => ({ ...x, [k]: v })); touch("party"); };
  const editItem = (id: string, patch: Partial<DraftItem>) => { setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))); touch("content"); };
  const setCost = (id: string, cost: number) => {
    const m = margin ?? shownMargin ?? 0;
    editItem(id, { unit_cost: cost, unit_price: priceFromCost(cost, m, tax, inclusive) });
  };
  const removeItem = (id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); touch("content"); };
  const addLine = (patch: Partial<DraftItem> = {}) => {
    const m = margin ?? shownMargin ?? 20;
    const cost = Number(patch.unit_cost) || 0;
    setItems((xs) => [...xs, {
      id: newId(), description: "", quantity: 1, unit: "ea", unit_price: cost > 0 ? priceFromCost(cost, m, tax, inclusive) : 0, unit_cost: cost,
      category: "material", calc_key: null, option_key: null, extra_status: null, blurb: null, ...patch,
    }]);
    touch("content");
  };
  const changeMargin = (v: string) => {
    const n = v === "" ? null : Math.min(90, Math.max(0, Number(v)));
    setMargin(n);
    if (n !== null && Number.isFinite(n)) { setItems((xs) => applyMargin(xs, n, tax, inclusive)); touch("content"); }
    touch("money");
  };
  const setPlan = (next: PaymentPlan) => { setPayment(next); touch("money"); };

  async function send() {
    setSending(true); setMsg(null);
    try {
      if (!(await flush())) return;
      const fd = new FormData(); fd.set("estimate_id", p.id);
      const r = await sendQuoteEmail(undefined, fd);
      setMsg(r ?? null);
      router.refresh();
    } finally { setSending(false); }
  }
  async function preview() { if (await flush()) router.push(p.previewHref, { scroll: false }); }

  // ---- the step frame: open (with Next), folded summary (with Change), or a faint outline ----
  const WHEN_LABEL: Record<string, string> = { completed: "on completion", delivered: "when materials arrive", signed: "when they accept" };
  const summary: Record<number, string> = {
    1: p.roofMeasured ? (p.roofSummary || "Measured") : roofSkipped ? "No measuring needed" : "Not measured",
    2: [party.name, party.site].filter((x) => x.trim()).join(" · ") || "Not filled in",
    3: [party.title, notes.trim()].filter(Boolean).join(" · ") || "Not filled in",
    4: main.length ? `${main.length} line${main.length === 1 ? "" : "s"} · ${aud(money.total)} · you make ${aud(money.profit)}` : "No lines yet",
    5: payment.mode === "full" ? `Paid in full ${WHEN_LABEL[payment.when] ?? ""}`.trim() : `${payment.stages.length} instalments`,
    6: terms.trim() ? terms.trim().split(/\n/)[0] : "No extra terms",
  };
  const NEED: Record<number, string> = { 1: "Measure the roof, or choose No measuring needed", 2: "Add their name and the site address", 3: "Say what you'll do", 4: "Add a line with a price" };
  const STEP_TITLE: Record<number, string> = { 1: "Roof plan", 2: "Who it's for", 3: "The job", 4: "Price", 5: "Payment", 6: "Terms" };
  const step = (n: number, block: ReactNode) => {
    if (n === active) return (
      <div className="my-3 rounded-3xl bg-cream px-5 pb-5 ring-2 ring-brand-500" data-step-active={n}>
        {block}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          {!done[n - 1] && <span className="text-sm text-slate-500">{NEED[n]}</span>}
          <button type="button" disabled={!done[n - 1]} onClick={() => goNext(n)} data-step-next
            className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-40">
            {n === 6 ? "Finish" : `Next: ${STEP_TITLE[n + 1]}`}
          </button>
        </div>
      </div>
    );
    if (n <= reached) return (
      <div className="my-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200" data-step-folded={n}>
        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full", done[n - 1] ? "bg-brand-500 text-white" : "bg-amber-100 text-amber-800")}>
          <Icon d={done[n - 1] ? "M5 12l5 5 9-10" : "M12 8v5M12 16.5v.5"} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1"><b className="block text-sm text-ink">{STEP_TITLE[n]}</b><span className="block truncate text-xs text-slate-500">{summary[n]}</span></span>
        <button type="button" onClick={() => open(n)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" data-step-change>Change</button>
      </div>
    );
    return <div className="my-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-400 ring-1 ring-dashed ring-slate-300" data-step-later={n}>0{n} {STEP_TITLE[n]}</div>;
  };

  return (
    <div className={cx("min-h-[calc(100vh-4rem)] bg-cream", Boolean(p.email) && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")} data-quote-engine>
      <div className="min-w-0">
      <main className="mx-auto max-w-[780px] px-4 pb-6 pt-4 sm:px-6">
        {step(1, <Block n={1} title="Roof plan" hint="start here · our roof report"
          right={!p.roofMeasured && !roofSkipped ? <button type="button" onClick={() => { setRoofSkipped(true); goNext(1); }} className="text-sm font-semibold text-slate-500 underline-offset-2 hover:text-ink hover:underline" data-skip-roof>No measuring needed</button> : null}>
          {p.roofPlan}
        </Block>)}

        {step(2, <Block n={2} title="Who it's for">
          {!editingParty ? (
            // A saved contact by now: their card, with a pencil to change the details.
            <div className="flex items-start gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" data-party-card>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 font-display text-[15px] font-bold text-brand-700 ring-1 ring-brand-200" aria-hidden>{initials(party.name)}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-display text-lg font-bold leading-tight text-ink" data-field="customer">{party.name}</p>
                <p className="flex min-w-0 items-center gap-2 text-sm text-slate-600"><Icon d={MAIL} className="h-4 w-4 text-slate-400" />{party.email ? <span className="truncate">{party.email}</span> : <span className="font-semibold text-red-700">No email yet: add one to send the quote</span>}</p>
                <p className="flex min-w-0 items-center gap-2 text-sm text-slate-600"><Icon d={PIN} className="h-4 w-4 text-slate-400" /><span className="truncate">{party.site}</span></p>
              </div>
              <button type="button" onClick={() => setEditingParty(true)} aria-label="Edit customer details" title="Edit customer details" data-edit-party
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-ink">
                <Icon d={PENCIL} className="h-[18px] w-[18px]" />
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" data-party-edit>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Customer</span><input className={field} value={party.name} onChange={(e) => editParty("name", e.target.value)} onBlur={() => void flush()} data-field="customer" /></label>
                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Email</span><input type="email" className={field} value={party.email} placeholder="Where the quote goes" onChange={(e) => editParty("email", e.target.value)} onBlur={() => void flush()} data-field="email" /></label>
              </div>
              <AddressLookup label="Site" initialLine={party.site || null} onChange={(_, line) => editParty("site", line)} />
              {party.name.trim() && party.site.trim() && (
                <div className="flex justify-end"><button type="button" onClick={() => { void flush(); setEditingParty(false); }} className="min-h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90" data-party-done>Done</button></div>
              )}
            </div>
          )}
        </Block>)}

        {step(3, <Block n={3} title="The job">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Title</span><input className={cx(field, "font-display text-lg font-bold")} value={party.title} onChange={(e) => editParty("title", e.target.value)} onBlur={() => void flush()} data-field="title" /></label>
          <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-slate-500">What we&apos;ll do</span>
            <textarea className={cx(field, "min-h-28 leading-relaxed")} value={notes} placeholder="In plain words: what you'll do, in the order it happens." onChange={(e) => { setNotes(e.target.value); touch("content"); }} onBlur={() => void flush()} data-field="notes" />
          </label>
        </Block>)}

        {step(4, <Block n={4} title="Price" hint={inclusive ? "inc GST" : "ex GST"} right={<SupplierPicker p={p} current={orgSupplierId} onChosen={(id) => { setOrgSupplierId(id); router.refresh(); }} flush={flush} />}>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <div className="hidden grid-cols-[minmax(0,1fr)_64px_64px_120px_20px] gap-3 border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:grid">
              <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Price</span><span />
            </div>
            {main.map((i) => <LineRow key={i.id} i={i} supplierName={p.supplier.name} margin={margin ?? shownMargin} onEdit={editItem} onCost={setCost} onRemove={removeItem} flush={flush} />)}
            {main.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No lines yet. Add one, or pick from a price guide.</p>}
            <div className="flex flex-wrap items-center gap-5 px-4 py-3 text-sm font-semibold text-brand-700">
              <button type="button" onClick={() => addLine()} className="flex items-center gap-2" data-add-line><Icon d="M12 5v14M5 12h14" />Add a line</button>
              <GuideSearch orgSupplierId={orgSupplierId} name={p.supplier.name} hasGuide={p.supplier.hasGuide} onPick={(g) => addLine({ description: g.description, unit: g.unit || "ea", unit_cost: g.cost, supplier_price_item_id: g.id, calc_key: g.calc_key })} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-dashed ring-slate-300" data-extras>
            <p className="text-xs font-semibold text-slate-500">Optional extras <span className="font-normal">· {p.firstName} can add these online. Not in the total.</span></p>
            {extras.map((x) => (
              <div key={x.id} className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-slate-400">+</span>
                <input className="min-w-0 flex-1 bg-transparent text-ink focus:outline-none" value={x.description} placeholder="Extra" onChange={(e) => editItem(x.id!, { description: e.target.value })} onBlur={() => void flush()} />
                <MoneyInput value={x.quantity * x.unit_price} onChange={(v) => editItem(x.id!, { quantity: 1, unit_price: v, unit_cost: 0 })} onBlur={() => void flush()} className="w-28" />
                <button type="button" aria-label="Remove extra" onClick={() => removeItem(x.id!)} className="text-slate-300 hover:text-red-600"><Icon d="M6 6l12 12M18 6L6 18" /></button>
              </div>
            ))}
            <button type="button" onClick={() => addLine({ extra_status: "offered", description: "" })} className="mt-2 text-sm font-semibold text-brand-700" data-add-extra>+ Add an extra</button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2" data-you-make>
            <div className="rounded-2xl bg-ink p-5 text-white">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200"><Icon d={LOCK} className="h-3.5 w-3.5" />You make</p>
              <p className="mt-1 font-display text-4xl font-bold leading-none" style={{ color: "#8fd0a8" }} data-profit>{aud(money.profit)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/70">
                <span className="flex items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/20 focus-within:ring-white/60">
                  <input inputMode="decimal" aria-label="Quote margin %" value={shownMargin ?? ""} placeholder="–" onChange={(e) => changeMargin(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => void flush()}
                    className="w-9 bg-transparent py-1 text-right font-semibold text-white focus:outline-none" data-margin />
                  <span className="font-semibold text-white">%</span>
                </span>
                margin on {aud(money.cost)} cost
              </div>
              {money.uncosted > 0 && <p className="mt-2 text-xs text-white/50">{money.uncosted} line{money.uncosted === 1 ? " has" : "s have"} no cost, so {money.uncosted === 1 ? "it's" : "they're"} not in the margin.</p>}
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{p.firstName} pays</p>
              <p className="mt-1 font-display text-4xl font-bold leading-none text-ink" data-total>{aud(money.total)}</p>
              <p className="mt-4 text-sm text-slate-500">{aud(money.exGst)} + GST {aud(money.gst)}</p>
            </div>
          </div>
        </Block>)}

        {step(5, <Block n={5} title="Payment" right={
          <span className="flex rounded-xl bg-white p-1 text-sm font-semibold ring-1 ring-slate-300" role="radiogroup" aria-label="How they pay">
            {(["full", "instalments"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={payment.mode === m} onClick={() => setPlan({ ...payment, mode: m })} data-pay-mode={m}
                className={cx("rounded-lg px-4 py-1.5", payment.mode === m ? "bg-ink text-white" : "text-slate-600 hover:text-ink")}>{m === "full" ? "Full" : "Instalments"}</button>
            ))}
          </span>}>
          {payment.mode === "full" ? (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-4 py-4 ring-1 ring-slate-200">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon d="M5 12l5 5 9-10" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="font-semibold text-ink">Paid in full</p><p className="text-sm text-slate-500">One invoice, due 7 days after it&apos;s sent</p></div>
              <select aria-label="When they pay" value={payment.when} onChange={(e) => setPlan({ ...payment, when: e.target.value as PaymentPlan["when"] })} className="rounded-lg bg-cream px-3 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200">
                <option value="completed">Upon completion</option><option value="delivered">When materials are delivered</option><option value="signed">When they accept</option>
              </select>
              <span className="w-28 text-right font-display text-xl font-bold tabular-nums text-ink">{aud(money.total)}</span>
            </div>
          ) : <Stages stages={payment.stages} total={money.total} onChange={(stages) => setPlan({ ...payment, stages })} />}
          <p className="mt-2 text-xs text-slate-500">How they can pay (bank transfer, PayID, card, cash) is set on the job. No card surcharge.</p>
        </Block>)}

        {step(6, <Block n={6} title="Terms">
          <textarea className={cx(field, "min-h-20 text-sm leading-relaxed")} value={terms} onChange={(e) => { setTerms(e.target.value); touch("content"); }} onBlur={() => void flush()} data-field="terms" />
          <div className="mt-3">{p.rules}</div>
        </Block>)}
      </main>

      <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white" data-engine-bar>
        <div className="mx-auto flex max-w-[780px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-xs text-slate-500">Total{inclusive ? "" : " ex GST"} · <span data-save-state>{state === "saving" ? "Saving…" : state === "error" ? "Not saved" : "Saved"}</span></p>
            <p className="font-display text-2xl font-bold leading-none text-ink">{aud(money.total)}</p>
          </div>
          {msg?.error && <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:order-first">{msg.error}</p>}
          {msg?.ok && <p className="w-full rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:order-first">{msg.ok}</p>}
          <button type="button" onClick={() => void preview()} className={cx("flex min-h-12 items-center gap-2 rounded-xl px-3.5 font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50 sm:px-4", Boolean(p.email) && "lg:hidden")} data-preview aria-label="Preview">
            <Icon d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6" className="h-5 w-5" /><span className="hidden sm:inline">Preview</span>
          </button>
          <button type="button" onClick={() => void send()} disabled={sending || main.length === 0} className="flex min-h-12 items-center gap-2 rounded-xl bg-brand-500 px-4 font-semibold text-white sm:px-6 hover:bg-brand-600 disabled:opacity-50" data-send>
            <Icon d="M4 12l16-8-6 16-2.5-6.5z" />{sending ? "Sending…" : p.status === "sent" ? "Send again" : `Send to ${p.firstName}`}
          </button>
        </div>
      </div>
      </div>
      {p.email && (
        <aside className="hidden border-l border-slate-200 lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-4rem)] lg:self-start" aria-label="Email preview"><EmailPane email={p.email} active={active} /></aside>
      )}
    </div>
  );
}

function MoneyInput({ value, onChange, onBlur, className }: { value: number; onChange: (v: number) => void; onBlur?: () => void; className?: string }) {
  const [text, setText] = useState(value ? value.toFixed(2) : "");
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value ? value.toFixed(2) : ""); }, [value]);
  return (
    <span className={cx("flex items-center rounded-lg bg-cream px-2 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500", className)}>
      <span className="text-sm text-slate-400">$</span>
      <input inputMode="decimal" value={text} placeholder="0.00" onFocus={() => { focused.current = true; }}
        onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); setText(t); onChange(Number(t) || 0); }}
        onBlur={() => { focused.current = false; setText(value ? value.toFixed(2) : ""); onBlur?.(); }}
        className="w-full min-w-0 bg-transparent py-1.5 text-right text-sm tabular-nums text-ink focus:outline-none" />
    </span>
  );
}

/** One price line. Lines with a cost are priced by the quote margin (tap the price to change the cost); others take a typed price. */
function LineRow({ i, supplierName, margin, onEdit, onCost, onRemove, flush }: {
  i: DraftItem; supplierName: string | null; margin: number | null;
  onEdit: (id: string, patch: Partial<DraftItem>) => void; onCost: (id: string, cost: number) => void; onRemove: (id: string) => void; flush: () => Promise<boolean>;
}) {
  const costed = Number(i.unit_cost) > 0;
  const [editCost, setEditCost] = useState(!costed && !i.unit_price);
  const source = i.category === "labor" ? "Your crew" : i.supplier_price_item_id ? (supplierName ?? "Price guide") : costed ? "Your cost" : "Your price";
  return (
    <div className="grid grid-cols-[64px_64px_minmax(0,1fr)_20px] items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_64px_64px_120px_20px]" data-line>
      <span className="col-span-4 min-w-0 sm:col-span-1">
        <input className="w-full bg-transparent font-semibold text-ink placeholder:font-normal placeholder:text-slate-400 focus:outline-none" value={i.description} placeholder="What it is" onChange={(e) => onEdit(i.id!, { description: e.target.value })} onBlur={() => void flush()} aria-label="Item" />
        <input className="w-full bg-transparent text-xs text-slate-500 placeholder:text-slate-300 focus:outline-none" value={i.blurb ?? ""} placeholder="Details (optional)" onChange={(e) => onEdit(i.id!, { blurb: e.target.value || null })} onBlur={() => void flush()} aria-label="Details" />
      </span>
      <input inputMode="decimal" className={cx(small, "w-full text-right")} value={String(i.quantity)} onChange={(e) => onEdit(i.id!, { quantity: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} onBlur={() => void flush()} aria-label="Quantity" />
      <select className="w-full appearance-none bg-transparent text-sm text-slate-500 focus:outline-none" value={i.unit} onChange={(e) => onEdit(i.id!, { unit: e.target.value })} aria-label="Unit">
        {[...new Set([i.unit, ...UNITS])].map((u) => <option key={u} value={u}>{u === "m2" ? "m²" : u}</option>)}
      </select>
      <span className="text-right">
        {editCost ? (
          <span className="block">
            <MoneyInput value={i.unit_cost * i.quantity} onChange={(v) => onCost(i.id!, i.quantity ? v / i.quantity : v)} onBlur={() => { setEditCost(false); void flush(); }} />
            <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">Your cost ex GST{margin !== null ? ` · +${margin}%` : ""}</span>
          </span>
        ) : (
          <button type="button" onClick={() => setEditCost(true)} className="block w-full text-right" title="Change the cost">
            <span className="block font-semibold tabular-nums text-ink">{aud(i.quantity * i.unit_price)}</span>
            <span className="block text-[10px] font-semibold text-slate-400">{source}</span>
          </button>
        )}
      </span>
      <button type="button" aria-label="Remove line" onClick={() => onRemove(i.id!)} className="text-slate-300 hover:text-red-600"><Icon d="M6 6l12 12M18 6L6 18" /></button>
    </div>
  );
}

/** Instalments: Deposit first, Upon completion last, any stages between. */
function Stages({ stages, total, onChange }: { stages: Stage[]; total: number; onChange: (s: Stage[]) => void }) {
  const amounts = stageAmounts(total, stages);
  const problem = stagesProblem(stages);
  const set = (k: number, patch: Partial<Stage>) => onChange(stages.map((s, j) => (j === k ? { ...s, ...patch } : s)));
  const addStage = () => {
    const last = stages.length - 1;
    const take = Math.min(stages[last].pct, 20);
    onChange([...stages.slice(0, last), { label: "Materials delivered", pct: take, trigger: "delivered" }, { ...stages[last], pct: Math.round((stages[last].pct - take) * 100) / 100 }]);
  };
  const remove = (k: number) => {
    const next = stages.filter((_, j) => j !== k);
    next[next.length - 1] = { ...next[next.length - 1], pct: Math.round((next[next.length - 1].pct + stages[k].pct) * 100) / 100 };
    onChange(next);
  };
  const row = (s: Stage, k: number) => {
    const fixed = k === 0 || k === stages.length - 1;
    return (
      <div key={k} className="grid grid-cols-[28px_minmax(0,1fr)_76px_20px] items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-[28px_minmax(0,1fr)_170px_76px_104px_20px]" data-stage>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 font-display text-xs font-bold text-white">{k + 1}</span>
        <input className="min-w-0 bg-transparent font-semibold text-ink focus:outline-none" value={s.label} onChange={(e) => set(k, { label: e.target.value })} aria-label="Stage name" />
        {fixed ? <span className="order-5 col-start-2 rounded-lg bg-cream px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 sm:order-none sm:col-start-auto">{STAGE_TRIGGER_LABEL[s.trigger]}</span> : (
          <select value={s.trigger} onChange={(e) => set(k, { trigger: e.target.value as StageTrigger })} className="order-5 col-start-2 rounded-lg bg-cream px-2 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 sm:order-none sm:col-start-auto" aria-label="When">
            {(["delivered", "date", "completed"] as const).map((t) => <option key={t} value={t}>{STAGE_TRIGGER_LABEL[t]}</option>)}
          </select>
        )}
        <span className="flex items-center rounded-lg bg-cream px-2 ring-1 ring-slate-200"><input inputMode="decimal" className="w-full bg-transparent py-1.5 text-right text-sm text-ink focus:outline-none" value={String(s.pct)} onChange={(e) => set(k, { pct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} aria-label="Percent" /><span className="text-sm text-slate-400">%</span></span>
        <span className="order-6 col-span-2 text-right font-semibold tabular-nums text-ink sm:order-none sm:col-span-1">{aud(amounts[k] ?? 0)}</span>
        {fixed ? <span className="sm:order-none" /> : <button type="button" aria-label="Remove stage" onClick={() => remove(k)} className="text-slate-300 hover:text-red-600"><Icon d="M6 6l12 12M18 6L6 18" /></button>}
      </div>
    );
  };
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-stages>
      {stages.slice(0, -1).map((s, k) => row(s, k))}
      <button type="button" onClick={addStage} className="flex w-full items-center gap-2 border-b border-dashed border-slate-200 px-4 py-2.5 text-sm font-semibold text-brand-700"><Icon d="M12 5v14M5 12h14" />Add a stage</button>
      {row(stages[stages.length - 1], stages.length - 1)}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-cream px-4 py-2.5 text-xs text-slate-500">
        <span>Deposit and Upon completion are always the first and last stages.</span>
        {problem ? <span className="font-semibold text-red-700">{problem}</span> : <span className="font-semibold text-brand-700">✓ Adds up to {aud(total)}</span>}
      </div>
    </div>
  );
}

/** "Prices from": the nearest suppliers first, then everyone; "Use for all my quotes" makes it the default. */
function SupplierPicker({ p, current, onChosen, flush }: { p: EngineProps; current: string | null; onChosen: (orgSupplierId: string) => void; flush: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [makeDefault, setMakeDefault] = useState(p.supplier.isDefault);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const words = q.toLowerCase().trim();
  const match = (s: SupplierChoice) => !words || `${s.name} ${s.branch ?? ""} ${s.place ?? ""} ${s.states.join(" ")}`.toLowerCase().includes(words);
  const near = p.suppliers.filter((s) => s.km !== null && s.km < 60 && ["metal_roofing", "tiles"].includes(s.category)).slice(0, 6).filter(match);
  const groups: [string, SupplierChoice[]][] = (["metal_roofing", "tiles", "roof_plumbing", "sarking_insulation", "general_trade"] as const)
    .map((c) => [({ metal_roofing: "Metal roofing", tiles: "Roof tiles", roof_plumbing: "Roof plumbing", sarking_insulation: "Sarking & insulation", general_trade: "General trade" })[c], p.suppliers.filter((s) => s.category === c && match(s))] as [string, SupplierChoice[]])
    .filter(([, l]) => l.length);
  async function choose(s: SupplierChoice) {
    setBusy(true); setNote(null);
    await flush();
    const r = await chooseQuoteSupplier({ id: p.id, supplierId: s.supplierId, branchId: s.branchId, makeDefault });
    setBusy(false);
    if (r?.error) { setNote(r.error); return; }
    if (r?.orgSupplierId) { onChosen(r.orgSupplierId); setOpen(false); }
  }
  const row = (s: SupplierChoice, closest: boolean) => {
    const on = s.orgSupplierId && s.orgSupplierId === current;
    return (
      <li key={s.supplierId + (closest ? "n" : "")}>
        <button type="button" disabled={busy} onClick={() => void choose(s)} className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50", on && "bg-brand-50")}>
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-xs font-bold text-white", on ? "bg-ink" : "bg-[#5b6b62]")}>{s.name.slice(0, 2)}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">{s.name}{closest && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Closest</span>}</span>
            <span className="block truncate text-xs text-slate-500">{s.branch ? `${s.place ?? s.branch}${s.km !== null ? ` · ${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km` : ""}` : s.branches ? `${s.branches} branches · ${s.states.join(", ")}` : "Use their store finder"}</span></span>
          {s.hasGuide ? <span className="text-xs font-semibold text-brand-700">✓ Price guide</span> : <span className="text-xs text-slate-400">No price guide</span>}
          {on && <Icon d="M5 12l5 5 9-10" className="h-5 w-5 text-brand-700" />}
        </button>
      </li>
    );
  };
  return (
    <div className="relative" ref={ref} data-supplier-picker>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cx("flex min-h-11 items-center gap-2.5 rounded-xl bg-white py-1.5 pl-1.5 pr-3 ring-1", open ? "ring-2 ring-ink" : "ring-slate-300")} aria-expanded={open}>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink font-display text-xs font-bold text-white">{(p.supplier.name ?? "?").slice(0, 2)}</span>
        <span className="text-left leading-tight"><span className="block text-[11px] text-slate-500">Prices from</span><span className="block text-sm font-semibold text-ink">{p.supplier.name ? `${p.supplier.name}${p.supplier.branch ? ` · ${p.supplier.branch}` : ""}` : "Choose a supplier"}</span></span>
        {p.supplier.isDefault && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Default</span>}
        <Icon d="M6 9l6 6 6-6" className="h-4 w-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-40 flex max-h-[70vh] w-[min(440px,90vw)] flex-col overflow-hidden rounded-2xl bg-white ring-2 ring-ink" data-supplier-panel>
          <div className="border-b border-slate-100 p-3"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers across Australia" className="min-h-10 w-full rounded-lg bg-cream px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {near.length > 0 && <><p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{p.nearLabel ?? "Nearest to you"}</p><ul className="px-2 pb-2 pt-1">{near.map((s, k) => row(s, k === 0 && !words))}</ul></>}
            <div className="border-t border-slate-100 pb-2">
              <p className="flex items-center justify-between px-4 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400"><span>All suppliers · {p.suppliers.length}</span>
                {!words && <button type="button" onClick={() => setAll((a) => !a)} className="normal-case tracking-normal text-brand-700">{all ? "Show less" : "Show all"}</button>}</p>
              {(all || words) ? groups.map(([g, list]) => (
                <div key={g} className="mt-2"><p className="px-4 pb-1 text-xs font-semibold text-slate-500">{g}</p><ul className="px-2">{list.map((s) => row(s, false))}</ul></div>
              )) : <p className="px-4 pt-1 text-sm text-slate-500">{p.suppliers.slice(0, 8).map((s) => s.name).join(" · ")}…</p>}
              <p className="mx-4 mt-2 rounded-lg bg-cream px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">Price guides are your account&apos;s price lists. <Link href="/app/settings/suppliers" className="font-semibold text-ink">Upload one in Settings → Suppliers</Link>.</p>
            </div>
          </div>
          {note && <p className="border-t border-slate-100 bg-red-50 px-4 py-2 text-xs text-red-700">{note}</p>}
          {p.canSetDefault && (
            <label className="flex items-center gap-2.5 border-t border-slate-100 bg-cream px-4 py-3 text-sm text-ink">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-[#1f5f3f]" />Use the one I pick for all my quotes
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** "From <supplier> price guide": search the supplier's price list and add a line at its cost. */
function GuideSearch({ orgSupplierId, name, hasGuide, onPick }: { orgSupplierId: string | null; name: string | null; hasGuide: boolean; onPick: (g: GuideItem) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ items: GuideItem[]; error?: string } | null>(null);
  useEffect(() => {
    if (!open || !orgSupplierId || !hasGuide) return;
    const t = setTimeout(() => { void searchPriceGuide(orgSupplierId, q).then(setRes); }, 250);
    return () => clearTimeout(t);
  }, [open, q, orgSupplierId, hasGuide]);
  if (!orgSupplierId || !hasGuide) return <Link href="/app/settings/suppliers" className="flex items-center gap-2 text-slate-500"><Icon d="M11 18a7 7 0 100-14 7 7 0 000 14M20 20l-4-4" />{name ? `Add ${name}'s price guide` : "Add a price guide"}</Link>;
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2" data-guide-search><Icon d="M11 18a7 7 0 100-14 7 7 0 000 14M20 20l-4-4" />From {name ?? "the"} price guide</button>
      {open && (
        <div className="absolute left-0 top-8 z-40 w-[min(460px,85vw)] rounded-2xl bg-white p-3 font-normal text-ink ring-2 ring-ink">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. valley 0.55 or ridge cap" className="min-h-10 w-full rounded-lg bg-cream px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {res?.error && <li className="px-2 py-3 text-sm text-slate-500">{res.error}</li>}
            {res?.items.map((g) => (
              <li key={g.id}><button type="button" onClick={() => { onPick(g); setOpen(false); setQ(""); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{g.description}</span><span className="block text-xs text-slate-500">{[g.code, g.unit].filter(Boolean).join(" · ")}</span></span>
                <span className="tabular-nums text-slate-600">{aud(g.cost)} <span className="text-xs text-slate-400">cost</span></span>
              </button></li>
            ))}
            {res && !res.error && res.items.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">Nothing matches that.</li>}
          </ul>
        </div>
      )}
    </span>
  );
}
