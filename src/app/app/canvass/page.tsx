import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Table, td, th } from "@/components/ui";
import { requireOrg } from "@/lib/dal";
import { isoDate } from "@/lib/format";
import { displayName, orgPeople } from "../jobs/people";
import { CanvassApp, type Knock, type Territory } from "./canvass-app";

export const metadata: Metadata = { title: "Canvass" };

export default async function CanvassPage({ searchParams }: PageProps<"/app/canvass">) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const now = new Date();
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : isoDate(now);
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  const toEnd = new Date(`${to}T23:59:59`).toISOString();
  const fromStart = new Date(`${from}T00:00:00`).toISOString();

  const [{ data: knocks }, { data: territories }, people] = await Promise.all([
    supabase.from("door_knocks").select("id, lat, lng, status, notes, address, setter_id, customer_id, territory_id, created_at").eq("org_id", org.id).gte("created_at", fromStart).lte("created_at", toEnd).order("created_at", { ascending: false }).limit(3000),
    supabase.from("territories").select("id, name, kind, geojson, color, assigned_to, storm_date").eq("org_id", org.id).order("created_at"),
    orgPeople(supabase, org.id),
  ]);
  const ks = (knocks ?? []) as Knock[];

  const board = new Map<string, { knocks: number; interested: number; booked: number }>();
  for (const k of ks) {
    const key = k.setter_id ?? "unknown";
    const b = board.get(key) ?? { knocks: 0, interested: 0, booked: 0 };
    b.knocks++;
    if (["interested", "inspection_booked", "customer"].includes(k.status)) b.interested++;
    if (["inspection_booked", "customer"].includes(k.status)) b.booked++;
    board.set(key, b);
  }
  const leaders = [...board.entries()].sort((a, b) => b[1].booked - a[1].booked || b[1].interested - a[1].interested || b[1].knocks - a[1].knocks);
  const center: [number, number] = ks[0] ? [ks[0].lat, ks[0].lng] : org.lat != null && org.lng != null ? [org.lat, org.lng] : [39.5, -98.35];

  return (
    <>
      <PageHeader title="Canvass" subtitle="Door knocks, territories and hail swaths. Tap the map or use your location." />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action="/app/canvass">
        <label className="block"><span className="mb-1 block text-xs text-slate-500">From</span><input type="date" name="from" defaultValue={from} className="rounded-lg px-2 py-1.5 ring-1 ring-slate-300" /></label>
        <label className="block"><span className="mb-1 block text-xs text-slate-500">To</span><input type="date" name="to" defaultValue={to} className="rounded-lg px-2 py-1.5 ring-1 ring-slate-300" /></label>
        <button className="min-h-9 rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-slate-300">Apply</button>
        <Link href="/app/canvass" className="px-2 py-1.5 text-slate-500">Last 30 days</Link>
      </form>

      <CanvassApp
        knocks={ks}
        territories={(territories ?? []) as Territory[]}
        people={people.list.map((p) => ({ id: p.user_id, name: displayName(p) }))}
        center={center}
        hasData={ks.length > 0}
      />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Leaderboard · {from} to {to}</h2>
        <Table>
          <thead><tr><th className={th}>Setter</th><th className={`${th} text-right`}>Knocks</th><th className={`${th} text-right`}>Interested</th><th className={`${th} text-right`}>Inspections booked</th></tr></thead>
          <tbody className="divide-y divide-slate-100" data-leaderboard>
            {leaders.length === 0 && <tr><td className={td} colSpan={4}>No knocks in this range yet.</td></tr>}
            {leaders.map(([id, b]) => (
              <tr key={id}>
                <td className={`${td} font-medium`}>{id === "unknown" ? "Former member" : displayName(people.byId.get(id))}</td>
                <td className={`${td} text-right tabular-nums`}>{b.knocks}</td>
                <td className={`${td} text-right tabular-nums`}>{b.interested}</td>
                <td className={`${td} text-right tabular-nums`}>{b.booked}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
