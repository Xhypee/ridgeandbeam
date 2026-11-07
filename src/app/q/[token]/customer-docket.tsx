"use client";

// The customer's quote as a receipt docket: the roofer's main lines (read only); extras the roofer added (the customer
// can take off the optional ones, not the required ones); extras on offer to tap on; the colour (when the roofer lets
// them choose). The total updates live. If the roofer edits the quote while it's open, the page refreshes to the new
// version, keeps the customer's choices where the lines still exist, and says so. `children` (notes, terms, state
// notices) sit between the docket and the signature.
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AddedExtras, DocketPaper, DocketTopLine, DocketTotal, MainLines, OftenAdded, RemovedExtras, RoofBand } from "@/components/docket";
import { cx } from "@/components/ui";
import { applyChoices, colourHex, docketTotals, docketView, matchChoices, pickableColours, qtyText, type ExtraRow, type Pick_ } from "@/lib/docket";
import type { RoofShape } from "@/lib/docket-shape";
import type { DraftItem } from "@/lib/estimating";
import { round2 } from "@/lib/roof";
import { SignForm } from "./accept-form";
import { quoteVersion } from "./actions";
import type { PublicItem } from "./model";

type Props = {
  token: string;
  orgName: string;
  status: "sent" | "accepted" | "declined";
  version: number;
  header: { name: string; abn: string | null; licence: string | null; number: number; date: string };
  roof: { shape: RoofShape; title: string; facts: string; address: string | null; metal: boolean };
  roofColour: string | null;
  /** The roofer lets the customer pick the colour. */
  customerColour: boolean;
  colourByCustomer: boolean;
  items: PublicItem[];
  discount: number;
  taxRate: number;
  inclusive: boolean;
  children?: ReactNode;
};

const POLL_MS = 5000;

export function CustomerDocket({ token, orgName, status, version, header, roof, roofColour, customerColour, colourByCustomer, items, discount, taxRate, inclusive, children }: Props) {
  const router = useRouter();
  const open = status === "sent";
  const [added, setAdded] = useState<Pick_[]>([]);
  const [removed, setRemoved] = useState<Pick_[]>([]);
  const [colour, setColour] = useState<string | null>(null);
  const [loadedVersion] = useState(version);
  const updated = open && version !== loadedVersion;

  // Notice the roofer's edits while the page is open (and when the customer comes back to the tab).
  useEffect(() => {
    if (!open) return;
    let stop = false;
    const check = async () => {
      const v = await quoteVersion(token).catch(() => null);
      if (!stop && v != null && v !== version) router.refresh();
    };
    const t = setInterval(check, POLL_MS);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { stop = true; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [open, token, version, router]);

  // Offered extras at $0 aren't priced yet: the customer can't usefully add them.
  const base = items.filter((i) => !(i.extra_status === "offered" && !i.customer_removed && !(Number(i.unit_price) > 0)));
  const addIds = open ? matchChoices(base, added, "offered") : [];
  const remIds = open ? matchChoices(base, removed, "added") : [];
  const colours = open && customerColour && roof.metal ? pickableColours(base, roofColour) : [];
  const pickedColour = colour && colours.some((c) => c.name === colour) ? colour : null;
  const shown = pickedColour ?? roofColour;
  const lines: (DraftItem & { mine: boolean })[] = applyChoices(base, { added: addIds, removed: remIds, colour: pickedColour, roofColour }).map((i) => ({
    id: i.id, mine: Boolean(i.id && (addIds.includes(i.id) || remIds.includes(i.id))), description: i.description, quantity: Number(i.quantity), unit: i.unit,
    unit_price: Number(i.unit_price), unit_cost: 0, category: "material", calc_key: i.calc_key ?? null, option_key: null, extra_status: i.extra_status ?? null,
    blurb: i.blurb ?? null, customer_added: Boolean(i.customer_added), customer_removed: Boolean(i.customer_removed) && !open, required: Boolean(i.required),
  }));
  const view = docketView(lines);
  const t = docketTotals(lines, discount, taxRate, inclusive);
  const picksOf = (r: ExtraRow): Pick_[] => r.idx.map((k) => ({ id: lines[k].id!, calc_key: lines[k].calc_key })).filter((p) => p.id);
  const has = (list: Pick_[], p: Pick_) => list.some((x) => x.id === p.id);
  const add = (r: ExtraRow) => {
    const ps = picksOf(r);
    // Taking back one they removed, or adding one on offer.
    if (ps.some((p) => remIds.includes(p.id))) setRemoved((c) => c.filter((x) => !ps.some((p) => p.id === x.id)));
    else setAdded((c) => [...c, ...ps.filter((p) => !has(c, p))]);
  };
  const remove = (r: ExtraRow) => {
    const ps = picksOf(r);
    if (ps.some((p) => addIds.includes(p.id))) setAdded((c) => c.filter((x) => !ps.some((p) => p.id === x.id)));
    else setRemoved((c) => [...c, ...ps.filter((p) => !has(c, p))]);
  };
  const canRemove = (r: ExtraRow) => !r.required;
  const offeredRows = open ? [...view.offered] : [];

  return (
    <>
      {updated && (
        <p role="status" className="no-print mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="quote-updated">
          This quote was just updated by {orgName} — please check the total.
        </p>
      )}
      <DocketPaper>
        <DocketTopLine {...header} />
        <RoofBand shape={roof.shape} hex={colourHex(shown) ?? "#a9adb0"} title={roof.title} facts={`${roof.facts}${roof.metal && shown ? ` · ${shown}` : ""}`} address={roof.address} price={view.mainTotal}
          badge={!open && colourByCustomer ? "Colour you chose" : null}>
          {colours.length > 0 && (
            <div className="no-print">
              <p className="mb-1.5 text-sm text-slate-500">Choose your colour</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
                {colours.map((c) => (
                  <button key={c.name} type="button" onClick={() => setColour(c.name === roofColour ? null : c.name)} aria-label={c.name} title={c.name} aria-pressed={c.name === shown} data-testid="customer-colour"
                    className={cx("h-9 w-9 rounded-full ring-offset-2 sm:h-8 sm:w-8", c.name === shown ? "ring-2 ring-brand-500" : "ring-1 ring-slate-300")} style={{ background: c.hex }} />
                ))}
              </div>
            </div>
          )}
        </RoofBand>
        <MainLines lines={view.main.map((l) => ({ key: l.idx, calcKey: l.calc_key, description: l.description, qty: qtyText(Number(l.quantity), l.unit), amount: round2(Number(l.quantity) * Number(l.unit_price)) }))} />
        <AddedExtras rows={view.added.map((r) => ({ ...r, customerAdded: false }))} onRemove={open ? remove : undefined} canRemove={canRemove} />
        {!open && <RemovedExtras rows={view.removed} />}
        <DocketTotal total={t.total} gst={t.gst} gstCharged={taxRate > 0} discount={t.discount} />
      </DocketPaper>
      {open && (
        <OftenAdded rows={offeredRows} onAdd={add} className="mt-6"
          note={<p className="mb-1 text-xs text-slate-400">Not included yet. Tap Add and it goes on your quote; the total updates straight away.</p>} />
      )}
      {children}
      {open && (
        <div className="mt-6">
          <SignForm token={token} orgName={orgName} optionId={null} total={t.total} gstCharged={taxRate > 0} extras={addIds} removed={remIds} colour={pickedColour} version={version} />
        </div>
      )}
    </>
  );
}
