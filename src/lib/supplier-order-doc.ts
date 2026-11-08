// What a supplier gets for one material order: a branded email (no prices: the supplier prices it to the
// account), an order PDF, and, when switched on, a roof report PDF. Pure functions so they can be previewed
// and tested; the plans themselves are the job's own files, attached by the server.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type OrderLineDoc = { description: string; spec: string | null; sku: string | null; quantity: number; unit: string; length_m: number | null; group_label?: string | null };
export type SupplierOrderDoc = {
  code: string;
  supplier: string;
  branch: string | null;
  account: string | null;
  org: { name: string; phone: string | null; email: string | null; abn: string | null };
  sender: string;
  job: { customer: string; title: string; address: string | null };
  delivery: { date: string | null; time: string | null; type: string; contact: string | null; notes: string | null };
  confirmUrl: string;
  logoUrl: string;
  attachNames: string[];
  withPlans: boolean;
  items: OrderLineDoc[];
};

const G = "#1f5f3f", INK = "#13221a", CREAM = "#fbfaf5", MUTED = "#5b6b62", LINE = "#e3e6df", MINT = "#8fd0a8";
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** "1004-STE": the quote number and the supplier's first three letters (Steeline and Stratco stay apart). */
export const orderCode = (quoteNo: number | null, supplier: string) => `${quoteNo ?? "JOB"}-${supplier.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SUP"}`;
export const DELIVERY_LABEL: Record<string, string> = { roof_load: "Roof load", ground_drop: "Ground drop", crane: "Truck with crane", pickup: "We'll pick up" };
const UNIT: Record<string, string> = { lm: "m", m2: "m²", ea: "ea", sheet: "sheets", sheets: "sheets", box: "boxes", roll: "rolls", length: "lengths" };
export const unitText = (u: string) => UNIT[u] ?? u;
export function deliveryWhen(date: string | null, time: string | null) {
  if (!date) return "To be confirmed";
  const d = new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  return time ? `${d}, ${time}` : d;
}
export const qtyText = (l: Pick<OrderLineDoc, "quantity" | "unit" | "length_m">) =>
  l.length_m ? `${trim(l.quantity)} × ${l.length_m.toFixed(2)} m` : `${trim(l.quantity)} ${unitText(l.unit)}`;
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("en-AU", { maximumFractionDigits: 2 }));

export function supplierOrderEmail(d: SupplierOrderDoc) {
  const when = deliveryWhen(d.delivery.date, d.delivery.time);
  const hi = `${d.supplier.split(/[\s(]/)[0]} team`;
  const subject = `Order ${d.code} · ${d.org.name} · deliver ${when} · ${d.items.length} item${d.items.length === 1 ? "" : "s"}`;
  const facts: [string, string][] = [
    ["Deliver to", d.job.address ?? "To be confirmed"], ["When", when], ["Delivery", DELIVERY_LABEL[d.delivery.type] ?? d.delivery.type],
    ...(d.delivery.contact ? [["On site", d.delivery.contact] as [string, string]] : []),
  ];
  const rows = d.items.map((i) => `<tr>
    <td style="padding:9px 8px 9px 0;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK}"><b style="font-weight:600">${esc(i.description)}</b>${i.spec ? `<div style="font-size:12px;color:${MUTED}">${esc(i.spec)}</div>` : ""}${i.sku ? `<div style="font-size:11px;color:${MUTED}">Code ${esc(i.sku)}</div>` : ""}</td>
    <td align="right" style="padding:9px 0;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${INK};white-space:nowrap">${esc(trim(i.quantity))}</td>
    <td style="padding:9px 0 9px 10px;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap">${i.length_m ? `× ${i.length_m.toFixed(2)} m` : esc(unitText(i.unit))}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0ea">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0ea"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:${G};padding:16px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><img src="${esc(d.logoUrl)}" width="28" height="28" alt="" style="vertical-align:middle;border:0;border-radius:7px"> <span style="vertical-align:middle;font-family:${SANS};font-size:18px;font-weight:700;color:#ffffff">&nbsp;${esc(d.org.name)}</span></td>
    <td align="right" style="font-family:${SANS};font-size:11px;line-height:1.4;color:${MINT}">ORDER ${esc(d.code)}<br>${d.account ? `ACCOUNT ${esc(d.account)}` : "ACCOUNT ON FILE"}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:22px 24px 6px;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK}">
  <p style="margin:0">Hi ${esc(hi)},</p>
  <p style="margin:8px 0 0">Please supply the items below for delivery on <b>${esc(when)}</b>.${d.withPlans ? " The plans and our roof report are attached for the cut lengths." : ""}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:${CREAM};border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:12px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${facts.map(([k, v], n) => `${n % 2 === 0 ? "<tr>" : ""}<td width="50%" style="padding:4px 8px 4px 0;vertical-align:top;font-family:${SANS};font-size:13px;color:${INK}"><div style="font-size:11px;color:${MUTED}">${esc(k)}</div>${esc(v)}</td>${n % 2 === 1 || n === facts.length - 1 ? "</tr>" : ""}`).join("")}
      ${d.delivery.notes ? `<tr><td colspan="2" style="padding:6px 0 0;font-family:${SANS};font-size:13px;color:${INK}"><div style="font-size:11px;color:${MUTED}">Driver notes</div>${esc(d.delivery.notes)}</td></tr>` : ""}
    </table>
  </td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
    <tr><td style="font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a968f;padding-bottom:6px">Item</td><td align="right" style="font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a968f;padding-bottom:6px">Qty</td><td style="font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a968f;padding:0 0 6px 10px">Length</td></tr>
    ${rows}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td align="center" style="background:${INK};border-radius:12px"><a href="${esc(d.confirmUrl)}" style="display:block;padding:14px 18px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Confirm order &amp; delivery</a></td></tr></table>
  <p style="margin:6px 0 0;text-align:center;font-size:11px;color:${MUTED}">One tap, no login. Or reply to this email.</p>
  <p style="margin:18px 0 16px">Thanks,<br><b>${esc(d.sender)}</b> · ${esc(d.org.name)}${d.org.phone ? ` · ${esc(d.org.phone)}` : ""}</p>
</td></tr>
${d.attachNames.length ? `<tr><td style="padding:12px 24px 16px;border-top:1px solid ${LINE};font-family:${SANS};font-size:11px;color:${MUTED}"><b style="color:${INK}">${d.attachNames.length} attachment${d.attachNames.length === 1 ? "" : "s"}:</b> ${d.attachNames.map(esc).join(" · ")}</td></tr>` : ""}
</table>
<p style="margin:14px 0 0;font-family:${SANS};font-size:11px;color:#8a968f">${esc(d.org.name)}${d.org.abn ? ` · ABN ${esc(d.org.abn)}` : ""}${d.org.email ? ` · ${esc(d.org.email)}` : ""}</p>
</td></tr></table></body></html>`;
  const text = [
    `Hi ${hi},`, "", `Please supply the items below for delivery on ${when}.${d.withPlans ? " The plans and our roof report are attached." : ""}`, "",
    ...facts.map(([k, v]) => `${k}: ${v}`), ...(d.delivery.notes ? [`Driver notes: ${d.delivery.notes}`] : []), "",
    ...d.items.map((i, n) => `${n + 1}. ${qtyText(i)} · ${i.description}${i.spec ? ` (${i.spec})` : ""}${i.sku ? ` [${i.sku}]` : ""}`), "",
    `Confirm order & delivery: ${d.confirmUrl}`, "", `Thanks, ${d.sender} · ${d.org.name}${d.org.phone ? ` · ${d.org.phone}` : ""}`,
  ].join("\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------------------------------------
// PDFs (A4, Helvetica: plain text only, so non-Latin characters are swapped out).
// ---------------------------------------------------------------------------------------------------------
const safe = (s: unknown) => String(s ?? "").replace(/[×]/g, "x").replace(/[²]/g, "2").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
const GREEN = rgb(31 / 255, 95 / 255, 63 / 255), INK_C = rgb(19 / 255, 34 / 255, 26 / 255), GREY = rgb(91 / 255, 107 / 255, 98 / 255), RULE = rgb(227 / 255, 230 / 255, 223 / 255);

type Pen = { page: PDFPage; y: number; doc: PDFDocument; f: PDFFont; b: PDFFont };
function header(p: Pen, title: string, d: SupplierOrderDoc) {
  const { page } = p;
  page.drawRectangle({ x: 0, y: 842 - 64, width: 595, height: 64, color: GREEN });
  page.drawText(safe(d.org.name), { x: 40, y: 842 - 40, size: 18, font: p.b, color: rgb(1, 1, 1) });
  page.drawText(safe(title), { x: 595 - 40 - p.b.widthOfTextAtSize(safe(title), 11), y: 842 - 34, size: 11, font: p.b, color: rgb(0.56, 0.82, 0.66) });
  const sub = safe(`Order ${d.code}${d.account ? ` · Account ${d.account}` : ""}`);
  page.drawText(sub, { x: 595 - 40 - p.f.widthOfTextAtSize(sub, 9), y: 842 - 48, size: 9, font: p.f, color: rgb(0.56, 0.82, 0.66) });
  p.y = 842 - 92;
}
function line(p: Pen, label: string, value: string) {
  p.page.drawText(safe(label), { x: 40, y: p.y, size: 9, font: p.f, color: GREY });
  p.page.drawText(safe(value).slice(0, 95), { x: 140, y: p.y, size: 10, font: p.f, color: INK_C });
  p.y -= 16;
}
function newPage(p: Pen, d: SupplierOrderDoc, title: string) { p.page = p.doc.addPage([595, 842]); header(p, title, d); }

export async function supplierOrderPdf(d: SupplierOrderDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const p: Pen = { doc, page: doc.addPage([595, 842]), y: 0, f: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
  doc.setTitle(`Order ${d.code}`); doc.setAuthor(d.org.name);
  header(p, "MATERIAL ORDER", d);
  line(p, "To", [d.supplier, d.branch].filter(Boolean).join(" · "));
  line(p, "Job", `${d.job.customer} · ${d.job.title}`);
  line(p, "Deliver to", d.job.address ?? "To be confirmed");
  line(p, "When", deliveryWhen(d.delivery.date, d.delivery.time));
  line(p, "Delivery", DELIVERY_LABEL[d.delivery.type] ?? d.delivery.type);
  if (d.delivery.contact) line(p, "On site", d.delivery.contact);
  if (d.delivery.notes) line(p, "Driver notes", d.delivery.notes);
  p.y -= 10;
  const head = () => {
    for (const [t, x] of [["#", 40], ["ITEM", 62], ["CODE", 330], ["QTY", 420], ["LENGTH / UNIT", 465]] as [string, number][]) p.page.drawText(t, { x, y: p.y, size: 8, font: p.b, color: GREY });
    p.y -= 8; p.page.drawLine({ start: { x: 40, y: p.y }, end: { x: 555, y: p.y }, thickness: 0.8, color: RULE }); p.y -= 14;
  };
  head();
  d.items.forEach((i, n) => {
    if (p.y < 70) { newPage(p, d, "MATERIAL ORDER (CONT.)"); head(); }
    p.page.drawText(String(n + 1), { x: 40, y: p.y, size: 10, font: p.f, color: GREY });
    p.page.drawText(safe(i.description).slice(0, 48), { x: 62, y: p.y, size: 10, font: p.b, color: INK_C });
    if (i.sku) p.page.drawText(safe(i.sku).slice(0, 16), { x: 330, y: p.y, size: 9, font: p.f, color: GREY });
    p.page.drawText(trim(i.quantity), { x: 420, y: p.y, size: 10, font: p.f, color: INK_C });
    p.page.drawText(safe(i.length_m ? `x ${i.length_m.toFixed(2)} m` : unitText(i.unit)), { x: 465, y: p.y, size: 10, font: p.f, color: INK_C });
    if (i.spec) { p.y -= 12; p.page.drawText(safe(i.spec).slice(0, 70), { x: 62, y: p.y, size: 8.5, font: p.f, color: GREY }); }
    p.y -= 8; p.page.drawLine({ start: { x: 40, y: p.y }, end: { x: 555, y: p.y }, thickness: 0.5, color: RULE }); p.y -= 14;
  });
  p.y -= 6;
  p.page.drawText(safe(`Please price to our account. Confirm here: ${d.confirmUrl}`).slice(0, 110), { x: 40, y: Math.max(40, p.y), size: 8.5, font: p.f, color: GREY });
  p.page.drawText(safe(`${d.sender} · ${d.org.name}${d.org.phone ? ` · ${d.org.phone}` : ""}`), { x: 40, y: Math.max(28, p.y - 14), size: 8.5, font: p.f, color: GREY });
  return doc.save();
}

export type RoofReportDoc = { area: number; planArea: number; pitch: number; faces: number | null; lengths: [string, number, string][] };

/** Our roof report: the measured numbers and this supplier's cut list (the drawing stays in the app). */
export async function roofReportPdf(d: SupplierOrderDoc, r: RoofReportDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const p: Pen = { doc, page: doc.addPage([595, 842]), y: 0, f: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
  doc.setTitle(`Roof report · ${d.job.address ?? d.job.title}`); doc.setAuthor(d.org.name);
  header(p, "ROOF REPORT", d);
  p.page.drawText(safe(d.job.address ?? d.job.title), { x: 40, y: p.y, size: 14, font: p.b, color: INK_C }); p.y -= 30;
  p.page.drawText("ROOF AREA", { x: 40, y: p.y, size: 8, font: p.b, color: GREY }); p.y -= 26;
  p.page.drawText(`${r.area.toFixed(1)} m2`, { x: 40, y: p.y, size: 26, font: p.b, color: INK_C }); p.y -= 18;
  p.page.drawText(safe(`${r.planArea.toFixed(1)} m2 on plan · ${r.pitch.toFixed(1)} deg pitch${r.faces ? ` · ${r.faces} faces` : ""}`), { x: 40, y: p.y, size: 10, font: p.f, color: GREY }); p.y -= 28;
  for (const [k, v, u] of r.lengths) if (v > 0) line(p, k, `${v.toFixed(u ? 1 : 0)}${u ? ` ${u}` : ""}`);
  p.y -= 16;
  p.page.drawText("CUT LIST FOR THIS ORDER", { x: 40, y: p.y, size: 8, font: p.b, color: GREY }); p.y -= 18;
  for (const i of d.items.filter((x) => x.length_m)) {
    if (p.y < 60) newPage(p, d, "ROOF REPORT (CONT.)");
    line(p, qtyText(i), `${i.description}${i.spec ? ` · ${i.spec}` : ""}`);
  }
  return doc.save();
}
