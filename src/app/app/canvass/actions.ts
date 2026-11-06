"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { geojsonRings, pointInPolygon, ringsToGeojson, type LatLng } from "@/lib/geo";
import { KNOCK_STATUSES, mapImportedStatus } from "./statuses";

type Result = { ok?: string; error?: string; id?: string; jobId?: string };
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const status = z.enum(KNOCK_STATUSES);
const text = (n: number) => z.string().trim().max(n).optional().transform((s) => (s ? s : null));

async function territoryFor(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, points: LatLng[]) {
  const { data } = await supabase.from("territories").select("id, kind, geojson, created_at").eq("org_id", orgId).order("kind", { ascending: false }).order("created_at", { ascending: false });
  const terrs = (data ?? []).map((t) => ({ id: t.id as string, rings: geojsonRings(t.geojson) }));
  return points.map((p) => terrs.find((t) => t.rings.some((r) => pointInPolygon(p, r)))?.id ?? null);
}

const KnockIn = z.object({ lat, lng, status, notes: text(2000), address: text(300) });

export async function createKnock(input: unknown): Promise<Result> {
  const { supabase, org, user } = await requireOrg();
  const p = KnockIn.safeParse(input);
  if (!p.success) return { error: "Couldn't read the location. Try again." };
  const [territory_id] = await territoryFor(supabase, org.id, [[p.data.lat, p.data.lng]]);
  const { data, error } = await supabase
    .from("door_knocks")
    .insert({ org_id: org.id, lat: p.data.lat, lng: p.data.lng, status: p.data.status, notes: p.data.notes, address: p.data.address, setter_id: user.id, territory_id })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  revalidatePath("/app/canvass");
  return { ok: "Knock saved.", id: data.id };
}

const KnockUpd = z.object({ id: z.string().uuid(), status, notes: text(2000), address: text(300) });
export async function updateKnock(input: unknown): Promise<Result> {
  const { supabase } = await requireOrg();
  const p = KnockUpd.safeParse(input);
  if (!p.success) return { error: "Check the fields." };
  const { error } = await supabase.from("door_knocks").update({ status: p.data.status, notes: p.data.notes, address: p.data.address }).eq("id", p.data.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/canvass");
  return { ok: "Updated." };
}

export async function deleteKnock(id: string): Promise<Result> {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("door_knocks").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/canvass");
  return { ok: "Deleted." };
}

const Convert = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Homeowner name is required").max(200),
  phone: text(50), email: z.string().trim().email("That email doesn't look right").max(200).optional().or(z.literal("")).transform((s) => s || null),
  address: text(300), city: text(100), state: text(2), zip: text(20), notes: text(2000),
});

/** Door knock -> customer + lead job (normal inserts), attributed to the setter. */
export async function convertKnock(input: unknown): Promise<Result> {
  const { supabase, org, user, role, memberships } = await requireOrg();
  const p = Convert.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the fields." };
  const d = p.data;
  if (!d.phone && !d.email) return { error: "Add a phone number or email so someone can follow up." };
  const { data: knock } = await supabase.from("door_knocks").select("id, status, lat, lng, customer_id, notes").eq("id", d.id).maybeSingle();
  if (!knock) return { error: "Knock not found." };
  if (knock.customer_id) return { error: "This door is already a customer." };

  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .insert({ org_id: org.id, name: d.name, phone: d.phone, email: d.email, address: d.address, city: d.city, state: d.state?.toUpperCase() ?? null, zip: d.zip, source: "door_knock", notes: d.notes ?? knock.notes, created_by: user.id })
    .select("id")
    .single();
  if (cErr) return { error: friendly(cErr) };
  const booked = knock.status === "inspection_booked";
  const now = new Date().toISOString();
  const me = memberships.find((m) => m.org_id === org.id);
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      org_id: org.id, customer_id: cust.id, title: booked ? "Inspection (door knock)" : "Door knock lead",
      site_address: [d.address, d.city, d.state?.toUpperCase(), d.zip].filter(Boolean).join(", ") || null, state: d.state?.toUpperCase() ?? null, zip: d.zip,
      lat: knock.lat, lng: knock.lng, stage: booked ? "inspection" : "lead", lead_source: "door_knock", setter_id: user.id,
      assigned_to: role === "sales_rep" ? user.id : null, lead_received_at: now, first_contacted_at: now, created_by: user.id,
      notes: d.notes ?? knock.notes,
    })
    .select("id")
    .single();
  if (jErr) return { error: friendly(jErr) };
  await supabase.from("door_knocks").update({ customer_id: cust.id, status: "customer", address: d.address ?? undefined }).eq("id", d.id);
  await supabase.from("notifications").insert({ org_id: org.id, kind: "new_lead", title: `Door knock lead: ${d.name}`, body: `Set by ${me?.full_name || user.email}`, url: `/app/jobs/${job.id}` });
  revalidatePath("/app", "layout");
  return { ok: "Lead created.", jobId: job.id };
}

const Territory = z.object({
  name: z.string().trim().min(1, "Name the territory").max(80),
  kind: z.enum(["territory", "hail_swath"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  assigned_to: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null),
  storm_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((s) => s || null),
  rings: z.array(z.array(z.tuple([lat, lng])).min(3).max(5000)).min(1).max(200).optional(),
  geojson: z.unknown().optional(),
});

export async function createTerritory(input: unknown): Promise<Result> {
  const { supabase, org } = await requireOrg();
  const p = Territory.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the territory." };
  const rings = p.data.rings ?? geojsonRings(p.data.geojson);
  if (!rings.length) return { error: "That file has no polygons in it. Hail swath files must be GeoJSON polygons." };
  if (rings.length > 200 || rings.some((r) => r.length > 5000)) return { error: "That shape is too detailed. Simplify it first (max 200 polygons)." };
  if (p.data.assigned_to) {
    const { data: m } = await supabase.from("memberships").select("user_id").eq("org_id", org.id).eq("user_id", p.data.assigned_to).maybeSingle();
    if (!m) return { error: "Pick someone on your team." };
  }
  const color = p.data.color ?? (p.data.kind === "hail_swath" ? "#7c3aed" : "#ea580c");
  const { error } = await supabase.from("territories").insert({
    org_id: org.id, name: p.data.name, kind: p.data.kind, color, assigned_to: p.data.assigned_to, storm_date: p.data.kind === "hail_swath" ? p.data.storm_date : null,
    geojson: ringsToGeojson(rings),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/app/canvass");
  return { ok: `${p.data.kind === "hail_swath" ? "Hail swath" : "Territory"} saved.` };
}

export async function deleteTerritory(id: string): Promise<Result> {
  const { supabase } = await requireOrg();
  const { error } = await supabase.from("territories").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/app/canvass");
  return { ok: "Deleted." };
}

const ImportRows = z.array(z.object({ lat, lng, status: z.string().max(100).optional(), notes: z.string().max(2000).optional(), address: z.string().max(300).optional() })).min(1).max(5000);

/** SPOTIO / SalesRabbit CSV import (already column-mapped in the browser). */
export async function importKnocks(rows: unknown): Promise<Result> {
  const { supabase, org, user } = await requireOrg();
  const p = ImportRows.safeParse(rows);
  if (!p.success) return { error: "Some rows are missing a valid latitude/longitude. Fix the mapping and try again." };
  const terr = await territoryFor(supabase, org.id, p.data.map((r) => [r.lat, r.lng] as LatLng));
  const recs = p.data.map((r, i) => ({
    org_id: org.id, lat: r.lat, lng: r.lng, status: mapImportedStatus(r.status), notes: r.notes?.trim() || null, address: r.address?.trim() || null, setter_id: user.id, territory_id: terr[i],
  }));
  for (let i = 0; i < recs.length; i += 500) {
    const { error } = await supabase.from("door_knocks").insert(recs.slice(i, i + 500));
    if (error) return { error: `Imported ${i} of ${recs.length}: ${friendly(error)}` };
  }
  revalidatePath("/app/canvass");
  return { ok: `Imported ${recs.length} door${recs.length === 1 ? "" : "s"}.` };
}
