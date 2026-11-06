import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobReadiness, type Readiness, type ReadinessJob } from "@/lib/production";
import { readinessContexts } from "@/lib/production-data";

const READINESS_COLS = "id, permit_status, hoa_status, colors_confirmed, shingle_color, materials_status, dumpster_status, scheduled_start";

/** Server-side readiness for one job (used to gate "Lock schedule"). */
export async function loadReadiness(supabase: SupabaseClient, jobId: string, override?: Partial<ReadinessJob>): Promise<Readiness | null> {
  const { data: job } = await supabase.from("jobs").select(READINESS_COLS).eq("id", jobId).maybeSingle();
  if (!job) return null;
  const ctx = (await readinessContexts(supabase, [jobId])).get(jobId)!;
  return jobReadiness({ ...(job as ReadinessJob), ...override }, ctx);
}

/** Who can see a job's production info: crew leads only see their own crew's jobs. */
export function crewLeadCanSee(ctx: { isCrewLead: boolean; crewId: string | null }, job: { crew_id: string | null }) {
  return !ctx.isCrewLead || (ctx.crewId !== null && job.crew_id === ctx.crewId);
}
