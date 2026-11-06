import { siteUrl } from "@/lib/format";
import { recordInboundMessage } from "@/lib/field-messages";
import { verifyTwilioSignature } from "@/lib/twilio";

/** Twilio inbound SMS webhook (form POST). Verifies X-Twilio-Signature when TWILIO_AUTH_TOKEN is set. */
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = (status = 200) => new Response(TWIML, { status, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return twiml(400);
  const params: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") params[k] = v;

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    // Twilio signs the exact public URL it called; behind a proxy set TWILIO_WEBHOOK_URL.
    const url = process.env.TWILIO_WEBHOOK_URL ?? `${siteUrl()}/api/sms/inbound`;
    if (!verifyTwilioSignature(token, url, params, req.headers.get("x-twilio-signature"))) return new Response("Invalid signature", { status: 403 });
  }
  if (params.From && params.Body) {
    try { await recordInboundMessage(params.From, params.Body); } catch (e) { console.error("inbound sms failed", e); }
  }
  return twiml();
}
