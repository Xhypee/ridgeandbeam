import { requireOrg } from "@/lib/dal";
import { tparCsv } from "@/lib/tpar";
import { pickYear, tparData } from "../data";

/** GET /app/reports/tpar/csv?fy=2025 — TPAR working file (owners/admins). */
export async function GET(req: Request) {
  const { supabase, org, isAdmin } = await requireOrg();
  if (!isAdmin) return new Response("Only owners and admins can export the TPAR.", { status: 403 });
  const fy = pickYear(new URL(req.url).searchParams.get("fy"));
  const { rows } = await tparData(supabase, org.id, fy);
  const name = `${org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tpar-${fy.startYear}-${fy.startYear + 1}.csv`;
  return new Response(tparCsv(rows, fy), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
