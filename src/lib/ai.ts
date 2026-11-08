import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude-powered drafting. Everything here produces a DRAFT for a person to review —
 * never a conclusion about damage, coverage or price. Enabled when ANTHROPIC_API_KEY is set.
 */
export const aiEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export const AI_MODEL = "claude-opus-5-5";

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
