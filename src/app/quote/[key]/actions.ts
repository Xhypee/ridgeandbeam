"use server";

import { anonClient } from "@/lib/public";
import { instantQuoteRange, QUOTE_PITCHES, type QuotePitch } from "@/lib/roof";

export type QuoteState = { error?: string; ok?: boolean; low?: number; high?: number; squares?: number; orgName?: string } | undefined;

const MATERIALS: Record<string, string> = {
  asphalt: "Asphalt shingles",
  metal: "Metal",
  tile: "Tile",
  wood: "Wood shake",
  flat: "Flat / membrane",
  unsure: "Not sure",
};

const s = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Recomputes the range on the server (never trusts the browser) and files the lead. */
export async function submitInstantQuote(_: QuoteState, fd: FormData): Promise<QuoteState> {
  const key = s(fd, "key", 64);
  const name = s(fd, "name");
  const phone = s(fd, "phone", 40);
  const email = s(fd, "email");
  const address = s(fd, "address", 300);
  if (name.length < 2) return { error: "Please enter your name." };
  if (!phone && !email) return { error: "Please enter a phone number or email so we can send your quote." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  if (!address) return { error: "Please enter the property address." };

  const db = anonClient();
  const { data: org } = await db.rpc("get_intake_org", { p_key: key });
  if (!org) return { error: "This quote form is no longer available." };
  const cfg = (org as { name: string; instant_quote?: { enabled?: boolean; price_per_square_low?: number; price_per_square_high?: number } });
  const iq = cfg.instant_quote ?? {};

  const pitch = (Object.keys(QUOTE_PITCHES).includes(s(fd, "pitch")) ? s(fd, "pitch") : "medium") as QuotePitch;
  const mode = s(fd, "mode") === "squares" ? "squares" : "house";
  const input = mode === "squares"
    ? { mode, squares: Number(fd.get("squares")) || 0, pitch } as const
    : { mode, houseSqft: Number(fd.get("house_sqft")) || 0, stories: Number(fd.get("stories")) || 1, pitch } as const;
  if (mode === "squares" && !(input.mode === "squares" && input.squares > 0 && input.squares < 500)) return { error: "Enter your roof size in squares (1 square = 100 sq ft)." };
  if (mode === "house" && !(input.mode === "house" && input.houseSqft >= 300 && input.houseSqft < 30000)) return { error: "Enter your home's living area in square feet." };

  const r = instantQuoteRange(input, Number(iq.price_per_square_low) || 0, Number(iq.price_per_square_high) || 0);
  const insurance = s(fd, "insurance") === "yes";
  const material = MATERIALS[s(fd, "material")] ?? "Not sure";
  const sizeText = input.mode === "squares" ? `${input.squares} squares (homeowner)` : `${input.houseSqft} sq ft home, ${input.stories} stor${input.stories === 1 ? "y" : "ies"}`;
  const summary = [
    `Instant quote: ${usd(r.low)}–${usd(r.high)} (≈${r.squares} sq)`,
    `Size: ${sizeText}`,
    `Pitch: ${QUOTE_PITCHES[pitch].label}`,
    `Current roof: ${material}`,
    `Insurance claim: ${insurance ? "yes" : "no"}`,
  ].join("\n");

  const { error } = await db.rpc("submit_public_lead", {
    p_key: key,
    p_lead: {
      name, phone: phone || null, email: email || null, address,
      city: s(fd, "city", 100) || null, state: s(fd, "state", 2).toUpperCase() || null, zip: s(fd, "zip", 20) || null,
      source: "website", source_detail: "Instant quote", insurance,
      title: `Instant quote: ${address}`.slice(0, 200),
      quote_summary: summary,
      message: summary,
    },
  });
  if (error) return { error: "We couldn't send your request. Please call us instead." };
  return { ok: true, low: r.low, high: r.high, squares: r.squares, orgName: cfg.name };
}
