"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { CERTIFICATIONS } from "@/lib/estimating";
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

/** Company profile + estimating defaults (owners/admins). */
export async function updateCompanySettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, org } = ctx;
  const name = str(fd, "name");
  if (!name) return { error: "Company name is required." };
  const state = str(fd, "state")?.toUpperCase() ?? null;
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: "State should be a 2-letter code, e.g. TX." };

  const links: Record<string, string | null> = {};
  for (const [field, labelText] of [["website", "Website"], ["google_review_url", "Google review link"], ["insurance_certificate_url", "Insurance certificate link"]] as const) {
    const v = url(str(fd, field));
    if (v === undefined) return { error: `${labelText} doesn't look like a web address.` };
    links[field] = v;
  }

  const known = new Set<string>(CERTIFICATIONS);
  const certs = fd.getAll("certifications").map(String).filter((c) => known.has(c));
  const otherCert = str(fd, "certification_other");
  if (otherCert) certs.push(otherCert.slice(0, 80));

  const minMargin = num(fd, "min_margin_pct", 25);
  const bps = num(fd, "bundles_per_square", 3);
  if (minMargin < 0 || minMargin > 90) return { error: "Minimum margin must be between 0 and 90%." };
  if (bps < 1 || bps > 6) return { error: "Bundles per square is usually 3 (between 1 and 6)." };

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      address: str(fd, "address"),
      state,
      zip: str(fd, "zip"),
      license_number: str(fd, "license_number"),
      ...links,
      certifications: [...new Set(certs.filter((c) => c !== "Other"))],
      tax_rate: Math.max(0, num(fd, "tax_rate")),
      default_waste_pct: Math.min(50, Math.max(0, num(fd, "default_waste_pct", 10))),
      min_margin_pct: minMargin,
      bundles_per_square: bps,
      estimate_terms: str(fd, "estimate_terms") ?? "",
      invoice_terms: str(fd, "invoice_terms") ?? "",
    })
    .eq("id", org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}
