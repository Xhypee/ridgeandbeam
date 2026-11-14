import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DOC_TYPES, type DocRead } from "./doc-intake";

/**
 * Claude-powered drafting. Everything here produces a DRAFT for a person to review —
 * never a conclusion about damage, coverage or price. Enabled when ANTHROPIC_API_KEY is set.
 */
export const aiEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export const AI_MODEL = "claude-sonnet-5-5";

const HONESTY = [
  "You write for a residential roofing contractor. Your text is a draft that a company rep reviews before anyone else sees it.",
  "Use plain, friendly language a homeowner understands. No jargon without a short explanation, no hype, no pressure tactics.",
  "Only state facts present in the information given. Never invent damage, measurements, prices, warranties, insurance outcomes or dates.",
  "If something is unclear or missing, say so plainly or leave it out rather than guessing.",
  "Do not promise insurance approval or imply the homeowner's deductible can be waived.",
  "Output plain text only (no markdown headings, no tables).",
].join("\n");

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export class AiError extends Error {}

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

/** One short drafting call. Returns the text, or throws AiError with a user-facing message. */
export async function draftText(opts: { task: string; content: Content; maxTokens?: number }): Promise<string> {
  if (!aiEnabled()) throw new AiError("AI not configured");
  try {
    const res = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: `${HONESTY}\n\n${opts.task}`,
      messages: [{ role: "user", content: opts.content }],
    });
    if (res.stop_reason === "refusal") throw new AiError("The AI declined to draft this one. Please write it yourself.");
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new AiError("The AI returned an empty draft. Try again.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The AI key is invalid. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.APIError) throw new AiError(`The AI couldn't draft this (error ${e.status ?? "network"}).`);
    throw new AiError("The AI couldn't draft this right now.");
  }
}

export const PROPOSAL_TASK =
  "Write homeowner-friendly scope-of-work notes for the estimate below (120-250 words). Explain what the crew will do, in the order it happens, " +
  "based only on the line items and measurements listed. If there are good/better/best options, briefly explain how they differ. " +
  "End with one sentence inviting questions. Start with the line 'DRAFT — review before sending'.";

export const PHOTO_TASK =
  "Summarize the attached roof photos and the captions for the homeowner (100-220 words). Describe only what is visible or written in captions; " +
  "if a photo is unclear, say it is unclear. Do not diagnose hail or wind damage that isn't clearly shown or captioned, and do not draw insurance conclusions. " +
  "Start with the line 'DRAFT — review before sending'.";

export const RESPONDER_TASK =
  "Write ONE text message (under 300 characters) replying to a homeowner who just requested a roof inspection through the website. " +
  "Thank them by first name, say who is texting (the company name), offer the inspection times given (pick two or three), and ask them to reply with the one that works. " +
  "No links, no emojis, no prices. Do not claim anything about their roof. Output only the message text.";

export function asImageBlock(data: Buffer, mediaType: string): Anthropic.Beta.BetaImageBlockParam | null {
  const ok = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const mt = (ok as readonly string[]).includes(mediaType) ? (mediaType as (typeof ok)[number]) : null;
  if (!mt || data.length > 4.5 * 1024 * 1024) return null;
  return { type: "image", source: { type: "base64", media_type: mt, data: data.toString("base64") } };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** A chat reply for the in-app assistant (business context goes in `system`). Throws AiError with a user-facing message. */
export async function chatReply(opts: { system: string; messages: ChatTurn[]; maxTokens?: number }): Promise<string> {
  if (!aiEnabled()) throw new AiError("Claude isn't connected yet. Add ANTHROPIC_API_KEY in Vercel to turn it on.");
  try {
    const res = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: opts.system,
      messages: opts.messages,
    });
    if (res.stop_reason === "refusal") throw new AiError("Claude can't help with that one.");
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw new AiError("Claude didn't reply. Try again.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Claude key is invalid. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude couldn't answer (error ${e.status ?? "network"}).`);
    throw new AiError("Claude couldn't answer right now.");
  }
}

export type ReadInvoice = {
  invoice_no: string | null; invoice_date: string | null; due_date: string | null; ex_gst: number | null; gst: number | null; total: number | null;
  abn: string | null; bank_name: string | null; bsb: string | null; account: string | null;
};

/**
 * Read a supplier's tax invoice (PDF or photo) into fields for the person to check before paying.
 * Returns null when AI isn't set up or the document can't be read; never guesses a value it can't see.
 */
export async function readSupplierInvoice(data: Buffer, mediaType: string): Promise<ReadInvoice | null> {
  if (!aiEnabled() || data.length > 20 * 1024 * 1024) return null;
  const doc: Anthropic.Beta.BetaContentBlockParam | null = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } }
    : asImageBlock(data, mediaType);
  if (!doc) return null;
  try {
    const res = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: "You read Australian supplier tax invoices for a roofing business. Reply with one JSON object only, no other text. Use null for anything not clearly printed on the invoice. Never guess.",
      messages: [{ role: "user", content: [doc, { type: "text", text: 'Fields: {"invoice_no": string, "invoice_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "ex_gst": number, "gst": number, "total": number, "abn": string (the supplier\'s ABN), "bank_name": string (account name to pay), "bsb": string, "account": string (account number)}' }] }],
    });
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : typeof v === "string" && /^\$?[\d,]+(\.\d+)?$/.test(v.trim()) ? Math.round(Number(v.replace(/[$,]/g, "")) * 100) / 100 : null);
    const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return {
      invoice_no: str(j.invoice_no, 60), invoice_date: date(j.invoice_date), due_date: date(j.due_date), ex_gst: num(j.ex_gst), gst: num(j.gst), total: num(j.total),
      abn: str(j.abn, 20), bank_name: str(j.bank_name, 120), bsb: str(j.bsb, 10), account: str(j.account, 20),
    };
  } catch {
    return null;
  }
}

/**
 * Read any file dropped into a job's Documents: what it is and the facts that matter to the job (customer
 * contact, site, roof, insurance claim). Returns null when AI is off, the file is too big or unreadable.
 * Only what's printed in the file; null for everything else.
 */
export async function readJobDocument(data: Buffer, mediaType: string, fileName: string): Promise<DocRead | null> {
  if (!aiEnabled() || data.length > 20 * 1024 * 1024) return null;
  const isText = /^text\//.test(mediaType) || /\.(txt|csv|eml)$/i.test(fileName);
  const doc: Anthropic.Beta.BetaContentBlockParam | null = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } }
    : isText ? (data.length > 200_000 ? null : { type: "text", text: `File "${fileName}":\n${data.toString("utf8")}` })
    : asImageBlock(data, mediaType);
  if (!doc) return null;
  const schema = `{"doc_type": one of ${JSON.stringify(DOC_TYPES)}, "summary": string (one short sentence: what this is), ` +
    `"customer": {"phone": string, "email": string, "address": string, "suburb": string, "state": string (QLD/NSW/...), "postcode": string} (the homeowner / client, not the business, architect, insurer or supplier), ` +
    `"site": {"address": string (street), "suburb": string, "state": string, "postcode": string} (the property the roof work is on), ` +
    `"job": {"roof_material": string (e.g. "Concrete tile", "Colorbond Trimdek"), "roof_area_m2": number}, ` +
    `"roof": {"area_m2": number (total sloped roof area), "plan_area_m2": number (roof area on plan / footprint), "pitch_deg": number, "ridge_m": number, "hip_m": number, "valley_m": number, "gutter_m": number (eaves / gutter length), "barge_m": number (barge / rake length), "downpipes": number} (only measurements printed on plans or a roof report, in metres), ` +
    `"insurance": {"insurer": string, "claim_number": string, "policy_number": string, "assessor_name": string, "assessor_phone": string, "assessor_email": string, "excess": number, "date_of_loss": "YYYY-MM-DD"}, ` +
    `"notes": string (anything else a roofer must know from it, one sentence, or null)}`;
  try {
    const res = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: "You read files a residential roofing business in Australia attaches to a job: plans, insurance and assessor reports, supplier quotes and invoices, council approvals, contracts, emails and roof photos. Reply with one JSON object only, no other text. Use null for anything not clearly shown in the file. Never guess or infer details that aren't there.",
      messages: [{ role: "user", content: [doc, { type: "text", text: `File name: ${fileName}\nFields: ${schema}` }] }],
    });
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, Record<string, unknown> | unknown>;
    const o = (k: string) => (j[k] && typeof j[k] === "object" ? (j[k] as Record<string, unknown>) : {});
    const s = (v: unknown, max = 200) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, max) : null);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\$?[\d,]+(\.\d+)?$/.test(v.trim()) ? Number(v.replace(/[$,]/g, "")) : null);
    const c = o("customer"), st = o("site"), jb = o("job"), ins = o("insurance"), rf = o("roof");
    const type = (DOC_TYPES as readonly string[]).includes(String(j.doc_type)) ? (j.doc_type as (typeof DOC_TYPES)[number]) : "other";
    return {
      doc_type: type, summary: s(j.summary, 300),
      customer: { phone: s(c.phone, 30), email: s(c.email, 120), address: s(c.address), suburb: s(c.suburb, 80), state: s(c.state, 10), postcode: s(c.postcode, 10) },
      site: { address: s(st.address), suburb: s(st.suburb, 80), state: s(st.state, 10), postcode: s(st.postcode, 10) },
      job: { roof_material: s(jb.roof_material, 80), roof_area_m2: n(jb.roof_area_m2) },
      roof: {
        area_m2: n(rf.area_m2) ?? n(jb.roof_area_m2), plan_area_m2: n(rf.plan_area_m2), pitch_deg: n(rf.pitch_deg),
        ridge_m: n(rf.ridge_m), hip_m: n(rf.hip_m), valley_m: n(rf.valley_m), gutter_m: n(rf.gutter_m), barge_m: n(rf.barge_m), downpipes: n(rf.downpipes),
      },
      insurance: { insurer: s(ins.insurer, 80), claim_number: s(ins.claim_number, 60), policy_number: s(ins.policy_number, 60), assessor_name: s(ins.assessor_name, 100), assessor_phone: s(ins.assessor_phone, 30), assessor_email: s(ins.assessor_email, 120), excess: n(ins.excess), date_of_loss: s(ins.date_of_loss, 10) },
      notes: s(j.notes, 400),
    };
  } catch {
    return null;
  }
}
