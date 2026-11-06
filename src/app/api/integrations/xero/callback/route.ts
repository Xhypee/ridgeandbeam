import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/dal";
import { exchangeCode, firstTenant, readState, saveConnection, xeroConfigured } from "@/lib/xero";

/** OAuth 2.0 redirect target registered in the Xero developer app. */
export async function GET(req: NextRequest) {
  const back = (q: string) => redirect(`/app/settings/integrations?${q}`);
  const err = (m: string) => back("xero_error=" + encodeURIComponent(m));
  const p = req.nextUrl.searchParams;
  if (!xeroConfigured()) err("Xero isn't configured on this server.");
  if (p.get("error")) err(p.get("error") === "access_denied" ? "You cancelled the Xero connection." : `Xero said: ${p.get("error")}`);
  const state = readState(p.get("state"));
  const { org, user, isAdmin } = await requireOrg();
  // The signed state must match the admin who started the flow, in the company they're working in.
  if (!state || state.orgId !== org.id || state.userId !== user.id || !isAdmin) err("That Xero link expired or belongs to another company. Try connecting again.");
  const code = p.get("code");
  if (!code) err("Xero didn't send back an authorisation code. Try again.");
  let failed: string | null = null;
  try {
    const tokens = await exchangeCode(code!);
    await saveConnection(org.id, await firstTenant(tokens.access_token), tokens);
  } catch (e) {
    failed = (e as Error).message;
  }
  if (failed) err(failed);
  back("xero=connected");
}
