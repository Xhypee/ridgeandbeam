"use server";

import { revalidatePath } from "next/cache";
import { asAuState, AU_STATES, isValidAbn, stateFromPostcode } from "@/lib/au";
import { cleanLicences } from "@/lib/business";
import { requireAdmin } from "@/lib/dal";
import { friendly, num, str } from "@/lib/form";
import type { ActionResult } from "@/components/action-form";

const url = (v: string | null) => {
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return undefined; // invalid
  }
};

/** Company profile (ABN, GST, licences per state, service states) + estimating defaults (owners/admins). */
export async function updateCompanySettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, org } = ctx;
  const name = str(fd, "name");
  if (!name) return { error: "Business name is required." };

  const postcode = str(fd, "zip");
  if (postcode && !/^\d{4}$/.test(postcode)) return { error: "Postcode should be 4 digits." };
  const stateRaw = str(fd, "state");
  const state = asAuState(stateRaw) ?? (stateRaw ? null : stateFromPostcode(postcode));
  if (stateRaw && !asAuState(stateRaw)) return { error: "Pick a state or territory." };

  const abnRaw = (str(fd, "abn") ?? "").replace(/\s/g, "");
  if (abnRaw && !isValidAbn(abnRaw)) return { error: "That ABN isn't valid. Check the 11 digits (it must pass the ATO check)." };

  const links: Record<string, string | null> = {};
  for (const [field, labelText] of [["website", "Website"], ["google_review_url", "Google review link"], ["insurance_certificate_url", "Insurance certificate link"]] as const) {
    const v = url(str(fd, field));
    if (v === undefined) return { error: `${labelText} doesn't look like a web address.` };
    links[field] = v;
  }

  const licences = cleanLicences(Object.fromEntries(AU_STATES.map((s) => [s, { number: str(fd, `licence_${s}`), classes: str(fd, `licence_classes_${s}`) }])));
  const serviceStates = AU_STATES.filter((s) => fd.getAll("service_states").map(String).includes(s));

  const gstRegistered = fd.get("gst_registered") === "on";
  const minMargin = num(fd, "min_margin_pct", 25);
  if (minMargin < 0 || minMargin > 90) return { error: "Minimum margin must be between 0 and 90%." };

  const years = num(fd, "workmanship_years", 7);
  if (!Number.isInteger(years) || years < 0 || years > 25) return { error: "Workmanship warranty should be 0 to 25 whole years." };

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      workmanship_years: years,
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      address: str(fd, "address"),
      state,
      zip: postcode,
      abn: abnRaw || null,
      gst_registered: gstRegistered,
      prices_include_gst: fd.get("prices_include_gst") === "on",
      tax_rate: gstRegistered ? 10 : 0,
      licences,
      service_states: serviceStates,
      // Keep the old single licence field in step for screens not yet moved to per-state licences.
      license_number: (state && licences[state]?.number) || Object.values(licences)[0]?.number || null,
      ...links,
      default_waste_pct: Math.min(50, Math.max(0, num(fd, "default_waste_pct", 10))),
      min_margin_pct: minMargin,
      estimate_terms: str(fd, "estimate_terms") ?? "",
      invoice_terms: str(fd, "invoice_terms") ?? "",
    })
    .eq("id", org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

/** Paste the Google review link from the Wrapping up sidebar (owners/admins). */
export async function saveReviewLink(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const v = url(str(fd, "google_review_url"));
  if (!v) return { error: "Paste the link Google gives you (Ask for reviews → copy link)." };
  if (!/(^https:\/\/(g\.page|maps\.app\.goo\.gl|goo\.gl|search\.google\.com|www\.google\.com|google\.com|business\.google\.com)\/)/i.test(v)) return { error: "That doesn't look like a Google review link. In your Google Business Profile, tap Ask for reviews and copy the link." };
  const { error } = await ctx.supabase.from("organizations").update({ google_review_url: v }).eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved. It's also in Settings → Company." };
}
