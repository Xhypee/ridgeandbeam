// Plan revisions ("Rev C", "Issue B", "R2", "Revision 3"): which of two sets of plans is newer.
/** A comparable rank for a revision label, or null when there's no letter or number to go on. */
export function revisionRank(rev: string | null | undefined): number | null {
  if (!rev) return null;
  const t = rev.trim().toUpperCase().replace(/^(REV(ISION)?|ISSUE|R)\.?\s*/, "");
  if (/^\d{1,3}$/.test(t)) return Number(t);
  if (/^[A-Z]{1,2}$/.test(t)) return t.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const m = /([A-Z]|\d{1,3})\s*$/.exec(t);
  if (!m) return null;
  return /\d/.test(m[1]) ? Number(m[1]) : m[1].charCodeAt(0) - 64;
}

/** True when `incoming` is newer than (or as new as, or can't be told apart from) `existing`. */
export function isNewerRevision(incoming: string | null | undefined, existing: string | null | undefined): boolean {
  const a = revisionRank(incoming), b = revisionRank(existing);
  return a === null || b === null || a >= b;
}
