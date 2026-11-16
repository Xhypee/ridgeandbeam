// Inbox: email messages grouped into conversations (Gmail threads; app-sent emails without a thread stand alone). Pure.

export type MailRow = {
  id: string; direction: string; from_address: string | null; to_address: string | null; subject: string | null; body: string;
  status: string; created_at: string; read_at: string | null; thread_ref: string | null; job_id: string | null; customer_id: string | null;
  customer: { name: string; email: string | null } | null; job: { title: string } | null;
};
export type Thread = {
  key: string; subject: string; who: string; email: string | null; last: MailRow; count: number; unread: number;
  jobId: string | null; jobTitle: string | null; customerId: string | null; messages: MailRow[];
};

const addr = (s: string | null) => (/<([^>]+)>/.exec(s ?? "")?.[1] ?? s ?? "").split(",")[0].trim().toLowerCase() || null;
const label = (s: string | null) => (s ?? "").replace(/\s*<[^>]*>/, "").replace(/^"|"$/g, "").trim();

export function threadsOf(rows: MailRow[]): Thread[] {
  const map = new Map<string, MailRow[]>();
  for (const r of rows) {
    const k = r.thread_ref ?? `m:${r.id}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  const out: Thread[] = [];
  for (const [key, ms] of map) {
    ms.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = ms[ms.length - 1];
    const withCust = ms.find((m) => m.customer) ?? null;
    const theirs = ms.find((m) => m.direction === "inbound");
    const email = theirs ? addr(theirs.from_address) : addr(last.to_address);
    out.push({
      key, last, count: ms.length, messages: ms,
      subject: (ms.find((m) => m.subject)?.subject ?? "(no subject)").replace(/^(re|fwd?):\s*/i, ""),
      who: withCust?.customer?.name ?? (theirs ? label(theirs.from_address) : null) ?? email ?? "Unknown",
      email: withCust?.customer?.email ?? email,
      unread: ms.filter((m) => m.direction === "inbound" && !m.read_at).length,
      jobId: [...ms].reverse().find((m) => m.job_id)?.job_id ?? null,
      jobTitle: [...ms].reverse().find((m) => m.job)?.job?.title ?? null,
      customerId: withCust?.customer_id ?? null,
    });
  }
  return out.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}

/** "Re: Your quote" once, never "Re: Re: …". */
export const replySubject = (s: string | null) => (/^re:/i.test(s ?? "") ? s! : `Re: ${s ?? ""}`.trim());

/** Plain text typed in the reply box → simple, safe HTML. */
export const textToHtml = (t: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#13221a">${t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/\r?\n/g, "<br>")}</div>`;
