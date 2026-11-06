export type PayInfo = {
  invoice_id: string;
  number: number;
  status: string;
  balance: number;
  total: number;
  card_fee_pct: number;
  pass_card_fee: boolean;
  ach_enabled: boolean;
  online_ready: boolean;
  financing: { enabled: boolean; apr: number; term_months: number; lenders: { name: string; url: string; dealer_fee_pct?: number }[] };
  org: { name: string; phone: string | null; email: string | null; address: string | null };
};
