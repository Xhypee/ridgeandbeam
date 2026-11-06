import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireOrg } from "@/lib/dal";
import { AiError, aiEnabled, asImageBlock, draftText, PHOTO_TASK } from "@/lib/ai";
import { CATEGORY_LABEL, COUNT_CATEGORY, DAMAGE_CATEGORIES } from "@/lib/field";

const Body = z.object({ jobId: z.string().uuid() });
const MAX_PHOTOS = 8;

/** POST { jobId } -> { text }: plain-language photo summary for the homeowner (draft for the rep). */
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "AI not configured" }, { status: 501 });
  const { supabase, org } = await requireOrg();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "jobId is required" }, { status: 400 });

  const { data: job } = await supabase.from("jobs").select("id, title, site_address").eq("id", parsed.data.jobId).maybeSingle();
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  // Shared photos first, then inspection categories. RLS scopes this to the user's company.
  const { data: files } = await supabase
    .from("job_files")
    .select("id, storage_path, mime_type, caption, category, slope, test_square_hits, shared_with_homeowner, taken_at, created_at")
    .eq("job_id", job.id)
    .eq("kind", "photo")
    .or(`shared_with_homeowner.eq.true,category.in.(overview,decking,${DAMAGE_CATEGORIES.join(",")})`)
    .order("shared_with_homeowner", { ascending: false })
    .order("created_at")
    .limit(MAX_PHOTOS);
  if (!files?.length) return Response.json({ error: "No shared or inspection photos on this job yet." }, { status: 422 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let n = 0;
  for (const f of files) {
    if (!String(f.storage_path).startsWith(`${org.id}/${job.id}/`)) continue;
    const { data: blob } = await supabase.storage.from("job-files").download(f.storage_path);
    const img = blob ? asImageBlock(Buffer.from(await blob.arrayBuffer()), f.mime_type ?? blob.type) : null;
    const meta = [f.category && `category: ${CATEGORY_LABEL[f.category] ?? f.category}`, f.slope && `slope: ${f.slope}`, f.category === COUNT_CATEGORY && f.test_square_hits != null && `broken tiles counted on this slope: ${f.test_square_hits}`, f.caption && `caption: "${f.caption}"`].filter(Boolean).join(", ");
    n++;
    content.push({ type: "text", text: `Photo ${n}${meta ? ` (${meta})` : ""}${img ? "" : " — image unavailable, use the caption only"}` });
    if (img) content.push(img);
  }
  if (!n) return Response.json({ error: "No readable photos on this job." }, { status: 422 });
  content.push({ type: "text", text: `Job: ${job.title}${job.site_address ? ` at ${job.site_address}` : ""}. Write the summary now.` });

  try {
    return Response.json({ text: await draftText({ task: PHOTO_TASK, content }) });
  } catch (e) {
    return Response.json({ error: e instanceof AiError ? e.message : "AI request failed" }, { status: 502 });
  }
}
