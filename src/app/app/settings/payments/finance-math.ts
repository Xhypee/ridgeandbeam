/** Standard amortized monthly payment. */
export function monthlyPayment(principal: number, aprPct: number, months: number) {
  const r = aprPct / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}
