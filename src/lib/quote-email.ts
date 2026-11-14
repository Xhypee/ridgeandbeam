// The quote email ("Statement" design): one big honest number, then everything that backs it up.
// The email IS the quote: business + licence + ABN, customer + site, scope, itemised prices, GST, a single
// total inc GST as the biggest figure, payment terms within the state's deposit limit, the state's notices
// (cooling-off, home warranty, etc. from the rules engine) and how to accept. Email-safe HTML: tables + inline styles.
// data-rb="who|job|price|payment|terms" mark the sections the quoting engine's preview lights up (ignored by mail apps).
import { formatAbn } from "./au";
import { licenceFor } from "./business";
import { buildProposal, type PublicEstimate } from "@/app/q/[token]/model";
import { capFirstPayment, splitByWeights, type PayMethod } from "./pay-plan";

const G = "#1f5f3f", INK = "#13221a", CREAM = "#fbfaf5", MUTED = "#5b6b62", LINE = "#e3e6df", MINT = "#8fd0a8", SOFT = "#e7f1ea", FAINT = "#8a968f", BG = "#eef0ea";
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const DISPLAY = "'Space Grotesk', Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export type ScheduleStep = { label: string; pct: number; trigger: string };
export type QuoteEmailInput = {
  doc: PublicEstimate;
  /** The customer's quote page (view, choose extras, sign). */
  url: string;
  /** Absolute URL of the 64×64 brand mark PNG. */
  logoUrl: string;
  sender: { name: string; phone: string | null };
  payMethods: PayMethod[];
  /** The company's usual payment milestones (organizations.payment_schedule). */
  schedule: ScheduleStep[];
  /** Legal deposit limit in dollars for this contract, or null when the state sets none. */
  depositCap: number | null;
  /** Optional personal note, one paragraph per line. */
  message?: string | null;
  now?: Date;
};
export type QuoteEmail = { subject: string; html: string; text: string; total: number; validUntil: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const day = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" });
const UNIT: Record<string, string> = { m2: "m²", lm: "m", ea: "", each: "", job: "job", item: "" };
const qty = (q: number, u: string) => {
  const unit = UNIT[u] ?? u;
  const n = Number.isInteger(q) ? String(q) : q.toLocaleString("en-AU", { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
};
/** 0413881009 → 0413 881 009; 0733334444 → 07 3333 4444; anything else as typed. */
export function auPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "").replace(/^61/, "0");
  if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return p.trim();
}
/** "4/27 Kingston Rd, Underwood QLD 4119" + QLD + 4119 → unchanged (no doubled state/postcode). */
function fullAddress(addr: string | null, state: string | null, postcode: string | null) {
  const a = (addr ?? "").trim();
  const tail = [state, postcode].filter((x) => x && !new RegExp(`\\b${x}\\b`).test(a)).join(" ");
  return [a, tail].filter(Boolean).join(" ");
}
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "•";

/** "This quote is valid for 30 days…" → 30 (default 30). */
export function validDays(terms: string | null | undefined): number {
  const m = /valid\s+for\s+(\d{1,3})\s+days?/i.exec(terms ?? "");
  return m ? Math.min(365, Math.max(1, Number(m[1]))) : 30;
}

/** How payment splits for this price: the company's schedule, first payment held to the deposit limit. */
export function paymentParts(total: number, schedule: ScheduleStep[], depositCap: number | null) {
  const steps = schedule.length ? schedule : [{ label: "On completion", pct: 100, trigger: "completed" }];
  const amounts = splitByWeights(total, steps.map((s) => s.pct));
  const parts = steps.map((s, i) => ({ label: s.label, trigger: (["signed", "delivered", "completed", "date"].includes(s.trigger) ? s.trigger : "completed") as "signed" | "delivered" | "completed" | "date", amount: amounts[i], due_date: null }));
  return capFirstPayment(parts, depositCap).parts.filter((p) => p.amount > 0);
}

const WHEN: Record<string, string> = { signed: "when you accept", delivered: "when materials are delivered", completed: "when the job is finished", date: "on the agreed date" };
export function waysToPayText(methods: PayMethod[]): string {
  const w = [methods.includes("bank") && "bank transfer or PayID", methods.includes("card") && "card", methods.includes("cash") && "cash"].filter(Boolean) as string[];
  if (!w.length) return "Bank transfer";
  return w.length === 1 ? cap(w[0]) : cap(`${w.slice(0, -1).join(", ")} or ${w.at(-1)}`);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildQuoteEmail(input: QuoteEmailInput): QuoteEmail {
  const { doc } = input;
  const now = input.now ?? new Date();
  const p = buildProposal(doc);
  const chosen = p.options.find((o) => o.id === p.effective) ?? null;
  const total = chosen ? chosen.total : p.totals.total;
  const gst = chosen ? chosen.gst : p.totals.gst;
  const exGst = Math.round((total - gst) * 100) / 100;
  const discount = p.totals.discount;
  const issued = doc.sent_at ? new Date(doc.sent_at) : now;
  const valid = new Date(issued.getTime() + validDays(doc.terms) * 86400000);
  const validUntil = day(valid);
  const first = firstName(doc.customer.name);
  const title = doc.job.title || "Your roof";
  const site = doc.job.site_address || [doc.customer.street, doc.customer.suburb, [doc.customer.state, doc.customer.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const lic = licenceFor(doc.org.licence && p.state ? { [p.state]: doc.org.licence } : null, p.state);
  const abn = doc.org.abn ? `ABN ${formatAbn(doc.org.abn)}` : null;
  const inclusive = Boolean(doc.gst_inclusive);
  const gstOn = Number(doc.tax_rate) > 0;
  const lines = (chosen ? [...p.shared, ...chosen.items] : doc.items.filter((i) => i.extra_status !== "offered" && !i.option_id))
    .filter((i) => !i.customer_removed)
    .map((i) => ({ d: i.description, q: qty(Number(i.quantity), i.unit), a: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100, blurb: i.blurb ?? null }));
  const extras = p.offered.map((i) => ({ d: i.description, a: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100 }));
  const parts = paymentParts(total, input.schedule, input.depositCap);
  const upFront = parts.filter((x) => x.trigger === "signed").reduce((a, x) => a + x.amount, 0);
  const ways = waysToPayText(input.payMethods);
  const cardNote = input.payMethods.includes("card") ? " No card surcharge." : "";
  const paymentText = parts.length === 1
    ? `${aud(parts[0].amount)} ${WHEN[parts[0].trigger]}. ${ways}.${cardNote}`
    : `${parts.map((x) => `${x.label}: ${aud(x.amount)} ${WHEN[x.trigger]}`).join(". ")}. ${ways}.${cardNote}`;
  const depositNote = input.depositCap !== null && upFront > 0 ? ` The deposit is within the ${aud(input.depositCap)} legal limit for this job.` : "";

  const subject = `Quote ${doc.number}: ${title} · ${aud(total)} inc GST`;
  const terms: [string, string][] = [
    ["Price", `${aud(total)} fixed price${gstOn ? `, including GST of ${aud(gst)}` : ""}. It only changes if you agree in writing to extra work.`],
    ["Payment", paymentText + depositNote],
    ["Changes", "Any extra work is agreed with you in writing, with a price, before we do it."],
    ...(doc.terms?.trim() ? [["Terms", doc.terms.trim()] as [string, string]] : []),
  ];
  const plainNotices = p.notices.filter((n) => !n.conspicuous);
  const boxedNotices = p.notices.filter((n) => n.conspicuous);
  const tiles: [string, string][] = [...terms, ...plainNotices.map((n) => [n.title, n.text] as [string, string])];

  // ---------- HTML ----------
  const td = (style: string, html: string, attrs = "") => `<td ${attrs} style="${style}">${html}</td>`;
  const capStyle = (color = FAINT) => `font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${color}`;
  const msg = (input.message ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const hero = `
<tr><td style="background:${G};padding:28px 36px 32px;border-radius:24px 24px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;vertical-align:middle"><img src="${esc(input.logoUrl)}" width="30" height="30" alt="" style="display:block;border:0;border-radius:8px"></td>
      <td style="vertical-align:middle;font-family:${DISPLAY};font-size:18px;font-weight:700;line-height:1.1;color:#ffffff">${esc(doc.org.name)}${lic ? `<br><span style="font-family:${SANS};font-size:11px;font-weight:500;color:rgba(255,255,255,.65)">Licence ${esc(lic.number)}</span>` : ""}</td>
    </tr></table></td>
    <td align="right" style="vertical-align:middle;${capStyle(MINT)}">Quote ${doc.number}</td>
  </tr></table>
  <p style="margin:30px 0 0;font-family:${SANS};font-size:16px;color:rgba(255,255,255,.82)">Hi ${esc(first)}, your ${esc(title.toLowerCase())} comes to</p>
  <p style="margin:4px 0 0;font-family:${DISPLAY};font-size:64px;line-height:1;font-weight:700;letter-spacing:-.03em;color:#ffffff">${aud(total)}</p>
  <p style="margin:12px 0 0;font-family:${SANS};font-size:14px;color:${MINT}">Fixed price${gstOn ? ` · includes GST of ${aud(gst)}` : ""} · valid until ${validUntil}</p>
</td></tr>`;

  const facts: [string, string, string][] = [
    parts.length === 1
      ? ["Payment", "In full", WHEN[parts[0].trigger] ?? "when the job is finished"]
      : ["Deposit", upFront > 0 ? aud(upFront) : "$0", upFront > 0 ? "when you accept" : "pay when it's done"],
    ["Valid until", day(valid).replace(/ \d{4}$/, ""), String(valid.getFullYear())],
    ["Pay by", input.payMethods.length ? input.payMethods.map((m) => (m === "bank" ? "PayID" : cap(m))).join(" · ") : "Bank", input.payMethods.includes("card") ? "no card surcharge" : "details on the quote"],
  ];
  const strip = `
<tr><td style="background:${INK};padding:0">
  <table data-rb="payment" role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  ${facts.map(([k, v, s], i) => td(`width:33%;padding:16px 20px;${i ? "border-left:1px solid #2b3a31;" : ""}vertical-align:top`,
    `<div style="${capStyle(MINT)}">${k}</div><div style="margin-top:4px;font-family:${DISPLAY};font-size:21px;font-weight:700;color:#ffffff">${esc(v)}</div><div style="font-family:${SANS};font-size:12px;color:rgba(255,255,255,.55)">${esc(s)}</div>`)).join("")}
  </tr></table>
</td></tr>`;

  const tick = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" style="width:26px;height:26px;border-radius:13px;background:${SOFT};color:${G};font-family:${SANS};font-size:14px;font-weight:700;line-height:26px">&#10003;</td></tr></table>`;
  const lineRows = lines.map((l) => `
    <tr>
      <td width="40" style="padding:13px 0 13px 16px;border-bottom:1px solid ${LINE};vertical-align:middle">${tick}</td>
      <td style="padding:13px 12px;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14.5px;font-weight:600;color:${INK}">${esc(l.d)}<div style="font-size:12px;font-weight:400;color:${FAINT}">${esc(l.q)}</div></td>
      <td align="right" style="padding:13px 16px 13px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14.5px;color:${INK};white-space:nowrap">${aud(l.a)}</td>
    </tr>`).join("");
  const sumBits = [inclusive ? null : `Subtotal ${aud(exGst + 0)}`, discount > 0 ? `Discount −${aud(discount)}` : null, gstOn ? `${inclusive ? "Includes " : "+ "}GST ${aud(gst)}` : "No GST charged"].filter(Boolean).join(" · ");
  const items = `
  <table data-rb="price" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border:1px solid ${LINE};border-radius:16px;border-collapse:separate;overflow:hidden">
    ${lineRows}
    <tr><td colspan="2" style="padding:12px 16px;background:${CREAM};font-family:${SANS};font-size:13px;color:${MUTED}">${esc(sumBits)}</td>
        <td align="right" style="padding:12px 16px;background:${CREAM};font-family:${DISPLAY};font-size:18px;font-weight:700;color:${INK};white-space:nowrap">${aud(total)}</td></tr>
  </table>
  ${inclusive ? "" : `<p style="margin:6px 0 0;font-family:${SANS};font-size:11px;color:${FAINT}">Line prices exclude GST.</p>`}`;

  const optionsBlock = p.options.length > 1 ? `
  <p style="margin:24px 0 0;${capStyle()}">Your ${doc.option_label === "alternates" ? "alternates" : "options"}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
    ${p.options.map((o) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${INK}"><b>${esc(o.name)}</b>${o.id === p.effective ? ` <span style="font-size:11px;font-weight:700;color:${G}">· shown above</span>` : ""}${o.warranty ? `<div style="font-size:12px;color:${FAINT}">${esc(o.warranty)}</div>` : ""}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${DISPLAY};font-size:15px;font-weight:700;color:${INK};white-space:nowrap">${aud(o.total)}</td></tr>`).join("")}
  </table>
  <p style="margin:6px 0 0;font-family:${SANS};font-size:12px;color:${FAINT}">Pick the one you want when you accept.</p>` : "";

  const extrasBlock = extras.length ? `
  <p style="margin:22px 0 0;${capStyle()}">Optional extras, add them online</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">
    ${extras.map((e) => `<tr><td style="padding:7px 0;border-bottom:1px dashed ${LINE};font-family:${SANS};font-size:13.5px;color:${MUTED}">+ ${esc(e.d)}</td><td align="right" style="padding:7px 0;border-bottom:1px dashed ${LINE};font-family:${SANS};font-size:13.5px;color:${MUTED};white-space:nowrap">${aud(e.a)}</td></tr>`).join("")}
  </table>
  <p style="margin:6px 0 0;font-family:${SANS};font-size:12px;color:${FAINT}">Not included in the price above unless you add them.</p>` : "";

  const body = `
<tr><td style="padding:26px 36px 0;background:#ffffff">
  <table data-rb="who" role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${SANS};font-size:13px;color:${MUTED}"><b style="color:${INK}">For</b> ${esc(doc.customer.name)}${site ? ` · ${esc(site)}` : ""}</td>
    <td align="right" style="font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap">Issued ${day(issued)}</td>
  </tr></table>
  ${msg.map((m, i) => `<p style="margin:${i ? 10 : 18}px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK}">${esc(m)}</p>`).join("")}
  ${doc.notes?.trim() ? `<div data-rb="job"><p style="margin:18px 0 0;${capStyle()}">What we'll do</p><p style="margin:6px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK}">${br(doc.notes.trim())}</p></div>` : ""}
  ${items}
  ${optionsBlock}
  ${extrasBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr>
    <td align="center" style="background:${INK};border-radius:12px"><a href="${esc(input.url)}" style="display:block;padding:17px 20px;font-family:${SANS};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">View &amp; accept your quote</a></td>
  </tr></table>
  <p style="margin:10px 0 0;text-align:center;font-family:${SANS};font-size:12px;line-height:1.5;color:${FAINT}">Accepting online makes a contract on these terms. You can also just reply to this email with questions.</p>
</td></tr>`;

  const tileRows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    const cell = (t?: [string, string]) => t
      ? `<td width="50%" style="width:50%;padding:5px;vertical-align:top"><div style="background:${CREAM};border:1px solid ${LINE};border-radius:14px;padding:14px 16px"><div style="font-family:${DISPLAY};font-size:14px;font-weight:700;color:${INK}">${esc(t[0])}</div><div style="margin-top:4px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${MUTED}">${br(t[1])}</div></div></td>`
      : `<td width="50%" style="width:50%;padding:5px"></td>`;
    tileRows.push(`<tr>${cell(tiles[i])}${cell(tiles[i + 1])}</tr>`);
  }
  const boxed = boxedNotices.map((n) => `
  <div style="margin-top:12px;border:2px solid ${INK};border-radius:14px;padding:16px 18px">
    <div style="font-family:${DISPLAY};font-size:15px;font-weight:700;color:${INK}">${esc(n.title)}</div>
    <div style="margin-top:6px;font-family:${SANS};font-size:13px;line-height:1.55;color:${INK}">${br(n.text)}</div>
  </div>`).join("");
  const fine = `
<tr><td data-rb="terms" style="padding:28px 31px 0;background:#ffffff">
  <p style="margin:0 5px;${capStyle()}">The fine print, in plain English</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px">${tileRows.join("")}</table>
  <div style="margin:0 5px">${boxed}</div>
</td></tr>`;

  const bizLines = [abn, lic ? `Licence ${lic.number}${lic.classes ? ` (${lic.classes})` : ""}` : null, fullAddress(doc.org.address, doc.org.state, doc.org.postcode), [auPhone(doc.org.phone), doc.org.email].filter(Boolean).join(" · ")].filter(Boolean) as string[];
  const footer = `
<tr><td style="padding:22px 36px 26px;background:#ffffff;border-top:1px solid ${LINE};border-radius:0 0 24px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px"><tr>
    <td style="vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="42" height="42" align="center" style="width:42px;height:42px;border-radius:21px;background:${G};font-family:${DISPLAY};font-size:15px;font-weight:700;color:#ffffff;line-height:42px">${esc(initials(input.sender.name))}</td>
      <td style="padding-left:12px;font-family:${SANS};font-size:14px;line-height:1.35;color:${INK}"><b>${esc(input.sender.name)}</b><br><span style="color:${MUTED}">${esc([doc.org.name, auPhone(input.sender.phone ?? doc.org.phone)].filter(Boolean).join(" · "))}</span></td>
    </tr></table></td>
    <td align="right" style="vertical-align:middle;font-family:${SANS};font-size:11px;line-height:1.6;color:${FAINT}">${bizLines.map(esc).join("<br>")}</td>
  </tr></table>
</td></tr>`;

  const preheader = `${aud(total)} inc GST for ${title.toLowerCase()} at ${site || "your place"}. Valid until ${validUntil}.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:24px">
${hero}${strip}${body}${fine}${footer}
</table>
<p style="margin:16px 0 0;font-family:${SANS};font-size:11px;color:${FAINT}">Sent by ${esc(doc.org.name)} with Ridge &amp; Beam.</p>
</td></tr></table></body></html>`;

  // ---------- plain text ----------
  const text = [
    `Hi ${first},`,
    ...msg,
    `Your quote ${doc.number} for ${title} comes to ${aud(total)}${gstOn ? ` (includes GST of ${aud(gst)})` : ""}. Fixed price, valid until ${validUntil}.`,
    `View and accept it here: ${input.url}`,
    "",
    doc.notes?.trim() ? `What we'll do:\n${doc.notes.trim()}\n` : "",
    ...lines.map((l) => `- ${l.d} (${l.q}): ${aud(l.a)}`),
    `Total: ${aud(total)}${gstOn ? ` inc GST (GST ${aud(gst)})` : ""}`,
    "",
    ...tiles.map(([k, v]) => `${k}: ${v}`),
    ...boxedNotices.map((n) => `${n.title.toUpperCase()}: ${n.text}`),
    "",
    `${input.sender.name}, ${doc.org.name}`,
    ...bizLines,
  ].filter((x) => x !== "").join("\n");

  return { subject, html, text, total, validUntil };
}
