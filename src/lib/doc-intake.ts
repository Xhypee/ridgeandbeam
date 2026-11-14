// Document intake: what Claude read off an uploaded file, and which empty fields on the customer, job and
// insurance claim that fills. Pure (no DB, no AI) so the rules are unit-tested. Never overwrites: when a
// document disagrees with what's already on file, that goes in the job note as a difference instead.

export const DOC_TYPES = ["plans", "insurance", "supplier_invoice", "supplier_quote", "council", "contract", "photo", "report", "correspondence", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  plans: "plans", insurance: "insurance document", supplier_invoice: "supplier invoice", supplier_quote: "supplier quote", council: "council / approval",
  contract: "contract", photo: "photo", report: "report", correspondence: "letter / email", other: "document",
};

export type DocRead = {
  doc_type: DocType;
  summary: string | null;
  customer: { phone: string | null; email: string | null; address: string | null; suburb: string | null; state: string | null; postcode: string | null };
  site: { address: string | null; suburb: string | null; state: string | null; postcode: string | null };
  job: { roof_material: string | null; roof_area_m2: number | null };
  /** Roof measurements printed on plans or a roof report (Nearmap, Roofr, etc.). */
  roof: DocRoof;
  insurance: { insurer: string | null; claim_number: string | null; policy_number: string | null; assessor_name: string | null; assessor_phone: string | null; assessor_email: string | null; excess: number | null; date_of_loss: string | null };
  notes: string | null;
};

export type DocRoof = {
  area_m2: number | null; plan_area_m2: number | null; pitch_deg: number | null;
  ridge_m: number | null; hip_m: number | null; valley_m: number | null; gutter_m: number | null; barge_m: number | null; downpipes: number | null;
};
export const NO_ROOF: DocRoof = { area_m2: null, plan_area_m2: null, pitch_deg: null, ridge_m: null, hip_m: null, valley_m: null, gutter_m: null, barge_m: null, downpipes: null };

export type Current = {
  customer: { phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
  job: { site_address: string | null; state: string | null; zip: string | null; roof_material: string | null; is_insurance: boolean };
  claim: { carrier: string | null; claim_number: string | null; policy_number: string | null; adjuster_name: string | null; adjuster_phone: string | null; adjuster_email: string | null; excess: number | null; date_of_loss: string | null } | null;
};

export type DocPlan = {
  customer: Record<string, string>;
  job: Record<string, string | boolean>;
  claim: Record<string, string | number> | null; // fields to set on the claim (existing or new)
  createClaim: boolean;
  category: "plans" | "supplier_invoice" | "document";
  filled: string[];   // "claim # 88213", "assessor Jane Smith"
  differs: string[];  // "mobile on file 0412 000 000, document says 0491 570 313"
  hints: string[];    // "Roof area on the plans: 212 m². Use Measure from plans on the quote."
};

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const clean = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
const digits = (v: string) => v.replace(/\D/g, "").replace(/^61/, "0");
const loose = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || v === 0;

/** Same value, allowing for spacing, case and +61 vs 0 on phone numbers, or one address containing the other. */
export function sameValue(kind: "phone" | "email" | "text", a: string, b: string): boolean {
  if (kind === "phone") return digits(a) === digits(b);
  if (kind === "email") return a.trim().toLowerCase() === b.trim().toLowerCase();
  const x = loose(a), y = loose(b);
  return x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x)));
}

export function planDocUpdates(r: DocRead, cur: Current): DocPlan {
  const plan: DocPlan = { customer: {}, job: {}, claim: null, createClaim: false, category: r.doc_type === "plans" ? "plans" : r.doc_type === "supplier_invoice" ? "supplier_invoice" : "document", filled: [], differs: [], hints: [] };
  const fill = <T extends Record<string, unknown>>(target: Record<string, unknown>, have: T, key: keyof T & string, value: string | number | null, label: string, kind: "phone" | "email" | "text" = "text", show = String(value)) => {
    if (value === null || value === undefined || value === "") return;
    const existing = have[key];
    if (empty(existing)) { target[key] = value; plan.filled.push(`${label} ${show}`); return; }
    if (typeof existing === "string" && typeof value === "string" && !sameValue(kind, existing, value)) plan.differs.push(`${label} on file is ${existing}, the document says ${show}`);
    if (typeof existing === "number" && typeof value === "number" && Math.abs(existing - value) >= 1) plan.differs.push(`${label} on file is ${existing}, the document says ${show}`);
  };

  // Customer contact details: not from plans or supplier paperwork (those carry the architect's / supplier's details).
  if (!["plans", "supplier_invoice", "supplier_quote"].includes(r.doc_type)) {
    fill(plan.customer, cur.customer, "phone", clean(r.customer.phone), "mobile", "phone");
    fill(plan.customer, cur.customer, "email", clean(r.customer.email)?.toLowerCase() ?? null, "email", "email");
  }

  // Site address on the job (plans and most documents name the property).
  const st = clean(r.site.state)?.toUpperCase() ?? null;
  const state = st && AU_STATES.includes(st) ? st : null;
  const pc = clean(r.site.postcode);
  const postcode = pc && /^\d{4}$/.test(pc) ? pc : null;
  const siteAddr = clean(r.site.address);
  if (siteAddr) {
    const full = [siteAddr, clean(r.site.suburb), [state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    fill(plan.job, cur.job, "site_address", full, "site address");
  }
  if (state && empty(cur.job.state)) plan.job.state = state;
  if (postcode && empty(cur.job.zip)) plan.job.zip = postcode;
  fill(plan.job, cur.job, "roof_material", clean(r.job.roof_material), "roof");

  // Insurance: a claim number or insurer on an insurance document starts or fills the claim.
  const ins = r.insurance;
  const hasIns = r.doc_type === "insurance" && Boolean(clean(ins.claim_number) || clean(ins.insurer));
  if (hasIns || (cur.claim && (clean(ins.claim_number) || clean(ins.assessor_name)))) {
    const claim: Record<string, unknown> = {};
    const have = cur.claim ?? { carrier: null, claim_number: null, policy_number: null, adjuster_name: null, adjuster_phone: null, adjuster_email: null, excess: null, date_of_loss: null };
    fill(claim, have, "carrier", clean(ins.insurer), "insurer");
    fill(claim, have, "claim_number", clean(ins.claim_number), "claim #");
    fill(claim, have, "policy_number", clean(ins.policy_number), "policy #");
    fill(claim, have, "adjuster_name", clean(ins.assessor_name), "assessor");
    fill(claim, have, "adjuster_phone", clean(ins.assessor_phone), "assessor phone", "phone");
    fill(claim, have, "adjuster_email", clean(ins.assessor_email)?.toLowerCase() ?? null, "assessor email", "email");
    if (typeof ins.excess === "number" && ins.excess > 0 && ins.excess < 100000) fill(claim, have, "excess", Math.round(ins.excess * 100) / 100, "excess", "text", `$${ins.excess.toLocaleString("en-AU")}`);
    const dol = clean(ins.date_of_loss);
    if (dol && /^\d{4}-\d{2}-\d{2}$/.test(dol)) fill(claim, have, "date_of_loss", dol, "date of loss");
    if (Object.keys(claim).length) plan.claim = claim as Record<string, string | number>;
    if (!cur.claim && hasIns) {
      plan.createClaim = true;
      if (!cur.job.is_insurance) { plan.job.is_insurance = true; plan.filled.push("marked as an insurance job"); }
    }
  }

  if (r.doc_type === "plans" && typeof r.job.roof_area_m2 === "number" && r.job.roof_area_m2 > 5 && r.job.roof_area_m2 < 20000) {
    plan.hints.push(`Roof area on the plans: about ${Math.round(r.job.roof_area_m2)} m². Use Measure from plans on the quote to price it.`);
  }
  return plan;
}

/** The job note Claude leaves after reading a file. */
export function intakeNote(fileName: string, r: DocRead, p: DocPlan): string {
  const parts = [`Claude read "${fileName}" (${DOC_TYPE_LABEL[r.doc_type]}).`];
  if (r.summary) parts.push(r.summary.trim().replace(/\.?$/, "."));
  if (p.filled.length) parts.push(`Filled in: ${p.filled.join(", ")}.`);
  if (p.differs.length) parts.push(`Different from what's on file (kept yours): ${p.differs.join("; ")}.`);
  parts.push(...p.hints);
  if (r.notes) parts.push(`Also: ${r.notes.trim().replace(/\.?$/, ".")}`);
  if (!p.filled.length && !p.differs.length && !p.hints.length && !r.notes) parts.push("Nothing new to add to the job.");
  return parts.join(" ");
}

/**
 * A roof plan for the quote from what Claude read off plans or a roof report: one "Main roof" section (plan area
 * and pitch) plus the line lengths it found. Builds on the quote's existing measurements object (keeps its other
 * settings). Null when there's no usable area. Plan area comes from the document, or from the roof (sloped) area
 * and pitch; with no pitch given, 22.5°.
 */
export function roofMeasurementsFromDoc(roof: DocRoof | null | undefined, roofMaterial: string | null, existing: unknown): { measurements: Record<string, unknown>; label: string } | null {
  if (!roof) return null;
  const ok = (v: number | null, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const pitch = ok(roof.pitch_deg, 1, 60) ?? 22.5;
  const sloped = ok(roof.area_m2, 5, 20000);
  const plan = ok(roof.plan_area_m2, 5, 20000) ?? (sloped ? sloped * Math.cos((pitch * Math.PI) / 180) : null);
  if (!plan) return null;
  const base = (existing && typeof existing === "object" ? existing : {}) as Record<string, unknown>;
  const mat = (roofMaterial ?? "").toLowerCase();
  const prevSys = Array.isArray(base.sections) ? (base.sections[0] as { system?: string } | undefined)?.system : undefined;
  const system = /terracotta/.test(mat) ? "terracotta_tile" : /tile/.test(mat) ? "concrete_tile"
    : /colorbond|metal|zincalume|trimdek|corrugat|klip|spandek|sheet/.test(mat) ? "metal" : prevSys ?? "metal";
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // units: "metric" matters: measurements without it are read as old imperial data (square feet, rise-in-12).
  const out: Record<string, unknown> = { ...base, units: "metric", sections: [{ label: "Main roof", area: r2(plan), pitch, system }] };
  const lens: [keyof DocRoof, string][] = [["ridge_m", "ridge"], ["hip_m", "hip"], ["valley_m", "valley"], ["gutter_m", "eave"], ["barge_m", "barge"]];
  for (const [from, to] of lens) { const v = ok(roof[from], 0.1, 5000); if (v) out[to] = r2(v); }
  const dp = ok(roof.downpipes, 1, 100);
  if (dp) out.downpipes = Math.round(dp);
  const trueArea = plan / Math.cos((pitch * Math.PI) / 180);
  return { measurements: out, label: `roof area ${Math.round(trueArea)} m² at ${r2(pitch)}°${ok(roof.pitch_deg, 1, 60) ? "" : " (pitch assumed)"}` };
}

/** Already measured: the document's roof area against the quote's, when they're 5% or more apart (else null). */
export function roofAreaDiff(roof: DocRoof | null | undefined, quoteTrueArea: number): string | null {
  if (!roof || !(quoteTrueArea > 0)) return null;
  const ok = (v: number | null, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const pitch = ok(roof.pitch_deg, 1, 60) ?? 22.5;
  const plan = ok(roof.plan_area_m2, 5, 20000);
  const doc = ok(roof.area_m2, 5, 20000) ?? (plan ? plan / Math.cos((pitch * Math.PI) / 180) : null);
  if (!doc || Math.abs(doc - quoteTrueArea) / quoteTrueArea < 0.05) return null;
  return `roof area on the quote is ${Math.round(quoteTrueArea)} m², the document says ${Math.round(doc)} m²`;
}
