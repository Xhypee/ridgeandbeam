import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { authorizeUrl, makeState, qboConfigured } from "@/lib/quickbooks";

export async function GET() {
  const { org, user, isAdmin } = await requireOrg();
  if (!isAdmin) redirect("/app/settings/integrations?qbo_error=" + encodeURIComponent("Only owners and admins can connect QuickBooks."));
  if (!qboConfigured()) redirect("/app/settings/integrations?qbo_error=" + encodeURIComponent("QuickBooks isn't configured on this server."));
  redirect(authorizeUrl(makeState(org.id, user.id)));
}
