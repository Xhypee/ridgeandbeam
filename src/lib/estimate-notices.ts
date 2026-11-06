// Slot for state-specific notices on quotes (cooling-off, home warranty insurance, deposits, licences...).
// State law is being verified separately and will come from the compliance builder's src/lib/au-rules.ts;
// until then no notices are generated. The snapshot mechanism (estimates.legal_notices, copied at acceptance)
// is kept so whatever rules land later are frozen onto the signed quote.
import { asAuState, type AuState } from "./au";

export type Notice = { id: string; title: string; text: string; citation?: string; conspicuous?: boolean };
export type NoticeSnapshot = Notice & { state: string | null };

export type ResolvedState = { state: AuState | null; source: "job" | "customer" | "company" | "none" };

/** The state whose rules apply to a job: the job's state, else the customer's, else the company's. */
export function resolveJobState(jobState?: string | null, customerState?: string | null, orgState?: string | null): ResolvedState {
  const j = asAuState(jobState);
  if (j) return { state: j, source: "job" };
  const c = asAuState(customerState);
  if (c) return { state: c, source: "customer" };
  const o = asAuState(orgState);
  if (o) return { state: o, source: "company" };
  return { state: null, source: "none" };
}

/** Notices required on a quote for this state. Empty until au-rules.ts provides them. */
export function requiredNotices(state: AuState | null, ctx: { total: number; isInsurance: boolean }): Notice[] {
  void state;
  void ctx;
  return [];
}

export const noticeSnapshot = (state: string | null, notices: Notice[]): NoticeSnapshot[] => notices.map((n) => ({ ...n, state }));
