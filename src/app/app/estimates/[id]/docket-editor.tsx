"use client";

// The roofer's quote as a receipt docket: the roof is the main item (profile buttons re-cut and re-price the sheets,
// colour swatches recolour the drawing), extras move between the receipt and "Often added", and every change saves
// itself. "Send the quote" marks it sent and shows the customer link. Locked (read only) once accepted.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyLink } from "@/components/copy-link";
import { AddedExtras, DocketPaper, DocketTopLine, DocketTotal, MainLines, OftenAdded, RoofBand } from "@/components/docket";
import { cx } from "@/components/ui";
import {
  COLOURS, colourHex, DOCKET_PROFILES, docketTotals, docketView, fillQuoteLines, PROFILE_SHORT, qtyText, roofFacts, roofTitle,
  sectionsProfile, setExtra, switchColour, switchProfile, type ExtraRow,
} from "@/lib/docket";
import type { RoofShape } from "@/lib/docket-shape";
import { isCalculatorLine, type CatalogRow, type DraftItem, type PriceMode } from "@/lib/estimating";
import { money } from "@/lib/format";
import { calcKeyLabel, mergeMeasurements, normalizeMeasurements, sectionSystem, type Measurements, type MetalProfile } from "@/lib/roof";
import { saveEstimate, setEstimateStatus } from "../actions";

type Props = {
  id: string;
  status: "draft" | "sent" | "accepted" | "declined";
  publicUrl: string;
  header: { name: string; abn: string | null; licence: string | null; number: number; date: string };
  address: string | null;
  customer: { name: string; email: string | null };
  shape: RoofShape;
  panels: number | null;
  hasPlans: boolean;
  book: CatalogRow[];
  defaultWaste: number;
  calcDefaults: unknown;
  initial: {
    measurements: unknown;
    measurement_source: string | null;
    items: DraftItem[];
    roof_profile: MetalProfile | null;
    roof_colour: string | null;
    tax_rate: number;
    gst_inclusive: boolean;
    org_supplier_id: string | null;
    discount: number;
    notes: string | null;
    terms: string | null;
  };
  /** `at` is already formatted in the job's state time zone. */
  accepted: { name: string | null; at: string | null; ip: string | null; signature: string | null } | null;
};

const NEUTRAL = "#a9adb0";

export function DocketEditor({ id, status, publicUrl, header, address, customer, shape, panels, hasPlans, book, defaultWaste, calcDefaults, initial, accepted }: Props) {
  const router = useRouter();
  const locked = status === "accepted";
  const [m, setM] = useState<Measurements>(() => normalizeMeasurements(initial.measurements, defaultWaste, calcDefaults));
  const [items, setItems] = useState<DraftItem[]>(initial.items);
  const [profile, setProfile] = useState<MetalProfile | null>(() => sectionsProfile(normalizeMeasurements(initial.measurements, defaultWaste, calcDefaults)) ?? initial.roof_profile);
  const [colour, setColour] = useState<string | null>(initial.roof_colour ?? (initial.measurements as { plans?: { colour?: string } } | null)?.plans?.colour ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  const mode: PriceMode = { inclusive: initial.gst_inclusive, gstRatePct: initial.tax_rate };
  const view = useMemo(() => docketView(items), [items]);
  const totals = useMemo(() => docketTotals(items, initial.discount, initial.tax_rate, initial.gst_inclusive), [items, initial.discount, initial.tax_rate, initial.gst_inclusive]);
  const metal = m.sections.some((s) => s.area > 0 && sectionSystem(s) === "metal") || !m.sections.some((s) => s.area > 0);
  const measured = m.sections.some((s) => s.area > 0) || m.eave > 0;
  const hex = colourHex(colour) ?? NEUTRAL;

  // ----- saving: every change saves itself (latest state wins); the page warns before leaving with unsaved edits.
  const latest = useRef({ m, items, profile, colour });
  const queued = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async () => {
    const s = latest.current;
    const merged = mergeMeasurements(initial.measurements, s.m) as Record<string, unknown>;
    const plans = merged.plans as Record<string, unknown> | undefined;
    if (plans && typeof plans === "object") merged.plans = { ...plans, ...(s.profile ? { profile: s.profile } : {}), ...(s.colour ? { colour: s.colour } : {}) };
    const res = await saveEstimate({
      id,
      measurements: merged,
      measurement_source: (initial.measurement_source as never) ?? null,
      option_label: "options",
      options: [],
      items: s.items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0, unit_cost: Number(it.unit_cost) || 0, option_key: null })),
      tax_rate: initial.tax_rate,
      gst_inclusive: initial.gst_inclusive,
      org_supplier_id: initial.org_supplier_id,
      discount: initial.discount,
      notes: initial.notes,
      terms: initial.terms,
      roof_profile: s.profile,
      roof_colour: s.colour,
    });
    if (res?.error) setMsg({ error: res.error });
  }, [id, initial]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) { queued.current = true; await running.current; return; }
    setSaving(true);
    const run = (async () => {
      do {
        queued.current = false;
        await persist();
      } while (queued.current);
    })();
    running.current = run;
    try { await run; } finally {
      running.current = null;
      setSaving(false);
      setDirty(timer.current !== null);
    }
  }, [persist]);

  const change = (next: Partial<{ m: Measurements; items: DraftItem[]; profile: MetalProfile | null; colour: string | null }>) => {
    latest.current = { ...latest.current, ...next };
    if (next.m) setM(next.m);
    if (next.items) setItems(next.items);
    if (next.profile !== undefined) setProfile(next.profile);
    if (next.colour !== undefined) setColour(next.colour);
    setDirty(true);
    setMsg(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 350);
  };

  useEffect(() => {
    if (!dirty && !saving) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, saving]);

  // ----- actions
  const pickProfile = (p: MetalProfile) => {
    if (locked || p === profile) return;
    const r = switchProfile({ items: latest.current.items, m: latest.current.m, profile: p, colour: latest.current.colour, book, mode });
    change({ items: r.items, m: r.m, profile: p });
    if (!r.priced) setMsg({ error: `No ${PROFILE_SHORT[p]} sheet in your price book. Add one in Settings → Price book; the sheet keeps its old price until then.` });
  };
  const pickColour = (c: string) => {
    if (locked || c === colour) return;
    const next = switchColour({ items: latest.current.items, m: latest.current.m, profile: latest.current.profile, from: latest.current.colour, to: c, book, mode });
    change({ items: next, colour: c });
  };
  const toggle = (r: ExtraRow, to: "added" | "offered") => {
    if (locked) return;
    const res = setExtra(latest.current.items, r.idx, to, latest.current.m);
    change({ items: res.items, ...(res.m ? { m: res.m } : {}) });
  };
  const fill = () => {
    const calcNames = new Set(book.filter((c) => c.calc_key).map((c) => c.name));
    const custom = latest.current.items.filter((it) => !isCalculatorLine(it, calcNames));
    const r = fillQuoteLines({ m: latest.current.m, book, mode, previous: latest.current.items, colour: latest.current.colour, keepCustom: custom });
    change({ items: [...r.items, ...custom] });
    const zero = r.items.filter((i) => !i.extra_status && !(Number(i.unit_price) > 0)).length;
    if (r.missing.length || zero) {
      setMsg({ error: [r.missing.length ? `No price-book item for: ${r.missing.map(calcKeyLabel).join(", ")}.` : "", zero ? `${zero} line${zero === 1 ? " is" : "s are"} $0: set your prices in Settings → Price book.` : ""].filter(Boolean).join(" ") });
    } else setMsg({ ok: `Filled ${r.items.length} lines from the measurements.` });
  };
  const send = async () => {
    setSending(true);
    setMsg(null);
    try {
      await flush();
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", "sent");
      await setEstimateStatus(fd);
      router.refresh();
    } catch (e) {
      setMsg({ error: (e as Error).message || "Couldn't send the quote." });
    } finally {
      setSending(false);
    }
  };

  const guardLeave = (e: React.MouseEvent) => { if ((dirty || saving) && !window.confirm("Your last change is still saving. Leave anyway?")) e.preventDefault(); };
  const zeroMain = view.main.filter((l) => !(Number(l.unit_price) > 0)).length;

  return (
    <div className="mx-auto max-w-3xl" data-testid="docket-editor">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        {!locked && (
          <Link href={`/app/measure/${id}/plans`} onClick={guardLeave} data-testid={hasPlans ? "view-roof" : "measure-from-plans"}
            className={cx("inline-flex min-h-11 items-center rounded-xl px-4 font-semibold", measured ? "text-ink ring-1 ring-slate-300 hover:bg-white" : "bg-brand-500 text-white hover:bg-brand-600")}>
            {hasPlans ? "View the roof" : "Measure from plans"}
          </Link>
        )}
        {!locked && !measured && (
          <Link href={`/app/measure/${id}`} onClick={guardLeave} className="inline-flex min-h-11 items-center rounded-xl px-4 font-medium text-ink ring-1 ring-slate-300 hover:bg-white">Measure on satellite map</Link>
        )}
        {!locked && measured && items.length > 0 && (
          <button type="button" onClick={fill} className="inline-flex min-h-11 items-center rounded-xl px-4 font-medium text-ink ring-1 ring-slate-300 hover:bg-white" data-testid="refill">
            Update from measurements
          </button>
        )}
        <Link href={`/app/estimates/${id}?view=editor`} onClick={guardLeave} className="ml-auto inline-flex min-h-11 items-center rounded-xl px-4 font-medium text-brand-700 ring-1 ring-brand-500/40 hover:bg-brand-50" data-testid="detailed-editor">
          Detailed editor →
        </Link>
        <span className="min-w-16 text-right text-xs text-slate-500" aria-live="polite" data-testid="save-state">{locked ? "Locked" : saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
      </div>

      {msg?.error && <p role="alert" className="no-print mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{msg.error}</p>}
      {msg?.ok && <p className="no-print mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{msg.ok}</p>}
      {!msg && zeroMain > 0 && !locked && (
        <p className="no-print mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {zeroMain} line{zeroMain === 1 ? " is" : "s are"} $0. Set your prices in <Link href="/app/settings/price-book" className="font-semibold underline">Settings → Price book</Link>, then <b>Update from measurements</b>.
        </p>
      )}

      <DocketPaper>
        <DocketTopLine {...header} />
        <RoofBand shape={shape} hex={hex} title={roofTitle(m, metal ? profile : null)} facts={`${roofFacts(m, panels)}${metal && colour ? ` · ${colour}` : ""}`} address={address} price={view.mainTotal}>
          {metal && !locked && (
            <div className="no-print">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sheet profile">
                {DOCKET_PROFILES.map((p) => (
                  <button key={p} type="button" onClick={() => pickProfile(p)} aria-pressed={p === profile} data-testid={`docket-profile-${p}`}
                    className={cx("min-h-11 rounded-xl px-3.5 text-sm font-bold ring-1", p === profile ? "bg-brand-50 text-ink ring-2 ring-brand-500" : "bg-white text-ink ring-slate-200 hover:bg-slate-50")}>
                    {PROFILE_SHORT[p]}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Colour">
                {COLOURS.map((c) => (
                  <button key={c.name} type="button" onClick={() => pickColour(c.name)} aria-label={c.name} title={c.name} aria-pressed={c.name === colour} data-testid="docket-colour"
                    className={cx("h-9 w-9 rounded-full ring-offset-2 sm:h-8 sm:w-8", c.name === colour ? "ring-2 ring-brand-500" : "ring-1 ring-slate-300")} style={{ background: c.hex }} />
                ))}
              </div>
            </div>
          )}
        </RoofBand>

        {items.length === 0 ? (
          <div className="no-print py-8 text-center" data-testid="docket-empty">
            {measured ? (
              <>
                <p className="text-slate-600">The roof is measured. Fill the docket with its lines from your price book.</p>
                <button type="button" onClick={fill} className="mt-4 inline-flex min-h-12 items-center rounded-2xl bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600" data-testid="docket-fill">
                  Fill the docket from the measurements
                </button>
              </>
            ) : (
              <p className="text-slate-600">Measure the roof first: from the plans, on the satellite map, or by hand in the <Link href={`/app/estimates/${id}?view=editor`} className="font-semibold text-brand-700 underline">detailed editor</Link>.</p>
            )}
          </div>
        ) : (
          <MainLines lines={view.main.map((l) => ({ key: l.idx, calcKey: l.calc_key, description: l.description, qty: qtyText(Number(l.quantity), l.unit), amount: Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100 }))} />
        )}
        <AddedExtras rows={view.added} onRemove={locked ? undefined : (r) => toggle(r, "offered")} />
        <DocketTotal total={totals.total} gst={totals.gst} gstCharged={initial.tax_rate > 0} discount={totals.discount} />
      </DocketPaper>

      {locked ? (
        <section className="mt-6 rounded-2xl bg-green-50 p-5 ring-1 ring-green-200 print:bg-white" data-testid="signed-receipt">
          <h2 className="font-display text-lg font-bold text-green-900">Signed and accepted</h2>
          <p className="mt-1 text-sm text-green-900">
            <b>{money(totals.total)}</b>{initial.tax_rate > 0 ? " inc GST" : ""} · accepted{accepted?.name ? <> by <b>{accepted.name}</b></> : null}
            {accepted?.at ? ` on ${accepted.at}` : ""}{accepted?.ip ? ` · IP ${accepted.ip}` : ""}.
            {" "}This quote is locked; duplicate it to make a variation.
          </p>
          {accepted?.signature && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={accepted.signature} alt="Customer signature" className="mt-3 h-20 max-w-full rounded-lg bg-white p-2 ring-1 ring-green-200" />
          )}
        </section>
      ) : (
        <>
          <OftenAdded rows={view.offered} onAdd={(r) => toggle(r, "added")} className="mt-6"
            note={status === "draft" ? <p className="mb-1 text-xs text-slate-400">Not in the total. The customer can add these on their quote link too.</p> : null} />
          {status === "draft" ? (
            <button type="button" onClick={send} disabled={sending || items.length === 0} data-testid="send-quote"
              className="no-print mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {sending ? "Sending…" : "Send the quote →"}
            </button>
          ) : status === "sent" ? (
            <section className="no-print mt-6 rounded-2xl bg-ink p-5 text-white" data-testid="sent-card">
              <p className="font-display text-lg font-bold">Sent. Here&apos;s {customer.name}&apos;s link</p>
              <p className="mt-1 text-sm text-white/70">Text or email it{customer.email ? ` (${customer.email})` : ""}. They can add extras and sign on their phone. Changes you make here show up on their link straight away.</p>
              <p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2 font-mono text-sm" data-testid="customer-link">{publicUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyLink url={publicUrl} />
                <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-medium text-white ring-1 ring-white/40 hover:bg-white/10">Open customer view</a>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
