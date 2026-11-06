import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { twilioSignature, verifyTwilioSignature } from "./twilio";

describe("twilio signature", () => {
  const token = "12345";
  const url = "https://example.com/api/sms/inbound";
  const params = { To: "+18005551212", From: "+12349013030", Body: "Is the crew coming tomorrow?", MessageSid: "SM123" };
  // url + params sorted by key, each key immediately followed by its value
  const manual = createHmac("sha1", token)
    .update(url + "BodyIs the crew coming tomorrow?" + "From+12349013030" + "MessageSidSM123" + "To+18005551212")
    .digest("base64");

  it("signs url + sorted key/value pairs with HMAC-SHA1", () => {
    expect(twilioSignature(token, url, params)).toBe(manual);
  });
  it("verifies and rejects", () => {
    expect(verifyTwilioSignature(token, url, params, manual)).toBe(true);
    expect(verifyTwilioSignature(token, url, { ...params, Body: "changed" }, manual)).toBe(false);
    expect(verifyTwilioSignature("other", url, params, manual)).toBe(false);
    expect(verifyTwilioSignature(token, url, params, null)).toBe(false);
  });
});
