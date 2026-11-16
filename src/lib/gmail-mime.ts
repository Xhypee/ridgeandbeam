// Pure helpers for Gmail: building the raw MIME email we send, and reading the messages we get back
// (addresses, the text body, and just the new part of a reply without the quoted history).

export type MimeAttachment = { filename: string; content: string /* base64 */; type?: string };
export type MimeEmail = {
  from: string; to: string; subject: string; html: string; text?: string; replyTo?: string | null;
  inReplyTo?: string | null; attachments?: MimeAttachment[];
};

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
/** RFC 2047 encoded-word for any header with non-ASCII text (names, subjects). */
export const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? clean(s) : `=?UTF-8?B?${b64(clean(s))}?=`);
const fromHeader = (from: string) => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m && m[1] ? `${encodeHeader(m[1])} <${clean(m[2])}>` : clean(from);
};
const typeOf = (name: string) => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", heic: "image/heic", csv: "text/csv", txt: "text/plain" } as Record<string, string>)[ext] ?? "application/octet-stream";
};
export const htmlToText = (html: string) =>
  html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|h\d|li)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

/** The whole email as RFC 822 text (Gmail's users.messages.send wants it base64url-encoded as `raw`). */
export function buildMime(e: MimeEmail, boundarySeed = Math.random().toString(36).slice(2)): string {
  const mixed = `mixed_${boundarySeed}`;
  const alt = `alt_${boundarySeed}`;
  const head = [
    `From: ${fromHeader(e.from)}`, `To: ${clean(e.to)}`, ...(e.replyTo ? [`Reply-To: ${clean(e.replyTo)}`] : []),
    `Subject: ${encodeHeader(e.subject)}`, ...(e.inReplyTo ? [`In-Reply-To: ${clean(e.inReplyTo)}`, `References: ${clean(e.inReplyTo)}`] : []),
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const text = e.text ?? htmlToText(e.html);
  const parts = [
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64(text)),
    `--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64(e.html)),
    `--${alt}--`,
    ...(e.attachments ?? []).flatMap((a) => {
      const name = clean(a.filename).replace(/"/g, "");
      return [`--${mixed}`, `Content-Type: ${a.type ?? typeOf(name)}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, "Content-Transfer-Encoding: base64", "", wrap(a.content.replace(/\s+/g, ""))];
    }),
    `--${mixed}--`, "",
  ];
  return [...head, "", ...parts].join("\r\n");
}
export const toBase64Url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** "Ahmed Khan <ahmed@x.com>" → "ahmed@x.com" (lower case). */
export function emailOf(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /<([^>]+)>/.exec(header) ?? /([^\s,;"<>]+@[^\s,;"<>]+)/.exec(header);
  return m ? m[1].trim().toLowerCase() : null;
}
/** Every address in a To/Cc header. */
export const emailsOf = (header: string | null | undefined) => (header ?? "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(emailOf).filter((x): x is string => Boolean(x));
export const nameOf = (header: string | null | undefined) => (/^\s*"?([^"<]+?)"?\s*</.exec(header ?? "")?.[1]?.trim() || null);

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[] };
/** The readable text of a Gmail message payload: text/plain if there is one, else the HTML as text. */
export function bodyText(payload: Part): string {
  let plain: string | null = null;
  let html: string | null = null;
  const walk = (p: Part) => {
    if (p.filename) return;
    if (p.mimeType === "text/plain" && p.body?.data && plain === null) plain = fromBase64Url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && html === null) html = fromBase64Url(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(payload);
  return (plain ?? (html ? htmlToText(html) : "")).replace(/\r\n/g, "\n").trim();
}
/** Names of files attached to a Gmail message. */
export function attachmentNames(payload: Part): string[] {
  const out: string[] = [];
  const walk = (p: Part) => { if (p.filename) out.push(p.filename); p.parts?.forEach(walk); };
  walk(payload);
  return out;
}

/** Files attached to a Gmail message, with the ids needed to download them. */
export type MailAttachment = { name: string; size?: number | null; mime?: string | null; id?: string | null };
export function attachmentsOf(payload: Part & { body?: { attachmentId?: string; size?: number } }): MailAttachment[] {
  const out: MailAttachment[] = [];
  const walk = (p: Part & { body?: { attachmentId?: string; size?: number } }) => {
    if (p.filename) out.push({ name: p.filename, size: p.body?.size ?? null, mime: p.mimeType ?? null, id: p.body?.attachmentId ?? null });
    p.parts?.forEach((c) => walk(c as never));
  };
  walk(payload);
  return out;
}

/**
 * Splits an email into what they wrote and the quoted history under it ("On … wrote:", "> …", Outlook's
 * "From: … Sent: …", a "-- " signature break).
 */
export function splitQuoted(text: string): { main: string; quoted: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    const next = lines[i + 1] ?? "";
    const onWrote = /^On .{4,200}wrote:\s*$/.test(t) || (/^On .{4,200}$/.test(t) && /wrote:\s*$/.test(next));
    if (onWrote || l === "-- " || /^-{2,}\s*Original Message\s*-{2,}/i.test(t) || /^_{5,}$/.test(t) || (/^From: .+/.test(l) && /^(Sent|Date): .+/.test(next))) { cut = i; break; }
    if (/^>/.test(l)) { if (!out.join("").trim()) continue; cut = i; break; }
    out.push(l);
  }
  const main = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const quoted = lines.slice(cut).join("\n").trim();
  return main ? { main, quoted } : { main: text.trim(), quoted: "" };
}

/** Just what they wrote: the email without the quoted history under it. */
export const newPart = (text: string) => splitQuoted(text).main;
