import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * X-Twilio-Signature: base64(HMAC-SHA1(authToken, fullUrl + concat(sorted POST params as key+value))).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, header: string | null) {
  if (!header) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
