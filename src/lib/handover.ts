// The handover pack the customer gets when the job's done: a short email with your workmanship warranty
// certificate (PDF) and the job's photos, plus the manufacturer's warranty product if it's on the job.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type HandoverDoc = {
  org: { name: string; phone: string | null; email: string | null; abn: string | null; licence: string | null };
  customer: { name: string };
  site: string | null;
  job: { title: string; completedOn: string | null; quoteNo: number | null };
  workmanshipYears: number;
  product: string | null;
  photoCount: number;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, (c) => ({ "·": "-", "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"' })[c] ?? "");
export const longDate = (iso: string | null) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null);
export function warrantyEnds(completedOn: string | null, years: number): string | null {
  if (!completedOn) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(completedOn) ? `${completedOn}T12:00:00` : completedOn);
  d.setFullYear(d.getFullYear() + years);
  return longDate(d.toISOString());
}

export function handoverEmail(d: HandoverDoc) {
  const first = d.customer.name.trim().split(/\s+/)[0] || "there";
  const ends = warrantyEnds(d.job.completedOn, d.workmanshipYears);
  const lines = [
    d.workmanshipYears > 0 ? `Your ${d.workmanshipYears}-year workmanship warranty certificate (attached)${ends ? `, covering our work until ${ends}` : ""}.` : null,
    d.product ? `The manufacturer's warranty on your ${d.product}.` : null,
    d.photoCount > 0 ? `${d.photoCount} photo${d.photoCount === 1 ? "" : "s"} of the job (attached).` : null,
  ].filter((x): x is string => Boolean(x));
  const subject = `Your new roof: warranty & photos · ${d.org.name}`;
  const text = [`Hi ${first},`, "", `Thanks for choosing ${d.org.name}. Your roof at ${d.site ?? "your place"} is finished. Here's your handover pack:`, ...lines.map((l) => `- ${l}`), "", "Keep this email with your house papers.", "", `Thanks,`, d.org.name, d.org.phone ?? ""].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#eef0ea;padding:24px 12px;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#13221a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e3e6df">
<div style="background:#1f5f3f;color:#fff;padding:16px 22px;font-weight:700;font-size:17px">${esc(d.org.name)}</div>
<div style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 14px">Thanks for choosing ${esc(d.org.name)}. Your roof at ${esc(d.site ?? "your place")} is finished. Here's your handover pack:</p>
<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}</ul>
<p style="margin:0 0 12px;font-size:13px;color:#475569">Keep this email with your house papers. If anything needs looking at, just reply or call us.</p>
<p style="margin:0">Thanks,<br>${esc(d.org.name)}${d.org.phone ? `<br>${esc(d.org.phone)}` : ""}</p>
</div></div></body></html>`;
  return { subject, html, text };
}

/** The workmanship warranty certificate (one page). */
export async function workmanshipPdf(d: HandoverDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.075, 0.133, 0.102), brand = rgb(0.122, 0.373, 0.247), grey = rgb(0.4, 0.45, 0.5);
  doc.setTitle(`Workmanship warranty - ${d.customer.name}`); doc.setAuthor(d.org.name);
  page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: brand });
  page.drawText(safe(d.org.name), { x: 40, y: 800, size: 20, font: b, color: rgb(1, 1, 1) });
  page.drawText(safe([d.org.abn ? `ABN ${d.org.abn}` : null, d.org.licence ? `Licence ${d.org.licence}` : null, d.org.phone].filter(Boolean).join("  |  ")), { x: 40, y: 780, size: 9, font: f, color: rgb(0.85, 0.92, 0.88) });
  page.drawText("WORKMANSHIP WARRANTY", { x: 40, y: 712, size: 22, font: b, color: ink });
  page.drawText(safe(`${d.workmanshipYears} years`), { x: 40, y: 686, size: 14, font: b, color: brand });
  let y = 640;
  const row = (k: string, v: string | null) => { if (!v) return; page.drawText(k, { x: 40, y, size: 10, font: f, color: grey }); page.drawText(safe(v).slice(0, 70), { x: 170, y, size: 11, font: b, color: ink }); y -= 24; };
  row("Issued to", d.customer.name);
  row("Property", d.site);
  row("Work", d.job.title);
  row("Quote", d.job.quoteNo ? `#${d.job.quoteNo}` : null);
  row("Completed", longDate(d.job.completedOn));
  row("Covered until", warrantyEnds(d.job.completedOn, d.workmanshipYears));
  row("Materials", d.product);
  y -= 10;
  const para = [
    `${d.org.name} warrants the workmanship of the roofing work above for ${d.workmanshipYears} years from completion.`,
    "If a defect in our workmanship shows up in that time, contact us and we'll inspect it and fix it at no cost.",
    "This warranty is in addition to your rights under the Australian Consumer Law and your state's home building laws.",
    "Materials are covered by the manufacturer's own warranty. It doesn't cover storm damage, alterations by others or lack of maintenance.",
  ];
  for (const p of para) {
    const words = safe(p).split(" "); let lineText = "";
    for (const w of words) {
      if (f.widthOfTextAtSize(`${lineText} ${w}`, 10.5) > 515) { page.drawText(lineText, { x: 40, y, size: 10.5, font: f, color: ink }); y -= 15; lineText = w; }
      else lineText = lineText ? `${lineText} ${w}` : w;
    }
    page.drawText(lineText, { x: 40, y, size: 10.5, font: f, color: ink }); y -= 22;
  }
  page.drawText(safe(`${d.org.name}${d.org.phone ? `  |  ${d.org.phone}` : ""}${d.org.email ? `  |  ${d.org.email}` : ""}`), { x: 40, y: 40, size: 9, font: f, color: grey });
  return doc.save();
}
