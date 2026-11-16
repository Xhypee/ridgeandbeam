// Settings: cards on the left (one per area, with a line on how it's set up and a tag when it needs you), the open
// area in the right sidebar. Each area is its own page under /app/settings/<area>; /app/settings itself has none
// open and shows the Claude chat on the right.
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { AU_STATE_NAME, asAuState, formatAbn } from "@/lib/au";
import { licenceFor } from "@/lib/business";
import { requireOrg } from "@/lib/dal";
import { SettingsCards, SettingsPanel, type SettingsCard } from "./settings-ui";

const B = "/app/settings";
const ICON = {
  company: "M4 21V8l8-5 8 5v13M9 21v-6h6v6",
  rules: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  team: "M9 11a4 4 0 100-8 4 4 0 000 8M2 21a7 7 0 0114 0M16 11a3 3 0 100-6M22 20a6 6 0 00-4-5.6",
  book: "M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11",
  suppliers: "M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 100-4 2 2 0 000 4M17 20a2 2 0 100-4 2 2 0 000 4",
  crews: "M4 20l4-12h8l4 12M9 8V5h6v3M3 20h18",
  payments: "M3 6h18v12H3zM3 10h18M7 15h3",
  commissions: "M12 3v18M17 7H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  plan: "M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z",
  lead: "M4 4h16v12H8l-4 4zM8 9h8M8 12h5",
  integrations: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  const { supabase, org, isAdmin } = await requireOrg();

  // One quick look at each area for its card.
  const [members, invites, crews, catalog, suppliers, plans, xero, gmail] = await Promise.all([
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
    isAdmin ? supabase.from("invites").select("id", { count: "exact", head: true }).is("accepted_at", null) : Promise.resolve({ count: 0 }),
    supabase.from("crews").select("id", { count: "exact", head: true }),
    supabase.from("catalog_items").select("id", { count: "exact", head: true }),
    supabase.from("org_suppliers").select("id, custom_name, suppliers(name)").eq("org_id", org.id),
    isAdmin ? supabase.from("commission_plans").select("id", { count: "exact", head: true }) : Promise.resolve({ count: 0 }),
    supabase.from("integrations").select("status").eq("org_id", org.id).eq("provider", "xero").maybeSingle(),
    supabase.from("integrations").select("status, external_name").eq("org_id", org.id).eq("provider", "gmail").maybeSingle(),
  ]);
  const people = members.count ?? 0, pending = invites.count ?? 0, crewCount = crews.count ?? 0, items = catalog.count ?? 0;
  type Sup = { id: string; custom_name: string | null; suppliers: { name: string } | { name: string }[] | null };
  const supRows = (suppliers.data ?? []) as Sup[];
  const supName = (s: Sup) => s.custom_name || (Array.isArray(s.suppliers) ? s.suppliers[0]?.name : s.suppliers?.name) || "Supplier";
  const def = supRows.find((s) => s.id === org.default_supplier_id);
  const state = asAuState(org.state);
  const licence = state ? licenceFor(org.licences, state) : null;
  const materials = Number(org.markup_pct?.material ?? 0);
  const testMode = process.env.OUTBOUND_PAUSED === "1";
  const xeroOn = (xero.data as { status?: string } | null)?.status === "connected";
  const gm = gmail.data as { status?: string; external_name?: string | null } | null;
  const gmailOn = Boolean(gm && gm.status !== "disconnected"), gmailBroken = gm?.status === "error";
  const claudeOn = aiEnabled();
  const mapsOn = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  const cards: SettingsCard[] = [
    { group: "Your business", href: `${B}/company`, title: "Company", icon: ICON.company,
      status: [org.name, org.abn ? `ABN ${formatAbn(org.abn)}` : null].filter(Boolean).join(" · "),
      chip: !org.abn ? { text: "Add your ABN", tone: "amber" } : org.gst_registered ? { text: "GST registered", tone: "slate" } : null },
    { group: "Your business", href: `${B}/state-rules`, title: "State rules", icon: ICON.rules,
      status: `${state ? AU_STATE_NAME[state] : "No state set"} · licence, contracts, notices`,
      chip: !state ? { text: "Set your state", tone: "amber" } : !licence ? { text: "Add licence", tone: "amber" } : null },
    { group: "Your business", href: `${B}/team`, title: "Team", icon: ICON.team,
      status: [plural(people, "person", "people"), pending ? `${pending} invited` : null].filter(Boolean).join(" · ") },
    { group: "Quoting & crews", href: `${B}/price-book`, title: "Price book", icon: ICON.book, wide: true,
      status: [plural(items, "item"), materials ? `materials +${materials}%` : null].filter(Boolean).join(" · "),
      chip: items === 0 ? { text: "Add prices", tone: "amber" } : null },
    { group: "Quoting & crews", href: `${B}/suppliers`, title: "Suppliers", icon: ICON.suppliers, wide: true,
      status: def ? `Default: ${supName(def)}${supRows.length > 1 ? ` · ${supRows.length - 1} more` : ""}` : supRows.length ? plural(supRows.length, "supplier") : "No suppliers yet",
      chip: !def ? { text: "Pick a default", tone: "amber" } : null },
    { group: "Quoting & crews", href: `${B}/crews`, title: "Crews & pay", icon: ICON.crews,
      status: crewCount ? plural(crewCount, "crew") : "No crews yet",
      chip: crewCount ? null : { text: "Add a crew", tone: "amber" } },
    { group: "Money", href: `${B}/payments`, title: "Payments & financing", icon: ICON.payments,
      status: org.stripe_charges_enabled ? "Card, bank and cash" : "Bank transfer and cash",
      chip: testMode ? { text: "Test mode", tone: "amber" } : null },
    ...(isAdmin ? [{ group: "Money", href: `${B}/commissions`, title: "Commissions", icon: ICON.commissions,
      status: (plans.count ?? 0) ? plural(plans.count ?? 0, "plan") : "Off" } as SettingsCard] : []),
    ...(isAdmin ? [{ group: "Money", href: `${B}/billing`, title: "Plan & billing", icon: ICON.plan,
      status: org.subscription_status === "cancelled" ? "Cancelled" : org.subscription_status === "trialing" ? "Free trial" : "Active",
      chip: org.subscription_status === "cancelled" ? { text: "Cancelled", tone: "amber" } : null } as SettingsCard] : []),
    { group: "Connections", href: `${B}/lead-intake`, title: "Lead intake", icon: ICON.lead, status: "Website form · email forwarding" },
    { group: "Connections", href: `${B}/integrations`, title: "Integrations", icon: ICON.integrations,
      status: [`Gmail ${gmailBroken ? "needs reconnecting" : gmailOn ? "connected" : "not connected"}`, `Claude ${claudeOn ? "on" : "off"}`, `Google Maps ${mapsOn ? "on" : "off"}`, `Xero ${xeroOn ? "connected" : "not connected"}`].join(" · "),
      chip: gmailBroken ? { text: "Reconnect Gmail", tone: "amber" } : !claudeOn ? { text: "Connect Claude", tone: "amber" } : null },
  ];

  return (
    <div className="lg:flex lg:h-full">
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-7">
        <PageHeader kicker={org.name} title="Settings" />
        <SettingsCards cards={cards} />
      </div>
      <SettingsPanel cards={cards}>{children}</SettingsPanel>
    </div>
  );
}
