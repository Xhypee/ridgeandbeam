import { after, type NextRequest } from "next/server";
import { anonClient } from "@/lib/public";
import { afterLeadCreated, normalizeLead, rateLimited } from "@/lib/leads";

/**
 * Public lead intake: website forms (form-encoded or JSON), Zapier / Angi / Facebook lead-ad webhooks.
 * POST /api/leads/<intake key>   — CORS-enabled, honeypot field "_gotcha", rate limited per IP.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/leads/[intakeKey]">) {
  const { intakeKey } = await ctx.params;
  const type = req.headers.get("content-type") ?? "";
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html") && !type.includes("application/json");
  const back = (q: string) => Response.redirect(new URL(`/l/${encodeURIComponent(intakeKey)}?${q}`, req.nextUrl.origin), 303);

  let raw: Record<string, unknown> = {};
  try {
    if (type.includes("application/json")) {
      const body = await req.json();
      raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    } else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
    }
  } catch {
    return json({ error: "Send the lead as JSON or a form post." }, 400);
  }

  // Honeypot: real people never see this field. Pretend success so bots move on.
  if (typeof raw._gotcha === "string" && raw._gotcha.trim() !== "") return wantsHtml ? back("sent=1") : json({ ok: true });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  if (rateLimited(`${ip}:${intakeKey}`)) {
    return wantsHtml ? back("error=" + encodeURIComponent("Too many requests. Please call us instead.")) : json({ error: "Too many requests, slow down." }, 429);
  }

  const lead = normalizeLead(raw);
  if (!lead.name) return wantsHtml ? back("error=" + encodeURIComponent("Please enter your name.")) : json({ error: "name is required" }, 422);
  if (!lead.phone && !lead.email) return wantsHtml ? back("error=" + encodeURIComponent("Please enter a phone number or email.")) : json({ error: "phone or email is required" }, 422);

  const { data, error } = await anonClient().rpc("submit_public_lead", { p_key: intakeKey, p_lead: lead });
  if (error) {
    const unknown = /unknown intake key/.test(error.message);
    const msg = unknown ? "This form isn't active." : error.message;
    return wantsHtml ? back("error=" + encodeURIComponent(msg)) : json({ error: msg }, unknown ? 404 : 422);
  }
  const jobId = (data as { job_id: string }).job_id;
  after(() => afterLeadCreated(jobId).catch((e) => console.error("lead follow-up failed", e)));
  return wantsHtml ? back("sent=1") : json({ ok: true, id: jobId }, 201);
}
