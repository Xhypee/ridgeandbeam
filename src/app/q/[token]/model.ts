import { asAuState } from "@/lib/au";
import { noticeSnapshot, requiredNotices, type ComplianceProfile, type Notice } from "@/lib/estimate-notices";
import { effectiveOptionId, estimateTotals, itemsForOption } from "@/lib/estimate-totals";
import { monthlyPayment } from "@/lib/roof";

/** Shape returned by get_public_estimate(token). */
export type PublicEstimate = {
  kind: "estimate";
  id: string;
  number: number;
  status: "sent" | "accepted" | "declined";
  created_at: string;
  sent_at: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate: number;
  discount: number;
  gst_inclusive: boolean;
  accepted_at: string | null;
  accepted_name: string | null;
  option_label: "options" | "alternates";
  selected_option_id: string | null;
  signature_data: string | null;
  legal_notices: (Notice & { state?: string | null })[];
  /** Job state, else customer state, else company state. */
  state: string | null;
  org: {
    name: string; phone: string | null; email: string | null; address: string | null; website: string | null;
    state: string | null; postcode: string | null; abn: string | null; gst_registered: boolean;
    insurance_certificate_url: string | null;
    licence: { number?: string; classes?: string[] | string } | null;
  };
  financing: { enabled: boolean; apr: number; term_months: number };
  customer: { name: string; email: string | null; phone: string | null; street: string | null; suburb: string | null; state: string | null; postcode: string | null };
  job: { title: string; site_address: string | null; state: string | null; is_insurance: boolean; roof_material?: string | null; job_type?: string | null; lead_source?: string | null };
  /** The job's compliance facts (Jobs → Compliance), when the office filled them in. */
  compliance?: ComplianceProfile | null;
  options: { id: string; name: string; tier: string | null; description: string | null; warranty: string | null; recommended: boolean; position: number }[];
  items: { description: string; quantity: number; unit: string; unit_price: number; option_id: string | null }[];
};

export type OptionView = PublicEstimate["options"][number] & {
  items: PublicEstimate["items"];
  total: number;
  subtotal: number;
  gst: number;
  monthly: number;
};

/** "12 Ocean St, Bondi NSW 2026" (Australia Post order). */
export function auAddress(a: { street?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null }) {
  const tail = [a.suburb, [a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  return [a.street, tail].filter(Boolean).join(", ");
}

/** Everything the public page needs, computed once on the server. */
export function buildProposal(doc: PublicEstimate) {
  const options = [...(doc.options ?? [])].sort((a, b) => a.position - b.position);
  const shared = (doc.items ?? []).filter((i) => !i.option_id);
  const money = (lines: PublicEstimate["items"]) => estimateTotals(lines, Number(doc.discount), Number(doc.tax_rate), Boolean(doc.gst_inclusive));
  const monthly = (total: number) => (doc.financing?.enabled ? monthlyPayment(total, doc.financing.apr, doc.financing.term_months) : 0);
  const views: OptionView[] = options.map((o) => {
    const t = money(itemsForOption(doc.items, o.id));
    return { ...o, items: doc.items.filter((i) => i.option_id === o.id), total: t.total, subtotal: t.subtotal, gst: t.gst, monthly: monthly(t.total) };
  });
  const effective = effectiveOptionId(options, doc.selected_option_id);
  const all = money(itemsForOption(doc.items, effective));
  const state = asAuState(doc.state);
  const noticesFor = (total: number) =>
    requiredNotices(state, {
      total,
      isInsurance: Boolean(doc.job.is_insurance),
      contractDate: new Date(),
      roofMaterial: doc.job.roof_material,
      jobType: doc.job.job_type,
      leadSource: doc.job.lead_source,
      profile: doc.compliance,
      business: { name: doc.org.name, licenceNumber: doc.org.licence?.number ?? null, abn: doc.org.abn, address: doc.org.address, phone: doc.org.phone, email: doc.org.email },
    });
  // After acceptance, show exactly what was snapshotted; before, what will be attached.
  const maxTotal = views.length ? Math.max(...views.map((v) => v.total)) : all.total;
  const notices: Notice[] = doc.status === "accepted" && doc.legal_notices?.length ? doc.legal_notices : noticesFor(maxTotal);
  return { options: views, shared, effective, totals: all, monthly: monthly(all.total), state, notices, noticesFor, snapshot: (total: number) => noticeSnapshot(state, noticesFor(total)) };
}
