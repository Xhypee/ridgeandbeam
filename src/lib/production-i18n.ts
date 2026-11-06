// Crew work-order wording: plain Australian English for the crew portal and the printed work order.
// (The earlier English/Spanish switch was a US assumption and has been removed.)
import { EXISTING_ROOF_LABEL, JOB_TYPE_LABEL, METAL_PROFILE_INFO, normalizeMeasurements, ROOF_SYSTEM_SHORT, round2, sectionProfile, sectionSystem, summarize, type JobType } from "./roof";

export const CREW_STRINGS = {
  upcoming: "Upcoming jobs",
  noJobs: "No jobs booked for this crew right now.",
  tentative: "Pencilled in",
  locked: "Confirmed",
  start: "Start",
  end: "Finish",
  address: "Address",
  openMap: "Open in Maps",
  homeowner: "Homeowner",
  call: "Call",
  roof: "Roof",
  area: "Roof area (sloped)",
  dates: "Dates",
  pitch: "Pitch",
  oldRoof: "Old roof to strip",
  roofType: "New roof",
  materials: "Materials",
  qty: "Qty",
  item: "Item",
  noMaterials: "No material list yet — ask the office.",
  color: "Colour / profile",
  delivery: "Delivery",
  roof_load: "Roof load",
  ground_drop: "Ground drop",
  deliveryNotes: "Delivery notes",
  gateCode: "Gate code",
  hazards: "Site hazards",
  permit: "Approval / permit #",
  skipBin: "Skip bin",
  photos: "Photos",
  noPhotos: "No photos shared yet.",
  problem: "Problem / missing material",
  problemHelp: "Tell the office what's wrong. They get it straight away.",
  kind: "What happened?",
  missing_material: "Missing material",
  wrong_material: "Wrong material or colour",
  damage_found: "Damage found (battens, sarking, etc.)",
  safety: "Safety issue",
  homeowner_issue: "Homeowner issue",
  other: "Other",
  message: "Details",
  yourName: "Your name",
  photo: "Photo (optional)",
  send: "Send to office",
  sent: "Sent. The office has been told.",
  back: "← All jobs",
  safetyTitle: "Safety",
  safetyReminder: "Work to the SWMS for this job. Edge protection or a harness system before anyone works at height. Check for power lines before loading the roof. Stop and call the office if you find suspected asbestos.",
  workOrder: "Work order",
  officePhone: "Office",
  status_delivered: "Delivered",
  status_ordered: "Ordered",
  status_not_ordered: "Not ordered",
  orderedFrom: "From",
  deliveryDate: "Delivery date",
  skip_needed: "Needed — not booked yet",
  skip_ordered: "Booked",
  skip_delivered: "On site",
  skip_removed: "Collected",
  skip_not_needed: "Not needed",
};
export type CrewStrings = typeof CREW_STRINGS;

/** Short plain-English unit names for the crew (calc-key units and older free-text units). */
const UNIT: Record<string, string> = {
  m2: "m²", "m²": "m²", lm: "lm", ea: "each", job: "job", roll: "roll", box: "box", bag: "bag", pail: "pail", sheet: "sheet", length: "length", pack: "pack", m3: "m³",
};
export const unitLabel = (u: string) => UNIT[u.toLowerCase()] ?? u;

/** Skip bin status for the crew. */
export const skipBinLabel = (status: string) => (CREW_STRINGS as Record<string, string>)[`skip_${status}`] ?? status.replace(/_/g, " ");

export type WorkOrderMaterial = { description: string; quantity: number; unit: string };

/** Materials for the crew: the (non-cancelled) material orders if any, else the estimate's material lines. No prices. */
export function workOrderMaterials(
  orders: { status: string; items: WorkOrderMaterial[] }[],
  estimateItems: (WorkOrderMaterial & { category: string })[],
): { source: "order" | "estimate" | "none"; items: WorkOrderMaterial[] } {
  const fromOrders = orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.items);
  if (fromOrders.length) return { source: "order", items: fromOrders.map(({ description, quantity, unit }) => ({ description, quantity: Number(quantity), unit })) };
  const est = estimateItems.filter((i) => i.category === "material" && Number(i.quantity) > 0);
  if (est.length) return { source: "estimate", items: est.map(({ description, quantity, unit }) => ({ description, quantity: Number(quantity), unit })) };
  return { source: "none", items: [] };
}

export type CrewRoofFacts = {
  hasMeasurements: boolean;
  jobType: string;
  /** True (sloped) area, m², no waste. */
  area: number;
  /** "22.5°" or "15–30°". */
  pitch: string;
  /** What comes off ("Tiles", "Metal sheets"…), or null when nothing is stripped. */
  oldRoof: string | null;
  /** What goes on ("Metal — Trimdek", "Concrete tile"). */
  newRoof: string;
  asbestos: boolean;
  /** Site checklist: sarking, safety mesh, edge protection, skip bin, gutters. */
  includes: string[];
};

const STRIPS: JobType[] = ["reroof", "tile_to_metal", "asbestos"];

/** The roof in crew terms, from the accepted estimate's measurements (metric). */
export function crewRoofFacts(raw: unknown): CrewRoofFacts {
  const m = normalizeMeasurements(raw);
  const s = summarize(m);
  const pitches = m.sections.filter((x) => x.area > 0).map((x) => round2(Number(x.pitch) || 0));
  const lo = pitches.length ? Math.min(...pitches) : 0;
  const hi = pitches.length ? Math.max(...pitches) : 0;
  const systems = [...new Set(m.sections.filter((x) => x.area > 0).map((x) => {
    const sys = sectionSystem(x);
    return sys === "metal" ? `Metal — ${METAL_PROFILE_INFO[sectionProfile(x)].label}` : ROOF_SYSTEM_SHORT[sys];
  }))];
  const includes = [
    m.includeSarking && "Sarking",
    m.includeSafetyMesh && systems.some((x) => x.startsWith("Metal")) && "Safety mesh",
    m.includeEdgeProtection && "Edge protection",
    m.includeSkip && "Skip bin",
    (m.includeGutters || m.jobType === "gutters") && "New gutters & downpipes",
  ].filter((x): x is string => Boolean(x));
  return {
    hasMeasurements: s.trueArea > 0,
    jobType: JOB_TYPE_LABEL[m.jobType],
    area: s.trueArea,
    pitch: !pitches.length ? "—" : lo === hi ? `${hi}°` : `${lo}–${hi}°`,
    oldRoof: STRIPS.includes(m.jobType) && m.existingRoof !== "none" ? EXISTING_ROOF_LABEL[m.existingRoof] : null,
    newRoof: systems.join(", ") || "—",
    asbestos: m.asbestosSuspected || m.jobType === "asbestos",
    includes,
  };
}
