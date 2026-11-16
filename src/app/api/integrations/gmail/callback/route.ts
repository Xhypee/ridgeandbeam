import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/dal";
import { exchangeCode, gmailConfigured, mailboxFor, readState, saveConnection, syncMailbox } from "@/lib/gmail";

/** OAuth redirect target registered on the Google Cloud OAuth client. */
export async function GET(req: NextRequest) {
  const back = (q: string) => redirect(`/app/settings/integrations?${q}`);
  const err = (m: string) => back("gmail_error=" + encodeURIComponent(m));
  const p = req.nextUrl.searchParams;
  if (!gmailConfigured()) err("Gmail isn't set up on this server yet.");
  if (p.get("error")) err(p.get("error") === "access_denied" ? "You cancelled the Gmail connection." : `Google said: ${p.get("error")}`);
  const state = readState(p.get("state"));
  const { org, user, isAdmin } = await requireOrg();
  if (!state || state.orgId !== org.id || state.userId !== user.id || !isAdmin) err("That Gmail link expired or belongs to another company. Try connecting again.");
  const code = p.get("code");
  if (!code) err("Google didn't send back an authorisation code. Try again.");
  let failed: string | null = null;
  try {
    const tokens = await exchangeCode(code!);
    await saveConnection(org.id, user.id, await mailboxFor(tokens), tokens);
    await syncMailbox(org.id, { days: 14, max: 200 });
  } catch (e) {
    failed = (e as Error).message;
  }
  if (failed) err(failed);
  back("gmail=connected");
}
