import { requireMoneyAccess } from "@/lib/dal";
import { TEMPLATE_CSV } from "@/lib/price-sheet";

/** Sample price sheet layout (illustrative rows with $0.00 — fill in your own account prices). */
export async function GET() {
  await requireMoneyAccess();
  return new Response(TEMPLATE_CSV, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="price-sheet-template.csv"' },
  });
}
