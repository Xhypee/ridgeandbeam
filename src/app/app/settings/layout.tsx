import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/dal";

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  const { org, isAdmin } = await requireOrg();
  const b = "/app/settings";
  const tabs = [
    { href: b, label: "Company", exact: true },
    { href: `${b}/price-book`, label: "Price book" },
    { href: `${b}/team`, label: "Team" },
    { href: `${b}/crews`, label: "Crews & pay" },
    { href: `${b}/lead-intake`, label: "Lead intake" },
    { href: `${b}/payments`, label: "Payments & financing" },
    ...(isAdmin ? [{ href: `${b}/commissions`, label: "Commissions" }] : []),
    { href: `${b}/integrations`, label: "Integrations" },
    ...(isAdmin ? [{ href: `${b}/billing`, label: "Plan & billing" }] : []),
  ];
  return (
    <>
      <PageHeader title="Settings" subtitle={org.name} />
      <Tabs tabs={tabs} />
      {children}
    </>
  );
}
