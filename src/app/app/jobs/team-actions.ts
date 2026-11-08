"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireOrg } from "@/lib/dal";
import { friendly } from "@/lib/form";
import { notifyUser, sendEmail } from "@/lib/notify";
import { isRealEmail } from "@/lib/pay-plan-notify";
import { JOB_ROLE_LABEL, JOB_ROLES, type JobRole } from "@/lib/job-team";

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ridgeandbeam.com").replace(/\/$/, "");

/** Put staff on a job. Form: job_id, user_id (repeated), role_<user_id>, notify=on. */
export async function addJobMembers(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, org, user, isCrewLead, memberships } = await requireOrg();
  if (isCrewLead) return { error: "Ask the office to change the team on this job." };
  const jobId = String(fd.get("job_id"));
  const ids = [...new Set(fd.getAll("user_id").map(String))].filter(Boolean);
  if (!ids.length) return { error: "Tick at least one person." };
  const rows = ids.map((id) => {
    const r = String(fd.get(`role_${id}`) ?? "crew");
    return { org_id: org.id, job_id: jobId, user_id: id, role: ((JOB_ROLES as readonly string[]).includes(r) ? r : "crew") as JobRole, added_by: user.id };
  });
  const { error } = await supabase.from("job_members").upsert(rows, { onConflict: "job_id,user_id" });
  if (error) return { error: friendly(error) };

  if (fd.get("notify") === "on") {
    const [{ data: job }, { data: people }] = await Promise.all([
      supabase.from("jobs").select("title, site_address, scheduled_start, customers(name)").eq("id", jobId).single(),
      supabase.from("memberships").select("user_id, full_name, email").eq("org_id", org.id).in("user_id", ids),
    ]);
    const me = memberships.find((m) => m.org_id === org.id)?.full_name || user.fullName || "The office";
    const who = (job?.customers as unknown as { name: string } | null)?.name ?? job?.title ?? "a job";
    const url = `/app/jobs/${jobId}`;
    for (const p of people ?? []) {
      if (p.user_id === user.id) continue;
      const role = JOB_ROLE_LABEL[rows.find((r) => r.user_id === p.user_id)?.role ?? "crew"];
      const title = `You're on the ${who} job (${role.toLowerCase()})`;
      const body = [job?.site_address, job?.scheduled_start ? `starts ${new Date(`${job.scheduled_start}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ");
      await notifyUser(supabase, { orgId: org.id, userId: p.user_id, kind: "job_team", title, body, url });
      if (isRealEmail(p.email)) {
        await sendEmail(supabase, {
          orgId: org.id, jobId, to: p.email, subject: `${title} · ${org.name}`,
          html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#13221a"><p>Hi ${(p.full_name ?? "").split(" ")[0] || "there"},</p><p>${me} put you on the <b>${who}</b> job as ${role.toLowerCase()}.${body ? `<br>${body}` : ""}</p><p><a href="${site()}${url}">Open the job</a></p></div>`,
          text: `${me} put you on the ${who} job as ${role.toLowerCase()}. ${body} ${site()}${url}`,
        });
      }
    }
  }
  revalidatePath("/app/jobs", "layout");
  return { ok: `Added ${ids.length} ${ids.length === 1 ? "person" : "people"}.` };
}

export async function removeJobMember(fd: FormData) {
  const { supabase, isCrewLead } = await requireOrg();
  if (isCrewLead) return;
  const { error } = await supabase.from("job_members").delete().eq("job_id", String(fd.get("job_id"))).eq("user_id", String(fd.get("user_id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/jobs", "layout");
}

export async function setJobMemberRole(fd: FormData) {
  const { supabase, isCrewLead } = await requireOrg();
  if (isCrewLead) return;
  const role = String(fd.get("role"));
  if (!(JOB_ROLES as readonly string[]).includes(role)) return;
  const { error } = await supabase.from("job_members").update({ role }).eq("job_id", String(fd.get("job_id"))).eq("user_id", String(fd.get("user_id")));
  if (error) throw new Error(friendly(error));
  revalidatePath("/app/jobs", "layout");
}
