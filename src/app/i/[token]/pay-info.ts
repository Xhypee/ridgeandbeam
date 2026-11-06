/** Shape returned by the public.get_public_tax_invoice RPC (no secrets). */
export type PublicTaxInvoice = {
  id: string;
  number: number;
  status: string;
  kind: string;
  milestone_label: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  terms: string | null;
  tax_rate: number;
  discount: number;
  amounts_include_gst: boolean;
  bill_to: string;
  buyer: { name: string | null; abn: string | null; address: string | null; email: string | null; phone: string | null };
  totals: { subtotal: number; gst: number; total: number; paid: number; balance: number };
  seller: { name: string; abn: string | null; gst_registered: boolean; phone: string | null; email: string | null; address: string | null };
  pay: {
    bank_account_name: string | null;
    bank_bsb: string | null;
    bank_account_number: string | null;
    payid: string | null;
    payid_type: "email" | "phone" | "abn" | null;
    becs_enabled: boolean;
    card_fee_pct: number;
    online_ready: boolean;
    financing: { enabled: boolean; lenders: { name: string; url: string; provider?: string }[] };
  };
  job: { title: string; site_address: string | null; is_insurance: boolean; state: string | null };
  claim: { insurer: string | null; claim_number: string | null; settlement_path: string; excess: number; stage: string } | null;
  items: { description: string; quantity: number; unit: string; unit_price: number }[];
};
