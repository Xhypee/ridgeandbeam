"use server";

import { asAuState, auPhoneE164, stateFromPostcode } from "@/lib/au";
import { anonClient } from "@/lib/public";
import { instantQuoteRange, QUOTE_PITCHES, QUOTE_ROOF_TYPES, type InstantQuoteInput, type QuotePitch, type QuoteRoofType } from "@/lib/roof";
import { quoteRates } from "./rates";

export type QuoteState = { error?: string; ok?: boolean; low?: number; high?: number; m2?: number; orgName?: string } | undefined;

const CURRENT: Record<string, string> = {
  tile: "Tiles (concrete or terracotta)",
  metal: "Metal (COLORBOND / ZINCALUME)",
  fibro: "Fibro / cement sheet (may contain asbestos)",
  unsure: "Not sure",
};

const s = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const aud = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

/** Recomputes the range on the server (never trusts the browser) and files the lead. */
export async function submitInstantQuote(_: QuoteState, fd: FormData): Promise<QuoteState> {
  const key = s(fd, "key", 64);
  const name = s(fd, "name");
  const phone = s(fd, "phone", 40);
  const email = s(fd, "email");
  const street = s(fd, "address", 300);
  const suburb = s(fd, "city", 100);
  const postcode = s(fd, "zip", 4);
  if (name.length < 2) return { error: "Please enter your name." };
  if (!phone && !email) return { error: "Please enter a mobile number or email so we can send your quote." };
  if (phone && !auPhoneE164(phone)) return { error: "Enter an Australian phone number, e.g. 0412 345 678." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  if (!street) return { error: "Please enter the street address." };
  if (!suburb) return { error: "Please enter the suburb." };
  if (!/^\d{4}$/.test(postcode)) return { error: "Please enter a 4-digit postcode." };
  const state = asAuState(s(fd, "state", 3)) ?? stateFromPostcode(postcode);
  if (!state) return { error: "Please choose the state." };

  const db = anonClient();
  const { data: org } = await db.rpc("get_intake_org", { p_key: key });
  if (!org) return { error: "This quote form is no longer available." };
  const cfg = org as { name: string; instant_quote?: Record<string, unknown> | null };

  const pitch = (Object.keys(QUOTE_PITCHES).includes(s(fd, "pitch")) ? s(fd, "pitch") : "medium") as QuotePitch;
  const roofType = (Object.keys(QUOTE_ROOF_TYPES).includes(s(fd, "roof_type")) ? s(fd, "roof_type") : "metal") as QuoteRoofType;
  const mode = s(fd, "mode") === "roof" ? "roof" : "house";
  const input: InstantQuoteInput = mode === "roof"
    ? { mode, roofM2: Number(fd.get("roof_m2")) || 0, pitch }
    : { mode, floorM2: Number(fd.get("floor_m2")) || 0, storeys: Number(fd.get("storeys")) || 1, pitch };
  if (input.mode === "roof" && !(input.roofM2 >= 10 && input.roofM2 < 5000)) return { error: "Enter your roof area in m² (between 10 and 5,000)." };
  if (input.mode === "house" && !(input.floorM2 >= 30 && input.floorM2 < 3000)) return { error: "Enter your home's floor area in m² (most houses are 100–400 m²)." };

  const rate = quoteRates(cfg.instant_quote)[roofType];
  const r = instantQuoteRange(input, rate.low, rate.high);
  const priced = r.high > 0;
  const insurance = s(fd, "insurance") === "yes";
  const current = CURRENT[s(fd, "current")] ?? "Not sure";
  const sizeText = input.mode === "roof" ? `${input.roofM2} m² roof (homeowner)` : `${input.floorM2} m² home, ${input.storeys} storey${input.storeys === 1 ? "" : "s"}`;
  const summary = [
    priced ? `Instant quote: ${aud(r.low)}–${aud(r.high)} inc GST (≈${r.m2} m² roof)` : `Instant quote request (≈${r.m2} m² roof, no rates set)`,
    `New roof: ${QUOTE_ROOF_TYPES[roofType]}`,
    `Size: ${sizeText}`,
    `Pitch: ${QUOTE_PITCHES[pitch].label} (${QUOTE_PITCHES[pitch].range})`,
    `Current roof: ${current}`,
    `Insurance claim: ${insurance ? "yes" : "no"}`,
  ].join("\n");

  const { error } = await db.rpc("submit_public_lead", {
    p_key: key,
    p_lead: {
      name, phone: phone || null, email: email || null, address: street,
      city: suburb, state, zip: postcode,
      source: "website", source_detail: "Instant quote", insurance,
      title: `Instant quote: ${street}, ${suburb}`.slice(0, 200),
      quote_summary: summary,
      message: summary,
    },
  });
  if (error) return { error: "We couldn't send your request. Please call us instead." };
  return { ok: true, low: r.low, high: r.high, m2: r.m2, orgName: cfg.name };
}
