import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { AiError, aiEnabled, draftText, PROPOSAL_TASK } from "@/lib/ai";

const Body = z.object({ estimateId: z.string().uuid() });

/** POST { estimateId } -> { text }: homeowner-friendly scope notes (draft for the rep). */
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "AI not configured" }, { status: 501 });
  const { supabase, canSeeMoney } = await requireOrg();
  if (!canSeeMoney) return Response.json({ error: "Not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "estimateId is required" }, { status: 400 });

  const { data: est } = await supabase
    .from("estimates")
    .select("id, number, measurements, measurement_source, jobs(title, job_type, roof_material, is_insurance, site_address), estimate_items(description, quantity, unit, option_id, position), estimate_options(id, name, tier, description, warranty, position)")
    .eq("id", parsed.data.estimateId)
    .maybeSingle();
  if (!est) return Response.json({ error: "Estimate not found" }, { status: 404 });

  const job = est.jobs as unknown as { title: string; job_type: string; roof_material: string | null; is_insurance: boolean; site_address: string | null } | null;
  const options = ((est.estimate_options ?? []) as { id: string; name: string; tier: string | null; description: string | null; warranty: string | null; position: number }[]).sort((a, b) => a.position - b.position);
  const items = ((est.estimate_items ?? []) as { description: string; quantity: number; unit: string; option_id: string | null; position: number }[]).sort((a, b) => a.position - b.position);
  const m = (est.measurements ?? {}) as { sections?: { label: string; area: number; pitch: number }[]; layers?: number };
  const line = (i: (typeof items)[number]) => `- ${i.description} (${Number(i.quantity)} ${i.unit})`;

  // No prices are sent: the notes describe the work, the estimate shows the money.
  const facts = [
    `Job: ${job?.title ?? "Roof work"} (${job?.job_type ?? "replacement"})${job?.roof_material ? `, material: ${job.roof_material}` : ""}${job?.is_insurance ? ", insurance claim job" : ""}`,
    m.sections?.length ? `Roof sections: ${m.sections.map((s) => `${s.label} ${Math.round(s.area)} sq ft plan at ${s.pitch}/12`).join("; ")}${est.measurement_source ? ` (measured by ${est.measurement_source})` : ""}` : null,
    m.layers ? `Existing layers to remove: ${m.layers}` : null,
    "Included in every option:",
    ...items.filter((i) => !i.option_id).map(line),
    ...options.flatMap((o) => [`Option "${o.name}"${o.tier ? ` (${o.tier})` : ""}${o.warranty ? `, warranty: ${o.warranty}` : ""}${o.description ? ` — ${o.description}` : ""}:`, ...items.filter((i) => i.option_id === o.id).map(line)]),
  ].filter(Boolean).join("\n");

  try {
    return Response.json({ text: await draftText({ task: PROPOSAL_TASK, content: facts }) });
  } catch (e) {
    return Response.json({ error: e instanceof AiError ? e.message : "AI request failed" }, { status: 502 });
  }
}
