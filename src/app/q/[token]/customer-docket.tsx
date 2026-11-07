"use client";

// The customer's quote as a receipt docket: the roofer's main lines (read only), extras the roofer added, and the
// extras on offer that the customer can tap to add or remove (the total updates live). `children` (notes, terms and
// the state notices) sit between the docket and the signature, so the customer reads them before signing.
import { useState, type ReactNode } from "react";
import { AddedExtras, DocketPaper, DocketTopLine, DocketTotal, MainLines, OftenAdded, RoofBand } from "@/components/docket";
import { docketTotals, docketView, qtyText, type ExtraRow } from "@/lib/docket";
import type { RoofShape } from "@/lib/docket-shape";
import type { DraftItem } from "@/lib/estimating";
import { round2 } from "@/lib/roof";
import { SignForm } from "./accept-form";
import type { PublicItem } from "./model";

type Props = {
  token: string;
  orgName: string;
  status: "sent" | "accepted" | "declined";
  header: { name: string; abn: string | null; licence: string | null; number: number; date: string };
  roof: { shape: RoofShape; hex: string; title: string; facts: string; address: string | null };
  items: PublicItem[];
  discount: number;
  taxRate: number;
  inclusive: boolean;
  children?: ReactNode;
};

export function CustomerDocket({ token, orgName, status, header, roof, items, discount, taxRate, inclusive, children }: Props) {
  const [chosen, setChosen] = useState<string[]>([]);
  const open = status === "sent";
  // Offered extras at $0 aren't priced yet: the customer can't usefully add them.
  const lines: (DraftItem & { id?: string; mine: boolean })[] = items
    .filter((i) => !(i.extra_status === "offered" && !(Number(i.unit_price) > 0)))
    .map((i) => {
      const mine = i.extra_status === "offered" && Boolean(i.id) && chosen.includes(i.id!);
      return {
        id: i.id, mine, description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price), unit_cost: 0, category: "material",
        calc_key: i.calc_key ?? null, option_key: null, extra_status: mine ? "added" : i.extra_status ?? null, blurb: i.blurb ?? null, customer_added: Boolean(i.customer_added),
      };
    });
  const view = docketView(lines);
  const t = docketTotals(lines, discount, taxRate, inclusive);
  const idsOf = (r: ExtraRow) => r.idx.map((k) => lines[k].id).filter(Boolean) as string[];
  const isMine = (r: ExtraRow) => r.idx.every((k) => lines[k].mine);
  const add = (r: ExtraRow) => setChosen((c) => [...new Set([...c, ...idsOf(r)])]);
  const remove = (r: ExtraRow) => setChosen((c) => c.filter((id) => !idsOf(r).includes(id)));
  const added = view.added.map((r) => ({ ...r, customerAdded: false }));

  return (
    <>
      <DocketPaper>
        <DocketTopLine {...header} />
        <RoofBand shape={roof.shape} hex={roof.hex} title={roof.title} facts={roof.facts} address={roof.address} price={view.mainTotal} />
        <MainLines lines={view.main.map((l) => ({ key: l.idx, calcKey: l.calc_key, description: l.description, qty: qtyText(Number(l.quantity), l.unit), amount: round2(Number(l.quantity) * Number(l.unit_price)) }))} />
        <AddedExtras rows={added} onRemove={open ? remove : undefined} canRemove={isMine} />
        <DocketTotal total={t.total} gst={t.gst} gstCharged={taxRate > 0} discount={t.discount} />
      </DocketPaper>
      {open && (
        <OftenAdded rows={view.offered} onAdd={add} className="mt-6"
          note={<p className="mb-1 text-xs text-slate-400">Not included yet. Tap Add and it goes on your quote; the total updates straight away.</p>} />
      )}
      {children}
      {open && (
        <div className="mt-6">
          <SignForm token={token} orgName={orgName} optionId={null} total={t.total} gstCharged={taxRate > 0} extras={chosen} />
        </div>
      )}
    </>
  );
}
