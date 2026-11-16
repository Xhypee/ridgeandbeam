import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { authorizeUrl, gmailConfigured, makeState } from "@/lib/gmail";

export async function GET() {
  const { org, user, isAdmin } = await requireOrg();
  const back = (m: string) => redirect("/app/settings/integrations?gmail_error=" + encodeURIComponent(m));
  if (!isAdmin) back("Only owners and admins can connect Gmail.");
  if (!gmailConfigured()) back("Gmail isn't set up on this server yet.");
  redirect(authorizeUrl(makeState(org.id, user.id), user.email));
}
