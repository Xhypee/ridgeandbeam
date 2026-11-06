/** The one flat Ridge & Beam plan. Change the price here only. */
export const PLAN = {
  name: "Ridge & Beam",
  priceMonthly: 149, // placeholder until the Stripe price is final
  included: [
    "Unlimited users — invite every rep, office admin and crew lead",
    "No setup or onboarding fee",
    "Month-to-month — cancel any time from this page",
    "Built-in roof calculator and satellite measuring, no per-report fees",
    "Estimates, e-sign, invoices, online payments, claims, scheduling and crew work orders",
    "Your data is yours: export everything as CSV whenever you want",
  ],
};

export const EXPORTS = [
  { key: "customers", label: "Customers" },
  { key: "jobs", label: "Jobs" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
] as const;
