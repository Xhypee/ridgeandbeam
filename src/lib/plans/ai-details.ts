import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_MODEL, aiEnabled } from "@/lib/ai";
import { DETAIL_KEYS, type DetailKey } from "./details";

/**
 * Ask Claude to read job details from the plans' text (title blocks and notes). Returns only what is written
 * there; the caller merges it under the deterministic parser's values and the user ticks what to keep.
 */
const FieldSchema = { type: "object", properties: { value: { type: "string" }, sheet: { type: "integer" } }, required: ["value", "sheet"], additionalProperties: false };
const SCHEMA = {
  type: "object",
  properties: Object.fromEntries(DETAIL_KEYS.map((k) => [k, { anyOf: [FieldSchema, { type: "null" }] }])),
  required: [...DETAIL_KEYS],
  additionalProperties: false,
};
const Out = z.record(z.string(), z.object({ value: z.string(), sheet: z.number().int() }).nullable());

const TASK = [
  "You read Australian residential building plans for a roofing contractor and pull out job details so nobody has to retype them.",
  "Only report what is actually written in the text. If a field is not there, return null for it. Never guess.",
  "Fields: street (number and street name of the SITE, not the designer's office), suburb, state (NSW, VIC, QLD, WA, SA, TAS, ACT or NT), postcode (4 digits),",
  "client (the client, owner or builder named in the title block), lot (as 'Lot N on PLAN', e.g. 'Lot 7 on SP123456'), council (local authority name only),",
  "designer (the design or drafting firm), drawingDate (DD/MM/YYYY), drawingIssue (issue / revision text), buildingType (e.g. New residence, Extension),",
  "storeys (a number), roofMaterial (e.g. COLORBOND steel, Concrete tile), pitch (degrees, e.g. 22.5°), downpipes (size, material and spacing notes),",
  "eaveOverhang (e.g. 600 mm). For each, give the sheet number shown in the '--- Sheet N ---' header where you found it.",
].join("\n");

export type AiDetails = Partial<Record<DetailKey, { value: string; page: number }>>;

export async function aiReadDetails(text: string): Promise<{ details?: AiDetails; error?: string }> {
  if (!aiEnabled()) return { error: "AI not configured" };
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: TASK,
      messages: [{ role: "user", content: text.slice(0, 60000) }],
    });
    if (res.stop_reason === "refusal") return { error: "The AI declined to read these plans." };
    const raw = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = Out.safeParse(JSON.parse(raw));
    if (!parsed.success) return { error: "The AI's answer couldn't be read." };
    const details: AiDetails = {};
    for (const k of DETAIL_KEYS) {
      const v = parsed.data[k];
      if (v && v.value.trim()) details[k] = { value: v.value.trim().slice(0, 200), page: v.sheet };
    }
    return { details };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "The AI is busy right now." };
    if (e instanceof Anthropic.AuthenticationError) return { error: "The AI key is invalid." };
    if (e instanceof Anthropic.APIError) return { error: `The AI couldn't read the plans (error ${e.status ?? "network"}).` };
    if (e instanceof SyntaxError) return { error: "The AI's answer couldn't be read." };
    return { error: "The AI couldn't read the plans right now." };
  }
}
