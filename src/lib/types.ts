export type Role = "owner" | "admin" | "member" | "sales_rep" | "crew_lead";

export type Organization = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  license_number: string | null;
  tax_rate: number;
  default_waste_pct: number;
  estimate_terms: string;
  invoice_terms: string;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  google_review_url: string | null;
  insurance_certificate_url: string | null;
  certifications: string[];
  intake_key: string;
  payment_schedule: { label: string; pct: number; trigger: string }[];
  financing: { enabled: boolean; apr: number; term_months: number; lenders: { name: string; url: string; dealer_fee_pct?: number }[] };
  min_margin_pct: number;
  bundles_per_square: number;
  card_fee_pct: number;
  pass_card_fee: boolean;
  stripe_account_id: string | null;
  plan: string;
  subscription_status: "trialing" | "active" | "cancelled";
  cancel_at: string | null;
  instant_quote: { enabled: boolean; price_per_square_low: number; price_per_square_high: number };
  abn: string | null;
  gst_registered: boolean;
  prices_include_gst: boolean;
  country: "AU";
  licences: Record<string, { number?: string; classes?: string[] }>;
  service_states: string[];
  markup_pct: Record<string, number>;
  default_supplier_id: string | null;
};

export type Membership = { org_id: string; role: Role; full_name: string | null; email: string | null; crew_id?: string | null; phone?: string | null };

export const JOB_STAGES = [
  "lead",
  "inspection",
  "estimate_sent",
  "sold",
  "scheduled",
  "in_progress",
  "completed",
  "paid",
  "lost",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_TYPES = ["replacement", "repair", "inspection", "new_construction", "gutters", "other"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const CUSTOMER_SOURCES = ["referral", "website", "door_knock", "storm", "repeat", "ads", "other"] as const;

export const PAYMENT_METHODS = ["check", "cash", "card", "ach", "insurance", "financing", "other"] as const;

export type Customer = {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: (typeof CUSTOMER_SOURCES)[number];
  insurance_company: string | null;
  claim_number: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  notes: string | null;
  follow_up_on: string | null;
  created_at: string;
};

export type Crew = { id: string; name: string; color: string };

export type Job = {
  id: string;
  org_id: string;
  customer_id: string;
  title: string;
  job_type: JobType;
  stage: JobStage;
  site_address: string | null;
  roof_material: string | null;
  is_insurance: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  crew_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogItem = {
  id: string;
  calc_key: string | null;
  name: string;
  unit: string;
  unit_price: number;
  category: "material" | "labor" | "other";
};

export type Item = {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  category: "material" | "labor" | "other";
};

export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void";

export type PublicDocument = {
  kind: "estimate" | "invoice";
  id: string;
  number: number;
  status: string;
  created_at: string;
  issue_date?: string;
  due_date?: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate: number;
  discount: number;
  paid?: number;
  accepted_at?: string | null;
  accepted_name?: string | null;
  org: { name: string; phone: string | null; email: string | null; address: string | null; license_number: string | null };
  customer: { name: string; email: string | null; phone: string | null; address: string };
  job: { title: string; site_address: string | null };
  items: { description: string; quantity: number; unit: string; unit_price: number }[];
};
