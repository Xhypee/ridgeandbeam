import Link from "next/link";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { requireOrg } from "@/lib/dal";
import { switchOrg } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { org, user, memberships, role } = await requireOrg();
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
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <Link href="/app" className="mb-1 px-2"><Logo /></Link>
        <div className="mb-6 px-2">{orgSwitcher}</div>
        <Nav />
        <div className="mt-auto border-t border-slate-100 px-2 pt-4">
          <p className="truncate text-sm font-medium text-slate-800">{me?.full_name || user.fullName || user.email}</p>
          <p className="truncate text-xs capitalize text-slate-500">{role} · {user.email}</p>
          <form action="/auth/signout" method="post">
            <button className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href="/app"><Logo /></Link>
            <form action="/auth/signout" method="post">
              <button className="text-xs font-medium text-slate-500">Sign out</button>
            </form>
          </div>
          <div className="px-4 pb-2">{orgSwitcher}</div>
          <Nav mobile />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
