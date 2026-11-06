import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { authorizeUrl, makeState, xeroConfigured } from "@/lib/xero";

export async function GET() {
  const { org, user, isAdmin } = await requireOrg();
  if (!isAdmin) redirect("/app/settings/integrations?xero_error=" + encodeURIComponent("Only owners and admins can connect Xero."));
  if (!xeroConfigured()) redirect("/app/settings/integrations?xero_error=" + encodeURIComponent("Xero isn't configured on this server."));
  redirect(authorizeUrl(makeState(org.id, user.id)));
}
