// "Remind": a short check-in about a sent quote, by email and text, with the quote link. Previewed before it goes.
export type RemindDoc = {
  org: { name: string; phone: string | null };
  sender: { name: string; phone: string | null };
  customer: { name: string };
  quote: { number: number; total: number; validUntil: string | null; url: string; title: string | null };
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

/** Quote valid-until date: sent date + the days in its terms (or 30). */
export function validUntil(sentAt: string | null, days: number): string | null {
  if (!sentAt) return null;
  const d = new Date(sentAt);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Whole days from `today` to `until` (negative when it's passed). */
export function daysLeft(until: string | null, today: string): number | null {
  if (!until) return null;
  return Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function quoteReminder(d: RemindDoc) {
  const first = d.customer.name.trim().split(/\s+/)[0] || "there";
  const me = d.sender.name.split(" ")[0] || d.org.name;
  const raw = d.sender.phone ?? d.org.phone;
  const digits = raw?.replace(/\D/g, "").replace(/^61/, "0") ?? "";
  const phone = /^04\d{8}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : /^0\d{9}$/.test(digits) ? `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}` : raw;
  const good = d.quote.validUntil ? `, and the price is good until ${longDay(d.quote.validUntil)}` : "";
  const lead = `Just checking in on your roof quote (${aud(d.quote.total)})${good}.`;
  const ask = `Happy to answer any questions or come back out${phone ? `: call or text me on ${phone}` : ""}.`;
  const subject = `Your roof quote · ${d.org.name}`;
  const sms = `Hi ${first}, it's ${me} from ${d.org.name}. ${lead} Here it is again: ${d.quote.url}${phone ? ` Any questions, just call ${phone}.` : ""}`;
  const text = [`Hi ${first},`, "", lead, `You can see it, pick options and sign here: ${d.quote.url}`, "", ask, "", "Thanks,", me, d.org.name].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#eef0ea;padding:24px 12px;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#13221a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e3e6df">
<div style="background:#1f5f3f;color:#fff;padding:16px 22px;font-weight:700;font-size:17px">${esc(d.org.name)}</div>
<div style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 16px">${esc(lead)}</p>
<div style="background:#fbfaf5;border:1px solid #e3e6df;border-radius:14px;padding:14px 16px;margin:0 0 16px">
<div style="font-size:12px;color:#64748b">Quote #${d.quote.number}${d.quote.title ? ` · ${esc(d.quote.title)}` : ""}</div>
<div style="font-size:28px;font-weight:700;margin-top:4px">${esc(aud(d.quote.total))}</div>
${d.quote.validUntil ? `<div style="font-size:12px;color:#64748b;margin-top:2px">inc GST · good until ${esc(longDay(d.quote.validUntil))}</div>` : ""}
</div>
<p style="margin:0 0 16px"><a href="${d.quote.url}" style="display:block;text-align:center;background:#1f5f3f;color:#fff;padding:13px 18px;border-radius:12px;text-decoration:none;font-weight:600">See your quote</a></p>
<p style="margin:0 0 12px">${esc(ask)}</p>
<p style="margin:0">Thanks,<br>${esc(me)}<br>${esc(d.org.name)}</p>
</div></div></body></html>`;
  return { subject, html, text, sms };
}
