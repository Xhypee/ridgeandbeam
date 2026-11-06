// Material orders: suppliers, totals, and the formatted order (email / CSV). Pure.
import { round2 } from "./roof";

export const SUPPLIERS = ["ABC Supply", "SRS Distribution", "QXO (Beacon)", "Other"] as const;
export const ORDER_STATUSES = ["draft", "sent", "confirmed", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const RETURN_STATUSES = ["pending", "returned", "credited", "rejected"] as const;

export type OrderLine = { description: string; sku: string | null; quantity: number; unit: string; unit_cost: number };
export type OrderHeader = {
  supplier: string; branch: string | null; po_number: string | null; color: string | null;
  delivery_date: string | null; delivery_type: string; notes: string | null;
};

export const orderTotal = (items: { quantity: number; unit_cost: number }[]) =>
  round2(items.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)), 0));

/** Credit that actually comes back: credit minus restocking fee. */
export const netCredit = (r: { credit_amount: number; restocking_fee: number }) => round2(Math.max(0, (Number(r.credit_amount) || 0) - (Number(r.restocking_fee) || 0)));

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const csvCell = (s: unknown) => {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function orderCsv(h: OrderHeader & { job: string; address: string | null }, items: OrderLine[]) {
  const rows = [
    ["PO", h.po_number ?? ""], ["Supplier", h.supplier], ["Branch", h.branch ?? ""], ["Job", h.job], ["Ship to", h.address ?? ""],
    ["Delivery date", h.delivery_date ?? ""], ["Delivery", h.delivery_type === "ground_drop" ? "Ground drop" : "Roof load"], ["Color", h.color ?? ""],
    [], ["Line", "SKU", "Description", "Quantity", "Unit"],
    ...items.map((i, n) => [String(n + 1), i.sku ?? "", i.description, String(i.quantity), i.unit]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Branch-facing order (quantities only — the branch prices it). */
export function orderEmail(h: OrderHeader & { job: string; address: string | null; org: string; orgPhone: string | null }, items: OrderLine[]) {
  const subject = `Material order${h.po_number ? ` PO ${h.po_number}` : ""} — ${h.org} — deliver ${h.delivery_date ?? "TBD"}`;
  const lines = items.map((i, n) => `${n + 1}. ${i.quantity} ${i.unit} — ${i.description}${i.sku ? ` (SKU ${i.sku})` : ""}`);
  const text = [
    `${h.org} material order`, `PO: ${h.po_number ?? "—"}`, `Branch: ${h.branch ?? "—"}`, `Ship to: ${h.address ?? "—"} (${h.job})`,
    `Delivery date: ${h.delivery_date ?? "TBD"} · ${h.delivery_type === "ground_drop" ? "GROUND DROP" : "ROOF LOAD"}`, `Color: ${h.color ?? "—"}`,
    "", ...lines, "", h.notes ? `Notes: ${h.notes}` : "", `Questions: ${h.orgPhone ?? h.org}`,
  ].filter((l) => l !== undefined).join("\n");
  const html = `<h2>${esc(h.org)} — material order</h2>
<table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
<tr><td><b>PO</b></td><td>${esc(h.po_number ?? "—")}</td></tr>
<tr><td><b>Branch</b></td><td>${esc(h.branch ?? "—")}</td></tr>
<tr><td><b>Ship to</b></td><td>${esc(h.address ?? "—")} (${esc(h.job)})</td></tr>
<tr><td><b>Delivery</b></td><td>${esc(h.delivery_date ?? "TBD")} · <b>${h.delivery_type === "ground_drop" ? "GROUND DROP" : "ROOF LOAD"}</b></td></tr>
<tr><td><b>Color</b></td><td>${esc(h.color ?? "—")}</td></tr>
</table>
<table border="1" cellpadding="6" style="border-collapse:collapse;margin-top:12px;font-family:sans-serif;font-size:14px">
<tr><th>#</th><th>Qty</th><th>Unit</th><th>Description</th><th>SKU</th></tr>
${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.quantity)}</td><td>${esc(i.unit)}</td><td>${esc(i.description)}</td><td>${esc(i.sku ?? "")}</td></tr>`).join("\n")}
</table>
${h.notes ? `<p><b>Notes:</b> ${esc(h.notes)}</p>` : ""}
<p>Questions: ${esc(h.orgPhone ?? h.org)}</p>`;
  return { subject, text, html };
}
