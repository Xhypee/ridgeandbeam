import Link from "next/link";
import { Logo } from "@/components/logo";
import { AppFrame, Nav, NavRail, SectionTabs } from "@/components/nav";
import { requireOrg, ROLE_LABEL } from "@/lib/dal";
import { outboundPaused } from "@/lib/notify";
import { switchOrg } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { org, user, memberships, role, canSeeMoney, isCrewLead, supabase } = await requireOrg();
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("read_at", null);
  const me = memberships.find((m) => m.org_id === org.id);

  const orgSwitcher =
    memberships.length > 1 ? (
      <form action={switchOrg} className="flex gap-1">
        <select name="org_id" defaultValue={org.id} className="min-w-0 flex-1 rounded-md border-0 bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {memberships.map((m) => (
            <option key={m.org_id} value={m.org_id}>{m.organizations.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-300">Go</button>
      </form>
    ) : (
      <p className="truncate text-xs text-slate-500">{org.name}</p>
    );

  return (
    <AppFrame
      rail={<NavRail canSeeMoney={canSeeMoney} crewLead={isCrewLead} unread={unread ?? 0} />}
      tabs={<SectionTabs canSeeMoney={canSeeMoney} />}
      full={
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-1 flex items-center justify-between px-2">
          <Link href="/app"><Logo /></Link>
          <Link href="/app/notifications" className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0" /></svg>
            {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>
        </div>
        <div className="mb-6 px-2">{orgSwitcher}</div>
        <Nav canSeeMoney={canSeeMoney} crewLead={isCrewLead} />
        {outboundPaused() && (
          <div className="mx-2 mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-900 ring-1 ring-amber-200" data-test-mode>
            <p className="font-semibold">Test mode</p>
            <p className="mt-0.5">Every email comes to you instead of customers or suppliers. Texts and online payments are off.</p>
          </div>
        )}
        <div className="mt-auto border-t border-slate-100 px-2 pt-4">
          <p className="truncate text-sm font-medium text-slate-800">{me?.full_name || user.fullName || user.email}</p>
          <p className="truncate text-xs text-slate-500">{ROLE_LABEL[role] ?? role} · {user.email}</p>
          <form action="/auth/signout" method="post">
            <button className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </aside>}
      header={
        <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href="/app"><Logo /></Link>
            <div className="flex items-center gap-2">
            <Link href="/app/notifications" className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0" /></svg>
              {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-xs font-medium text-slate-500">Sign out</button>
            </form>
            </div>
          </div>
          <div className="px-4 pb-2">{orgSwitcher}</div>
          <Nav mobile canSeeMoney={canSeeMoney} crewLead={isCrewLead} />
        </header>}
    >
      {children}
    </AppFrame>
  );
}
