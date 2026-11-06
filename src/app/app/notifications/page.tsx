import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/action-form";
import { Empty, PageHeader, cx } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("notifications").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={rows.some((r) => !r.read_at) ? <form action={markAllRead}><SubmitButton variant="secondary">Mark all read</SubmitButton></form> : undefined}
      />
      {rows.length === 0 ? (
        <Empty title="Nothing yet">New leads, homeowner replies, crew problems and claim follow-ups show up here.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={n.url ?? "#"} className={cx("flex items-start gap-3 px-4 py-3 hover:bg-slate-50", !n.read_at && "bg-brand-50/40")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-slate-500">{n.body}</span>}
                  <span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
