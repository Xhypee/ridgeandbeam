// Business identity on quotes (AU): ABN, GST status and the licence for the job's state.
import { asAuState, formatAbn, type AuState } from "./au";

export type Licence = { number?: string | null; classes?: string[] | string | null };
export type Licences = Partial<Record<AuState, Licence>>;

const classesText = (c: Licence["classes"]) => (Array.isArray(c) ? c.filter(Boolean).join(", ") : (c ?? "").trim());

/** The company's licence for a state (organizations.licences[state]), or null when none is on file. */
export function licenceFor(licences: unknown, state: string | null | undefined): { state: AuState; number: string; classes: string } | null {
  const s = asAuState(state);
  if (!s || !licences || typeof licences !== "object") return null;
  const l = (licences as Record<string, Licence | undefined>)[s];
  const number = (l?.number ?? "").trim();
  if (!number) return null;
  return { state: s, number, classes: classesText(l?.classes) };
}

/** Normalise licences from the settings form: drop empty states, trim, classes as a list. */
export function cleanLicences(input: Record<string, { number?: string | null; classes?: string | null }>): Licences {
  const out: Licences = {};
  for (const [k, v] of Object.entries(input)) {
    const s = asAuState(k);
    const number = (v.number ?? "").trim().slice(0, 40);
    if (!s || !number) continue;
    const classes = (v.classes ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 80));
    out[s] = { number, classes };
  }
  return out;
}

export const abnText = (abn: string | null | undefined) => (abn ? `ABN ${formatAbn(abn)}` : null);
