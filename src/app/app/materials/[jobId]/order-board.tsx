"use client";
// Material orders for a sold job: 01 Delivery · 02 Orders (one envelope per supplier, its items underneath,
// preview + send on each) · 03 Totals. Saves as you type; changing a line's supplier moves it to that order.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cx } from "@/components/ui";
import type { MatLine, MatOrder } from "@/lib/supplier-orders-server";
import type { SupplierChoice } from "../../estimates/[id]/quote-engine";
import { fillFromQuote, linkSupplier, saveMaterials, sendReadyOrders, sendSupplierOrder, setSupplierEmail } from "./actions";

type Line = MatLine & { key: string };
type Order = Omit<MatOrder, "items"> & { key: string; items: Line[] };
type Delivery = { date: string | null; time: string | null; type: string; contact: string | null; notes: string | null };
export type BoardProps = {
  jobId: string; address: string | null; firstName: string; quoteNo: number | null;
  orders: MatOrder[]; delivery: Delivery; choices: SupplierChoice[]; quotedCost: number | null;
  coolingOffEnds: string | null; previewBase: string; tz: string;
};

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const k = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`);
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6";
const SEND = "M4 12l16-8-6 16-2.5-6.5z";
const CHECK = "M5 12l5 5 9-10";
const GRIP = "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01";
const LENGTH_UNITS = new Set(["lm", "m", "length", "lengths", "sheet", "sheets"]);
const mark = (s: string) => s.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2) || "?";
/** Cost of a line: per-metre items with a cut length cost qty × length × rate; everything else qty × rate. */
const lineCost = (l: { quantity: number; unit_cost: number; length_m: number | null; unit: string }) => Math.round(l.quantity * (l.length_m && ["lm", "m"].includes(l.unit) ? l.length_m : 1) * l.unit_cost * 100) / 100;

const fromServer = (os: MatOrder[]): Order[] => os.map((o) => ({ ...o, key: o.id, items: o.items.map((i) => ({ ...i, key: i.id ?? k() })) }));

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
function Block({ n, title, hint, right, children }: { n: number; title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-7 first:border-t-0" data-block={title}>
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
const box = "w-full rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-ink ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500";
const Mark = ({ name, dark, size = "h-10 w-10" }: { name: string; dark?: boolean; size?: string }) => <span className={cx("grid shrink-0 place-items-center rounded-lg font-display text-xs font-bold text-white", size, dark ? "bg-ink" : "bg-[#5b6b62]")}>{mark(name)}</span>;

export function OrderBoard(p: BoardProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(() => fromServer(p.orders));
  // Fresh data from the server (sent, opened, confirmed, an email added) merges in; the lines being edited stay as typed.
  const [server, setServer] = useState(p.orders);
  if (server !== p.orders) {
    setServer(p.orders);
    setOrders((xs) => (xs.length === 0 ? fromServer(p.orders) : xs.map((o) => {
      const s = p.orders.find((x) => x.id && x.id === o.id);
      if (!s) return o;
      return { ...o, status: s.status, email: s.email, sentAt: s.sentAt, openedAt: s.openedAt, confirmedAt: s.confirmedAt, supplierRef: s.supplierRef, supplierNote: s.supplierNote,
        supplierDate: s.supplierDate, attachPlans: s.attachPlans, attachReport: s.attachReport, attachFileIds: s.attachFileIds, publicToken: s.publicToken, code: s.code, branch: s.branch };
    })));
  }
  const [delivery, setDelivery] = useState<Delivery>(p.delivery);
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef({ orders, delivery });
  useLayoutEffect(() => { latest.current = { orders, delivery }; });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return true;
    dirty.current = false;
    setState("saving");
    const { orders: os, delivery: d } = latest.current;
    const r = await saveMaterials({
      jobId: p.jobId, delivery: { ...d, type: d.type as "crane" },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      orders: os.map((o) => ({ id: o.id || null, key: o.key, orgSupplierId: o.orgSupplierId, items: o.items.map(({ key: _k, id: _i, ...l }) => l) })),
    });
    if (r?.error) { setState("error"); setMsg({ error: r.error }); return false; }
    if (r?.ids) setOrders((xs) => xs.map((o) => (r.ids![o.key] && !o.id ? { ...o, id: r.ids![o.key] } : o)));
    setState("saved");
    return true;
  }, [p.jobId]);
  const touch = useCallback(() => { dirty.current = true; setState("saving"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 700); }, [flush]);

  const editLine = (ok: string, lk: string, patch: Partial<Line>) => { setOrders((xs) => xs.map((o) => (o.key !== ok ? o : { ...o, items: o.items.map((l) => (l.key === lk ? { ...l, ...patch } : l)) }))); touch(); };
  const removeLine = (ok: string, lk: string) => { setOrders((xs) => xs.map((o) => (o.key !== ok ? o : { ...o, items: o.items.filter((l) => l.key !== lk) }))); touch(); };
  const addLine = (ok: string) => { setOrders((xs) => xs.map((o) => (o.key !== ok ? o : { ...o, items: [...o.items, { key: k(), description: "", spec: null, sku: null, quantity: 1, unit: "ea", length_m: null, unit_cost: 0, group_label: null, calc_key: null, supplier_price_item_id: null }] }))); touch(); };

  /** Resolve a picked supplier to an order on the page (creating one if needed). */
  async function orderFor(value: string): Promise<string | null> {
    const [kind, a, b] = value.split(":");
    let osId = kind === "os" ? a : null;
    let name = "", branch: string | null = null, email: string | null = null, supplierId: string | null = null;
    const ch = p.choices.find((c) => (kind === "os" ? c.orgSupplierId === a : c.supplierId === a));
    if (kind === "dir" || !ch?.orgSupplierId) {
      const r = await linkSupplier({ supplierId: kind === "dir" ? a : ch!.supplierId, branchId: kind === "dir" ? (b || null) : ch?.branchId ?? null });
      if (r?.error || !r?.orgSupplierId) { setMsg({ error: r?.error ?? "Couldn't add that supplier." }); return null; }
      osId = r.orgSupplierId; name = r.name ?? ""; branch = r.branch ?? null; email = r.email ?? null; supplierId = kind === "dir" ? a : ch!.supplierId;
    } else { name = ch.name; branch = ch.place?.split(" ")[0] ?? null; supplierId = ch.supplierId; }
    const existing = latest.current.orders.find((o) => o.orgSupplierId === osId);
    if (existing) return existing.key;
    const key = k();
    setOrders((xs) => [...xs, {
      key, id: "", status: "draft", orgSupplierId: osId, supplierId, supplier: name, branch, email, account: null, code: `${p.quoteNo ?? "JOB"}-${name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SUP"}`,
      sentAt: null, confirmedAt: null, openedAt: null, supplierRef: null, supplierNote: null, supplierDate: null, attachPlans: false, attachReport: false, attachFileIds: [], publicToken: "", items: [],
    }]);
    return key;
  }
  async function moveLine(ok: string, lk: string, value: string) {
    const target = await orderFor(value);
    if (!target || target === ok) return;
    setOrders((xs) => {
      const line = xs.find((o) => o.key === ok)?.items.find((l) => l.key === lk);
      if (!line) return xs;
      return xs.map((o) => (o.key === ok ? { ...o, items: o.items.filter((l) => l.key !== lk) } : o.key === target ? { ...o, items: [...o.items, line] } : o));
    });
    touch();
  }
  async function addSupplier(value: string) { if (value) { const key = await orderFor(value); if (key) touch(); } }

  const all = orders.flatMap((o) => o.items);
  const ex = Math.round(all.reduce((a, l) => a + lineCost(l), 0) * 100) / 100;
  const gst = Math.round(ex * 10) / 100;
  const sent = orders.filter((o) => o.status !== "draft").length;
  const ready = orders.filter((o) => o.status === "draft" && o.items.length && o.email).length;
  const noEmail = orders.filter((o) => o.status === "draft" && o.items.length && !o.email).length;
  const opts = useMemo(() => {
    const linked = p.choices.filter((c) => c.orgSupplierId);
    const near = p.choices.filter((c) => !c.orgSupplierId && c.km !== null && c.km < 60).slice(0, 8);
    const rest = p.choices.filter((c) => !c.orgSupplierId && !near.includes(c));
    return { linked, near, rest };
  }, [p.choices]);
  const supplierOptions = (
    <>
      {opts.linked.length > 0 && <optgroup label="Your suppliers">{opts.linked.map((c) => <option key={c.supplierId} value={`os:${c.orgSupplierId}`}>{c.name}</option>)}</optgroup>}
      {opts.near.length > 0 && <optgroup label="Nearest to you">{opts.near.map((c) => <option key={c.supplierId} value={`dir:${c.supplierId}:${c.branchId ?? ""}`}>{c.name}{c.place ? ` · ${c.place}` : ""}{c.km !== null ? ` · ${c.km < 10 ? c.km.toFixed(1) : Math.round(c.km)} km` : ""}</option>)}</optgroup>}
      <optgroup label="All suppliers">{opts.rest.map((c) => <option key={c.supplierId} value={`dir:${c.supplierId}:${c.branchId ?? ""}`}>{c.name}</option>)}</optgroup>
    </>
  );

  async function send(orderId: string) {
    setBusy(true); setMsg(null);
    if (await flush()) {
      const fd = new FormData(); fd.set("job_id", p.jobId); fd.set("order_id", orderId);
      const r = await sendSupplierOrder(undefined, fd); setMsg(r ?? null); router.refresh();
    }
    setBusy(false);
  }
  async function sendAll() {
    setBusy(true); setMsg(null);
    if (await flush()) { const fd = new FormData(); fd.set("job_id", p.jobId); const r = await sendReadyOrders(undefined, fd); setMsg(r ?? null); router.refresh(); }
    setBusy(false);
  }
  async function preview(orderId: string) { if (await flush()) router.push(`${p.previewBase}?preview=${orderId}`, { scroll: false }); }
  const setD = (patch: Partial<Delivery>) => { setDelivery((d) => ({ ...d, ...patch })); touch(); };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-cream" data-materials>
      <main className="mx-auto max-w-[860px] px-4 pb-6 pt-4 sm:px-6">
        <Block n={1} title="Delivery">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Deliver on</span>
              <span className="flex gap-2"><input type="date" className={box} value={delivery.date ?? ""} onChange={(e) => setD({ date: e.target.value || null })} data-field="date" />
                <input className={cx(box, "w-28")} value={delivery.time ?? ""} placeholder="7 am" onChange={(e) => setD({ time: e.target.value || null })} aria-label="Time" /></span></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Delivery</span>
              <select className={box} value={delivery.type} onChange={(e) => setD({ type: e.target.value })}>
                <option value="crane">Truck with crane</option><option value="roof_load">Roof load</option><option value="ground_drop">Ground drop</option><option value="pickup">We&apos;ll pick up</option>
              </select></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Deliver to</span><div className={cx(box, "bg-slate-50")}>{p.address ?? "Add the site address on the job"}</div></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">On site</span><input className={box} value={delivery.contact ?? ""} placeholder="Who meets the truck, and their number" onChange={(e) => setD({ contact: e.target.value || null })} /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Notes for the driver</span><textarea className={cx(box, "min-h-16 text-sm")} value={delivery.notes ?? ""} placeholder="Access, where to drop, gate code" onChange={(e) => setD({ notes: e.target.value || null })} /></label>
          </div>
          {p.coolingOffEnds && delivery.date && delivery.date <= p.coolingOffEnds && <p className="mt-2 text-xs font-medium text-amber-700">Cooling-off ends {new Date(`${p.coolingOffEnds}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}. Deliver after that, in case {p.firstName} cancels.</p>}
        </Block>

        <Block n={2} title="Orders" hint={`${all.length} item${all.length === 1 ? "" : "s"} · ${orders.filter((o) => o.items.length).length} supplier${orders.filter((o) => o.items.length).length === 1 ? "" : "s"}`}>
          {orders.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-8 text-center">
              <p className="font-semibold text-ink">No order yet</p>
              <p className="mt-1 text-sm text-slate-500">Start from the signed quote: every material and the extras {p.firstName} added, under your main supplier.</p>
              <ActionForm action={fillFromQuote} className="mt-4 inline-block"><input type="hidden" name="job_id" value={p.jobId} /><input type="hidden" name="delivery" value={JSON.stringify(delivery)} /><SubmitButton>Fill from the quote</SubmitButton></ActionForm>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o, n) => <Envelope key={o.key} o={o} tz={p.tz} dark={n === 0} busy={busy} onSend={() => void send(o.id)} onPreview={() => void preview(o.id)} onAdd={() => addLine(o.key)} supplierOptions={supplierOptions}
                onEdit={(lk, patch) => editLine(o.key, lk, patch)} onRemove={(lk) => removeLine(o.key, lk)} onMove={(lk, v) => void moveLine(o.key, lk, v)} />)}
              <label className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500">
                <Icon d="M12 5v14M5 12h14" />
                <select aria-label="Add another supplier" className="bg-transparent font-semibold focus:outline-none" value="" onChange={(e) => void addSupplier(e.target.value)}>
                  <option value="">Add another supplier</option>{supplierOptions}
                </select>
              </label>
            </div>
          )}
        </Block>

        {all.length > 0 && <Block n={3} title="Totals">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Order total</p>
              <p className="mt-1 font-display text-4xl font-bold leading-none text-ink" data-order-total>{aud(ex + gst)}</p>
              <p className="mt-1 text-sm text-slate-500">{aud(ex)} + GST {aud(gst)} · at your costs</p>
              <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                {orders.filter((o) => o.items.length).map((o, n) => (
                  <li key={o.key} className="flex items-center gap-2"><Mark name={o.supplier} dark={n === 0} size="h-5 w-5 text-[9px]" /><span className="flex-1 text-ink">{o.supplier} <span className="text-slate-400">· {o.items.length} item{o.items.length === 1 ? "" : "s"}</span></span><span className="tabular-nums text-slate-600">{aud(o.items.reduce((a, l) => a + lineCost(l), 0))}</span></li>
                ))}
              </ul>
            </div>
            {p.quotedCost !== null && (
              <div className="rounded-2xl bg-ink p-5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">Against the quote · only you</p>
                <p className="mt-1 font-display text-4xl font-bold leading-none" style={{ color: ex <= p.quotedCost ? "#8fd0a8" : "#f4c66b" }}>{aud(Math.abs(p.quotedCost - ex)).replace(".00", "")} {ex <= p.quotedCost ? "under" : "over"}</p>
                <p className="mt-4 text-sm text-white/70">Materials quoted at {aud(p.quotedCost)} cost ex GST</p>
              </div>
            )}
          </div>
        </Block>}
      </main>

      <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white" data-materials-bar>
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{sent} of {orders.filter((o) => o.items.length).length} sent{ready ? ` · ${ready} ready` : ""}{noEmail ? ` · ${noEmail} need${noEmail === 1 ? "s" : ""} an email` : ""} · <span data-save-state>{state === "saving" ? "Saving…" : state === "error" ? "Not saved" : "Saved"}</span></p>
            <p className="font-display text-2xl font-bold leading-none text-ink">{aud(ex + gst)}</p>
          </div>
          {msg?.error && <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:order-first">{msg.error}</p>}
          {msg?.ok && <p className="w-full rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:order-first">{msg.ok}</p>}
          <button type="button" disabled={busy || !ready} onClick={() => void sendAll()} className="flex min-h-12 items-center gap-2 rounded-xl bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600 disabled:opacity-50" data-send-all>
            <Icon d={SEND} />{busy ? "Sending…" : ready ? `Send ${ready} email${ready === 1 ? "" : "s"}` : "Nothing to send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Envelope({ o, tz, dark, busy, onSend, onPreview, onAdd, onEdit, onRemove, onMove, supplierOptions }: {
  o: Order; tz: string; dark: boolean; busy: boolean; onSend: () => void; onPreview: () => void; onAdd: () => void;
  onEdit: (lk: string, patch: Partial<Line>) => void; onRemove: (lk: string) => void; onMove: (lk: string, value: string) => void; supplierOptions: ReactNode;
}) {
  const [open, setOpen] = useState(o.status === "draft");
  const [seen, setSeen] = useState(o.status);
  if (seen !== o.status) { setSeen(o.status); setOpen(o.status === "draft"); }
  const [addEmail, setAddEmail] = useState(false);
  const cost = o.items.reduce((a, l) => a + lineCost(l), 0);
  const groups: [string, Line[]][] = [];
  for (const l of o.items) { const g = l.group_label ?? ""; const hit = groups.find(([x]) => x === g); if (hit) hit[1].push(l); else groups.push([g, [l]]); }
  const when = o.supplierDate ? new Date(`${o.supplierDate}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null;
  const status = o.status === "confirmed" ? <span className="flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white"><Icon d={CHECK} />Confirmed{when ? ` · ${when}` : ""}</span>
    : o.status === "delivered" ? <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700"><Icon d={CHECK} />Delivered</span>
    : o.status === "sent" ? <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700"><Icon d={CHECK} />Sent {o.sentAt ? new Date(o.sentAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz }) : ""}{o.openedAt ? " · opened" : ""}</span>
    : !o.items.length ? null
    : o.email ? <button type="button" disabled={busy || !o.id} onClick={(e) => { e.preventDefault(); onSend(); }} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50" data-send-one><Icon d={SEND} />Send</button>
    : <button type="button" onClick={(e) => { e.preventDefault(); setAddEmail(true); setOpen(true); }} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50" data-add-email>Add email</button>;
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-envelope={o.supplier}>
      <div className="relative px-4 pb-3 pt-4">
        <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-2.5 w-full" aria-hidden><path d="M0 0 50 12 100 0" fill="none" stroke="#e3e6df" strokeWidth="1" /></svg>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => setOpen((x) => !x)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
            <Mark name={o.supplier} dark={dark} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{o.supplier}{o.branch ? ` · ${o.branch}` : ""}</span>
              <span className="block truncate text-sm text-slate-500">{o.email ? `To ${o.email}` : "No email on file"}</span>
            </span>
          </button>
          <span className="order-last flex w-full items-center justify-end gap-2 sm:order-none sm:w-auto">
            {o.id && o.items.length > 0 && <button type="button" onClick={onPreview} title={`Preview what ${o.supplier} gets`} aria-label={`Preview what ${o.supplier} gets`} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-slate-300 hover:bg-slate-50" data-preview-order><Icon d={EYE} className="h-5 w-5" /></button>}
            {status}
          </span>
          <button type="button" onClick={() => setOpen((x) => !x)} aria-label={open ? "Collapse" : "Expand"} className="grid h-8 w-8 shrink-0 place-items-center text-slate-400"><Icon d="M6 9l6 6 6-6" className={cx("h-5 w-5 transition-transform", open && "rotate-180")} /></button>
        </div>
        {addEmail && !o.email && (
          <ActionForm action={setSupplierEmail} className="mt-3">
            <input type="hidden" name="order_id" value={o.id} />
            <div className="flex gap-2"><input name="email" type="email" required autoFocus placeholder={`${o.supplier} branch email`} className="min-h-10 min-w-0 flex-1 rounded-lg px-3 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" /><SubmitButton className="min-h-10 px-3 text-sm">Save</SubmitButton></div>
          </ActionForm>
        )}
        <p className="mt-3 flex items-center border-t border-dashed border-slate-200 pt-2.5 text-sm text-slate-500">
          <span className="flex-1">Order request {o.code} · {o.items.length} item{o.items.length === 1 ? "" : "s"}{o.supplierRef ? ` · their ref ${o.supplierRef}` : ""}{o.supplierNote ? ` · “${o.supplierNote}”` : ""}</span>
          <span className="font-semibold tabular-nums text-ink">{aud(cost)}</span>
        </p>
      </div>
      {open && (
        <div className="border-t border-slate-100">
          <div className="hidden grid-cols-[16px_minmax(0,1fr)_150px_60px_96px_92px_16px] gap-3 bg-cream px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 md:grid">
            <span /><span>Item</span><span>Supplier</span><span className="text-right">Qty</span><span>Length</span><span className="text-right">Cost ex GST</span><span />
          </div>
          {groups.map(([g, ls]) => (
            <div key={g || "-"}>
              {g && groups.length > 1 && <p className={cx("border-t border-slate-100 px-4 py-1.5 text-xs font-semibold", g.startsWith("Extras") ? "bg-brand-50 text-brand-800" : "text-slate-500")}>{g}</p>}
              {ls.map((l) => (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_60px_96px_92px_16px] items-center gap-x-3 gap-y-2 border-t border-slate-100 px-4 py-2.5 md:grid-cols-[16px_minmax(0,1fr)_150px_60px_96px_92px_16px]" data-order-line>
                  <Icon d={GRIP} className="hidden h-4 w-4 text-slate-300 md:block" />
                  <span className="col-span-5 min-w-0 md:col-span-1">
                    <input className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-slate-400 focus:outline-none" value={l.description} placeholder="What it is" onChange={(e) => onEdit(l.key, { description: e.target.value })} aria-label="Item" />
                    <input className="w-full bg-transparent text-xs text-slate-500 placeholder:text-slate-300 focus:outline-none" value={l.spec ?? ""} placeholder="Colour, size, profile" onChange={(e) => onEdit(l.key, { spec: e.target.value || null })} aria-label="Details" />
                  </span>
                  <label className="col-span-5 flex min-w-0 items-center gap-1.5 rounded-lg bg-white py-1 pl-1 pr-1.5 text-xs font-semibold text-ink ring-1 ring-slate-300 md:col-span-1">
                    <Mark name={o.supplier} dark={dark} size="h-5 w-5 text-[9px]" />
                    <select aria-label="Supplier" className="min-w-0 flex-1 truncate bg-transparent focus:outline-none" value="" onChange={(e) => onMove(l.key, e.target.value)}>
                      <option value="">{o.supplier}</option>{supplierOptions}
                    </select>
                  </label>
                  <input inputMode="decimal" className="rounded-lg bg-cream px-2 py-1 text-right text-sm tabular-nums text-ink ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500" value={String(l.quantity)} onChange={(e) => onEdit(l.key, { quantity: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} aria-label="Quantity" />
                  {l.length_m !== null || LENGTH_UNITS.has(l.unit) ? (
                    <span className="flex items-center gap-1 text-sm text-slate-500"><span className="text-slate-400">×</span>
                      <LengthInput line={l} onCommit={(patch) => onEdit(l.key, patch)} /></span>
                  ) : <span className="text-sm text-slate-500">{l.unit}</span>}
                  <span className="text-right text-sm font-semibold tabular-nums text-ink">{aud(lineCost(l))}</span>
                  <button type="button" aria-label="Remove item" onClick={() => onRemove(l.key)} className="text-slate-300 hover:text-red-600"><Icon d="M6 6l12 12M18 6L6 18" /></button>
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-5 border-t border-slate-100 px-4 py-2.5 text-sm font-semibold text-brand-700">
            <button type="button" onClick={onAdd} className="flex items-center gap-2" data-add-item><Icon d="M12 5v14M5 12h14" />Add an item</button>
            {o.status !== "draft" && <span className="ml-auto text-xs font-normal text-slate-500">Changes after sending: send it again so {o.supplier} has the latest.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cut length. Set on a run in metres (274 m of sheet), it turns the metres into pieces: 274 m at 6.5 m = 43 × 6.5 m. */
function LengthInput({ line, onCommit }: { line: Line; onCommit: (patch: Partial<Line>) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(/[^\d.]/g, ""));
    const len = v > 0 ? Math.round(v * 100) / 100 : null;
    setDraft(null);
    if (len === line.length_m) return;
    if (["lm", "m"].includes(line.unit)) {
      const metres = line.length_m ? line.quantity * line.length_m : line.quantity;
      onCommit({ length_m: len, quantity: len ? Math.ceil(metres / len - 1e-9) : Math.round(metres * 100) / 100 });
    } else onCommit({ length_m: len });
  };
  return (
    <span className="flex flex-1 items-center rounded-lg bg-cream px-2 py-1 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
      <input inputMode="decimal" className="w-full min-w-0 bg-transparent text-right tabular-nums text-ink focus:outline-none" value={draft ?? (line.length_m === null ? "" : String(line.length_m))} placeholder="–"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Length (m)" />
      <span className="ml-0.5 text-slate-400">m</span>
    </span>
  );
}

function Toggle({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick} className="flex items-center gap-2 text-xs font-semibold text-slate-600 disabled:opacity-40">{label}
      <span className={cx("relative h-5 w-9 rounded-full transition-colors", on ? "bg-brand-500" : "bg-slate-300")}><span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} /></span></button>
  );
}

/** Ticks for the preview's attachment panel (plans, roof report, other job files). */
export function AttachmentPanel({ orderId, plans, report, files, planNames, hasRoof, supplier }: {
  orderId: string; plans: boolean; report: boolean; files: { id: string; name: string; on: boolean }[]; planNames: string[]; hasRoof: boolean; supplier: string;
}) {
  const router = useRouter();
  const [s, setS] = useState({ plans, report, ids: files.filter((f) => f.on).map((f) => f.id) });
  const [err, setErr] = useState<string | null>(null);
  async function save(next: typeof s) {
    setS(next); setErr(null);
    const { setOrderAttachments } = await import("./actions");
    const r = await setOrderAttachments({ orderId, plans: next.plans, report: next.report, fileIds: next.ids });
    if (r?.error) setErr(r.error); else router.refresh();
  }
  const row = (name: string, meta: string, on: boolean, toggle?: ReactNode) => (
    <div className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1", on ? "bg-white ring-slate-200" : "bg-slate-50 ring-slate-200")}>
      <span className="grid h-10 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-[9px] font-bold text-red-600 ring-1 ring-red-100">PDF</span>
      <span className="min-w-0 flex-1"><span className={cx("block truncate text-sm font-semibold", on ? "text-ink" : "text-slate-400")}>{name}</span><span className="block truncate text-xs text-slate-500">{meta}</span></span>
      {toggle}
    </div>
  );
  const others = files.filter((f) => !planNames.includes(f.name));
  return (
    <div data-attachments>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Attached</p>
      <div className="mt-2 space-y-2">
        {row("Order PDF", "Every item and the delivery details", true)}
        {row(planNames.length ? planNames.join(", ") : "No plans on this job", planNames.length ? "Architectural plans" : "Add them in Plans & files", s.plans && planNames.length > 0, <Toggle on={s.plans && planNames.length > 0} label="Plans" disabled={!planNames.length} onClick={() => void save({ ...s, plans: !s.plans })} />)}
        {row("Roof report.pdf", hasRoof ? "Roof area, lengths and cut list" : "Measure the roof first", s.report && hasRoof, <Toggle on={s.report && hasRoof} label="Report" disabled={!hasRoof} onClick={() => void save({ ...s, report: !s.report })} />)}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{s.plans || s.report ? `${supplier} gets these so they can check the cut lengths.` : `Off for ${supplier}. Turn on if they need the plans.`}</p>
      {others.length > 0 && (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">From the job&apos;s files</p>
          <div className="mt-2 space-y-1.5">
            {others.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-[#1f5f3f]" checked={s.ids.includes(f.id)} onChange={(e) => void save({ ...s, ids: e.target.checked ? [...s.ids, f.id] : s.ids.filter((x) => x !== f.id) })} />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
    </div>
  );
}
