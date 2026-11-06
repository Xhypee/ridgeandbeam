/**
 * Supplier-aware material orders (pure): estimate lines → order lines in the supplier's own
 * product codes and units, plus the branch-facing email and CSV. Quantities only go to the
 * branch — the branch prices the order against the account.
 */
import { CALC_KEY_MAP } from "./calc-keys";
import { calcUnitsPerSupplierUnit, normaliseUnit, UNIT_SHORT } from "./price-sheet";
import { buildPriceBook, type PriceBookOptions, type PriceItem } from "./suppliers";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type SourceLine = {
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  calc_key: string | null;
  supplier_price_item_id?: string | null;
  sku?: string | null;
  /** Pieces / m² per box or roll of THIS line (from the row it came from), for re-packing. */
  pack_qty?: number | null;
};

export type SupplierOrderLine = {
  description: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  calc_key: string | null;
  supplier_price_item_id: string | null;
};

const DISCRETE = new Set(["sheet", "length", "box", "roll", "ea", "bag", "job"]);

/** Quantity in the calc key's unit → quantity in the supplier's unit (discrete units round up). */
export function supplierQuantity(qty: number, factor: number, supplierUnit: string): number {
  const q = qty / factor;
  const u = normaliseUnit(supplierUnit) ?? supplierUnit;
  return DISCRETE.has(u) ? Math.ceil(q - 1e-9) : round2(q);
}

/**
 * Map each line onto the supplier's sheet: the exact supplier row when the line came from it,
 * else the supplier's best row for the line's calc key (profile/finish preferred). Lines with no
 * match keep their own description, unit and cost.
 */
export function mapLinesToSupplier(lines: SourceLine[], items: PriceItem[], markup: Record<string, number> | null, opts: PriceBookOptions = {}): { lines: SupplierOrderLine[]; matched: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const book = new Map(buildPriceBook(items, markup, opts).map((r) => [r.calc_key, r.supplier_price_item_id]));
  let matched = 0;
  const out = lines.map((l): SupplierOrderLine => {
    const keep: SupplierOrderLine = {
      description: l.description, sku: l.sku ?? null, quantity: Number(l.quantity) || 0, unit: l.unit, unit_cost: Number(l.unit_cost) || 0,
      calc_key: l.calc_key, supplier_price_item_id: null,
    };
    const item = (l.supplier_price_item_id && byId.get(l.supplier_price_item_id)) || (l.calc_key && byId.get(book.get(l.calc_key) ?? "")) || null;
    if (!item) return keep;
    const itemUnit = normaliseUnit(item.unit) ?? item.unit;
    const lineUnit = normaliseUnit(l.unit) ?? l.unit;
    const key = l.calc_key ?? item.calc_key;
    const calcUnit = key ? CALC_KEY_MAP[key]?.unit : undefined;
    let quantity: number;
    const linePack = Number(l.pack_qty) || 0;
    const itemPack = Number(item.pack_qty) || 0;
    if (lineUnit === itemUnit && (itemUnit === "box" || itemUnit === "roll") && linePack > 0 && itemPack > 0 && linePack !== itemPack) {
      quantity = Math.ceil((keep.quantity * linePack) / itemPack - 1e-9); // 2 boxes of 500 → 1 box of 1000
    } else if (lineUnit === itemUnit) quantity = keep.quantity;
    else {
      const factor = calcUnit && (lineUnit === calcUnit || !normaliseUnit(l.unit)) ? calcUnitsPerSupplierUnit(item, calcUnit) : null;
      if (!factor) return keep;
      quantity = supplierQuantity(keep.quantity, factor, itemUnit);
    }
    matched++;
    return {
      description: item.description, sku: item.product_code, quantity, unit: UNIT_SHORT[itemUnit] ? itemUnit : item.unit,
      unit_cost: Number(item.cost_ex_gst), calc_key: key ?? null, supplier_price_item_id: item.id,
    };
  });
  return { lines: out, matched };
}

/**
 * Lines that came from a supplier row go back to calculator units (5 × 6.5 m lengths → 32.5 lm)
 * and remember their pack size, so they can be re-mapped onto another supplier's sheet.
 */
export function toSourceLines(lines: SourceLine[], from: Map<string, PriceItem>): SourceLine[] {
  return lines.map((l) => {
    const p = l.supplier_price_item_id ? from.get(l.supplier_price_item_id) : undefined;
    const key = l.calc_key ?? p?.calc_key ?? null;
    const base: SourceLine = { description: l.description, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost, calc_key: key, sku: l.sku ?? null };
    if (!p) return base;
    const pUnit = normaliseUnit(p.unit) ?? p.unit;
    if ((normaliseUnit(l.unit) ?? l.unit) !== pUnit) return base;
    if ((pUnit === "box" || pUnit === "roll") && Number(p.pack_qty) > 0) return { ...base, pack_qty: Number(p.pack_qty) };
    const calcUnit = key ? CALC_KEY_MAP[key]?.unit : undefined;
    const f = calcUnit ? calcUnitsPerSupplierUnit(p, calcUnit) : null;
    return f && calcUnit ? { ...base, quantity: Math.round(l.quantity * f * 1000) / 1000, unit: calcUnit } : base;
  });
}

// ---------------------------------------------------------------------------
// Branch-facing documents
// ---------------------------------------------------------------------------
export type OrderDoc = {
  supplier: string;
  account_number: string | null;
  branch: string | null;
  po_number: string | null;
  color: string | null;
  delivery_date: string | null;
  delivery_type: string;
  notes: string | null;
  job: string;
  address: string | null;
};
export type DocLine = { description: string; sku: string | null; quantity: number; unit: string };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const csvCell = (s: unknown) => {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const ddmmyyyy = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "TBC");
const dropLabel = (t: string) => (t === "ground_drop" ? "Ground drop" : "Roof load");
const unitLabel = (u: string) => UNIT_SHORT[u] ?? u;

/** CSV for the branch / their ordering system: supplier product codes first. */
export function supplierOrderCsv(h: OrderDoc, items: DocLine[]): string {
  const rows: string[][] = [
    ["PO", h.po_number ?? ""], ["Supplier", h.supplier], ["Account", h.account_number ?? ""], ["Branch", h.branch ?? ""],
    ["Job", h.job], ["Deliver to", h.address ?? ""], ["Delivery date", ddmmyyyy(h.delivery_date)], ["Delivery", dropLabel(h.delivery_type)],
    ["Colour", h.color ?? ""], [],
    ["Line", "Product code", "Description", "Quantity", "Unit"],
    ...items.map((i, n) => [String(n + 1), i.sku ?? "", i.description, String(i.quantity), unitLabel(i.unit)]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function supplierOrderEmail(h: OrderDoc & { org: string; orgPhone: string | null; abn?: string | null }, items: DocLine[]) {
  const subject = `Material order${h.po_number ? ` PO ${h.po_number}` : ""} — ${h.org}${h.account_number ? ` (acct ${h.account_number})` : ""} — deliver ${ddmmyyyy(h.delivery_date)}`;
  const lines = items.map((i, n) => `${n + 1}. ${i.quantity} ${unitLabel(i.unit)} — ${i.description}${i.sku ? ` [${i.sku}]` : ""}`);
  const text = [
    `${h.org} material order for ${h.supplier}`, `Account: ${h.account_number ?? "—"}`, `PO: ${h.po_number ?? "—"}`, `Branch: ${h.branch ?? "—"}`,
    `Deliver to: ${h.address ?? "—"} (${h.job})`, `Delivery: ${ddmmyyyy(h.delivery_date)} · ${dropLabel(h.delivery_type).toUpperCase()}`, `Colour: ${h.color ?? "—"}`,
    "", ...lines, "", h.notes ? `Notes: ${h.notes}` : "", `Questions: ${h.orgPhone ?? h.org}`,
  ].join("\n");
  const html = `<h2>${esc(h.org)} — material order</h2>
<table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
<tr><td><b>Supplier</b></td><td>${esc(h.supplier)}</td></tr>
<tr><td><b>Account</b></td><td>${esc(h.account_number ?? "—")}</td></tr>
<tr><td><b>PO</b></td><td>${esc(h.po_number ?? "—")}</td></tr>
<tr><td><b>Branch</b></td><td>${esc(h.branch ?? "—")}</td></tr>
<tr><td><b>Deliver to</b></td><td>${esc(h.address ?? "—")} (${esc(h.job)})</td></tr>
<tr><td><b>Delivery</b></td><td>${esc(ddmmyyyy(h.delivery_date))} · <b>${dropLabel(h.delivery_type).toUpperCase()}</b></td></tr>
<tr><td><b>Colour</b></td><td>${esc(h.color ?? "—")}</td></tr>
</table>
<table border="1" cellpadding="6" style="border-collapse:collapse;margin-top:12px;font-family:sans-serif;font-size:14px">
<tr><th>#</th><th>Product code</th><th>Qty</th><th>Unit</th><th>Description</th></tr>
${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.sku ?? "")}</td><td>${esc(i.quantity)}</td><td>${esc(unitLabel(i.unit))}</td><td>${esc(i.description)}</td></tr>`).join("\n")}
</table>
${h.notes ? `<p><b>Notes:</b> ${esc(h.notes)}</p>` : ""}
<p>Questions: ${esc(h.orgPhone ?? h.org)}</p>`;
  return { subject, text, html };
}
