"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMoneyAccess } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { fillQuoteLines } from "@/lib/docket";
import { quotePriceBook, usableCatalog } from "@/lib/docket-server";
import { isCalculatorLine, type CatalogRow, type DraftItem } from "@/lib/estimating";
import { mergeMeasurements, METAL_PROFILE_INFO, METAL_PROFILES, normalizeMeasurements, type MetalProfile } from "@/lib/roof";
import { aiReadDetails } from "@/lib/plans/ai-details";
import { DETAIL_KEYS, jobTypeFromBuilding, type DetailKey, type Found } from "@/lib/plans/details";
import { EDGE_TYPES, LINE_KINDS, normalizeLines } from "@/lib/plans/roof-model";
import { computeTakeoff, plansMeasurements, savedPlans } from "@/lib/plans/takeoff";

type Result = { ok?: string; error?: string };

async function estimateCtx(estimateId: string) {
  const ctx = await requireMoneyAccess();
  const { data: est } = await ctx.supabase
    .from("estimates")
    .select("id, org_id, job_id, status, measurements, org_supplier_id, tax_rate, gst_inclusive, option_label, discount, notes, terms, estimate_items(*), estimate_options!estimate_options_estimate_id_fkey(*), jobs(id, title, site_address, state, zip, job_type, roof_material, notes, customer_id, customers(id, name, address, city, state, zip))")
    .eq("id", estimateId)
    .maybeSingle();
  return { ...ctx, est };
}

const UploadSchema = z.object({ estimateId: z.uuid(), path: z.string().min(5).max(500), name: z.string().trim().min(1).max(200), size: z.number().int().min(0).max(60 * 1024 * 1024) });

/** After the browser uploads the PDF to job storage (<org>/<job>/plans/…), keep it with the job's files. */
export async function attachPlansFile(input: z.input<typeof UploadSchema>): Promise<Result & { fileId?: string }> {
  const p = UploadSchema.safeParse(input);
  if (!p.success) return { error: "That upload didn't look right." };
  const { supabase, user, est } = await estimateCtx(p.data.estimateId);
  if (!est) return { error: "Quote not found." };
  if (est.status === "accepted") return { error: "This quote is accepted, so its measurements are locked." };
  if (!p.data.path.startsWith(`${est.org_id}/${est.job_id}/plans/`) || p.data.path.includes("..")) return { error: "Upload path doesn't match this job." };
  const { data, error } = await supabase.from("job_files").insert({
    org_id: est.org_id, job_id: est.job_id, kind: "document", category: "plans", storage_path: p.data.path, mime_type: "application/pdf",
    size_bytes: p.data.size, caption: `Plans: ${p.data.name}`.slice(0, 500), uploaded_by: user.id,
  }).select("id").single();
  if (error) return { error: friendly(error) };
  revalidatePath(`/app/jobs/${est.job_id}`, "layout");
  return { ok: "Plans saved with the job.", fileId: data.id };
}

/** Optional AI pass over the plans' text (only when ANTHROPIC_API_KEY is set). */
export async function aiPlanDetails(input: { estimateId: string; text: string }) {
  const { est } = await estimateCtx(String(input?.estimateId ?? ""));
  if (!est) return { error: "Quote not found." };
  return aiReadDetails(String(input?.text ?? "").slice(0, 60000));
}

const PtS = z.tuple([z.number().finite(), z.number().finite()]);
const SaveSchema = z.object({
  estimateId: z.uuid(),
  model: z.object({
    scale: z.number().min(1).max(5000),
    pitch: z.number().min(1, "Set the roof pitch.").max(60),
    lines: z.array(z.object({ a: PtS, b: PtS, set: z.enum([...LINE_KINDS, ...EDGE_TYPES]).nullable().optional() })).min(3, "Draw the roof first.").max(4000),
  }),
  page: z.number().int().min(0).max(1000),
  pageCount: z.number().int().min(1).max(1000),
  pageSize: z.object({ w: z.number().positive().max(5000), h: z.number().positive().max(5000) }),
  scaleSource: z.string().max(40),
  file: z.object({ id: z.uuid().nullable(), path: z.string().max(500).nullable(), name: z.string().max(200), imagePath: z.string().max(500).nullable() }),
  profile: z.enum(METAL_PROFILES),
  colour: z.string().trim().max(40),
  overhangMm: z.number().min(0).max(300),
  downpipes: z.number().int().min(0).max(200),
  details: z.array(z.object({ key: z.enum(DETAIL_KEYS), value: z.string().trim().max(200), page: z.number().int().min(-1).max(1000), via: z.enum(["plans", "ai"]) })).max(60),
  apply: z.array(z.enum([...DETAIL_KEYS, "customer", "customerAddress"])).max(40),
});
export type SavePlansInput = z.input<typeof SaveSchema>;

const sameName = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * "Add to quote": recompute the takeoff from the drawn lines (the browser's numbers are display only), save it into
 * the quote's measurements (measurement_source 'plans'), fill the calculator lines (price book or the quote's
 * supplier sheet; hand-added lines are kept), and fill the job / customer details the user ticked.
 */
export async function savePlansTakeoff(input: SavePlansInput): Promise<Result & { lines?: number; sheets?: number; lm?: number }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the roof." };
  const d = parsed.data;
  const { supabase, org, est } = await estimateCtx(d.estimateId);
  if (!est) return { error: "Quote not found." };
  if (est.status === "accepted") return { error: "This quote is accepted, so its measurements are locked." };
  const job = est.jobs as unknown as { id: string; title: string; site_address: string | null; state: string | null; zip: string | null; job_type: string; roof_material: string | null; notes: string | null; customer_id: string; customers: { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null } };

  // 1. Takeoff, recomputed here.
  const model = { scale: d.model.scale, pitch: d.model.pitch, lines: normalizeLines(d.model.lines.map((l) => ({ a: l.a, b: l.b, set: l.set ?? null })), d.model.scale) };
  const t = computeTakeoff(model, { overhangMm: d.overhangMm, downpipes: d.downpipes });
  if (!t.analysis.faces.length) return { error: "The roof outline isn't closed yet. Join the lines so the panels show up." };
  const value = (k: DetailKey) => d.details.find((f) => f.key === k)?.value?.trim() || null;
  const ticked = new Set(d.apply);
  const building = ticked.has("buildingType") ? value("buildingType") : null;
  const newBuild = Boolean(jobTypeFromBuilding(building ?? value("buildingType")) === "new_construction");

  const extra = org as typeof org & { calc_defaults?: unknown };
  const current = normalizeMeasurements(est.measurements, Number(org.default_waste_pct), extra.calc_defaults);
  const m = plansMeasurements(current, t, { pitch: model.pitch, profile: d.profile as MetalProfile, newBuild, downpipes: d.downpipes });
  const snapshot = savedPlans({
    page: d.page, pageCount: d.pageCount, pageSize: d.pageSize, scale: model.scale, scaleSource: d.scaleSource, pitch: model.pitch, lines: model.lines,
    profile: d.profile as MetalProfile, colour: d.colour, overhangMm: d.overhangMm, downpipes: d.downpipes, file: d.file, details: d.details as Found[],
  }, t);
  const measurements = { ...mergeMeasurements(est.measurements, m), plans: snapshot };

  // 2. Lines: same as "Fill line items from measurements" and the docket (main lines, extras added and offered).
  const { data: catalogRows } = await supabase.from("catalog_items").select("*").order("category").order("calc_key").order("name");
  const catalog = usableCatalog((catalogRows ?? []) as CatalogRow[], org);
  const { book } = await quotePriceBook(supabase, org, catalog, (est.org_supplier_id as string | null) ?? null);
  const optionRows = ((est.estimate_options ?? []) as { id: string; position: number; name: string; tier: "good" | "better" | "best" | null; description: string | null; warranty: string | null; recommended: boolean }[]).sort((a, b) => a.position - b.position);
  const options = optionRows.map((o) => ({ key: o.id, id: o.id, name: o.name, tier: o.tier, description: o.description ?? "", warranty: o.warranty ?? "", recommended: o.recommended }));
  const mode = { inclusive: Boolean(est.gst_inclusive), gstRatePct: Number(est.tax_rate) || 0 };
  const calcNames = new Set(catalog.filter((c) => c.calc_key).map((c) => c.name));
  type Item = DraftItem & { option_id: string | null; position: number };
  const existing = ((est.estimate_items ?? []) as Item[]).sort((a, b) => a.position - b.position).map((it) => ({
    description: it.description, quantity: Number(it.quantity), unit: it.unit, unit_price: Number(it.unit_price), unit_cost: Number(it.unit_cost ?? 0),
    category: it.category, calc_key: it.calc_key ?? null, option_key: it.option_id ?? null, supplier_price_item_id: it.supplier_price_item_id ?? null,
    extra_status: it.extra_status ?? null, blurb: it.blurb ?? null, customer_added: Boolean(it.customer_added),
  }));
  const custom = existing.filter((it) => !isCalculatorLine(it, calcNames));
  const built = fillQuoteLines({ m, book, options, mode, previous: existing, colour: d.colour || null, keepCustom: custom });
  const generated = built.items;
  const { error: saveErr } = await supabase.rpc("save_estimate_content", {
    p_id: est.id,
    p_estimate: {
      measurements, measurement_source: "plans", option_label: est.option_label, tax_rate: est.tax_rate, gst_inclusive: est.gst_inclusive,
      org_supplier_id: (est.org_supplier_id as string | null) ?? "", discount: est.discount, notes: est.notes, terms: est.terms,
      roof_profile: d.profile, roof_colour: d.colour || "",
    },
    p_options: options,
    p_items: [...generated, ...custom],
  });
  if (saveErr) return { error: friendly(saveErr) };

  // 3. Job and customer details the user ticked.
  const street = value("street"), suburb = value("suburb"), state = value("state"), postcode = value("postcode");
  const jobPatch: Record<string, unknown> = {};
  if (["street", "suburb", "state", "postcode"].some((k) => ticked.has(k as DetailKey)) && (street || suburb)) {
    jobPatch.site_address = [street, [suburb, state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (ticked.has("state") && state) jobPatch.state = state;
  if (ticked.has("postcode") && postcode) jobPatch.zip = postcode;
  const jt = jobTypeFromBuilding(building);
  if (jt) jobPatch.job_type = jt;
  if (ticked.has("roofMaterial") && value("roofMaterial")) {
    const mat = value("roofMaterial")!;
    jobPatch.roof_material = /colou?rbond|zincalume|metal|steel/i.test(mat) ? `${mat}, ${METAL_PROFILE_INFO[d.profile as MetalProfile].label}${d.colour ? ` in ${d.colour}` : ""}` : mat;
  }
  const noteParts = [
    ticked.has("lot") && value("lot"),
    ticked.has("council") && value("council") && `Council: ${value("council")}`,
    ticked.has("designer") && value("designer") && `Designer: ${value("designer")}`,
    (ticked.has("drawingIssue") || ticked.has("drawingDate")) && [ticked.has("drawingIssue") ? value("drawingIssue") : null, ticked.has("drawingDate") ? value("drawingDate") : null].filter(Boolean).join(", ") && `Drawings: ${[ticked.has("drawingIssue") ? value("drawingIssue") : null, ticked.has("drawingDate") ? value("drawingDate") : null].filter(Boolean).join(", ")}`,
    ticked.has("buildingType") && value("buildingType"),
    ticked.has("storeys") && value("storeys") && `${value("storeys") === "1" ? "Single storey" : `${value("storeys")} storeys`}`,
    ticked.has("downpipes") && value("downpipes") && `Downpipes: ${value("downpipes")}`,
    ticked.has("eaveOverhang") && value("eaveOverhang") && `Eaves: ${value("eaveOverhang")}`,
  ].filter(Boolean) as string[];
  if (noteParts.length) {
    const line = `From the plans: ${noteParts.join(" · ")}`;
    const kept = (job.notes ?? "").split("\n").filter((l) => !l.startsWith("From the plans:")).join("\n").trim();
    jobPatch.notes = [kept, line].filter(Boolean).join("\n");
  }

  let customerId = job.customer_id;
  const client = value("client");
  if (ticked.has("customer") && client && !sameName(client, job.customers.name)) {
    const { data: existing } = await supabase.from("customers").select("id").eq("org_id", org.id).ilike("name", client.replace(/[%_]/g, "")).limit(1).maybeSingle();
    if (existing) customerId = existing.id;
    else {
      const { data: created, error: cErr } = await supabase.from("customers").insert({ org_id: org.id, name: client, source: "other" }).select("id").single();
      if (cErr) return { error: friendly(cErr) };
      customerId = created.id;
    }
    jobPatch.customer_id = customerId;
  }
  if (Object.keys(jobPatch).length) {
    const { error } = await supabase.from("jobs").update(jobPatch).eq("id", job.id);
    if (error) return { error: friendly(error) };
  }
  if (ticked.has("customerAddress") && (street || suburb)) {
    const { error } = await supabase.from("customers").update({ address: street, city: suburb, state, zip: postcode }).eq("id", customerId);
    if (error) return { error: friendly(error) };
  }

  revalidatePath(`/app/estimates/${est.id}`);
  revalidatePath(`/app/measure/${est.id}/plans`);
  revalidatePath(`/app/jobs/${job.id}`, "layout");
  const s = t.sheets[d.profile];
  return { ok: `${generated.length} lines added to the quote.`, lines: generated.length, sheets: s.count, lm: s.lm };
}
