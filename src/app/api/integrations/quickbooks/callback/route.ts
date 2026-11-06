import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/dal";
import { exchangeCode, qboConfigured, readState, saveConnection } from "@/lib/quickbooks";

/** OAuth 2.0 redirect target registered in the Intuit developer app. */
export async function GET(req: NextRequest) {
  const back = (q: string) => redirect(`/app/settings/integrations?${q}`);
  const p = req.nextUrl.searchParams;
  if (!qboConfigured()) back("qbo_error=" + encodeURIComponent("QuickBooks isn't configured on this server."));
  if (p.get("error")) back("qbo_error=" + encodeURIComponent(p.get("error") === "access_denied" ? "You cancelled the QuickBooks connection." : `QuickBooks said: ${p.get("error")}`));
  const state = readState(p.get("state"));
  const { org, user, isAdmin } = await requireOrg();
  // The signed state must match the admin who started the flow, in the company they're working in.
  if (!state || state.orgId !== org.id || state.userId !== user.id || !isAdmin) back("qbo_error=" + encodeURIComponent("That QuickBooks link expired or belongs to another company. Try connecting again."));
  const code = p.get("code");
  const realmId = p.get("realmId");
  if (!code || !realmId) back("qbo_error=" + encodeURIComponent("QuickBooks didn't send back a company. Try again."));
  let failed: string | null = null;
  try {
    await saveConnection(org.id, realmId!, await exchangeCode(code!));
  } catch (e) {
    failed = (e as Error).message;
  }
  back(failed ? "qbo_error=" + encodeURIComponent(failed) : "qbo=connected");
}
