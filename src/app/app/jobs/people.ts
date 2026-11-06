import type { SupabaseClient } from "@supabase/supabase-js";

export type Person = { user_id: string; full_name: string | null; email: string | null; role: string; phone: string | null };

export function initials(p: { full_name?: string | null; email?: string | null } | null | undefined) {
  const n = (p?.full_name || p?.email || "?").trim();
  const parts = n.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

export const displayName = (p: Person | undefined | null) => p?.full_name || p?.email || "Unknown";

export async function orgPeople(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase.from("memberships").select("user_id, full_name, email, role, phone").eq("org_id", orgId).order("full_name");
  const list = (data ?? []) as Person[];
  return { list, byId: new Map(list.map((p) => [p.user_id, p])) };
}

/** PostgREST filter for jobs owned by a user in any lead role. */
export const mineFilter = (userId: string) => `assigned_to.eq.${userId},sales_rep_id.eq.${userId},setter_id.eq.${userId}`;

/** Minutes between two ISO timestamps (null when either is missing). */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

export function durationLabel(min: number | null) {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.round(min / 1440)} days`;
}
