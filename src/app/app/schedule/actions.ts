"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { date } from "@/lib/format";
import { notifyUser, sendSms } from "@/lib/notify";
import { addDaysIso, planRainDay, type Shift } from "@/lib/production";

const Input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  crewId: z.union([z.literal("all"), z.uuid()]),
  days: z.coerce.number().int().min(1).max(10),
  notifyHomeowners: z.boolean().default(true),
  notifyCrews: z.boolean().default(true),
});
export type RainDayInput = z.input<typeof Input>;

export type RainDayPreviewRow = Shift & { title: string; customer: string; crew: string | null; locked: boolean };

type JobRow = {
  id: string; title: string; crew_id: string | null; scheduled_start: string | null; scheduled_end: string | null; schedule_locked: boolean;
  notify_homeowner: boolean; assigned_to: string | null; sales_rep_id: string | null; site_address: string | null;
  customers: { id: string; name: string; phone: string | null } | null; crews: { id: string; name: string; phone: string | null } | null;
};

async function plan(input: RainDayInput) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." } as const;
  const ctx = await requireOrg();
  if (ctx.isCrewLead) return { error: "Ask the office to reschedule." } as const;
  const p = parsed.data;
  const windowEnd = addDaysIso(p.date, 13);
  let q = ctx.supabase
    .from("jobs")
    .select("id, title, crew_id, scheduled_start, scheduled_end, schedule_locked, notify_homeowner, assigned_to, sales_rep_id, site_address, customers(id, name, phone), crews(id, name, phone)")
    .eq("org_id", ctx.org.id)
    .not("scheduled_start", "is", null)
    .lte("scheduled_start", windowEnd)
    .gte("scheduled_end", p.date)
    .not("stage", "in", "(completed,paid,lost)");
  if (p.crewId !== "all") q = q.eq("crew_id", p.crewId);
  const { data, error } = await q;
  if (error) return { error: error.message } as const;
  const jobs = (data ?? []) as unknown as JobRow[];
  const shifts = planRainDay(jobs, { date: p.date, crewId: p.crewId, days: p.days, windowDays: 14 });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const rows: RainDayPreviewRow[] = shifts.map((s) => {
    const j = byId.get(s.id)!;
    return { ...s, title: j.title, customer: j.customers?.name ?? "", crew: j.crews?.name ?? null, locked: j.schedule_locked };
  });
  return { ctx, p, rows, byId } as const;
}

export async function previewRainDay(input: RainDayInput): Promise<{ error?: string; rows?: RainDayPreviewRow[] }> {
  const r = await plan(input);
  if ("error" in r) return { error: r.error };
  return { rows: r.rows };
}

/** Shift, unlock and notify. Recomputes the plan server-side (the client preview is not trusted). */
export async function applyRainDay(input: RainDayInput): Promise<{ error?: string; ok?: string }> {
  const r = await plan(input);
  if ("error" in r) return { error: r.error };
  const { ctx, p, rows, byId } = r;
  if (rows.length === 0) return { error: "No jobs to move on that day." };
  const { supabase, org } = ctx;
  const fmt = (d: string) => date(d, { weekday: "short", month: "short", day: "numeric" });

  for (const s of rows) {
    const { error } = await supabase.from("jobs").update({ scheduled_start: s.to[0], scheduled_end: s.to[1], schedule_locked: false }).eq("id", s.id);
    if (error) return { error: `Stopped at ${s.title}: ${error.message}` };
  }

  // Crew leads (memberships.crew_id) get an in-app notification for their crew's jobs.
  const { data: leads } = await supabase.from("memberships").select("user_id, crew_id").eq("org_id", org.id).not("crew_id", "is", null);
  let sms = 0;
  const perCrew = new Map<string, { phone: string | null; name: string; lines: string[] }>();
  for (const s of rows) {
    const j = byId.get(s.id)!;
    const when = s.to[0] === s.to[1] ? fmt(s.to[0]) : `${fmt(s.to[0])} – ${fmt(s.to[1])}`;
    if (p.notifyHomeowners && j.notify_homeowner && j.customers?.phone) {
      await sendSms(supabase, {
        orgId: org.id, jobId: j.id, customerId: j.customers.id, to: j.customers.phone,
        body: `${org.name}: weather is pushing your roof project. New schedule: ${when}. We'll confirm the day before. Questions? ${org.phone ?? "Reply here"}.`,
      });
      sms++;
    }
    if (j.crews) {
      const c = perCrew.get(j.crews.id) ?? { phone: j.crews.phone, name: j.crews.name, lines: [] };
      c.lines.push(`${j.site_address ?? j.title}: ${when}`);
      perCrew.set(j.crews.id, c);
    }
    const users = new Set<string>([j.assigned_to, j.sales_rep_id, ...(leads ?? []).filter((l) => l.crew_id === j.crew_id).map((l) => l.user_id)].filter(Boolean) as string[]);
    for (const u of users) {
      await notifyUser(supabase, { orgId: org.id, userId: u, kind: "rain_day", title: `Rescheduled: ${j.title}`, body: `Rain day ${fmt(p.date)} — now ${when}. Schedule is tentative until re-locked.`, url: `/app/jobs/${j.id}/production` });
    }
  }
  if (p.notifyCrews) {
    for (const c of perCrew.values()) {
      if (!c.phone) continue;
      await sendSms(supabase, { orgId: org.id, to: c.phone, body: `${org.name} — rain day ${fmt(p.date)}. New schedule for ${c.name}:\n${c.lines.join("\n")}` });
      sms++;
    }
  }
  revalidatePath("/app/schedule");
  revalidatePath("/app", "layout");
  return { ok: `Moved ${rows.length} job${rows.length === 1 ? "" : "s"} by ${p.days} working day${p.days === 1 ? "" : "s"} and unlocked them. ${sms} text${sms === 1 ? "" : "s"} queued.` };
}
